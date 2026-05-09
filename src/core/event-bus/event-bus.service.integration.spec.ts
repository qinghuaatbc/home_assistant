import { Test, TestingModule } from '@nestjs/testing';
import { EventBusService } from './event-bus.service';
import { EVENT_STATE_CHANGED, EVENT_HOMEASSISTANT_START, EVENT_COMPONENT_LOADED } from '../../common/constants/events.constants';

describe('EventBusService (integration)', () => {
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

  it('should deliver events to listeners', (done) => {
    service.listen(EVENT_STATE_CHANGED, (event: unknown) => {
      expect(event).toBeDefined();
      done();
    });
    service.fire(EVENT_STATE_CHANGED, { entity_id: 'light.test', state: 'on' });
  });

  it('should support listenOnce (one-shot)', () => {
    let callCount = 0;
    service.listenOnce(EVENT_HOMEASSISTANT_START, () => { callCount++; });

    service.fire(EVENT_HOMEASSISTANT_START, {});
    service.fire(EVENT_HOMEASSISTANT_START, {});

    expect(callCount).toBe(1);
  });

  it('should support unsubscribe', () => {
    const handler = jest.fn();
    const unsub = service.listen(EVENT_COMPONENT_LOADED, handler);

    unsub();
    service.fire(EVENT_COMPONENT_LOADED, { component: 'test' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should propagate errors without crashing', () => {
    const errorHandler = jest.fn();
    service.listen(EVENT_STATE_CHANGED, () => { throw new Error('handler error'); });
    service.listen(EVENT_STATE_CHANGED, errorHandler);

    expect(() => {
      service.fire(EVENT_STATE_CHANGED, {});
    }).not.toThrow();

    expect(errorHandler).toHaveBeenCalled();
  });

  it('should report listener count', () => {
    expect(service.listenerCount(EVENT_STATE_CHANGED)).toBe(0);

    const unsub1 = service.listen(EVENT_STATE_CHANGED, () => {});
    const unsub2 = service.listen(EVENT_STATE_CHANGED, () => {});

    expect(service.listenerCount(EVENT_STATE_CHANGED)).toBe(2);

    unsub1();
    expect(service.listenerCount(EVENT_STATE_CHANGED)).toBe(1);

    unsub2();
    expect(service.listenerCount(EVENT_STATE_CHANGED)).toBe(0);
  });
});
