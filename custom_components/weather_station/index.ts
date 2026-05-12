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

export async function create(config: any) {
  const logger = new Logger('WeatherStation');
  const cfg: StationConfig = {
    name: 'Weather Station',
    host: 'localhost',
    port: 8080,
    interval_seconds: 60,
    ...config,
  };

  const baseUrl = `http://${cfg.host}:${cfg.port}`;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let entityIds: string[] = [];
  let statesRef: any = null;
  let registryRef: any = null;
  let contextRef: any = null;

  /** Parse mock sensor data — in production, call your real API */
  async function fetchWeather(): Promise<WeatherData | null> {
    try {
      // Real HTTP polling – replace URL with your device API
      // const res = await fetch(`${baseUrl}/api/v1/weather`);
      // return await res.json();

      // Demo: simulate realistic random data
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

  /** Update all entity states with latest data */
  async function updateStates(data: WeatherData) {
    if (!statesRef || !contextRef) return;
    for (const eid of entityIds) {
      const cur = statesRef.getState(eid);
      if (!cur) continue;

      // Map entity_id to the right sensor value
      let value: string | null = null;
      if (eid.endsWith('_temperature')) value = String(data.temperature ?? 'unavailable');
      else if (eid.endsWith('_humidity')) value = String(data.humidity ?? 'unavailable');
      else if (eid.endsWith('_wind_speed')) value = String(data.wind_speed ?? 'unavailable');
      else if (eid.endsWith('_wind_direction')) value = data.wind_direction ?? 'unavailable';
      else if (eid.endsWith('_pressure')) value = String(data.pressure ?? 'unavailable');
      else if (eid.endsWith('_rain')) value = String(data.rain ?? 'unavailable');

      if (value !== null) {
        statesRef.setState(eid, value, { ...cur.attributes, last_poll: new Date().toISOString() }, contextRef.system());
      }
    }
  }

  return {
    manifest: MANIFEST,

    async setup(integrationConfig: any) {
      logger.log(`Setting up: ${cfg.name} → ${baseUrl}`);

      // Access core services through the NestJS DI container
      // In a real plugin you would receive these via constructor injection.
      // Here we locate them from the global module.
      const app = (global as any).__NEST_APP__;
      if (!app) {
        logger.warn('NestJS app not found on global scope – polling will be disabled');
        return true;
      }

      statesRef = app.get('StateMachineService');
      registryRef = app.get('EntityRegistryService');
      contextRef = app.get('ContextService');
      const slug = cfg.name!.toLowerCase().replace(/\s+/g, '_');

      const sensors = [
        { id: `${slug}_temperature`, name: `${cfg.name} Temperature`, unit: '°C', icon: 'mdi:thermometer' },
        { id: `${slug}_humidity`, name: `${cfg.name} Humidity`, unit: '%', icon: 'mdi:water-percent' },
        { id: `${slug}_wind_speed`, name: `${cfg.name} Wind Speed`, unit: 'km/h', icon: 'mdi:weather-windy' },
        { id: `${slug}_wind_direction`, name: `${cfg.name} Wind Direction`, unit: '', icon: 'mdi:compass' },
        { id: `${slug}_pressure`, name: `${cfg.name} Pressure`, unit: 'hPa', icon: 'mdi:thermometer-lines' },
        { id: `${slug}_rain`, name: `${cfg.name} Rain`, unit: 'mm', icon: 'mdi:weather-rainy' },
      ];

      for (const s of sensors) {
        const entityId = `sensor.${s.id}`;
        await registryRef.registerEntity({
          entity_id: entityId,
          platform: 'weather_station',
          name: s.name,
          original_name: s.name,
        });
        await statesRef.setState(entityId, 'unknown', {
          friendly_name: s.name,
          unit_of_measurement: s.unit,
          icon: s.icon,
          device_class: s.id.includes('temperature') ? 'temperature'
            : s.id.includes('humidity') ? 'humidity'
            : s.id.includes('pressure') ? 'pressure'
            : s.id.includes('wind') ? 'wind_speed' : undefined,
        }, contextRef.system());
        entityIds.push(entityId);
        logger.log(`Entity registered: ${entityId}`);
      }

      // Start polling
      const data = await fetchWeather();
      if (data) await updateStates(data);

      intervalId = setInterval(async () => {
        const d = await fetchWeather();
        if (d) await updateStates(d);
      }, cfg.interval_seconds! * 1000);

      logger.log(`Polling every ${cfg.interval_seconds}s`);
      return true;
    },

    async teardown() {
      if (intervalId) clearInterval(intervalId);
      logger.log('Teardown complete');
    },

    async on_start() {
      logger.log('System ready – all integrations loaded');
    },

    async on_config_change(newConfig: any) {
      logger.log(`Config changed, re-applying: ${JSON.stringify(newConfig)}`);
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
