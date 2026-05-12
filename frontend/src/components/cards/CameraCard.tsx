import { useState, useRef, useEffect, useCallback } from 'react'
import Hls from 'hls.js'
import { HaState } from '../../context/HaContext'

interface StreamAttr { label: string; hls: string }
interface Props { state: HaState }

function attachHls(videoEl: HTMLVideoElement, url: string, hlsRef: React.MutableRefObject<Hls | null>) {
  hlsRef.current?.destroy()
  hlsRef.current = null
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

export default function CameraCard({ state }: Props) {
  const streams = (state.attributes.streams as StreamAttr[] | undefined) ?? []
  const defaultUrl = (state.attributes.hls_url as string) ?? streams[0]?.hls ?? ''
  const name = (state.attributes.friendly_name as string) ?? state.entity_id

  // Card preview
  const previewRef = useRef<HTMLVideoElement>(null)
  const previewHlsRef = useRef<Hls | null>(null)

  // Modal
  const [open, setOpen] = useState(false)
  const [activeUrl, setActiveUrl] = useState(defaultUrl)
  const modalRef = useRef<HTMLVideoElement>(null)
  const modalHlsRef = useRef<Hls | null>(null)
  const [muted, setMuted] = useState(true)

  // Preview stream starts only when modal opens (no constant background streaming)
  const [previewActive, setPreviewActive] = useState(false)
  useEffect(() => {
    if (!previewActive || !previewRef.current || !defaultUrl) return
    attachHls(previewRef.current, defaultUrl, previewHlsRef)
    return () => { previewHlsRef.current?.destroy(); previewHlsRef.current = null }
  }, [previewActive, defaultUrl])

  // Modal stream
  useEffect(() => {
    if (!open || !modalRef.current || !activeUrl) return
    attachHls(modalRef.current, activeUrl, modalHlsRef)
    return () => { modalHlsRef.current?.destroy(); modalHlsRef.current = null }
  }, [open, activeUrl])

  // Sync mute to modal video
  useEffect(() => {
    if (modalRef.current) modalRef.current.muted = muted
  }, [muted, open])

  const openModal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveUrl(defaultUrl)
    setOpen(true)
  }, [defaultUrl])

  const isStreaming = state.state === 'streaming'

  return (
    <>
      {/* Card - tap to view live stream */}
      <div className="camera-card" onClick={openModal} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
          <div style={{ fontSize: 12, color: '#888' }}>{name}</div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>Tap to view live</div>
        </div>
      </div>

      {/* Fullscreen modal */}
      {open && (
        <div
          className="camera-modal"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="camera-modal-bar">
            <span className="camera-modal-title">📷 {name}</span>
            <button className="camera-modal-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <video ref={modalRef} autoPlay muted={muted} playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />

          {/* Controls */}
          <div className="camera-quality-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setMuted((m) => !m)}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                color: '#fff', fontSize: 18, width: 36, height: 36, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {muted ? '🔇' : '🔊'}
            </button>

            {streams.length > 1 && (
              <div className="seg-ctrl" style={{ width: streams.length * 52 }}>
                {streams.map((s) => (
                  <button
                    key={s.label}
                    className={`seg-btn ${activeUrl === s.hls ? 'active' : ''}`}
                    onClick={() => setActiveUrl(s.hls)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
