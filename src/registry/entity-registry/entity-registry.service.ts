import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventBusService } from '../../core/event-bus/event-bus.service';
import { EntityRegistryEntity } from './entity.entity';
import { EVENT_ENTITY_REGISTRY_UPDATED } from '../../common/constants/events.constants';

export interface EntityEntry {
  entity_id: string;
  platform: string;
  unique_id: string | null;
  name: string | null;
  original_name: string | null;
  icon: string | null;
  device_id: string | null;
  area_id: string | null;
  disabled: boolean;
  disabled_by: string | null;
  unit_of_measurement: string | null;
  device_class: string | null;
}

export interface RegisterEntityDto {
  entity_id: string;
  platform: string;
  unique_id?: string;
  name?: string;
  original_name?: string;
  icon?: string;
  device_id?: string;
  area_id?: string;
  unit_of_measurement?: string;
  device_class?: string;
}

/** Pattern: domain.object_id */
const ENTITY_ID_PATTERN = /^[a-z_]+\.[a-z0-9_]+$/;

/**
 * The Entity Registry tracks all entities seen by Home Assistant.
 * It provides persistent storage of entity metadata including user customizations.
 *
 * Key behaviors:
 * - Entities are identified by entity_id AND unique_id (platform-specific stable ID)
 * - Users can rename, reassign areas, or disable entities via this registry
 * - Registry is kept in-memory for fast lookup, persisted to SQLite
 */
@Injectable()
export class EntityRegistryService implements OnModuleInit {
  private readonly logger = new Logger(EntityRegistryService.name);

  /** In-memory: entity_id → EntityEntry */
  private readonly entities = new Map<string, EntityEntry>();

  /** In-memory: "platform.unique_id" → entity_id */
  private readonly uniqueIdIndex = new Map<string, string>();

  constructor(
    @InjectRepository(EntityRegistryEntity)
    private readonly entityRepo: Repository<EntityRegistryEntity>,
    private readonly eventBus: EventBusService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadFromDatabase();
    this.logger.log(
      `Entity Registry loaded with ${this.entities.size} entities`,
    );
  }

  /**
   * Register an entity.
   * If an entity with this entity_id already exists, update it.
   * If a unique_id match is found, use the existing entity_id.
   */
  async registerEntity(dto: RegisterEntityDto): Promise<EntityEntry> {
    this.validateEntityId(dto.entity_id);

    // Check for unique_id collision (same unique_id = same entity, possibly renamed)
    if (dto.unique_id) {
      const indexKey = `${dto.platform}.${dto.unique_id}`;
      const existingEntityId = this.uniqueIdIndex.get(indexKey);
      if (existingEntityId && existingEntityId !== dto.entity_id) {
        this.logger.debug(
          `Entity ${dto.entity_id} matched existing entity ${existingEntityId} by unique_id`,
        );
      }
    }

    if (this.entities.has(dto.entity_id)) {
      // Update existing entity (integration info only, preserve user customizations)
      return this.updateEntityInternal(dto.entity_id, {
        platform: dto.platform,
        unique_id: dto.unique_id,
        original_name: dto.original_name ?? dto.name,
        device_id: dto.device_id,
        unit_of_measurement: dto.unit_of_measurement,
        device_class: dto.device_class,
      });
    }

    // Create new entity
    const entity = this.entityRepo.create({
      entity_id: dto.entity_id,
      platform: dto.platform,
      unique_id: dto.unique_id,
      name: dto.name,
      original_name: dto.original_name ?? dto.name,
      icon: dto.icon,
      device_id: dto.device_id,
      area_id: dto.area_id,
      unit_of_measurement: dto.unit_of_measurement,
      device_class: dto.device_class,
      disabled: false,
    });

    await this.entityRepo.save(entity);
    const entry = this.dbEntityToEntry(entity);
    this.entities.set(dto.entity_id, entry);

    if (dto.unique_id) {
      this.uniqueIdIndex.set(`${dto.platform}.${dto.unique_id}`, dto.entity_id);
    }

    this.eventBus.fire(EVENT_ENTITY_REGISTRY_UPDATED, {
      action: 'create',
      entity_id: dto.entity_id,
    });

    this.logger.debug(`Entity registered: ${dto.entity_id}`);
    return entry;
  }

