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
  YamahaAvrClientService,
  MockReceiverConfig,
} from './yamaha-avr-client.service';
import {
  DOMAIN_YAMAHA_AVR,
  DOMAIN_MEDIA_PLAYER,
  SUPPORTED_FEATURES,
  YamahaZone,
} from './yamaha-avr.constants';
import { STATE_ON, STATE_OFF, STATE_UNAVAILABLE } from '../../../common/constants/domains.constants';

interface YamahaAvrConfig extends IntegrationConfig {
  /** Use mock data — no real hardware needed */
  mock?: boolean;
  /** Mock receiver definitions (only used when mock: true) */
  receivers?: MockReceiverConfig[];
  /** Real hardware: IP address of the receiver */
  host?: string;
  /** Real hardware: HTTP port (default 80) */
  port?: number;
  /** Polling interval in seconds (default 30) */
  scan_interval?: number;
}

/** entity_id → zone key */
type ZoneMap = Map<string, YamahaZone>;

@Injectable()
export class YamahaAvrIntegration implements HaIntegration {
  private readonly logger = new Logger(YamahaAvrIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_YAMAHA_AVR,
    name: 'Yamaha AV Receiver',
    version: '1.0.0',
    iot_class: 'local_polling',
    requirements: ['axios', 'xml2js'],
  };

  private config: YamahaAvrConfig | null = null;
  private readonly zoneMap: ZoneMap = new Map();
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
    private readonly client: YamahaAvrClientService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const cfg = config as YamahaAvrConfig;
    const isMock = cfg.mock === true;

    if (!isMock && !cfg.host) {
      this.logger.error('Yamaha AVR: host is required for real hardware');
      return false;
    }

    this.config = {
      ...cfg,
      port: cfg.port ?? 80,
      scan_interval: cfg.scan_interval ?? 30,
      mock: isMock,
    };

    if (isMock) {
      this.client.configureMock(cfg.receivers ?? []);
    } else {
      this.client.configure(cfg.host!, this.config.port!);
      const reachable = await this.client.ping();
      if (!reachable) {
        this.logger.error(`Yamaha AVR at ${cfg.host} is not reachable`);
        return false;
      }
    }

    await this.discoverZones();
    this.registerServices();

    if (!isMock) {
      this.startPolling();
    } else {
      this.logger.log('Yamaha AVR mock mode: skipping polling');
    }

