import { Controller, Get, Put, Post, Delete, Param, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import { IntegrationLoaderService } from '../../integrations/integration-loader.service';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const MAPPINGS_FILE = '3d-mappings.json';
const FLOORS_FILE = 'floors.json';

function getConfigDir(): string {
  const configPath = process.env.HA_CONFIG_PATH
    ?? path.resolve(process.cwd(), 'config', 'configuration.yaml');
  return path.dirname(configPath);
}
function getMappingsPath(): string { return path.resolve(getConfigDir(), MAPPINGS_FILE); }
function getFloorsPath(): string { return path.resolve(getConfigDir(), FLOORS_FILE); }

@ApiTags('config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('config')
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly stateMachine: StateMachineService,
    private readonly integrationLoader: IntegrationLoaderService,
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
    return { statuses: this.integrationLoader.getStatuses() };
  }

  @Get('automations')
  @ApiOperation({ summary: 'Get automations YAML content' })
  getAutomations() {
    const autoPath = getMappingsPath().replace(MAPPINGS_FILE, 'automations.yaml');
    if (!fs.existsSync(autoPath)) return { content: '' };
    return { content: fs.readFileSync(autoPath, 'utf-8') };
  }

  @Put('automations')
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

  @Post('apply')
  @ApiOperation({ summary: 'Save integration config and restart server' })
  async applyConfig(@Body() body: { integrations: any[] }) {
    const logger = new Logger('ConfigApply');
    const yamlPath = path.resolve(process.cwd(), 'config', 'configuration.yaml');
    const existing = fs.readFileSync(yamlPath, 'utf-8');
    // Preserve top-level config (http, auth, database, etc.), only replace integrations block
    const lines = existing.split('\n');
    const intStart = lines.findIndex(l => l.trim() === 'integrations:');
    const newLines = [
      ...(intStart >= 0 ? lines.slice(0, intStart) : lines),
      'integrations:',
      ...body.integrations.map((int: any) => {
        const out = [`  - domain: ${int.domain}`]
        for (const [k, v] of Object.entries(int)) {
          if (k === 'domain') continue
          if (Array.isArray(v)) {
            out.push(`    ${k}:`)
            for (const item of v) {
              if (typeof item === 'object') {
                out.push(`      - ${Object.entries(item).map(([ik, iv]) => `${ik}: ${iv}`).join('\n        ')}`)
              }
            }
          } else if (typeof v === 'string') {
            out.push(`    ${k}: "${v}"`)
          }
        }
        return out.join('\n')
      }),
    ]
    fs.writeFileSync(yamlPath, newLines.join('\n') + '\n', 'utf-8');
    logger.log('Configuration saved, restarting...');
    // Restart via PM2
    try { execSync('pm2 restart home-assistant', { timeout: 5000 }) } catch {}
    return { ok: true, message: 'Configuration saved. Server restarting…' };
  }

  @Delete('floors/:id')
  @ApiOperation({ summary: 'Delete a floor' })
  async deleteFloor(@Param('id') id: string) {
    const fp = getFloorsPath();
    if (!fs.existsSync(fp)) return { ok: true };
    const floors: any[] = JSON.parse(fs.readFileSync(fp, 'utf-8')).filter((f: any) => f.id !== id);
    fs.writeFileSync(fp, JSON.stringify(floors, null, 2), 'utf-8');
    // Delete associated GLB file from data/floors/
    const glbPath = path.resolve(process.cwd(), 'data', 'floors', `floor${id}.glb`);
    if (fs.existsSync(glbPath)) fs.unlinkSync(glbPath);
    return { ok: true };
  }
}
