import { Test, TestingModule } from '@nestjs/testing';
import { EventBusService } from './event-bus.service';

describe('EventBusService', () => {
  let service: EventBusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventBusService],
    }).compile();

    service = module.get<EventBusService>(EventBusService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.removeAllListeners();
  });

  describe('fire and listen', () => {
    it('should deliver events to listeners', (done) => {
      service.listen('test_event', (event) => {
        expect(event.event_type).toBe('test_event');
        expect(event.data).toEqual({ value: 42 });
        expect(event.origin).toBe('LOCAL');
        expect(event.time_fired).toBeDefined();
        done();
      });

      service.fire('test_event', { value: 42 });
    });

    it('should return unsubscribe function that stops delivery', () => {
      const received: unknown[] = [];
      const unsubscribe = service.listen('test_event', (e) => { received.push(e); });

      service.fire('test_event', 1);
      unsubscribe();
      service.fire('test_event', 2);

      expect(received).toHaveLength(1);
    });

    it('should deliver to multiple listeners', (done) => {
      let count = 0;
      const check = () => { if (++count === 2) done(); };

      service.listen('test_event', check);
      service.listen('test_event', check);
      service.fire('test_event', {});
    });
  });

  describe('listenOnce', () => {
    it('should only receive the first event', () => {
      const received: unknown[] = [];
      service.listenOnce('once_event', (e) => { received.push(e); });

      service.fire('once_event', 1);
      service.fire('once_event', 2);

      expect(received).toHaveLength(1);
    });
  });

  describe('fire return value', () => {
    it('should return the fired HaEvent', () => {
      const event = service.fire('my_event', { foo: 'bar' });
      expect(event.event_type).toBe('my_event');
      expect(event.data).toEqual({ foo: 'bar' });
      expect(event.context.id).toBeDefined();
    });
  });

  describe('listenerCount', () => {
    it('should track listener counts correctly', () => {
      expect(service.listenerCount('counted')).toBe(0);
      const unsub = service.listen('counted', () => {});
      expect(service.listenerCount('counted')).toBe(1);
      unsub();
      expect(service.listenerCount('counted')).toBe(0);
    });
  });
});
