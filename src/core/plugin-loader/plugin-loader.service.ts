import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PluginManifest, PluginInstance, PluginModule } from './plugin.interface';

@Injectable()
export class PluginLoaderService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PluginLoaderService.name);
  private readonly plugins = new Map<string, PluginInstance>();
  private readonly pluginDir: string;

  constructor(private readonly configService: ConfigService) {
    // Default: custom_components/ at project root, overridable via env
    const configured = configService.get<string>('custom_components_dir');
    this.pluginDir = configured || path.resolve(process.cwd(), 'custom_components');
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.scanPlugins();
  }

  /** Scan the plugin directory and load all valid plugins */
  async scanPlugins(): Promise<void> {
    if (!fs.existsSync(this.pluginDir)) {
      this.logger.log(`Plugin directory not found: ${this.pluginDir}`);
      fs.mkdirSync(this.pluginDir, { recursive: true });
      this.logger.log(`Created plugin directory: ${this.pluginDir}`);
      return;
    }

    const entries = fs.readdirSync(this.pluginDir, { withFileTypes: true });
    let loaded = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(this.pluginDir, entry.name);
      try {
        await this.loadPlugin(entry.name, dirPath);
        loaded++;
      } catch (err: any) {
        this.logger.error(`Failed to load plugin '${entry.name}': ${err.message}`);
      }
    }

    this.logger.log(`Plugin scan complete: ${loaded} loaded, ${entries.filter(e => e.isDirectory()).length} found`);
  }

  /** Load a single plugin from a directory */
  private async loadPlugin(name: string, dirPath: string): Promise<void> {
    const manifestPath = path.join(dirPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      this.logger.debug(`Skipping '${name}': no manifest.json`);
      return;
    }

    const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Find entry file
    const entryExtensions = ['.ts', '.js', '.mjs'];
    let entryPath: string | null = null;
    for (const ext of entryExtensions) {
      const p = path.join(dirPath, `index${ext}`);
      if (fs.existsSync(p)) { entryPath = p; break; }
    }

    if (!entryPath) {
      throw new Error(`No entry file (index.ts/js) found in plugin '${name}'`);
    }

    // Dynamic import
    const mod = await this.importModule(entryPath);
    const instance: PluginInstance = { manifest, module: mod };
    this.plugins.set(manifest.domain, instance);
    this.logger.log(`Plugin loaded: ${manifest.name} v${manifest.version} (domain: ${manifest.domain})`);
  }

  /** Dynamic import with fallbacks */
  private async importModule(entryPath: string): Promise<PluginModule> {
    // For compiled JS in production
    if (entryPath.endsWith('.js') || entryPath.endsWith('.mjs')) {
      return require(entryPath);
    }
    // For TS in development — use ts-node or swc
    // This requires tsconfig paths to be configured properly
    try {
      return require(entryPath);
    } catch {
      // If that fails, try stripping .ts extension
      const jsPath = entryPath.replace(/\.ts$/, '.js');
      return require(jsPath);
    }
  }

  /** Get a loaded plugin by domain */
  getPlugin(domain: string): PluginInstance | undefined {
    return this.plugins.get(domain);
  }

  /** List all loaded plugins */
  listPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  /** Check if a plugin exists for the given domain */
  hasPlugin(domain: string): boolean {
    return this.plugins.has(domain);
  }
}
