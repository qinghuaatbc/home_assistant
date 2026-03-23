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
import { Isy994ClientService, IsyNode, MockNodeConfig } from './isy994-client.service';
import { Isy994SubscriptionService } from './isy994-subscription.service';
import {
  DOMAIN_ISY994,
  INSTEON_CATEGORY_TO_DOMAIN,
  CMD_DON,
  CMD_DOF,
  ISY_MAX_LEVEL,
} from './isy994.constants';
import {
  STATE_ON,
  STATE_OFF,
  STATE_UNAVAILABLE,
  SERVICE_TURN_ON,
  SERVICE_TURN_OFF,
  SERVICE_TOGGLE,
} from '../../../common/constants/domains.constants';

interface Isy994Config extends IntegrationConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  tls?: boolean;
  /** Use config-driven mock data instead of connecting to real hardware */
  mock?: boolean;
  /** Mock node definitions (only used when mock: true) */
  nodes?: MockNodeConfig[];
  /** Nodes whose names contain this string are ignored */
  ignore_string?: string;
  /** Poll interval in seconds when WebSocket is unavailable (default 30) */
  scan_interval?: number;
}

/** Maps ISY address → entity_id */
type NodeMap = Map<string, { entityId: string; domain: string; node: IsyNode }>;

/**
 * ISY994 / Insteon integration.
 *
 * On setup:
 * 1. Connects to the ISY994 REST API
 * 2. Discovers all Insteon nodes and registers them as HA entities
 * 3. Fetches initial status for all nodes
 * 4. Subscribes to real-time events via WebSocket
 * 5. Registers services: light/switch turn_on, turn_off, toggle
 *    (calls the ISY DON/DOF commands, which Insteon devices execute)
 *
 * Entity ID format: isy994.<sanitized_address>
 * Example: "1A 2B 3C 1" → "light.isy994_1a_2b_3c_1"
 */
@Injectable()
export class Isy994Integration implements HaIntegration {
  private readonly logger = new Logger(Isy994Integration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_ISY994,
    name: 'ISY994 / Insteon',
    version: '1.0.0',
    iot_class: 'local_push',
    requirements: ['axios', 'xml2js', 'ws'],
  };

  private config: Isy994Config | null = null;
  private readonly nodeMap: NodeMap = new Map();
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
    private readonly client: Isy994ClientService,
    private readonly subscription: Isy994SubscriptionService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const cfg = config as Isy994Config;

    const isMock = cfg.mock === true || cfg.host === 'mock';

    if (!isMock && (!cfg.host || !cfg.username || !cfg.password)) {
      this.logger.error('ISY994: host, username, and password are required');
      return false;
    }

    this.config = {
      ...cfg,
      host: cfg.host ?? 'mock',
      username: cfg.username ?? '',
      password: cfg.password ?? '',
      port: cfg.port ?? 80,
      tls: cfg.tls ?? false,
      mock: isMock,
      ignore_string: cfg.ignore_string ?? '_ignore_',
      scan_interval: cfg.scan_interval ?? 30,
    };

    // Configure HTTP client
    this.client.configure(
      this.config.host,
      this.config.port!,
      this.config.username,
      this.config.password,
      this.config.tls,
      this.config.mock,
      this.config.nodes ?? [],
    );

    // Test connectivity
    this.logger.log(`Connecting to ISY994 at ${this.config.host}:${this.config.port}...`);
    const reachable = await this.client.ping();
    if (!reachable) {
      this.logger.error(`ISY994 at ${this.config.host} is not reachable`);
      return false;
    }
    this.logger.log('ISY994 connection successful');

    // Discover and register all nodes
    await this.discoverNodes();

    // Register services for each domain found
    this.registerServices();

    if (!this.config.mock) {
      // Start real-time event subscription
      this.startSubscription();

      // Fall back to polling if WebSocket isn't available
      this.startPolling();
    } else {
      this.logger.log('ISY994 mock mode: skipping WebSocket subscription and polling');
    }

