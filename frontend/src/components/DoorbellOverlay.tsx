import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useHa } from '../context/HaContext'
import Hls from 'hls.js'

// Detects: binary_sensor with device_class=doorbell, or entity_id contains 'doorbell'
function isDoorbellEntity(entityId: string, attrs: Record<string, unknown>): boolean {
  return attrs?.device_class === 'doorbell' || entityId.toLowerCase().includes('doorbell')
}

// Find associated camera by name similarity
function findCamera(doorbellId: string, states: Map<string, any>): string | null {
  const cameras = Array.from(states.values()).filter(s => s.entity_id.startsWith('camera.'))
  if (!cameras.length) return null
  const parts = doorbellId.replace('binary_sensor.', '').split('_').filter(p => p !== 'doorbell' && p !== 'button' && p !== 'sensor')
  for (let len = parts.length; len > 0; len--) {
    const prefix = parts.slice(0, len).join('_')
    const match = cameras.find(c => c.entity_id.includes(prefix))
    if (match) return match.entity_id
  }
  return cameras[0]?.entity_id ?? null
}

// Find associated lock for "open door" action
function findLock(doorbellId: string, states: Map<string, any>): string | null {
  const locks = Array.from(states.values()).filter(s => s.entity_id.startsWith('lock.'))
  if (!locks.length) return null
  const parts = doorbellId.replace('binary_sensor.', '').split('_').filter(p => p !== 'doorbell' && p !== 'button')
  for (let len = parts.length; len > 0; len--) {
    const prefix = parts.slice(0, len).join('_')
    const match = locks.find(l => l.entity_id.includes(prefix))
    if (match) return match.entity_id
  }
  return null
}

function ring() {
  try {
    const ac = new AudioContext()
    const tones: [number, number, number][] = [
      [0,    880, 0.18],
      [0.22, 659, 0.28],
      [0.65, 784, 0.18],
      [0.87, 587, 0.30],
    ]
    tones.forEach(([t, freq, dur]) => {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain); gain.connect(ac.destination)
      gain.gain.setValueAtTime(0, ac.currentTime + t)
      gain.gain.linearRampToValueAtTime(0.35, ac.currentTime + t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + dur)
      osc.start(ac.currentTime + t)
      osc.stop(ac.currentTime + t + dur + 0.02)
    })
    setTimeout(() => ac.close(), 2000)
  } catch {}
}

function attachHls(video: HTMLVideoElement, url: string, hlsRef: React.MutableRefObject<Hls | null>) {
  hlsRef.current?.destroy()
  if (Hls.isSupported()) {
    const hls = new Hls({ lowLatencyMode: true })
    hls.loadSource(url); hls.attachMedia(video)
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
    hlsRef.current = hls
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url; video.play().catch(() => {})
  }
}

interface DoorbellEvent { entityId: string; name: string; cameraId: string | null; lockId: string | null }

export default function DoorbellOverlay() {
  const { states, callService } = useHa()
  const prevStates = useRef<Map<string, string>>(new Map())
  const [event, setEvent] = useState<DoorbellEvent | null>(null)
  const [ringTimer, setRingTimer] = useState<ReturnType<typeof setInterval> | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [muted, setMuted] = useState(true)

  // Watch for doorbell state → 'on' transitions
  useEffect(() => {
    const prev = prevStates.current
    for (const [id, state] of states) {
      const prevState = prev.get(id) ?? state.state
      if (
        state.state === 'on' &&
        prevState !== 'on' &&
        isDoorbellEntity(id, state.attributes as Record<string, unknown>)
      ) {
        const name = String(state.attributes?.friendly_name ?? id.split('.')[1].replace(/_/g, ' '))
        const cameraId = findCamera(id, states)
        const lockId = findLock(id, states)
        setEvent({ entityId: id, name, cameraId, lockId })
        ring()
        const t = setInterval(ring, 4000)
        setRingTimer(t)
      }
      prev.set(id, state.state)
    }
  }, [states])

  function dismiss() {
    setEvent(null)
    if (ringTimer) { clearInterval(ringTimer); setRingTimer(null) }
    hlsRef.current?.destroy(); hlsRef.current = null
  }

  function openDoor() {
    if (event?.lockId) callService('lock', 'unlock', {}, event.lockId)
    dismiss()
  }

  // Attach HLS when camera becomes available
  useEffect(() => {
    if (!event?.cameraId || !videoRef.current) return
    const cam = states.get(event.cameraId)
    const hlsUrl = (cam?.attributes as any)?.hls_url ?? (cam?.attributes as any)?.streams?.[0]?.hls
    if (hlsUrl) attachHls(videoRef.current, hlsUrl, hlsRef)
    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [event?.cameraId])

  if (!event) return null

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 8, animation: 'doorbellPulse 1s ease-in-out infinite' }}>🔔</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{event.name}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Someone is at the door</div>
      </div>

      {/* Camera feed */}
      {event.cameraId ? (
        <div style={{ width: '100%', maxWidth: 480, aspectRatio: '16/9', background: '#111', borderRadius: 12, overflow: 'hidden', position: 'relative', marginBottom: 24 }}>
          <video
            ref={videoRef}
            autoPlay
            muted={muted}
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <button
            onClick={() => setMuted(m => !m)}
            style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 16, width: 32, height: 32, cursor: 'pointer',
            }}
          >{muted ? '🔇' : '🔊'}</button>
        </div>
      ) : (
        <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, fontSize: 48 }}>
          🚪
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 16 }}>
        <button
          onClick={dismiss}
          style={{
            padding: '14px 28px', borderRadius: 32, border: 'none',
            background: 'rgba(255,255,255,0.15)', color: '#fff',
            fontSize: 16, fontWeight: 600, cursor: 'pointer',
          }}
        >Dismiss</button>

        {event.lockId && (
          <button
            onClick={openDoor}
            style={{
              padding: '14px 28px', borderRadius: 32, border: 'none',
              background: '#30d158', color: '#fff',
              fontSize: 16, fontWeight: 600, cursor: 'pointer',
            }}
          >🔓 Open Door</button>
        )}

        <button
          onClick={dismiss}
          style={{
            padding: '14px 28px', borderRadius: 32, border: 'none',
            background: '#ff453a', color: '#fff',
            fontSize: 16, fontWeight: 600, cursor: 'pointer',
          }}
        >Decline</button>
      </div>

      <style>{`
        @keyframes doorbellPulse {
          0%, 100% { transform: scale(1) rotate(-10deg); }
          50% { transform: scale(1.15) rotate(10deg); }
        }
      `}</style>
    </div>,
    document.body,
  )
}
