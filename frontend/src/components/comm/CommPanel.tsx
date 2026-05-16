import { useState, useRef, useEffect, useCallback } from 'react'
import { useComm, CommUser, ChatMessage } from '../../context/CommContext'
import { GroupCallOverlay } from './GroupCallOverlay'

// ── Voice message recording button ───────────────────────────────────────────

function VoiceMsgButton({ onSend }: { onSend: (blob: Blob, durationMs: number) => void }) {
  const [recording, setRecording] = useState(false)
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startRef = useRef<number>(0)

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      startRef.current = Date.now()
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const durationMs = Date.now() - startRef.current
        stream.getTracks().forEach(t => t.stop())
        if (durationMs > 500) onSend(blob, durationMs)
      }
      mr.start()
      mrRef.current = mr
      setRecording(true)
    } catch {}
  }

  const stop = () => {
    mrRef.current?.stop()
    mrRef.current = null
    setRecording(false)
  }

  return (
    <button
      onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}
      onTouchStart={e => { e.preventDefault(); start() }} onTouchEnd={stop}
      title={recording ? 'Release to send' : 'Hold to record'}
      style={{
        width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
        background: recording ? '#ff3b30' : 'var(--bg)',
        color: recording ? '#fff' : 'var(--text2)', fontSize: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s', animation: recording ? 'pulse 0.8s ease-in-out infinite' : 'none',
      }}
    >{recording ? '⏹' : '🎙'}</button>
  )
}

// ── Voice message playback bubble ────────────────────────────────────────────

function VoiceMsgBubble({ voiceId, durationMs, fromSelf }: { voiceId: number; durationMs: number; fromSelf: boolean }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggle = () => {
    if (!audioRef.current) {
      const a = new Audio(`/api/comm/voice-message/${voiceId}/audio`)
      audioRef.current = a
      a.onended = () => setPlaying(false)
    }
    if (playing) { audioRef.current.pause(); audioRef.current.currentTime = 0; setPlaying(false) }
    else { audioRef.current.play().catch(() => {}); setPlaying(true) }
  }

  const secs = Math.round((durationMs || 0) / 1000)
  const label = secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : `0:${String(secs).padStart(2, '0')}`

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: fromSelf ? 'var(--blue, #007aff)' : 'var(--bg)',
      color: fromSelf ? '#fff' : 'var(--text)',
      borderRadius: 16, padding: '7px 12px',
    }}>
      <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'inherit', padding: 0, lineHeight: 1 }}>
        {playing ? '⏸' : '▶'}
      </button>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ width: 2, borderRadius: 1, background: 'currentColor', opacity: playing ? 1 : 0.5, height: 4 + Math.sin(i * 0.8) * 6 }} />
        ))}
      </div>
      <span style={{ fontSize: 11, opacity: 0.8 }}>{label}</span>
    </div>
  )
}

// ── Media bubble (image / video / file) ──────────────────────────────────────

function MediaBubble({ msg, fromSelf }: { msg: ChatMessage; fromSelf: boolean }) {
  const bubbleStyle: React.CSSProperties = {
    display: 'inline-block',
    background: fromSelf ? 'var(--blue, #007aff)' : 'var(--bg)',
    color: fromSelf ? '#fff' : 'var(--text)',
    borderRadius: 10,
    overflow: 'hidden',
    maxWidth: 200,
  }
  if (msg.mediaType === 'image') {
    return (
      <div style={bubbleStyle}>
        <a href={msg.mediaUrl} target="_blank" rel="noreferrer">
          <img
            src={msg.mediaUrl}
            alt={msg.mediaName ?? 'image'}
            style={{ display: 'block', width: '100%', maxWidth: 200, maxHeight: 160, objectFit: 'cover' }}
          />
        </a>
      </div>
    )
  }
  if (msg.mediaType === 'video') {
    return (
      <div style={bubbleStyle}>
        <video
          src={msg.mediaUrl}
          controls
          style={{ display: 'block', width: '100%', maxWidth: 200, maxHeight: 160 }}
        />
      </div>
    )
  }
  // file
  return (
    <a
      href={msg.mediaUrl}
      download={msg.mediaName}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 12px', borderRadius: 10, textDecoration: 'none',
        background: fromSelf ? 'var(--blue, #007aff)' : 'var(--bg)',
        color: fromSelf ? '#fff' : 'var(--text)',
      }}
    >
      <span style={{ fontSize: 18 }}>📎</span>
      <span style={{ fontSize: 12, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {msg.mediaName ?? 'file'}
      </span>
    </a>
  )
}

