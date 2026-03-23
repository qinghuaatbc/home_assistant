import { Socket } from 'socket.io';
import { UserEntity } from '../../auth/entities/user.entity';
import { Unsubscribe } from '../../core/event-bus/event-bus.service';

/** Phases of a WebSocket connection, mirroring HA's WS protocol */
export type WsPhase = 'auth' | 'command';

/** Per-connection session state */
export interface WsSession {
  socketId: string;
  socket: Socket;
  phase: WsPhase;
  authenticated: boolean;
  user: UserEntity | null;
  /** Map of subscription_id → unsubscribe function */
  subscriptions: Map<number, Unsubscribe>;
}
