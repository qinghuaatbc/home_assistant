import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { NotificationRulesService, NotificationRule } from './notification-rules.service'

@Controller('push/notification-rules')
@UseGuards(JwtAuthGuard)
export class NotificationRulesController {
  constructor(private readonly svc: NotificationRulesService) {}

  @Get()
  getAll() { return this.svc.getAll() }

  @Post()
  create(@Body() dto: Omit<NotificationRule, 'id'>) { return this.svc.create(dto) }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Partial<NotificationRule>) { return this.svc.update(id, dto) }

  @Delete(':id')
  delete(@Param('id') id: string) { return { ok: this.svc.delete(id) } }
}
