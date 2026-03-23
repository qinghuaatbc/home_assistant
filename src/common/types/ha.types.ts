/**
 * Core type aliases used throughout the Home Assistant system.
 * These mirror the type system from the original Python implementation.
 */

/** Entity ID in format "domain.object_id", e.g. "light.living_room" */
export type EntityId = string;

/** Integration/component domain, e.g. "light", "switch", "sensor" */
export type Domain = string;

/** Service name within a domain, e.g. "turn_on", "turn_off" */
export type ServiceName = string;

/** Area ID (slug), e.g. "living_room" */
export type AreaId = string;

/** Device ID (UUID) */
export type DeviceId = string;

/** Event type string, e.g. "state_changed", "call_service" */
export type EventType = string;

/** State string value, e.g. "on", "off", "unavailable", "25.3" */
export type StateValue = string;

/** ISO 8601 datetime string */
export type IsoDateTime = string;
