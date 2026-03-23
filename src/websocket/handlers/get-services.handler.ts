import { Injectable } from '@nestjs/common';
import { IWsHandler, WsBaseMessage } from '../interfaces/ws-handler.interface';
import { WsSession } from '../interfaces/ws-session.interface';
import { ServiceRegistryService } from '../../core/service-registry/service-registry.service';

@Injectable()
export class GetServicesHandler implements IWsHandler {
  readonly type = 'get_services';

  constructor(private readonly serviceRegistry: ServiceRegistryService) {}

  async handle(session: WsSession, message: WsBaseMessage): Promise<void> {
    session.socket.emit('message', {
      id: message.id,
      type: 'result',
      success: true,
      result: this.serviceRegistry.getAllServices(),
    });
  }
}
