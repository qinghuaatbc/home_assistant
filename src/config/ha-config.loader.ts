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
      // Merge demo config if demo.yaml exists and HA_DEMO isn't 'false'
      ...(() => {
        if (process.env.HA_DEMO === 'false') return [];
        const demoPath = path.resolve(path.dirname(configPath), 'demo.yaml');
        if (!fs.existsSync(demoPath)) return [];
        try {
          const content = fs.readFileSync(demoPath, 'utf-8');
          return (yaml.parse(content) ?? []) as unknown[];
        } catch {
          return [];
        }
      })(),
      ...(((fileConfig.integrations as unknown[]) ?? []).map((int: unknown) => {
        const integration = int as Record<string, unknown>;
        if (integration.domain === 'camera' && integration.cameras) {
          const cameras = (integration.cameras as Record<string, unknown>[]).map((cam) => {
            const envPrefix = `HA_CAMERA_${(cam.name as string).toUpperCase().replace(/[^a-zA-Z0-9]/g, '_')}`;
            const streams = (cam.streams as Record<string, unknown>[]).map((s) => ({
              ...s,
              rtsp_url: process.env[`${envPrefix}_${(s.label as string).toUpperCase()}_URL`] ?? s.rtsp_url,
            }));
            return { ...cam, streams };
          });
          return { ...integration, cameras };
        }
        return integration;
      })),
      // Inject automation as a synthetic integration entry.
      // automation: can be an inline array OR a string path to a separate YAML file.
      ...(fileConfig.automation
        ? [{
            domain: 'automation',
            automations: (() => {
              if (typeof fileConfig.automation === 'string') {
                const autoPath = path.resolve(path.dirname(configPath), fileConfig.automation);
                try {
                  return yaml.parse(fs.readFileSync(autoPath, 'utf-8')) ?? [];
                } catch {
                  console.error(`Failed to load automations file: ${autoPath}`);
                  return [];
                }
              }
              return fileConfig.automation;
            })(),
          }]
        : []),
    ],
  };

  return config;
};
