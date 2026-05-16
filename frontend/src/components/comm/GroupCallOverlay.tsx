import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useComm, GroupPeer } from '../../context/CommContext'

function PeerTile({ peer, muted }: { peer: GroupPeer; muted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (peer.stream) {
      el.srcObject = peer.stream
      el.play().catch(() => {})
    } else {
      el.srcObject = null
    }
  }, [peer.stream])

  return (
    <div style={{
      position: 'relative', background: '#111', borderRadius: 8,
      overflow: 'hidden', aspectRatio: '4/3', minHeight: 80,
    }}>
      <video ref={videoRef} autoPlay playsInline muted={!!muted}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {!peer.stream && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#555', fontSize: 32,
        }}>👤</div>
      )}
      <div style={{
        position: 'absolute', bottom: 4, left: 6, fontSize: 10,
        color: 'rgba(255,255,255,0.8)', background: 'rgba(0,0,0,0.5)',
        borderRadius: 4, padding: '1px 5px', maxWidth: '90%',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{peer.displayName}</div>
    </div>
  )
}

export function GroupCallOverlay() {
  const { groupCallRoom, groupPeers, localGroupStream, leaveGroupCall, users, joinGroupCall } = useComm()
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = localVideoRef.current
    if (!el || !localGroupStream) return
    el.srcObject = localGroupStream
    el.play().catch(() => {})
  }, [localGroupStream])

  useEffect(() => {
    if (!localGroupStream) return
    localGroupStream.getAudioTracks().forEach(t => { t.enabled = !muted })
  }, [muted, localGroupStream])

  useEffect(() => {
    if (!localGroupStream) return
    localGroupStream.getVideoTracks().forEach(t => { t.enabled = !cameraOff })
  }, [cameraOff, localGroupStream])

  if (!groupCallRoom) return null

  const onlineOthers = users.filter(u => u.online && !groupPeers.some(p => p.clientId === u.clientId))

  const allTiles: GroupPeer[] = [
    { clientId: '__local__', displayName: 'You', stream: localGroupStream },
    ...groupPeers,
  ]

  const cols = allTiles.length <= 1 ? 1 : allTiles.length <= 4 ? 2 : 3

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10500,
      background: 'rgba(0,0,0,0.93)', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>📹 Group Call</span>
          <span style={{ color: '#666', fontSize: 12, marginLeft: 8 }}>Room: {groupCallRoom}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setInviteOpen(v => !v)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #444', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: 12 }}>
            + Invite
          </button>
          <button onClick={leaveGroupCall}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#ff3b30', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Leave
          </button>
        </div>
      </div>

      {/* Invite panel */}
      {inviteOpen && (
        <div style={{ margin: '0 16px 12px', background: '#1c1c1e', borderRadius: 10, padding: 12 }}>
          <div style={{ color: '#888', fontSize: 11, marginBottom: 8 }}>ONLINE USERS</div>
          {onlineOthers.length === 0
            ? <div style={{ color: '#555', fontSize: 12 }}>No other users online</div>
            : onlineOthers.map(u => (
              <div key={u.clientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span style={{ color: '#ddd', fontSize: 13 }}>{u.displayName}</span>
              </div>
            ))
          }
          <div style={{ marginTop: 10, color: '#555', fontSize: 11 }}>
            Share room code: <span style={{ color: '#4d8fff', fontFamily: 'monospace' }}>{groupCallRoom}</span>
          </div>
        </div>
      )}

      {/* Video grid */}
      <div style={{
        flex: 1, overflow: 'auto', padding: 12,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 8, alignContent: 'start',
      }}>
        {allTiles.map(peer =>
          peer.clientId === '__local__'
            ? <PeerTile key="local" peer={peer} muted />
            : <PeerTile key={peer.clientId} peer={peer} />
        )}
      </div>

      {/* Controls */}
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'center', gap: 16, flexShrink: 0 }}>
        <button
          onClick={() => setMuted(v => !v)}
          style={{
            width: 52, height: 52, borderRadius: '50%', border: 'none',
            background: muted ? '#ff3b30' : '#2c2c2e', color: '#fff', fontSize: 22, cursor: 'pointer',
          }}
        >{muted ? '🔇' : '🎤'}</button>
        <button
          onClick={() => setCameraOff(v => !v)}
          style={{
            width: 52, height: 52, borderRadius: '50%', border: 'none',
            background: cameraOff ? '#ff3b30' : '#2c2c2e', color: '#fff', fontSize: 22, cursor: 'pointer',
          }}
        >{cameraOff ? '🚫' : '📷'}</button>
        <button
          onClick={leaveGroupCall}
          style={{
            width: 52, height: 52, borderRadius: '50%', border: 'none',
            background: '#ff3b30', color: '#fff', fontSize: 22, cursor: 'pointer',
          }}
        >📵</button>
      </div>
    </div>,
    document.body,
  )
}

export function JoinGroupCallPrompt({ roomId, onJoin, onDismiss }: { roomId: string; onJoin: () => void; onDismiss: () => void }) {
  return createPortal(
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10400, background: '#1c1c1e', color: '#fff',
      borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      padding: '14px 20px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 12, minWidth: 260,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>📹 Group call started</div>
      <div style={{ fontSize: 12, color: '#888' }}>Room: {roomId}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onJoin} style={{
          padding: '8px 20px', borderRadius: 20, border: 'none',
          background: '#34c759', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13,
        }}>Join</button>
        <button onClick={onDismiss} style={{
          padding: '8px 20px', borderRadius: 20, border: 'none',
          background: '#636366', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13,
        }}>Dismiss</button>
      </div>
    </div>,
    document.body,
  )
}
