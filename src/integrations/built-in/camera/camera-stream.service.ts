import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FFMPEG_RESTART_DELAY } from './camera.constants';

export interface StreamDef {
  label: string;
  rtspUrl: string;
}

export type StateListener = (state: 'streaming' | 'unavailable') => void;

interface StreamEntry {
  rtspUrl: string;
  process: ChildProcess | null;
  hlsDir: string;       // directory where HLS segments live
  ready: boolean;       // true once at least one .m3u8 exists
  restartTimer: NodeJS.Timeout | null;
  stopped: boolean;
}

interface CameraGroup {
  streams: Map<string, StreamEntry>;   // label.toLowerCase() → entry
  defaultLabel: string;
  stateListener: StateListener;
}

/**
 * Manages one FFmpeg process per camera stream.
 * Each process transcodes RTSP → HLS segments written to a temp directory.
 *
 * FFmpeg command:
 *   ffmpeg -rtsp_transport tcp -i <url>
 *          -c:v copy -an
 *          -f hls -hls_time 2 -hls_list_size 3
 *          -hls_flags delete_segments+append_list
 *          <hlsDir>/index.m3u8
 */
@Injectable()
export class CameraStreamService extends EventEmitter implements OnApplicationShutdown {
  private readonly logger = new Logger(CameraStreamService.name);
  private readonly groups = new Map<string, CameraGroup>();
  private startIndex = 0;  // global counter for staggered starts

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
      });
    }

    this.groups.set(entityId, group);

    // Stagger stream starts: 2s apart to avoid overwhelming the DVR
    for (const key of group.streams.keys()) {
      const delay = this.startIndex * 2000;
      this.startIndex++;
      if (delay === 0) {
        this.startProcess(entityId, key);
      } else {
        setTimeout(() => this.startProcess(entityId, key), delay);
      }
    }
  }

  stopCamera(entityId: string): void {
    const group = this.groups.get(entityId);
    if (!group) return;
    for (const [key, entry] of group.streams) {
      entry.stopped = true;
      if (entry.restartTimer) clearTimeout(entry.restartTimer);
      entry.process?.kill('SIGKILL');
      try { fs.rmSync(entry.hlsDir, { recursive: true, force: true }); } catch { /* ignore */ }
      this.logger.debug(`Camera [${entityId}:${key}] stopped`);
    }
    this.groups.delete(entityId);
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

  // ── FFmpeg (HLS) ─────────────────────────────────────────────────────────────

  private startProcess(entityId: string, key: string): void {
    const group = this.groups.get(entityId);
    const entry = group?.streams.get(key);
    if (!entry || entry.stopped) return;

    const m3u8 = path.join(entry.hlsDir, 'index.m3u8');
    this.logger.log(`Camera [${entityId}:${key}] starting HLS → ${this.maskUrl(entry.rtspUrl)}`);

    const proc = spawn('ffmpeg', [
      '-loglevel', 'warning',
      '-rtsp_transport', 'tcp',
      '-i', entry.rtspUrl,
      '-c:v', 'copy',   // no re-encode — pass H.264 straight through
      '-c:a', 'aac',    // transcode audio to AAC for HLS
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '3',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', path.join(entry.hlsDir, 'seg%03d.ts'),
      m3u8,
    ]);

    entry.process = proc;
    entry.ready = false;

    // Poll for the manifest file appearing
    const readyPoll = setInterval(() => {
      if (fs.existsSync(m3u8)) {
        entry.ready = true;
        group!.stateListener('streaming');
        clearInterval(readyPoll);
      }
    }, 500);

    proc.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) this.logger.debug(`Camera [${entityId}:${key}] FFmpeg: ${msg}`);
    });

    proc.on('close', (code) => {
      clearInterval(readyPoll);
      if (entry.stopped) return;
      this.logger.warn(`Camera [${entityId}:${key}] FFmpeg exited (code ${code}), restarting in ${FFMPEG_RESTART_DELAY / 1000}s`);
      entry.process = null;
      entry.ready = false;
      group!.stateListener('unavailable');
      entry.restartTimer = setTimeout(() => {
        entry.restartTimer = null;
        this.startProcess(entityId, key);
      }, FFMPEG_RESTART_DELAY);
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
