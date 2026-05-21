import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PushService } from '../push/push.service';
import { VoiceMessageEntity } from './voice-message.entity';
import { ChatMessageService } from './chat-message.service';

interface CommUser {
  clientId: string;
  socketId: string;
  displayName: string;
  joinedAt: number;
  deviceId?: string;
}

interface DeviceRecord {
  deviceId: string;
  displayName: string;
  pushEndpoint?: string;
  clientId?: string;   // current session clientId; undefined when offline
  lastSeen: number;
}

interface FrontendUser {
  clientId: string;
  displayName: string;
  joinedAt: number;
  online: boolean;
}

@Injectable()
@WebSocketGateway({
  transports: ['polling', 'websocket'],
  path: '/api/comm/socket',
})
export class CommGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('CommGateway');

  @WebSocketServer()
  server: Server;

  /** Active sessions: clientId → CommUser */
  private readonly users = new Map<string, CommUser>();

  /** Persistent device registry: deviceId → DeviceRecord */
  private readonly devices = new Map<string, DeviceRecord>();

  /** Group call rooms: roomId → Set<clientId> */
  private readonly rooms = new Map<string, Set<string>>();

  constructor(
    private readonly pushService: PushService,
    private readonly chatMessageService: ChatMessageService,
  ) {}

  afterInit(): void {
    this.logger.log('CommGateway initialized at /api/comm');
  }

  handleConnection(socket: Socket): void {
    const clientId = Math.random().toString(36).slice(2, 10);
    const displayName = `User-${clientId.slice(0, 4)}`;
    const user: CommUser = { clientId, socketId: socket.id, displayName, joinedAt: Date.now() };
    this.users.set(clientId, user);

    this.logger.debug(`Client connected: ${socket.id} → clientId=${clientId}`);

    socket.emit('welcome', { clientId, displayName });
    socket.emit('users', this.getUserList());
    socket.broadcast.emit('users', this.getUserList());

    // ── register: display name + deviceId ──────────────────────────────────

    socket.on('register', (data: { displayName?: string; deviceId?: string }) => {
      const u = this.findUserBySocketId(socket.id);
      if (!u) return;
      if (data?.displayName) {
        u.displayName = data.displayName;
        this.users.set(u.clientId, u);
      }
      if (data?.deviceId) {
        u.deviceId = data.deviceId;
        // Create or update device record
        const existing = this.devices.get(data.deviceId);
        this.devices.set(data.deviceId, {
          deviceId: data.deviceId,
          displayName: data?.displayName ?? u.displayName,
          pushEndpoint: existing?.pushEndpoint,
          clientId: u.clientId,
          lastSeen: Date.now(),
        });
      }
      this.server.emit('users', this.getUserList());
    });

    // ── register_push ───────────────────────────────────────────────────────

    socket.on('register_push', (data: { endpoint?: string }) => {
      const u = this.findUserBySocketId(socket.id);
      if (!u || !data?.endpoint) return;
      // Store endpoint in device record (keyed by deviceId if known, else by clientId as fallback)
      const key = u.deviceId ?? u.clientId;
      const existing = this.devices.get(key) ?? {
        deviceId: key,
        displayName: u.displayName,
        clientId: u.clientId,
        lastSeen: Date.now(),
      };
      existing.pushEndpoint = data.endpoint;
      this.devices.set(key, existing);
      this.logger.log(`Push endpoint registered for ${u.displayName} (device=${key})`);
      this.server.emit('users', this.getUserList());
    });

    // ── chat_message ────────────────────────────────────────────────────────

    socket.on('chat_message', (data: { to?: string; text?: string; msgId?: string; mediaUrl?: string; mediaType?: string; mediaName?: string }) => {
      const sender = this.findUserBySocketId(socket.id);
      if (!sender || (!data?.text && !data?.mediaUrl)) return;
      const msg = {
        from: sender.clientId,
        fromName: sender.displayName,
        to: data.to ?? null,
        text: data.text ?? '',
        msgId: data.msgId ?? null,
        mediaUrl: data.mediaUrl ?? null,
        mediaType: data.mediaType ?? null,
        mediaName: data.mediaName ?? null,
        timestamp: Date.now(),
      };
      this.chatMessageService.save({ ...msg, isSystem: 0 }).catch(() => {});
      if (data.to) {
        const targetSocket = this.findSocket(data.to);
        if (targetSocket) targetSocket.emit('chat_message', msg);
        socket.emit('chat_message', msg);
      } else {
        this.server.emit('chat_message', msg);
      }
    });

    // ── read_receipt ────────────────────────────────────────────────────────

    socket.on('read_receipt', (data: { msgId: string; readerId: string }) => {
      if (!data?.msgId) return;
      // Broadcast to all so sender sees the receipt
      this.server.emit('read_receipt', { msgId: data.msgId, readerId: data.readerId });
    });

    // ── signal (WebRTC) ─────────────────────────────────────────────────────

    socket.on('signal', (data: { to: string; type: string; payload: unknown }) => {
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

      // Push notification for incoming call offer (callee may be backgrounded)
      if (data.type === 'offer') {
        const endpoint = this.findPushEndpoint(data.to);
        this.logger.log(`Call offer → ${data.to}, push: ${endpoint ? 'yes' : 'no'}`);
        if (endpoint) {
          this.pushService.sendToEndpoint(
            endpoint,
            `📞 ${sender.displayName}`,
            'Incoming call — tap to answer',
            { type: 'call' },
          ).then(() => this.logger.log('Push sent'))
           .catch(e => this.logger.error('Push failed', e));
        }
      }
    });

    // ── group call rooms ────────────────────────────────────────────────────

    socket.on('join_group_call', (data: { roomId: string }) => {
      const sender = this.findUserBySocketId(socket.id);
      if (!sender || !data?.roomId) return;

      const room = this.rooms.get(data.roomId) ?? new Set<string>();
      const existingPeers = Array.from(room)
        .map(cid => this.users.get(cid))
        .filter(Boolean)
        .map(u => ({ clientId: u!.clientId, displayName: u!.displayName }));

      room.add(sender.clientId);
      this.rooms.set(data.roomId, room);

      // Tell the new joiner who's already in the room
      socket.emit('group_call_peers', { roomId: data.roomId, peers: existingPeers });

      // Tell existing peers a new user joined
      for (const peerId of Array.from(room)) {
        if (peerId === sender.clientId) continue;
        const peerSocket = this.findSocket(peerId);
        peerSocket?.emit('group_call_join', { roomId: data.roomId, peer: { clientId: sender.clientId, displayName: sender.displayName } });
      }

      this.logger.log(`Group call ${data.roomId}: ${sender.displayName} joined (${room.size} total)`);
    });

    socket.on('leave_group_call', (data: { roomId: string }) => {
      const sender = this.findUserBySocketId(socket.id);
      if (!sender || !data?.roomId) return;
      this.leaveRoom(sender.clientId, data.roomId);
    });

    // ── push_call: caller wants to wake an offline user ─────────────────────

    socket.on('push_call', (data: { to: string }) => {
      const sender = this.findUserBySocketId(socket.id);
      if (!sender || !data?.to) return;
      const device = this.devices.get(data.to);
      this.logger.log(`push_call from ${sender.displayName} → device ${data.to}, endpoint: ${device?.pushEndpoint ? 'found' : 'missing'}`);
      if (device?.pushEndpoint) {
        this.pushService.sendToEndpoint(
          device.pushEndpoint,
          `📞 ${sender.displayName} is calling you`,
          'Tap to open app and answer',
          { type: 'call' },
        ).catch(e => this.logger.error('push_call failed', e));
      }
    });
  }

  handleDisconnect(socket: Socket): void {
    const user = this.findUserBySocketId(socket.id);
    if (!user) return;

    this.logger.debug(`Client disconnected: ${socket.id} (${user.displayName})`);
    this.users.delete(user.clientId);

    // Auto-leave any group call rooms
    for (const roomId of this.rooms.keys()) {
      this.leaveRoom(user.clientId, roomId);
    }

    // Update device record to mark as offline
    const key = user.deviceId ?? user.clientId;
    const device = this.devices.get(key);
    if (device) {
      device.clientId = undefined;
      device.lastSeen = Date.now();
      device.displayName = user.displayName;
    }

    this.server.emit('users', this.getUserList());
    this.server.emit('system_message', { text: `${user.displayName} left`, timestamp: Date.now() });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Called by VoiceMessageController after saving a voice message */
  deliverVoiceMessage(msg: VoiceMessageEntity): void {
    const payload = {
      id: msg.id, senderId: msg.senderId, senderName: msg.senderName,
      recipientId: msg.recipientId, durationMs: msg.durationMs,
      createdAt: msg.createdAt,
    }
    if (msg.recipientId) {
      const target = this.findSocket(msg.recipientId)
      if (target) target.emit('voice_message', payload)
    } else {
      this.server.emit('voice_message', payload)
    }
  }

  private leaveRoom(clientId: string, roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || !room.has(clientId)) return;
    room.delete(clientId);
    if (room.size === 0) {
      this.rooms.delete(roomId);
    } else {
      for (const peerId of room) {
        this.findSocket(peerId)?.emit('group_call_leave', { roomId, clientId });
      }
    }
  }

  private getUserList(): FrontendUser[] {
    const online: FrontendUser[] = Array.from(this.users.values()).map(u => ({
      clientId: u.clientId,
      displayName: u.displayName,
      joinedAt: u.joinedAt,
      online: true,
    }));

    const onlineClientIds = new Set(this.users.keys());
    const onlineDeviceIds = new Set(
      Array.from(this.users.values()).filter(u => u.deviceId).map(u => u.deviceId!)
    );

    // Include offline devices that have push endpoints
    const offline: FrontendUser[] = Array.from(this.devices.values())
      .filter(d => d.pushEndpoint && !onlineDeviceIds.has(d.deviceId) && (!d.clientId || !onlineClientIds.has(d.clientId)))
      .map(d => ({
        clientId: d.deviceId,   // use deviceId as routing key for push_call
        displayName: d.displayName,
        joinedAt: d.lastSeen,
        online: false,
      }));

    return [...online, ...offline];
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

  /** Find push endpoint for a clientId (online) or deviceId (offline) */
  private findPushEndpoint(id: string): string | undefined {
    // Try by clientId → look up deviceId → get endpoint
    const user = this.users.get(id);
    if (user?.deviceId) {
      return this.devices.get(user.deviceId)?.pushEndpoint
    }
    // Try direct device lookup (for offline users)
    return this.devices.get(id)?.pushEndpoint
  }
}
