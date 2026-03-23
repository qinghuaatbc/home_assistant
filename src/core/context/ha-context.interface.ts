/**
 * Context object that links events, state changes, and service calls
 * to a specific user action or parent event chain.
 * Mirrors the Context class in Home Assistant's Python core.
 */
export interface StateContext {
  /** Unique identifier for this context (UUID) */
  id: string;

  /** Parent context ID if this event was triggered by another action */
  parent_id: string | null;

  /** ID of the user who triggered this action, null for system actions */
  user_id: string | null;
}
