import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IWsHandler, WsBaseMessage } from '../interfaces/ws-handler.interface';
import { WsSession } from '../interfaces/ws-session.interface';

@Injectable()
export class GetConfigHandler implements IWsHandler {
  readonly type = 'get_config';

  constructor(private readonly configService: ConfigService) {}

  async handle(session: WsSession, message: WsBaseMessage): Promise<void> {
    const haConfig = this.configService.get('homeassistant');

    session.socket.emit('message', {
      id: message.id,
      type: 'result',
      success: true,
      result: {
        ...haConfig,
        version: '2026.3.0',
        state: 'RUNNING',
        components: [],
      },
    });
  }
}
