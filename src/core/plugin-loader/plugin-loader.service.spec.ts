import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PluginLoaderService } from './plugin-loader.service';
import * as path from 'path';
import * as fs from 'fs';

describe('PluginLoaderService', () => {
  let service: PluginLoaderService;
  let testPluginDir: string;

  beforeAll(() => {
    testPluginDir = path.resolve(__dirname, '../../../test-plugins');
    if (fs.existsSync(testPluginDir)) fs.rmSync(testPluginDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testPluginDir)) fs.rmSync(testPluginDir, { recursive: true });
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PluginLoaderService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'custom_components_dir') return testPluginDir;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PluginLoaderService>(PluginLoaderService);
  });

  it('should create plugin directory if not exists', async () => {
    // onApplicationBootstrap creates the directory
    expect(fs.existsSync(testPluginDir)).toBe(false);
    await service.onModuleInit();
    expect(fs.existsSync(testPluginDir)).toBe(true);
  });

  it('should return empty plugin list initially', () => {
    expect(service.listPlugins()).toEqual([]);
  });

  it('should return plugin directory path', () => {
    expect(service.getPluginDir()).toBe(testPluginDir);
  });

  it('should not find unregistered plugin', () => {
    expect(service.hasPlugin('nonexistent')).toBe(false);
    expect(service.getPlugin('nonexistent')).toBeUndefined();
  });

  it('should scan and load a valid plugin from disk', async () => {
    // Create a test plugin
    const pluginPath = path.join(testPluginDir, 'test_plugin');
    fs.mkdirSync(pluginPath, { recursive: true });
    fs.writeFileSync(path.join(pluginPath, 'manifest.json'), JSON.stringify({
      domain: 'test_plugin',
      name: 'Test Plugin',
      version: '1.0.0',
    }));
    fs.writeFileSync(path.join(pluginPath, 'index.js'), `
      exports.create = async () => ({
        manifest: { domain: 'test_plugin', name: 'Test Plugin', version: '1.0.0' },
        setup: async () => true,
        teardown: async () => {},
      });
    `);

    await service.scanPlugins();

    expect(service.hasPlugin('test_plugin')).toBe(true);
    const plugin = service.getPlugin('test_plugin');
    expect(plugin).toBeDefined();
    expect(plugin!.manifest.name).toBe('Test Plugin');
    expect(plugin!.manifest.version).toBe('1.0.0');

    // Clean up
    fs.rmSync(pluginPath, { recursive: true });
  });

  it('should skip directories without manifest.json', async () => {
    const dir = path.join(testPluginDir, 'no_manifest');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {}');

    await service.scanPlugins();
    expect(service.hasPlugin('no_manifest')).toBe(false);

    fs.rmSync(dir, { recursive: true });
  });

  it('should handle scan errors gracefully', async () => {
    // Create a plugin with invalid manifest JSON
    const pluginPath = path.join(testPluginDir, 'bad_plugin');
    fs.mkdirSync(pluginPath, { recursive: true });
    fs.writeFileSync(path.join(pluginPath, 'manifest.json'), '{invalid json}');

    // Should not throw
    await expect(service.scanPlugins()).resolves.not.toThrow();
    expect(service.hasPlugin('bad_plugin')).toBe(false);

    fs.rmSync(pluginPath, { recursive: true });
  });
});
