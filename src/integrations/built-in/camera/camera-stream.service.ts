import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FFMPEG_RESTART_DELAY, STREAM_IDLE_TIMEOUT } from './camera.constants';

export interface StreamDef {
  label: string;
  rtspUrl: string;
}

export type StateListener = (state: 'streaming' | 'unavailable') => void;

interface StreamEntry {
  rtspUrl: string;
  process: ChildProcess | null;
  hlsDir: string;
  ready: boolean;
  restartTimer: NodeJS.Timeout | null;
  stopped: boolean;          // camera removed from registry
  idleTimer: NodeJS.Timeout | null;  // stop after inactivity
  lastRequest: number;       // epoch ms of last client request
}

interface CameraGroup {
  streams: Map<string, StreamEntry>;   // label.toLowerCase() → entry
  defaultLabel: string;
  stateListener: StateListener;
}

/**
 * On-demand HLS streaming service.
 *
 * Streams are started lazily when a client requests the manifest, and
 * stopped automatically after STREAM_IDLE_TIMEOUT ms of no requests.
 * This prevents exhausting the DVR's concurrent-connection limit.
 */
@Injectable()
export class CameraStreamService extends EventEmitter implements OnApplicationShutdown {
  private readonly logger = new Logger(CameraStreamService.name);
  private readonly groups = new Map<string, CameraGroup>();

  // ── Public API ──────────────────────────────────────────────────────────────

  registerCamera(
    entityId: string,
    streams: StreamDef[],
    defaultLabel: string,
    onState: StateListener,
  ): void {
    if (this.groups.has(entityId)) return;

    const group: CameraGroup = {
      streams: new Map(),
      defaultLabel: defaultLabel.toLowerCase(),
      stateListener: onState,
    };

    for (const s of streams) {
      const key = s.label.toLowerCase();
      const hlsDir = path.join(os.tmpdir(), `ha_cam_${entityId}_${key}`.replace(/[^a-z0-9_]/gi, '_'));
      fs.mkdirSync(hlsDir, { recursive: true });

      group.streams.set(key, {
        rtspUrl: s.rtspUrl,
        process: null,
        hlsDir,
        ready: false,
        restartTimer: null,
        stopped: false,
        idleTimer: null,
        lastRequest: 0,
      });
    }

    this.groups.set(entityId, group);
  }

  stopCamera(entityId: string): void {
    const group = this.groups.get(entityId);
    if (!group) return;
    for (const [key, entry] of group.streams) {
      this.stopEntry(entityId, key, entry, true);
    }
    this.groups.delete(entityId);
  }

  /**
   * Called by the controller whenever a client requests a manifest or segment.
   * Starts the stream if not running; resets the idle timer.
   */
  touchStream(entityId: string, quality: string): void {
    const entry = this.resolveEntry(entityId, quality);
    if (!entry || entry.stopped) return;

    entry.lastRequest = Date.now();

    // Reset idle timer
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
    entry.idleTimer = setTimeout(() => {
      this.logger.log(`Camera [${entityId}] stream idle — stopping FFmpeg`);
      this.stopEntry(entityId, quality, entry, false);
    }, STREAM_IDLE_TIMEOUT);

    // Start if not already running
    if (!entry.process && !entry.restartTimer) {
      const group = this.groups.get(entityId)!;
      const key = (quality || group.defaultLabel).toLowerCase();
      this.startProcess(entityId, key);
    }
  }

  /** Returns the path to index.m3u8 for the given quality, or undefined */
  getHlsManifestPath(entityId: string, quality: string): string | undefined {
    const entry = this.resolveEntry(entityId, quality);
    if (!entry?.ready) return undefined;
    return path.join(entry.hlsDir, 'index.m3u8');
  }

  /** Returns the HLS directory for serving segment files */
  getHlsDir(entityId: string, quality: string): string | undefined {
    const entry = this.resolveEntry(entityId, quality);
    return entry?.hlsDir;
  }

