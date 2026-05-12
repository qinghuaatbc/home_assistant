import { Logger } from '@nestjs/common';

const MANIFEST = {
  domain: 'weather_station',
  name: 'Weather Station',
  version: '1.0.0',
};

interface StationConfig {
  name?: string;
  host?: string;
  port?: number;
  interval_seconds?: number;
}

interface WeatherData {
  temperature?: number;
  humidity?: number;
  wind_speed?: number;
  wind_direction?: string;
  pressure?: number;
  rain?: number;
}

export async function create(config: any, services: any) {
  const logger = new Logger('WeatherStation');
  const cfg: StationConfig = {
    name: 'Weather Station',
    host: 'localhost',
    port: 8080,
    interval_seconds: 60,
    ...config,
  };

  const { stateMachine, entityRegistry, contextService } = services;
  const baseUrl = `http://${cfg.host}:${cfg.port}`;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const entityIds: string[] = [];

  async function fetchWeather(): Promise<WeatherData | null> {
    try {
      // Replace with your real HTTP API:
      // const res = await fetch(`${baseUrl}/api/v1/weather`);
      // return await res.json();

      // Demo: simulate realistic data
      return {
        temperature: +(15 + Math.random() * 20).toFixed(1),
        humidity: +(40 + Math.random() * 40).toFixed(0),
        wind_speed: +(Math.random() * 30).toFixed(1),
        wind_direction: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)],
        pressure: +(990 + Math.random() * 40).toFixed(0),
        rain: +(Math.random() * 5).toFixed(1),
      };
    } catch (err: any) {
      logger.warn(`Poll failed: ${err.message}`);
      return null;
    }
  }

  async function updateStates(data: WeatherData) {
    for (const eid of entityIds) {
      const cur = stateMachine.getState(eid);
      if (!cur) continue;

      let value: string | null = null;
      if (eid.endsWith('_temperature')) value = String(data.temperature ?? 'unavailable');
      else if (eid.endsWith('_humidity')) value = String(data.humidity ?? 'unavailable');
      else if (eid.endsWith('_wind_speed')) value = String(data.wind_speed ?? 'unavailable');
      else if (eid.endsWith('_wind_direction')) value = data.wind_direction ?? 'unavailable';
      else if (eid.endsWith('_pressure')) value = String(data.pressure ?? 'unavailable');
      else if (eid.endsWith('_rain')) value = String(data.rain ?? 'unavailable');

      if (value !== null) {
        stateMachine.setState(eid, value, { ...cur.attributes, last_poll: new Date().toISOString() }, contextService.system());
      }
    }
  }

  return {
    manifest: MANIFEST,

    async setup(integrationConfig: any) {
      logger.log(`Setting up: ${cfg.name}`);

      const slug = cfg.name!.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

      const sensors = [
        { id: `${slug}_temperature`, name: `${cfg.name} Temperature`, unit: '°C', dc: 'temperature' },
        { id: `${slug}_humidity`, name: `${cfg.name} Humidity`, unit: '%', dc: 'humidity' },
        { id: `${slug}_wind_speed`, name: `${cfg.name} Wind Speed`, unit: 'km/h', dc: 'wind_speed' },
        { id: `${slug}_wind_direction`, name: `${cfg.name} Wind Direction`, unit: '', dc: undefined },
        { id: `${slug}_pressure`, name: `${cfg.name} Pressure`, unit: 'hPa', dc: 'pressure' },
        { id: `${slug}_rain`, name: `${cfg.name} Rain`, unit: 'mm', dc: undefined },
      ];

      for (const s of sensors) {
        const entityId = `sensor.${s.id}`;
        await entityRegistry.registerEntity({
          entity_id: entityId,
          platform: 'weather_station',
          name: s.name,
          original_name: s.name,
        });
        await stateMachine.setState(entityId, 'unknown', {
          friendly_name: s.name,
          unit_of_measurement: s.unit,
          device_class: s.dc,
        }, contextService.system());
        entityIds.push(entityId);
        logger.log(`Entity: ${entityId}`);
      }

      // Initial poll
      const data = await fetchWeather();
      if (data) await updateStates(data);

      // Start polling
      intervalId = setInterval(async () => {
        const d = await fetchWeather();
        if (d) await updateStates(d);
      }, cfg.interval_seconds! * 1000);

      logger.log(`Polling every ${cfg.interval_seconds}s — ${entityIds.length} sensors`);
      return true;
    },

    async teardown() {
      if (intervalId) clearInterval(intervalId);
      logger.log('Teardown');
    },

    async on_start() {
      logger.log('on_start: system ready');
    },

    async on_config_change(newConfig: any) {
      logger.log('Config updated, restarting poll');
      if (intervalId) clearInterval(intervalId);
      Object.assign(cfg, newConfig);
      if (cfg.interval_seconds) {
        intervalId = setInterval(async () => {
          const d = await fetchWeather();
          if (d) await updateStates(d);
        }, cfg.interval_seconds * 1000);
      }
    },
  };
}
