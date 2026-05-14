import { Injectable, Logger } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { ServiceRegistryService } from '../../../core/service-registry/service-registry.service';
import { EventBusService } from '../../../core/event-bus/event-bus.service';
import {
  HaIntegration,
  IntegrationConfig,
  IntegrationManifest,
} from '../../interfaces/integration.interface';
import { StateChangedData } from '../../../core/event-bus/events/ha-event.interface';
import { EVENT_STATE_CHANGED } from '../../../common/constants/events.constants';
import { ServiceCall } from '../../../core/service-registry/interfaces/ha-service.interface';
import { ContextService } from '../../../core/context/context.service';
import {
  DOMAIN_RTI,
  RTI_COMMAND_PREFIX,
  RTI_STATE_PREFIX,
  RTI_SERVICE_TOPIC,
  DEFAULT_BROKER_PORT,
  DEFAULT_QOS,
} from './rti.constants';

interface RtiConfig extends IntegrationConfig {
  broker: string;
  port?: number;
  username?: string;
  password?: string;
  /** Topic prefix for inbound commands (default: "rti/command") */
  command_prefix?: string;
  /** Topic prefix for outbound state (default: "rti/state") */
  state_prefix?: string;
  /** Domains to publish state feedback for. Empty = all domains. */
  state_domains?: string[];
  /** Retain flag on state topics (default: true so RTI gets last value on reconnect) */
  retain?: boolean;
}

/**
 * RTI ↔ HA MQTT Bridge
 *
 * ## Topic convention
 *
 * ### RTI → HA  (commands)
 * `<command_prefix>/<domain>/<entity_name>`
 * Payload (JSON):
 *   { "state": "ON" | "OFF" | "TOGGLE", "brightness": 0-255, "volume": 0-100, ... }
 * Or plain string: "ON" | "OFF" | "TOGGLE"
 *
 * Direct service call (any domain):
 * `<command_prefix>/service`
 * Payload: { "service": "light.turn_on", "entity_id": "light.living_room", "data": {...} }
 *
 * ### HA → RTI  (state feedback)
 * `<state_prefix>/<domain>/<entity_name>`
 * Payload (JSON, retained):
 *   { "state": "on", "entity_id": "light.living_room", "brightness": 200, ... }
 *
 * ## RTI Integration Designer setup
 * 1. Add MQTT driver, point to same broker
 * 2. Subscribe to  `rti/state/#`  for state feedback
 * 3. Publish to    `rti/command/<domain>/<name>`  for commands
 */
@Injectable()
export class RtiIntegration implements HaIntegration {
  private readonly logger = new Logger(RtiIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_RTI,
    name: 'RTI MQTT Bridge',
    version: '1.0.0',
    iot_class: 'local_push',
  };

  private client: mqtt.MqttClient | null = null;
  private config: RtiConfig | null = null;
  private commandPrefix = RTI_COMMAND_PREFIX;
  private statePrefix = RTI_STATE_PREFIX;
  private stateDomains: Set<string> = new Set();
  private retain = true;
  private unsubscribeStateChanged: (() => void) | null = null;

