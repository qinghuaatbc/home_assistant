import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBusService } from '../core/event-bus/event-bus.service';
import { ContextService } from '../core/context/context.service';
import { HaIntegration, IntegrationConfig } from './interfaces/integration.interface';
import { LightIntegration } from './built-in/light/light.integration';
import { SwitchIntegration } from './built-in/switch/switch.integration';
import { SensorIntegration } from './built-in/sensor/sensor.integration';
import { BinarySensorIntegration } from './built-in/binary-sensor/binary-sensor.integration';
import { Isy994Integration } from './built-in/isy994/isy994.integration';
import { WeatherIntegration } from './built-in/weather/weather.integration';
import { YamahaAvrIntegration } from './built-in/yamaha-avr/yamaha-avr.integration';
import { LutronCasetaIntegration } from './built-in/lutron-caseta/lutron-caseta.integration';
import { MqttIntegration } from './built-in/mqtt/mqtt.integration';
import { CameraIntegration } from './built-in/camera/camera.integration';
import { AutomationIntegration } from '../automations/automation.integration';
import { DemoIntegration } from './built-in/demo/demo.integration';
import { EnvisalinkIntegration } from './built-in/envisalink/envisalink.integration';
import {
  EVENT_HOMEASSISTANT_START,
  EVENT_COMPONENT_LOADED,
} from '../common/constants/events.constants';

export interface IntegrationStatus {
  domain: string;
  status: 'loaded' | 'failed' | 'loading';
  error?: string;
}

/**
 * The Integration Loader manages the lifecycle of all integrations.
 *
 * On startup:
 * 1. Listens for homeassistant_start event
 * 2. Reads integration config from configuration.yaml
 * 3. Loads integrations in dependency order
 * 4. Calls setup() on each integration
 * 5. Fires component_loaded event on success
 *
 * On shutdown:
 * 6. Calls teardown() on all loaded integrations in reverse order
 */
@Injectable()
export class IntegrationLoaderService implements OnApplicationShutdown {
  private readonly logger = new Logger(IntegrationLoaderService.name);

  /** Loaded integrations in load order */
  private readonly loadedIntegrations: HaIntegration[] = [];
  private readonly integrationStatuses = new Map<string, IntegrationStatus>();

  /** Registry of built-in integrations by domain */
  private readonly builtInRegistry = new Map<string, HaIntegration>();

  constructor(
    private readonly configService: ConfigService,
    private readonly eventBus: EventBusService,
    private readonly contextService: ContextService,
    lightIntegration: LightIntegration,
    switchIntegration: SwitchIntegration,
    sensorIntegration: SensorIntegration,
    binarySensorIntegration: BinarySensorIntegration,
    isy994Integration: Isy994Integration,
    weatherIntegration: WeatherIntegration,
    yamahaAvrIntegration: YamahaAvrIntegration,
    lutronCasetaIntegration: LutronCasetaIntegration,
    mqttIntegration: MqttIntegration,
    cameraIntegration: CameraIntegration,
    automationIntegration: AutomationIntegration,
    demoIntegration: DemoIntegration,
    envisalinkIntegration: EnvisalinkIntegration,
  ) {
    this.builtInRegistry.set('light', lightIntegration);
    this.builtInRegistry.set('switch', switchIntegration);
    this.builtInRegistry.set('sensor', sensorIntegration);
    this.builtInRegistry.set('binary_sensor', binarySensorIntegration);
    this.builtInRegistry.set('isy994', isy994Integration);
    this.builtInRegistry.set('weather', weatherIntegration);
    this.builtInRegistry.set('yamaha_avr', yamahaAvrIntegration);
    this.builtInRegistry.set('lutron_caseta', lutronCasetaIntegration);
    this.builtInRegistry.set('mqtt', mqttIntegration);
    this.builtInRegistry.set('camera', cameraIntegration);
    this.builtInRegistry.set('automation', automationIntegration);
    this.builtInRegistry.set('demo', demoIntegration);
    this.builtInRegistry.set('envisalink', envisalinkIntegration);
  }

  /**
   * Start loading integrations. Called after HomeAssistant start event.
   */
  async loadIntegrations(): Promise<void> {
    const integrationConfigs: IntegrationConfig[] =
      this.configService.get('integrations') ?? [];

    this.logger.log(
      `Loading ${integrationConfigs.length} integrations: ${integrationConfigs.map((c) => c.domain).join(', ')}`,
    );

    for (const config of integrationConfigs) {
      await this.loadIntegration(config);
    }

    const loaded = Array.from(this.integrationStatuses.values()).filter(
      (s) => s.status === 'loaded',
    ).length;
    const failed = Array.from(this.integrationStatuses.values()).filter(
      (s) => s.status === 'failed',
    ).length;

    this.logger.log(
      `Integration loading complete: ${loaded} loaded, ${failed} failed`,
    );
  }

  /**
   * Load a single integration.
   */
  private async loadIntegration(config: IntegrationConfig): Promise<void> {
    const { domain } = config;

    this.integrationStatuses.set(domain, { domain, status: 'loading' });
    this.logger.debug(`Loading integration: ${domain}`);

    try {
      const integration = this.builtInRegistry.get(domain);

      if (!integration) {
        throw new Error(`Integration '${domain}' not found in built-in registry`);
      }

      const success = await integration.setup(config);

      if (!success) {
        throw new Error(`Integration '${domain}' setup returned false`);
      }

      this.loadedIntegrations.push(integration);
      this.integrationStatuses.set(domain, { domain, status: 'loaded' });

      this.eventBus.fire(
        EVENT_COMPONENT_LOADED,
        { component: domain },
        this.contextService.system(),
      );

      this.logger.log(`Integration loaded: ${domain}`);
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(
        `Failed to load integration '${domain}': ${error.message}`,
      );
      this.integrationStatuses.set(domain, {
        domain,
        status: 'failed',
        error: error.message,
      });
      // Non-fatal: continue loading other integrations
    }
  }

  /**
   * Get status of all integrations.
   */
  getStatuses(): IntegrationStatus[] {
    return Array.from(this.integrationStatuses.values());
  }

  /**
   * Application shutdown: teardown all integrations in reverse order.
   */
  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Shutting down integrations...');
    const reversed = [...this.loadedIntegrations].reverse();

    for (const integration of reversed) {
      try {
        await integration.teardown();
        this.logger.debug(`Integration teardown: ${integration.manifest.domain}`);
      } catch (err: unknown) {
        const error = err as Error;
        this.logger.error(
          `Error during teardown of ${integration.manifest.domain}: ${error.message}`,
        );
      }
    }
  }
}
