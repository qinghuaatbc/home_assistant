import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

interface CommUser {
  clientId: string;
  socketId: string;
  displayName: string;
  joinedAt: number;
}

@WebSocketGateway({
  transports: ['polling', 'websocket'],
  path: '/api/comm',
})
export class CommGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('CommGateway');

  @WebSocketServer()
  server: Server;

  /** Map from clientId → CommUser */
  private readonly users = new Map<string, CommUser>();

  afterInit(): void {
    this.logger.log('CommGateway initialized at /api/comm');
  }

  handleConnection(socket: Socket): void {
    const clientId = Math.random().toString(36).slice(2, 10);
    const displayName = `User-${clientId.slice(0, 4)}`;
    const user: CommUser = {
      clientId,
      socketId: socket.id,
      displayName,
      joinedAt: Date.now(),
    };
    this.users.set(clientId, user);

    this.logger.debug(`Client connected: ${socket.id} → clientId=${clientId}`);

    // Greet new client
    socket.emit('welcome', { clientId, displayName });
    socket.emit('users', this.getUserList());

    // Broadcast updated user list to all others
    socket.broadcast.emit('users', this.getUserList());

    // ── Event listeners ──────────────────────────────────────────────────────

    socket.on('register', (data: { displayName?: string }) => {
      const u = this.findUserBySocketId(socket.id);
      if (!u) return;
      if (data?.displayName) {
        u.displayName = data.displayName;
        this.users.set(u.clientId, u);
      }
      this.server.emit('users', this.getUserList());
    });

    socket.on(
      'chat_message',
      (data: { to?: string; text: string }) => {
        const sender = this.findUserBySocketId(socket.id);
        if (!sender || !data?.text) return;

        const msg = {
          from: sender.clientId,
          fromName: sender.displayName,
          to: data.to ?? null,
          text: data.text,
          timestamp: Date.now(),
        };

        if (data.to) {
          // Private message: send to target + echo to sender
          const targetSocket = this.findSocket(data.to);
          if (targetSocket) targetSocket.emit('chat_message', msg);
          socket.emit('chat_message', msg); // echo
        } else {
          // Group broadcast
          this.server.emit('chat_message', msg);
        }
      },
    );

    socket.on(
      'signal',
      (data: { to: string; type: string; payload: unknown }) => {
        const sender = this.findUserBySocketId(socket.id);
        if (!sender || !data?.to) return;

        const targetSocket = this.findSocket(data.to);
        if (targetSocket) {
          targetSocket.emit('signal', {
            from: sender.clientId,
            fromName: sender.displayName,
            type: data.type,
            payload: data.payload,
          });
        }
      },
    );
  }

  handleDisconnect(socket: Socket): void {
    const user = this.findUserBySocketId(socket.id);
    if (!user) return;

    this.logger.debug(`Client disconnected: ${socket.id} (${user.displayName})`);
    this.users.delete(user.clientId);

    // Notify remaining clients
    this.server.emit('users', this.getUserList());
    this.server.emit('system_message', {
      text: `${user.displayName} left`,
      timestamp: Date.now(),
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private getUserList(): Omit<CommUser, 'socketId'>[] {
    return Array.from(this.users.values()).map(({ clientId, displayName, joinedAt }) => ({
      clientId,
      displayName,
      joinedAt,
    }));
  }

  private findUserBySocketId(socketId: string): CommUser | undefined {
    for (const user of this.users.values()) {
      if (user.socketId === socketId) return user;
    }
    return undefined;
  }

  private findSocket(clientId: string): Socket | undefined {
    const user = this.users.get(clientId);
    if (!user) return undefined;
    return this.server.sockets.sockets.get(user.socketId);
  }
}
