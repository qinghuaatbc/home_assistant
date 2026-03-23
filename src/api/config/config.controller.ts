import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { StateMachineService } from '../../core/state-machine/state-machine.service';

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
}
