import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ThermostatScheduleService, ScheduleEntry } from './thermostat-schedule.service'

@Controller('schedule/thermostat')
@UseGuards(JwtAuthGuard)
export class ThermostatScheduleController {
  constructor(private readonly svc: ThermostatScheduleService) {}

  @Get('entities')
  async entities() {
    return this.svc.listEntities()
  }

  @Get()
  async get(@Query('entity_id') entityId: string) {
    if (!entityId) return []
    return this.svc.getSchedule(entityId)
  }

  @Post()
  async save(@Body() body: { entity_id: string; entries: ScheduleEntry[] }) {
    await this.svc.saveSchedule(body.entity_id, body.entries)
    return { ok: true }
  }

  @Post('apply')
  async applyNow() {
    await this.svc.applyCurrentSlot()
    return { ok: true }
  }
}
