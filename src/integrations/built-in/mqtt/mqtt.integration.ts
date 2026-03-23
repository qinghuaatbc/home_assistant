import { Injectable, Logger } from '@nestjs/common';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../../core/service-registry/service-registry.service';
import { EntityRegistryService } from '../../../registry/entity-registry/entity-registry.service';
import { ContextService } from '../../../core/context/context.service';
import {
  HaIntegration,
  IntegrationConfig,
  IntegrationManifest,
} from '../../interfaces/integration.interface';
import { ServiceCall } from '../../../core/service-registry/interfaces/ha-service.interface';
import { MqttClientService, MqttMessage } from './mqtt-client.service';
import {
  DOMAIN_MQTT,
  DEFAULT_BROKER_PORT,
  PAYLOAD_ON,
  PAYLOAD_OFF,
  PAYLOAD_TOGGLE,
  MqttEntityType,
  MqttQoS,
} from './mqtt.constants';
import {
  STATE_ON,
  STATE_OFF,
  STATE_UNAVAILABLE,
  SERVICE_TURN_ON,
  SERVICE_TURN_OFF,
  SERVICE_TOGGLE,
} from '../../../common/constants/domains.constants';

/** One entity entry in configuration.yaml */
export interface MqttEntityConfig {
  /** Subscribe topic — state is read from here */
  topic: string;
  /** Friendly name */
  name: string;
  /** light | switch | sensor | binary_sensor  (default: switch) */
  type?: MqttEntityType;
  /** Optional separate command topic (default: same as topic) */
  command_topic?: string;
  /** Payload that means ON  (default: "ON") */
  payload_on?: string;
  /** Payload that means OFF (default: "OFF") */
  payload_off?: string;
  /** Payload that triggers a toggle on the broker side (default: "TOGGLE") */
  payload_toggle?: string;
  /** QoS for subscribe / publish (default: 0) */
  qos?: MqttQoS;
  /** Retain flag for published messages (default: false) */
  retain?: boolean;
  /** Unit of measurement for sensor entities */
  unit_of_measurement?: string;
  /** Device class (temperature, humidity, motion, etc.) */
  device_class?: string;
}

interface MqttConfig extends IntegrationConfig {
  /** MQTT broker hostname or IP */
  broker: string;
  port?: number;
  username?: string;
  password?: string;
  client_id?: string;
  /** Entities to register */
  entities: MqttEntityConfig[];
}

/** topic → entity metadata */
interface EntityMeta {
  entityId: string;
  type: MqttEntityType;
  name: string;
  commandTopic: string;
  payloadOn: string;
  payloadOff: string;
  payloadToggle: string;
  qos: MqttQoS;
  retain: boolean;
  unitOfMeasurement?: string;
  deviceClass?: string;
}

@Injectable()
export class MqttIntegration implements HaIntegration {
  private readonly logger = new Logger(MqttIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_MQTT,
    name: 'MQTT',
    version: '1.0.0',
    iot_class: 'local_push',
    requirements: ['mqtt'],
  };

  private config: MqttConfig | null = null;

  /** state topic → entity metadata */
  private readonly topicMap = new Map<string, EntityMeta>();

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
    private readonly client: MqttClientService,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async setup(config: IntegrationConfig): Promise<boolean> {
    const cfg = config as MqttConfig;

    if (!cfg.broker) {
      this.logger.error('MQTT: broker is required');
      return false;
    }
    if (!cfg.entities?.length) {
      this.logger.error('MQTT: at least one entity must be configured');
      return false;
    }

    this.config = { ...cfg, port: cfg.port ?? DEFAULT_BROKER_PORT };

    // Register entities (start as unavailable)
    this.registerEntities();

    // Connect to broker
    const ok = await this.client.connect(
      cfg.broker,
      this.config.port,
      cfg.username,
      cfg.password,
      cfg.client_id,
    );

    if (!ok) {
      this.logger.error(`MQTT: cannot connect to ${cfg.broker}:${this.config.port}`);
      // Entities stay unavailable; mqtt client will auto-reconnect
    } else {
      this.subscribeAll();
    }

    // Wire handlers
    this.client.on('connected', () => this.subscribeAll());
    this.client.on('disconnected', () => this.markAllUnavailable());
    this.client.on('message', (msg: MqttMessage) => this.handleMessage(msg));

    // Register HA services
    this.registerServices();

    this.logger.log(
      `MQTT setup complete — broker: ${cfg.broker}:${this.config.port}, ` +
      `entities: ${this.topicMap.size}`,
    );
    return true;
  }

  async teardown(): Promise<void> {
    this.client.disconnect();
    this.logger.log('MQTT integration teardown complete');
  }

  // ── Entity registration ──────────────────────────────────────────────────────

  private registerEntities(): void {
    for (const entity of this.config!.entities) {
      const type: MqttEntityType = entity.type ?? 'switch';
      const entityId = this.buildEntityId(type, entity.name);

      this.entityRegistry.registerEntity({
        entity_id: entityId,
        platform: DOMAIN_MQTT,
        name: entity.name,
        original_name: entity.name,
        unique_id: `mqtt_${entity.topic.replace(/\//g, '_')}`,
        device_class: entity.device_class,
      });

      const meta: EntityMeta = {
        entityId,
        type,
        name: entity.name,
        commandTopic: entity.command_topic ?? entity.topic,
        payloadOn: entity.payload_on ?? PAYLOAD_ON,
        payloadOff: entity.payload_off ?? PAYLOAD_OFF,
        payloadToggle: entity.payload_toggle ?? PAYLOAD_TOGGLE,
        qos: entity.qos ?? 0,
        retain: entity.retain ?? false,
        unitOfMeasurement: entity.unit_of_measurement,
        deviceClass: entity.device_class,
      };

      this.topicMap.set(entity.topic, meta);

      this.stateMachine.setState(
        entityId,
        STATE_UNAVAILABLE,
        { friendly_name: entity.name },
        this.contextService.system(),
      );
    }

    this.logger.log(`MQTT: registered ${this.topicMap.size} entity/entities`);
  }

