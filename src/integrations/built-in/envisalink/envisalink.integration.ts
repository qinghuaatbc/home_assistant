import { Injectable, Logger } from '@nestjs/common';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../../core/service-registry/service-registry.service';
import { EntityRegistryService } from '../../../registry/entity-registry/entity-registry.service';
import { ContextService } from '../../../core/context/context.service';
import { HaIntegration, IntegrationConfig, IntegrationManifest } from '../../interfaces/integration.interface';
import { ServiceCall } from '../../../core/service-registry/interfaces/ha-service.interface';
import * as net from 'net';
import { DOMAIN_ENVISALINK, EVL_COMMANDS, EVL_RESPONSE_PREFIX } from './envisalink.constants';

interface ZoneDef {
  name: string;
  type: string;
}

interface PartitionDef {
  name: string;
}

interface EnvisalinkConfig {
  host: string;
  port?: number;
  panel_type?: string;
  user_name?: string;
  password?: string;
  code?: string;
  evl_version?: number;
  keepalive_interval?: number;
  zonedump_interval?: number;
  timeout?: number;
  panic_type?: string;
  zones?: Record<string, ZoneDef>;
  partitions?: Record<string, PartitionDef>;
}

@Injectable()
export class EnvisalinkIntegration implements HaIntegration {
  private readonly logger = new Logger(EnvisalinkIntegration.name);
  readonly manifest: IntegrationManifest = {
    domain: DOMAIN_ENVISALINK,
    name: 'EnvisaLink',
    version: '1.0.0',
    iot_class: 'local_push',
  };
  private socket: net.Socket | null = null;
  private buffer = '';
  private connTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private keepTimer: ReturnType<typeof setInterval> | null = null;
  private authenticated = false;
  private password = '';
  private cfg!: EnvisalinkConfig;

  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly entityRegistry: EntityRegistryService,
    private readonly contextService: ContextService,
  ) {}

  async setup(config: IntegrationConfig): Promise<boolean> {
    this.cfg = config as unknown as EnvisalinkConfig;
    if (!this.cfg.host) { this.logger.error('EnvisaLink: host required'); return false; }

    this.password = this.cfg.password || this.cfg.user_name || 'user';

    // Register partitions as alarm_control_panel entities
    if (this.cfg.partitions) {
      for (const [num, def] of Object.entries(this.cfg.partitions)) {
        const eid = `alarm_control_panel.envisalink_partition_${num}`;
        await this.entityRegistry.registerEntity({
          entity_id: eid, platform: 'envisalink', name: def.name, original_name: def.name,
        });
        this.stateMachine.setState(eid, 'off', { friendly_name: def.name, device_class: 'alarm' }, this.contextService.system());
      }
    }

    // Register zones as binary_sensor entities
    if (this.cfg.zones) {
      for (const [num, def] of Object.entries(this.cfg.zones)) {
        const eid = `binary_sensor.envisalink_zone_${num}`;
        await this.entityRegistry.registerEntity({
          entity_id: eid, platform: 'envisalink', name: def.name, original_name: def.name,
        });
        this.stateMachine.setState(eid, 'off', {
          friendly_name: def.name, device_class: def.type || 'door',
          envisalink_zone: parseInt(num),
        }, this.contextService.system());
      }
    }

    // Register alarm services
    this.serviceRegistry.register({
      domain: 'alarm_control_panel', service: 'alarm_disarm', name: 'Disarm', description: 'Disarm',
      fields: { code: { description: 'Code' } },
      handler: async (call: ServiceCall) => {
        const code = (call.service_data?.code as string) || this.cfg.code || '1234';
        this.send(`${EVL_COMMANDS.DISARM}${code}`);
      },
    });
    this.serviceRegistry.register({
      domain: 'alarm_control_panel', service: 'alarm_arm_home', name: 'Arm Stay', description: 'Arm stay',
      fields: {},
      handler: async () => this.send(EVL_COMMANDS.ARM_STAY),
    });
    this.serviceRegistry.register({
      domain: 'alarm_control_panel', service: 'alarm_arm_away', name: 'Arm Away', description: 'Arm away',
      fields: {},
      handler: async () => this.send(EVL_COMMANDS.ARM_AWAY),
    });

    this.connect();
    return true;
  }

  private connect() {
    const host = this.cfg.host;
    const port = this.cfg.port || 4025;
    if (this.socket) this.socket.destroy();
    this.authenticated = false;
    this.socket = new net.Socket();
    this.socket.setTimeout((this.cfg.timeout || 10) * 1000);
    this.socket.connect(port, host, () => this.logger.log(`EnvisaLink: connected to ${host}:${port}`));
    this.socket.on('data', (data) => this.onData(data.toString()));
    this.socket.on('close', () => {
      this.logger.warn('EnvisaLink: disconnected, reconnecting in 30s');
      this.authenticated = false;
      this.connTimer = setTimeout(() => this.connect(), 30000);
    });
    this.socket.on('timeout', () => { this.logger.warn('EnvisaLink: timeout'); this.socket?.destroy(); });
    this.socket.on('error', (err) => this.logger.error(`EnvisaLink: ${err.message}`));
  }

  private onData(data: string) {
    this.buffer += data;
    const lines = this.buffer.split('\r\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      if (!this.authenticated && line.startsWith('Login:')) {
        this.socket?.write(`${this.password}\r\n`);
      } else if (!this.authenticated && line.includes('Password:')) {
        this.socket?.write(`${this.password}\r\n`);
      } else if (!this.authenticated && line.trim() === 'OK') {
        this.authenticated = true;
        this.logger.log('EnvisaLink: authenticated');
        this.startPolls();
      } else if (this.authenticated) {
        this.parseMessage(line);
      }
    }
  }

  private startPolls() {
    this.send(EVL_COMMANDS.PARTITION_STATUS);
    this.send(EVL_COMMANDS.ZONE_STATUS);
    const zi = (this.cfg.zonedump_interval || 30) * 1000;
    this.pollTimer = setInterval(() => this.send(EVL_COMMANDS.ZONE_STATUS), zi);
    const ki = (this.cfg.keepalive_interval || 60) * 1000;
    this.keepTimer = setInterval(() => this.send(EVL_COMMANDS.PARTITION_STATUS), ki);
  }

  private parseMessage(line: string) {
    const parts = line.split(',');
    const prefix = parts[0];
    if (prefix === '510' || prefix === '511') {
      const pNum = parseInt(parts[1] || '1', 10);
      const status = parseInt(parts[2] || '0', 16);
      const stateStr = status === 1 ? 'disarmed' : status === 2 ? 'armed_home' : status === 4 ? 'armed_away' : 'disarmed';
      const eid = `alarm_control_panel.envisalink_partition_${pNum}`;
      this.stateMachine.setState(eid, stateStr, {}, this.contextService.system());
    } else if (prefix.startsWith('60')) {
      const zoneNum = parseInt(parts[1] || '0', 10);
      const status = parseInt(parts[2] || '0', 16);
      const isOpen = status !== 0;
      const eid = `binary_sensor.envisalink_zone_${zoneNum}`;
      this.stateMachine.setState(eid, isOpen ? 'on' : 'off', {}, this.contextService.system());
    }
  }

  private send(cmd: string) {
    if (this.socket && this.authenticated) this.socket.write(`${cmd}\r\n`);
  }

  async teardown(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.keepTimer) clearInterval(this.keepTimer);
    if (this.connTimer) clearTimeout(this.connTimer);
    this.socket?.destroy();
    this.socket = null;
  }
}
