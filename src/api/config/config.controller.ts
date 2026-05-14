import { Controller, Get, Put, Post, Delete, Param, Body, UseGuards, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import * as yaml from 'js-yaml';

interface IntegrationStatus { domain: string; status: string; error?: string }

const MAPPINGS_FILE  = '3d-mappings.json';
const FLOORS_FILE    = 'floors.json';
const DASHBOARD_FILE = 'dashboard.yaml';

function getConfigDir(): string {
  const configPath = process.env.HA_CONFIG_PATH
    ?? path.resolve(process.cwd(), 'config', 'configuration.yaml');
  return path.dirname(configPath);
}
function getMappingsPath():  string { return path.resolve(getConfigDir(), MAPPINGS_FILE); }
function getFloorsPath():    string { return path.resolve(getConfigDir(), FLOORS_FILE); }
function getDashboardPath(): string { return path.resolve(getConfigDir(), DASHBOARD_FILE); }

@ApiTags('config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('config')
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly stateMachine: StateMachineService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get Home Assistant configuration' })
  getConfig() {
    const haConfig = this.configService.get('homeassistant');
    const integrations = this.configService.get('integrations') ?? [];
    return { ...haConfig, version: '2026.3.0', state: 'RUNNING', integrations };
  }

  @Get('integrations-status')
  @ApiOperation({ summary: 'Get loaded integration statuses' })
  getIntegrationStatuses() {
    const yamlPath = path.resolve(process.cwd(), 'config', 'configuration.yaml');
    const config = this.configService.get('integrations') ?? [];
    const configured = new Set((config as any[]).map((c: any) => c.domain));
    const statuses: IntegrationStatus[] = Array.from(configured).map(domain => ({
      domain, status: 'loaded', // optimistic — check if running
    }));
    return { statuses };
  }

  @Get('automations')
  @ApiOperation({ summary: 'Get automations YAML content' })
  getAutomations() {
    const autoPath = getMappingsPath().replace(MAPPINGS_FILE, 'automations.yaml');
    if (!fs.existsSync(autoPath)) return { content: '' };
    return { content: fs.readFileSync(autoPath, 'utf-8') };
  }

  @Put('automations')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update automations YAML content' })
  async updateAutomations(@Body() body: { content: string }) {
    const autoPath = getMappingsPath().replace(MAPPINGS_FILE, 'automations.yaml');
    fs.writeFileSync(autoPath, body.content, 'utf-8');
    return { ok: true };
  }

  @Get('3d-mappings')
  @ApiOperation({ summary: 'Get 3D mesh → device mappings' })
  get3dMappings() {
    const mapPath = getMappingsPath();
    if (!fs.existsSync(mapPath)) return { mappings: [] };
    return JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  }

  @Put('3d-mappings')
  @ApiOperation({ summary: 'Save 3D mesh → device mappings' })
  async save3dMappings(@Body() body: { mappings?: Record<string, string> }) {
    const mapPath = getMappingsPath();
    fs.writeFileSync(mapPath, JSON.stringify(body.mappings ?? {}, null, 2), 'utf-8');
    return { ok: true };
  }

  @Get('floors')
  @ApiOperation({ summary: 'Get all floors' })
  getFloors() {
    const fp = getFloorsPath();
    if (!fs.existsSync(fp)) return [];
    try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); }
    catch { return []; }
  }

  @Post('floors')
  @ApiOperation({ summary: 'Add or update a floor' })
  async saveFloor(@Body() body: { id: string; name: string }) {
    const fp = getFloorsPath();
    const floors: any[] = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf-8')) : [];
    const idx = floors.findIndex((f: any) => f.id === body.id);
    const entry = { id: body.id, name: body.name, glb: `floor_${body.id}.glb` };
    if (idx >= 0) floors[idx] = entry;
    else floors.push(entry);
    fs.writeFileSync(fp, JSON.stringify(floors, null, 2), 'utf-8');
    return { ok: true, floors };
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get 2D panel dashboard card configuration (parsed JSON)' })
  getDashboard() {
    const dp = getDashboardPath();
    if (!fs.existsSync(dp)) return { views: {} };
    try { return yaml.load(fs.readFileSync(dp, 'utf-8')) ?? { views: {} }; }
    catch { return { views: {} }; }
  }

  @Put('dashboard')
  @ApiOperation({ summary: 'Save 2D panel dashboard card configuration (JSON body)' })
  saveDashboard(@Body() body: any) {
    const dp = getDashboardPath();
    fs.writeFileSync(dp, yaml.dump(body, { indent: 2, lineWidth: 120, noRefs: true }), 'utf-8');
    return { ok: true };
  }

  @Get('dashboard/text')
  @ApiOperation({ summary: 'Get raw dashboard.yaml content for editing' })
  getDashboardText() {
    const dp = getDashboardPath();
    if (!fs.existsSync(dp)) return { content: '' };
    return { content: fs.readFileSync(dp, 'utf-8') };
  }

  @Put('dashboard/text')
  @ApiOperation({ summary: 'Save raw dashboard.yaml content' })
  saveDashboardText(@Body() body: { content: string }) {
    const dp = getDashboardPath();
    try { yaml.load(body.content); } catch (e: any) { throw new BadRequestException(`Invalid YAML: ${e.message}`); }
    fs.writeFileSync(dp, body.content, 'utf-8');
    return { ok: true };
  }

  @Get('text')
  @ApiOperation({ summary: 'Get raw configuration.yaml for direct editing' })
  getConfigText() {
    const configPath = process.env.HA_CONFIG_PATH ?? path.resolve(process.cwd(), 'config', 'configuration.yaml');
    if (!fs.existsSync(configPath)) return { content: '' };
    return { content: fs.readFileSync(configPath, 'utf-8') };
  }

  @Put('text')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Save raw configuration.yaml and restart server' })
  async saveConfigText(@Body() body: { content: string }) {
    const logger = new Logger('ConfigText');
    const configPath = process.env.HA_CONFIG_PATH ?? path.resolve(process.cwd(), 'config', 'configuration.yaml');
    try { yaml.load(body.content); } catch (e: any) { throw new BadRequestException(`Invalid YAML: ${e.message}`); }
    fs.writeFileSync(configPath, body.content, 'utf-8');
    logger.log('configuration.yaml saved directly, restarting...');
    setTimeout(() => {
      exec('pm2 restart home-assistant', (err) => {
        if (err) logger.error(`Restart failed: ${err.message}`);
      });
    }, 500);
    return { ok: true, message: 'Saved. Server restarting…' };
  }

  @Post('apply')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Save integration config and restart server' })
  async applyConfig(@Body() body: { integrations: any[] }) {
    const logger = new Logger('ConfigApply');
    const yamlPath = path.resolve(process.cwd(), 'config', 'configuration.yaml');
    const existing = yaml.load(fs.readFileSync(yamlPath, 'utf-8')) as Record<string, any>;
    existing.integrations = body.integrations;
    fs.writeFileSync(yamlPath, yaml.dump(existing, { indent: 2, lineWidth: 120, noRefs: true }), 'utf-8');
    logger.log('Configuration saved, restarting...');
    // Return response before restarting so client doesn't get 502
    const result = { ok: true, message: 'Configuration saved. Server restarting…' };
    setTimeout(() => {
      exec('pm2 restart home-assistant', (err) => {
        if (err) logger.error(`Restart failed: ${err.message}`);
      });
    }, 500);
    return result;
  }

  @Delete('floors/:id')
  @ApiOperation({ summary: 'Delete a floor' })
  async deleteFloor(@Param('id') id: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Invalid floor id');
    const fp = getFloorsPath();
    if (!fs.existsSync(fp)) return { ok: true };
    const floors: any[] = JSON.parse(fs.readFileSync(fp, 'utf-8')).filter((f: any) => f.id !== id);
    fs.writeFileSync(fp, JSON.stringify(floors, null, 2), 'utf-8');
    const glbPath = path.resolve(process.cwd(), 'data', 'floors', `floor${id}.glb`);
    if (fs.existsSync(glbPath)) fs.unlinkSync(glbPath);
    return { ok: true };
  }
}
