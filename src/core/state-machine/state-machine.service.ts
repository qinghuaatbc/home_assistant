import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { EventBusService } from '../event-bus/event-bus.service';
import { ContextService } from '../context/context.service';
import { HaState } from './interfaces/ha-state.interface';
import { StateHistoryEntity } from './state.entity';
import { StateContext } from '../context/ha-context.interface';
import {
  EVENT_STATE_CHANGED,
  EVENT_HOMEASSISTANT_START,
} from '../../common/constants/events.constants';
import { StateChangedData } from '../event-bus/events/ha-event.interface';

/**
 * The State Machine is the central store for all entity states.
 *
 * Design principles from Home Assistant:
 * 1. Current states are held in-memory for O(1) access
 * 2. State objects are immutable (frozen after creation)
 * 3. Every state change fires a `state_changed` event on the bus
 * 4. `last_changed` only updates when the state STRING changes
 * 5. `last_updated` updates on every call (including attribute-only changes)
 * 6. History is persisted to SQLite asynchronously
 * 7. On restart, states are restored from the last known state per entity
 */
@Injectable()
export class StateMachineService implements OnModuleInit {
  private readonly logger = new Logger(StateMachineService.name);

  /** In-memory state store: entity_id → current HaState */
  private readonly states = new Map<string, HaState>();

  private readonly snapshotPath = path.resolve(
    process.env.HA_CONFIG_PATH
      ? path.dirname(process.env.HA_CONFIG_PATH)
      : path.resolve(process.cwd(), 'config'),
    'state-snapshot.json',
  );
  private snapshotTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(StateHistoryEntity)
    private readonly stateRepo: Repository<StateHistoryEntity>,
    private readonly eventBus: EventBusService,
    private readonly contextService: ContextService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.eventBus.listen(EVENT_HOMEASSISTANT_START, async () => {
      await this.restoreStates();
      // Snapshot every 30s so restart loses at most 30s of state
      this.snapshotTimer = setInterval(() => this.saveSnapshot(), 30_000);
    });

