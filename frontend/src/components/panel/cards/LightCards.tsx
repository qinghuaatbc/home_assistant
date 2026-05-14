import { useState, useEffect, useCallback, memo, useRef } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useSound, useRestCall, cardSt, tc1, tc2 } from '../PanelContext'
import { FancySlider } from '../ui/FancySlider'

// ─── Bulb ─────────────────────────────────────────────────────────────────────

export function BulbImg({ on, bPct }: { on: boolean; bPct: number }) {
  const b = bPct / 100
  const glow = 8 + b * 34
  const warmG = Math.round(155 + b * 80)
  const warmA = 0.35 + b * 0.6
  const sepia = Math.max(0, 0.78 - b * 0.78)
  const sat   = 1 + b * 2.0
  const bri   = 0.38 + b * 0.72
  const filter = on
    ? `sepia(${sepia.toFixed(2)}) saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)}) drop-shadow(0 0 ${glow}px rgba(255,${warmG},50,${warmA}))`
    : 'grayscale(1) brightness(0.22) opacity(0.45)'
  return (
    <img src="/bulb.png" style={{
      width: '100%', maxWidth: 56, height: 'auto', display: 'block',
      filter, animation: on ? `bulbFloat ${(2.8 - b * 0.8).toFixed(2)}s ease-in-out infinite` : 'none',
      transition: 'filter 0.5s',
    }} />
  )
}

// ─── Light Card ───────────────────────────────────────────────────────────────

export const LightRtiCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh(); const sound = useSound()
  const on = s.state === 'on'
  const bPct = Math.round(Number(s.attributes.brightness ?? 0) / 255 * 100)
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const b = bPct / 100
  const warmG = Math.round(160 + b * 75)
  const sliderColor = on ? `rgb(255,${warmG},50)` : '#888'

  const toggle = useCallback(() => {
    callService('light', on ? 'turn_off' : 'turn_on', {}, s.entity_id)
    sound('light', !on, name)
  }, [on, s.entity_id, callService, sound, name])

  const setBrightness = useCallback((v: number) => {
    callService('light', 'turn_on', { brightness: Math.round(v * 255 / 100) }, s.entity_id)
  }, [s.entity_id, callService])

  return (
    <div
      style={{
        ...cardSt(th, {
          padding: '8px 8px 6px', minHeight: 138, gap: 0, cursor: 'pointer',
          background: on ? `rgba(255,${warmG},50,${0.04 + b * 0.07})` : th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
          boxShadow: on ? `0 4px ${Math.round(10 + b * 30)}px rgba(255,${warmG},50,${b * 0.5})` : th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
          transition: 'background 0.4s, box-shadow 0.4s',
          touchAction: 'manipulation',
        })
      }}
      onClick={toggle}
    >
      {/* Name — centered */}
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: on ? `rgb(255,${warmG},50)` : tc1(th), transition: 'color 0.3s' }}>{name}</span>
        <span style={{ fontSize: 12, color: tc2(th), marginLeft: 6 }}>{t.bri} {bPct}%</span>
      </div>
      {/* Bulb */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 0' }}>
        <BulbImg on={on} bPct={bPct} />
      </div>
      {/* Slider */}
      <div style={{ marginTop: 6 }}>
        <FancySlider value={bPct} color={sliderColor} onChange={setBrightness} />
      </div>
    </div>
  )
})

// ─── Light Tile ───────────────────────────────────────────────────────────────

export const LightTile = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh(); const sound = useSound()
  const on = s.state === 'on'
  const bPct = Math.round(Number(s.attributes.brightness ?? 0) / 255 * 100)
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))

  const dragRef = useRef<{ startY: number; startBri: number; moved: boolean; lastCall: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [localBri, setLocalBri] = useState(bPct)

  useEffect(() => { if (!dragging) setLocalBri(bPct) }, [bPct, dragging])

  const displayBri = dragging ? localBri : bPct
  const displayOn  = on || (dragging && localBri > 0)
  const warmG      = Math.round(160 + (displayBri / 100) * 75)
  const glow       = displayOn ? `rgb(255,${warmG},50)` : undefined
  const fill       = displayBri

  const bg = displayOn && glow
    ? th === 'day'
      ? `linear-gradient(to top, ${glow}55 0%, ${glow}22 ${fill}%, rgba(210,222,242,0.38) 100%)`
      : `linear-gradient(to top, ${glow}44 0%, ${glow}18 ${fill}%, rgba(255,255,255,0.05) 100%)`
    : th === 'day' ? 'rgba(210,222,242,0.38)' : 'rgba(255,255,255,0.06)'

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startBri: displayBri, moved: false, lastCall: 0 }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const delta = dragRef.current.startY - e.clientY
    if (Math.abs(delta) > 6) dragRef.current.moved = true
    if (!dragRef.current.moved) return
    setDragging(true)
    const newBri = Math.min(100, Math.max(0, Math.round(dragRef.current.startBri + delta / 1.8)))
    setLocalBri(newBri)
    const now = Date.now()
    if (now - dragRef.current.lastCall > 80) {
      dragRef.current.lastCall = now
      if (newBri > 0) callService('light', 'turn_on', { brightness: Math.round(newBri * 255 / 100) }, s.entity_id)
      else callService('light', 'turn_off', {}, s.entity_id)
    }
  }
  const onPointerUp = () => {
    if (!dragRef.current) return
    if (!dragRef.current.moved) {
      callService('light', on ? 'turn_off' : 'turn_on', {}, s.entity_id)
      sound('light', !on, name)
    } else {
      const fb = localBri
      if (fb > 0) callService('light', 'turn_on', { brightness: Math.round(fb * 255 / 100) }, s.entity_id)
      else callService('light', 'turn_off', {}, s.entity_id)
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
        border: displayOn && glow ? `1px solid ${glow}70` : `1px solid ${th === 'day' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 18, background: bg,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        boxShadow: displayOn && glow
          ? `0 4px 20px ${glow}30, inset 0 1px 0 rgba(255,255,255,0.30)`
          : `inset 0 1px 0 ${th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)'}`,
        padding: '10px 6px 8px', width: '100%', minHeight: 92,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        cursor: dragging ? 'ns-resize' : 'pointer',
        userSelect: 'none', touchAction: 'none', position: 'relative',
        transition: dragging ? 'none' : 'all 0.22s',
      }}
    >
      {dragging && <div style={{ position: 'absolute', inset: 0, borderRadius: 18, border: `2px solid ${glow ?? 'rgba(255,255,255,0.3)'}`, pointerEvents: 'none' }} />}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        <BulbImg on={displayOn} bPct={displayBri} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: displayOn && glow ? glow : tc2(th), textAlign: 'center', lineHeight: 1.2, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
        {name}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: displayOn && glow ? glow : tc2(th), opacity: displayOn ? 1 : 0.4 }}>
        {displayOn ? `${displayBri}%` : '—'}
      </div>
      <div style={{ width: '100%', paddingTop: 2 }} onPointerDown={e => e.stopPropagation()}>
        {displayOn
          ? <FancySlider value={displayBri} color={glow ?? '#888'} onChange={v => { setLocalBri(v); callService('light', 'turn_on', { brightness: Math.round(v * 255 / 100) }, s.entity_id) }} />
          : <div style={{ height: 10, borderRadius: 8, background: th === 'day' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)' }} />
        }
      </div>
    </div>
  )
})