  hasCamera(entityId: string): boolean {
    return this.groups.has(entityId);
  }

  getStreamLabels(entityId: string): string[] {
    const group = this.groups.get(entityId);
    if (!group) return [];
    return Array.from(group.streams.keys());
  }

  getDefaultLabel(entityId: string): string {
    return this.groups.get(entityId)?.defaultLabel ?? '';
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private resolveEntry(entityId: string, quality: string): StreamEntry | undefined {
    const group = this.groups.get(entityId);
    if (!group) return undefined;
    const key = (quality || group.defaultLabel).toLowerCase();
    return group.streams.get(key) ?? group.streams.get(group.defaultLabel);
  }

  private stopEntry(entityId: string, key: string, entry: StreamEntry, permanent: boolean): void {
    if (permanent) entry.stopped = true;
    if (entry.restartTimer) { clearTimeout(entry.restartTimer); entry.restartTimer = null; }
    if (entry.idleTimer) { clearTimeout(entry.idleTimer); entry.idleTimer = null; }
    if (entry.process) { entry.process.kill('SIGKILL'); entry.process = null; }
    entry.ready = false;
    if (permanent) {
      try { fs.rmSync(entry.hlsDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    this.logger.debug(`Camera [${entityId}:${key}] ${permanent ? 'stopped' : 'stream paused (idle)'}`);
  }

  // ── FFmpeg (HLS) ─────────────────────────────────────────────────────────────

  private startProcess(entityId: string, key: string): void {
    const group = this.groups.get(entityId);
    const entry = group?.streams.get(key);
    if (!entry || entry.stopped || entry.process) return;

    const m3u8 = path.join(entry.hlsDir, 'index.m3u8');
    this.logger.log(`Camera [${entityId}:${key}] starting HLS → ${this.maskUrl(entry.rtspUrl)}`);

    const proc = spawn('ffmpeg', [
      '-loglevel', 'warning',
      '-rtsp_transport', 'tcp',
      '-i', entry.rtspUrl,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '3',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', path.join(entry.hlsDir, 'seg%03d.ts'),
      m3u8,
    ]);

    entry.process = proc;
    entry.ready = false;

    const readyPoll = setInterval(() => {
      if (fs.existsSync(m3u8)) {
        entry.ready = true;
        group!.stateListener('streaming');
        clearInterval(readyPoll);
      }
    }, 500);

    proc.on('error', (err: Error) => {
      clearInterval(readyPoll);
      entry.process = null;
      entry.ready = false;
      group!.stateListener('unavailable');
      this.logger.error(`Camera [${entityId}:${key}] FFmpeg spawn error: ${err.message}`);
    });

    proc.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) this.logger.debug(`Camera [${entityId}:${key}] FFmpeg: ${msg}`);
    });

    proc.on('close', (code) => {
      clearInterval(readyPoll);
      if (entry.stopped) return;
      entry.process = null;
      entry.ready = false;
      group!.stateListener('unavailable');

      // Only restart if there was a recent client request
      const sinceRequest = Date.now() - entry.lastRequest;
      if (sinceRequest < STREAM_IDLE_TIMEOUT) {
        this.logger.warn(`Camera [${entityId}:${key}] FFmpeg exited (code ${code}), restarting in ${FFMPEG_RESTART_DELAY / 1000}s`);
        entry.restartTimer = setTimeout(() => {
          entry.restartTimer = null;
          this.startProcess(entityId, key);
        }, FFMPEG_RESTART_DELAY);
      } else {
        this.logger.log(`Camera [${entityId}:${key}] FFmpeg exited — no active viewers, not restarting`);
      }
    });
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────────

  onApplicationShutdown(): void {
    for (const entityId of [...this.groups.keys()]) {
      this.stopCamera(entityId);
    }
  }

  private maskUrl(url: string): string {
    return url.replace(/:([^@/]+)@/, ':***@');
  }
}
