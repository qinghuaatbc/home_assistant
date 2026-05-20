import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { HaIntegration, IntegrationManifest, IntegrationConfig } from '../integrations/interfaces/integration.interface';
import { ServiceRegistryService } from '../core/service-registry/service-registry.service';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationConfig } from './interfaces/automation-config.interface';

@Injectable()
export class AutomationIntegration implements HaIntegration {
  private readonly logger = new Logger(AutomationIntegration.name);
  private automationsFilePath: string | null = null;
  private fileWatcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

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

    // Watch automations file for hot reload if it's a separate file
    const configPath = process.env.HA_CONFIG_PATH ?? path.resolve(process.cwd(), 'config', 'configuration.yaml');
    const configDir = path.dirname(configPath);
    const autoFile = path.resolve(configDir, 'automations.yaml');
    if (fs.existsSync(autoFile)) {
      this.automationsFilePath = autoFile;
      this.startWatcher(autoFile);
    }

    this.logger.log(`Automation integration ready: ${automations.length} automations`);
    return true;
  }

  private startWatcher(filePath: string): void {
    this.fileWatcher = fs.watch(filePath, () => {
      // Debounce: editors write files multiple times in quick succession
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.reloadFromFile(filePath), 500);
    });
    this.logger.log(`Watching ${filePath} for changes`);
  }

  private reloadFromFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const automations: AutomationConfig[] = yaml.parse(content) ?? [];
      this.engine.reloadAutomations(automations);
      this.logger.log(`Hot reloaded ${automations.length} automations from ${path.basename(filePath)}`);
    } catch (err) {
      this.logger.error(`Hot reload failed: ${(err as Error).message}`);
    }
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
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.fileWatcher?.close();
    this.fileWatcher = null;
  }
}
