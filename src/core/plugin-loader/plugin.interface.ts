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

/** A loaded plugin instance */
export interface PluginInstance {
  manifest: PluginManifest;
  /** Imported module with create() factory */
  module: PluginModule;
}

/** Plugin module must export a create() factory */
export interface PluginModule {
  create(config: IntegrationConfig): Promise<{
    setup(config: IntegrationConfig): Promise<boolean>;
    teardown(): Promise<void>;
    manifest: IntegrationManifest;
  }>;
}
