import { IntegrationConfig, IntegrationManifest } from '../../integrations/interfaces/integration.interface';

/** Plugin manifest — metadata loaded from manifest.json inside plugin dir */
export interface PluginManifest {
  domain: string;
  name: string;
  version: string;
  description?: string;
  iot_class?: string;
  requirements?: string[];
  dependencies?: string[];
  author?: string;
  config_flow?: boolean;
}

/** Core services injected into every plugin's create() */
export interface PluginServices {
  stateMachine: {
    getState(entityId: string): any;
    getStates(): any[];
    setState(entityId: string, state: string, attributes: Record<string, unknown>, context: any): void;
  };
  entityRegistry: {
    registerEntity(opts: { entity_id: string; platform: string; name: string; original_name: string; unique_id?: string; device_class?: string }): Promise<void>;
  };
  contextService: {
    system(): { id: string; user_id: null };
    create(userId?: string): { id: string; user_id: string | null };
  };
  eventBus: {
    fire(eventType: string, data: any, context: any): void;
    on(eventType: string, handler: (data: any) => void): void;
  };
}

/** A loaded plugin instance */
export interface PluginInstance {
  manifest: PluginManifest;
  /** Imported module with create() factory */
  module: PluginModule;
}

/** Plugin module must export a create() factory receiving config + services */
export interface PluginModule {
  create(config: IntegrationConfig, services: PluginServices): Promise<{
    setup(config: IntegrationConfig): Promise<boolean>;
    teardown(): Promise<void>;
    manifest: IntegrationManifest;
    on_start?(): Promise<void>;
    on_stop?(): Promise<void>;
    on_config_change?(config: IntegrationConfig): Promise<void>;
  }>;
}