// ── i18n ─────────────────────────────────────────────────────────────────────

type Lang = 'en' | 'zh' | 'fa'

const COMM_TR = {
  en: {
    incomingCall: (n: string) => `📞 Incoming: ${n}`,
    accept: 'Accept', decline: 'Decline',
    namePlaceholder: 'Enter nickname…', confirm: 'OK', cancel: 'Cancel', editName: '✏️ Edit',
    me: '(Me)', title: '💬 Communications',
    acceptAudio: 'Accept Audio', acceptVideo: 'Accept Video',
    calling: (n: string) => `Calling ${n}…`, hangup: 'Hangup',
    online: (n: number) => `ONLINE (${n})`,
    group: 'Group', groupMsg: 'Group message…', privateMsg: (n: string) => `Message ${n}…`,
  },
  zh: {
    incomingCall: (n: string) => `📞 来电：${n}`,
    accept: '接听', decline: '拒绝',
    namePlaceholder: '输入昵称…', confirm: '确定', cancel: '取消', editName: '✏️ 修改',
    me: '(本人)', title: '💬 通讯',
    acceptAudio: '接听语音', acceptVideo: '接听视频',
    calling: (n: string) => `正在呼叫 ${n}…`, hangup: '挂断',
    online: (n: number) => `在线 (${n})`,
    group: '群组', groupMsg: '群组消息…', privateMsg: (n: string) => `发消息给 ${n}…`,
  },
  fa: {
    incomingCall: (n: string) => `📞 تماس: ${n}`,
    accept: 'پاسخ', decline: 'رد',
    namePlaceholder: 'نام مستعار…', confirm: 'تأیید', cancel: 'لغو', editName: '✏️ ویرایش',
    me: '(من)', title: '💬 ارتباطات',
    acceptAudio: 'پاسخ صوتی', acceptVideo: 'پاسخ تصویری',
    calling: (n: string) => `در حال تماس با ${n}…`, hangup: 'قطع',
    online: (n: number) => `آنلاین (${n})`,
    group: 'گروه', groupMsg: 'پیام گروهی…', privateMsg: (n: string) => `پیام به ${n}…`,
  },
}

function useLang(): typeof COMM_TR['en'] {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('ha_lang') as Lang) || 'en')
  useEffect(() => {
    const onEvent = (e: Event) => setLang((e as CustomEvent).detail as Lang)
    const onStorage = () => setLang((localStorage.getItem('ha_lang') as Lang) || 'en')
    window.addEventListener('ha-lang', onEvent)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('ha-lang', onEvent); window.removeEventListener('storage', onStorage) }
  }, [])
  return COMM_TR[lang] ?? COMM_TR.en
}

// ── Audio helpers (Web Audio API, no files needed) ───────────────────────────

let _ac: AudioContext | null = null
function getAC(): AudioContext {
  if (!_ac || _ac.state === 'closed') _ac = new AudioContext()
  return _ac
}

function playMessageBeep() {
  try {
    const ac = getAC()
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.connect(gain); gain.connect(ac.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15)
    osc.start(); osc.stop(ac.currentTime + 0.15)
  } catch {}
}

