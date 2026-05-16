import { Injectable, Logger } from '@nestjs/common';
import { ECOBEE_BASE, ECOBEE_TOKEN_URL, MODE_MAP, MODE_REVERSE, tenthsFtoC, cToTenthsF, equipmentToAction } from './ecobee.constants';

export interface EcobeeThermostatState {
  identifier: string;
  name: string;
  currentTemp: number;
  setpointHeat: number | null;
  setpointCool: number | null;
  humidity: number | null;
  hvacMode: string;
  hvacAction: string;
}

export interface EcobeeConfig {
  api_key: string;
  refresh_token: string;
  poll_interval?: number;
}

@Injectable()
export class EcobeeClientService {
  private readonly logger = new Logger(EcobeeClientService.name);
  private config: EcobeeConfig;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  configure(config: EcobeeConfig) { this.config = config; }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60_000) return this.accessToken!;
    const res = await fetch(
      `${ECOBEE_TOKEN_URL}?grant_type=refresh_token&refresh_token=${encodeURIComponent(this.config.refresh_token)}&client_id=${encodeURIComponent(this.config.api_key)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    if (!res.ok) throw new Error(`Ecobee token refresh failed: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
    return this.accessToken!;
  }

  async listThermostats(): Promise<EcobeeThermostatState[]> {
    const token = await this.getAccessToken();
    const selection = JSON.stringify({
      selection: { selectionType: 'registered', selectionMatch: '', includeSensors: true, includeSettings: true, includeRuntime: true },
    });
    const res = await fetch(`${ECOBEE_BASE}/1/thermostat?json=${encodeURIComponent(selection)}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Ecobee list failed: ${res.status}`);
    const data: any = await res.json();
    return (data.thermostatList ?? []).map((t: any) => this.parseThermostat(t));
  }

  private parseThermostat(t: any): EcobeeThermostatState {
    const rt = t.runtime ?? {};
    const settings = t.settings ?? {};
    const currentTemp = tenthsFtoC(rt.actualTemperature ?? 700);
    const setpointHeat = rt.desiredHeat != null ? tenthsFtoC(rt.desiredHeat) : null;
    const setpointCool = rt.desiredCool != null ? tenthsFtoC(rt.desiredCool) : null;
    const humidity = rt.actualHumidity != null ? Number(rt.actualHumidity) : null;
    const hvacMode = MODE_MAP[settings.hvacMode ?? 'off'] ?? 'off';
    const hvacAction = equipmentToAction(t.equipmentStatus ?? '');
    return { identifier: t.identifier, name: t.name ?? t.identifier, currentTemp, setpointHeat, setpointCool, humidity, hvacMode, hvacAction };
  }

  async setMode(identifier: string, hvacMode: string): Promise<void> {
    const mode = MODE_REVERSE[hvacMode] ?? 'off';
    await this.updateThermostat(identifier, { settings: { hvacMode: mode } });
  }

  async setTemperature(identifier: string, temperature: number, hvacMode: string): Promise<void> {
    const tenths = cToTenthsF(temperature);
    let holdClimateRef: any = {};
    if (hvacMode === 'heat') holdClimateRef = { heatHoldTemp: tenths };
    else if (hvacMode === 'cool') holdClimateRef = { coolHoldTemp: tenths };
    else if (hvacMode === 'heat_cool') holdClimateRef = { heatHoldTemp: tenths - 20, coolHoldTemp: tenths + 20 };
    await this.updateThermostat(identifier, {
      functions: [{ type: 'setHold', params: { holdType: 'nextTransition', ...holdClimateRef } }],
    });
  }

  private async updateThermostat(identifier: string, body: any): Promise<void> {
    const token = await this.getAccessToken();
    const payload = {
      selection: { selectionType: 'thermostats', selectionMatch: identifier },
      ...body,
    };
    const res = await fetch(`${ECOBEE_BASE}/1/thermostat?format=json`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Ecobee update failed: ${res.status} ${await res.text()}`);
  }
}
