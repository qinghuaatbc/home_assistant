import { useState, useEffect, memo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useHa } from '../../../context/HaContext'
import type { HaState } from '../../../context/HaContext'
import { useTh, cardSt } from '../PanelContext'

async function attachHls(videoEl: HTMLVideoElement, url: string, hlsRef: { current: any }) {
  const { default: Hls } = await import('hls.js')
  hlsRef.current?.destroy()
  if (Hls.isSupported()) {
    const hls = new Hls({ lowLatencyMode: true })
    hls.loadSource(url)
    hls.attachMedia(videoEl)
    hls.on(Hls.Events.MANIFEST_PARSED, () => videoEl.play().catch(() => {}))
    hlsRef.current = hls
  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    videoEl.src = url
    videoEl.play().catch(() => {})
  }
}

export const CameraRtiCard = memo(({ s }: { s: HaState }) => {
  const { token } = useHa(); const th = useTh()
  const [expanded, setExpanded] = useState(false)
  const [muted, setMuted] = useState(true)
  const cardVideoRef = useRef<HTMLVideoElement>(null)
  const fullVideoRef  = useRef<HTMLVideoElement>(null)
  const cardHlsRef   = useRef<any>(null)
  const fullHlsRef   = useRef<any>(null)
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const hlsUrl = (s.attributes.hls_url as string) || null
  const snapshotUrl = token ? `/api/camera/${s.entity_id.split('.')[1]}/stream?token=${token}&t=${Math.floor(Date.now() / 10000)}` : null

  // In-card live video
  useEffect(() => {
    if (!cardVideoRef.current || !hlsUrl) return
    attachHls(cardVideoRef.current, hlsUrl, cardHlsRef)
    return () => { cardHlsRef.current?.destroy(); cardHlsRef.current = null }
  }, [hlsUrl])

  // Fullscreen video
  useEffect(() => {
    if (!expanded || !fullVideoRef.current || !hlsUrl) return
    attachHls(fullVideoRef.current, hlsUrl, fullHlsRef)
    return () => { fullHlsRef.current?.destroy(); fullHlsRef.current = null }
  }, [expanded, hlsUrl])

  return (
    <>
      <div style={{ ...cardSt(th, { padding: 0, overflow: 'hidden', cursor: 'pointer', gridColumn: 'span 2' }) }}
        onClick={() => setExpanded(true)}>
        <div style={{ background: '#111', borderRadius: 18, overflow: 'hidden', aspectRatio: '16/9', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hlsUrl ? (
            <video ref={cardVideoRef} autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : snapshotUrl ? (
            <img src={snapshotUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={name}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <span style={{ fontSize: 28, opacity: 0.3 }}>📷</span>
          )}
          {/* Name overlay */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.72))', borderRadius: '0 0 18px 18px' }}>
            <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>📷 {name}</span>
          </div>
          {/* Expand hint */}
          <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 11, color: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }}>⛶</div>
        </div>
      </div>

      {expanded && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#000', display: 'flex', flexDirection: 'column' }}
          onClick={() => setExpanded(false)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', background: 'rgba(15,18,30,0.75)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
            <button onClick={e => { e.stopPropagation(); setExpanded(false) }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>✕</button>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 14, flex: 1 }}>📷 {name}</span>
            <button onClick={e => { e.stopPropagation(); setMuted(m => !m) }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>
              {muted ? '🔇' : '🔊'}
            </button>
          </div>
          <video ref={fullVideoRef} autoPlay muted={muted} playsInline
            style={{ flex: 1, width: '100%', objectFit: 'contain' }}
            onClick={e => e.stopPropagation()} />
        </div>,
        document.body,
      )}
    </>
  )
})
