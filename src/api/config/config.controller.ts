import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import * as fs from 'fs';
import * as path from 'path';

const MAPPINGS_FILE = '3d-mappings.json';

function getMappingsPath(): string {
  const configPath = process.env.HA_CONFIG_PATH
    ?? path.resolve(process.cwd(), 'config', 'configuration.yaml');
  return path.resolve(path.dirname(configPath), MAPPINGS_FILE);
}

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
    return { ...haConfig, version: '2026.3.0', state: 'RUNNING' };
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
  async save3dMappings(@Body() body: { mappings: Record<string, string> }) {
    const mapPath = getMappingsPath();
    fs.writeFileSync(mapPath, JSON.stringify(body.mappings, null, 2), 'utf-8');
    return { ok: true };
  }
}
