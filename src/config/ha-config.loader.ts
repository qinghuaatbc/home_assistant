import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

/**
 * Loads Home Assistant configuration from configuration.yaml.
 * Called by NestJS ConfigModule during startup.
 *
 * Priority: environment variables > configuration.yaml defaults
 */
export default (): Record<string, unknown> => {
  const configPath =
    process.env.HA_CONFIG_PATH ??
    path.resolve(process.cwd(), 'config', 'configuration.yaml');

  let fileConfig: Record<string, unknown> = {};

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      fileConfig = yaml.parse(content) ?? {};
    } catch (err) {
      console.error(`Failed to parse configuration.yaml: ${(err as Error).message}`);
    }
  } else {
    console.warn(`configuration.yaml not found at: ${configPath}`);
  }

  // Apply environment variable overrides
  const config = {
    ...fileConfig,
    homeassistant: {
      name: process.env.HA_NAME ?? (fileConfig.homeassistant as Record<string, unknown>)?.name ?? 'Home',
      latitude: process.env.HA_LATITUDE ?? (fileConfig.homeassistant as Record<string, unknown>)?.latitude ?? 0,
      longitude: process.env.HA_LONGITUDE ?? (fileConfig.homeassistant as Record<string, unknown>)?.longitude ?? 0,
      elevation: Number(process.env.HA_ELEVATION ?? (fileConfig.homeassistant as Record<string, unknown>)?.elevation ?? 0),
      unit_system: process.env.HA_UNIT_SYSTEM ?? (fileConfig.homeassistant as Record<string, unknown>)?.unit_system ?? 'metric',
      time_zone: process.env.HA_TIME_ZONE ?? (fileConfig.homeassistant as Record<string, unknown>)?.time_zone ?? 'UTC',
      country: process.env.HA_COUNTRY ?? (fileConfig.homeassistant as Record<string, unknown>)?.country ?? 'US',
      currency: process.env.HA_CURRENCY ?? (fileConfig.homeassistant as Record<string, unknown>)?.currency ?? 'USD',
    },
    http: {
      port: Number(process.env.HA_HTTP_PORT ?? (fileConfig.http as Record<string, unknown>)?.port ?? 8123),
      cors_allowed_origins: (fileConfig.http as Record<string, unknown>)?.cors_allowed_origins ?? ['*'],
    },
    auth: {
      jwt_secret: process.env.HA_JWT_SECRET ?? (fileConfig.auth as Record<string, unknown>)?.jwt_secret ?? 'CHANGE_THIS_SECRET',
      jwt_expiry: process.env.HA_JWT_EXPIRY ?? (fileConfig.auth as Record<string, unknown>)?.jwt_expiry ?? '30m',
    },
    database: {
      type: process.env.HA_DB_TYPE ?? (fileConfig.database as Record<string, unknown>)?.type ?? 'better-sqlite3',
      database: process.env.HA_DB_PATH ?? (fileConfig.database as Record<string, unknown>)?.database ?? 'ha.db',
    },
    integrations: [
      ...((fileConfig.integrations as unknown[]) ?? []),
      // Inject automation as a synthetic integration entry
      ...(fileConfig.automation
        ? [{ domain: 'automation', automations: fileConfig.automation }]
        : []),
    ],
  };

  return config;
};
