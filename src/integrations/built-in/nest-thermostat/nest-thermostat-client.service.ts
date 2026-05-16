import { Injectable, Logger } from '@nestjs/common';
import {
  SDM_BASE, OAUTH_TOKEN_URL, THERMOSTAT_TYPE,
  TRAITS, COMMANDS, MODE_MAP, MODE_REVERSE, ACTION_MAP,
} from './nest-thermostat.constants';

export interface NestThermostatState {
  deviceId: string;
  displayName: string;
  currentTemp: number;
  setpointHeat: number | null;
  setpointCool: number | null;
  humidity: number | null;
  hvacMode: string;
  hvacAction: string;
}

export interface NestConfig {
  project_id: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  poll_interval?: number;
}

@Injectable()
export class NestThermostatClientService {
  private readonly logger = new Logger(NestThermostatClientService.name);
  private config: NestConfig;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  configure(config: NestConfig) {
    this.config = config;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60_000) {
      return this.accessToken;
    }
    const body = new URLSearchParams({
      client_id: this.config.client_id,
      client_secret: this.config.client_secret,
      refresh_token: this.config.refresh_token,
      grant_type: 'refresh_token',
    });
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Nest OAuth failed: ${res.status} ${err}`);
    }
    const data: any = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
    return this.accessToken!;
  }

  async listThermostats(): Promise<NestThermostatState[]> {
    const token = await this.getAccessToken();
    const res = await fetch(`${SDM_BASE}/enterprises/${this.config.project_id}/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Nest list devices failed: ${res.status}`);
    const data: any = await res.json();
    const devices: any[] = data.devices ?? [];
    return devices
      .filter(d => d.type === THERMOSTAT_TYPE)
      .map(d => this.parseDevice(d));
  }

  private parseDevice(d: any): NestThermostatState {
    const t = d.traits ?? {};
    const deviceId = d.name as string;

    const customName = t[TRAITS.INFO]?.customName;
    const displayName = customName || deviceId.split('/').pop() || 'Nest Thermostat';

    const currentTemp = Number(t[TRAITS.TEMPERATURE]?.ambientTemperatureCelsius ?? 20);
    const humidity = t[TRAITS.HUMIDITY] ? Number(t[TRAITS.HUMIDITY].ambientHumidityPercent) : null;

    const sdmMode = t[TRAITS.THERMOSTAT_MODE]?.mode ?? 'OFF';
    const hvacMode = MODE_MAP[sdmMode] ?? 'off';

    const sdmAction = t[TRAITS.THERMOSTAT_HVAC]?.status ?? 'OFF';
    const hvacAction = ACTION_MAP[sdmAction] ?? 'idle';

    const sp = t[TRAITS.THERMOSTAT_SETPOINT] ?? {};
    const setpointHeat = sp.heatCelsius != null ? Number(sp.heatCelsius) : null;
    const setpointCool = sp.coolCelsius != null ? Number(sp.coolCelsius) : null;

    return { deviceId, displayName, currentTemp, setpointHeat, setpointCool, humidity, hvacMode, hvacAction };
  }

  async setMode(deviceId: string, hvacMode: string): Promise<void> {
    const sdmMode = MODE_REVERSE[hvacMode] ?? 'OFF';
    await this.executeCommand(deviceId, COMMANDS.SET_MODE, { mode: sdmMode });
  }

  async setTemperature(deviceId: string, temperature: number, hvacMode: string): Promise<void> {
    const rounded = Math.round(temperature * 10) / 10;
    if (hvacMode === 'heat') {
      await this.executeCommand(deviceId, COMMANDS.SET_HEAT, { heatCelsius: rounded });
    } else if (hvacMode === 'cool') {
      await this.executeCommand(deviceId, COMMANDS.SET_COOL, { coolCelsius: rounded });
    } else if (hvacMode === 'heat_cool') {
      await this.executeCommand(deviceId, COMMANDS.SET_RANGE, {
        heatCelsius: rounded - 2, coolCelsius: rounded + 2,
      });
    }
  }

  private async executeCommand(deviceId: string, command: string, params: Record<string, any>): Promise<void> {
    const token = await this.getAccessToken();
    const res = await fetch(`${SDM_BASE}/${deviceId}:executeCommand`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, params }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Nest command ${command} failed: ${res.status} ${err}`);
    }
  }
}
