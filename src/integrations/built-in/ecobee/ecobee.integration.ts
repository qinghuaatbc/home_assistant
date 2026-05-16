import { Injectable, Logger } from '@nestjs/common';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../../core/service-registry/service-registry.service';
import { EntityRegistryService } from '../../../registry/entity-registry/entity-registry.service';
import { ContextService } from '../../../core/context/context.service';
import { HaIntegration, IntegrationConfig, IntegrationManifest } from '../../interfaces/integration.interface';
import { EcobeeClientService, EcobeeThermostatState } from './ecobee-client.service';
import { ECOBEE_DOMAIN } from './ecobee.constants';

@Injectable()
export class EcobeeIntegration implements HaIntegration {
  private readonly logger = new Logger(EcobeeIntegration.name);
  readonly manifest: IntegrationManifest = {
    domain: ECOBEE_DOMAIN,
    name: 'Ecobee Thermostat',
    version: '1.0.0',
    iot_class: 'cloud_polling',
    config_flow: true,
  };

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private deviceMap = new Map<string, string>(); // entityId → identifier

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
    private readonly client: EcobeeClientService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const { api_key, refresh_token, poll_interval } = config as any;
    if (!api_key || !refresh_token) {
      this.logger.error('Ecobee: missing api_key or refresh_token');
      return false;
    }

    this.client.configure({ api_key, refresh_token, poll_interval });

    let thermostats: EcobeeThermostatState[];
    try {
      thermostats = await this.client.listThermostats();
    } catch (err: any) {
      this.logger.error(`Ecobee: connection failed — ${err.message}`);
      return false;
    }

    if (thermostats.length === 0) {
      this.logger.warn('Ecobee: no thermostats found');
      return false;
    }

    this.logger.log(`Ecobee: found ${thermostats.length} thermostat(s)`);

    for (const t of thermostats) {
      const slug = t.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const entityId = `climate.ecobee_${slug}`;
      this.deviceMap.set(entityId, t.identifier);

      await this.entityRegistry.registerEntity({
        entity_id: entityId,
        platform: ECOBEE_DOMAIN,
        name: t.name,
        original_name: t.name,
        unique_id: `ecobee_${t.identifier}`,
        device_class: 'thermostat',
      });

      this.pushState(entityId, t);
    }

    this.registerServices();
    this.startPolling(Number(poll_interval ?? 180));
    return true;
  }

  private pushState(entityId: string, t: EcobeeThermostatState) {
    const setpoint = t.hvacMode === 'cool' ? t.setpointCool : t.setpointHeat;
    this.stateMachine.setState(
      entityId,
      t.hvacMode,
      {
        friendly_name: t.name,
        current_temperature: t.currentTemp,
        temperature: setpoint,
        target_temp_high: t.setpointCool,
        target_temp_low: t.setpointHeat,
        hvac_action: t.hvacAction,
        hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
        humidity: t.humidity,
        min_temp: 7,
        max_temp: 33,
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
      description: 'Set Ecobee target temperature',
      fields: { temperature: { description: 'Target temperature °C', example: 21 } },
      target: { entity: true },
      handler: async (call) => {
        const temp = Number(call.service_data?.temperature);
        for (const eid of this.resolveEntities(call.target?.entity_id)) {
          const id = this.deviceMap.get(eid);
          if (!id) continue;
          const mode = this.stateMachine.getState(eid)?.state ?? 'heat';
          try {
            await this.client.setTemperature(id, temp, mode);
            await this.refreshEntity(eid, id);
          } catch (e: any) { this.logger.error(`set_temperature ${eid}: ${e.message}`); }
        }
      },
    });

    this.serviceRegistry.register({
      domain: 'climate',
      service: 'set_hvac_mode',
      name: 'Set HVAC mode',
      description: 'Set Ecobee heating/cooling mode',
      fields: { hvac_mode: { description: 'off | heat | cool | heat_cool', example: 'heat' } },
      target: { entity: true },
      handler: async (call) => {
        const mode = String(call.service_data?.hvac_mode ?? 'off');
        for (const eid of this.resolveEntities(call.target?.entity_id)) {
          const id = this.deviceMap.get(eid);
          if (!id) continue;
          try {
            await this.client.setMode(id, mode);
            await this.refreshEntity(eid, id);
          } catch (e: any) { this.logger.error(`set_hvac_mode ${eid}: ${e.message}`); }
        }
      },
    });
  }

  private resolveEntities(target: string | string[] | undefined): string[] {
    if (!target) return [...this.deviceMap.keys()];
    return Array.isArray(target) ? target : [target];
  }

  private async refreshEntity(entityId: string, identifier: string) {
    const all = await this.client.listThermostats();
    const t = all.find(x => x.identifier === identifier);
    if (t) this.pushState(entityId, t);
  }

  private startPolling(intervalSecs: number) {
    const ms = Math.max(60, intervalSecs) * 1000;
    this.pollInterval = setInterval(async () => {
      try {
        const all = await this.client.listThermostats();
        for (const t of all) {
          const eid = [...this.deviceMap.entries()].find(([, id]) => id === t.identifier)?.[0];
          if (eid) this.pushState(eid, t);
        }
      } catch (e: any) { this.logger.warn(`Ecobee poll: ${e.message}`); }
    }, ms);
    this.logger.log(`Ecobee: polling every ${intervalSecs}s`);
  }

  async teardown(): Promise<void> {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
  }
}
