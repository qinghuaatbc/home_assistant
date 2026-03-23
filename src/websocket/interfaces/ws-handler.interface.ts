import { WsSession } from './ws-session.interface';

export interface WsBaseMessage {
  id?: number;
  type: string;
  [key: string]: unknown;
}

export interface WsResultMessage<T = unknown> {
  id: number;
  type: 'result';
  success: boolean;
  result?: T;
  error?: { code: string; message: string };
}

export interface WsEventMessage<T = unknown> {
  id: number;
  type: 'event';
  event: T;
}

/** Interface all WebSocket message handlers must implement */
export interface IWsHandler {
  /** The message type this handler processes */
  readonly type: string;

  /** Process an incoming message */
  handle(session: WsSession, message: WsBaseMessage): Promise<void>;
}
