import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PluginManifest, PluginInstance, PluginModule } from './plugin.interface';

@Injectable()
export class PluginLoaderService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PluginLoaderService.name);
  private readonly plugins = new Map<string, PluginInstance>();
  private readonly watchers = new Map<string, fs.FSWatcher>();
  private readonly pluginDir: string;
  private scanTimer: any = null;
  private readonly SCAN_DEBOUNCE_MS = 1000;
  private scanning = false;

  constructor(private readonly configService: ConfigService) {
    const configured = configService.get<string>('custom_components_dir');
    this.pluginDir = configured || path.resolve(process.cwd(), 'custom_components');
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.scanPlugins();
    this.startWatching();
  }

  /** Start watching the plugin directory for changes */
  private startWatching(): void {
    if (!fs.existsSync(this.pluginDir)) return;
    try {
      const watcher = fs.watch(this.pluginDir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        // Debounce rapid changes (e.g. npm install, git clone)
        if (this.scanTimer) clearTimeout(this.scanTimer);
        this.scanTimer = setTimeout(() => this.reloadChanged(filename.toString()), this.SCAN_DEBOUNCE_MS);
      });
      this.watchers.set('root', watcher);
      this.logger.log(`Watching plugin directory: ${this.pluginDir}`);
    } catch (err: any) {
      this.logger.warn(`Could not watch plugin directory: ${err.message}`);
    }
  }

  /** Reload a specific plugin or rescan all when a file changes */
  private async reloadChanged(changedFile: string): Promise<void> {
    // Extract plugin directory name from the changed path
    const parts = changedFile.split(/[/\\]/);
    const pluginName = parts[0];
    if (!pluginName || pluginName.startsWith('.')) return;

    const pluginDir = path.join(this.pluginDir, pluginName);
    if (!fs.existsSync(pluginDir)) {
      // Plugin was deleted
      for (const [domain, inst] of this.plugins) {
        if (inst.manifest.domain === pluginName || pluginName.includes(inst.manifest.domain)) {
          this.plugins.delete(domain);
          this.logger.log(`Plugin removed: ${domain}`);
        }
      }
      return;
    }

    // Re-scan the changed plugin
    try {
      // Remove old version
      for (const [domain, inst] of this.plugins) {
        if (inst.manifest.domain === pluginName) {
          this.plugins.delete(domain);
          break;
        }
      }
      // Clear require cache so re-require loads fresh code
      const cacheKeys = Object.keys(require.cache).filter(k => k.includes(pluginName));
      cacheKeys.forEach(k => delete require.cache[k]);

      await this.loadPlugin(pluginName, pluginDir);
    } catch (err: any) {
      this.logger.error(`Hot-reload failed for '${pluginName}': ${err.message}`);
    }
  }

  /** Scan the plugin directory and load all valid plugins */
  async scanPlugins(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
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
    } finally {
      this.scanning = false;
    }
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

    // Clear require cache for this file to allow hot-reload
    const resolved = require.resolve(entryPath);
    if (require.cache[resolved]) delete require.cache[resolved];

    // Dynamic import
    const mod = await this.importModule(entryPath);
    const instance: PluginInstance = { manifest, module: mod };
    this.plugins.set(manifest.domain, instance);
    this.logger.log(`Plugin loaded: ${manifest.name} v${manifest.version} (domain: ${manifest.domain})`);
  }

  /** Dynamic import with fallbacks */
  private async importModule(entryPath: string): Promise<PluginModule> {
    if (entryPath.endsWith('.js') || entryPath.endsWith('.mjs')) {
      return require(entryPath);
    }
    try {
      return require(entryPath);
    } catch {
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

  /** Get the plugin directory path */
  getPluginDir(): string {
    return this.pluginDir;
  }

  /** Clean up watchers on shutdown */
  onApplicationShutdown(): void {
    for (const [name, watcher] of this.watchers) {
      watcher.close();
      this.logger.debug(`Stopped watcher: ${name}`);
    }
    if (this.scanTimer) clearTimeout(this.scanTimer);
  }
}
