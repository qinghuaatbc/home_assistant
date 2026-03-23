import { StateContext } from '../../context/ha-context.interface';

/**
 * Base interface for all Home Assistant events.
 * All events on the event bus conform to this shape.
 */
export interface HaEvent<T = unknown> {
  /** The type of the event, e.g. "state_changed" */
  event_type: string;

  /** Event-specific data payload */
  data: T;

  /** Where the event originated */
  origin: 'LOCAL' | 'REMOTE';

  /** ISO 8601 timestamp when the event was fired */
  time_fired: string;

  /** Context linking this event to a user action or parent event */
  context: StateContext;
}

/** Data carried by state_changed events */
export interface StateChangedData {
  entity_id: string;
  old_state: unknown | null;
  new_state: unknown | null;
}

/** Data carried by call_service events */
export interface CallServiceData {
  domain: string;
  service: string;
  service_data: Record<string, unknown>;
}

/** Data carried by component_loaded events */
export interface ComponentLoadedData {
  component: string;
}