let _ringTimer: ReturnType<typeof setInterval> | null = null
function startRing() {
  stopRing()
  const ring = () => {
    try {
      const ac = getAC()
      ;[0, 0.18].forEach(delay => {
        const osc = ac.createOscillator()
        const gain = ac.createGain()
        osc.connect(gain); gain.connect(ac.destination)
        osc.frequency.value = 440
        gain.gain.setValueAtTime(0, ac.currentTime + delay)
        gain.gain.linearRampToValueAtTime(0.4, ac.currentTime + delay + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.16)
        osc.start(ac.currentTime + delay)
        osc.stop(ac.currentTime + delay + 0.16)
      })
    } catch {}
  }
  ring()
  _ringTimer = setInterval(ring, 2000)
}
function stopRing() {
  if (_ringTimer) { clearInterval(_ringTimer); _ringTimer = null }
}

// ── Inject CSS once ──────────────────────────────────────────────────────────

if (typeof document !== 'undefined' && !document.getElementById('comm-panel-styles')) {
  const s = document.createElement('style')
  s.id = 'comm-panel-styles'
  s.textContent = `
    .comm-toggle-btn {
      position: fixed; bottom: 16px; right: 16px; z-index: 10100;
      width: 52px; height: 52px; border-radius: 50%; border: none;
      background: var(--blue, #007aff); color: #fff; font-size: 22px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(0,122,255,0.4);
      transition: transform 0.15s;
    }
    .comm-toggle-btn:hover { transform: scale(1.08); }
    .comm-badge {
      position: absolute; top: -4px; right: -4px;
      background: #ff3b30; color: #fff; font-size: 10px; font-weight: 700;
      border-radius: 10px; padding: 1px 5px; min-width: 16px; text-align: center;
    }
    .comm-tab-btn {
      padding: 3px 10px; border: none; border-radius: 6px;
      background: transparent; color: var(--text2); font-size: 12px;
      cursor: pointer; transition: background 0.1s;
    }
    .comm-tab-btn.active-tab {
      background: var(--blue, #007aff); color: #fff;
    }
    .comm-user-row {
      padding: 6px 4px; border-radius: 6px; cursor: default;
    }
    .comm-user-row:hover { background: var(--bg); }
    .comm-icon-btn {
      width: 32px; height: 32px; border: none; border-radius: 6px;
      background: var(--bg); color: var(--text2); font-size: 16px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .comm-icon-btn:hover { background: var(--sep); }
    .comm-call-btn {
      padding: 7px 16px; border: none; border-radius: 8px;
      font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .comm-name-input {
      flex: 1; padding: 5px 10px; border-radius: 6px;
      border: 1px solid var(--sep); background: var(--bg);
      color: var(--text); font-size: 13px;
    }
    .comm-name-input:focus { outline: 2px solid var(--blue, #007aff); }
  `
  document.head.appendChild(s)
}

// ── NameSetup ────────────────────────────────────────────────────────────────

