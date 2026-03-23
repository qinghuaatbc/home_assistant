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
import {
  LutronCasetaClientService,
  LutronOutputEvent,
} from './lutron-caseta-client.service';
import {
  DOMAIN_LUTRON_CASETA,
  DEFAULT_HOST_PORT,
  DEFAULT_USERNAME,
  DEFAULT_PASSWORD,
  LutronDeviceType,
} from './lutron-caseta.constants';
import {
  STATE_ON,
  STATE_OFF,
  STATE_UNAVAILABLE,
  SERVICE_TURN_ON,
  SERVICE_TURN_OFF,
  SERVICE_TOGGLE,
} from '../../../common/constants/domains.constants';

/** One device entry from configuration.yaml */
export interface LutronDeviceConfig {
  /** Lutron integration ID (set in Lutron app under Settings → Advanced → Integration) */
  id: number;
  /** Friendly name */
  name: string;
  /** light | switch | fan */
  type?: LutronDeviceType;
}

interface LutronCasetaConfig extends IntegrationConfig {
  /** IP address of the Lutron Smart Bridge */
  host: string;
  /** Telnet port (default 23) */
  port?: number;
  /** Bridge login (default "lutron") */
  username?: string;
  /** Bridge password (default "integration") */
  password?: string;
  /** List of devices with their Lutron integration IDs */
  devices: LutronDeviceConfig[];
}

/** integrationId → entity_id */
type DeviceMap = Map<number, { entityId: string; type: LutronDeviceType; name: string }>;

/**
 * Lutron Caséta integration.
 *
 * Communicates with the Lutron Smart Bridge via Telnet (port 23).
 *
 * Setup steps on the Lutron side:
 *  1. Open the Lutron app → Settings → Advanced → Integration
 *  2. Enable Telnet Support
 *  3. Note the Integration ID for each device
 *  4. Add devices to configuration.yaml with their IDs
 *
 * Entity ID format: <type>.lutron_<slugified_name>
 * Example: "Living Room" → "light.lutron_living_room"
 */
@Injectable()
export class LutronCasetaIntegration implements HaIntegration {
  private readonly logger = new Logger(LutronCasetaIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_LUTRON_CASETA,
    name: 'Lutron Caséta',
    version: '1.0.0',
    iot_class: 'local_push',
    requirements: [],
  };

  private config: LutronCasetaConfig | null = null;
  private readonly deviceMap: DeviceMap = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
    private readonly client: LutronCasetaClientService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const cfg = config as LutronCasetaConfig;

    if (!cfg.host) {
      this.logger.error('Lutron Caséta: host is required');
      return false;
    }
    if (!cfg.devices?.length) {
      this.logger.error('Lutron Caséta: at least one device must be configured');
      return false;
    }

    this.config = {
      ...cfg,
      port: cfg.port ?? DEFAULT_HOST_PORT,
      username: cfg.username ?? DEFAULT_USERNAME,
      password: cfg.password ?? DEFAULT_PASSWORD,
    };

    // Register entities before connecting so state is available immediately
    await this.registerDevices();

    // Connect to Smart Bridge
    const ok = await this.connect();
    if (!ok) {
      this.logger.error(`Lutron: cannot reach Smart Bridge at ${cfg.host}:${this.config.port}`);
      // Mark all as unavailable but don't fail — we'll reconnect
      this.markAllUnavailable();
      this.scheduleReconnect();
      return true; // return true so other integrations still load
    }

    // Subscribe to real-time events from the bridge
    this.client.on('output', (event: LutronOutputEvent) => this.handleOutputEvent(event));
    this.client.on('disconnected', () => {
      this.logger.warn('Lutron Smart Bridge disconnected — will reconnect');
      this.markAllUnavailable();
      this.scheduleReconnect();
    });

    // Query initial state of all devices
    await this.fetchAllStates();

    // Register HA services
    this.registerServices();