  constructor(
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly eventBus: EventBusService,
    private readonly contextService: ContextService,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async setup(config: IntegrationConfig): Promise<boolean> {
    const cfg = config as RtiConfig;
    if (!cfg.broker) {
      this.logger.error('RTI: broker is required');
      return false;
    }

    this.config = cfg;
    this.commandPrefix = cfg.command_prefix ?? RTI_COMMAND_PREFIX;
    this.statePrefix = cfg.state_prefix ?? RTI_STATE_PREFIX;
    this.stateDomains = new Set(cfg.state_domains ?? []);
    this.retain = cfg.retain ?? true;

    const connected = await this.connectBroker();
    if (!connected) {
      this.logger.error(`RTI: cannot connect to ${cfg.broker}:${cfg.port ?? DEFAULT_BROKER_PORT}`);
      // Continue: client will auto-reconnect
    }

    // Bridge HA state changes → MQTT
    this.unsubscribeStateChanged = this.eventBus.listen<StateChangedData>(
      EVENT_STATE_CHANGED,
      (event) => this.publishStateToRti(event.data),
    );

    this.logger.log(
      `RTI MQTT bridge ready — broker: ${cfg.broker}, ` +
      `commands: ${this.commandPrefix}/#, state: ${this.statePrefix}/#`,
    );
    return true;
  }

  async teardown(): Promise<void> {
    this.unsubscribeStateChanged?.();
    this.client?.end(true);
    this.client = null;
    this.logger.log('RTI integration teardown');
  }

  // ── MQTT connection ──────────────────────────────────────────────────────────

  private connectBroker(): Promise<boolean> {
    const cfg = this.config!;
    const port = cfg.port ?? DEFAULT_BROKER_PORT;
    const url = `mqtt://${cfg.broker}:${port}`;

    return new Promise((resolve) => {
      const options: mqtt.IClientOptions = {
        clientId: `ha_rti_${Math.random().toString(16).slice(2, 10)}`,
        reconnectPeriod: 5000,
        connectTimeout: 8000,
        clean: true,
        ...(cfg.username ? { username: cfg.username } : {}),
        ...(cfg.password ? { password: cfg.password } : {}),
      };

      this.client = mqtt.connect(url, options);
      let resolved = false;
      const resolveOnce = (ok: boolean) => { if (!resolved) { resolved = true; resolve(ok); } };

      this.client.on('connect', () => {
        this.logger.log(`RTI: connected to ${url}`);
        this.subscribeCommands();
        resolveOnce(true);
      });

      this.client.on('reconnect', () => {
        this.logger.log('RTI: reconnecting...');
        this.subscribeCommands();
      });

      this.client.on('error', (err) => {
        this.logger.warn(`RTI MQTT error: ${err.message}`);
        resolveOnce(false);
      });

      this.client.on('message', (topic, payload) => {
        this.handleCommand(topic, payload.toString()).catch((err: Error) =>
          this.logger.error(`RTI command error on ${topic}: ${err.message}`),
        );
      });
    });
  }

  private subscribeCommands(): void {
    if (!this.client) return;
    // Subscribe to all RTI command topics
    this.client.subscribe(`${this.commandPrefix}/#`, { qos: DEFAULT_QOS }, (err) => {
      if (err) this.logger.error(`RTI subscribe error: ${err.message}`);
      else this.logger.log(`RTI subscribed to ${this.commandPrefix}/#`);
    });
  }

  // ── Inbound: RTI → HA ────────────────────────────────────────────────────────

  private async handleCommand(topic: string, rawPayload: string): Promise<void> {
    // Direct service call: rti/command/service
    if (topic === RTI_SERVICE_TOPIC || topic === `${this.commandPrefix}/service`) {
      await this.handleServiceCall(rawPayload);
      return;
    }

    // Entity command: rti/command/<domain>/<entity_name>
    const relative = topic.slice(this.commandPrefix.length + 1); // e.g. "light/living_room"
    const slashIdx = relative.indexOf('/');
    if (slashIdx < 0) return;

    const domain = relative.slice(0, slashIdx);
    const name = relative.slice(slashIdx + 1).replace(/\//g, '_');
    const entityId = `${domain}.${name}`;

    // Parse payload — accept plain string ("ON"/"OFF"/"TOGGLE") or JSON
    let cmd: Record<string, unknown> = {};
    try {
      cmd = JSON.parse(rawPayload);
    } catch {
      cmd = { state: rawPayload.trim().toUpperCase() };
    }

    const stateCmd = (cmd.state as string | undefined)?.toUpperCase();

    this.logger.debug(`RTI ← ${topic}: ${rawPayload}`);

    if (stateCmd === 'TOGGLE') {
      await this.callService(domain, 'toggle', entityId, {});
      return;
    }

    if (stateCmd === 'ON') {
      const data: Record<string, unknown> = {};
      if (cmd.brightness != null) data.brightness = Number(cmd.brightness);
      if (cmd.brightness_pct != null) data.brightness = Math.round(Number(cmd.brightness_pct) * 2.55);
      if (cmd.color_temp != null) data.color_temp = cmd.color_temp;
      if (cmd.rgb_color != null) data.rgb_color = cmd.rgb_color;
      await this.callService(domain, 'turn_on', entityId, data);
      return;
    }

    if (stateCmd === 'OFF') {
      await this.callService(domain, 'turn_off', entityId, {});
      return;
    }

    // Media player volume
    if (cmd.volume != null) {
      await this.callService('media_player', 'volume_set', entityId, {
        volume_level: Math.max(0, Math.min(100, Number(cmd.volume))) / 100,
      });
    }

    // Source select
    if (cmd.source != null) {
      await this.callService('media_player', 'select_source', entityId, {
        source: String(cmd.source),
      });
    }
  }

  private async handleServiceCall(rawPayload: string): Promise<void> {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      this.logger.warn('RTI service call: invalid JSON payload');
      return;
    }

    const serviceStr = payload.service as string;
    if (!serviceStr?.includes('.')) {
      this.logger.warn(`RTI service call: invalid service "${serviceStr}"`);
      return;
    }

    const [domain, service] = serviceStr.split('.', 2);
    const entityId = payload.entity_id as string | undefined;
    const data = (payload.data as Record<string, unknown>) ?? {};

    this.logger.debug(`RTI service call: ${serviceStr} → ${entityId ?? 'no target'}`);
    await this.callService(domain, service, entityId, data);
  }

  private async callService(
    domain: string,
    service: string,
    entityId: string | undefined,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const call: ServiceCall = {
        domain,
        service,
        service_data: data,
        target: entityId ? { entity_id: entityId } : undefined,
        context: this.contextService.system(),
      };
      await this.serviceRegistry.call(call);
    } catch (err: unknown) {
      this.logger.warn(
        `RTI: service ${domain}.${service} failed: ${(err as Error).message}`,
      );
    }
  }

