import { Injectable, Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import * as xml2js from 'xml2js';

export interface IsyEvent {
  /** Node address that changed */
  address: string;
  /** Control action (e.g. "DON", "DOF", "ST") */
  control: string;
  /** New value (0-255) */
  action: number | null;
  /** Raw event node */
  node: string;
}

export type IsyEventHandler = (event: IsyEvent) => void;

/**
 * Manages the ISY994 WebSocket subscription for real-time node events.
 *
 * The ISY994 pushes XML events over WebSocket whenever a device
 * changes state. This service maintains the connection with
 * auto-reconnect on failure.
 *
 * Protocol:
 *   ws://<user>:<pass>@<host>:<port>/rest/subscribe
 *   Sec-WebSocket-Protocol: ISYSUB
 *   Origin: com.universal-devices.websockets.isy
 */
@Injectable()
export class Isy994SubscriptionService {
  private readonly logger = new Logger(Isy994SubscriptionService.name);
  private readonly parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });

  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private running = false;

  private wsUrl = '';
  private readonly handlers: IsyEventHandler[] = [];

  /**
   * Start the WebSocket subscription.
   * Auto-reconnects on disconnect/error with exponential backoff.
   */
  start(wsUrl: string): void {
    this.wsUrl = wsUrl;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    this.logger.log('ISY994 subscription stopped');
  }

  /** Register a handler for ISY node events */
  onEvent(handler: IsyEventHandler): void {
    this.handlers.push(handler);
  }

  private connect(): void {
    if (!this.running) return;

    this.logger.log(`Connecting to ISY994 WebSocket: ${this.wsUrl.replace(/:\/\/[^@]+@/, '://<credentials>@')}`);

    try {
      this.ws = new WebSocket(this.wsUrl, 'ISYSUB', {
        headers: {
          Origin: 'com.universal-devices.websockets.isy',
          'Sec-WebSocket-Protocol': 'ISYSUB',
        },
        rejectUnauthorized: false, // Allow self-signed certs on LAN
      });

      this.ws.on('open', () => {
        this.logger.log('ISY994 WebSocket connected');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString()).catch((err: Error) =>
          this.logger.error(`ISY event parse error: ${err.message}`),
        );
      });

      this.ws.on('close', (code: number) => {
        this.logger.warn(`ISY994 WebSocket closed (code ${code}), reconnecting...`);
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: Error) => {
        this.logger.error(`ISY994 WebSocket error: ${err.message}`);
        // close event will fire after error and trigger reconnect
      });
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`ISY994 WebSocket connect failed: ${error.message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(delayMs = 5000): void {
    if (!this.running || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  /**
   * Parse an ISY event XML message and dispatch to handlers.
   *
   * ISY event format:
   * <Event seqnum="N" sid="...">
   *   <control>DON</control>
   *   <action>255</action>
   *   <node>1A 2B 3C 1</node>
   *   <eventInfo></eventInfo>
   * </Event>
   */
  private async handleMessage(xml: string): Promise<void> {
    if (!xml.includes('<Event') && !xml.includes('<event')) return;

    const parsed = await new Promise<Record<string, unknown>>((resolve, reject) => {
      this.parser.parseString(xml, (err: Error | null, result: unknown) => {
        if (err) reject(err);
        else resolve(result as Record<string, unknown>);
      });
    });

    const event = (parsed['Event'] ?? parsed['event']) as Record<string, unknown> | undefined;
    if (!event) return;

    const control = (event['control'] as string) ?? '';
    const actionRaw = event['action'] as string | undefined;
    const node = (event['node'] as string) ?? '';

    // Filter: we only care about node control events
    if (!node || !control) return;
    // Ignore heartbeat / subscription confirmation events
    if (control === '_0' || control === 'RR') return;

    const isy_event: IsyEvent = {
      address: node.trim(),
      control: control.trim(),
      action: actionRaw !== undefined && actionRaw !== '' ? parseInt(actionRaw, 10) : null,
      node: node.trim(),
    };

    this.logger.verbose(
      `ISY event: ${isy_event.address} ${isy_event.control}=${isy_event.action}`,
    );

    for (const handler of this.handlers) {
      try {
        handler(isy_event);
      } catch (err: unknown) {
        this.logger.error(`ISY event handler error: ${(err as Error).message}`);
      }
    }
  }
}
