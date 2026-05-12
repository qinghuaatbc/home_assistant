import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { StateMachineService } from '../../core/state-machine/state-machine.service';

const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function parseDate(value: string, label: string): Date {
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new BadRequestException(`Invalid ${label}: ${value}`);
  return d;
}

function safeParseJson(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try { return JSON.parse(json); } catch { return {}; }
}

@ApiTags('history')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('history')
export class HistoryController {
  constructor(private readonly stateMachine: StateMachineService) {}

  @Get('period/:timestamp')
  @ApiOperation({ summary: 'Get state history since timestamp' })
  @ApiQuery({ name: 'filter_entity_id', required: false })
  @ApiQuery({ name: 'end_time', required: false })
  async getHistory(
    @Param('timestamp') timestamp: string,
    @Query('filter_entity_id') filterEntityId?: string,
    @Query('end_time') endTime?: string,
  ) {
    const startTime = parseDate(timestamp, 'timestamp');
    const endTimeDate = endTime ? parseDate(endTime, 'end_time') : new Date();

    if (endTimeDate.getTime() - startTime.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('Time range exceeds 30-day maximum');
    }

    const entityIds = filterEntityId
      ? filterEntityId.split(',').map((id) => id.trim())
      : this.stateMachine.getStates().map((s) => s.entity_id);

    if (entityIds.length === 0) return [];

    const historyMap = await this.stateMachine.getHistoryMultiple(
      entityIds,
      startTime,
      endTimeDate,
    );

    return Array.from(historyMap.values()).map((records) =>
      records.map((r) => ({
        entity_id: r.entity_id,
        state: r.state,
        attributes: safeParseJson(r.attributes_json),
        last_changed: r.last_changed,
        last_updated: r.last_updated,
        context: {
          id: r.context_id,
          parent_id: r.context_parent_id,
          user_id: r.context_user_id,
        },
      })),
    );
  }
}
