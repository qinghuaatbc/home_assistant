import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { WsSession } from './interfaces/ws-session.interface';

/**
 * Manages per-connection WebSocket session state.
 * Session state is stored here (not on socket objects) for testability.
 */
@Injectable()
export class WsSessionService {
  private readonly sessions = new Map<string, WsSession>();

  /**
   * Create a new session for a connecting socket.
   * Starts in 'auth' phase - client must authenticate before sending commands.
   */
  createSession(socket: Socket): WsSession {
    const session: WsSession = {
      socketId: socket.id,
      socket,
      phase: 'auth',
      authenticated: false,
      user: null,
      subscriptions: new Map(),
    };
    this.sessions.set(socket.id, session);
    return session;
  }

  getSession(socketId: string): WsSession | undefined {
    return this.sessions.get(socketId);
  }

  /**
   * Clean up a disconnected socket's session.
   * Unsubscribes all event listeners to prevent memory leaks.
   */
  destroySession(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (!session) return;

    // Clean up all event subscriptions
    for (const [, unsubscribe] of session.subscriptions) {
      try {
        unsubscribe();
      } catch {
        // Ignore cleanup errors
      }
    }

    this.sessions.delete(socketId);
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getAuthenticatedCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.authenticated) count++;
    }
    return count;
  }
}
