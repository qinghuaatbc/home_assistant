/**
 * ISY994 / Insteon integration constants.
 */

export const DOMAIN_ISY994 = 'isy994';

/**
 * Insteon device category → HA domain mapping.
 *
 * The ISY type field is "category.subcategory.version.extra".
 * Category 1 = Dimmable Lighting → light
 * Category 2 = Switched Lighting → switch
 * Category 7 = KeypadLinc (treat as light if subcategory < 64, else switch)
 * All others default to switch.
 */
export const INSTEON_CATEGORY_TO_DOMAIN: Record<number, string> = {
  1: 'light',   // Dimmable Lighting
  2: 'switch',  // Switched Lighting
  7: 'light',   // KeypadLinc (dimmable variant)
  9: 'switch',  // Fan/Motor
  15: 'switch', // Access Control (garage, lock relay)
  16: 'binary_sensor', // Security, Health, Safety sensors
};

/** ISY command: turn on (with optional level 0-255) */
export const CMD_DON = 'DON';
/** ISY command: turn off */
export const CMD_DOF = 'DOF';
/** ISY command: fast on */
export const CMD_DFON = 'DFON';
/** ISY command: fast off */
export const CMD_DFOF = 'DFOF';
/** ISY command: brighten by one step */
export const CMD_BRT = 'BRT';
/** ISY command: dim by one step */
export const CMD_DIM = 'DIM';

/** ISY property: primary status */
export const PROP_STATUS = 'ST';

/** Max brightness value used by ISY/Insteon (maps to HA's 255) */
export const ISY_MAX_LEVEL = 255;

/** WebSocket subprotocol required by ISY */
export const ISY_WS_PROTOCOL = 'ISYSUB';
/** WebSocket origin required by ISY */
export const ISY_WS_ORIGIN = 'com.universal-devices.websockets.isy';
