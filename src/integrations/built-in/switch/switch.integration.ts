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
  DOMAIN_SWITCH,
} from '../../../common/constants/domains.constants';

@Injectable()
export class SwitchIntegration implements HaIntegration {
  private readonly logger = new Logger(SwitchIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_SWITCH,
    name: 'Switch',
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
    this.logger.log('Setting up switch integration');
    this.registerServices();

    const platforms = config.platforms ?? [];
    for (const platform of platforms) {
      for (const entityConfig of platform.entities ?? []) {
        await this.registerSwitchEntity(entityConfig.entity_id, entityConfig.name ?? entityConfig.entity_id);
      }
    }

    return true;
  }

  async teardown(): Promise<void> {
    this.logger.log('Switch integration teardown');
  }

  private registerServices(): void {
    this.serviceRegistry.register({
      domain: DOMAIN_SWITCH,
      service: SERVICE_TURN_ON,
      name: 'Turn on',
      description: 'Turn on a switch',
      fields: {},
      target: { entity: true },
      handler: (call) => this.handleTurnOn(call),
    });

    this.serviceRegistry.register({
      domain: DOMAIN_SWITCH,
      service: SERVICE_TURN_OFF,
      name: 'Turn off',
      description: 'Turn off a switch',
      fields: {},
      target: { entity: true },
      handler: (call) => this.handleTurnOff(call),
    });

    this.serviceRegistry.register({
      domain: DOMAIN_SWITCH,
      service: SERVICE_TOGGLE,
      name: 'Toggle',
      description: 'Toggle a switch',
      fields: {},
      target: { entity: true },
      handler: (call) => this.handleToggle(call),
    });
  }

  private async handleTurnOn(call: ServiceCall): Promise<void> {
    for (const entityId of this.resolveEntityIds(call)) {
      const current = this.stateMachine.getState(entityId);
      this.stateMachine.setState(entityId, STATE_ON, {
        ...(current?.attributes ?? {}),
      }, call.context);
    }
  }

  private async handleTurnOff(call: ServiceCall): Promise<void> {
    for (const entityId of this.resolveEntityIds(call)) {
      const current = this.stateMachine.getState(entityId);
      this.stateMachine.setState(entityId, STATE_OFF, {
        ...(current?.attributes ?? {}),
      }, call.context);
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

  private resolveEntityIds(call: ServiceCall): string[] {
    const entityId = call.target?.entity_id;
    if (!entityId) return [];
    return Array.isArray(entityId) ? entityId : [entityId];
  }

  private async registerSwitchEntity(entityId: string, name: string): Promise<void> {
    await this.entityRegistry.registerEntity({
      entity_id: entityId,
      platform: DOMAIN_SWITCH,
      name,
      original_name: name,
    });

    this.stateMachine.setState(
      entityId,
      STATE_OFF,
      { friendly_name: name },
      this.contextService.system(),
    );

    this.logger.debug(`Registered switch entity: ${entityId}`);
  }
}
