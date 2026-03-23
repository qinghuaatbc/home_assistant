/**
 * Standard Home Assistant event type constants.
 * These are the built-in events fired by the core system.
 */

/** Fired when any entity state changes */
export const EVENT_STATE_CHANGED = 'state_changed';

/** Fired when a service is called */
export const EVENT_CALL_SERVICE = 'call_service';

/** Fired when a new service is registered */
export const EVENT_SERVICE_REGISTERED = 'service_registered';

/** Fired when a service is removed */
export const EVENT_SERVICE_REMOVED = 'service_removed';

/** Fired when the entity registry is updated */
export const EVENT_ENTITY_REGISTRY_UPDATED = 'entity_registry_updated';

/** Fired when the device registry is updated */
export const EVENT_DEVICE_REGISTRY_UPDATED = 'device_registry_updated';

/** Fired when the area registry is updated */
export const EVENT_AREA_REGISTRY_UPDATED = 'area_registry_updated';

/** Fired when Home Assistant starts */
export const EVENT_HOMEASSISTANT_START = 'homeassistant_start';

/** Fired after all integrations are loaded */
export const EVENT_HOMEASSISTANT_STARTED = 'homeassistant_started';

/** Fired when Home Assistant begins shutdown */
export const EVENT_HOMEASSISTANT_STOP = 'homeassistant_stop';

/** Fired when component/integration is loaded */
export const EVENT_COMPONENT_LOADED = 'component_loaded';

/** Fired when user is logged in */
export const EVENT_USER_UPDATED = 'user_updated';
