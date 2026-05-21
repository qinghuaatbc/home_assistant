import { Controller, Get, Query } from '@nestjs/common'
import { ChatMessageService } from './chat-message.service'

@Controller('api/comm')
export class ChatMessageController {
  constructor(private readonly svc: ChatMessageService) {}

  @Get('history')
  async history(@Query('limit') limit?: string) {
    const n = Math.min(parseInt(limit ?? '100', 10) || 100, 500)
    return this.svc.getHistory(n)
  }
}
