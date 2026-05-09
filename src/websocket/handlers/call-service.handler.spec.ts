import { Test, TestingModule } from '@nestjs/testing';
import { CallServiceHandler } from './call-service.handler';
import { ServiceRegistryService } from '../../core/service-registry/service-registry.service';
import { ContextService } from '../../core/context/context.service';
import { WsSession } from '../interfaces/ws-session.interface';

describe('CallServiceHandler', () => {
  let handler: CallServiceHandler;
  let serviceRegistry: ServiceRegistryService;

  const mockSocket = { emit: jest.fn() };
  const mockSession = {
    id: 'test-session',
    socket: mockSocket,
    authenticated: true,
    user: { id: 1, username: 'admin' },
  } as any;

  beforeEach(async () => {
    mockSocket.emit.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallServiceHandler,
        {
          provide: ServiceRegistryService,
          useValue: {
            call: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: ContextService,
          useValue: {
            create: () => ({ id: 'ctx-1', userId: 1 }),
          },
        },
      ],
    }).compile();

    handler = module.get<CallServiceHandler>(CallServiceHandler);
    serviceRegistry = module.get<ServiceRegistryService>(ServiceRegistryService);
  });

  it('should call service and emit success result', async () => {
    await handler.handle(mockSession, {
      id: 1,
      type: 'call_service',
      domain: 'light',
      service: 'turn_on',
      service_data: { brightness: 200 },
    } as any);

    expect(serviceRegistry.call).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'light',
        service: 'turn_on',
        service_data: { brightness: 200 },
      }),
    );
    expect(mockSocket.emit).toHaveBeenCalledWith('message', {
      id: 1,
      type: 'result',
      success: true,
      result: { context: {} },
    });
  });

  it('should emit error when service call fails', async () => {
    jest.spyOn(serviceRegistry, 'call').mockRejectedValueOnce(new Error('Service not found'));

    await handler.handle(mockSession, {
      id: 2,
      type: 'call_service',
      domain: 'light',
      service: 'unknown',
    } as any);

    expect(mockSocket.emit).toHaveBeenCalledWith('message', {
      id: 2,
      type: 'result',
      success: false,
      error: { code: 'service_error', message: 'Service not found' },
    });
  });
});
