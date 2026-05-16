import { useState, useRef, useEffect, useCallback } from 'react'
import { useComm, CommUser } from '../../context/CommContext'

// ── Inject CSS once ──────────────────────────────────────────────────────────

if (typeof document !== 'undefined' && !document.getElementById('comm-panel-styles')) {
  const s = document.createElement('style')
  s.id = 'comm-panel-styles'
  s.textContent = `
    .comm-toggle-btn {
      position: fixed; bottom: 24px; left: 24px; z-index: 9000;
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
      width: 24px; height: 24px; border: none; border-radius: 4px;
      background: var(--bg); color: var(--text2); font-size: 13px;
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
  const [draft, setDraft] = useState(displayName)

  const commit = () => {
    if (draft.trim()) setDisplayName(draft.trim())
  }

  return (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--sep)', display: 'flex', gap: 6, alignItems: 'center', background: 'var(--bg)' }}>
      <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Your name:</span>
      <input
        className="comm-name-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && commit()}
        placeholder="Set display name…"
      />
      <button
        onClick={commit}
        style={{ padding: '5px 12px', background: 'var(--blue, #007aff)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
      >
        Set
      </button>
    </div>
  )
}

// ── CallOverlay ──────────────────────────────────────────────────────────────

function CallOverlay() {
  const { callState, callPeer, localStream, remoteStream, acceptCall, hangup } = useComm()
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  if (callState === 'idle') return null

  const peerName = callPeer?.displayName ?? '…'

  if (callState === 'incoming') {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--sep)', background: 'var(--bg)' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>📞 Incoming call from <em>{peerName}</em></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="comm-call-btn"
            onClick={() => acceptCall()}
            style={{ background: '#34c759', color: '#fff' }}
          >
            Accept Audio
          </button>
          <button
            className="comm-call-btn"
            onClick={() => acceptCall()}
            style={{ background: '#007aff', color: '#fff' }}
          >
            Accept Video
          </button>
          <button
            className="comm-call-btn"
            onClick={hangup}
            style={{ background: '#ff3b30', color: '#fff' }}
          >
            Decline
          </button>
        </div>
      </div>
    )
  }

  if (callState === 'calling') {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--sep)', background: 'var(--bg)' }}>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>Calling <strong>{peerName}</strong>…</div>
        <button className="comm-call-btn" onClick={hangup} style={{ background: '#ff3b30', color: '#fff' }}>
          Hangup
        </button>
      </div>
    )
  }

  // connected
  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid var(--sep)', background: '#000' }}>
      <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
        {/* Remote (large) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: '100%', maxHeight: 160, background: '#111', borderRadius: 6, objectFit: 'cover' }}
        />
        {/* Local (small, corner) */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{ position: 'absolute', bottom: 4, right: 4, width: 80, height: 60, background: '#222', borderRadius: 4, objectFit: 'cover' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button className="comm-call-btn" onClick={hangup} style={{ background: '#ff3b30', color: '#fff' }}>
          Hangup
        </button>
      </div>
    </div>
  )
}

// ── CommPanel (main export) ──────────────────────────────────────────────────

export function CommPanel() {
  const {
    selfId, displayName, users, messages,
    sendMessage, callState, startCall,
    unreadCount, clearUnread, panelOpenRef,
  } = useComm()

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [privateTarget, setPrivateTarget] = useState<CommUser | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Keep panelOpenRef in sync
  useEffect(() => {
    panelOpenRef.current = open
    if (open) clearUnread()
  }, [open, clearUnread, panelOpenRef])

  // Auto-scroll to bottom
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open])

  const close = useCallback(() => setOpen(false), [])

  const handleSend = useCallback(() => {
    if (!input.trim()) return
    sendMessage(input.trim(), privateTarget?.clientId)
    setInput('')
  }, [input, sendMessage, privateTarget])

  const showNameInput = displayName.startsWith('User-')

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
      {/* Toggle button */}
      <button
        className="comm-toggle-btn"
        onClick={() => setOpen(v => !v)}
        title="Communications"
        style={{ position: 'relative' }}
      >
        💬
        {unreadCount > 0 && (
          <span className="comm-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 88,
            left: 24,
            width: 420,
            height: 520,
            zIndex: 9001,
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
            <span style={{ fontWeight: 600, fontSize: 14 }}>💬 Communications</span>
            <button onClick={close} style={{ border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Name setup */}
          {showNameInput && <NameSetup />}

          {/* Call overlay */}
          {callState !== 'idle' && <CallOverlay />}

          {/* Main: users + chat */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Left: users list */}
            <div style={{ width: 140, borderRight: '1px solid var(--sep)', overflowY: 'auto', padding: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, letterSpacing: 0.5 }}>
                ONLINE ({users.length})
              </div>
              {users.map(user => (
                <div key={user.clientId} className="comm-user-row">
                  <div style={{ fontSize: 12, fontWeight: user.clientId === selfId ? 600 : 400, color: 'var(--text)', wordBreak: 'break-word' }}>
                    {user.clientId === selfId ? '👤 ' : ''}{user.displayName}
                  </div>
                  {user.clientId !== selfId && (
                    <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                      <button
                        className="comm-icon-btn"
                        onClick={() => startCall(user, false)}
                        title="Audio call"
                      >
                        📞
                      </button>
                      <button
                        className="comm-icon-btn"
                        onClick={() => startCall(user, true)}
                        title="Video call"
                      >
                        📹
                      </button>
                      <button
                        className="comm-icon-btn"
                        onClick={() => setPrivateTarget(u => u?.clientId === user.clientId ? null : user)}
                        title="Private message"
                      >
                        ✉
                      </button>
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
                  Group
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
                    key={i}
                    style={{ marginBottom: 6, textAlign: msg.from === selfId ? 'right' : 'left' }}
                  >
                    {msg.system ? (
                      <span style={{ fontSize: 10, color: 'var(--text2)' }}>{msg.text}</span>
                    ) : (
                      <>
                        <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>{msg.fromName}</div>
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
                      </>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{ padding: 8, borderTop: '1px solid var(--sep)', display: 'flex', gap: 6, flexShrink: 0 }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={privateTarget ? `Message ${privateTarget.displayName}…` : 'Group message…'}
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
