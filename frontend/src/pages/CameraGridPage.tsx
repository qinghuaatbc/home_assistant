import { useState, useRef, useEffect } from 'react'
import { useHa } from '../context/HaContext'
import Hls from 'hls.js'

interface StreamAttr { label: string; hls: string }

function attachHls(el: HTMLVideoElement, url: string, ref: React.MutableRefObject<Hls | null>) {
  ref.current?.destroy()
  ref.current = null
  if (Hls.isSupported()) {
    const hls = new Hls({ lowLatencyMode: true, maxBufferLength: 5 })
    hls.loadSource(url)
    hls.attachMedia(el)
    hls.on(Hls.Events.MANIFEST_PARSED, () => el.play().catch(() => {}))
    ref.current = hls
  } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
    el.src = url
    el.play().catch(() => {})
  }
}

// ── Single camera tile ────────────────────────────────────────────────────────

function CameraTile({
  entityId,
  name,
  hlsUrl,
  streams,
  fullscreen,
  onToggleFullscreen,
}: {
  entityId: string
  name: string
  hlsUrl: string
  streams: StreamAttr[]
  fullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [activeUrl, setActiveUrl] = useState(hlsUrl)
  const [muted, setMuted] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!videoRef.current || !activeUrl) return
    setError(false)
    attachHls(videoRef.current, activeUrl, hlsRef)
    videoRef.current.muted = muted
    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [activeUrl])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  const switchStream = (url: string) => { setActiveUrl(url) }

  return (
    <div style={{
      background: '#000',
      borderRadius: 10,
      overflow: 'hidden',
      position: 'relative',
      aspectRatio: '16/9',
      cursor: 'pointer',
    }}>
      {!error ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setError(true)}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, color: '#666' }}>
          <span style={{ fontSize: 28 }}>📷</span>
          <span style={{ fontSize: 11 }}>No signal</span>
        </div>
      )}

      {/* Overlay controls */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.6) 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: 8, opacity: 0,
        transition: 'opacity 0.2s',
      }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
      >
        {/* Top: name */}
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{name}</div>

        {/* Bottom: controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {/* Stream quality selector */}
          {streams.length > 1 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {streams.map(s => (
                <button
                  key={s.hls}
                  onClick={e => { e.stopPropagation(); switchStream(s.hls) }}
                  style={{
                    padding: '2px 6px', fontSize: 10, border: 'none', borderRadius: 4, cursor: 'pointer',
                    background: activeUrl === s.hls ? '#007aff' : 'rgba(255,255,255,0.2)',
                    color: '#fff', fontWeight: 600,
                  }}
                >{s.label}</button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button
              onClick={e => { e.stopPropagation(); setMuted(m => !m) }}
              style={{ padding: '3px 7px', fontSize: 14, border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer' }}
            >{muted ? '🔇' : '🔊'}</button>
            <button
              onClick={e => { e.stopPropagation(); onToggleFullscreen() }}
              style={{ padding: '3px 7px', fontSize: 14, border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer' }}
            >{fullscreen ? '⊠' : '⛶'}</button>
          </div>
        </div>
      </div>

      {/* Name badge (always visible, bottom-left) */}
      <div style={{
        position: 'absolute', bottom: 6, left: 8,
        fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 600,
        textShadow: '0 1px 2px rgba(0,0,0,0.9)',
        pointerEvents: 'none',
      }}>{name}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CameraGridPage() {
  const { states } = useHa()
  const [cols, setCols] = useState<1 | 2 | 3>(2)
  const [fullscreenId, setFullscreenId] = useState<string | null>(null)

  const cameras = Array.from(states.values())
    .filter(s => s.entity_id.startsWith('camera.'))
    .map(s => {
      const streams = (s.attributes?.streams as StreamAttr[] | undefined) ?? []
      const hlsUrl = (s.attributes?.hls_url as string) ?? streams[0]?.hls ?? ''
      return {
        entityId: s.entity_id,
        name: String(s.attributes?.friendly_name ?? s.entity_id.replace('camera.', '').replace(/_/g, ' ')),
        hlsUrl,
        streams,
      }
    })
    .filter(c => !!c.hlsUrl)

  const fullscreenCam = fullscreenId ? cameras.find(c => c.entityId === fullscreenId) : null

  if (cameras.length === 0) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="nav-header"><div className="nav-title">📷 Cameras</div></div>
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
            No camera entities found.<br />
            Add a <code style={{ fontFamily: 'monospace', fontSize: 11 }}>camera.*</code> entity or configure the RTSP2HLS integration.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="nav-title">📷 Cameras ({cameras.length})</div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--card)', borderRadius: 8, padding: 3 }}>
            {([1, 2, 3] as const).map(n => (
              <button
                key={n}
                onClick={() => setCols(n)}
                style={{
                  width: 28, height: 26, borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: cols === n ? 'var(--blue, #007aff)' : 'transparent',
                  color: cols === n ? '#fff' : 'var(--text2)',
                }}
              >{n}</button>
            ))}
          </div>
        </div>

        {/* Fullscreen single view */}
        {fullscreenCam && (
          <div style={{ marginTop: 12 }}>
            <CameraTile
              {...fullscreenCam}
              fullscreen={true}
              onToggleFullscreen={() => setFullscreenId(null)}
            />
          </div>
        )}

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 8,
          marginTop: 12,
        }}>
          {cameras
            .filter(c => c.entityId !== fullscreenId)
            .map(c => (
              <CameraTile
                key={c.entityId}
                {...c}
                fullscreen={false}
                onToggleFullscreen={() => setFullscreenId(id => id === c.entityId ? null : c.entityId)}
              />
            ))
          }
        </div>
      </div>
    </div>
  )
}