  // ── Outbound: HA → RTI ───────────────────────────────────────────────────────

  private publishStateToRti(data: StateChangedData): void {
    if (!this.client || !data.new_state) return;

    const entity_id = data.entity_id;
    const new_state = data.new_state as { state: string; attributes: Record<string, unknown> };
    const domain = entity_id.split('.')[0];

    // Filter by domain if state_domains is configured
    if (this.stateDomains.size > 0 && !this.stateDomains.has(domain)) return;

    // Build topic: rti/state/light/living_room
    const topicSuffix = entity_id.replace('.', '/');
    const topic = `${this.statePrefix}/${topicSuffix}`;

    // Build payload — state + key attributes flattened
    const attrs = new_state.attributes as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      entity_id,
      state: new_state.state,
    };

    // Include useful attributes for RTI variable mapping
    const attrKeys = [
      'brightness', 'color_temp', 'rgb_color', 'volume_level',
      'is_volume_muted', 'source', 'media_title', 'temperature',
      'humidity', 'friendly_name', 'device_class', 'unit_of_measurement',
    ];
    for (const key of attrKeys) {
      if (attrs[key] != null) payload[key] = attrs[key];
    }

    // RTI-friendly numeric shorthands
    if (attrs.brightness != null) {
      payload.brightness_pct = Math.round((attrs.brightness as number) / 255 * 100);
    }
    if (attrs.volume_level != null) {
      payload.volume = Math.round((attrs.volume_level as number) * 100);
    }

    const json = JSON.stringify(payload);
    this.client.publish(topic, json, { qos: DEFAULT_QOS, retain: this.retain }, (err) => {
      if (err) this.logger.error(`RTI publish error on ${topic}: ${err.message}`);
      else this.logger.debug(`RTI → ${topic}: ${json}`);
    });
  }
}
