import { Test, TestingModule } from '@nestjs/testing';
import { DemoIntegration } from './demo.integration';
import { StateMachineService } from '../../../core/state-machine/state-machine.service';
import { ServiceRegistryService } from '../../../core/service-registry/service-registry.service';
import { EntityRegistryService } from '../../../registry/entity-registry/entity-registry.service';
import { ContextService } from '../../../core/context/context.service';
import { ServiceCall } from '../../../core/service-registry/interfaces/ha-service.interface';

describe('DemoIntegration', () => {
  let integration: DemoIntegration;
  let serviceRegistry: ServiceRegistryService;
  let stateMachine: StateMachineService;
  let contextService: ContextService;

  const mockContext = { id: 'test-ctx', user_id: 'admin' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoIntegration,
        {
          provide: StateMachineService,
          useValue: {
            setState: jest.fn().mockReturnValue({}),
            getState: jest.fn().mockReturnValue({
              entity_id: 'light.living_room',
              state: 'off',
              attributes: { friendly_name: 'Living Room Light' },
            }),
          },
        },
        {
          provide: ServiceRegistryService,
          useValue: {
            register: jest.fn(),
          },
        },
        {
          provide: EntityRegistryService,
          useValue: {
            registerEntity: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: ContextService,
          useValue: {
            create: () => mockContext,
            system: () => ({ id: 'system', user_id: null }),
          },
        },
      ],
    }).compile();

    integration = module.get<DemoIntegration>(DemoIntegration);
    serviceRegistry = module.get<ServiceRegistryService>(ServiceRegistryService);
    stateMachine = module.get<StateMachineService>(StateMachineService);
    contextService = module.get<ContextService>(ContextService);
  });

  it('should setup entities', async () => {
    const result = await integration.setup({ domain: 'demo', entities: [] });
    expect(result).toBe(true);
    expect(stateMachine.setState).toHaveBeenCalled();
  });

  it('should register service handlers on setup', async () => {
    await integration.setup({ domain: 'demo', entities: [] });
    // light.turn_on/off/toggle + switch.turn_on/off + media_player.turn_on/off + binary_sensor.turn_on/off = 9
    expect(serviceRegistry.register).toHaveBeenCalledTimes(9);
  });
});