    this.logger.log(
      `Lutron Caséta connected to ${cfg.host}:${this.config.port} ` +
      `with ${this.deviceMap.size} device(s)`,
    );
    return true;
  }

  async teardown(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer as unknown as number);
      this.reconnectTimer = null;
    }
    this.client.disconnect();
    this.logger.log('Lutron Caséta integration teardown complete');
  }

  // ── Device registration ─────────────────────────────────────────────────────

  private async registerDevices(): Promise<void> {
    for (const device of this.config!.devices) {
      const type = device.type ?? 'light';
      const entityId = this.buildEntityId(type, device.name);

      await this.entityRegistry.registerEntity({
        entity_id: entityId,
        platform: DOMAIN_LUTRON_CASETA,
        name: device.name,
        original_name: device.name,
        unique_id: `lutron_${device.id}`,
        device_class: type === 'light' ? 'light' : undefined,
      });

      this.deviceMap.set(device.id, { entityId, type, name: device.name });

      // Start as unavailable until we query the bridge
      this.stateMachine.setState(
        entityId,
        STATE_UNAVAILABLE,
        { friendly_name: device.name },
        this.contextService.system(),
      );
    }
    this.logger.log(`Lutron: registered ${this.deviceMap.size} device(s)`);
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  private async connect(): Promise<boolean> {
    const cfg = this.config!;
    return this.client.connect(cfg.host, cfg.port!, cfg.username!, cfg.password!);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.logger.log('Lutron: attempting reconnect...');
      const ok = await this.connect();
      if (ok) {
        await this.fetchAllStates();
        this.logger.log('Lutron: reconnected successfully');
      } else {
        this.scheduleReconnect();
      }
    }, 10000) as unknown as NodeJS.Timeout;
  }

  // ── State sync ──────────────────────────────────────────────────────────────

  private async fetchAllStates(): Promise<void> {
    for (const [integrationId, device] of this.deviceMap) {
      const level = await this.client.getLevel(integrationId);
      this.applyLevel(device.entityId, device.type, level);
    }
  }

  private handleOutputEvent(event: LutronOutputEvent): void {
    const device = this.deviceMap.get(event.integrationId);
    if (!device) return;
    this.applyLevel(device.entityId, device.type, event.level);
  }

  private applyLevel(entityId: string, type: LutronDeviceType, level: number): void {
    const isOn = level > 0;
    const state = isOn ? STATE_ON : STATE_OFF;

    const attrs: Record<string, unknown> = {
      friendly_name: this.deviceMap.get(this.integrationIdByEntityId(entityId)!)?.name,
    };

    if (type === 'light') {
      attrs['brightness'] = isOn ? Math.round((level / 100) * 255) : null;
      attrs['brightness_pct'] = isOn ? level : 0;
      attrs['supported_features'] = 1;
      attrs['supported_color_modes'] = ['brightness'];
      attrs['color_mode'] = 'brightness';
    }

    if (type === 'fan') {
      attrs['percentage'] = level;
    }

    this.stateMachine.setState(entityId, state, attrs, this.contextService.system());
  }

  private markAllUnavailable(): void {
    for (const device of this.deviceMap.values()) {
      this.stateMachine.setState(
        device.entityId,
        STATE_UNAVAILABLE,
        { friendly_name: device.name },
        this.contextService.system(),
      );
    }
  }

  // ── Services ────────────────────────────────────────────────────────────────

  private registerServices(): void {
    const domains = new Set(Array.from(this.deviceMap.values()).map(d => d.type));

    for (const domain of domains) {
      if (this.serviceRegistry.has(domain, SERVICE_TURN_ON)) continue;

      const isLight = domain === 'light';

      this.serviceRegistry.register({
        domain,
        service: SERVICE_TURN_ON,
        name: 'Turn on',
        description: `Turn on ${domain} via Lutron Caséta`,
        fields: isLight ? {
          brightness: { description: 'Brightness 0–255', example: 200 },
          brightness_pct: { description: 'Brightness % 0–100', example: 80 },
          transition: { description: 'Fade time in seconds', example: 1 },
        } : {},
        target: { entity: true },
        handler: (call) => this.handleTurnOn(call),
      });

      this.serviceRegistry.register({
        domain,
        service: SERVICE_TURN_OFF,
        name: 'Turn off',
        description: `Turn off ${domain} via Lutron Caséta`,
        fields: { transition: { description: 'Fade time in seconds', example: 1 } },
        target: { entity: true },
        handler: (call) => this.handleTurnOff(call),
      });

      this.serviceRegistry.register({
        domain,
        service: SERVICE_TOGGLE,
        name: 'Toggle',
        description: `Toggle ${domain} via Lutron Caséta`,
        fields: {},
        target: { entity: true },
        handler: (call) => this.handleToggle(call),
      });
    }
  }

  private async handleTurnOn(call: ServiceCall): Promise<void> {
    const data = call.service_data ?? {};
    const transition = Number(data['transition'] ?? 0);

    for (const entityId of this.resolveEntityIds(call)) {
      const integrationId = this.integrationIdByEntityId(entityId);
      if (integrationId === undefined) continue;

      let level = 100;
      if (data['brightness'] !== undefined) {
        level = Math.round((Number(data['brightness']) / 255) * 100);
      } else if (data['brightness_pct'] !== undefined) {
        level = Number(data['brightness_pct']);
      }

      this.client.setLevel(integrationId, level, transition);
      // Optimistic update — real event comes back from bridge
      const device = this.deviceMap.get(integrationId)!;
      this.applyLevel(entityId, device.type, level);
    }
  }

  private async handleTurnOff(call: ServiceCall): Promise<void> {
    const transition = Number((call.service_data ?? {})['transition'] ?? 0);

    for (const entityId of this.resolveEntityIds(call)) {
      const integrationId = this.integrationIdByEntityId(entityId);
      if (integrationId === undefined) continue;

      this.client.setLevel(integrationId, 0, transition);
      const device = this.deviceMap.get(integrationId)!;
      this.applyLevel(entityId, device.type, 0);
    }
  }

  private async handleToggle(call: ServiceCall): Promise<void> {
    for (const entityId of this.resolveEntityIds(call)) {
      const current = this.stateMachine.getState(entityId);
      if (current?.state === STATE_ON) {
        await this.handleTurnOff({ ...call, target: { entity_id: entityId } });
      } else {
        await this.handleTurnOn({ ...call, target: { entity_id: entityId } });
      }
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  private buildEntityId(type: string, name: string): string {
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `${type}.lutron_${slug}`;
  }

  private integrationIdByEntityId(entityId: string): number | undefined {
    for (const [id, device] of this.deviceMap) {
      if (device.entityId === entityId) return id;
    }
    return undefined;
  }

  private resolveEntityIds(call: ServiceCall): string[] {
    const entityId = call.target?.entity_id;
    if (!entityId) return [];
    return Array.isArray(entityId) ? entityId : [entityId];
  }
}
