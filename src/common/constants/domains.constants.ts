/** Built-in integration domains */
export const DOMAIN_LIGHT = 'light';
export const DOMAIN_SWITCH = 'switch';
export const DOMAIN_SENSOR = 'sensor';
export const DOMAIN_BINARY_SENSOR = 'binary_sensor';
export const DOMAIN_AUTOMATION = 'automation';
export const DOMAIN_SCRIPT = 'script';
export const DOMAIN_SCENE = 'scene';
export const DOMAIN_GROUP = 'group';
export const DOMAIN_INPUT_BOOLEAN = 'input_boolean';
export const DOMAIN_HOMEASSISTANT = 'homeassistant';

/** Common service names */
export const SERVICE_TURN_ON = 'turn_on';
export const SERVICE_TURN_OFF = 'turn_off';
export const SERVICE_TOGGLE = 'toggle';
export const SERVICE_RELOAD = 'reload';

/** Entity state values */
export const STATE_ON = 'on';
export const STATE_OFF = 'off';
export const STATE_UNAVAILABLE = 'unavailable';
export const STATE_UNKNOWN = 'unknown';
export const STATE_HOME = 'home';
export const STATE_NOT_HOME = 'not_home';

/** All supported domains with their services and key attributes */

export interface DomainDef {
  domain: string;
  label: string;
  icon: string;
  services: string[];
  attributes: string[];
  read_only?: boolean;
}

export const DOMAIN_CATALOG: DomainDef[] = [
  {
    domain: 'light',
    label: 'Light',
    icon: '💡',
    services: ['turn_on', 'turn_off', 'toggle'],
    attributes: ['brightness', 'color', 'color_temp', 'effect'],
  },
  {
    domain: 'switch',
    label: 'Switch',
    icon: '🔌',
    services: ['turn_on', 'turn_off', 'toggle'],
    attributes: [],
  },
  {
    domain: 'binary_sensor',
    label: 'Binary Sensor',
    icon: '🔍',
    services: ['turn_on', 'turn_off'],
    attributes: ['device_class'],
    read_only: true,
  },
  {
    domain: 'sensor',
    label: 'Sensor',
    icon: '📊',
    services: [],
    attributes: ['unit_of_measurement', 'device_class', 'state_class'],
    read_only: true,
  },
  {
    domain: 'media_player',
    label: 'Media Player',
    icon: '🎵',
    services: ['turn_on', 'turn_off', 'volume_set', 'volume_up', 'volume_down', 'media_play', 'media_pause', 'media_stop', 'select_source'],
    attributes: ['volume_level', 'media_title', 'media_artist', 'source', 'source_list'],
  },
  {
    domain: 'camera',
    label: 'Camera',
    icon: '📷',
    services: [],
    attributes: ['hls_url', 'streams'],
    read_only: true,
  },
  {
    domain: 'cover',
    label: 'Cover',
    icon: '🪟',
    services: ['open_cover', 'close_cover', 'stop_cover'],
    attributes: ['device_class'],
  },
  {
    domain: 'lock',
    label: 'Lock',
    icon: '🔒',
    services: ['lock', 'unlock'],
    attributes: [],
  },
  {
    domain: 'weather',
    label: 'Weather',
    icon: '🌤',
    services: [],
    attributes: ['temperature', 'humidity', 'pressure', 'wind_speed'],
    read_only: true,
  },
  {
    domain: 'automation',
    label: 'Automation',
    icon: '⚡',
    services: ['trigger', 'turn_on', 'turn_off'],
    attributes: ['mode', 'last_triggered'],
  },
  {
    domain: 'alarm_control_panel',
    label: 'Alarm Panel',
    icon: '🔒',
    services: ['alarm_arm_away', 'alarm_arm_home', 'alarm_disarm'],
    attributes: ['code'],
  },
];

/** Quick lookup: domain → DomainDef */
export const DOMAIN_MAP = new Map<string, DomainDef>(
  DOMAIN_CATALOG.map(d => [d.domain, d]),
);

/** Get services for a domain (empty array if unknown) */
export function getDomainServices(domain: string): string[] {
  return DOMAIN_MAP.get(domain)?.services ?? [];
}

/** Check if a domain supports a given service */
export function domainSupports(domain: string, service: string): boolean {
  return getDomainServices(domain).includes(service);
}

/** Check if a domain is read-only (no services) */
export function isReadOnly(domain: string): boolean {
  return DOMAIN_MAP.get(domain)?.read_only ?? false;
}