    return true;
  }

  async teardown(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer as unknown as number);
      this.pollTimer = null;
    }
    this.subscription.stop();
    this.logger.log('ISY994 integration teardown complete');
  }

  // ─── Node Discovery ────────────────────────────────────────────────────────

  private async discoverNodes(): Promise<void> {
    this.logger.log('Discovering ISY994 nodes...');

    let nodes: IsyNode[];
    try {
      nodes = await this.client.getNodes();
    } catch (err: unknown) {
      this.logger.error(`Failed to fetch ISY994 nodes: ${(err as Error).message}`);
      return;
    }

    this.logger.log(`Found ${nodes.length} ISY994 nodes`);

    // Fetch all statuses in one call
    let statuses = new Map<string, { value: number | null; formatted: string }>();
    try {
      const rawStatuses = await this.client.getAllStatuses();
      statuses = rawStatuses;
    } catch {
      this.logger.warn('Could not fetch initial ISY994 statuses');
    }

    const ignoreStr = this.config!.ignore_string!.toLowerCase();
    let registered = 0;

    for (const node of nodes) {
      if (ignoreStr && node.name.toLowerCase().includes(ignoreStr)) {
        this.logger.debug(`Ignoring node: ${node.name}`);
        continue;
      }

      const domain = INSTEON_CATEGORY_TO_DOMAIN[node.category] ?? 'switch';
      const entityId = this.buildEntityId(domain, node.address);

      await this.entityRegistry.registerEntity({
        entity_id: entityId,
        platform: DOMAIN_ISY994,
        name: node.name,
        original_name: node.name,
        unique_id: node.address,
        device_class: domain === 'binary_sensor' ? 'safety' : undefined,
      });

      this.nodeMap.set(node.address, { entityId, domain, node });

      // Set initial state from status
      const status = statuses.get(node.address);
      const initialState = this.valueToState(status?.value ?? null, domain);
      const initialAttrs = this.buildAttributes(node, status?.value ?? null, domain);

      this.stateMachine.setState(
        entityId,
        initialState,
        initialAttrs,
        this.contextService.system(),
      );

      registered++;
    }

    this.logger.log(`ISY994: registered ${registered} entities`);
  }

  // ─── Service Registration ──────────────────────────────────────────────────

  private registerServices(): void {
    // Collect all domains found among discovered nodes
    const domains = new Set(
      Array.from(this.nodeMap.values()).map((n) => n.domain),
    );

    for (const domain of domains) {
      if (domain === 'binary_sensor') continue; // read-only

      const alreadyRegistered =
        this.serviceRegistry.has(domain, SERVICE_TURN_ON);

      if (!alreadyRegistered) {
        this.registerDomainServices(domain);
      }
    }
  }

  private registerDomainServices(domain: string): void {
    const isLight = domain === 'light';

    this.serviceRegistry.register({
      domain,
      service: SERVICE_TURN_ON,
      name: 'Turn on',
      description: `Turn on ${domain} via ISY994`,
      fields: isLight
        ? {
            brightness: {
              description: 'Brightness 0-255',
              example: 200,
              selector: { number: { min: 0, max: 255 } },
            },
            brightness_pct: {
              description: 'Brightness percentage 0-100',
              example: 80,
              selector: { number: { min: 0, max: 100 } },
            },
          }
        : {},
      target: { entity: true },
      handler: (call) => this.handleTurnOn(call, domain),
    });

    this.serviceRegistry.register({
      domain,
      service: SERVICE_TURN_OFF,
      name: 'Turn off',
      description: `Turn off ${domain} via ISY994`,
      fields: {},
      target: { entity: true },
      handler: (call) => this.handleTurnOff(call, domain),
    });

    this.serviceRegistry.register({
      domain,
      service: SERVICE_TOGGLE,
      name: 'Toggle',
      description: `Toggle ${domain} via ISY994`,
      fields: {},
      target: { entity: true },
      handler: (call) => this.handleToggle(call, domain),
    });
  }

  // ─── Service Handlers ──────────────────────────────────────────────────────

  private async handleTurnOn(call: ServiceCall, _domain: string): Promise<void> {
    const entityIds = this.resolveEntityIds(call);

    for (const entityId of entityIds) {
      const entry = this.findByEntityId(entityId);
      if (!entry) continue;

      const data = call.service_data ?? {};
      let level = ISY_MAX_LEVEL;

      if (data.brightness !== undefined) {
        level = Math.min(ISY_MAX_LEVEL, Math.max(0, data.brightness as number));
      } else if (data.brightness_pct !== undefined) {
        level = Math.round(((data.brightness_pct as number) / 100) * ISY_MAX_LEVEL);
      }

      try {
        await this.client.sendCommand(entry.node.address, CMD_DON, level);
        // Optimistically update state; WebSocket event will confirm
        this.updateEntityState(entityId, level, entry, call);
      } catch (err: unknown) {
        this.logger.error(
          `ISY turn_on failed for ${entry.node.address}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async handleTurnOff(call: ServiceCall, _domain: string): Promise<void> {
    const entityIds = this.resolveEntityIds(call);

    for (const entityId of entityIds) {
      const entry = this.findByEntityId(entityId);
      if (!entry) continue;

      try {
        await this.client.sendCommand(entry.node.address, CMD_DOF);
        this.updateEntityState(entityId, 0, entry, call);
      } catch (err: unknown) {
        this.logger.error(
          `ISY turn_off failed for ${entry.node.address}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async handleToggle(call: ServiceCall, _domain: string): Promise<void> {
    const entityIds = this.resolveEntityIds(call);

    for (const entityId of entityIds) {
      const current = this.stateMachine.getState(entityId);
      if (current?.state === STATE_ON) {
        await this.handleTurnOff({ ...call, target: { entity_id: entityId } }, _domain);
      } else {
        await this.handleTurnOn({ ...call, target: { entity_id: entityId } }, _domain);
      }
    }
  }

  // ─── WebSocket Subscription ────────────────────────────────────────────────

  private startSubscription(): void {
    const cfg = this.config!;
    const wsUrl = this.client.getWebSocketUrl(
      cfg.username,
      cfg.password,
      cfg.host,
      cfg.port!,
      cfg.tls!,
    );

    this.subscription.onEvent((event) => {
      const entry = this.nodeMap.get(event.address);
      if (!entry) return;

      // DON = on, DOF = off, ST = status update
      if (event.control === 'DON' || event.control === 'ST') {
        const level = event.action ?? ISY_MAX_LEVEL;
        this.updateEntityState(
          entry.entityId,
          level,
          entry,
          { context: this.contextService.system() },
        );
      } else if (event.control === 'DOF' || event.control === 'DFOF') {
        this.updateEntityState(
          entry.entityId,
          0,
          entry,
          { context: this.contextService.system() },
        );
      }
    });

    this.subscription.start(wsUrl);
  }

  // ─── Polling Fallback ──────────────────────────────────────────────────────

  private startPolling(): void {
    const intervalMs = (this.config!.scan_interval ?? 30) * 1000;
    this.pollTimer = setInterval(async () => {
      await this.pollStatuses();
    }, intervalMs) as unknown as NodeJS.Timeout;
  }

  private async pollStatuses(): Promise<void> {
    try {
      const statuses = await this.client.getAllStatuses();
      const ctx = this.contextService.system();

      for (const [address, status] of statuses) {
        const entry = this.nodeMap.get(address);
        if (!entry) continue;

        const currentState = this.stateMachine.getState(entry.entityId);
        const newState = this.valueToState(status.value, entry.domain);

        // Only update if state or brightness changed to avoid noise
        if (
          currentState?.state !== newState ||
          currentState?.attributes?.['brightness'] !== status.value
        ) {
          this.stateMachine.setState(
            entry.entityId,
            newState,
            this.buildAttributes(entry.node, status.value, entry.domain),
            ctx,
          );
        }
      }
    } catch (err: unknown) {
      this.logger.warn(`ISY994 poll error: ${(err as Error).message}`);
    }
  }

  // ─── State Helpers ─────────────────────────────────────────────────────────

  private updateEntityState(
    entityId: string,
    level: number,
    entry: { domain: string; node: IsyNode },
    call: Pick<ServiceCall, 'context'>,
  ): void {
    const state = level > 0 ? STATE_ON : STATE_OFF;
    const attrs = this.buildAttributes(entry.node, level, entry.domain);
    this.stateMachine.setState(entityId, state, attrs, call.context);
  }

  private valueToState(value: number | null, domain: string): string {
    if (value === null) return STATE_UNAVAILABLE;
    if (domain === 'binary_sensor') return value > 0 ? STATE_ON : STATE_OFF;
    return value > 0 ? STATE_ON : STATE_OFF;
  }

  private buildAttributes(
    node: IsyNode,
    value: number | null,
    domain: string,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      friendly_name: node.name,
      insteon_address: node.address,
      insteon_type: node.type,
    };

    if (domain === 'light') {
      base.brightness = value !== null && value > 0 ? value : null;
      base.supported_features = 1; // SUPPORT_BRIGHTNESS
      base.supported_color_modes = ['brightness'];
      base.color_mode = 'brightness';
    }

    return base;
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Convert an ISY node address to a valid HA entity ID.
   * "1A 2B 3C 1" → "light.isy994_1a_2b_3c_1"
   */
  private buildEntityId(domain: string, address: string): string {
    const slug = address
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    return `${domain}.isy994_${slug}`;
  }

  private findByEntityId(
    entityId: string,
  ): { entityId: string; domain: string; node: IsyNode } | undefined {
    for (const entry of this.nodeMap.values()) {
      if (entry.entityId === entityId) return entry;
    }
    return undefined;
  }

  private resolveEntityIds(call: ServiceCall): string[] {
    const entityId = call.target?.entity_id;
    if (!entityId) return [];
    return Array.isArray(entityId) ? entityId : [entityId];
  }
}
