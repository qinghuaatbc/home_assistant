import { useState, useEffect, useCallback, memo, useRef } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useSound, useRestCall, useCardSize, cardSt, tc1, tc2 } from '../PanelContext'

const TILE_SCALE = {
  sm: { nameFs: 10, briFs:  9, minH: 80  },
  md: { nameFs: 11, briFs: 10, minH: 92  },
  lg: { nameFs: 13, briFs: 11, minH: 110 },
  xl: { nameFs: 15, briFs: 13, minH: 130 },
}
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
    : 'grayscale(1) brightness(0.40) opacity(0.62)'
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
  const slidedToZeroRef = useRef(false)

  useEffect(() => { if (on) slidedToZeroRef.current = false }, [on])

  const toggle = useCallback(() => {
    if (on) {
      callService('light', 'turn_off', {}, s.entity_id)
    } else {
      const brightness = slidedToZeroRef.current ? { brightness: 255 } : {}
      callService('light', 'turn_on', brightness, s.entity_id)
    }
    sound('light', !on, name)
  }, [on, s.entity_id, callService, sound, name])

  const setBrightness = useCallback((v: number) => {
    if (v === 0) { slidedToZeroRef.current = true; callService('light', 'turn_off', {}, s.entity_id) }
    else callService('light', 'turn_on', { brightness: Math.round(v * 255 / 100) }, s.entity_id)
  }, [s.entity_id, callService])

  return (
    <div
      className="rti-card"
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
      <div style={{ textAlign: 'center', marginBottom: 4, width: '100%' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: on ? (th === 'day' ? '#7a3d00' : `rgb(255,${warmG},50)`) : tc1(th), transition: 'color 0.3s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>{name}</div>
        <div style={{ fontSize: 11, color: tc2(th), marginTop: 1 }}>{on ? `${bPct}%` : '—'}</div>
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
  const sc = TILE_SCALE[useCardSize()]
  const on = s.state === 'on'
  const bPct = Math.round(Number(s.attributes.brightness ?? 0) / 255 * 100)
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))

  const dragRef = useRef<{ startY: number; startBri: number; moved: boolean; lastCall: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [localBri, setLocalBri] = useState(bPct)
  // true when turned off by dragging slider to 0 — next turn-on should be 100%
  const slidedToZeroRef = useRef(false)

  useEffect(() => {
    if (!dragging) {
      setLocalBri(bPct)
      // once the server confirms it's on again, clear the flag
      if (on) slidedToZeroRef.current = false
    }
  }, [bPct, dragging, on])

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
      if (on) {
        callService('light', 'turn_off', {}, s.entity_id)
      } else {
        const brightness = slidedToZeroRef.current ? { brightness: 255 } : {}
        callService('light', 'turn_on', brightness, s.entity_id)
      }
      sound('light', !on, name)
    } else {
      const fb = localBri
      if (fb > 0) {
        callService('light', 'turn_on', { brightness: Math.round(fb * 255 / 100) }, s.entity_id)
      } else {
        slidedToZeroRef.current = true
        callService('light', 'turn_off', {}, s.entity_id)
      }
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
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
      style={{
        border: displayOn && glow ? `1px solid ${glow}70` : `1px solid ${th === 'day' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 18, background: bg,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        boxShadow: displayOn && glow
          ? `0 4px 20px ${glow}30, inset 0 1px 0 rgba(255,255,255,0.30)`
          : `inset 0 1px 0 ${th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)'}`,
        padding: '10px 6px 8px', width: '100%', minHeight: sc.minH,
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
      <div style={{ fontSize: sc.nameFs, fontWeight: 600, color: displayOn && glow ? (th === 'day' ? '#7a3d00' : glow) : tc2(th), textAlign: 'center', lineHeight: 1.2, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
        {name}
      </div>
      <div style={{ fontSize: sc.briFs, fontWeight: 700, color: displayOn && glow ? (th === 'day' ? '#7a3d00' : glow) : tc2(th), opacity: displayOn ? 1 : 0.4 }}>
        {displayOn ? `${displayBri}%` : '—'}
      </div>
      <div style={{ width: '100%', paddingTop: 2 }} onPointerDown={e => e.stopPropagation()}>
        <FancySlider
          value={displayOn ? displayBri : 0}
          color={displayOn ? (glow ?? '#888') : 'rgba(200,200,200,0.25)'}
          onChange={v => {
            setLocalBri(v)
            if (v === 0) { slidedToZeroRef.current = true; callService('light', 'turn_off', {}, s.entity_id) }
            else callService('light', 'turn_on', { brightness: Math.round(v * 255 / 100) }, s.entity_id)
          }}
        />
        {/* Color temperature slider */}
        {displayOn && (() => {
          const modes: string[] = (s.attributes.supported_color_modes as string[]) ?? []
          const hasColorTemp = modes.includes('color_temp')
          const hasColor = modes.some(m => m === 'hs' || m === 'rgb' || m === 'xy')
          const minK = Number(s.attributes.min_color_temp_kelvin ?? 2000)
          const maxK = Number(s.attributes.max_color_temp_kelvin ?? 6500)
          const curK = Number(s.attributes.color_temp_kelvin ?? minK)
          const ctPct = Math.round((curK - minK) / (maxK - minK) * 100)
          if (hasColorTemp) {
            return (
              <div style={{ marginTop: 4 }}>
                <FancySlider
                  value={ctPct}
                  color={`hsl(${40 - ctPct * 0.27}, 100%, 62%)`}
                  onChange={pct => {
                    const k = Math.round(minK + pct / 100 * (maxK - minK))
                    callService('light', 'turn_on', { color_temp_kelvin: k }, s.entity_id)
                  }}
                />
              </div>
            )
          }
          if (hasColor) {
            const hue = (s.attributes.hs_color as [number, number] | undefined)?.[0] ?? 0
            const huePct = Math.round(hue / 360 * 100)
            return (
              <div style={{ marginTop: 4 }}>
                <FancySlider
                  value={huePct}
                  color={`hsl(${hue}, 100%, 55%)`}
                  onChange={pct => {
                    const h = Math.round(pct / 100 * 360)
                    callService('light', 'turn_on', { hs_color: [h, 100] }, s.entity_id)
                  }}
                />
              </div>
            )
          }
          return null
        })()}
      </div>
    </div>
  )
})

// ─── Light Ring Card (card_type: light-ring) ──────────────────────────────────

const LR_S = 160; const LR_CX = 80; const LR_CY = 80
const LR_R_OUT = 72; const LR_R_ARC = 64; const LR_R_FACE = 54
const LR_START = 135; const LR_SPAN = 270

function lrPolar(angle: number, r: number): [number, number] {
  const a = angle * Math.PI / 180
  return [LR_CX + r * Math.cos(a), LR_CY + r * Math.sin(a)]
}

function lrArc(startAngle: number, spanDeg: number, r: number): string {
  if (spanDeg <= 0) return ''
  const clipped = Math.min(spanDeg, LR_SPAN - 0.1)
  const [sx, sy] = lrPolar(startAngle, r)
  const [ex, ey] = lrPolar(startAngle + clipped, r)
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${clipped > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
}

function lrAngleToProgress(raw: number): number {
  if (raw >= LR_START) return Math.min((raw - LR_START) / LR_SPAN, 1)
  if (raw <= LR_START - 360 + LR_SPAN) return Math.min((raw + 360 - LR_START) / LR_SPAN, 1)
  return raw <= 90 ? 1 : 0
}

function playRingTick(ctx: AudioContext) {
  const now = ctx.currentTime, sr = ctx.sampleRate
  // Soft chime: wideband snap + airy 1800 Hz shimmer
  const nLen = Math.floor(sr * 0.002)
  const nBuf = ctx.createBuffer(1, nLen, sr)
  const nd = nBuf.getChannelData(0)
  for (let i = 0; i < nLen; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.0004))
  const nSrc = ctx.createBufferSource(); nSrc.buffer = nBuf
  const nG = ctx.createGain(); nG.gain.value = 0.18
  nSrc.connect(nG); nG.connect(ctx.destination); nSrc.start(now)

  const rLen = Math.floor(sr * 0.022)
  const rBuf = ctx.createBuffer(1, rLen, sr)
  const rd = rBuf.getChannelData(0)
  for (let i = 0; i < rLen; i++) rd[i] = Math.sin(2 * Math.PI * 1800 * i / sr) * Math.exp(-i / (sr * 0.005))
  const rSrc = ctx.createBufferSource(); rSrc.buffer = rBuf
  const rG = ctx.createGain(); rG.gain.value = 0.07
  rSrc.connect(rG); rG.connect(ctx.destination); rSrc.start(now); rSrc.stop(now + 0.025)
}

export const LightRingCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh(); const sound = useSound()
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const didDrag = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lastTickBri = useRef<number | null>(null)

  const on = s.state === 'on'
  const bPct = Math.round(Number(s.attributes.brightness ?? 0) / 255 * 100)
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const [localBri, setLocalBri] = useState(bPct)
  useEffect(() => { if (!dragging.current) setLocalBri(bPct) }, [bPct])

  const displayBri = dragging.current ? localBri : bPct
  const displayOn  = on || (dragging.current && localBri > 0)
  const b     = displayBri / 100
  // Sunshine color: deep amber at low → bright warm white at full
  const warmG = Math.round(148 + b * 107)   // 148→255
  const warmB = Math.round(b * 185)          //   0→185
  const arcColor  = displayOn ? `rgb(255,${warmG},${warmB})` : (th === 'day' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)')
  const glowColor = `rgba(255,${warmG},${warmB},${0.15 + b * 0.65})`

  const getProgress = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return displayBri / 100
    const rect = svgRef.current.getBoundingClientRect()
    const scale = rect.width / LR_S
    const raw = ((Math.atan2(
      e.clientY - rect.top  - LR_CY * scale,
      e.clientX - rect.left - LR_CX * scale
    ) * 180 / Math.PI) + 360) % 360
    return lrAngleToProgress(raw)
  }

  const isDay = th === 'day'
  const faceColor = displayOn
    ? isDay ? `rgba(255,${warmG},${warmB},0.16)` : `rgba(255,${warmG},${warmB},0.22)`
    : isDay ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const trackColor = isDay ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)'

  const [thumbX, thumbY] = lrPolar(LR_START + (displayBri / 100) * LR_SPAN, LR_R_ARC)

  const stopTouch = (e: React.TouchEvent) => e.stopPropagation()

  return (
    <div
      onTouchStart={stopTouch} onTouchMove={stopTouch} onTouchEnd={stopTouch}
      style={{
        border: displayOn ? `1px solid rgba(255,${warmG},50,0.4)` : `1px solid ${isDay ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 18,
        background: isDay
          ? (displayOn ? `rgba(255,${warmG},50,0.06)` : 'rgba(255,255,255,0.85)')
          : (displayOn ? `rgba(255,${warmG},50,0.10)` : 'rgba(255,255,255,0.06)'),
        boxShadow: displayOn ? `0 4px 24px ${glowColor}` : (isDay ? '0 2px 10px rgba(0,0,0,0.07)' : 'none'),
        padding: '10px 6px 10px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        cursor: 'pointer', userSelect: 'none', touchAction: 'none',
        transition: 'all 0.3s',
      }}
    >
      <svg ref={svgRef} viewBox={`0 0 ${LR_S} ${LR_S}`}
        style={{ width: 120, height: 120, touchAction: 'none', userSelect: 'none', overflow: 'visible' }}
        onPointerDown={e => {
          e.stopPropagation(); dragging.current = true; didDrag.current = false
          svgRef.current?.setPointerCapture(e.pointerId)
          if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
          lastTickBri.current = null
        }}
        onPointerMove={e => {
          if (!dragging.current) return; e.stopPropagation(); didDrag.current = true
          const prog = getProgress(e)
          const newBri = Math.round(prog * 100)
          setLocalBri(newBri)
          // Tick every ~4% change
          if (lastTickBri.current === null || Math.abs(newBri - lastTickBri.current) >= 4) {
            lastTickBri.current = newBri
            if (audioCtxRef.current) audioCtxRef.current.resume().then(() => playRingTick(audioCtxRef.current!))
          }
          if (newBri > 0) callService('light', 'turn_on', { brightness: Math.round(newBri * 255 / 100) }, s.entity_id)
          else callService('light', 'turn_off', {}, s.entity_id)
        }}
        onPointerUp={e => {
          e.stopPropagation()
          if (!dragging.current) return
          dragging.current = false
          if (!didDrag.current) {
            // tap = toggle
            if (on) callService('light', 'turn_off', {}, s.entity_id)
            else callService('light', 'turn_on', { brightness: 255 }, s.entity_id)
            sound('light', !on, name)
          }
        }}
        onClick={e => e.stopPropagation()}
      >
        <defs>
          <radialGradient id={`lrFace_${s.entity_id}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={isDay ? '#fff' : '#333'} />
            <stop offset="100%" stopColor={isDay ? '#f0f0f0' : '#1a1a1a'} />
          </radialGradient>
          <filter id={`lrGlow_${s.entity_id}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Outer ring */}
        <circle cx={LR_CX} cy={LR_CY} r={LR_R_OUT} fill={isDay ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'} />

        {/* Track arc */}
        <path d={lrArc(LR_START, LR_SPAN, LR_R_ARC)}
          fill="none" stroke={trackColor} strokeWidth={6} strokeLinecap="round" />

        {/* Active brightness arc */}
        {displayBri > 1 && (
          <path d={lrArc(LR_START, (displayBri / 100) * LR_SPAN, LR_R_ARC)}
            fill="none" stroke={arcColor} strokeWidth={6} strokeLinecap="round"
            style={{ transition: dragging.current ? 'none' : 'stroke 0.4s, d 0.15s' }} />
        )}

        {/* Thumb */}
        {(displayOn || displayBri > 1) && (
          <circle cx={thumbX} cy={thumbY} r={7} fill={arcColor}
            stroke={isDay ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'} strokeWidth={2}
            filter={`url(#lrGlow_${s.entity_id})`}
            style={{ cursor: 'grab', transition: dragging.current ? 'none' : 'cx 0.15s, cy 0.15s' }} />
        )}

        {/* Face circle */}
        <circle cx={LR_CX} cy={LR_CY} r={LR_R_FACE}
          fill={displayOn ? faceColor : `url(#lrFace_${s.entity_id})`}
          style={{ transition: 'fill 0.4s' }} />

        {/* Sunshine glow behind face when on */}
        {displayOn && (
          <circle cx={LR_CX} cy={LR_CY} r={LR_R_FACE - 2}
            fill={`rgba(255,${warmG},${warmB},${b * 0.45})`}
            filter={`url(#lrGlow_${s.entity_id})`}
            style={{ transition: 'fill 0.4s' }} />
        )}

        {/* Bulb icon inside face */}
        <image href="/bulb.png"
          x={LR_CX - 19} y={LR_CY - 30} width={38} height={48}
          style={{
            filter: displayOn
              ? `sepia(${Math.max(0,(0.78-b*0.78)).toFixed(2)}) saturate(${(1+b*2).toFixed(2)}) brightness(${(0.38+b*0.72).toFixed(2)}) drop-shadow(0 0 ${Math.round(6+b*22)}px rgba(255,${warmG},${warmB},${(0.4+b*0.55).toFixed(2)}))`
              : 'grayscale(1) brightness(0.35) opacity(0.5)',
            transition: 'filter 0.45s',
          }} />
      </svg>

      {/* Brightness percentage */}
      <div style={{
        fontSize: 18, fontWeight: 300, textAlign: 'center', lineHeight: 1,
        color: displayOn
          ? (isDay ? `rgb(${Math.round(160-b*40)},${Math.round(80+b*60)},0)` : `rgb(255,${warmG},${warmB})`)
          : (isDay ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'),
        fontFamily: "'Helvetica Neue', -apple-system, sans-serif",
        transition: 'color 0.4s',
      }}>{displayOn ? `${displayBri}%` : '—'}</div>

      {/* Name */}
      <div style={{
        fontSize: 11, fontWeight: 600, textAlign: 'center',
        color: displayOn
          ? (isDay ? `rgb(${Math.round(140-b*40)},${Math.round(70+b*70)},0)` : `rgb(255,${warmG},${warmB})`)
          : (isDay ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)'),
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        width: '100%', padding: '0 4px',
        transition: 'color 0.4s',
      }}>{name}</div>
    </div>
  )
})
