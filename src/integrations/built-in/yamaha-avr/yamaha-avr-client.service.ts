import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as xml2js from 'xml2js';
import { YamahaZone, levelToDb, dbToLevel } from './yamaha-avr.constants';

export interface ReceiverZoneState {
  zone: YamahaZone;
  power: boolean;       // true = on, false = standby
  volume: number;       // 0.0 – 1.0
  muted: boolean;
  source: string;       // e.g. "HDMI1"
  sources: string[];    // available inputs
}

/** Shape of one receiver entry under `receivers:` in configuration.yaml */
export interface MockReceiverConfig {
  name: string;
  model?: string;
  zone?: YamahaZone;
  power?: boolean;
  volume?: number;   // 0.0 – 1.0
  muted?: boolean;
  source?: string;
  sources?: string[];
}

@Injectable()
export class YamahaAvrClientService {
  private readonly logger = new Logger(YamahaAvrClientService.name);
  private readonly parser = new xml2js.Parser({ explicitArray: false });
  private http: AxiosInstance | null = null;
  private mockMode = false;

  /** In-memory state for mock mode (zone → mutable state) */
  private mockStates = new Map<YamahaZone, ReceiverZoneState & { name: string; model: string }>();

  // ── Configuration ───────────────────────────────────────────────────────────

  configure(host: string, port: number): void {
    this.http = axios.create({
      baseURL: `http://${host}:${port}`,
      headers: { 'Content-Type': 'text/xml' },
      timeout: 5000,
    });
    this.logger.log(`Yamaha AVR client configured: http://${host}:${port}`);
  }

  configureMock(receivers: MockReceiverConfig[]): void {
    this.mockMode = true;
    for (const r of receivers) {
      const zone = (r.zone ?? 'Main_Zone') as YamahaZone;
      this.mockStates.set(zone, {
        zone,
        name: r.name,
        model: r.model ?? 'Yamaha AV Receiver',
        power: r.power ?? false,
        volume: r.volume ?? 0.3,
        muted: r.muted ?? false,
        source: r.source ?? 'HDMI1',
        sources: r.sources ?? ['HDMI1', 'HDMI2', 'HDMI3', 'Audio1', 'Spotify', 'Bluetooth'],
      });
    }
    this.logger.log(`Yamaha AVR running in MOCK mode with ${receivers.length} receiver(s)`);
  }

  // ── Discovery ───────────────────────────────────────────────────────────────

  getMockReceivers(): Array<ReceiverZoneState & { name: string; model: string }> {
    return Array.from(this.mockStates.values());
  }

  async ping(): Promise<boolean> {
    if (this.mockMode) return true;
    try {
      await this.http!.get('/');
      return true;
    } catch {
      return false;
    }
  }

  // ── Zone status ─────────────────────────────────────────────────────────────

  async getZoneState(zone: YamahaZone): Promise<ReceiverZoneState | null> {
    if (this.mockMode) {
      const s = this.mockStates.get(zone);
      return s ? { ...s } : null;
    }

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<YAMAHA_AV cmd="GET"><${zone}><Basic_Status>GetParam</Basic_Status></${zone}></YAMAHA_AV>`;

    try {
      const res = await this.http!.post('/YamahaRemoteControl/ctrl', xml);
      return this.parseZoneStatus(zone, res.data);
    } catch (err: unknown) {
      this.logger.warn(`Failed to get zone ${zone} status: ${(err as Error).message}`);
      return null;
    }
  }

  // ── Commands ────────────────────────────────────────────────────────────────

  async setPower(zone: YamahaZone, on: boolean): Promise<void> {
    if (this.mockMode) {
      const s = this.mockStates.get(zone);
      if (s) s.power = on;
      return;
    }
    await this.sendCommand(zone, `<Power_Control><Power>${on ? 'On' : 'Standby'}</Power></Power_Control>`);
  }

  async setVolume(zone: YamahaZone, level: number): Promise<void> {
    if (this.mockMode) {
      const s = this.mockStates.get(zone);
      if (s) s.volume = Math.max(0, Math.min(1, level));
      return;
    }
    const db = levelToDb(level);
    await this.sendCommand(zone, `<Volume><Lvl><Val>${db * 10}</Val><Exp>1</Exp><Unit>dB</Unit></Lvl></Volume>`);
  }

  async stepVolume(zone: YamahaZone, up: boolean): Promise<void> {
    if (this.mockMode) {
      const s = this.mockStates.get(zone);
      if (s) s.volume = Math.max(0, Math.min(1, s.volume + (up ? 0.02 : -0.02)));
      return;
    }
    await this.sendCommand(zone, `<Volume><Lvl><Val>${up ? 'Up' : 'Down'}</Val><Exp>0</Exp><Unit></Unit></Lvl></Volume>`);
  }

  async setMute(zone: YamahaZone, muted: boolean): Promise<void> {
    if (this.mockMode) {
      const s = this.mockStates.get(zone);
      if (s) s.muted = muted;
      return;
    }
    await this.sendCommand(zone, `<Volume><Mute>${muted ? 'On' : 'Off'}</Mute></Volume>`);
  }

  async selectSource(zone: YamahaZone, source: string): Promise<void> {
    if (this.mockMode) {
      const s = this.mockStates.get(zone);
      if (s) s.source = source;
      return;
    }
    await this.sendCommand(zone, `<Input><Input_Sel>${source}</Input_Sel></Input>`);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async sendCommand(zone: YamahaZone, body: string): Promise<void> {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<YAMAHA_AV cmd="PUT"><${zone}>${body}</${zone}></YAMAHA_AV>`;
    await this.http!.post('/YamahaRemoteControl/ctrl', xml);
  }

  private async parseZoneStatus(zone: YamahaZone, xml: string): Promise<ReceiverZoneState | null> {
    try {
      const parsed = await new Promise<Record<string, unknown>>((resolve, reject) => {
        this.parser.parseString(xml, (err: Error | null, result: unknown) => {
          if (err) reject(err);
          else resolve(result as Record<string, unknown>);
        });
      });

      const zoneData = (parsed?.['YAMAHA_AV'] as Record<string, unknown>)?.[zone] as Record<string, unknown>;
      const basic = zoneData?.['Basic_Status'] as Record<string, unknown>;
      if (!basic) return null;

      const power = (basic['Power_Control'] as Record<string, unknown>)?.['Power'] === 'On';
      const vol = basic['Volume'] as Record<string, unknown>;
      const volumeDb = parseFloat(String((vol?.['Lvl'] as Record<string, unknown>)?.['Val'] ?? '-800')) / 10;
      const muted = (vol?.['Mute'] as string) === 'On';
      const source = String((basic['Input'] as Record<string, unknown>)?.['Input_Sel'] ?? 'Unknown');

      return {
        zone,
        power,
        volume: dbToLevel(volumeDb),
        muted,
        source,
        sources: [],
      };
    } catch (err: unknown) {
      this.logger.warn(`Failed to parse zone status XML: ${(err as Error).message}`);
      return null;
    }
  }
}
