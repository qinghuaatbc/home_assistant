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
  clientId: string
  displayName: string
  joinedAt: number
}

export interface ChatMessage {
  from: string
  fromName: string
  to: string | null
  text: string
  timestamp: number
  system?: boolean
}

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected'

interface CommContextValue {
  selfId: string | null
  displayName: string
  setDisplayName: (name: string) => void
  users: CommUser[]
  messages: ChatMessage[]
  sendMessage: (text: string, to?: string) => void
  callState: CallState
  callPeer: CommUser | null
  incomingVideo: boolean
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  startCall: (user: CommUser, video: boolean) => void
  acceptCall: () => void
  hangup: () => void
  unreadCount: number
  clearUnread: () => void
  panelOpenRef: React.MutableRefObject<boolean>
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
  const panelOpenRef = useRef<boolean>(false)

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

  // Keep callPeerRef in sync with callPeer state
  useEffect(() => {
    callPeerRef.current = callPeer
  }, [callPeer])

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

  // ── WebRTC: start outgoing call ────────────────────────────────────────────

  const startCall = useCallback(async (user: CommUser, video: boolean) => {
    setCallState('calling')
    setCallPeer(user)
    callPeerRef.current = user

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
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
      setRemoteStream(e.streams[0])
      remoteStreamRef.current = e.streams[0]
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
        video: incomingVideo,
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

    pc.ontrack = e => {
      setRemoteStream(e.streams[0])
      remoteStreamRef.current = e.streams[0]
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
  }, [incomingVideo, cleanup])

  // ── hangup ─────────────────────────────────────────────────────────────────

  const hangup = useCallback(() => {
    cleanup(false)
  }, [cleanup])

  // ── sendMessage ────────────────────────────────────────────────────────────

  const sendMessage = useCallback((text: string, to?: string) => {
    if (!text.trim() || !socketRef.current) return
    socketRef.current.emit('chat_message', { to: to ?? null, text: text.trim() })
  }, [])

  // ── setDisplayName ─────────────────────────────────────────────────────────

  const setDisplayName = useCallback((name: string) => {
    if (!name.trim()) return
    const trimmed = name.trim()
    setDisplayNameState(trimmed)
    localStorage.setItem('comm_display_name', trimmed)
    socketRef.current?.emit('register', { displayName: trimmed })
  }, [])

  // ── clearUnread ────────────────────────────────────────────────────────────

  const clearUnread = useCallback(() => {
    setUnreadCount(0)
  }, [])

  // ── Socket setup (mount once) ──────────────────────────────────────────────

  useEffect(() => {
    const socket = io({ path: '/api/comm', transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('welcome', ({ clientId, displayName: name }: { clientId: string; displayName: string }) => {
      selfIdRef.current = clientId
      setSelfId(clientId)

      // Restore saved display name
      const saved = localStorage.getItem('comm_display_name')
      if (saved) {
        setDisplayNameState(saved)
        socket.emit('register', { displayName: saved })
      } else {
        setDisplayNameState(name)
      }
    })

    socket.on('users', (list: CommUser[]) => {
      setUsers(list)
    })

    socket.on('chat_message', (msg: ChatMessage) => {
      setMessages(prev => {
        const next = [...prev, msg]
        return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
      })
      if (!panelOpenRef.current) {
        setUnreadCount(c => c + 1)
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

    socket.on(
      'signal',
      async (data: {
        from: string
        fromName: string
        type: string
        payload: RTCSessionDescriptionInit & { video?: boolean } & RTCIceCandidateInit
      }) => {
        const { from, fromName, type, payload } = data

        if (type === 'offer') {
          pendingOfferRef.current = payload
          setCallPeer({ clientId: from, displayName: fromName, joinedAt: 0 })
          callPeerRef.current = { clientId: from, displayName: fromName, joinedAt: 0 }
          setIncomingVideo(!!payload.video)
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
    callState,
    callPeer,
    incomingVideo,
    localStream,
    remoteStream,
    startCall,
    acceptCall,
    hangup,
    unreadCount,
    clearUnread,
    panelOpenRef,
  }

  return <CommContext.Provider value={value}>{children}</CommContext.Provider>
}

export function useComm(): CommContextValue {
  const ctx = useContext(CommContext)
  if (!ctx) throw new Error('useComm must be used within CommProvider')
  return ctx
}
