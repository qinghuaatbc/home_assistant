import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'API health check' })
  getHealth() {
    return { message: 'API running.' };
  }

  @Get('health')
  @ApiOperation({ summary: 'Detailed health with uptime' })
  getDetailedHealth() {
    return {
      status: 'ok',
      uptime: process.uptime(),
    };
  }
}
