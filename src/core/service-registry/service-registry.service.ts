import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventBusService } from '../event-bus/event-bus.service';
import { ContextService } from '../context/context.service';
import {
  ServiceDescriptor,
  ServiceCall,
} from './interfaces/ha-service.interface';
import {
  EVENT_SERVICE_REGISTERED,
  EVENT_SERVICE_REMOVED,
} from '../../common/constants/events.constants';

/**
 * The Service Registry tracks all registered services across all integrations.
 *
 * Services are identified by "domain.service_name" (e.g., "light.turn_on").
 * Integrations register services during setup; the registry routes calls to handlers.
 *
 * This mirrors home assistant's ServiceRegistry class in core.py.
 */
@Injectable()
export class ServiceRegistryService {
  private readonly logger = new Logger(ServiceRegistryService.name);

  /** Nested map: domain → service_name → ServiceDescriptor */
  private readonly services = new Map<string, Map<string, ServiceDescriptor>>();

  constructor(
    private readonly eventBus: EventBusService,
    private readonly contextService: ContextService,
  ) {}

  /**
   * Register a service handler.
   * Fires 'service_registered' event on the bus.
   *
   * @param descriptor - Full service descriptor including handler
   */
  register(descriptor: ServiceDescriptor): void {
    const { domain, service } = descriptor;
    const key = `${domain}.${service}`;

    if (!this.services.has(domain)) {
      this.services.set(domain, new Map());
    }

    if (this.services.get(domain)!.has(service)) {
      this.logger.warn(`Service ${key} is being overridden`);
    }

    this.services.get(domain)!.set(service, descriptor);

    this.eventBus.fire(
      EVENT_SERVICE_REGISTERED,
      { domain, service },
      this.contextService.system(),
    );

    this.logger.debug(`Service registered: ${key}`);
  }

  /**
   * Call a registered service.
   *
   * @param call - The service call request
   * @throws NotFoundException if service not found
   */
  async call(call: ServiceCall): Promise<void> {
    const { domain, service } = call;
    const descriptor = this.getDescriptor(domain, service);

    if (!descriptor) {
      throw new NotFoundException(
        `Service ${domain}.${service} not found`,
      );
    }

    this.logger.debug(
      `Calling service: ${domain}.${service} with data: ${JSON.stringify(call.service_data)}`,
    );

    await descriptor.handler(call);
  }

  /**
   * Check if a service exists.
   */
  has(domain: string, service: string): boolean {
    return this.services.get(domain)?.has(service) ?? false;
  }

  /**
   * Get a specific service descriptor.
   */
  getDescriptor(
    domain: string,
    service: string,
  ): ServiceDescriptor | undefined {
    return this.services.get(domain)?.get(service);
  }

  /**
   * Get all services in a domain.
   */
  getDomainServices(domain: string): Map<string, ServiceDescriptor> | undefined {
    return this.services.get(domain);
  }

  /**
   * Get all services as a nested object for API responses.
   * Format: { domain: { service: { name, description, fields } } }
   */
  getAllServices(): Record<string, Record<string, Omit<ServiceDescriptor, 'handler'>>> {
    const result: Record<string, Record<string, Omit<ServiceDescriptor, 'handler'>>> = {};

    for (const [domain, domainServices] of this.services) {
      result[domain] = {};
      for (const [service, descriptor] of domainServices) {
        const { handler: _handler, ...publicDescriptor } = descriptor;
        result[domain][service] = publicDescriptor;
      }
    }

    return result;
  }

  /**
   * Remove a service registration.
   */
  remove(domain: string, service: string): void {
    const domainServices = this.services.get(domain);
    if (!domainServices?.has(service)) return;

    domainServices.delete(service);
    if (domainServices.size === 0) {
      this.services.delete(domain);
    }

    this.eventBus.fire(
      EVENT_SERVICE_REMOVED,
      { domain, service },
      this.contextService.system(),
    );

    this.logger.debug(`Service removed: ${domain}.${service}`);
  }

  /**
   * Validate service call data against service field definitions.
   */
  validate(domain: string, service: string, data: Record<string, unknown>): void {
    const descriptor = this.getDescriptor(domain, service);
    if (!descriptor) {
      throw new NotFoundException(`Service ${domain}.${service} not found`);
    }

    for (const [fieldName, fieldDef] of Object.entries(descriptor.fields)) {
      if (fieldDef.required && !(fieldName in data)) {
        throw new BadRequestException(
          `Required field '${fieldName}' missing for service ${domain}.${service}`,
        );
      }
    }
  }
}
