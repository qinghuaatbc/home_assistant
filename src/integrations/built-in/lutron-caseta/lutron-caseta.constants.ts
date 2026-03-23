export const DOMAIN_LUTRON_CASETA = 'lutron_caseta';

/** Lutron Smart Bridge default credentials */
export const DEFAULT_HOST_PORT = 23;
export const DEFAULT_USERNAME  = 'lutron';
export const DEFAULT_PASSWORD  = 'integration';

/**
 * Lutron LEAP/Telnet command prefixes
 * # = command, ? = query, ~ = event (device → hub)
 */
export const CMD_PREFIX   = '#';
export const QUERY_PREFIX = '?';
export const EVENT_PREFIX = '~';

/** OUTPUT action: set/query fade level */
export const ACTION_SET_LEVEL = 1;

/** Device types recognized in configuration */
export const LUTRON_DEVICE_TYPES = ['light', 'switch', 'fan'] as const;
export type LutronDeviceType = typeof LUTRON_DEVICE_TYPES[number];
