import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsSessionService } from './ws-session.service';
import { AuthService } from '../auth/auth.service';
import { IWsHandler, WsBaseMessage } from './interfaces/ws-handler.interface';
import { SubscribeEventsHandler } from './handlers/subscribe-events.handler';
import { UnsubscribeEventsHandler } from './handlers/unsubscribe-events.handler';
import { GetStatesHandler } from './handlers/get-states.handler';
import { GetServicesHandler } from './handlers/get-services.handler';
import { CallServiceHandler } from './handlers/call-service.handler';
import { PingHandler } from './handlers/ping.handler';
import { GetConfigHandler } from './handlers/get-config.handler';

/**
 * WebSocket Gateway implementing the Home Assistant WebSocket API protocol.
 *
 * ## Protocol Overview
 *
 * ### Phase 1: Authentication
 * 1. Client connects
 * 2. Server sends: { "type": "auth_required", "ha_version": "2026.3.0" }
 * 3. Client sends: { "type": "auth", "access_token": "..." }
 * 4. Server replies: { "type": "auth_ok" } or { "type": "auth_invalid", "message": "..." }
 * 5. On auth_invalid, connection is closed
 *
 * ### Phase 2: Command Phase
 * All messages have { "id": number, "type": string }
 * All responses have { "id": number, "type": "result", "success": bool }
 *
 * ## Supported Commands
 * - get_states: Returns all current entity states
 * - get_services: Returns all registered services
 * - get_config: Returns HA configuration
 * - call_service: Invokes a service
 * - subscribe_events: Subscribe to event type
 * - unsubscribe_events: Remove a subscription
 * - ping: Keepalive
 */
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  transports: ['websocket'],
  path: '/api/websocket',
})
export class WebSocketGateway_
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('WebSocketGateway');
  private readonly HA_VERSION = '2026.3.0';

  @WebSocketServer()
  server: Server;

  /** Command handler registry: message type → handler */
  private readonly handlers = new Map<string, IWsHandler>();

  constructor(
    private readonly sessionService: WsSessionService,
    private readonly authService: AuthService,
    subscribeEventsHandler: SubscribeEventsHandler,
    unsubscribeEventsHandler: UnsubscribeEventsHandler,
    getStatesHandler: GetStatesHandler,
    getServicesHandler: GetServicesHandler,
    callServiceHandler: CallServiceHandler,
    pingHandler: PingHandler,
    getConfigHandler: GetConfigHandler,
  ) {
    // Register all command handlers
    const allHandlers: IWsHandler[] = [
      subscribeEventsHandler,
      unsubscribeEventsHandler,
      getStatesHandler,
      getServicesHandler,
      callServiceHandler,
      pingHandler,
      getConfigHandler,
    ];

    for (const handler of allHandlers) {
      this.handlers.set(handler.type, handler);
    }
  }

  afterInit(): void {
    this.logger.log(
      `WebSocket Gateway initialized at /api/websocket`,
    );
  }

  /**
   * New client connected - start authentication phase.
   */
  handleConnection(socket: Socket): void {
    this.logger.debug(`Client connected: ${socket.id}`);
    const session = this.sessionService.createSession(socket);

    // Immediately send auth_required (Phase 1)
    socket.emit('message', {
      type: 'auth_required',
      ha_version: this.HA_VERSION,
    });

    // Handle all incoming messages
    socket.on('message', (data: unknown) => {
      this.handleMessage(socket, data).catch((err: Error) => {
        this.logger.error(
          `Error handling WS message from ${socket.id}: ${err.message}`,
        );
      });
    });
  }

  /**
   * Client disconnected - clean up session and subscriptions.
   */
  handleDisconnect(socket: Socket): void {
    this.logger.debug(`Client disconnected: ${socket.id}`);
    this.sessionService.destroySession(socket.id);
  }

  /**
   * Route incoming messages based on connection phase and message type.
   */
  private async handleMessage(socket: Socket, data: unknown): Promise<void> {
    let message: WsBaseMessage;

    try {
      message = typeof data === 'string' ? JSON.parse(data) : (data as WsBaseMessage);
    } catch {
      socket.emit('message', {
        type: 'result',
        success: false,
        error: { code: 'invalid_json', message: 'Invalid JSON' },
      });
      return;
    }

    const session = this.sessionService.getSession(socket.id);
    if (!session) {
      socket.disconnect();
      return;
    }

    // Phase 1: Only accept 'auth' messages
    if (session.phase === 'auth') {
      await this.handleAuthMessage(socket, message);
      return;
    }

    // Phase 2: Route to command handlers
    if (!message.id) {
      socket.emit('message', {
        type: 'result',
        success: false,
        error: { code: 'invalid_format', message: 'Message missing id' },
      });
      return;
    }

    const handler = this.handlers.get(message.type);
    if (!handler) {
      socket.emit('message', {
        id: message.id,
        type: 'result',
        success: false,
        error: {
          code: 'unknown_command',
          message: `Unknown command: ${message.type}`,
        },
      });
      return;
    }

    await handler.handle(session, message);
  }

  /**
   * Handle authentication phase messages.
   * Only 'auth' type is accepted during auth phase.
   */
  private async handleAuthMessage(
    socket: Socket,
    message: WsBaseMessage,
  ): Promise<void> {
    if (message.type !== 'auth') {
      socket.emit('message', {
        type: 'auth_invalid',
        message: 'Expected auth message',
      });
      socket.disconnect();
      return;
    }

    const accessToken = message['access_token'] as string;
    if (!accessToken) {
      socket.emit('message', {
        type: 'auth_invalid',
        message: 'Missing access_token',
      });
      socket.disconnect();
      return;
    }

    const user = await this.authService.validateToken(accessToken);
    if (!user) {
      this.logger.warn(`Authentication failed for socket: ${socket.id}`);
      socket.emit('message', {
        type: 'auth_invalid',
        message: 'Invalid access token',
      });
      socket.disconnect();
      return;
    }

    // Authentication successful - transition to command phase
    const session = this.sessionService.getSession(socket.id);
    if (session) {
      session.authenticated = true;
      session.user = user;
      session.phase = 'command';
    }

    socket.emit('message', {
      type: 'auth_ok',
      ha_version: this.HA_VERSION,
    });

    this.logger.debug(
      `Client ${socket.id} authenticated as user: ${user.username}`,
    );
  }
}
