import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react'
import { io, Socket } from 'socket.io-client'

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface CommUser {
  clientId: string   // session clientId for online users; deviceId for offline users
  displayName: string
  joinedAt: number
  online: boolean
}

export interface GroupPeer {
  clientId: string
  displayName: string
  stream: MediaStream | null
}

export interface ChatMessage {
  from: string
  fromName: string
  to: string | null
  text: string
  timestamp: number
  system?: boolean
  voiceId?: number      // set for voice messages instead of text
  durationMs?: number
  msgId?: string        // unique id for read receipts
  readBy?: string[]     // clientIds that have read this message
  mediaUrl?: string     // set for image/video/file messages
  mediaType?: 'image' | 'video' | 'file'
  mediaName?: string
}

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected'

interface CommContextValue {
  selfId: string | null
  displayName: string
  setDisplayName: (name: string) => void
  users: CommUser[]
  messages: ChatMessage[]
  sendMessage: (text: string, to?: string) => void
  sendVoiceMessage: (blob: Blob, durationMs: number, to?: string) => Promise<void>
  sendMedia: (file: File, to?: string) => Promise<void>
  markRead: (msgId: string) => void
  callState: CallState
  callPeer: CommUser | null
  incomingVideo: boolean
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  startCall: (user: CommUser, video: boolean) => void
  pushCall: (user: CommUser) => void
  acceptCall: () => void
  hangup: () => void
  unreadCount: number
  clearUnread: () => void
  panelOpen: boolean
  setPanelOpen: (v: boolean | ((v: boolean) => boolean)) => void
  panelOpenRef: React.MutableRefObject<boolean>
  groupCallRoom: string | null
  groupPeers: GroupPeer[]
  localGroupStream: MediaStream | null
  startGroupCall: () => void
  joinGroupCall: (roomId: string) => void
  leaveGroupCall: () => void
}

// ── Constants ────────────────────────────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const MAX_MESSAGES = 200

// ── Context ──────────────────────────────────────────────────────────────────

const CommContext = createContext<CommContextValue | null>(null)

