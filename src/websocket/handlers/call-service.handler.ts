import { Injectable } from '@nestjs/common';
import { IWsHandler, WsBaseMessage } from '../interfaces/ws-handler.interface';
import { WsSession } from '../interfaces/ws-session.interface';
import { ServiceRegistryService } from '../../core/service-registry/service-registry.service';
import { ContextService } from '../../core/context/context.service';
import { ServiceTarget } from '../../core/service-registry/interfaces/ha-service.interface';

interface CallServiceMessage extends WsBaseMessage {
  domain: string;
  service: string;
  service_data?: Record<string, unknown>;
  target?: ServiceTarget;
}

/**
 * Handles 'call_service' messages.
 *
 * Client sends:
 *   {
 *     "id": 1, "type": "call_service",
 *     "domain": "light", "service": "turn_on",
 *     "target": { "entity_id": "light.living_room" },
 *     "service_data": { "brightness": 200 }
 *   }
 */
@Injectable()
export class CallServiceHandler implements IWsHandler {
  readonly type = 'call_service';

  constructor(
    private readonly serviceRegistry: ServiceRegistryService,
    private readonly contextService: ContextService,
  ) {}

  async handle(session: WsSession, message: WsBaseMessage): Promise<void> {
    const msg = message as CallServiceMessage;

    try {
      await this.serviceRegistry.call({
        domain: msg.domain,
        service: msg.service,
        service_data: msg.service_data ?? {},
        target: msg.target,
        context: this.contextService.create(session.user?.id ?? null),
      });

      session.socket.emit('message', {
        id: message.id,
        type: 'result',
        success: true,
        result: { context: {} },
      });
    } catch (err: unknown) {
      const error = err as Error;
      session.socket.emit('message', {
        id: message.id,
        type: 'result',
        success: false,
        error: {
          code: 'service_error',
          message: error.message,
        },
      });
    }
  }
}