    // Prune history older than 30 days, run once at startup then every 24 hours
    const pruneHistory = async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      try {
        const result = await this.stateRepo.createQueryBuilder()
          .delete()
          .where('last_updated < :cutoff', { cutoff })
          .execute();
        if (result.affected) this.logger.log(`Pruned ${result.affected} history records older than 30 days`);
      } catch (err) {
        this.logger.error(`History pruning failed: ${(err as Error).message}`);
      }
    };
    pruneHistory();
    setInterval(pruneHistory, 24 * 60 * 60 * 1000);
  }

  /**
   * Set (or update) the state of an entity.
   *
   * - Creates a new immutable HaState object
   * - Fires `state_changed` event with old and new state
   * - Persists to history asynchronously
   *
   * @param entityId - Entity ID (e.g., "light.living_room")
   * @param state - New state value (e.g., "on")
   * @param attributes - New attributes (merged with existing if forceAttributes=false)
   * @param context - Context for tracking user/automation origin
   * @returns The new HaState object
   */
  setState(
    entityId: string,
    state: string,
    attributes: Record<string, unknown> = {},
    context?: StateContext,
  ): HaState {
    const now = new Date().toISOString();
    const ctx = context ?? this.contextService.system();
    const oldState = this.states.get(entityId) ?? null;

    // Determine if the state VALUE changed (not just attributes)
    const stateChanged = oldState === null || oldState.state !== state;
    const lastChanged = stateChanged ? now : (oldState?.last_changed ?? now);

    const newState: HaState = Object.freeze({
      entity_id: entityId,
      state,
      attributes: Object.freeze({ ...attributes }),
      last_changed: lastChanged,
      last_updated: now,
      context: ctx,
    });

    this.states.set(entityId, newState);

    // Fire state_changed event synchronously
    this.eventBus.fire<StateChangedData>(
      EVENT_STATE_CHANGED,
      {
        entity_id: entityId,
        old_state: oldState,
        new_state: newState,
      },
      ctx,
    );

    // Skip DB write when nothing actually changed (same state + same serialized attributes)
    const attrsJson = JSON.stringify(attributes);
    const prevAttrsJson = oldState ? JSON.stringify(oldState.attributes) : null;
    if (oldState && oldState.state === state && prevAttrsJson === attrsJson) {
      return newState;
    }

    // Persist to history asynchronously (don't block)
    this.persistState(newState, attrsJson).catch((err: Error) =>
      this.logger.error(
        `Failed to persist state for ${entityId}: ${err.message}`,
      ),
    );

    this.logger.debug(`State set: ${entityId} → ${state}`);
    return newState;
  }

  /**
   * Get the current state of an entity.
   * Returns null if the entity has never been seen.
   */
  getState(entityId: string): HaState | null {
    return this.states.get(entityId) ?? null;
  }

  /**
   * Get all current states.
   */
  getStates(): HaState[] {
    return Array.from(this.states.values());
  }

  /**
   * Check if an entity exists in the state machine.
   */
  hasEntity(entityId: string): boolean {
    return this.states.has(entityId);
  }

  /**
   * Remove an entity from the state machine.
   * Fires state_changed with new_state=null.
   */
  removeEntity(entityId: string): void {
    const oldState = this.states.get(entityId);
    if (!oldState) return;

    this.states.delete(entityId);

    this.eventBus.fire<StateChangedData>(
      EVENT_STATE_CHANGED,
      {
        entity_id: entityId,
        old_state: oldState,
        new_state: null,
      },
      this.contextService.system(),
    );

    this.logger.debug(`Entity removed from state machine: ${entityId}`);
  }

  /**
   * Get state history for an entity within a time range.
   */
  async getHistory(
    entityId: string,
    startTime: Date,
    endTime?: Date,
  ): Promise<StateHistoryEntity[]> {
    const query = this.stateRepo
      .createQueryBuilder('s')
      .where('s.entity_id = :entityId', { entityId })
      .andWhere('s.last_updated >= :startTime', {
        startTime: startTime.toISOString(),
      })
      .orderBy('s.last_updated', 'ASC');

    if (endTime) {
      query.andWhere('s.last_updated <= :endTime', {
        endTime: endTime.toISOString(),
      });
    }

    return query.getMany();
  }

  /**
   * Get state history for multiple entities.
   */
  async getHistoryMultiple(
    entityIds: string[],
    startTime: Date,
    endTime?: Date,
  ): Promise<Map<string, StateHistoryEntity[]>> {
    const query = this.stateRepo
      .createQueryBuilder('s')
      .where('s.entity_id IN (:...entityIds)', { entityIds })
      .andWhere('s.last_updated >= :startTime', {
        startTime: startTime.toISOString(),
      })
      .orderBy('s.last_updated', 'ASC');

    if (endTime) {
      query.andWhere('s.last_updated <= :endTime', {
        endTime: endTime.toISOString(),
      });
    }

    const records = await query.getMany();
    const result = new Map<string, StateHistoryEntity[]>();

    for (const record of records) {
      if (!result.has(record.entity_id)) {
        result.set(record.entity_id, []);
      }
      result.get(record.entity_id)!.push(record);
    }

    return result;
  }

  private saveSnapshot(): void {
    try {
      const data = Object.fromEntries(this.states);
      fs.writeFileSync(this.snapshotPath, JSON.stringify(data), 'utf-8');
    } catch (err) {
      this.logger.warn(`Snapshot write failed: ${(err as Error).message}`);
    }
  }

  /**
   * Restore states from DB on startup.
   * Loads the most recent state per entity from history.
   */
  private async restoreStates(): Promise<void> {
    this.logger.log('Restoring states from database...');

    // Load snapshot (more recent than DB for last 30s window)
    const snapshot: Record<string, HaState> = {};
    if (fs.existsSync(this.snapshotPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.snapshotPath, 'utf-8'));
        Object.assign(snapshot, raw);
        this.logger.log(`Loaded state snapshot: ${Object.keys(snapshot).length} entities`);
      } catch {
        this.logger.warn('Failed to read state snapshot, falling back to DB only');
      }
    }

    try {
      // Get the most recent state record per entity
      const subQuery = this.stateRepo
        .createQueryBuilder('sub')
        .select('MAX(sub.id)', 'maxId')
        .groupBy('sub.entity_id');

      const latestStates = await this.stateRepo
        .createQueryBuilder('s')
        .where(`s.id IN (${subQuery.getQuery()})`)
        .setParameters(subQuery.getParameters())
        .getMany();

      let restoredCount = 0;
      for (const record of latestStates) {
        try {
          const attributes = record.attributes_json
            ? JSON.parse(record.attributes_json)
            : {};

          const dbState: HaState = Object.freeze({
            entity_id: record.entity_id,
            state: record.state || 'unknown',
            attributes: Object.freeze(attributes),
            last_changed: record.last_changed || record.created_at.toISOString(),
            last_updated: record.last_updated || record.created_at.toISOString(),
            context: {
              id: record.context_id || '',
              parent_id: record.context_parent_id || null,
              user_id: record.context_user_id || null,
            },
          });

          // Use snapshot if it's newer than DB record (covers the last 30s window)
          const snap = snapshot[record.entity_id];
          const useSnap = snap && snap.last_updated > dbState.last_updated;
          this.states.set(record.entity_id, useSnap ? Object.freeze({ ...snap, attributes: Object.freeze(snap.attributes) }) : dbState);
          restoredCount++;
        } catch {
          this.logger.warn(
            `Failed to restore state for ${record.entity_id}`,
          );
        }
      }

      // Also apply snapshot entries not in DB (very recent, never persisted)
      for (const [entityId, snap] of Object.entries(snapshot)) {
        if (!this.states.has(entityId)) {
          this.states.set(entityId, Object.freeze({ ...snap, attributes: Object.freeze(snap.attributes) }));
          restoredCount++;
        }
      }

      this.logger.log(`Restored ${restoredCount} entity states from database`);
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`Failed to restore states: ${error.message}`);
    }
  }

  /**
   * Persist a state to the history table (append-only, uses insert not save).
   */
  private async persistState(state: HaState, attrsJson: string): Promise<void> {
    await this.stateRepo.insert({
      entity_id: state.entity_id,
      state: state.state,
      attributes_json: attrsJson,
      last_changed: state.last_changed,
      last_updated: state.last_updated,
      context_id: state.context.id,
      context_user_id: state.context.user_id ?? '',
      context_parent_id: state.context.parent_id ?? '',
    });
  }
}
