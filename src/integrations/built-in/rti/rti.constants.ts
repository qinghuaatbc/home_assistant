export const DOMAIN_RTI = 'rti';

/** Topics RTI publishes commands to */
export const RTI_COMMAND_PREFIX = 'rti/command';
/** Topics HA publishes state to (RTI subscribes) */
export const RTI_STATE_PREFIX = 'rti/state';
/** Direct service-call topic: payload = { service, entity_id?, data? } */
export const RTI_SERVICE_TOPIC = 'rti/command/service';

export const DEFAULT_BROKER_PORT = 1883;
export const DEFAULT_QOS = 0 as const;
