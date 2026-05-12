import { Injectable, Logger } from '@nestjs/common';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../../core/service-registry/service-registry.service';
import { ServiceCall } from '../../../core/service-registry/interfaces/ha-service.interface';
import { EntityRegistryService } from '../../../registry/entity-registry/entity-registry.service';
import { ContextService } from '../../../core/context/context.service';
import { HaIntegration, IntegrationConfig, IntegrationManifest } from '../../interfaces/integration.interface';

const DEMO_ENTITIES: Array<{ entity_id: string; name: string; type: string; attrs?: Record<string, unknown> }> = [
  { entity_id: 'light.demo_living_room', name: 'Living Room Light', type: 'light' },
  { entity_id: 'light.demo_bedroom', name: 'Bedroom Light', type: 'light' },
  { entity_id: 'light.demo_kitchen', name: 'Kitchen Light', type: 'light' },
  { entity_id: 'light.demo_kitchen_light', name: 'Kitchen Ceiling', type: 'light' },
  { entity_id: 'light.demo_dining_light', name: 'Dining Room Light', type: 'light' },
  { entity_id: 'light.demo_office_light', name: 'Office Light', type: 'light' },
  { entity_id: 'switch.demo_fan', name: 'Living Room Fan', type: 'switch' },
  { entity_id: 'switch.demo_tv', name: 'TV Switch', type: 'switch' },
  { entity_id: 'switch.demo_alarm_siren', name: 'Alarm Siren', type: 'switch' },
  { entity_id: 'binary_sensor.demo_front_door', name: 'Front Door', type: 'binary_sensor', attrs: { device_class: 'door' } },
  { entity_id: 'binary_sensor.demo_back_door', name: 'Back Door', type: 'binary_sensor', attrs: { device_class: 'door' } },
  { entity_id: 'binary_sensor.demo_patio_door', name: 'Patio Door', type: 'binary_sensor', attrs: { device_class: 'door' } },
  { entity_id: 'binary_sensor.demo_garage_door', name: 'Garage Door', type: 'binary_sensor', attrs: { device_class: 'garage_door', glb_floor: 1 } },
  { entity_id: 'binary_sensor.demo_motion', name: 'Motion Sensor', type: 'binary_sensor', attrs: { device_class: 'motion' } },
  { entity_id: 'binary_sensor.demo_living_room_curtain', name: 'Living Room Curtain', type: 'binary_sensor', attrs: { device_class: 'curtain', glb_floor: 1, glb_pos: [5, -2] } },
  { entity_id: 'sensor.demo_temperature', name: 'Temperature', type: 'sensor', attrs: { unit_of_measurement: '°C', device_class: 'temperature' } },
  { entity_id: 'sensor.demo_humidity', name: 'Humidity', type: 'sensor', attrs: { unit_of_measurement: '%', device_class: 'humidity' } },
  { entity_id: 'media_player.demo_living_room_speaker', name: 'Living Room Speaker', type: 'media_player' },
  { entity_id: 'media_player.demo_bedroom_speaker', name: 'Bedroom Speaker', type: 'media_player' },
];

@Injectable()
export class DemoIntegration implements HaIntegration {
  private readonly logger = new Logger(DemoIntegration.name);
  readonly manifest: IntegrationManifest = { domain: 'demo', name: 'Demo', version: '1.0.0' };

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const selected = (config.entities as Array<{ entity_id: string }>) || DEMO_ENTITIES;
    const entities = selected.length > 0 ? selected : DEMO_ENTITIES;

    for (const e of entities) {
      const full = DEMO_ENTITIES.find(d => d.entity_id === e.entity_id) || e as any;

      await this.entityRegistry.registerEntity({
        entity_id: full.entity_id,
        platform: 'demo',
        name: full.name,
        original_name: full.name,
      });

      await this.stateMachine.setState(
        full.entity_id,
        full.type === 'binary_sensor' ? 'off' : 'off',
        {
          friendly_name: full.name,
          ...(full.attrs || {}),
        },
        this.contextService.system(),
      );
    }

    this.registerServices();
    this.logger.log(`Demo: ${entities.length} entities loaded`);
    return true;
  }

  private registerServices() {
    const handler = async (call: ServiceCall) => {
      const ids = call.target?.entity_id
        ? (Array.isArray(call.target.entity_id) ? call.target.entity_id : [call.target.entity_id])
        : []
      const stateMap: Record<string, string | undefined> = {
        turn_on: 'on', turn_off: 'off', toggle: undefined,
        open_cover: 'open', close_cover: 'closed', stop_cover: 'stopped',
        lock: 'locked', unlock: 'unlocked',
      }
      const state = stateMap[call.service]
      for (const eid of ids) {
        const cur = this.stateMachine.getState(eid)
        if (!cur) continue
        if (state) {
          const attrs: Record<string, unknown> = { ...cur.attributes }
          if (call.service_data?.brightness != null) attrs.brightness = call.service_data.brightness
          if (call.service_data?.volume_level != null) attrs.volume_level = call.service_data.volume_level
          this.stateMachine.setState(eid, state, attrs, call.context)
        } else if (call.service === 'toggle') {
          this.stateMachine.setState(eid, cur.state === 'on' ? 'off' : 'on', cur.attributes as any, call.context)
        }
      }
    }
    for (const domain of ['light', 'switch', 'media_player', 'binary_sensor']) {
      this.serviceRegistry.register({
        domain, service: 'turn_on', name: 'Turn on', description: 'Turn on', fields: {}, handler, target: { entity: true },
      })
      this.serviceRegistry.register({
        domain, service: 'turn_off', name: 'Turn off', description: 'Turn off', fields: {}, handler, target: { entity: true },
      })
    }
    this.serviceRegistry.register({
      domain: 'light', service: 'toggle', name: 'Toggle', description: 'Toggle', fields: {}, handler, target: { entity: true },
    })
    this.logger.log('Demo: registered service handlers (light/switch/media_player/binary_sensor)')
  }

  async teardown(): Promise<void> {}
}
