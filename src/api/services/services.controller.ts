import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserEntity } from '../../auth/entities/user.entity';
import { ServiceRegistryService } from '../../core/service-registry/service-registry.service';
import { ContextService } from '../../core/context/context.service';
import { ServiceTarget } from '../../core/service-registry/interfaces/ha-service.interface';

class CallServiceDto {
  @IsOptional()
  service_data?: Record<string, unknown>;

  @IsOptional()
  target?: ServiceTarget;
}

/**
 * REST API for services - mirrors HA's /api/services endpoints.
 */
@ApiTags('services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly contextService: ContextService,
  ) {}

  /** GET /api/services */
  @Get()
  @ApiOperation({ summary: 'Get all registered services' })
  getServices() {
    return this.serviceRegistry.getAllServices();
  }

  /** POST /api/services/:domain/:service */
  @Post(':domain/:service')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Call a service' })
  async callService(
    @Param('domain') domain: string,
    @Param('service') service: string,
    @Body() dto: CallServiceDto,
    @CurrentUser() user: UserEntity,
  ) {
    await this.serviceRegistry.call({
      domain,
      service,
      service_data: dto.service_data ?? {},
      target: dto.target,
      context: this.contextService.create(user.id),
    });

    return {};
  }
}
