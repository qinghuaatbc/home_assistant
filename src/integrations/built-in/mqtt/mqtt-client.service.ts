import { Injectable, Logger } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { EventEmitter } from 'events';
import {
  DEFAULT_BROKER_PORT,
  DEFAULT_KEEPALIVE,
  DEFAULT_RECONNECT_PERIOD,
  DEFAULT_CONNECT_TIMEOUT,
  MqttQoS,
} from './mqtt.constants';

export interface MqttMessage {
  topic: string;
  payload: string;
}

/**
 * Thin wrapper around the `mqtt` npm client.
 * Emits:
 *   'message'     — { topic, payload } on every inbound message
 *   'connected'   — broker is ready (initial + every reconnect)
 *   'disconnected'— connection lost
 */
@Injectable()
export class MqttClientService extends EventEmitter {
  private readonly logger = new Logger(MqttClientService.name);
  private client: mqtt.MqttClient | null = null;
  private _connected = false;

  get isConnected(): boolean {
    return this._connected;
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  connect(
    broker: string,
    port: number = DEFAULT_BROKER_PORT,
    username?: string,
    password?: string,
    clientId?: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const url = `mqtt://${broker}:${port}`;
      const options: mqtt.IClientOptions = {
        clientId: clientId ?? `ha_${Math.random().toString(16).slice(2, 10)}`,
        keepalive: DEFAULT_KEEPALIVE,
        reconnectPeriod: DEFAULT_RECONNECT_PERIOD,
        connectTimeout: DEFAULT_CONNECT_TIMEOUT,
        clean: true,
        ...(username ? { username } : {}),
        ...(password ? { password } : {}),
      };

      this.logger.log(`MQTT connecting to ${url}`);
      this.client = mqtt.connect(url, options);

      // Track whether we've already resolved the setup Promise
      let initialResolved = false;
      const resolveOnce = (ok: boolean) => {
        if (!initialResolved) {
          initialResolved = true;
          resolve(ok);
        }
      };

      // Permanent connect handler — fires on initial connect AND every reconnect
      this.client.on('connect', () => {
        this._connected = true;
        this.logger.log(`MQTT connected to ${broker}:${port}`);
        this.emit('connected');
        resolveOnce(true);
      });

      // Permanent error handler
      this.client.on('error', (err: Error) => {
        this.logger.warn(`MQTT error: ${err.message}`);
        resolveOnce(false);
      });

      this.client.on('reconnect', () => {
        this.logger.log('MQTT reconnecting...');
      });

      this.client.on('offline', () => {
        if (this._connected) {
          this._connected = false;
          this.logger.warn('MQTT offline — will reconnect');
          this.emit('disconnected');
        }
      });

      this.client.on('close', () => {
        if (this._connected) {
          this._connected = false;
          this.emit('disconnected');
        }
      });

      this.client.on('message', (topic: string, payload: Buffer) => {
        const msg: MqttMessage = { topic, payload: payload.toString() };
        this.logger.debug(`MQTT ← ${topic}: ${msg.payload}`);
        this.emit('message', msg);
      });
    });
  }

  disconnect(): void {
    this._connected = false;
    this.client?.end(true);
    this.client = null;
  }

  // ── Pub / Sub ───────────────────────────────────────────────────────────────

  subscribe(topic: string, qos: MqttQoS = 0): void {
    if (!this.client) return;
    this.client.subscribe(topic, { qos }, (err) => {
      if (err) {
        this.logger.error(`MQTT subscribe error for "${topic}": ${err.message}`);
      } else {
        this.logger.log(`MQTT subscribed: ${topic}`);
      }
    });
  }

  publish(topic: string, payload: string, qos: MqttQoS = 0, retain = false): void {
    if (!this.client || !this._connected) {
      this.logger.warn(`MQTT: cannot publish to "${topic}" — not connected`);
      return;
    }
    this.client.publish(topic, payload, { qos, retain }, (err) => {
      if (err) {
        this.logger.error(`MQTT publish error for "${topic}": ${err.message}`);
      } else {
        this.logger.debug(`MQTT → ${topic}: ${payload}`);
      }
    });
  }
}