function NameSetup() {
  const { displayName, setDisplayName } = useComm()
  const t = useLang()
  const [editing, setEditing] = useState(displayName.startsWith('User-'))
  const [draft, setDraft] = useState(displayName)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    if (draft.trim()) { setDisplayName(draft.trim()); setEditing(false) }
  }
  const startEdit = () => {
    setDraft(displayName); setEditing(true)
    setTimeout(() => inputRef.current?.select(), 30)
  }

  return (
    <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--sep)', display: 'flex', gap: 6, alignItems: 'center', background: 'var(--bg)', flexShrink: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>👤</span>
      {editing ? (
        <>
          <input
            ref={inputRef}
            className="comm-name-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
            placeholder={t.namePlaceholder}
            style={{ flex: 1 }}
            autoFocus
          />
          <button onClick={commit}
            style={{ padding: '4px 10px', background: 'var(--blue, #007aff)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {t.confirm}
          </button>
          <button onClick={() => setEditing(false)}
            style={{ padding: '4px 8px', background: 'transparent', color: 'var(--text2)', border: '1px solid var(--sep)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            {t.cancel}
          </button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </span>
          <button onClick={startEdit}
            style={{ padding: '4px 8px', background: 'transparent', color: 'var(--blue, #007aff)', border: '1px solid var(--sep)', borderRadius: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {t.editName}
          </button>
        </>
      )}
    </div>
  )
}

// ── IncomingCallToast — always rendered, appears even when panel closed ───────

function IncomingCallToast() {
  const { callState, callPeer, acceptCall, hangup, setPanelOpen } = useComm()
  const t = useLang()

  useEffect(() => {
    if (callState === 'incoming') {
      startRing()
      setPanelOpen(true)
    } else {
      stopRing()
    }
    return () => stopRing()
  }, [callState, setPanelOpen])

  if (callState !== 'incoming') return null

  const peerName = callPeer?.displayName ?? '…'

  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10200, background: '#1c1c1e', color: '#fff',
      borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      padding: '14px 20px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 12, minWidth: 260,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{t.incomingCall(peerName)}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => acceptCall()} style={{
          padding: '8px 20px', borderRadius: 20, border: 'none',
          background: '#34c759', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13,
        }}>{t.accept}</button>
        <button onClick={hangup} style={{
          padding: '8px 20px', borderRadius: 20, border: 'none',
          background: '#ff3b30', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13,
        }}>{t.decline}</button>
      </div>
    </div>
  )
}

// ── CallOverlay ──────────────────────────────────────────────────────────────

function CallOverlay() {
  const { callState, callPeer, localStream, remoteStream, acceptCall, hangup } = useComm()
  const t = useLang()
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)


  useEffect(() => {
    const el = localVideoRef.current
    if (el && localStream) {
      el.srcObject = localStream
      el.play().catch(() => {})
    }
  }, [localStream])

  useEffect(() => {
    const el = remoteVideoRef.current
    if (el && remoteStream) {
      el.srcObject = remoteStream
      el.play().catch(() => {})
    }
  }, [remoteStream])

  if (callState === 'idle') return null

  const peerName = callPeer?.displayName ?? '…'

  if (callState === 'incoming') {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--sep)', background: 'var(--bg)' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{t.incomingCall(peerName)}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="comm-call-btn" onClick={() => acceptCall()} style={{ background: '#34c759', color: '#fff' }}>
            {t.acceptAudio}
          </button>
          <button className="comm-call-btn" onClick={() => acceptCall()} style={{ background: '#007aff', color: '#fff' }}>
            {t.acceptVideo}
          </button>
          <button className="comm-call-btn" onClick={hangup} style={{ background: '#ff3b30', color: '#fff' }}>
            {t.decline}
          </button>
        </div>
      </div>
    )
  }

  if (callState === 'calling') {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--sep)', background: 'var(--bg)' }}>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>{t.calling(peerName)}</div>
        <button className="comm-call-btn" onClick={hangup} style={{ background: '#ff3b30', color: '#fff' }}>
          {t.hangup}
        </button>
      </div>
    )
  }

  // connected
  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid var(--sep)', background: '#000' }}>
      <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
        <video ref={remoteVideoRef} autoPlay playsInline
          style={{ width: '100%', maxHeight: 160, background: '#111', borderRadius: 6, objectFit: 'cover' }} />
        <video ref={localVideoRef} autoPlay playsInline muted
          style={{ position: 'absolute', bottom: 4, right: 4, width: 80, height: 60, background: '#222', borderRadius: 4, objectFit: 'cover' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button className="comm-call-btn" onClick={hangup} style={{ background: '#ff3b30', color: '#fff' }}>
          {t.hangup}
        </button>
      </div>
    </div>
  )
}

// ── CommPanel (main export) ──────────────────────────────────────────────────

