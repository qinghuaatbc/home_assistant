import { Injectable, Logger } from '@nestjs/common';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../../core/service-registry/service-registry.service';
import { EntityRegistryService } from '../../../registry/entity-registry/entity-registry.service';
import { ContextService } from '../../../core/context/context.service';
import { HaIntegration, IntegrationConfig, IntegrationManifest } from '../../interfaces/integration.interface';
import { NestThermostatClientService, NestThermostatState } from './nest-thermostat-client.service';
import { NEST_DOMAIN } from './nest-thermostat.constants';

@Injectable()
export class NestThermostatIntegration implements HaIntegration {
  private readonly logger = new Logger(NestThermostatIntegration.name);
  readonly manifest: IntegrationManifest = {
    domain: NEST_DOMAIN,
    name: 'Google Nest Thermostat',
    version: '1.0.0',
    iot_class: 'cloud_polling',
    config_flow: true,
  };

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private deviceMap = new Map<string, string>(); // entityId → deviceId

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
    private readonly client: NestThermostatClientService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const { project_id, client_id, client_secret, refresh_token, poll_interval } = config as any;
    if (!project_id || !client_id || !client_secret || !refresh_token) {
      this.logger.error('Nest thermostat: missing required credentials');
      return false;
    }

    this.client.configure({ project_id, client_id, client_secret, refresh_token, poll_interval });

    let thermostats: NestThermostatState[];
    try {
      thermostats = await this.client.listThermostats();
    } catch (err: any) {
      this.logger.error(`Nest thermostat: failed to connect — ${err.message}`);
      return false;
    }

    if (thermostats.length === 0) {
      this.logger.warn('Nest thermostat: no thermostats found in project');
      return false;
    }

    this.logger.log(`Nest thermostat: found ${thermostats.length} thermostat(s)`);

    for (const t of thermostats) {
      const slug = t.displayName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const entityId = `climate.nest_${slug}`;
      this.deviceMap.set(entityId, t.deviceId);

      await this.entityRegistry.registerEntity({
        entity_id: entityId,
        platform: NEST_DOMAIN,
        name: t.displayName,
        original_name: t.displayName,
        unique_id: `nest_${t.deviceId.split('/').pop()}`,
        device_class: 'thermostat',
      });

      this.pushState(entityId, t);
    }

    this.registerServices();
    this.startPolling(Number(poll_interval ?? 60));
    return true;
  }

  private pushState(entityId: string, t: NestThermostatState) {
    const setpoint = t.hvacMode === 'cool' ? t.setpointCool : t.setpointHeat;
    this.stateMachine.setState(
      entityId,
      t.hvacMode,
      {
        friendly_name: t.displayName,
        current_temperature: Math.round(t.currentTemp * 10) / 10,
        temperature: setpoint != null ? Math.round(setpoint * 10) / 10 : null,
        target_temp_high: t.setpointCool != null ? Math.round(t.setpointCool * 10) / 10 : null,
        target_temp_low: t.setpointHeat != null ? Math.round(t.setpointHeat * 10) / 10 : null,
        hvac_action: t.hvacAction,
        hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
        humidity: t.humidity,
        min_temp: 10,
        max_temp: 35,
        temperature_unit: '°C',
        device_class: 'thermostat',
        supported_features: 1,
      },
      this.contextService.system(),
    );
  }

  private registerServices() {
    this.serviceRegistry.register({
      domain: 'climate',
      service: 'set_temperature',
      name: 'Set temperature',
      description: 'Set target temperature',
      fields: { temperature: { description: 'Target temperature in °C', example: 21 } },
      target: { entity: true },
      handler: async (call) => {
        const temp = Number(call.service_data?.temperature);
        for (const eid of this.resolveEntities(call.target?.entity_id)) {
          const deviceId = this.deviceMap.get(eid);
          if (!deviceId) continue;
          const state = this.stateMachine.getState(eid);
          const mode = state?.state ?? 'heat';
          try {
            await this.client.setTemperature(deviceId, temp, mode);
            await this.refreshEntity(eid, deviceId);
          } catch (e: any) {
            this.logger.error(`set_temperature failed for ${eid}: ${e.message}`);
          }
        }
      },
    });

    this.serviceRegistry.register({
      domain: 'climate',
      service: 'set_hvac_mode',
      name: 'Set HVAC mode',
      description: 'Set heating/cooling mode',
      fields: { hvac_mode: { description: 'Mode: off, heat, cool, heat_cool', example: 'heat' } },
      target: { entity: true },
      handler: async (call) => {
        const mode = String(call.service_data?.hvac_mode ?? 'off');
        for (const eid of this.resolveEntities(call.target?.entity_id)) {
          const deviceId = this.deviceMap.get(eid);
          if (!deviceId) continue;
          try {
            await this.client.setMode(deviceId, mode);
            await this.refreshEntity(eid, deviceId);
          } catch (e: any) {
            this.logger.error(`set_hvac_mode failed for ${eid}: ${e.message}`);
          }
        }
      },
    });
  }

  private resolveEntities(target: string | string[] | undefined): string[] {
    if (!target) return [...this.deviceMap.keys()];
    return Array.isArray(target) ? target : [target];
  }

  private async refreshEntity(entityId: string, deviceId: string) {
    const thermostats = await this.client.listThermostats();
    const t = thermostats.find(x => x.deviceId === deviceId);
    if (t) this.pushState(entityId, t);
  }

  private startPolling(intervalSecs: number) {
    const ms = Math.max(30, intervalSecs) * 1000;
    this.pollInterval = setInterval(async () => {
      try {
        const thermostats = await this.client.listThermostats();
        for (const t of thermostats) {
          const eid = [...this.deviceMap.entries()].find(([, id]) => id === t.deviceId)?.[0];
          if (eid) this.pushState(eid, t);
        }
      } catch (e: any) {
        this.logger.warn(`Nest poll failed: ${e.message}`);
      }
    }, ms);
    this.logger.log(`Nest thermostat: polling every ${intervalSecs}s`);
  }

  async teardown(): Promise<void> {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
  }
}
