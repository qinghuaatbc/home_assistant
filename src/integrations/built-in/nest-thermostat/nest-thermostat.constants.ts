export const NEST_DOMAIN = 'nest_thermostat';

export const SDM_BASE = 'https://smartdevicemanagement.googleapis.com/v1';
export const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const THERMOSTAT_TYPE = 'sdm.devices.types.THERMOSTAT';

export const TRAITS = {
  INFO: 'sdm.devices.traits.Info',
  TEMPERATURE: 'sdm.devices.traits.Temperature',
  HUMIDITY: 'sdm.devices.traits.Humidity',
  THERMOSTAT_MODE: 'sdm.devices.traits.ThermostatMode',
  THERMOSTAT_HVAC: 'sdm.devices.traits.ThermostatHvac',
  THERMOSTAT_SETPOINT: 'sdm.devices.traits.ThermostatTemperatureSetpoint',
} as const;

export const COMMANDS = {
  SET_MODE: 'sdm.devices.commands.ThermostatMode.SetMode',
  SET_HEAT: 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat',
  SET_COOL: 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetCool',
  SET_RANGE: 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetRange',
} as const;

// SDM mode → HA hvac_mode
export const MODE_MAP: Record<string, string> = {
  HEAT: 'heat', COOL: 'cool', HEATCOOL: 'heat_cool', OFF: 'off',
};

// HA hvac_mode → SDM mode
export const MODE_REVERSE: Record<string, string> = {
  heat: 'HEAT', cool: 'COOL', heat_cool: 'HEATCOOL', off: 'OFF',
};

// SDM HVAC status → HA hvac_action
export const ACTION_MAP: Record<string, string> = {
  HEATING: 'heating', COOLING: 'cooling', OFF: 'idle',
};
