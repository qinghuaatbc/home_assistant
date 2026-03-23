import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { EntityRegistryService } from '../../../registry/entity-registry/entity-registry.service';
import { ContextService } from '../../../core/context/context.service';
import {
  HaIntegration,
  IntegrationConfig,
  IntegrationManifest,
} from '../../interfaces/integration.interface';
import {
  DOMAIN_WEATHER,
  WMO_TO_CONDITION,
  WMO_DESCRIPTION,
} from './weather.constants';

interface WeatherConfig extends IntegrationConfig {
  /**
   * City name to look up automatically, e.g. "Vancouver, BC" or "Tokyo".
   * If provided, latitude/longitude are resolved via Open-Meteo geocoding.
   * You can always override with explicit latitude/longitude below.
   */
  city?: string;
  /** Optional: explicit latitude (skips geocoding when both are set) */
  latitude?: number;
  /** Optional: explicit longitude (skips geocoding when both are set) */
  longitude?: number;
  /** Temperature unit: celsius | fahrenheit (default: celsius) */
  temperature_unit?: 'celsius' | 'fahrenheit';
  /** Wind speed unit: kmh | mph | ms (default: kmh) */
  wind_speed_unit?: 'kmh' | 'mph' | 'ms';
  /** Polling interval in seconds (default: 600 = 10 min) */
  scan_interval?: number;
}

/** Resolved, fully-populated config used at runtime */
interface ResolvedWeatherConfig {
  displayName: string;
  latitude: number;
  longitude: number;
  temperature_unit: 'celsius' | 'fahrenheit';
  wind_speed_unit: 'kmh' | 'mph' | 'ms';
  scan_interval: number;
}

interface OpenMeteoCurrentWeather {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  precipitation: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  weather_code: number;
  is_day: number;
}

interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string; // state/province
}

@Injectable()
export class WeatherIntegration implements HaIntegration {
  private readonly logger = new Logger(WeatherIntegration.name);

  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_WEATHER,
    name: 'Weather (Open-Meteo)',
    version: '1.0.0',
    iot_class: 'cloud_polling',
    requirements: ['axios'],
  };

  private resolved: ResolvedWeatherConfig | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    const cfg = config as WeatherConfig;

    // Resolve coordinates: geocode city name, or use explicit lat/lon
    let lat = cfg.latitude;
    let lon = cfg.longitude;
    let displayName = cfg.city ?? 'Home';

    if (lat === undefined || lon === undefined) {
      if (!cfg.city) {
        this.logger.error('Weather: provide either city or latitude+longitude');
        return false;
      }
      const geo = await this.geocode(cfg.city);
      if (!geo) {
        this.logger.error(`Weather: could not geocode city "${cfg.city}"`);
        return false;
      }
      lat = geo.latitude;
      lon = geo.longitude;
      // Build a nice display name from geocoding result
      displayName = geo.admin1
        ? `${geo.name}, ${geo.admin1}`
        : `${geo.name}, ${geo.country}`;
      // Let user-supplied city override the display name if they want a custom label
      if (cfg.city) displayName = cfg.city;
      this.logger.log(`Geocoded "${cfg.city}" → ${displayName} (${lat}, ${lon})`);
    }

    this.resolved = {
      displayName,
      latitude: lat,
      longitude: lon,
      temperature_unit: cfg.temperature_unit ?? 'celsius',
      wind_speed_unit: cfg.wind_speed_unit ?? 'kmh',
      scan_interval: cfg.scan_interval ?? 600,
    };

    const entityId = this.buildEntityId(displayName);

    await this.entityRegistry.registerEntity({
      entity_id: entityId,
      platform: DOMAIN_WEATHER,
      name: displayName,
      original_name: displayName,
      unique_id: `weather_${lat}_${lon}`,
    });

    await this.fetchAndUpdate(entityId);

    const intervalMs = this.resolved.scan_interval * 1000;
    this.pollTimer = setInterval(
      () => this.fetchAndUpdate(entityId),
      intervalMs,
    ) as unknown as NodeJS.Timeout;

    this.logger.log(
      `Weather set up for ${displayName} (${lat}, ${lon}), ` +
      `polling every ${this.resolved.scan_interval}s`,
    );
    return true;
  }

  async teardown(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer as unknown as number);
      this.pollTimer = null;
    }
    this.logger.log('Weather integration teardown complete');
  }

  // ── Geocoding ───────────────────────────────────────────────────────────────

  private async geocode(city: string): Promise<GeocodingResult | null> {
    // The geocoding API only accepts a bare city name — strip region/country suffix
    // e.g. "Vancouver, BC" → "Vancouver", "New York, NY" → "New York"
    const searchName = city.split(',')[0].trim();
    try {
      const res = await axios.get<{ results?: GeocodingResult[] }>(
        'https://geocoding-api.open-meteo.com/v1/search',
        {
          params: { name: searchName, count: 1, language: 'en', format: 'json' },
          timeout: 10000,
        },
      );
      const result = res.data.results?.[0] ?? null;
      if (!result) this.logger.warn(`Geocoding: no results for "${searchName}"`);
      return result;
    } catch (err: unknown) {
      this.logger.warn(`Geocoding failed for "${searchName}": ${(err as Error).message}`);
      return null;
    }
  }

  // ── Weather fetch ───────────────────────────────────────────────────────────

  private async fetchAndUpdate(entityId: string): Promise<void> {
    const r = this.resolved!;

    try {
      const res = await axios.get<{
        current: OpenMeteoCurrentWeather;
        current_units: Record<string, string>;
      }>('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: r.latitude,
          longitude: r.longitude,
          current: [
            'temperature_2m',
            'apparent_temperature',
            'relative_humidity_2m',
            'precipitation',
            'wind_speed_10m',
            'wind_direction_10m',
            'weather_code',
            'is_day',
          ].join(','),
          temperature_unit: r.temperature_unit,
          wind_speed_unit: r.wind_speed_unit,
          timezone: 'auto',
        },
        timeout: 10000,
      });

      const c = res.data.current;
      const units = res.data.current_units;
      const weatherCode = c.weather_code ?? 0;
      const condition = WMO_TO_CONDITION[weatherCode] ?? 'exceptional';
      const description = WMO_DESCRIPTION[weatherCode] ?? 'Unknown';

      this.stateMachine.setState(
        entityId,
        condition,
        {
          friendly_name: r.displayName,
          temperature: c.temperature_2m,
          feels_like: c.apparent_temperature,
          humidity: c.relative_humidity_2m,
          precipitation: c.precipitation,
          wind_speed: c.wind_speed_10m,
          wind_direction: c.wind_direction_10m,
          weather_code: weatherCode,
          description,
          is_day: c.is_day === 1,
          temperature_unit: units['temperature_2m'] ?? '°C',
          wind_speed_unit: units['wind_speed_10m'] ?? 'km/h',
          latitude: r.latitude,
          longitude: r.longitude,
        },
        this.contextService.system(),
      );

      this.logger.debug(
        `Weather updated: ${r.displayName} → ${condition} ${c.temperature_2m}${units['temperature_2m']}`,
      );
    } catch (err: unknown) {
      this.logger.warn(`Weather fetch failed for ${r.displayName}: ${(err as Error).message}`);
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  private buildEntityId(location: string): string {
    const slug = location
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    return `${DOMAIN_WEATHER}.${slug}`;
  }
}
