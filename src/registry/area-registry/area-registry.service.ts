import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventBusService } from '../../core/event-bus/event-bus.service';
import { AreaEntity } from './area.entity';
import { EVENT_AREA_REGISTRY_UPDATED } from '../../common/constants/events.constants';

export interface AreaEntry {
  area_id: string;
  name: string;
  aliases: string[];
  picture: string | null;
}

export interface CreateAreaDto {
  name: string;
  aliases?: string[];
  picture?: string;
}

/**
 * The Area Registry tracks physical locations (rooms, floors, outdoor areas).
 * Entities and devices can be assigned to areas for organizational purposes.
 */
@Injectable()
export class AreaRegistryService implements OnModuleInit {
  private readonly logger = new Logger(AreaRegistryService.name);

  /** In-memory cache: area_id → AreaEntry */
  private readonly areas = new Map<string, AreaEntry>();

  constructor(
    @InjectRepository(AreaEntity)
    private readonly areaRepo: Repository<AreaEntity>,
    private readonly eventBus: EventBusService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadFromDatabase();
    this.logger.log(`Area Registry loaded with ${this.areas.size} areas`);
  }

  /**
   * Create a new area.
   */
  async createArea(dto: CreateAreaDto): Promise<AreaEntry> {
    const areaId = this.generateAreaId(dto.name);

    if (this.areas.has(areaId)) {
      throw new ConflictException(`Area with ID '${areaId}' already exists`);
    }

    const entity = this.areaRepo.create({
      area_id: areaId,
      name: dto.name,
      aliases_json: JSON.stringify(dto.aliases ?? []),
      picture: dto.picture,
    });

    await this.areaRepo.save(entity);

    const entry = this.entityToEntry(entity);
    this.areas.set(areaId, entry);

    this.eventBus.fire(EVENT_AREA_REGISTRY_UPDATED, {
      action: 'create',
      area_id: areaId,
    });

    this.logger.log(`Area created: ${areaId} (${dto.name})`);
    return entry;
  }

  /**
   * Update an existing area.
   */
  async updateArea(
    areaId: string,
    changes: Partial<CreateAreaDto>,
  ): Promise<AreaEntry> {
    if (!this.areas.has(areaId)) {
      throw new NotFoundException(`Area '${areaId}' not found`);
    }

    const updates: Partial<AreaEntity> = {};
    if (changes.name !== undefined) updates.name = changes.name;
    if (changes.aliases !== undefined)
      updates.aliases_json = JSON.stringify(changes.aliases);
    if (changes.picture !== undefined) updates.picture = changes.picture;

    await this.areaRepo.update({ area_id: areaId }, updates);

    const entity = await this.areaRepo.findOne({ where: { area_id: areaId } });
    const entry = this.entityToEntry(entity!);
    this.areas.set(areaId, entry);

    this.eventBus.fire(EVENT_AREA_REGISTRY_UPDATED, {
      action: 'update',
      area_id: areaId,
    });

    return entry;
  }

  /**
   * Delete an area.
   */
  async deleteArea(areaId: string): Promise<void> {
    if (!this.areas.has(areaId)) {
      throw new NotFoundException(`Area '${areaId}' not found`);
    }

    await this.areaRepo.delete({ area_id: areaId });
    this.areas.delete(areaId);

    this.eventBus.fire(EVENT_AREA_REGISTRY_UPDATED, {
      action: 'remove',
      area_id: areaId,
    });

    this.logger.log(`Area deleted: ${areaId}`);
  }

  /** Get area by ID */
  getArea(areaId: string): AreaEntry | null {
    return this.areas.get(areaId) ?? null;
  }

  /** Get all areas */
  getAreas(): AreaEntry[] {
    return Array.from(this.areas.values());
  }

  private async loadFromDatabase(): Promise<void> {
    const entities = await this.areaRepo.find();
    for (const entity of entities) {
      this.areas.set(entity.area_id, this.entityToEntry(entity));
    }
  }

  private entityToEntry(entity: AreaEntity): AreaEntry {
    return {
      area_id: entity.area_id,
      name: entity.name,
      aliases: entity.aliases_json ? JSON.parse(entity.aliases_json) : [],
      picture: entity.picture ?? null,
    };
  }

  private generateAreaId(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 50);
  }
}
