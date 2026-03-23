import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { StateMachineService } from '../../core/state-machine/state-machine.service';

/**
 * REST API for state history - mirrors HA's /api/history endpoint.
 */
@ApiTags('history')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('history')
export class HistoryController {
  constructor(private readonly stateMachine: StateMachineService) {}

  /**
   * GET /api/history/period/:timestamp
   * Returns state history for one or more entities since timestamp.
   */
  @Get('period/:timestamp')
  @ApiOperation({ summary: 'Get state history since timestamp' })
  @ApiQuery({ name: 'filter_entity_id', required: false })
  @ApiQuery({ name: 'end_time', required: false })
  async getHistory(
    @Param('timestamp') timestamp: string,
    @Query('filter_entity_id') filterEntityId?: string,
    @Query('end_time') endTime?: string,
  ) {
    const startTime = new Date(timestamp);
    const endTimeDate = endTime ? new Date(endTime) : undefined;

    if (filterEntityId) {
      const entityIds = filterEntityId.split(',').map((id) => id.trim());
      const historyMap = await this.stateMachine.getHistoryMultiple(
        entityIds,
        startTime,
        endTimeDate,
      );

      return Array.from(historyMap.values()).map((records) =>
        records.map((r) => ({
          entity_id: r.entity_id,
          state: r.state,
          attributes: r.attributes_json ? JSON.parse(r.attributes_json) : {},
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

    return [];
  }
}
