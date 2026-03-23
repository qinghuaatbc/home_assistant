import { StateContext } from '../../context/ha-context.interface';

/** Describes a field accepted by a service */
export interface ServiceField {
  description: string;
  example?: unknown;
  required?: boolean;
  default?: unknown;
  selector?: Record<string, unknown>;
}

/** Target specification for a service call */
export interface ServiceTarget {
  /** One or more entity IDs to target */
  entity_id?: string | string[];
  /** One or more device IDs to target */
  device_id?: string | string[];
  /** One or more area IDs to target */
  area_id?: string | string[];
}

/** A single service call request */
export interface ServiceCall {
  domain: string;
  service: string;
  service_data?: Record<string, unknown>;
  target?: ServiceTarget;
  context: StateContext;
}

/** Handler function for a service */
export type ServiceHandler = (call: ServiceCall) => Promise<void>;

/** Registered service descriptor */
export interface ServiceDescriptor {
  domain: string;
  service: string;
  name: string;
  description: string;
  fields: Record<string, ServiceField>;
  target?: {
    entity?: boolean;
    device?: boolean;
  };
  handler: ServiceHandler;
}