  /**
   * Update user-facing entity properties (name, icon, area_id, disabled).
   */
  async updateEntity(
    entityId: string,
    changes: Partial<Pick<EntityEntry, 'name' | 'icon' | 'area_id' | 'disabled' | 'disabled_by'>>,
  ): Promise<EntityEntry> {
    if (!this.entities.has(entityId)) {
      throw new NotFoundException(`Entity '${entityId}' not found`);
    }

    return this.updateEntityInternal(entityId, changes as Partial<EntityRegistryEntity>);
  }

  private async updateEntityInternal(
    entityId: string,
    changes: Partial<EntityRegistryEntity>,
  ): Promise<EntityEntry> {
    await this.entityRepo.update({ entity_id: entityId }, changes);
    const entity = await this.entityRepo.findOne({
      where: { entity_id: entityId },
    });
    const entry = this.dbEntityToEntry(entity!);
    this.entities.set(entityId, entry);

    this.eventBus.fire(EVENT_ENTITY_REGISTRY_UPDATED, {
      action: 'update',
      entity_id: entityId,
    });

    return entry;
  }

  /**
   * Remove an entity from the registry.
   */
  async removeEntity(entityId: string): Promise<void> {
    const entry = this.entities.get(entityId);
    if (!entry) {
      throw new NotFoundException(`Entity '${entityId}' not found`);
    }

    if (entry.unique_id) {
      this.uniqueIdIndex.delete(`${entry.platform}.${entry.unique_id}`);
    }

    await this.entityRepo.delete({ entity_id: entityId });
    this.entities.delete(entityId);

    this.eventBus.fire(EVENT_ENTITY_REGISTRY_UPDATED, {
      action: 'remove',
      entity_id: entityId,
    });
  }

  getEntity(entityId: string): EntityEntry | null {
    return this.entities.get(entityId) ?? null;
  }

  getEntities(): EntityEntry[] {
    return Array.from(this.entities.values());
  }

  getEntitiesByPlatform(platform: string): EntityEntry[] {
    return Array.from(this.entities.values()).filter(
      (e) => e.platform === platform,
    );
  }

  getEntitiesByArea(areaId: string): EntityEntry[] {
    return Array.from(this.entities.values()).filter(
      (e) => e.area_id === areaId,
    );
  }

  getEntitiesByDevice(deviceId: string): EntityEntry[] {
    return Array.from(this.entities.values()).filter(
      (e) => e.device_id === deviceId,
    );
  }

  private validateEntityId(entityId: string): void {
    if (!ENTITY_ID_PATTERN.test(entityId)) {
      throw new BadRequestException(
        `Invalid entity_id format: '${entityId}'. Must match pattern: domain.object_id`,
      );
    }
  }

  private async loadFromDatabase(): Promise<void> {
    const entities = await this.entityRepo.find();
    for (const entity of entities) {
      const entry = this.dbEntityToEntry(entity);
      this.entities.set(entity.entity_id, entry);
      if (entity.unique_id) {
        this.uniqueIdIndex.set(
          `${entity.platform}.${entity.unique_id}`,
          entity.entity_id,
        );
      }
    }
  }

  private dbEntityToEntry(entity: EntityRegistryEntity): EntityEntry {
    return {
      entity_id: entity.entity_id,
      platform: entity.platform,
      unique_id: entity.unique_id ?? null,
      name: entity.name ?? null,
      original_name: entity.original_name ?? null,
      icon: entity.icon ?? null,
      device_id: entity.device_id ?? null,
      area_id: entity.area_id ?? null,
      disabled: entity.disabled,
      disabled_by: entity.disabled_by ?? null,
      unit_of_measurement: entity.unit_of_measurement ?? null,
      device_class: entity.device_class ?? null,
    };
  }
}
