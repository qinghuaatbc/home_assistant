export const ECOBEE_DOMAIN = 'ecobee';
export const ECOBEE_BASE = 'https://api.ecobee.com';
export const ECOBEE_TOKEN_URL = `${ECOBEE_BASE}/token`;

// Ecobee hvacMode → HA hvac_mode
export const MODE_MAP: Record<string, string> = {
  heat: 'heat', cool: 'cool', auto: 'heat_cool', off: 'off', auxHeatOnly: 'heat',
};

// HA hvac_mode → Ecobee hvacMode
export const MODE_REVERSE: Record<string, string> = {
  heat: 'heat', cool: 'cool', heat_cool: 'auto', off: 'off',
};

// Ecobee temps are in tenths of °F
export function tenthsFtoC(tenths: number): number {
  return Math.round(((tenths / 10 - 32) * 5 / 9) * 10) / 10;
}

export function cToTenthsF(celsius: number): number {
  return Math.round(celsius * 9 / 5 + 32) * 10;
}

export function equipmentToAction(status: string): string {
  if (!status) return 'idle';
  if (/heatPump|auxHeat/i.test(status)) return 'heating';
  if (/compCool/i.test(status)) return 'cooling';
  return 'idle';
}
