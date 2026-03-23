import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EntityRegistryService } from '../../registry/entity-registry/entity-registry.service';
import { DeviceRegistryService } from '../../registry/device-registry/device-registry.service';
import { AreaRegistryService, CreateAreaDto } from '../../registry/area-registry/area-registry.service';

/**
 * REST API for entity, device, and area registries.
 */
@ApiTags('registry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RegistryController {
  constructor(
    private readonly entityRegistry: EntityRegistryService,
    private readonly deviceRegistry: DeviceRegistryService,
    private readonly areaRegistry: AreaRegistryService,
  ) {}

  // ---- Entity Registry ----

  @Get('entity_registry')
  @ApiOperation({ summary: 'List all registered entities' })
  getEntities() {
    return this.entityRegistry.getEntities();
  }

  @Get('entity_registry/:entity_id')
  @ApiOperation({ summary: 'Get entity registry entry' })
  getEntity(@Param('entity_id') entityId: string) {
    return this.entityRegistry.getEntity(entityId);
  }

  // ---- Device Registry ----

  @Get('device_registry')
  @ApiOperation({ summary: 'List all registered devices' })
  getDevices() {
    return this.deviceRegistry.getDevices();
  }

  @Get('device_registry/:device_id')
  @ApiOperation({ summary: 'Get device registry entry' })
  getDevice(@Param('device_id') deviceId: string) {
    return this.deviceRegistry.getDevice(deviceId);
  }

  // ---- Area Registry ----

  @Get('area_registry')
  @ApiOperation({ summary: 'List all areas' })
  getAreas() {
    return this.areaRegistry.getAreas();
  }

  @Post('area_registry')
  @ApiOperation({ summary: 'Create an area' })
  async createArea(@Body() dto: CreateAreaDto) {
    return this.areaRegistry.createArea(dto);
  }

  @Put('area_registry/:area_id')
  @ApiOperation({ summary: 'Update an area' })
  async updateArea(
    @Param('area_id') areaId: string,
    @Body() dto: Partial<CreateAreaDto>,
  ) {
    return this.areaRegistry.updateArea(areaId, dto);
  }

  @Delete('area_registry/:area_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an area' })
  async deleteArea(@Param('area_id') areaId: string) {
    await this.areaRegistry.deleteArea(areaId);
  }
}
