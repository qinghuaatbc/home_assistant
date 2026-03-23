import { Injectable } from '@nestjs/common';
import { IWsHandler, WsBaseMessage } from '../interfaces/ws-handler.interface';
import { WsSession } from '../interfaces/ws-session.interface';

/**
 * Handles 'ping' messages - useful for keepalive.
 * Client: { "id": 1, "type": "ping" }
 * Server: { "id": 1, "type": "pong" }
 */
@Injectable()
export class PingHandler implements IWsHandler {
  readonly type = 'ping';

  async handle(session: WsSession, message: WsBaseMessage): Promise<void> {
    session.socket.emit('message', {
      id: message.id,
      type: 'pong',
    });
  }
}
