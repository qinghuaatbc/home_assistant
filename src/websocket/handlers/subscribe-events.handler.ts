import { Injectable } from '@nestjs/common';
import { IWsHandler, WsBaseMessage } from '../interfaces/ws-handler.interface';
import { WsSession } from '../interfaces/ws-session.interface';
import { EventBusService } from '../../core/event-bus/event-bus.service';
import { HaEvent } from '../../core/event-bus/events/ha-event.interface';

interface SubscribeEventsMessage extends WsBaseMessage {
  event_type?: string;
}

/**
 * Handles 'subscribe_events' messages.
 *
 * Client sends:
 *   { "id": 1, "type": "subscribe_events", "event_type": "state_changed" }
 *
 * Server registers a listener and sends events as:
 *   { "id": 1, "type": "event", "event": { ... } }
 *
 * Omitting event_type subscribes to ALL events (wildcard).
 */
@Injectable()
export class SubscribeEventsHandler implements IWsHandler {
  readonly type = 'subscribe_events';

  constructor(private readonly eventBus: EventBusService) {}

  async handle(session: WsSession, message: WsBaseMessage): Promise<void> {
    const msg = message as SubscribeEventsMessage;
    const subscriptionId = msg.id!;
    const eventType = msg.event_type || '*'; // EventEmitter2 wildcard

    // If already subscribed with this ID, remove old subscription
    if (session.subscriptions.has(subscriptionId)) {
      session.subscriptions.get(subscriptionId)!();
    }

    // Register event listener
    const unsubscribe = this.eventBus.listen(eventType, (event: HaEvent) => {
      if (session.socket.connected) {
        session.socket.emit('message', {
          id: subscriptionId,
          type: 'event',
          event,
        });
      }
    });

    session.subscriptions.set(subscriptionId, unsubscribe);

    // Send success result
    session.socket.emit('message', {
      id: subscriptionId,
      type: 'result',
      success: true,
      result: null,
    });
  }
}
