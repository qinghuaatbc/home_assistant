import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserEntity } from '../../auth/entities/user.entity';
import { StateMachineService } from '../../core/state-machine/state-machine.service';
import { ContextService } from '../../core/context/context.service';

class SetStateDto {
  @IsString()
  state: string;

  @IsOptional()
  attributes?: Record<string, unknown>;
}

/**
 * REST API for entity states - mirrors HA's /api/states endpoints.
 */
@ApiTags('states')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('states')
export class StatesController {
  constructor(
    private readonly stateMachine: StateMachineService,
    private readonly contextService: ContextService,
  ) {}

  /** GET /api/states - Returns all current states */
  @Get()
  @ApiOperation({ summary: 'Get all entity states' })
  getStates() {
    return this.stateMachine.getStates();
  }

  /** GET /api/states/:entity_id */
  @Get(':entity_id')
  @ApiOperation({ summary: 'Get state of a specific entity' })
  @ApiParam({ name: 'entity_id', example: 'light.living_room' })
  getState(@Param('entity_id') entityId: string) {
    const state = this.stateMachine.getState(entityId);
    if (!state) {
      throw new NotFoundException(`Entity '${entityId}' not found`);
    }
    return state;
  }

  /** DELETE /api/states/:entity_id - Remove entity state */
  @Delete(':entity_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove entity and its state' })
  @ApiParam({ name: 'entity_id', example: 'light.living_room' })
  removeState(@Param('entity_id') entityId: string) {
    const state = this.stateMachine.getState(entityId);
    if (!state) throw new NotFoundException(`Entity '${entityId}' not found`);
    this.stateMachine.removeEntity(entityId);
    return { ok: true, message: `Entity '${entityId}' removed` };
  }

  /** POST /api/states/:entity_id - Set entity state */
  @Post(':entity_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set or update entity state' })
  @ApiParam({ name: 'entity_id', example: 'light.living_room' })
  setState(
    @Param('entity_id') entityId: string,
    @Body() dto: SetStateDto,
    @CurrentUser() user: UserEntity,
  ) {
    const context = this.contextService.create(user.id);
    return this.stateMachine.setState(
      entityId,
      dto.state,
      dto.attributes ?? {},
      context,
    );
  }
}
