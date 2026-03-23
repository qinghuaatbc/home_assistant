import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StateMachineService } from './state-machine.service';
import { StateHistoryEntity } from './state.entity';
import { EventBusService } from '../event-bus/event-bus.service';
import { ContextService } from '../context/context.service';
import { EVENT_STATE_CHANGED } from '../../common/constants/events.constants';

describe('StateMachineService', () => {
  let service: StateMachineService;
  let eventBus: EventBusService;

  const mockRepo = {
    save: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getQuery: jest.fn().mockReturnValue(''),
      getParameters: jest.fn().mockReturnValue({}),
    }),
    create: jest.fn().mockImplementation((d) => d),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StateMachineService,
        EventBusService,
        ContextService,
        {
          provide: getRepositoryToken(StateHistoryEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<StateMachineService>(StateMachineService);
    eventBus = module.get<EventBusService>(EventBusService);

    jest.clearAllMocks();
  });

  describe('setState', () => {
    it('should store the new state', () => {
      service.setState('light.test', 'on', { brightness: 200 });
      const state = service.getState('light.test');
      expect(state?.state).toBe('on');
      expect(state?.attributes).toEqual({ brightness: 200 });
    });

    it('should fire state_changed event', (done) => {
      eventBus.listen(EVENT_STATE_CHANGED, (event) => {
        const data = event.data as Record<string, unknown>;
        expect(data['entity_id']).toBe('light.test');
        expect((data['new_state'] as Record<string, unknown>)['state']).toBe('on');
        expect(data['old_state']).toBeNull();
        done();
      });

      service.setState('light.test', 'on');
    });

    it('should update last_changed only when state value changes', async () => {
      service.setState('sensor.temp', '22', { unit: '°C' });
      const first = service.getState('sensor.temp')!;

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 5));

      // Attribute-only change - last_changed should NOT update
      const afterAttributeChange = service.setState('sensor.temp', '22', { unit: '°F' });
      expect(afterAttributeChange.last_changed).toBe(first.last_changed);
      expect(new Date(afterAttributeChange.last_updated).getTime()).toBeGreaterThanOrEqual(
        new Date(first.last_updated).getTime(),
      );

      await new Promise((r) => setTimeout(r, 5));

      // State value change - last_changed SHOULD update
      const afterStateChange = service.setState('sensor.temp', '23', {});
      expect(new Date(afterStateChange.last_changed).getTime()).toBeGreaterThan(
        new Date(first.last_changed).getTime(),
      );
    });

    it('should return frozen (immutable) state objects', () => {
      service.setState('light.frozen', 'on', {});
      const state = service.getState('light.frozen')!;
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state.attributes)).toBe(true);
    });

    it('should include old_state in state_changed events on update', (done) => {
      service.setState('switch.test', 'off');

      eventBus.listen(EVENT_STATE_CHANGED, (event) => {
        const data = event.data as Record<string, unknown>;
        expect((data['old_state'] as Record<string, unknown>)['state']).toBe('off');
        expect((data['new_state'] as Record<string, unknown>)['state']).toBe('on');
        done();
      });

      service.setState('switch.test', 'on');
    });
  });

  describe('getState', () => {
    it('should return null for unknown entity', () => {
      expect(service.getState('light.unknown')).toBeNull();
    });

    it('should return current state', () => {
      service.setState('light.known', 'on', { brightness: 128 });
      const state = service.getState('light.known');
      expect(state?.entity_id).toBe('light.known');
      expect(state?.state).toBe('on');
    });
  });

  describe('getStates', () => {
    it('should return all states', () => {
      service.setState('light.a', 'on');
      service.setState('light.b', 'off');
      const states = service.getStates();
      expect(states.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('removeEntity', () => {
    it('should remove entity and fire state_changed with null new_state', (done) => {
      service.setState('light.remove_me', 'on');

      eventBus.listen(EVENT_STATE_CHANGED, (event) => {
        const data = event.data as Record<string, unknown>;
        if (data['entity_id'] === 'light.remove_me' && data['new_state'] === null) {
          expect(data['old_state']).not.toBeNull();
          done();
        }
      });

      service.removeEntity('light.remove_me');
      expect(service.getState('light.remove_me')).toBeNull();
    });
  });
});
