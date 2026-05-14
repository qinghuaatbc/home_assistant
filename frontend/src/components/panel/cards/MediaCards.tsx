import { useState, useEffect, useCallback, memo, useRef } from 'react'
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

// ─── Speaker ──────────────────────────────────────────────────────────────────

export function SpeakerImg({ powered, playing, volume }: { powered: boolean; playing: boolean; volume: number }) {
  const v = volume / 100
  const glow = Math.round(10 + v * 26)
  const hasVol = powered && v > 0.02
  const period = (0.4 + (1 - v) * 1.1).toFixed(2)
  const filter = !powered
    ? 'grayscale(1) brightness(0.28) opacity(0.55)'
    : playing
      ? `drop-shadow(0 0 ${glow}px rgba(77,143,255,${0.4 + v * 0.5})) brightness(${1 + v * 0.28})`
      : `drop-shadow(0 0 ${Math.round(4 + v * 10)}px rgba(77,143,255,${0.1 + v * 0.3})) brightness(0.95)`
  return (
    <div style={{ animation: hasVol ? `speakerPulse ${period}s ease-in-out infinite` : 'none', display: 'inline-flex', width: '100%', maxWidth: 70, alignItems: 'center', justifyContent: 'center' }}>
      <img src="/speaker.png" style={{
        width: '100%', height: 'auto', display: 'block',
        filter,
        transform: `scale(${(1 + v * 0.14).toFixed(3)})`,
        transition: 'filter 0.4s, transform 0.5s',
      }} />
    </div>
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
  const source   = String(s.attributes.source ?? '')
  const sources: string[] = (s.attributes.source_list as string[]) ?? []
  const v        = vol / 100
  const glow     = powered ? `rgb(77,143,255)` : undefined

  const call = useCallback((svc: string, data: Record<string, unknown> = {}) => {
    callService('media_player', svc, data, s.entity_id)
  }, [s.entity_id, callService])

  const dragRef = useRef<{ startY: number; startVol: number; moved: boolean; lastCall: number } | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [localVol, setLocalVol]   = useState(vol)
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

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        border: powered ? '1px solid rgba(77,143,255,0.55)' : `1px solid ${th === 'day' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 18, background: bg,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        boxShadow: playing
          ? `0 4px 22px rgba(77,143,255,${0.25 + v * 0.25}), inset 0 1px 0 rgba(255,255,255,0.30)`
          : `inset 0 1px 0 ${th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)'}`,
        padding: '10px 6px 8px', width: '100%', minHeight: 92,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        cursor: dragging ? 'ns-resize' : 'pointer',
        userSelect: 'none', touchAction: 'none', position: 'relative',
        transition: dragging ? 'none' : 'all 0.22s',
      }}
    >
      {dragging && <div style={{ position: 'absolute', inset: 0, borderRadius: 18, border: '2px solid rgba(77,143,255,0.7)', pointerEvents: 'none' }} />}
      {/* Speaker image */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        <SpeakerImg powered={powered} playing={playing} volume={displayVol} />
      </div>
      {/* Name + eq bars */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: powered ? 'rgb(77,143,255)' : tc2(th), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {playing && <EqBars active={true} />}
      </div>
      {/* Track title */}
      {title && powered && (
        <div style={{ fontSize: 10, color: playing ? 'rgb(77,143,255)' : tc2(th), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>♪ {title}</div>
      )}
      {/* Volume % */}
      <div style={{ fontSize: 10, fontWeight: 700, color: powered ? 'rgb(77,143,255)' : tc2(th), opacity: powered ? 1 : 0.4 }}>
        {powered ? `${displayVol}%` : '—'}
      </div>
      {/* Volume slider */}
      <div style={{ width: '100%' }} onPointerDown={e => e.stopPropagation()}>
        {powered
          ? <FancySlider value={displayVol} color={glow ?? '#4d8fff'} onChange={nv => { setLocalVol(nv); call('volume_set', { volume_level: nv / 100 }) }} />
          : <div style={{ height: 10, borderRadius: 8, background: th === 'day' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)' }} />
        }
      </div>
      {/* Source selector */}
      {sources.length > 0 && powered && (
        <select value={source} onChange={e => call('select_source', { source: e.target.value })}
          onPointerDown={e => e.stopPropagation()}
          style={{
            marginTop: 2, background: th === 'day' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 8, color: tc1(th), fontSize: 11, padding: '4px 8px', width: '100%',
          }}>
          {sources.map(src => <option key={src} value={src}>{src}</option>)}
        </select>
      )}
    </div>
  )
})
