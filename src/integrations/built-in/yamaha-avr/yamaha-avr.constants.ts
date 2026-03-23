export const DOMAIN_YAMAHA_AVR = 'yamaha_avr';
export const DOMAIN_MEDIA_PLAYER = 'media_player';

/** Supported feature flags (mirrors HA MediaPlayerEntityFeature) */
export const SUPPORT_VOLUME_SET     = 4;
export const SUPPORT_VOLUME_MUTE    = 8;
export const SUPPORT_TURN_ON        = 128;
export const SUPPORT_TURN_OFF       = 256;
export const SUPPORT_VOLUME_STEP    = 1024;
export const SUPPORT_SELECT_SOURCE  = 2048;

export const SUPPORTED_FEATURES =
  SUPPORT_VOLUME_SET |
  SUPPORT_VOLUME_MUTE |
  SUPPORT_TURN_ON |
  SUPPORT_TURN_OFF |
  SUPPORT_VOLUME_STEP |
  SUPPORT_SELECT_SOURCE;

/** Yamaha YNCA zone identifiers */
export const YAMAHA_ZONES = ['Main_Zone', 'Zone_2', 'Zone_3', 'Zone_4'] as const;
export type YamahaZone = typeof YAMAHA_ZONES[number];

/** Input source names as reported by the receiver */
export const DEFAULT_SOURCES = [
  'HDMI1', 'HDMI2', 'HDMI3', 'HDMI4',
  'AV1', 'AV2', 'AV3',
  'Audio1', 'Audio2',
  'Spotify', 'AirPlay', 'MusicCast',
  'Bluetooth', 'NET RADIO', 'USB',
  'Phono',
];

/** Yamaha volume range: -80.0 dB (min) to 0.0 dB (max), step 0.5 */
export const YAMAHA_MIN_VOLUME = -80.0;
export const YAMAHA_MAX_VOLUME = 0.0;

/** Convert 0.0–1.0 level to Yamaha dB */
export function levelToDb(level: number): number {
  const clamped = Math.max(0, Math.min(1, level));
  return Math.round((YAMAHA_MIN_VOLUME + clamped * (YAMAHA_MAX_VOLUME - YAMAHA_MIN_VOLUME)) * 2) / 2;
}

/** Convert Yamaha dB to 0.0–1.0 level */
export function dbToLevel(db: number): number {
  return (db - YAMAHA_MIN_VOLUME) / (YAMAHA_MAX_VOLUME - YAMAHA_MIN_VOLUME);
}
