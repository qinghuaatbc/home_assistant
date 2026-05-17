import { useState, useEffect, memo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Hls from 'hls.js'
import type { HaState } from '../../../context/HaContext'
import { useTh, cardSt } from '../PanelContext'

// ── WHEP — real WebRTC via RTCPeerConnection ──────────────────────────────────
// Works on all modern browsers: Chrome, Firefox, Safari (iOS + macOS + Windows)

function useWhep(videoRef: React.RefObject<HTMLVideoElement>, streamName: string, active: boolean) {
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')

  const stop = useCallback(() => {
    const owned = !!pcRef.current
    pcRef.current?.close(); pcRef.current = null
    if (owned && videoRef.current) videoRef.current.srcObject = null
    setOk(false); setErr('')
  }, [videoRef])

  const start = useCallback(async () => {
    if (pcRef.current) return
    setErr('')
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pcRef.current = pc

      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      pc.ontrack = e => {
        if (!e.streams[0] || !videoRef.current) return
        videoRef.current.srcObject = e.streams[0]
        videoRef.current.play().catch(() => {})
        setOk(true)
      }

      pc.oniceconnectionstatechange = () => {
        const s = pc.iceConnectionState
        if (s === 'failed' || s === 'disconnected') { setErr('ICE failed — try HLS'); setOk(false) }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const res = await fetch(`/go2rtc/api/webrtc?src=${encodeURIComponent(streamName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })
      if (!res.ok) throw new Error(`WHEP ${res.status}`)
      if (!pcRef.current) return
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() })
    } catch (e) {
      pcRef.current?.close(); pcRef.current = null
      setErr((e as Error).message)
    }
  }, [streamName, videoRef])

  useEffect(() => { if (active) { start() } else stop(); return stop }, [active]) // eslint-disable-line

  return { ok, err, retry: () => { stop(); setTimeout(start, 400) } }
}

// ── HLS fallback ─────────────────────────────────────────────────────────────

function useHls(videoRef: React.RefObject<HTMLVideoElement>, hlsUrl: string | null, active: boolean) {
  const hlsRef = useRef<Hls | null>(null)
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')

  const stop = useCallback(() => {
    const owned = !!hlsRef.current
    hlsRef.current?.destroy(); hlsRef.current = null
    if (owned && videoRef.current) videoRef.current.src = ''
    setOk(false); setErr('')
  }, [videoRef])

  const start = useCallback(() => {
    if (!hlsUrl || !videoRef.current) return
    setErr('')
    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
        backBufferLength: 4,
      }); hlsRef.current = hls
      hls.loadSource(hlsUrl); hls.attachMedia(videoRef.current)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { videoRef.current?.play().catch(() => {}); setOk(true) })
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setErr(d.type) })
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = hlsUrl; videoRef.current.play().catch(() => {}); setOk(true)
    } else { setErr('HLS unsupported') }
  }, [hlsUrl, videoRef])

  useEffect(() => { if (active) start(); else stop(); return stop }, [active]) // eslint-disable-line

  return { ok, err, retry: () => { stop(); setTimeout(start, 400) } }
}

// ── Camera tile ───────────────────────────────────────────────────────────────

function CameraVideo({ entityId, hlsUrl, muted }: {
  entityId: string; hlsUrl: string | null; muted: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamName = entityId.replace(/[^a-z0-9_]/g, '_')
  const [mode, setMode] = useState<'whep' | 'hls'>('whep')

  const whep = useWhep(videoRef, streamName, mode === 'whep')
  const hls  = useHls (videoRef, hlsUrl,     mode === 'hls')

  const { err, retry } = mode === 'whep' ? whep : hls
  const playing = mode === 'whep' ? whep.ok : hls.ok

  const badgeBg = playing
    ? (mode === 'whep' ? 'rgba(0,200,80,0.8)' : 'rgba(255,149,0,0.8)')
    : err ? 'rgba(255,60,60,0.8)' : 'rgba(0,122,255,0.7)'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video ref={videoRef} autoPlay muted={muted} playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }} />

      {!playing && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(0,0,0,0.75)' }}>
          {err ? (
            <>
              <span style={{ fontSize: 11, color: '#f66', textAlign: 'center', padding: '0 16px', maxWidth: 200 }}>{err}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={retry}
                  style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(0,122,255,0.8)', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                  Retry
                </button>
                {mode === 'whep' && hlsUrl && (
                  <button onClick={() => setMode('hls')}
                    style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(80,80,80,0.8)', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                    Use HLS
                  </button>
                )}
                {mode === 'hls' && (
                  <button onClick={() => setMode('whep')}
                    style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(80,80,80,0.8)', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                    Use WebRTC
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'camSpin 0.8s linear infinite' }} />
          )}
        </div>
      )}

      <div style={{ position: 'absolute', top: 6, left: 8 }}>
        <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, fontWeight: 700, color: '#fff', background: badgeBg }}>
          {mode === 'whep' ? (playing ? 'WebRTC' : 'RTC…') : (playing ? 'HLS' : 'HLS…')}
        </span>
      </div>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

export const CameraRtiCard = memo(({ s, fill }: { s: HaState; fill?: boolean }) => {
  const th = useTh()
  const [expanded, setExpanded] = useState(false)
  const [muted, setMuted] = useState(true)
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const hlsUrl = (s.attributes.hls_url as string) || null

  return (
    <>
      <style>{`@keyframes camSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ ...cardSt(th, { padding: 0, overflow: 'hidden', cursor: 'pointer', ...(!fill && { gridColumn: 'span 2' }), ...(fill && { height: '100%' }) }) }}
        onClick={() => setExpanded(true)}>
        <div style={{ borderRadius: 18, overflow: 'hidden', position: 'relative', ...(fill ? { height: '100%' } : { aspectRatio: '16/9' }) }}>
          <CameraVideo entityId={s.entity_id} hlsUrl={hlsUrl} muted={true} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 10px', background: 'linear-gradient(transparent,rgba(0,0,0,0.72))', borderRadius: '0 0 18px 18px', pointerEvents: 'none' }}>
            <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>📷 {name}</span>
          </div>
          <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 11, color: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }}>⛶</div>
        </div>
      </div>

      {expanded && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#000', display: 'flex', flexDirection: 'column' }}
          onClick={() => setExpanded(false)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', background: 'rgba(15,18,30,0.75)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
            <button onClick={e => { e.stopPropagation(); setExpanded(false) }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>✕</button>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 14, flex: 1 }}>📷 {name}</span>
            <button onClick={e => { e.stopPropagation(); setMuted(m => !m) }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>
              {muted ? '🔇' : '🔊'}
            </button>
          </div>
          <div style={{ flex: 1, position: 'relative' }} onClick={e => e.stopPropagation()}>
            <CameraVideo entityId={s.entity_id} hlsUrl={hlsUrl} muted={muted} />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
})