  // ── Subscriptions ────────────────────────────────────────────────────────────

  private subscribeAll(): void {
    for (const [topic, meta] of this.topicMap) {
      this.client.subscribe(topic, meta.qos);
    }
  }

  // ── Inbound messages ─────────────────────────────────────────────────────────

  private handleMessage(msg: MqttMessage): void {
    const meta = this.topicMap.get(msg.topic);
    if (!meta) return;

    const payload = msg.payload.trim();

    if (meta.type === 'sensor') {
      // Numeric / string sensor
      this.stateMachine.setState(
        meta.entityId,
        payload,
        {
          friendly_name: meta.name,
          ...(meta.unitOfMeasurement ? { unit_of_measurement: meta.unitOfMeasurement } : {}),
          ...(meta.deviceClass ? { device_class: meta.deviceClass } : {}),
        },
        this.contextService.system(),
      );
      return;
    }

    // TOGGLE — flip current state locally
    if (payload === meta.payloadToggle) {
      const current = this.stateMachine.getState(meta.entityId);
      const flipped = current?.state === STATE_ON ? STATE_OFF : STATE_ON;
      this.stateMachine.setState(
        meta.entityId,
        flipped,
        { friendly_name: meta.name },
        this.contextService.system(),
      );
      return;
    }

    // ON/OFF entities (light, switch, binary_sensor)
    const isOn =
      payload === meta.payloadOn ||
      payload === '1' ||
      payload.toLowerCase() === 'true';

    const state = isOn ? STATE_ON : STATE_OFF;
    const attrs: Record<string, unknown> = { friendly_name: meta.name };

    if (meta.type === 'light') {
      attrs['supported_features'] = 0;
      attrs['supported_color_modes'] = ['onoff'];
      attrs['color_mode'] = 'onoff';
    }

    this.stateMachine.setState(meta.entityId, state, attrs, this.contextService.system());
  }

  private markAllUnavailable(): void {
    for (const meta of this.topicMap.values()) {
      this.stateMachine.setState(
        meta.entityId,
        STATE_UNAVAILABLE,
        { friendly_name: meta.name },
        this.contextService.system(),
      );
    }
  }

  // ── Services ─────────────────────────────────────────────────────────────────

  private registerServices(): void {
    const domains = new Set(Array.from(this.topicMap.values()).map(m => m.type));

    for (const domain of domains) {
      if (domain === 'sensor' || domain === 'binary_sensor') continue;
      if (this.serviceRegistry.has(domain, SERVICE_TURN_ON)) continue;

      this.serviceRegistry.register({
        domain,
        service: SERVICE_TURN_ON,
        name: 'Turn on',
        description: `Turn on ${domain} via MQTT`,
        fields: {},
        target: { entity: true },
        handler: (call) => this.handleTurnOn(call),
      });

      this.serviceRegistry.register({
        domain,
        service: SERVICE_TURN_OFF,
        name: 'Turn off',
        description: `Turn off ${domain} via MQTT`,
        fields: {},
        target: { entity: true },
        handler: (call) => this.handleTurnOff(call),
      });

      this.serviceRegistry.register({
        domain,
        service: SERVICE_TOGGLE,
        name: 'Toggle',
        description: `Toggle ${domain} via MQTT`,
        fields: {},
        target: { entity: true },
        handler: (call) => this.handleToggle(call),
      });
    }
  }

  private async handleTurnOn(call: ServiceCall): Promise<void> {
    for (const entityId of this.resolveEntityIds(call)) {
      const meta = this.metaByEntityId(entityId);
      if (!meta) continue;
      this.client.publish(meta.commandTopic, meta.payloadOn, meta.qos, meta.retain);
      // Optimistic state update
      this.stateMachine.setState(
        entityId,
        STATE_ON,
        { friendly_name: meta.name },
        this.contextService.system(),
      );
    }
  }

  private async handleTurnOff(call: ServiceCall): Promise<void> {
    for (const entityId of this.resolveEntityIds(call)) {
      const meta = this.metaByEntityId(entityId);
      if (!meta) continue;
      this.client.publish(meta.commandTopic, meta.payloadOff, meta.qos, meta.retain);
      this.stateMachine.setState(
        entityId,
        STATE_OFF,
        { friendly_name: meta.name },
        this.contextService.system(),
      );
    }
  }

  private async handleToggle(call: ServiceCall): Promise<void> {
    for (const entityId of this.resolveEntityIds(call)) {
      const meta = this.metaByEntityId(entityId);
      if (!meta) continue;
      // Publish TOGGLE to broker; flip state locally so the UI updates immediately
      this.client.publish(meta.commandTopic, meta.payloadToggle, meta.qos, meta.retain);
      const current = this.stateMachine.getState(entityId);
      const flipped = current?.state === STATE_ON ? STATE_OFF : STATE_ON;
      this.stateMachine.setState(
        entityId,
        flipped,
        { friendly_name: meta.name },
        this.contextService.system(),
      );
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  private buildEntityId(type: string, name: string): string {
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `${type}.mqtt_${slug}`;
  }

  private metaByEntityId(entityId: string): EntityMeta | undefined {
    for (const meta of this.topicMap.values()) {
      if (meta.entityId === entityId) return meta;
    }
    return undefined;
  }

  private resolveEntityIds(call: ServiceCall): string[] {
    const entityId = call.target?.entity_id;
    if (!entityId) return [];
    return Array.isArray(entityId) ? entityId : [entityId];
  }
}
