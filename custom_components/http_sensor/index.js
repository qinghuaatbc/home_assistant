const { Logger } = require('@nestjs/common');

const MANIFEST = {
  domain: 'http_sensor',
  name: 'HTTP Sensor',
  version: '1.0.0',
};

/**
 * HTTP Sensor plugin — polls a JSON endpoint for sensor values.
 *
 * Configuration (configuration.yaml or Integrations UI):
 *   devices:
 *     - name: Living Room
 *       url: http://192.168.1.100/api/sensor
 *       interval: 60
 *       jsonpath:
 *         temperature: $.temp
 *         humidity: $.hum
 *
 * Each device is polled independently. The JSON path follows
 * a simple dotted notation (e.g. "data.temperature").
 */
async function create(config, services) {
  const logger = new Logger('HttpSensor');
  const { stateMachine, entityRegistry, contextService } = services;
  const intervals = [];
  const deviceEntities = [];

  function resolvePath(obj, path) {
    return path.split('.').reduce((prev, key) => (prev != null ? prev[key] : undefined), obj);
  }

  async function pollDevice(device, entityIds) {
    try {
      const res = await fetch(device.url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      for (const item of entityIds) {
        const raw = resolvePath(data, item.jsonpath);
        if (raw == null) continue;
        const value = String(typeof raw === 'number' ? Math.round(raw * 10) / 10 : raw);
        const cur = stateMachine.getState(item.entityId);
        if (cur) {
          stateMachine.setState(item.entityId, value, {
            ...cur.attributes,
            last_poll: new Date().toISOString(),
          }, contextService.system());
        }
      }
    } catch (err) {
      logger.warn(`Poll ${device.name} failed: ${err.message}`);
    }
  }

  return {
    manifest: MANIFEST,

    async setup(cfg) {
      const devices = cfg.devices || [];
      if (devices.length === 0) {
        logger.warn('No devices configured — add devices in Integrations page');
        return true;
      }

      for (const device of devices) {
        const slug = device.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const fields = device.fields || []; // [{ key: 'temperature', path: 'temp' }, ...]
        if (fields.length === 0) {
          logger.warn(`Device "${device.name}" has no fields`);
          continue;
        }

        const entityIds = [];
        for (const field of fields) {
          const entityId = `sensor.${slug}_${field.key}`;
          const deviceClass = field.key.includes('temperature') ? 'temperature'
            : field.key.includes('humidity') ? 'humidity'
            : field.key.includes('pressure') ? 'pressure'
            : field.key.includes('wind') ? 'wind_speed'
            : undefined;

          await entityRegistry.registerEntity({
            entity_id: entityId,
            platform: 'http_sensor',
            name: `${device.name} ${field.label || field.key}`,
            original_name: `${device.name} ${field.label || field.key}`,
          });

          await stateMachine.setState(entityId, 'unknown', {
            friendly_name: `${device.name} ${field.label || field.key}`,
            unit_of_measurement: field.unit || '',
            device_class: deviceClass,
          }, contextService.system());

          entityIds.push({ entityId, jsonpath: field.path });
          logger.log(`Entity: ${entityId}`);
        }

        deviceEntities.push(...entityIds);
        const intervalMs = (device.interval || 60) * 1000;

        // Initial poll
        await pollDevice(device, entityIds);
        const timer = setInterval(() => pollDevice(device, entityIds), intervalMs);
        intervals.push(timer);
        logger.log(`Polling "${device.name}" every ${device.interval || 60}s (${entityIds.length} sensors)`);
      }

      return true;
    },

    async teardown() {
      intervals.forEach(t => clearInterval(t));
      intervals.length = 0;
    },

    async on_config_change(newCfg) {
      intervals.forEach(t => clearInterval(t));
      intervals.length = 0;
      await this.setup(newCfg);
    },
  };
}

module.exports = { create };
