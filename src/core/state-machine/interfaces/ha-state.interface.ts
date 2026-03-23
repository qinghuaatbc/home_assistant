import { StateContext } from '../../context/ha-context.interface';

/**
 * Represents the state of a single entity in the Home Assistant system.
 * These objects are immutable - every update creates a new HaState object.
 *
 * Entity ID format: "domain.object_id" (e.g., "light.living_room")
 */
export interface HaState<T = Record<string, unknown>> {
  /** Entity identifier in format "domain.object_id" */
  entity_id: string;

  /**
   * Current state value as a string.
   * Examples: "on", "off", "unavailable", "25.3", "home"
   */
  state: string;

  /**
   * Additional state attributes specific to the entity type.
   * E.g., brightness, color for lights; temperature unit for sensors.
   */
  attributes: T;

  /**
   * ISO 8601 timestamp of the last time the STATE VALUE changed.
   * Only updates when `state` string changes, not on attribute-only updates.
   */
  last_changed: string;

  /**
   * ISO 8601 timestamp of the last time any update was received.
   * Updates on every setState() call, including attribute-only changes.
   */
  last_updated: string;

  /** Context linking this state to a user action */
  context: StateContext;
}
