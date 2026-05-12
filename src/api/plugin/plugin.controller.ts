import { Controller, Get, Post, Delete, Param, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { PluginLoaderService } from '../../core/plugin-loader/plugin-loader.service';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

@ApiTags('plugin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/plugins')
export class PluginController {
  private readonly logger = new Logger(PluginController.name);

  constructor(private readonly pluginLoader: PluginLoaderService) {}

  @Get()
  @ApiOperation({ summary: 'List all available plugins (loaded + on disk)' })
  listPlugins() {
    const loaded = this.pluginLoader.listPlugins().map(p => ({
      domain: p.manifest.domain,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      iot_class: p.manifest.iot_class,
      loaded: true,
    }));

    // Also scan disk for available but not loaded plugins
    const dir = this.pluginLoader.getPluginDir();
    const onDisk: any[] = [];
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const mp = path.join(dir, entry.name, 'manifest.json');
        if (!fs.existsSync(mp)) continue;
        if (loaded.some(l => l.domain === entry.name)) continue;
        const m = JSON.parse(fs.readFileSync(mp, 'utf-8'));
        onDisk.push({ domain: m.domain, name: m.name, version: m.version, description: m.description, loaded: false });
      }
    }

    return { plugins: [...loaded, ...onDisk] };
  }

  @Post('install')
  @ApiOperation({ summary: 'Install a plugin from a Git URL or npm package' })
  async installPlugin(@Body() body: { url: string; name?: string }) {
    const { url, name } = body;
    if (!url) throw new Error('url is required');

    const dir = this.pluginLoader.getPluginDir();
    const pluginName = name || url.split('/').pop()?.replace(/\.git$/, '') || 'plugin';

    // Install via git clone
    const { execSync } = require('child_process');
    const targetDir = path.join(dir, pluginName);
    if (fs.existsSync(targetDir)) {
      return { ok: false, message: `Plugin '${pluginName}' already exists` };
    }

    try {
      execSync(`git clone "${url}" "${targetDir}"`, { timeout: 60000, stdio: 'pipe' });
      this.logger.log(`Plugin installed: ${pluginName} from ${url}`);
      // Reload to pick up new plugin
      await this.pluginLoader.scanPlugins();
      return { ok: true, message: `Plugin '${pluginName}' installed and loaded` };
    } catch (err: any) {
      // Clean up on failure
      if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });
      throw new Error(`Install failed: ${err.message}`);
    }
  }

  @Delete(':domain')
  @ApiOperation({ summary: 'Uninstall a plugin by domain' })
  async uninstallPlugin(@Param('domain') domain: string) {
    const dir = this.pluginLoader.getPluginDir();
    const targetDir = path.join(dir, domain);
    if (!fs.existsSync(targetDir)) {
      return { ok: false, message: `Plugin '${domain}' not found` };
    }

    fs.rmSync(targetDir, { recursive: true });
    this.logger.log(`Plugin uninstalled: ${domain}`);

    // Rescan to update loaded list
    await this.pluginLoader.scanPlugins();
    return { ok: true, message: `Plugin '${domain}' uninstalled` };
  }

  @Post('scan')
  @ApiOperation({ summary: 'Rescan custom_components directory for new/changed plugins' })
  async rescan() {
    await this.pluginLoader.scanPlugins();
    const loaded = this.pluginLoader.listPlugins().map(p => p.manifest.domain);
    return { ok: true, loaded };
  }
}
