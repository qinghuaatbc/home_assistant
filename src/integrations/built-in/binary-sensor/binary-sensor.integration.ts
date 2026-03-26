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
import {
  DOMAIN_BINARY_SENSOR,
  STATE_ON,
  STATE_OFF,
} from '../../../common/constants/domains.constants';

/**
 * Binary sensor integration.
 * Entities have exactly two states: "on" or "off".
 * Device class determines semantic meaning (motion, door, window, smoke, etc.)
 */
@Injectable()
export class BinarySensorIntegration implements HaIntegration {
  private readonly logger = new Logger(BinarySensorIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_BINARY_SENSOR,
    name: 'Binary Sensor',
    version: '1.0.0',
    iot_class: 'local_push',
  };

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    this.logger.log('Setting up binary_sensor integration');

    const platforms = config.platforms ?? [];
    for (const platform of platforms) {
      for (const entityConfig of platform.entities ?? []) {
        await this.registerBinarySensorEntity(entityConfig);
      }
    }

    return true;
  }

  async teardown(): Promise<void> {
    this.logger.log('Binary sensor integration teardown');
  }

  private async registerBinarySensorEntity(entityConfig: Record<string, unknown>): Promise<void> {
    const entityId = entityConfig.entity_id as string;
    const name = (entityConfig.name as string) ?? entityId;
    const deviceClass = entityConfig.device_class as string | undefined;

    await this.entityRegistry.registerEntity({
      entity_id: entityId,
      platform: DOMAIN_BINARY_SENSOR,
      name,
      original_name: name,
      device_class: deviceClass,
    });

    const extra: Record<string, unknown> = {};
    if (entityConfig.glb_floor) extra.glb_floor = entityConfig.glb_floor;
    if (entityConfig.glb_pos)   extra.glb_pos   = entityConfig.glb_pos;
    if (entityConfig.glb_mesh)  extra.glb_mesh   = entityConfig.glb_mesh;

    this.stateMachine.setState(
      entityId,
      STATE_OFF,
      {
        friendly_name: name,
        device_class: deviceClass ?? null,
        ...extra,
      },
      this.contextService.system(),
    );

    this.logger.debug(`Registered binary_sensor entity: ${entityId}`);
  }
}
