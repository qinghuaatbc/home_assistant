import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useSound, useRestCall, tc1, tc2 } from '../PanelContext'
import { FancySlider } from '../ui/FancySlider'

// ─── EQ Bars ───────────────────────────────────────────────────────────────────

export function EqBars({ active }: { active: boolean }) {
  const defs = [{ a: 'eqA', d: '0.55s' }, { a: 'eqB', d: '0.42s' }, { a: 'eqC', d: '0.68s' }, { a: 'eqD', d: '0.38s' }]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18, marginLeft: 4, flexShrink: 0 }}>
      {defs.map((d, i) => (
        <div key={i} style={{
          width: 3, alignSelf: 'flex-end', borderRadius: 2,
          background: active ? '#4d8fff' : 'rgba(128,128,128,0.3)',
          animation: active ? `${d.a} ${d.d} ease-in-out infinite alternate` : 'none',
          height: active ? undefined : 3, transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

// ─── Speaker fallback ─────────────────────────────────────────────────────────

export function SpeakerImg({ powered, playing, volume }: { powered: boolean; playing: boolean; volume: number }) {
  const v = volume / 100
  const glow = Math.round(10 + v * 26)
  const period = (0.4 + (1 - v) * 1.1).toFixed(2)
  const filter = !powered
    ? 'grayscale(1) brightness(0.28) opacity(0.55)'
    : playing
      ? `drop-shadow(0 0 ${glow}px rgba(77,143,255,${0.4 + v * 0.5})) brightness(${1 + v * 0.28})`
      : `drop-shadow(0 0 ${Math.round(4 + v * 10)}px rgba(77,143,255,${0.1 + v * 0.3})) brightness(0.95)`
  const hasVol = powered && v > 0.02
  return (
    <div style={{ animation: hasVol ? `speakerPulse ${period}s ease-in-out infinite` : 'none', display: 'inline-flex', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <img src="/speaker.png" style={{ width: 48, height: 48, objectFit: 'contain', filter, transition: 'filter 0.4s' }} />
    </div>
  )
}

// ─── Playback control button ───────────────────────────────────────────────────

function CtrlBtn({ icon, onTap, size = 20 }: { icon: string; onTap: () => void; size?: number }) {
  return (
    <button
      onPointerDown={e => { e.stopPropagation(); e.preventDefault() }}
      onClick={e => { e.stopPropagation(); onTap() }}
      style={{
        background: 'rgba(77,143,255,0.15)', border: 'none', borderRadius: 8,
        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: size, color: '#4d8fff', flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      {icon}
    </button>
  )
}

// ─── Media Card (tile style) ──────────────────────────────────────────────────

export const MediaRtiCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh(); const sound = useSound()
  const playing  = s.state === 'playing'
  const powered  = s.state !== 'off' && s.state !== 'unavailable'
  const vol      = Math.round(Number(s.attributes.volume_level ?? 0) * 100)
  const name     = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const title    = String(s.attributes.media_title ?? '')
  const artist   = String(s.attributes.media_artist ?? '')
  const sources: string[] = (s.attributes.source_list as string[]) ?? []
  const source   = String(s.attributes.source ?? '')
  const entityPicture = s.attributes.entity_picture as string | undefined
  const sf       = Number(s.attributes.supported_features ?? 0)
  const hasPrev  = !!(sf & 16)
  const hasNext  = !!(sf & 32)
  const hasPlay  = powered && (!sf || !!(sf & (1 | 16384)))  // show if no feature info or explicitly supported
  const v        = vol / 100

  const call = useCallback((svc: string, data: Record<string, unknown> = {}) => {
    callService('media_player', svc, data, s.entity_id)
  }, [s.entity_id, callService])

  const dragRef = useRef<{ startY: number; startVol: number; moved: boolean; lastCall: number } | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [localVol, setLocalVol]   = useState(vol)
  const [showSources, setShowSources] = useState(false)
  const sourceButtonRef = useRef<HTMLButtonElement>(null)
  const [sourceRect, setSourceRect] = useState<DOMRect | null>(null)
  useEffect(() => { if (!dragging) setLocalVol(vol) }, [vol, dragging])

  const displayVol = dragging ? localVol : vol
  const bg = powered
    ? th === 'day'
      ? `linear-gradient(to top, rgba(77,143,255,0.40) 0%, rgba(77,143,255,0.18) ${displayVol}%, rgba(210,222,242,0.38) 100%)`
      : `linear-gradient(to top, rgba(77,143,255,0.35) 0%, rgba(77,143,255,0.14) ${displayVol}%, rgba(255,255,255,0.05) 100%)`
    : th === 'day' ? 'rgba(210,222,242,0.38)' : 'rgba(255,255,255,0.06)'

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startVol: displayVol, moved: false, lastCall: 0 }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const delta = dragRef.current.startY - e.clientY
    if (Math.abs(delta) > 6) dragRef.current.moved = true
    if (!dragRef.current.moved) return
    setDragging(true)
    const nv = Math.min(100, Math.max(0, Math.round(dragRef.current.startVol + delta / 1.8)))
    setLocalVol(nv)
    const now = Date.now()
    if (now - dragRef.current.lastCall > 80) {
      dragRef.current.lastCall = now
      call('volume_set', { volume_level: nv / 100 })
    }
  }
  const onPointerUp = () => {
    if (!dragRef.current) return
    if (!dragRef.current.moved) {
      call(powered ? 'turn_off' : 'turn_on')
      sound('media', !powered, name)
    } else {
      call('volume_set', { volume_level: localVol / 100 })
    }
    dragRef.current = null
    setDragging(false)
  }

  const albumArt = entityPicture && powered

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
      style={{
        border: powered ? '1px solid rgba(77,143,255,0.55)' : `1px solid ${th === 'day' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 18, background: bg,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        boxShadow: playing
          ? `0 4px 22px rgba(77,143,255,${0.25 + v * 0.25}), inset 0 1px 0 rgba(255,255,255,0.30)`
          : `inset 0 1px 0 ${th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)'}`,
        padding: '10px 8px 8px', width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        cursor: dragging ? 'ns-resize' : 'pointer',
        userSelect: 'none', touchAction: 'none', position: 'relative',
        transition: dragging ? 'none' : 'all 0.22s',
        overflow: 'hidden',
      }}
    >
      {dragging && <div style={{ position: 'absolute', inset: 0, borderRadius: 18, border: '2px solid rgba(77,143,255,0.7)', pointerEvents: 'none' }} />}

      {/* Album art background blur */}
      {albumArt && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden', pointerEvents: 'none',
          backgroundImage: `url(${entityPicture})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          opacity: 0.15, filter: 'blur(8px)',
        }} />
      )}

      {/* Art thumbnail or speaker */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {albumArt ? (
          <img src={entityPicture} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', display: 'block', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }} />
        ) : (
          <SpeakerImg powered={powered} playing={playing} volume={displayVol} />
        )}
        {playing && albumArt && (
          <div style={{ position: 'absolute', bottom: -4, right: -4, background: 'rgba(77,143,255,0.9)', borderRadius: 8, padding: '2px 4px' }}>
            <EqBars active={true} />
          </div>
        )}
      </div>

      {/* Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: powered ? 'rgb(77,143,255)' : tc2(th), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%' }}>{name}</div>
        {playing && !albumArt && <EqBars active={true} />}
      </div>

      {/* Track info */}
      {powered && (title || artist) && (
        <div style={{ width: '100%', textAlign: 'center' }}>
          {title && <div style={{ fontSize: 10, color: playing ? 'rgb(110,170,255)' : tc2(th), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 600 }}>♪ {title}</div>}
          {artist && <div style={{ fontSize: 9, color: tc2(th), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: 1 }}>{artist}</div>}
        </div>
      )}

      {/* Playback controls */}
      {powered && (hasPrev || hasPlay || hasNext) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onPointerDown={e => e.stopPropagation()}>
          {hasPrev && <CtrlBtn icon="⏮" onTap={() => call('media_previous_track')} size={14} />}
          {hasPlay && (
            <CtrlBtn
              icon={playing ? '⏸' : '▶'}
              onTap={() => call('media_play_pause')}
              size={16}
            />
          )}
          {hasNext && <CtrlBtn icon="⏭" onTap={() => call('media_next_track')} size={14} />}
        </div>
      )}

      {/* Volume */}
      <div style={{ fontSize: 10, fontWeight: 700, color: powered ? 'rgb(77,143,255)' : tc2(th), opacity: powered ? 1 : 0.4 }}>
        {powered ? `${displayVol}%` : '—'}
      </div>

      {/* Volume slider */}
      <div style={{ width: '100%' }} onPointerDown={e => e.stopPropagation()}>
        {powered
          ? <FancySlider value={displayVol} color="rgb(77,143,255)" onChange={nv => { setLocalVol(nv); call('volume_set', { volume_level: nv / 100 }) }} />
          : <div style={{ height: 10, borderRadius: 8, background: th === 'day' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)' }} />
        }
      </div>

      {/* Source selector — portal dropdown to avoid grid clipping */}
      {sources.length > 0 && powered && (
        <div style={{ width: '100%' }} onPointerDown={e => e.stopPropagation()}>
          <button
            ref={sourceButtonRef}
            onClick={e => {
              e.stopPropagation()
              const rect = sourceButtonRef.current?.getBoundingClientRect() ?? null
              setSourceRect(rect)
              setShowSources(v => !v)
            }}
            style={{
              width: '100%', background: th === 'day' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 8, color: tc1(th), fontSize: 10, padding: '4px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
              {source || '— source —'}
            </span>
            <span style={{ opacity: 0.5, flexShrink: 0 }}>{showSources ? '▲' : '▼'}</span>
          </button>
          {showSources && sourceRect && createPortal(
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onClick={() => setShowSources(false)} />
              <div style={{
                position: 'fixed',
                left: sourceRect.left, right: `calc(100vw - ${sourceRect.right}px)`,
                bottom: `calc(100vh - ${sourceRect.top}px + 4px)`,
                zIndex: 9001,
                background: th === 'day' ? 'rgba(255,255,255,0.96)' : 'rgba(20,22,35,0.96)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                maxHeight: 200, overflowY: 'auto',
              }}>
                {sources.map(src => (
                  <button key={src}
                    onClick={e => { e.stopPropagation(); call('select_source', { source: src }); setShowSources(false) }}
                    style={{
                      width: '100%', padding: '7px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: src === source ? 'rgba(77,143,255,0.18)' : 'transparent',
                      color: src === source ? 'rgb(77,143,255)' : tc1(th), fontSize: 11, fontWeight: src === source ? 700 : 400,
                      borderBottom: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {src === source && <span>✓</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src}</span>
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}
        </div>
      )}
    </div>
  )
})
