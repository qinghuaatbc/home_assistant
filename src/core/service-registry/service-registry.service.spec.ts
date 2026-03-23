import { Test, TestingModule } from '@nestjs/testing';
import { ServiceRegistryService } from './service-registry.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { ContextService } from '../context/context.service';
import { ServiceDescriptor } from './interfaces/ha-service.interface';

describe('ServiceRegistryService', () => {
  let service: ServiceRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ServiceRegistryService, EventBusService, ContextService],
    }).compile();

    service = module.get<ServiceRegistryService>(ServiceRegistryService);
  });

  const makeDescriptor = (
    domain: string,
    svc: string,
    handler = jest.fn().mockResolvedValue(undefined),
  ): ServiceDescriptor => ({
    domain,
    service: svc,
    name: `${svc} name`,
    description: `${svc} desc`,
    fields: {},
    handler,
  });

  describe('register', () => {
    it('should register a service', () => {
      service.register(makeDescriptor('light', 'turn_on'));
      expect(service.has('light', 'turn_on')).toBe(true);
    });

    it('should not affect other domains', () => {
      service.register(makeDescriptor('light', 'turn_on'));
      expect(service.has('switch', 'turn_on')).toBe(false);
    });
  });

  describe('call', () => {
    it('should invoke the registered handler', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.register(makeDescriptor('light', 'turn_on', handler));

      const context = { id: '1', parent_id: null, user_id: null };
      await service.call({
        domain: 'light',
        service: 'turn_on',
        service_data: { brightness: 200 },
        context,
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'light',
          service: 'turn_on',
          service_data: { brightness: 200 },
        }),
      );
    });

    it('should throw NotFoundException for unknown service', async () => {
      await expect(
        service.call({
          domain: 'unknown',
          service: 'missing',
          context: { id: '1', parent_id: null, user_id: null },
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('getAllServices', () => {
    it('should return nested service structure', () => {
      service.register(makeDescriptor('light', 'turn_on'));
      service.register(makeDescriptor('light', 'turn_off'));
      service.register(makeDescriptor('switch', 'turn_on'));

      const all = service.getAllServices();
      expect(all.light).toBeDefined();
      expect(all.light.turn_on).toBeDefined();
      expect(all.light.turn_off).toBeDefined();
      expect(all.switch).toBeDefined();
      // Handler should NOT be in the public response
      expect((all.light.turn_on as unknown as Record<string, unknown>).handler).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('should remove a registered service', () => {
      service.register(makeDescriptor('light', 'turn_on'));
      expect(service.has('light', 'turn_on')).toBe(true);
      service.remove('light', 'turn_on');
      expect(service.has('light', 'turn_on')).toBe(false);
    });
  });
});