    return true;
  }

  async teardown(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer as unknown as number);
      this.pollTimer = null;
    }
    this.logger.log('Yamaha AVR integration teardown complete');
  }

  // ── Discovery ───────────────────────────────────────────────────────────────

  private async discoverZones(): Promise<void> {
    const isMock = this.config!.mock;

    if (isMock) {
      for (const r of this.client.getMockReceivers()) {
        const entityId = this.buildEntityId(r.name);
        await this.entityRegistry.registerEntity({
          entity_id: entityId,
          platform: DOMAIN_YAMAHA_AVR,
          name: r.name,
          original_name: r.name,
          unique_id: `yamaha_${r.zone}`,
          device_class: 'receiver',
        });
        this.zoneMap.set(entityId, r.zone);
        this.pushState(entityId, r.zone);
        this.logger.debug(`Registered Yamaha zone: ${entityId}`);
      }
    }

    this.logger.log(`Yamaha AVR: registered ${this.zoneMap.size} zone(s)`);
  }

  // ── Services ────────────────────────────────────────────────────────────────

  private registerServices(): void {
    const svc = (service: string, handler: (call: ServiceCall) => Promise<void>) => {
      if (!this.serviceRegistry.has(DOMAIN_MEDIA_PLAYER, service)) {
        this.serviceRegistry.register({
          domain: DOMAIN_MEDIA_PLAYER,
          service,
          name: service.replace(/_/g, ' '),
          description: `${service} via Yamaha AVR`,
          fields: {},
          target: { entity: true },
          handler,
        });
      }
    };

    svc('turn_on',       (call) => this.handlePower(call, true));
    svc('turn_off',      (call) => this.handlePower(call, false));
    svc('toggle',        (call) => this.handleToggle(call));
    svc('volume_up',     (call) => this.handleVolumeStep(call, true));
    svc('volume_down',   (call) => this.handleVolumeStep(call, false));
    svc('volume_set',    (call) => this.handleVolumeSet(call));
    svc('mute_volume',   (call) => this.handleMute(call));
    svc('select_source', (call) => this.handleSelectSource(call));
  }

  // ── Service handlers ────────────────────────────────────────────────────────

  private async handlePower(call: ServiceCall, on: boolean): Promise<void> {
    for (const entityId of this.resolveEntityIds(call)) {
      const zone = this.zoneMap.get(entityId);
      if (!zone) continue;
      await this.client.setPower(zone, on);
      await this.pushState(entityId, zone);
    }
  }

  private async handleToggle(call: ServiceCall): Promise<void> {
    for (const entityId of this.resolveEntityIds(call)) {
      const current = this.stateMachine.getState(entityId);
      const on = current?.state !== STATE_ON;
      const zone = this.zoneMap.get(entityId);
      if (!zone) continue;
      await this.client.setPower(zone, on);
      await this.pushState(entityId, zone);
    }
  }

  private async handleVolumeStep(call: ServiceCall, up: boolean): Promise<void> {
    for (const entityId of this.resolveEntityIds(call)) {
      const zone = this.zoneMap.get(entityId);
      if (!zone) continue;
      await this.client.stepVolume(zone, up);
      await this.pushState(entityId, zone);
    }
  }

  private async handleVolumeSet(call: ServiceCall): Promise<void> {
    const level = Number((call.service_data ?? {})['volume_level'] ?? 0.3);
    for (const entityId of this.resolveEntityIds(call)) {
      const zone = this.zoneMap.get(entityId);
      if (!zone) continue;
      await this.client.setVolume(zone, level);
      await this.pushState(entityId, zone);
    }
  }

  private async handleMute(call: ServiceCall): Promise<void> {
    const muted = Boolean((call.service_data ?? {})['is_volume_muted'] ?? true);
    for (const entityId of this.resolveEntityIds(call)) {
      const zone = this.zoneMap.get(entityId);
      if (!zone) continue;
      await this.client.setMute(zone, muted);
      await this.pushState(entityId, zone);
    }
  }

  private async handleSelectSource(call: ServiceCall): Promise<void> {
    const source = String((call.service_data ?? {})['source'] ?? '');
    if (!source) return;
    for (const entityId of this.resolveEntityIds(call)) {
      const zone = this.zoneMap.get(entityId);
      if (!zone) continue;
      await this.client.selectSource(zone, source);
      await this.pushState(entityId, zone);
    }
  }

  // ── State sync ──────────────────────────────────────────────────────────────

  private async pushState(entityId: string, zone: YamahaZone): Promise<void> {
    const zoneState = await this.client.getZoneState(zone);
    if (!zoneState) {
      this.stateMachine.setState(entityId, STATE_UNAVAILABLE, {}, this.contextService.system());
      return;
    }

    const state = zoneState.power ? STATE_ON : STATE_OFF;
    this.stateMachine.setState(
      entityId,
      state,
      {
        friendly_name: this.nameFromEntityId(entityId),
        volume_level: zoneState.volume,
        is_volume_muted: zoneState.muted,
        source: zoneState.source,
        source_list: zoneState.sources,
        media_content_type: 'music',
        supported_features: SUPPORTED_FEATURES,
        device_class: 'receiver',
      },
      this.contextService.system(),
    );
  }

  private startPolling(): void {
    const ms = (this.config!.scan_interval ?? 30) * 1000;
    this.pollTimer = setInterval(async () => {
      for (const [entityId, zone] of this.zoneMap) {
        await this.pushState(entityId, zone);
      }
    }, ms) as unknown as NodeJS.Timeout;
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  private buildEntityId(name: string): string {
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `${DOMAIN_MEDIA_PLAYER}.${slug}`;
  }

  private nameFromEntityId(entityId: string): string {
    return entityId.split('.')[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private resolveEntityIds(call: ServiceCall): string[] {
    const entityId = call.target?.entity_id;
    if (!entityId) return [];
    return Array.isArray(entityId) ? entityId : [entityId];
  }
}
