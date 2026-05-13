import { Injectable, Logger } from '@nestjs/common';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../../core/service-registry/service-registry.service';
import { EntityRegistryService } from '../../../registry/entity-registry/entity-registry.service';
import {
  HaIntegration,
  IntegrationConfig,
  IntegrationManifest,
} from '../../interfaces/integration.interface';
import { ServiceCall } from '../../../core/service-registry/interfaces/ha-service.interface';
import {
  STATE_ON,
  STATE_OFF,
  SERVICE_TURN_ON,
  SERVICE_TURN_OFF,
  SERVICE_TOGGLE,
} from '../../../common/constants/domains.constants';

const DOMAIN_FAN = 'fan';

export interface FanEntityConfig {
  entity_id: string;
  name: string;
  percentage?: number;
  preset_mode?: string;
  preset_modes?: string[];
  speed_count?: number;
}

interface FanConfig {
  platforms?: Array<{ name: string; entities: FanEntityConfig[] }>;
}

@Injectable()
export class FanIntegration implements HaIntegration {
  private readonly logger = new Logger(FanIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_FAN,
    name: 'Fan',
    version: '1.0.0',
    iot_class: 'assumed_state',
  };

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const fanConfig = config as IntegrationConfig & FanConfig;
    this.registerServices();

    let total = 0;
    for (const platform of fanConfig.platforms ?? []) {
      for (const entity of (platform.entities ?? []) as FanEntityConfig[]) {
        this.createFan(entity);
        total++;
      }
    }

    this.logger.log(`Fan integration ready: ${total} entities`);
    return true;
  }

  async teardown(): Promise<void> {}

  private createFan(cfg: FanEntityConfig): void {
    const pct = cfg.percentage ?? 0;
    const presetModes = cfg.preset_modes ?? ['low', 'medium', 'high'];
    this.stateMachine.setState(cfg.entity_id, pct > 0 ? STATE_ON : STATE_OFF, {
      friendly_name: cfg.name,
      percentage: pct,
      percentage_step: Math.round(100 / (cfg.speed_count ?? 3)),
      preset_modes: presetModes,
      preset_mode: cfg.preset_mode ?? null,
      supported_features: 1,
    });
    this.entityRegistry.registerEntity({
      entity_id: cfg.entity_id,
      domain: DOMAIN_FAN,
      unique_id: cfg.entity_id,
      name: cfg.name,
    } as any);
  }

  private eid(call: ServiceCall): string | null {
    return (
      (Array.isArray(call.target?.entity_id)
        ? call.target?.entity_id[0]
        : call.target?.entity_id) ??
      (call.service_data?.entity_id as string) ??
      null
    );
  }

  private registerServices(): void {
    this.serviceRegistry.register({
      domain: DOMAIN_FAN,
      service: SERVICE_TURN_ON,
      name: 'Turn on fan',
      description: 'Turn on a fan entity',
      fields: {
        entity_id: { description: 'Fan entity ID', required: true },
        percentage: { description: 'Speed percentage (0-100)' },
      },
      handler: async (call) => {
        const id = this.eid(call);
        if (!id) return;
        const s = this.stateMachine.getState(id);
        if (!s) return;
        const pct = call.service_data?.percentage != null
          ? Math.min(100, Math.max(0, Number(call.service_data.percentage)))
          : Math.max(33, Number(s.attributes.percentage ?? 33));
        this.stateMachine.setState(id, STATE_ON, { ...s.attributes, percentage: pct });
      },
    });

    this.serviceRegistry.register({
      domain: DOMAIN_FAN,
      service: SERVICE_TURN_OFF,
      name: 'Turn off fan',
      description: 'Turn off a fan entity',
      fields: { entity_id: { description: 'Fan entity ID', required: true } },
      handler: async (call) => {
        const id = this.eid(call);
        if (!id) return;
        const s = this.stateMachine.getState(id);
        if (!s) return;
        this.stateMachine.setState(id, STATE_OFF, { ...s.attributes });
      },
    });

    this.serviceRegistry.register({
      domain: DOMAIN_FAN,
      service: SERVICE_TOGGLE,
      name: 'Toggle fan',
      description: 'Toggle a fan entity on/off',
      fields: { entity_id: { description: 'Fan entity ID', required: true } },
      handler: async (call) => {
        const id = this.eid(call);
        if (!id) return;
        const s = this.stateMachine.getState(id);
        if (!s) return;
        if (s.state === STATE_ON) {
          this.stateMachine.setState(id, STATE_OFF, { ...s.attributes });
        } else {
          const pct = Math.max(33, Number(s.attributes.percentage ?? 33));
          this.stateMachine.setState(id, STATE_ON, { ...s.attributes, percentage: pct });
        }
      },
    });

    this.serviceRegistry.register({
      domain: DOMAIN_FAN,
      service: 'set_percentage',
      name: 'Set fan speed',
      description: 'Set fan speed as a percentage (0-100)',
      fields: {
        entity_id: { description: 'Fan entity ID', required: true },
        percentage: { description: 'Speed 0-100', required: true },
      },
      handler: async (call) => {
        const id = this.eid(call);
        if (!id) return;
        const s = this.stateMachine.getState(id);
        if (!s) return;
        const pct = Math.min(100, Math.max(0, Number(call.service_data?.percentage ?? 0)));
        this.stateMachine.setState(id, pct > 0 ? STATE_ON : STATE_OFF, {
          ...s.attributes,
          percentage: pct,
        });
      },
    });

    this.serviceRegistry.register({
      domain: DOMAIN_FAN,
      service: 'set_preset_mode',
      name: 'Set fan preset',
      description: 'Set fan to a named preset mode',
      fields: {
        entity_id: { description: 'Fan entity ID', required: true },
        preset_mode: { description: 'Preset name', required: true },
      },
      handler: async (call) => {
        const id = this.eid(call);
        if (!id) return;
        const s = this.stateMachine.getState(id);
        if (!s) return;
        const preset = call.service_data?.preset_mode as string;
        const modes = s.attributes.preset_modes as string[];
        if (preset && modes?.includes(preset)) {
          this.stateMachine.setState(id, STATE_ON, { ...s.attributes, preset_mode: preset });
        }
      },
    });
  }
}
