import { Injectable } from '@nestjs/common';
import { IWsHandler, WsBaseMessage } from '../interfaces/ws-handler.interface';
import { WsSession } from '../interfaces/ws-session.interface';
import { StateMachineService } from '../../core/state-machine/state-machine.service';

/**
 * Handles 'get_states' messages.
 *
 * Client sends:  { "id": 1, "type": "get_states" }
 * Server replies: { "id": 1, "type": "result", "success": true, "result": [...states] }
 */
@Injectable()
export class GetStatesHandler implements IWsHandler {
  readonly type = 'get_states';

  constructor(private readonly stateMachine: StateMachineService) {}

  async handle(session: WsSession, message: WsBaseMessage): Promise<void> {
    const states = this.stateMachine.getStates();

    session.socket.emit('message', {
      id: message.id,
      type: 'result',
      success: true,
      result: states,
    });
  }
}