export function CommPanel() {
  const {
    selfId, displayName, users, messages,
    sendMessage, sendVoiceMessage, sendMedia, callState, startCall, pushCall,
    panelOpen: open, setPanelOpen: setOpen,
    groupCallRoom, startGroupCall,
  } = useComm()
  const t = useLang()

  const [input, setInput] = useState('')
  const [privateTarget, setPrivateTarget] = useState<CommUser | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)
  const [sendingMedia, setSendingMedia] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll + beep on new messages
  const msgCountRef = useRef(0)
  useEffect(() => {
    const prev = msgCountRef.current
    msgCountRef.current = messages.length
    if (messages.length > prev && prev > 0) {
      const last = messages[messages.length - 1]
      if (last && last.from !== selfId && !last.system) playMessageBeep()
    }
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, selfId])

  const close = useCallback(() => setOpen(false), [])

  const handleSend = useCallback(() => {
    if (!input.trim()) return
    sendMessage(input.trim(), privateTarget?.clientId)
    setInput('')
  }, [input, sendMessage, privateTarget])



  // Filter messages for current view
  const filteredMessages = messages.filter(msg => {
    if (msg.system) return !privateTarget
    if (!privateTarget) return !msg.to // group messages
    // Private: show messages between self and privateTarget
    return (
      (msg.from === selfId && msg.to === privateTarget.clientId) ||
      (msg.from === privateTarget.clientId && msg.to === selfId)
    )
  })

  return (
    <>
      {/* Incoming call toast — always visible even when panel is closed */}
      <IncomingCallToast />

      {/* Group call overlay — fullscreen when in a group call */}
      <GroupCallOverlay />

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            top: 60,
            right: 16,
            width: 'min(420px, calc(100vw - 32px))',
            height: 'calc(100vh - 140px)',
            maxHeight: 420,
            zIndex: 10101,
            background: 'var(--surface)',
            border: '1px solid var(--sep)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--sep)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={startGroupCall}
                disabled={!!groupCallRoom}
                title="Start group video call"
                style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--sep)', background: groupCallRoom ? '#34c75930' : 'transparent', color: groupCallRoom ? '#34c759' : 'var(--text2)', cursor: 'pointer', fontSize: 12 }}
              >{groupCallRoom ? '📹 In call' : '📹 Group'}</button>
              <button onClick={close} style={{ border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
          </div>

          {/* Name row — always visible */}
          <NameSetup />

          {/* In-panel call overlay (calling/connected states) */}
          {callState !== 'idle' && callState !== 'incoming' && <CallOverlay />}

          {/* Main: users + chat */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Left: users list */}
            <div style={{ width: 140, borderRight: '1px solid var(--sep)', overflowY: 'auto', padding: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: 0.5 }}>
                {t.online(users.length)}
              </div>
              {users.map(user => (
                <div key={user.clientId} className="comm-user-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 7, color: user.online ? '#30d158' : '#8e8e93' }}>●</span>
                    <span style={{ fontSize: 12, fontWeight: user.clientId === selfId ? 600 : 400, color: user.online ? 'var(--text)' : 'var(--text2)', wordBreak: 'break-word' }}>
                      {user.displayName}{user.clientId === selfId ? <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 4 }}>{t.me}</span> : ''}
                    </span>
                  </div>
                  {user.clientId !== selfId && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {user.online ? (
                        <>
                          <button className="comm-icon-btn" onClick={() => startCall(user, false)} title="Audio call">📞</button>
                          <button className="comm-icon-btn" onClick={() => startCall(user, true)} title="Video call">📹</button>
                          <button className="comm-icon-btn" onClick={() => setPrivateTarget(u => u?.clientId === user.clientId ? null : user)} title="Private message">✉</button>
                        </>
                      ) : (
                        <button className="comm-icon-btn" onClick={() => pushCall(user)} title="Send call notification" style={{ fontSize: 14 }}>
                          📳
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Right: chat area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--sep)', padding: '4px 8px', gap: 6, flexShrink: 0 }}>
                <button
                  className={`comm-tab-btn${!privateTarget ? ' active-tab' : ''}`}
                  onClick={() => setPrivateTarget(null)}
                >
                  {t.group}
                </button>
                {privateTarget && (
                  <button className="comm-tab-btn active-tab">
                    {privateTarget.displayName}
                  </button>
                )}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {filteredMessages.map((msg, i) => (
                  <div
                    key={msg.msgId ?? `${msg.from}-${msg.timestamp}-${i}`}
                    style={{ marginBottom: 6, textAlign: msg.from === selfId ? 'right' : 'left' }}
                  >
                    {msg.system ? (
                      <span style={{ fontSize: 10, color: 'var(--text2)' }}>{msg.text}</span>
                    ) : (
                      <>
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{msg.fromName}</div>
                        {msg.voiceId ? (
                          <VoiceMsgBubble voiceId={msg.voiceId} durationMs={msg.durationMs ?? 0} fromSelf={msg.from === selfId} />
                        ) : msg.mediaUrl ? (
                          <MediaBubble msg={msg} fromSelf={msg.from === selfId} />
                        ) : (
                          <div style={{
                            display: 'inline-block',
                            background: msg.from === selfId ? 'var(--blue, #007aff)' : 'var(--bg)',
                            color: msg.from === selfId ? '#fff' : 'var(--text)',
                            borderRadius: 8,
                            padding: '4px 10px',
                            maxWidth: '85%',
                            wordBreak: 'break-word',
                            fontSize: 13,
                          }}>
                            {msg.text}
                          </div>
                        )}
                        {msg.from === selfId && msg.msgId && (
                          <div style={{ fontSize: 10, color: (msg.readBy?.length ?? 0) > 0 ? '#34c759' : 'var(--text2)', marginTop: 1 }}>
                            {(msg.readBy?.length ?? 0) > 0 ? '✓✓' : '✓'}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Pending attachment preview */}
              {pendingFile && (
                <div style={{ padding: '6px 10px', borderTop: '1px solid var(--sep)', background: 'var(--bg)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 20 }}>
                    {pendingPreviewUrl ? '🖼' : pendingFile.type.startsWith('video/') ? '🎥' : '📎'}
                  </span>
                  {pendingPreviewUrl ? (
                    <img
                      src={pendingPreviewUrl}
                      alt="preview"
                      style={{ height: 48, width: 72, objectFit: 'cover', borderRadius: 6 }}
                    />
                  ) : (
                    <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                      {pendingFile.name}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {(pendingFile.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    onClick={() => {
                      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
                      setPendingFile(null); setPendingPreviewUrl(null)
                    }}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, padding: 2 }}
                  >✕</button>
                  <button
                    disabled={sendingMedia}
                    onClick={async () => {
                      setSendingMedia(true)
                      await sendMedia(pendingFile, privateTarget?.clientId)
                      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
                      setPendingFile(null); setPendingPreviewUrl(null)
                      setSendingMedia(false)
                    }}
                    style={{
                      padding: '5px 14px', background: 'var(--blue, #007aff)', color: '#fff',
                      border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                    }}
                  >{sendingMedia ? '…' : '↑ Send'}</button>
                </div>
              )}

              {/* Input */}
              <div style={{ padding: 8, borderTop: '1px solid var(--sep)', display: 'flex', gap: 6, flexShrink: 0 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) {
                      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
                      setPendingFile(f)
                      setPendingPreviewUrl(f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
                    }
                    e.target.value = ''
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                  style={{
                    width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
                    background: pendingFile ? 'rgba(0,122,255,0.15)' : 'var(--bg)',
                    color: pendingFile ? 'var(--blue, #007aff)' : 'var(--text2)',
                    fontSize: 16, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >📎</button>
                <VoiceMsgButton onSend={(blob, durationMs) => sendVoiceMessage(blob, durationMs, privateTarget?.clientId)} />
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={privateTarget ? t.privateMsg(privateTarget.displayName) : t.groupMsg}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--sep)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 13,
                  }}
                />
                <button
                  onClick={handleSend}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--blue, #007aff)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
