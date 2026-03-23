import { Injectable } from '@nestjs/common';
import { IWsHandler, WsBaseMessage } from '../interfaces/ws-handler.interface';
import { WsSession } from '../interfaces/ws-session.interface';

interface UnsubscribeMessage extends WsBaseMessage {
  subscription: number;
}

@Injectable()
export class UnsubscribeEventsHandler implements IWsHandler {
  readonly type = 'unsubscribe_events';

  async handle(session: WsSession, message: WsBaseMessage): Promise<void> {
    const msg = message as UnsubscribeMessage;
    const subscriptionId = msg.subscription;

    const unsubscribe = session.subscriptions.get(subscriptionId);
    if (unsubscribe) {
      unsubscribe();
      session.subscriptions.delete(subscriptionId);
    }

    session.socket.emit('message', {
      id: message.id,
      type: 'result',
      success: true,
      result: null,
    });
  }
}
