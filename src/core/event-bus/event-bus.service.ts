import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from 'eventemitter2';
import { v4 as uuidv4 } from 'uuid';
import { HaEvent } from './events/ha-event.interface';
import { StateContext } from '../context/ha-context.interface';

/** Listener function type */
export type EventListener<T = unknown> = (event: HaEvent<T>) => void | Promise<void>;

/** Returns an unsubscribe function */
export type Unsubscribe = () => void;

/**
 * The Event Bus is the backbone of Home Assistant's architecture.
 * All components communicate through events fired on this bus.
 *
 * Features:
 * - Wildcard subscriptions (e.g., "state.*" matches all state events)
 * - Typed event payloads
 * - Async listeners
 * - Returns unsubscribe functions for cleanup
 */
@Injectable()
export class EventBusService implements OnModuleInit {
  private readonly logger = new Logger(EventBusService.name);
  private readonly emitter: EventEmitter2;

  constructor() {
    this.emitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      maxListeners: 200,
      verboseMemoryLeak: true,
    });
  }

  onModuleInit(): void {
    this.logger.log('Event Bus initialized');
  }

  /**
   * Fire an event on the bus.
   * All registered listeners for this event type will be notified.
   *
   * @param eventType - The event type string (e.g. "state_changed")
   * @param data - Event-specific payload
   * @param context - Optional context linking this to a user action
   * @returns The fired HaEvent object
   */
  fire<T = unknown>(
    eventType: string,
    data: T,
    context?: StateContext,
  ): HaEvent<T> {
    const event: HaEvent<T> = {
      event_type: eventType,
      data,
      origin: 'LOCAL',
      time_fired: new Date().toISOString(),
      context: context ?? {
        id: uuidv4(),
        parent_id: null,
        user_id: null,
      },
    };

    this.logger.verbose(`Firing event: ${eventType}`);
    this.emitter.emit(eventType, event);
    return event;
  }

  /**
   * Subscribe to events of a given type.
   * Supports wildcards: "state.*" matches "state_changed", etc.
   *
   * @param eventType - Event type to listen for (supports wildcards with EventEmitter2)
   * @param listener - Callback invoked with HaEvent on each occurrence
   * @returns Unsubscribe function - call it to remove the listener
   */
  listen<T = unknown>(
    eventType: string,
    listener: EventListener<T>,
  ): Unsubscribe {
    const wrappedListener = (event: HaEvent<T>) => {
      try {
        const result = listener(event);
        if (result instanceof Promise) {
          result.catch((err: Error) =>
            this.logger.error(
              `Async listener error for ${eventType}: ${err.message}`,
              err.stack,
            ),
          );
        }
      } catch (err: unknown) {
        const error = err as Error;
        this.logger.error(
          `Listener error for ${eventType}: ${error.message}`,
          error.stack,
        );
      }
    };

    this.emitter.on(eventType, wrappedListener as (...args: unknown[]) => void);

    return () => {
      this.emitter.off(eventType, wrappedListener as (...args: unknown[]) => void);
    };
  }

  /**
   * Subscribe to an event exactly once.
   */
  listenOnce<T = unknown>(
    eventType: string,
    listener: EventListener<T>,
  ): void {
    this.emitter.once(eventType, listener as (...args: unknown[]) => void);
  }

  /**
   * Subscribe to multiple event types with a single listener.
   * @returns Unsubscribe function that removes all subscriptions
   */
  listenMany<T = unknown>(
    eventTypes: string[],
    listener: EventListener<T>,
  ): Unsubscribe {
    const unsubscribers = eventTypes.map((type) =>
      this.listen<T>(type, listener),
    );
    return () => unsubscribers.forEach((unsub) => unsub());
  }

  /**
   * Get the count of listeners for a specific event type.
   */
  listenerCount(eventType: string): number {
    return this.emitter.listenerCount(eventType);
  }

  /**
   * Get all event types that have at least one listener.
   */
  eventNames(): string[] {
    return this.emitter.eventNames() as string[];
  }

  /**
   * Remove all listeners (used in testing).
   */
  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.emitter.removeAllListeners(eventType);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}
