export const DOMAIN_MQTT = 'mqtt';

export const DEFAULT_BROKER_PORT = 1883;
export const DEFAULT_KEEPALIVE = 60;
export const DEFAULT_RECONNECT_PERIOD = 5000;
export const DEFAULT_CONNECT_TIMEOUT = 10000;

/** Default payloads */
export const PAYLOAD_ON     = 'ON';
export const PAYLOAD_OFF    = 'OFF';
export const PAYLOAD_TOGGLE = 'TOGGLE';

/** QoS levels */
export type MqttQoS = 0 | 1 | 2;
export const DEFAULT_QOS: MqttQoS = 0;

/** Entity types supported via MQTT */
export const MQTT_ENTITY_TYPES = ['light', 'switch', 'sensor', 'binary_sensor'] as const;
export type MqttEntityType = typeof MQTT_ENTITY_TYPES[number];
