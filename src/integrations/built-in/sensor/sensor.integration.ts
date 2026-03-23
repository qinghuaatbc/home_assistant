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
import { DOMAIN_SENSOR } from '../../../common/constants/domains.constants';

/**
 * Built-in sensor integration.
 * Sensors are read-only - they don't register services.
 * Their state is updated by pushing to the state machine.
 */
@Injectable()
export class SensorIntegration implements HaIntegration {
  private readonly logger = new Logger(SensorIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_SENSOR,
    name: 'Sensor',
    version: '1.0.0',
    iot_class: 'local_polling',
  };

  // Store intervals for cleanup
  private readonly intervals: NodeJS.Timer[] = [];

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    this.logger.log('Setting up sensor integration');

    const platforms = config.platforms ?? [];
    for (const platform of platforms) {
      for (const entityConfig of platform.entities ?? []) {
        await this.registerSensorEntity(entityConfig);
      }
    }

    return true;
  }

  async teardown(): Promise<void> {
    // Clear all polling intervals
    for (const interval of this.intervals) {
      clearInterval(interval as unknown as number);
    }
    this.logger.log('Sensor integration teardown');
  }

  private async registerSensorEntity(entityConfig: Record<string, unknown>): Promise<void> {
    const entityId = entityConfig.entity_id as string;
    const name = (entityConfig.name as string) ?? entityId;
    const unitOfMeasurement = entityConfig.unit_of_measurement as string | undefined;
    const deviceClass = entityConfig.device_class as string | undefined;
    const stateClass = entityConfig.state_class as string | undefined;

    await this.entityRegistry.registerEntity({
      entity_id: entityId,
      platform: DOMAIN_SENSOR,
      name,
      original_name: name,
      unit_of_measurement: unitOfMeasurement,
      device_class: deviceClass,
    });

    // Set initial state with demo value
    const initialValue = this.getDemoValue(deviceClass);
    this.stateMachine.setState(
      entityId,
      String(initialValue),
      {
        friendly_name: name,
        unit_of_measurement: unitOfMeasurement ?? null,
        device_class: deviceClass ?? null,
        state_class: stateClass ?? 'measurement',
      },
      this.contextService.system(),
    );

    // Simulate sensor updates with random values
    if (deviceClass) {
      const interval = setInterval(() => {
        const value = this.getDemoValue(deviceClass) + (Math.random() - 0.5) * 2;
        this.stateMachine.setState(
          entityId,
          String(Math.round(value * 10) / 10),
          {
            friendly_name: name,
            unit_of_measurement: unitOfMeasurement ?? null,
            device_class: deviceClass ?? null,
            state_class: stateClass ?? 'measurement',
          },
          this.contextService.system(),
        );
      }, 30000); // Update every 30 seconds

      this.intervals.push(interval);
    }

    this.logger.debug(`Registered sensor entity: ${entityId}`);
  }

  private getDemoValue(deviceClass?: string): number {
    switch (deviceClass) {
      case 'temperature': return 22;
      case 'humidity': return 55;
      case 'pressure': return 1013;
      case 'illuminance': return 500;
      case 'co2': return 400;
      default: return 0;
    }
  }
}
