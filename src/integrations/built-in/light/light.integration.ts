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
  STATE_ON,
  STATE_OFF,
  SERVICE_TURN_ON,
  SERVICE_TURN_OFF,
  SERVICE_TOGGLE,
  DOMAIN_LIGHT,
} from '../../../common/constants/domains.constants';

export interface LightAttributes {
  friendly_name: string;
  supported_features: number;
  brightness: number | null;
  color_temp: number | null;
  rgb_color: [number, number, number] | null;
  hs_color: [number, number] | null;
  color_mode: string;
  supported_color_modes: string[];
  effect: string | null;
  effect_list: string[] | null;
  min_mireds: number;
  max_mireds: number;
}

/** Light supported feature flags */
const SUPPORT_BRIGHTNESS = 1;
const SUPPORT_COLOR_TEMP = 2;
const SUPPORT_COLOR = 16;
const SUPPORT_EFFECT = 4;

/**
 * Built-in light integration.
 *
 * Supports:
 * - light.turn_on (with brightness, color_temp, rgb_color, transition)
 * - light.turn_off (with transition)
 * - light.toggle
 */
@Injectable()
export class LightIntegration implements HaIntegration {
  private readonly logger = new Logger(LightIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_LIGHT,
    name: 'Light',
    version: '1.0.0',
    iot_class: 'assumed_state',
  };

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    this.logger.log('Setting up light integration');

    // Register services
    this.registerServices();

    // Register demo entities from config
    const platforms = config.platforms ?? [];
    for (const platform of platforms) {
      for (const entityConfig of platform.entities ?? []) {
        await this.registerLightEntity(entityConfig.entity_id, entityConfig.name ?? entityConfig.entity_id);
      }
    }

    this.logger.log('Light integration setup complete');
    return true;
  }

  async teardown(): Promise<void> {
    this.logger.log('Light integration teardown');
  }

  private registerServices(): void {
    this.serviceRegistry.register({
      domain: DOMAIN_LIGHT,
      service: SERVICE_TURN_ON,
      name: 'Turn on',
      description: 'Turn on one or more lights with optional attributes',
      fields: {
        brightness: {
          description: 'Brightness (0-255)',
          example: 200,
          selector: { number: { min: 0, max: 255 } },
        },
        brightness_pct: {
          description: 'Brightness percentage (0-100)',
          example: 80,
          selector: { number: { min: 0, max: 100 } },
        },
        color_temp: {
          description: 'Color temperature in mireds',
          example: 300,
          selector: { number: { min: 153, max: 500 } },
        },
        rgb_color: {
          description: 'RGB color as [r, g, b]',
          example: [255, 100, 0],
        },
        transition: {
          description: 'Duration in seconds for the transition',
          example: 2,
          selector: { number: { min: 0, max: 300 } },
        },
        effect: {
          description: 'Light effect name',
          example: 'colorloop',
        },
      },
      target: { entity: true },
      handler: (call) => this.handleTurnOn(call),
    });

    this.serviceRegistry.register({
      domain: DOMAIN_LIGHT,
      service: SERVICE_TURN_OFF,
      name: 'Turn off',
      description: 'Turn off one or more lights',
      fields: {
        transition: {
          description: 'Duration in seconds for the transition',
          example: 2,
        },
      },
      target: { entity: true },
      handler: (call) => this.handleTurnOff(call),
    });

    this.serviceRegistry.register({
      domain: DOMAIN_LIGHT,
      service: SERVICE_TOGGLE,
      name: 'Toggle',
      description: 'Toggle one or more lights',
      fields: {},
      target: { entity: true },
      handler: (call) => this.handleToggle(call),
    });
  }

  private async handleTurnOn(call: ServiceCall): Promise<void> {
    const entityIds = this.resolveEntityIds(call);

    for (const entityId of entityIds) {
      const current = this.stateMachine.getState(entityId);
      const currentAttributes = (current?.attributes ?? {}) as Record<string, unknown>;
      const data = call.service_data ?? {};

      let brightness = (currentAttributes.brightness as number) ?? 255;
      if (data.brightness !== undefined) brightness = data.brightness as number;
      if (data.brightness_pct !== undefined) {
        brightness = Math.round(((data.brightness_pct as number) / 100) * 255);
      }

      const newAttributes: Record<string, unknown> = {
        ...currentAttributes,
        friendly_name: currentAttributes.friendly_name,
        brightness,
        supported_features: SUPPORT_BRIGHTNESS | SUPPORT_COLOR_TEMP | SUPPORT_COLOR | SUPPORT_EFFECT,
        supported_color_modes: ['brightness', 'color_temp', 'rgb'],
        color_mode: 'brightness',
        min_mireds: 153,
        max_mireds: 500,
      };

      if (data.color_temp !== undefined) {
        newAttributes.color_temp = data.color_temp;
        newAttributes.color_mode = 'color_temp';
      }
      if (data.rgb_color !== undefined) {
        newAttributes.rgb_color = data.rgb_color;
        newAttributes.color_mode = 'rgb';
      }
      if (data.effect !== undefined) {
        newAttributes.effect = data.effect;
      }

      this.stateMachine.setState(entityId, STATE_ON, newAttributes, call.context);
    }
  }

  private async handleTurnOff(call: ServiceCall): Promise<void> {
    const entityIds = this.resolveEntityIds(call);
    for (const entityId of entityIds) {
      const current = this.stateMachine.getState(entityId);
      const currentAttributes = (current?.attributes ?? {}) as Record<string, unknown>;
      this.stateMachine.setState(entityId, STATE_OFF, {
        ...currentAttributes,
        brightness: 0,
      }, call.context);
    }
  }

  private async handleToggle(call: ServiceCall): Promise<void> {
    const entityIds = this.resolveEntityIds(call);
    for (const entityId of entityIds) {
      const current = this.stateMachine.getState(entityId);
      if (current?.state === STATE_ON) {
        await this.handleTurnOff({ ...call, target: { entity_id: entityId } });
      } else {
        await this.handleTurnOn({ ...call, target: { entity_id: entityId } });
      }
    }
  }

  private resolveEntityIds(call: ServiceCall): string[] {
    const target = call.target;
    if (!target) return [];

    const entityId = target.entity_id;
    if (!entityId) return [];

    return Array.isArray(entityId) ? entityId : [entityId];
  }

  private async registerLightEntity(entityId: string, name: string): Promise<void> {
    await this.entityRegistry.registerEntity({
      entity_id: entityId,
      platform: DOMAIN_LIGHT,
      name,
      original_name: name,
    });

    // Set initial state
    this.stateMachine.setState(
      entityId,
      STATE_OFF,
      {
        friendly_name: name,
        brightness: null,
        color_temp: null,
        rgb_color: null,
        hs_color: null,
        color_mode: 'brightness',
        supported_color_modes: ['brightness', 'color_temp', 'rgb'],
        supported_features: SUPPORT_BRIGHTNESS | SUPPORT_COLOR_TEMP | SUPPORT_COLOR,
        effect: null,
        effect_list: null,
        min_mireds: 153,
        max_mireds: 500,
      },
      this.contextService.system(),
    );

    this.logger.debug(`Registered light entity: ${entityId}`);
  }
}
