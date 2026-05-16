import { Controller, Get, Post, Delete, Body, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { PushService } from './push.service'

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-public-key')
  getPublicKey() {
    return { key: this.push.getPublicKey() }
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  async subscribe(@Body() body: { endpoint: string; keys: { p256dh: string; auth: string }; label?: string }) {
    await this.push.subscribe(body.endpoint, body.keys.p256dh, body.keys.auth, body.label)
    return { ok: true }
  }

  @Delete('subscribe')
  @UseGuards(JwtAuthGuard)
  async unsubscribe(@Body() body: { endpoint: string }) {
    await this.push.unsubscribe(body.endpoint)
    return { ok: true }
  }

  @Post('test')
  @UseGuards(JwtAuthGuard)
  async test() {
    await this.push.sendToAll('🔔 Test Notification', 'Push notifications are working!')
    return { ok: true }
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async history() {
    return this.push.getHistory(200)
  }
}
