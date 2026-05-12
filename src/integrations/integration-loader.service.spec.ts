import { ConfigService } from '@nestjs/config';
import { EventBusService } from '../core/event-bus/event-bus.service';
import { ContextService } from '../core/context/context.service';
import { PluginLoaderService } from '../core/plugin-loader/plugin-loader.service';
import { IntegrationLoaderService } from './integration-loader.service';
import { HaIntegration, IntegrationConfig } from './interfaces/integration.interface';

describe('IntegrationLoaderService', () => {
  let loader: IntegrationLoaderService;
  let mockConfig: ConfigService;
  let mockEventBus: EventBusService;
  let mockContext: ContextService;
  let mockPluginLoader: PluginLoaderService;

  function createMockIntegration(domain: string): any {
    return {
      manifest: { domain, name: domain, version: '1.0.0' },
      setup: jest.fn().mockResolvedValue(true),
      teardown: jest.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    mockConfig = { get: jest.fn().mockReturnValue([]) } as any;
    mockEventBus = { fire: jest.fn() } as any;
    mockContext = { system: () => ({ id: 'system', user_id: null }) } as any;
    mockPluginLoader = {
      getPlugin: jest.fn().mockReturnValue(undefined),
      hasPlugin: jest.fn().mockReturnValue(false),
      listPlugins: jest.fn().mockReturnValue([]),
    } as any;

    const mockStateMachine = { getState: jest.fn(), getStates: jest.fn().mockReturnValue([]), setState: jest.fn() } as any;
    const mockEntityRegistry = { registerEntity: jest.fn().mockResolvedValue(undefined) } as any;

    loader = new IntegrationLoaderService(
      mockConfig, mockEventBus, mockContext, mockPluginLoader, mockStateMachine, mockEntityRegistry,
      createMockIntegration('light'), createMockIntegration('switch'),
      createMockIntegration('sensor'), createMockIntegration('binary_sensor'),
      createMockIntegration('isy994'), createMockIntegration('weather'),
      createMockIntegration('yamaha_avr'), createMockIntegration('lutron_caseta'),
      createMockIntegration('mqtt'), createMockIntegration('rtsp2hls'),
      createMockIntegration('automation'), createMockIntegration('demo'),
      createMockIntegration('envisalink'),
    );
  });

  it('should be defined', () => {
    expect(loader).toBeDefined();
  });

  it('should return empty statuses initially', () => {
    expect(loader.getStatuses()).toEqual([]);
  });

  it('should load integrations from config', async () => {
    (mockConfig.get as jest.Mock).mockReturnValue([{ domain: 'demo' }]);
    await loader.loadIntegrations();
    expect(loader.getStatuses().length).toBeGreaterThan(0);
  });

  describe('lifecycle hooks', () => {
    it('should call on_start after load', async () => {
      const onStart = jest.fn().mockResolvedValue(undefined);
      const integration: HaIntegration = {
        manifest: { domain: 'demo_start', name: 'DemoStart', version: '1.0.0' },
        setup: jest.fn().mockResolvedValue(true),
        teardown: jest.fn().mockResolvedValue(undefined),
        on_start: onStart,
      };
      (loader as any).builtInRegistry.set('demo_start', integration);
      (mockConfig.get as jest.Mock).mockReturnValue([{ domain: 'demo_start' }]);
      await loader.loadIntegrations();
      expect(onStart).toHaveBeenCalled();
    });

    it('should call on_stop before teardown on shutdown', async () => {
      const onStop = jest.fn().mockResolvedValue(undefined);
      const teardown = jest.fn().mockResolvedValue(undefined);
      const integration: HaIntegration = {
        manifest: { domain: 'stop_test', name: 'Stop', version: '1.0.0' },
        setup: jest.fn().mockResolvedValue(true),
        teardown,
        on_stop: onStop,
      };
      (loader as any).loadedIntegrations.push(integration);
      await loader.onApplicationShutdown();
      expect(onStop).toHaveBeenCalled();
      expect(teardown).toHaveBeenCalled();
    });

    it('should call on_config_change for loaded integrations', async () => {
      const onConfigChange = jest.fn().mockResolvedValue(undefined);
      (loader as any).loadedIntegrations.push({
        manifest: { domain: 'cfg_test', name: 'CfgTest', version: '1.0.0' },
        setup: jest.fn().mockResolvedValue(true),
        teardown: jest.fn().mockResolvedValue(undefined),
        on_config_change: onConfigChange,
      } as HaIntegration);
      await loader.notifyConfigChange('cfg_test', { domain: 'cfg_test', newVal: 'x' });
      expect(onConfigChange).toHaveBeenCalled();
    });

    it('should warn for unknown integration on config change', async () => {
      const warnSpy = jest.spyOn(loader['logger'], 'warn');
      await loader.notifyConfigChange('unknown', { domain: 'unknown' });
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
