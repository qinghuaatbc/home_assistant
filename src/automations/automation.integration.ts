import { Injectable, Logger } from '@nestjs/common';
import { HaIntegration, IntegrationManifest, IntegrationConfig } from '../integrations/interfaces/integration.interface';
import { ServiceRegistryService } from '../core/service-registry/service-registry.service';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationConfig } from './interfaces/automation-config.interface';

@Injectable()
export class AutomationIntegration implements HaIntegration {
  private readonly logger = new Logger(AutomationIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: 'automation',
    name: 'Automation',
    version: '1.0.0',
    iot_class: 'calculated',
  };

  constructor(
    private readonly engine: AutomationEngineService,
    private readonly serviceRegistry: ServiceRegistryService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const automations = (config.automations as AutomationConfig[]) ?? [];
    this.engine.loadAutomations(automations);
    this.registerServices();
    this.logger.log(`Automation integration ready: ${automations.length} automations`);
    return true;
  }

  private registerServices(): void {
    this.serviceRegistry.register({
      domain: 'automation',
      service: 'trigger',
      name: 'Trigger automation',
      description: 'Manually trigger an automation',
      fields: { entity_id: { description: 'automation entity id', required: true } },
      handler: async (call) => {
        const entityId = (call.target?.entity_id ?? call.service_data?.entity_id) as string;
        if (!entityId) return;
        const id = entityId.replace('automation.', '');
        this.engine.trigger(id);
      },
    });

    this.serviceRegistry.register({
      domain: 'automation',
      service: 'turn_on',
      name: 'Enable automation',
      description: 'Enable a disabled automation',
      fields: { entity_id: { description: 'automation entity id', required: true } },
      handler: async (call) => {
        const entityId = (call.target?.entity_id ?? call.service_data?.entity_id) as string;
        if (!entityId) return;
        this.engine.enable(entityId.replace('automation.', ''));
      },
    });

    this.serviceRegistry.register({
      domain: 'automation',
      service: 'turn_off',
      name: 'Disable automation',
      description: 'Disable a running automation',
      fields: { entity_id: { description: 'automation entity id', required: true } },
      handler: async (call) => {
        const entityId = (call.target?.entity_id ?? call.service_data?.entity_id) as string;
        if (!entityId) return;
        this.engine.disable(entityId.replace('automation.', ''));
      },
    });
  }

  async teardown(): Promise<void> {
    // Engine handles cleanup via OnApplicationShutdown
  }
}
