import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';

export interface WebrtcStream {
  name: string;
  rtspUrl: string;
  source: 'integration' | 'manual';
  entityId?: string;
}

const GO2RTC_PORT = 1984;
const STREAMS_FILE = path.join(process.cwd(), 'config', 'webrtc-streams.json');
const BIN_DIR = path.join(process.cwd(), 'config', 'bin');

const GO2RTC_RELEASES: Record<string, string> = {
  'linux-x64': 'go2rtc_linux_amd64',
  'linux-arm64': 'go2rtc_linux_arm64',
  'darwin-x64': 'go2rtc_darwin_amd64',
  'darwin-arm64': 'go2rtc_darwin_arm64',
};

@Injectable()
export class WebrtcService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WebrtcService.name);
  private go2rtcProcess: ChildProcess | null = null;
  // integration streams: pushed by CameraIntegration / Rtsp2WebrtcIntegration during setup
  private integrationStreams: Map<string, { rtspUrl: string; entityId?: string }> = new Map();
  // manual streams: added via API / SecurityPage form
  private manualStreams: Map<string, string> = new Map();
  private go2rtcReady = false;

  // Disk-based HLS: ffmpeg writes segments to /tmp/ha_hls/{name}/
  static readonly HLS_BASE_DIR = '/tmp/ha_hls';
  private hlsProcesses: Map<string, ChildProcess> = new Map();
  private hlsRestartTimers: Map<string, NodeJS.Timeout> = new Map();

  async onApplicationBootstrap(): Promise<void> {
    this.loadManualStreams();
    await this.startGo2rtc();
  }

  onApplicationShutdown(): void {
    this.stopAllHls();
    if (this.go2rtcProcess) {
      this.go2rtcProcess.kill('SIGTERM');
      this.go2rtcProcess = null;
    }
  }

  // ── Called by integrations during setup ──────────────────────────────────

  registerIntegrationStream(name: string, rtspUrl: string, entityId?: string): void {
    this.integrationStreams.set(name, { rtspUrl, entityId });
    this.reloadGo2rtc();
    if (this.go2rtcReady) setTimeout(() => this.startHlsForStream(name), 4000);
    this.logger.log(`WebRTC stream registered: ${name}`);
  }

  unregisterIntegrationStream(name: string): void {
    this.integrationStreams.delete(name);
    this.stopHlsForStream(name);
    this.reloadGo2rtc();
  }

  // ── Manual stream management (via API) ───────────────────────────────────

  addStream(name: string, rtspUrl: string): void {
    const key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    this.manualStreams.set(key, rtspUrl);
    this.saveManualStreams();
    this.reloadGo2rtc();
    if (this.go2rtcReady) setTimeout(() => this.startHlsForStream(key), 4000);
  }

  removeStream(name: string): boolean {
    if (!this.manualStreams.has(name)) return false;
    this.manualStreams.delete(name);
    this.stopHlsForStream(name);
    this.saveManualStreams();
    this.reloadGo2rtc();
    return true;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getStreams(): WebrtcStream[] {
    const result: WebrtcStream[] = [];
    for (const [name, { rtspUrl, entityId }] of this.integrationStreams) {
      result.push({ name, rtspUrl, source: 'integration', entityId });
    }
    for (const [name, rtspUrl] of this.manualStreams) {
      result.push({ name, rtspUrl, source: 'manual' });
    }
    return result;
  }

  isReady(): boolean {
    return this.go2rtcReady;
  }

  // ── WHEP proxy ────────────────────────────────────────────────────────────

  async proxyWhep(streamName: string, sdpOffer: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `http://localhost:${GO2RTC_PORT}/api/webrtc?src=${encodeURIComponent(streamName)}`;
      const body = Buffer.from(sdpOffer);

      const req = require('http').request(
        url,
        { method: 'POST', headers: { 'Content-Type': 'application/sdp', 'Content-Length': body.length } },
        (res: any) => {
          const chunks: Buffer[] = [];
          res.on('data', (d: Buffer) => chunks.push(d));
          res.on('end', () => resolve(Buffer.concat(chunks).toString()));
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // ── go2rtc lifecycle ──────────────────────────────────────────────────────

  private async startGo2rtc(): Promise<void> {
    const binPath = await this.ensureBinary();
    if (!binPath) {
      this.logger.warn('go2rtc binary not available — WebRTC streams disabled');
      return;
    }

    const configPath = this.writeGo2rtcConfig();

    this.logger.log(`Starting go2rtc from ${binPath}`);
    const proc = spawn(binPath, ['-config', configPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    this.go2rtcProcess = proc;

    const onReady = () => { this.go2rtcReady = true; this.logger.log('go2rtc is ready'); };

    proc.stdout?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line && (line.includes('listen') || line.includes(':1984'))) onReady();
    });
    proc.stderr?.on('data', (d: Buffer) => {
      const line = d.toString().trim();
      if (line && (line.includes('listen') || line.includes(':1984'))) onReady();
    });

    proc.on('error', (err) => this.logger.error(`go2rtc error: ${err.message}`));
    proc.on('close', (code) => {
      this.go2rtcReady = false;
      this.go2rtcProcess = null;
      this.logger.warn(`go2rtc exited with code ${code}`);
    });

    await new Promise(r => setTimeout(r, 3000));
    if (!this.go2rtcReady) this.go2rtcReady = true;

    // Start disk-based HLS for all streams (give go2rtc RTSP server 2s to settle)
    fs.mkdirSync(WebrtcService.HLS_BASE_DIR, { recursive: true });
    setTimeout(() => {
      for (const stream of this.getStreams()) {
        this.startHlsForStream(stream.name);
      }
    }, 2000);
  }

  private reloadGo2rtc(): void {
    if (!this.go2rtcProcess) return;
    this.writeGo2rtcConfig();
    try { this.go2rtcProcess.kill('SIGHUP'); } catch { /* ignore */ }
  }

  private writeGo2rtcConfig(): string {
    const configDir = path.join(process.cwd(), 'config');
    fs.mkdirSync(configDir, { recursive: true });

    const allStreams = this.getStreams();
    // ffmpeg: transcodes H265→H264 video and G711/PCMU→AAC audio so browsers can play via MSE
    const streamsYaml = allStreams.map(s => `  ${s.name}: ffmpeg:${s.rtspUrl}#video=h264#audio=aac`).join('\n');

    const yaml = [
      `api:`,
      `  listen: :${GO2RTC_PORT}`,
      `log:`,
      `  level: warn`,
      `rtsp:`,
      `  listen: :8554`,
      `webrtc:`,
      `  candidates:`,
      `    - 207.216.151.27`,
      `  listen: :8555`,
      `streams:`,
      streamsYaml || '  {}',
    ].join('\n');

    const configPath = path.join(configDir, 'go2rtc.yaml');
    fs.writeFileSync(configPath, yaml, 'utf8');
    return configPath;
  }

  // ── Disk-based HLS (ffmpeg → /tmp/ha_hls/{name}/) ────────────────────────

  private startHlsForStream(name: string): void {
    if (this.hlsProcesses.has(name)) return;

    const dir = path.join(WebrtcService.HLS_BASE_DIR, name);
    fs.mkdirSync(dir, { recursive: true });

    const proc = spawn('ffmpeg', [
      '-fflags', '+genpts',
      '-rtsp_transport', 'tcp',
      '-i', `rtsp://localhost:8554/${name}`,
      '-c', 'copy',
      '-f', 'hls',
      '-hls_time', '1',
      '-hls_list_size', '3',
      '-hls_flags', 'delete_segments+append_list+split_by_time',
      '-hls_segment_filename', path.join(dir, 'seg%03d.ts'),
      '-y',
      path.join(dir, 'index.m3u8'),
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    this.hlsProcesses.set(name, proc);
    this.logger.log(`HLS started for stream: ${name}`);

    proc.on('close', (code) => {
      this.hlsProcesses.delete(name);
      if (this.getStreams().find(s => s.name === name)) {
        const timer = setTimeout(() => {
          this.hlsRestartTimers.delete(name);
          this.startHlsForStream(name);
        }, 5000);
        this.hlsRestartTimers.set(name, timer);
      }
    });
  }

  private stopHlsForStream(name: string): void {
    const timer = this.hlsRestartTimers.get(name);
    if (timer) { clearTimeout(timer); this.hlsRestartTimers.delete(name); }
    const proc = this.hlsProcesses.get(name);
    if (proc) { proc.kill('SIGTERM'); this.hlsProcesses.delete(name); }
  }

  private stopAllHls(): void {
    const names = [...new Set([...this.hlsProcesses.keys(), ...this.hlsRestartTimers.keys()])];
    for (const name of names) this.stopHlsForStream(name);
  }

  // ── Binary management ─────────────────────────────────────────────────────

  private async ensureBinary(): Promise<string | null> {
    const platform = `${os.platform()}-${os.arch()}`;
    const assetName = GO2RTC_RELEASES[platform];
    if (!assetName) { this.logger.warn(`go2rtc: unsupported platform ${platform}`); return null; }

    fs.mkdirSync(BIN_DIR, { recursive: true });
    const binPath = path.join(BIN_DIR, 'go2rtc');
    if (fs.existsSync(binPath)) { this.logger.log('go2rtc binary already present'); return binPath; }

    this.logger.log(`Downloading go2rtc (${assetName}) …`);
    const url = `https://github.com/AlexxIT/go2rtc/releases/download/v1.9.4/${assetName}`;
    try {
      await this.download(url, binPath);
      fs.chmodSync(binPath, 0o755);
      this.logger.log('go2rtc downloaded successfully');
      return binPath;
    } catch (err) {
      this.logger.error(`Failed to download go2rtc: ${(err as Error).message}`);
      return null;
    }
  }

  private download(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const request = (u: string) => {
        https.get(u, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) { request(res.headers.location!); return; }
          if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
        }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
      };
      request(url);
    });
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private loadManualStreams(): void {
    try {
      if (fs.existsSync(STREAMS_FILE)) {
        const data = JSON.parse(fs.readFileSync(STREAMS_FILE, 'utf8')) as Record<string, string>;
        this.manualStreams = new Map(Object.entries(data));
        this.logger.log(`Loaded ${this.manualStreams.size} manual WebRTC streams`);
      }
    } catch { this.logger.warn('Failed to load webrtc-streams.json'); }
  }

  private saveManualStreams(): void {
    try {
      fs.mkdirSync(path.dirname(STREAMS_FILE), { recursive: true });
      fs.writeFileSync(STREAMS_FILE, JSON.stringify(Object.fromEntries(this.manualStreams), null, 2), 'utf8');
    } catch { this.logger.warn('Failed to save webrtc-streams.json'); }
  }
}
