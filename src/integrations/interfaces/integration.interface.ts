/** IoT class describes how the integration communicates with devices */
export type IotClass =
  | 'local_push'
  | 'local_polling'
  | 'cloud_push'
  | 'cloud_polling'
  | 'calculated'
  | 'assumed_state';

/** Integration manifest - metadata about the integration */
export interface IntegrationManifest {
  /** Unique domain identifier */
  domain: string;
  /** Human-readable name */
  name: string;
  /** Semver version */
  version: string;
  /** Other domains that must load before this one */
  dependencies?: string[];
  /** npm packages required */
  requirements?: string[];
  iot_class?: IotClass;
  /** Whether config flow UI is supported */
  config_flow?: boolean;
}

/** Per-platform configuration within an integration */
export interface PlatformConfig {
  name: string;
  entities?: EntityConfig[];
  [key: string]: unknown;
}

/** Entity configuration from configuration.yaml */
export interface EntityConfig {
  entity_id: string;
  name?: string;
  [key: string]: unknown;
}

/** Full integration configuration block from configuration.yaml */
export interface IntegrationConfig {
  domain: string;
  platforms?: PlatformConfig[];
  [key: string]: unknown;
}

/**
 * Interface all integrations must implement.
 * Mirrors HA's component setup pattern with extended lifecycle hooks.
 */
export interface HaIntegration {
  readonly manifest: IntegrationManifest;

  /**
   * Called once when the integration loads.
   * Should register entities, services, and event listeners.
   * @returns true if setup succeeded, false to mark as failed
   */
  setup(config: IntegrationConfig): Promise<boolean>;

  /**
   * Called after ALL integrations have finished loading.
   * Use for cross-integration communication, MQTT discovery,
   * or any initialization that depends on other integrations.
   */
  on_start?(): Promise<void>;

  /**
   * Called when this integration's configuration changes at runtime
   * (e.g. via the Integrations UI save).
   * The integration should re-register entities and services as needed.
   */
  on_config_change?(config: IntegrationConfig): Promise<void>;

  /**
   * Called during application shutdown.
   * Clean up listeners, close connections, etc.
   */
  teardown(): Promise<void>;

  /**
   * Called when the system is about to shut down, right before teardown.
   * Use for fast clean-up like closing sockets or flushing buffers.
   */
  on_stop?(): Promise<void>;
}
