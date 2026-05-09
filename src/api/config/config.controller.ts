import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import * as fs from 'fs';
import * as path from 'path';

/** GET /api/config - Returns HA configuration */
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
    return {
      ...haConfig,
      version: '2026.3.0',
      state: 'RUNNING',
      components: [],
      config_source: 'storage',
      safe_mode: false,
      external_url: null,
      internal_url: null,
    };
  }

  @Get('automations')
  @ApiOperation({ summary: 'Get automations YAML content' })
  getAutomations() {
    const configPath = process.env.HA_CONFIG_PATH
      ?? path.resolve(process.cwd(), 'config', 'configuration.yaml');
    const autoPath = path.resolve(path.dirname(configPath), 'automations.yaml');
    if (!fs.existsSync(autoPath)) return { content: '' };
    return { content: fs.readFileSync(autoPath, 'utf-8') };
  }

  @Put('automations')
  @ApiOperation({ summary: 'Update automations YAML content' })
  async updateAutomations(@Body() body: { content: string }) {
    const configPath = process.env.HA_CONFIG_PATH
      ?? path.resolve(process.cwd(), 'config', 'configuration.yaml');
    const autoPath = path.resolve(path.dirname(configPath), 'automations.yaml');
    fs.writeFileSync(autoPath, body.content, 'utf-8');
    return { ok: true };
  }
}
