import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import { EventEmitter } from 'events';

export interface LutronOutputEvent {
  integrationId: number;
  level: number; // 0.00 – 100.00
}

/**
 * TCP/Telnet client for the Lutron Smart Bridge integration protocol.
 *
 * Protocol overview:
 *   1. Connect on port 23
 *   2. Bridge sends "login: " → send username
 *   3. Bridge sends "password: " → send password
 *   4. Bridge sends "GNET> " prompt → ready
 *   5. Commands: #OUTPUT,<id>,1,<level>\r\n
 *   6. Queries:  ?OUTPUT,<id>,1\r\n
 *   7. Events:   ~OUTPUT,<id>,1,<level>  (pushed by bridge on device change)
 *
 * Default credentials: lutron / integration
 */
@Injectable()
export class LutronCasetaClientService extends EventEmitter {
  private readonly logger = new Logger(LutronCasetaClientService.name);

  private socket: net.Socket | null = null;
  private buffer = '';
  private connected = false;
  private host = '';
  private port = 23;
  private username = '';
  private password = '';

  /** Pending one-shot level query resolvers: integrationId → resolver */
  private pendingQueries = new Map<number, (level: number) => void>();

  // ── Connection ──────────────────────────────────────────────────────────────

  connect(host: string, port: number, username: string, password: string): Promise<boolean> {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    return this.openSocket();
  }

  disconnect(): void {
    this.connected = false;
    this.socket?.destroy();
    this.socket = null;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  // ── Commands ────────────────────────────────────────────────────────────────

  /** Set output level 0–100. Fade happens over fadeSecs seconds. */
  setLevel(integrationId: number, level: number, fadeSecs = 0): void {
    const clamped = Math.max(0, Math.min(100, Math.round(level * 100) / 100));
    this.send(`#OUTPUT,${integrationId},1,${clamped.toFixed(2)},${fadeSecs}`);
  }

  /** Query current level. Returns 0 on timeout (3 s). */
  getLevel(integrationId: number): Promise<number> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingQueries.delete(integrationId);
        resolve(0);
      }, 3000);

      this.pendingQueries.set(integrationId, (level) => {
        clearTimeout(timer);
        this.pendingQueries.delete(integrationId);
        resolve(level);
      });

      this.send(`?OUTPUT,${integrationId},1`);
    });
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private openSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      this.socket = sock;
      this.buffer = '';
      this.connected = false;

      const fail = () => resolve(false);

      sock.setTimeout(10000);
      sock.on('timeout', () => { sock.destroy(); fail(); });
      sock.on('error', (err) => {
        this.logger.warn(`Lutron socket error: ${err.message}`);
        this.connected = false;
        this.emit('disconnected');
      });

      sock.on('close', () => {
        if (this.connected) {
          this.connected = false;
          this.emit('disconnected');
        }
      });

      sock.on('data', (chunk: Buffer) => {
        this.buffer += chunk.toString();
        this.processBuffer(resolve);
      });

      sock.connect(this.port, this.host);
    });
  }

  private processBuffer(connectResolve?: (ok: boolean) => void): void {
    // Handle login sequence
    if (!this.connected) {
      if (this.buffer.includes('login:')) {
        this.buffer = '';
        this.socket!.write(this.username + '\r\n');
      } else if (this.buffer.includes('password:')) {
        this.buffer = '';
        this.socket!.write(this.password + '\r\n');
      } else if (this.buffer.includes('GNET>')) {
        this.buffer = '';
        this.connected = true;
        this.socket!.setTimeout(0); // disable timeout after login
        this.logger.log('Lutron Smart Bridge authenticated');
        connectResolve?.(true);
        return;
      }
      return;
    }

    // In command phase: process line by line
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? ''; // keep incomplete last line

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      if (line.startsWith('~OUTPUT,')) {
        this.parseOutputEvent(line);
      }
      // Future: ~DEVICE, ~SYSTEM, etc.
    }
  }

  private parseOutputEvent(line: string): void {
    // ~OUTPUT,<integrationId>,<action>,<level>
    const parts = line.split(',');
    if (parts.length < 4) return;

    const integrationId = parseInt(parts[1], 10);
    const action = parseInt(parts[2], 10);
    const level = parseFloat(parts[3]);

    if (isNaN(integrationId) || action !== 1 || isNaN(level)) return;

    // Resolve pending query if any
    const resolver = this.pendingQueries.get(integrationId);
    if (resolver) resolver(level);

    this.emit('output', { integrationId, level } satisfies LutronOutputEvent);
    this.logger.debug(`Lutron event: device ${integrationId} → ${level}%`);
  }

  private send(cmd: string): void {
    if (!this.connected || !this.socket) {
      this.logger.warn(`Lutron: cannot send "${cmd}" — not connected`);
      return;
    }
    this.socket.write(cmd + '\r\n');
  }
}