export function CommProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null)
  const selfIdRef = useRef<string | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const callPeerRef = useRef<CommUser | null>(null)
  const incomingVideoRef = useRef<boolean>(false)
  const panelOpenRef = useRef<boolean>(false)

  // Group call refs
  const groupRoomRef = useRef<string | null>(null)
  const groupPcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const localGroupStreamRef = useRef<MediaStream | null>(null)

  const [selfId, setSelfId] = useState<string | null>(null)
  const [displayName, setDisplayNameState] = useState<string>('')
  const [users, setUsers] = useState<CommUser[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [callState, setCallState] = useState<CallState>('idle')
  const [callPeer, setCallPeer] = useState<CommUser | null>(null)
  const [incomingVideo, setIncomingVideo] = useState<boolean>(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [panelOpen, setPanelOpen] = useState<boolean>(false)

  // Group call state
  const [groupCallRoom, setGroupCallRoom] = useState<string | null>(null)
  const [groupPeers, setGroupPeers] = useState<GroupPeer[]>([])
  const [localGroupStream, setLocalGroupStream] = useState<MediaStream | null>(null)

  // Keep callPeerRef in sync with callPeer state
  useEffect(() => {
    callPeerRef.current = callPeer
  }, [callPeer])

  // Keep panelOpenRef in sync with panelOpen state
  useEffect(() => {
    panelOpenRef.current = panelOpen
    if (panelOpen) setUnreadCount(0)
  }, [panelOpen])

  // ── Cleanup helper ─────────────────────────────────────────────────────────

  const cleanup = useCallback((receivedHangup = false) => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    remoteStreamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)

    if (!receivedHangup && callPeerRef.current && socketRef.current) {
      socketRef.current.emit('signal', {
        to: callPeerRef.current.clientId,
        type: 'hangup',
        payload: null,
      })
    }

    setCallState('idle')
    setCallPeer(null)
    pendingOfferRef.current = null
  }, [])

  // ── Group call helpers ─────────────────────────────────────────────────────

  const updateGroupPeerStream = useCallback((clientId: string, displayName: string, stream: MediaStream | null) => {
    setGroupPeers(prev => {
      const exists = prev.some(p => p.clientId === clientId)
      if (exists) return prev.map(p => p.clientId === clientId ? { ...p, stream: stream ?? p.stream } : p)
      return [...prev, { clientId, displayName, stream }]
    })
  }, [])

  const createGroupPc = useCallback((peerId: string, peerName: string, stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    groupPcMapRef.current.set(peerId, pc)
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    pc.ontrack = e => {
      const s = (e.streams && e.streams[0]) ? e.streams[0] : (() => {
        const ms = new MediaStream(); ms.addTrack(e.track); return ms
      })()
      updateGroupPeerStream(peerId, peerName, s)
    }
    pc.onicecandidate = e => {
      if (e.candidate) socketRef.current?.emit('signal', { to: peerId, type: 'ice', payload: e.candidate, group: true })
    }
    return pc
  }, [updateGroupPeerStream])

  const startGroupCall = useCallback(async () => {
    const roomId = Math.random().toString(36).slice(2, 10)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
    } catch { return }
    localGroupStreamRef.current = stream
    setLocalGroupStream(stream)
    groupRoomRef.current = roomId
    setGroupCallRoom(roomId)
    socketRef.current?.emit('join_group_call', { roomId })
  }, [])

  const joinGroupCall = useCallback(async (roomId: string) => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
    } catch { return }
    localGroupStreamRef.current = stream
    setLocalGroupStream(stream)
    groupRoomRef.current = roomId
    setGroupCallRoom(roomId)
    socketRef.current?.emit('join_group_call', { roomId })
  }, [])

  const leaveGroupCall = useCallback(() => {
    const roomId = groupRoomRef.current
    if (roomId) socketRef.current?.emit('leave_group_call', { roomId })
    groupPcMapRef.current.forEach(pc => pc.close())
    groupPcMapRef.current.clear()
    localGroupStreamRef.current?.getTracks().forEach(t => t.stop())
    localGroupStreamRef.current = null
    setLocalGroupStream(null)
    setGroupPeers([])
    setGroupCallRoom(null)
    groupRoomRef.current = null
  }, [])

  // ── WebRTC: start outgoing call ────────────────────────────────────────────

  const startCall = useCallback(async (user: CommUser, video: boolean) => {
    setCallState('calling')
    setCallPeer(user)
    callPeerRef.current = user

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video
          ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
          : false,
      })
    } catch {
      setCallState('idle')
      setCallPeer(null)
      callPeerRef.current = null
      return
    }

    setLocalStream(stream)
    localStreamRef.current = stream

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    pc.ontrack = e => {
      // e.streams[0] can be undefined on mobile — accumulate tracks manually
      const s: MediaStream = (e.streams && e.streams[0])
        ? e.streams[0]
        : (() => {
            const existing = remoteStreamRef.current ?? new MediaStream()
            existing.addTrack(e.track)
            return existing
          })()
      remoteStreamRef.current = s
      setRemoteStream(new MediaStream(s.getTracks()))
    }

    pc.onicecandidate = e => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('signal', {
          to: user.clientId,
          type: 'ice',
          payload: e.candidate,
        })
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    socketRef.current?.emit('signal', {
      to: user.clientId,
      type: 'offer',
      payload: { sdp: offer.sdp, type: offer.type, video },
    })
  }, [])

  // ── WebRTC: accept incoming call ───────────────────────────────────────────

  const acceptCall = useCallback(async () => {
    const offer = pendingOfferRef.current
    if (!offer || !callPeerRef.current) return

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incomingVideoRef.current
          ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
          : false,
      })
    } catch {
      cleanup()
      return
    }

    setLocalStream(stream)
    localStreamRef.current = stream

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    // If callee has no video, still receive caller's video via recvonly transceiver
    if (!incomingVideoRef.current) {
      pc.addTransceiver('video', { direction: 'recvonly' })
    }

    pc.ontrack = e => {
      const s: MediaStream = (e.streams && e.streams[0])
        ? e.streams[0]
        : (() => {
            const existing = remoteStreamRef.current ?? new MediaStream()
            existing.addTrack(e.track)
            return existing
          })()
      remoteStreamRef.current = s
      setRemoteStream(new MediaStream(s.getTracks()))
    }

    pc.onicecandidate = e => {
      if (e.candidate && socketRef.current && callPeerRef.current) {
        socketRef.current.emit('signal', {
          to: callPeerRef.current.clientId,
          type: 'ice',
          payload: e.candidate,
        })
      }
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    socketRef.current?.emit('signal', {
      to: callPeerRef.current.clientId,
      type: 'answer',
      payload: answer,
    })

    setCallState('connected')
  }, [cleanup])

  // ── sendVoiceMessage ───────────────────────────────────────────────────────

  const sendVoiceMessage = useCallback(async (blob: Blob, durationMs: number, to?: string) => {
    const id = selfIdRef.current
    if (!id) return
    const savedName = localStorage.getItem('comm_display_name') ?? displayName
    const form = new FormData()
    form.append('audio', blob, 'voice.webm')
    form.append('senderId', id)
    form.append('senderName', savedName)
    form.append('durationMs', String(durationMs))
    if (to) form.append('recipientId', to)
    try {
      const res = await fetch('/api/comm/voice-message', { method: 'POST', body: form })
      const data = await res.json()
      if (data.id) {
        // Inject into local message list immediately
        const msg: ChatMessage = {
          from: id, fromName: savedName, to: to ?? null,
          text: '', voiceId: data.id, durationMs, timestamp: Date.now(),
        }
        setMessages(prev => [...prev, msg].slice(-MAX_MESSAGES))
      }
    } catch {}
  }, [displayName])

  // ── sendMedia ──────────────────────────────────────────────────────────────

  const sendMedia = useCallback(async (file: File, to?: string) => {
    const id = selfIdRef.current
    if (!id) return
    const savedName = localStorage.getItem('comm_display_name') ?? displayName
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('senderId', id)
    form.append('senderName', savedName)
    if (to) form.append('recipientId', to)
    try {
      const res = await fetch('/api/comm/media', { method: 'POST', body: form })
      const data = await res.json()
      if (!data.url) return
      const msgId = Math.random().toString(36).slice(2) + Date.now().toString(36)
      // Emit via socket — the gateway echoes it back to the sender, same as sendMessage
      socketRef.current?.emit('chat_message', {
        to: to ?? null,
        text: '',
        msgId,
        mediaUrl: data.url,
        mediaType: data.mediaType,
        mediaName: data.mediaName,
      })
    } catch {}
  }, [displayName])

  // ── markRead ───────────────────────────────────────────────────────────────

  const markRead = useCallback((msgId: string) => {
    socketRef.current?.emit('read_receipt', { msgId, readerId: selfIdRef.current })
  }, [])

  // ── hangup ─────────────────────────────────────────────────────────────────

  const hangup = useCallback(() => {
    cleanup(false)
  }, [cleanup])

  // ── sendMessage ────────────────────────────────────────────────────────────

  const sendMessage = useCallback((text: string, to?: string) => {
    if (!text.trim() || !socketRef.current) return
    const msgId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    socketRef.current.emit('chat_message', { to: to ?? null, text: text.trim(), msgId })
  }, [])

  // ── pushCall — wake an offline user via push notification ──────────────────

  const pushCall = useCallback((user: CommUser) => {
    socketRef.current?.emit('push_call', { to: user.clientId })
  }, [])

  // ── setDisplayName ─────────────────────────────────────────────────────────

  // Persistent device ID — survives reconnects so server can track this device
  const deviceId = (() => {
    let id = localStorage.getItem('comm_device_id')
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('comm_device_id', id) }
    return id
  })()

  const setDisplayName = useCallback((name: string) => {
    if (!name.trim()) return
    const trimmed = name.trim()
    setDisplayNameState(trimmed)
    localStorage.setItem('comm_display_name', trimmed)
    socketRef.current?.emit('register', { displayName: trimmed, deviceId })
  }, [deviceId])

  // ── clearUnread ────────────────────────────────────────────────────────────

  const clearUnread = useCallback(() => {
    setUnreadCount(0)
  }, [])

  // ── Socket setup (mount once) ──────────────────────────────────────────────

  useEffect(() => {
    const socket = io('/', {
      path: '/api/comm/socket',
      transports: ['polling', 'websocket'],
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    })
    socketRef.current = socket

    // Re-register push endpoint whenever the user enables push after connecting
    const onPushSubscribed = (e: Event) => {
      socket.emit('register_push', { endpoint: (e as CustomEvent).detail })
    }
    window.addEventListener('push-subscribed', onPushSubscribed)

    // iOS PWA: reconnect when app returns to foreground
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !socket.connected) {
        socket.disconnect(); socket.connect()
      }
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) { socket.disconnect(); socket.connect() }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)

    socket.on('welcome', ({ clientId, displayName: name }: { clientId: string; displayName: string }) => {
      selfIdRef.current = clientId
      setSelfId(clientId)

      // Restore saved display name
      const saved = localStorage.getItem('comm_display_name')
      if (saved) {
        setDisplayNameState(saved)
        socket.emit('register', { displayName: saved, deviceId })
      } else {
        setDisplayNameState(name)
        socket.emit('register', { deviceId })
      }

      // Register push subscription so server can send call notifications to locked phones
      navigator.serviceWorker?.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => { if (sub) socket.emit('register_push', { endpoint: sub.endpoint }) })
        .catch(() => {})

      // Also register when the user enables push notifications after connecting
      window.addEventListener('push-subscribed', onPushSubscribed)
    })

    socket.on('users', (list: CommUser[]) => {
      setUsers(list)
    })

    socket.on('chat_message', (msg: ChatMessage) => {
      const withId = { ...msg, readBy: [] }
      setMessages(prev => {
        // Deduplicate by msgId (prevents double-render if client also injected locally)
        if (msg.msgId && prev.some(m => m.msgId === msg.msgId)) return prev
        const next = [...prev, withId]
        return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
      })
      if (!panelOpenRef.current) {
        setUnreadCount(c => c + 1)
      }
      // Auto-send read receipt when panel is open
      if (panelOpenRef.current && msg.msgId && selfIdRef.current) {
        socket.emit('read_receipt', { msgId: msg.msgId, readerId: selfIdRef.current })
      }
    })

    socket.on('system_message', ({ text, timestamp }: { text: string; timestamp: number }) => {
      const msg: ChatMessage = {
        from: '__system__',
        fromName: 'System',
        to: null,
        text,
        timestamp,
        system: true,
      }
      setMessages(prev => {
        const next = [...prev, msg]
        return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
      })
    })

    socket.on('voice_message', (data: { id: number; senderId: string; senderName: string; recipientId: string | null; durationMs: number; createdAt: string }) => {
      const msg: ChatMessage = {
        from: data.senderId, fromName: data.senderName,
        to: data.recipientId, text: '',
        voiceId: data.id, durationMs: data.durationMs,
        timestamp: new Date(data.createdAt).getTime(),
      }
      setMessages(prev => [...prev, msg].slice(-MAX_MESSAGES))
      if (!panelOpenRef.current) setUnreadCount(c => c + 1)
    })

    socket.on('read_receipt', ({ msgId, readerId }: { msgId: string; readerId: string }) => {
      setMessages(prev => prev.map(m =>
        m.msgId === msgId
          ? { ...m, readBy: [...(m.readBy ?? []).filter(id => id !== readerId), readerId] }
          : m
      ))
    })

    socket.on('group_call_peers', async ({ roomId, peers }: { roomId: string; peers: { clientId: string; displayName: string }[] }) => {
      const stream = localGroupStreamRef.current
      if (!stream) return
      for (const peer of peers) {
        setGroupPeers(prev => prev.some(p => p.clientId === peer.clientId) ? prev : [...prev, { ...peer, stream: null }])
        const pc = createGroupPc(peer.clientId, peer.displayName, stream)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('signal', { to: peer.clientId, type: 'offer', payload: { ...offer, group: true }, group: true })
      }
    })

    socket.on('group_call_join', ({ peer }: { roomId: string; peer: { clientId: string; displayName: string } }) => {
      setGroupPeers(prev => prev.some(p => p.clientId === peer.clientId) ? prev : [...prev, { ...peer, stream: null }])
    })

    socket.on('group_call_leave', ({ clientId }: { roomId: string; clientId: string }) => {
      setGroupPeers(prev => prev.filter(p => p.clientId !== clientId))
      const pc = groupPcMapRef.current.get(clientId)
      if (pc) { pc.close(); groupPcMapRef.current.delete(clientId) }
    })

    socket.on(
      'signal',
      async (data: {
        from: string
        fromName: string
        type: string
        payload: RTCSessionDescriptionInit & { video?: boolean; group?: boolean } & RTCIceCandidateInit
        group?: boolean
      }) => {
        const { from, fromName, type, payload } = data

        // ── Group call signals ──────────────────────────────────────────────
        if (data.group || payload?.group) {
          if (type === 'offer') {
            const stream = localGroupStreamRef.current
            if (!stream) return
            setGroupPeers(prev => prev.some(p => p.clientId === from) ? prev : [...prev, { clientId: from, displayName: fromName, stream: null }])
            const pc = createGroupPc(from, fromName, stream)
            await pc.setRemoteDescription(new RTCSessionDescription(payload))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            socket.emit('signal', { to: from, type: 'answer', payload: { ...answer, group: true }, group: true })
          } else if (type === 'answer') {
            const pc = groupPcMapRef.current.get(from)
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload)).catch(() => {})
          } else if (type === 'ice') {
            const pc = groupPcMapRef.current.get(from)
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(payload)).catch(() => {})
          }
          return
        }

        // ── 1-to-1 call signals ─────────────────────────────────────────────
        if (type === 'offer') {
          pendingOfferRef.current = payload
          setCallPeer({ clientId: from, displayName: fromName, joinedAt: 0, online: true })
          callPeerRef.current = { clientId: from, displayName: fromName, joinedAt: 0, online: true }
          setIncomingVideo(!!payload.video)
          incomingVideoRef.current = !!payload.video
          setCallState('incoming')
        } else if (type === 'answer') {
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload))
            setCallState('connected')
          }
        } else if (type === 'ice') {
          if (pcRef.current) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(payload))
            } catch {
              // ignore stale ICE candidates
            }
          }
        } else if (type === 'hangup') {
          cleanup(true)
        }
      },
    )

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('push-subscribed', onPushSubscribed)
      socket.disconnect()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value: CommContextValue = {
    selfId,
    displayName,
    setDisplayName,
    users,
    messages,
    sendMessage,
    sendVoiceMessage,
    sendMedia,
    markRead,
    callState,
    callPeer,
    incomingVideo,
    localStream,
    remoteStream,
    startCall,
    pushCall,
    acceptCall,
    hangup,
    unreadCount,
    clearUnread,
    panelOpen,
    setPanelOpen,
    panelOpenRef,
    groupCallRoom,
    groupPeers,
    localGroupStream,
    startGroupCall,
    joinGroupCall,
    leaveGroupCall,
  }

  return <CommContext.Provider value={value}>{children}</CommContext.Provider>
}

export function useComm(): CommContextValue {
  const ctx = useContext(CommContext)
  if (!ctx) throw new Error('useComm must be used within CommProvider')
  return ctx
}
