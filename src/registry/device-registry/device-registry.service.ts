import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EventBusService } from '../../core/event-bus/event-bus.service';
import { DeviceEntity } from './device.entity';
import { EVENT_DEVICE_REGISTRY_UPDATED } from '../../common/constants/events.constants';

export interface DeviceIdentifier {
  integration: string;
  unique_id: string;
}

export interface DeviceInfo {
  identifiers: DeviceIdentifier[];
  name?: string;
  manufacturer?: string;
  model?: string;
  sw_version?: string;
  hw_version?: string;
  via_device?: DeviceIdentifier;
  configuration_url?: string;
}

export interface DeviceEntry {
  device_id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  sw_version: string | null;
  hw_version: string | null;
  area_id: string | null;
  identifiers: DeviceIdentifier[];
  integration: string | null;
  via_device_id: string | null;
  configuration_url: string | null;
}

/**
 * The Device Registry tracks physical and virtual devices.
 * Multiple entities can belong to a single device.
 * Devices are matched by their identifiers (integration + unique_id tuples).
 */
@Injectable()
export class DeviceRegistryService implements OnModuleInit {
  private readonly logger = new Logger(DeviceRegistryService.name);

  /** In-memory cache: device_id → DeviceEntry */
  private readonly devices = new Map<string, DeviceEntry>();

  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
    private readonly eventBus: EventBusService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadFromDatabase();
    this.logger.log(`Device Registry loaded with ${this.devices.size} devices`);
  }

  /**
   * Register or update a device.
   * Matches existing devices by identifiers before creating new ones.
   */
  async registerDevice(
    deviceInfo: DeviceInfo,
    integration: string,
  ): Promise<DeviceEntry> {
    // Try to find existing device by identifiers
    const existing = this.findByIdentifiers(deviceInfo.identifiers);

    if (existing) {
      return this.updateDevice(existing.device_id, {
        name: deviceInfo.name,
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        sw_version: deviceInfo.sw_version,
        hw_version: deviceInfo.hw_version,
        configuration_url: deviceInfo.configuration_url,
      });
    }

    // Create new device
    const deviceId = uuidv4();
    const entity = this.deviceRepo.create({
      device_id: deviceId,
      name: deviceInfo.name ?? 'Unknown Device',
      manufacturer: deviceInfo.manufacturer,
      model: deviceInfo.model,
      sw_version: deviceInfo.sw_version,
      hw_version: deviceInfo.hw_version,
      identifiers_json: JSON.stringify(deviceInfo.identifiers),
      integration,
      configuration_url: deviceInfo.configuration_url,
    });

    await this.deviceRepo.save(entity);

    const entry = this.entityToEntry(entity);
    this.devices.set(deviceId, entry);

    this.eventBus.fire(EVENT_DEVICE_REGISTRY_UPDATED, {
      action: 'create',
      device_id: deviceId,
    });

    this.logger.debug(`Device registered: ${deviceId} (${entity.name})`);
    return entry;
  }

  async updateDevice(
    deviceId: string,
    changes: Partial<Pick<DeviceEntry, 'name' | 'manufacturer' | 'model' | 'sw_version' | 'hw_version' | 'area_id' | 'configuration_url'>>,
  ): Promise<DeviceEntry> {
    if (!this.devices.has(deviceId)) {
      throw new NotFoundException(`Device '${deviceId}' not found`);
    }

    await this.deviceRepo.update({ device_id: deviceId }, changes as Partial<DeviceEntity>);
    const entity = await this.deviceRepo.findOne({ where: { device_id: deviceId } });
    const entry = this.entityToEntry(entity!);
    this.devices.set(deviceId, entry);

    this.eventBus.fire(EVENT_DEVICE_REGISTRY_UPDATED, {
      action: 'update',
      device_id: deviceId,
    });

    return entry;
  }

  getDevice(deviceId: string): DeviceEntry | null {
    return this.devices.get(deviceId) ?? null;
  }

  getDevices(): DeviceEntry[] {
    return Array.from(this.devices.values());
  }

  findByIdentifiers(identifiers: DeviceIdentifier[]): DeviceEntry | null {
    for (const device of this.devices.values()) {
      for (const identifier of identifiers) {
        const match = device.identifiers.some(
          (id) =>
            id.integration === identifier.integration &&
            id.unique_id === identifier.unique_id,
        );
        if (match) return device;
      }
    }
    return null;
  }

  getDevicesInArea(areaId: string): DeviceEntry[] {
    return Array.from(this.devices.values()).filter(
      (d) => d.area_id === areaId,
    );
  }

  private async loadFromDatabase(): Promise<void> {
    const entities = await this.deviceRepo.find();
    for (const entity of entities) {
      this.devices.set(entity.device_id, this.entityToEntry(entity));
    }
  }

  private entityToEntry(entity: DeviceEntity): DeviceEntry {
    return {
      device_id: entity.device_id,
      name: entity.name,
      manufacturer: entity.manufacturer ?? null,
      model: entity.model ?? null,
      sw_version: entity.sw_version ?? null,
      hw_version: entity.hw_version ?? null,
      area_id: entity.area_id ?? null,
      identifiers: entity.identifiers_json
        ? JSON.parse(entity.identifiers_json)
        : [],
      integration: entity.integration ?? null,
      via_device_id: entity.via_device_id ?? null,
      configuration_url: entity.configuration_url ?? null,
    };
  }
}
