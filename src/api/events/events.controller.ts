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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserEntity } from '../../auth/entities/user.entity';
import { EventBusService } from '../../core/event-bus/event-bus.service';
import { ContextService } from '../../core/context/context.service';

/**
 * REST API for events - mirrors HA's /api/events endpoints.
 */
@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly contextService: ContextService,
  ) {}

  /** GET /api/events - List event types and listener counts */
  @Get()
  @ApiOperation({ summary: 'Get all event types with listener counts' })
  getEvents() {
    const eventNames = this.eventBus.eventNames();
    return eventNames.map((type) => ({
      event: type,
      listener_count: this.eventBus.listenerCount(type),
    }));
  }

  /** POST /api/events/:event_type - Fire a custom event */
  @Post(':event_type')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fire an event' })
  fireEvent(
    @Param('event_type') eventType: string,
    @Body() data: Record<string, unknown>,
    @CurrentUser() user: UserEntity,
  ) {
    const context = this.contextService.create(user.id);
    this.eventBus.fire(eventType, data, context);
    return { message: 'Event fired.' };
  }
}
