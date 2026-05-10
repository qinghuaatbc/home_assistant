export const DOMAIN_ENVISALINK = 'envisalink';

export const DEFAULT_PORT = 4025;
export const DEFAULT_PASSWORD = 'user';
export const DEFAULT_USERCODE = '1234';
export const DEFAULT_POLL_INTERVAL = 5000;

export const EVL_COMMANDS = {
  ARM_STAY:       '0303',
  ARM_AWAY:       '0304',
  DISARM:         '03401',
  PARTITION_STATUS: '000',
  ZONE_STATUS:      '001',
  DUMP_ZONE_TIMERS: '008',
} as const;

export const EVL_RESPONSE_PREFIX = {
  LOGIN_PROMPT: '00',
  LOGIN_SUCCESS: '500',
  PARTITION_UPDATE: '510',
  ZONE_UPDATE: '609',
  ZONE_ALARM: '601',
  ZONE_TAMPER: '602',
  ZONE_FAULT: '603',
  ZONE_RESTORE: '609',
  COMMAND_ACK: '501',
};

export const ENVISALINK_ZONE_TYPES = ['door', 'window', 'motion', 'smoke', 'glass', 'panic', 'gas', 'moisture'] as const;
export type EnvisalinkZoneType = typeof ENVISALINK_ZONE_TYPES[number];

export const ZONE_CATEGORY_MAP: Record<number, EnvisalinkZoneType> = {
  1: 'door',
  2: 'window',
  3: 'motion',
  4: 'smoke',
  5: 'glass',
  6: 'panic',
  7: 'gas',
  8: 'moisture',
};
