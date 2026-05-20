import { useState, useEffect, memo, useRef } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useRestCall, cardSt, tempColor, tc2 } from '../PanelContext'

// ─── Nest Thermostat ──────────────────────────────────────────────────────────

const SVG_S = 260; const CX = 130; const CY = 130
const R_CHROME = 124   // outer chrome ring
const R_BEZEL  = 116   // dark bezel start
const R_FACE   = 96    // inner face
const R_TICK_O = 112   // tick outer edge
const R_TICK_I_MAJ = 104  // major tick inner
const R_TICK_I_MIN = 108  // minor tick inner
const R_ARC    = 108   // arc for active indicator
const ARC_START = 135; const ARC_SPAN = 270

function polar(angle: number, r: number): [number, number] {
  const a = angle * Math.PI / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function arcPath(startAngle: number, spanDeg: number, r: number): string {
  if (spanDeg <= 0) return ''
  const clipped = Math.min(spanDeg, ARC_SPAN - 0.1)
  const [sx, sy] = polar(startAngle, r)
  const [ex, ey] = polar(startAngle + clipped, r)
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${clipped > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
}

function rawAngleToProgress(raw: number): number {
  if (raw >= ARC_START) return Math.min((raw - ARC_START) / ARC_SPAN, 1)
  if (raw <= ARC_START - 360 + ARC_SPAN) return Math.min((raw + 360 - ARC_START) / ARC_SPAN, 1)
  return raw <= 90 ? 1 : 0
}

export const NestThermostat = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT()
  const th = useTh()
  const isDay = th === 'day'
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const minT = Number(s.attributes.min_temp ?? 9)
  const maxT = Number(s.attributes.max_temp ?? 35)
  const current = Number(s.attributes.current_temperature ?? 20)
  const setpointRaw = Number(s.attributes.temperature ?? 22)
  const [setpoint, setSetpoint] = useState(setpointRaw)
  useEffect(() => { setSetpoint(setpointRaw) }, [setpointRaw])

  const hvacAction = String(s.attributes.hvac_action ?? 'idle')
  const hvacMode   = s.state ?? 'off'
  const isHeating  = hvacAction === 'heating'
  const isCooling  = hvacAction === 'cooling'
  const isActive   = isHeating || isCooling

  const heatColor  = '#ff8035'
  const coolColor  = '#30b8f0'
  const modeColor  = isHeating ? heatColor : isCooling ? coolColor : 'rgba(255,255,255,0.22)'
  const glowRgba   = isHeating ? 'rgba(255,128,53,0.35)' : isCooling ? 'rgba(48,184,240,0.35)' : 'transparent'

  const setpointFrac = (setpoint - minT) / (maxT - minT)
  const thumbAngle   = ARC_START + setpointFrac * ARC_SPAN
  const [thumbX, thumbY] = polar(thumbAngle, R_ARC)

  const getNewTemp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return setpoint
    const rect = svgRef.current.getBoundingClientRect()
    const scale = rect.width / SVG_S
    const raw = ((Math.atan2(
      e.clientY - rect.top  - CY * scale,
      e.clientX - rect.left - CX * scale
    ) * 180 / Math.PI) + 360) % 360
    return Math.round((minT + rawAngleToProgress(raw) * (maxT - minT)) * 2) / 2
  }

  // Build tick marks: major every 5°C, minor every 1°C
  const ticks: React.ReactElement[] = []
  for (let tmp = minT; tmp <= maxT; tmp += 1) {
    const frac  = (tmp - minT) / (maxT - minT)
    const angle = ARC_START + frac * ARC_SPAN
    const isMaj = (tmp - minT) % 5 === 0
    const ri    = isMaj ? R_TICK_I_MAJ : R_TICK_I_MIN
    const [x0, y0] = polar(angle, ri)
    const [x1, y1] = polar(angle, R_TICK_O)
    const active = tmp <= setpoint
    ticks.push(
      <line key={tmp} x1={x0.toFixed(2)} y1={y0.toFixed(2)} x2={x1.toFixed(2)} y2={y1.toFixed(2)}
        stroke={active ? modeColor : 'rgba(255,255,255,0.15)'}
        strokeWidth={isMaj ? 2 : 1} strokeLinecap="round"
        style={{ transition: 'stroke 0.3s' }} />
    )
  }

  const statusLabel = isHeating ? (t.heating ?? 'HEATING').toUpperCase()
    : isCooling ? (t.cooling ?? 'COOLING').toUpperCase()
    : hvacMode === 'off' ? 'OFF' : (t.idle ?? 'IDLE').toUpperCase()

  const stopTouch = (e: React.TouchEvent) => e.stopPropagation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
      onTouchStart={stopTouch} onTouchMove={stopTouch} onTouchEnd={stopTouch}>
      <svg ref={svgRef} viewBox={`0 0 ${SVG_S} ${SVG_S}`}
        style={{ width: 220, height: 220, cursor: 'grab', touchAction: 'none', userSelect: 'none', overflow: 'visible' }}
        onPointerDown={e => { e.stopPropagation(); dragging.current = true; svgRef.current?.setPointerCapture(e.pointerId) }}
        onPointerMove={e => { if (!dragging.current) return; e.stopPropagation(); setSetpoint(getNewTemp(e)) }}
        onPointerUp={e => {
          e.stopPropagation()
          if (!dragging.current) return; dragging.current = false
          const nt = getNewTemp(e); setSetpoint(nt)
          callService('climate', 'set_temperature', { temperature: nt }, s.entity_id)
        }}
        onClick={e => e.stopPropagation()}>

        <defs>
          {/* Chrome outer ring */}
          <radialGradient id="nChrome" cx="40%" cy="30%" r="70%">
            <stop offset="0%"   stopColor="#c8c8c8" />
            <stop offset="35%"  stopColor="#888" />
            <stop offset="70%"  stopColor="#555" />
            <stop offset="100%" stopColor="#333" />
          </radialGradient>
          {/* Dark bezel */}
          <radialGradient id="nBezel" cx="45%" cy="35%" r="65%">
            <stop offset="0%"   stopColor="#2e2e2e" />
            <stop offset="60%"  stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#0d0d0d" />
          </radialGradient>
          {/* Inner face */}
          <radialGradient id="nFace" cx="50%" cy="38%" r="62%">
            <stop offset="0%"   stopColor="#282828" />
            <stop offset="100%" stopColor="#111" />
          </radialGradient>
          {/* Ambient glow */}
          <filter id="nGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="10" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Thumb glow */}
          <filter id="nThumb" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Inner bevel shadow */}
          <filter id="nShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* Ambient glow ring (heating/cooling) */}
        {isActive && (
          <circle cx={CX} cy={CY} r={R_CHROME + 6}
            fill="none" stroke={glowRgba} strokeWidth={24}
            style={{ filter: 'blur(14px)', transition: 'stroke 1s' }} />
        )}

        {/* Chrome outer ring */}
        <circle cx={CX} cy={CY} r={R_CHROME} fill="url(#nChrome)" />

        {/* Dark bezel */}
        <circle cx={CX} cy={CY} r={R_BEZEL} fill="url(#nBezel)" />

        {/* Tick marks in bezel groove */}
        {ticks}

        {/* Inner face */}
        <circle cx={CX} cy={CY} r={R_FACE} fill="url(#nFace)" filter="url(#nShadow)" />

        {/* Dead zone subtle line */}
        <path d={arcPath(ARC_START + ARC_SPAN + 2, 360 - ARC_SPAN - 4, R_ARC)}
          fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={3} strokeLinecap="round" />

        {/* Active arc */}
        {setpointFrac > 0.01 && (
          <path d={arcPath(ARC_START, setpointFrac * ARC_SPAN, R_ARC)}
            fill="none" stroke={modeColor} strokeWidth={3} strokeLinecap="round" opacity={0.7}
            style={{ transition: 'stroke 0.4s' }} />
        )}

        {/* Thumb */}
        <circle cx={thumbX} cy={thumbY} r={9} fill={modeColor}
          stroke="rgba(255,255,255,0.55)" strokeWidth={2}
          filter="url(#nThumb)"
          style={{ transition: 'fill 0.4s', cursor: 'grab' }} />

        {/* Current temperature — large, thin */}
        <text x={CX} y={CY - 8} textAnchor="middle"
          fill="rgba(255,255,255,0.92)" fontSize={50} fontWeight={200}
          fontFamily="'Helvetica Neue', -apple-system, Arial, sans-serif"
          letterSpacing="-2">
          {current}°
        </text>

        {/* Setpoint line */}
        <text x={CX} y={CY + 22} textAnchor="middle"
          fill={modeColor} fontSize={17} fontWeight={300}
          fontFamily="'Helvetica Neue', -apple-system, Arial, sans-serif"
          style={{ transition: 'fill 0.4s' }}>
          {setpoint}°
        </text>

        {/* Status label */}
        <text x={CX} y={CY + 44} textAnchor="middle"
          fill={isActive ? modeColor : 'rgba(255,255,255,0.25)'}
          fontSize={9} fontWeight={600} letterSpacing="2.5"
          fontFamily="'Helvetica Neue', -apple-system, Arial, sans-serif"
          style={{ transition: 'fill 0.4s' }}>
          {statusLabel}
        </text>
      </svg>

      {/* Mode buttons — Nest style */}
      <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 220 }}>
        {([
          { m: 'off',  icon: '⏸', color: isDay ? '#666' : 'rgba(255,255,255,0.6)' },
          { m: 'heat', icon: '🔥', color: heatColor },
          { m: 'cool', icon: '❄️', color: coolColor },
        ] as const).map(({ m, icon, color }) => {
          const active = hvacMode === m
          const inactiveBg     = isDay ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'
          const inactiveBorder = isDay ? 'rgba(0,0,0,0.12)'  : 'rgba(255,255,255,0.10)'
          const inactiveColor  = isDay ? 'rgba(0,0,0,0.35)'  : 'rgba(255,255,255,0.3)'
          return (
            <button key={m}
              onClick={() => callService('climate', 'set_hvac_mode', { hvac_mode: m }, s.entity_id)}
              style={{
                flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600,
                background: active ? `${color}22` : inactiveBg,
                border: `1px solid ${active ? color : inactiveBorder}`,
                borderRadius: 10, cursor: 'pointer',
                color: active ? color : inactiveColor,
                boxShadow: active ? `0 0 12px ${color}44` : 'none',
                transition: 'all 0.3s',
              }}>
              {icon}
            </button>
          )
        })}
      </div>
    </div>
  )
})

// ─── Climate Card (sensor) ─────────────────────────────────────────────────────

export const ClimateRtiCard = memo(({ s }: { s: HaState }) => {
  const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const unit = String(s.attributes.unit_of_measurement ?? '')
  const dc   = String(s.attributes.device_class ?? '')
  const icon = dc === 'humidity' ? '💧' : dc === 'carbon_dioxide' ? '☁️' : '📊'
  const numVal = Number(s.state)
  const val    = isNaN(numVal) ? s.state : numVal.toFixed(1)
  const color  = tempColor(numVal, dc)
  const isTemp = dc === 'temperature'

  if (isTemp) {
    return (
      <div style={{
        background: th === 'day' ? '#fff' : '#1c1c1e',
        border: `1px solid ${color}44`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 14, padding: '12px 12px 10px', minHeight: 100,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0,
        boxShadow: `0 2px 16px ${color}18`, transition: 'box-shadow 0.5s, border-color 0.5s',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 4, transition: 'color 0.5s' }}>{name}</span>
        <span style={{
          fontSize: 36, fontWeight: 700, color,
          textShadow: `0 0 16px ${color}55`,
          animation: 'tempFloat 3s ease-in-out infinite', transition: 'color 0.5s',
        }}>{val}<span style={{ fontSize: 16, fontWeight: 400, opacity: 0.7 }}>{unit}</span></span>
      </div>
    )
  }

  return (
    <div style={{
      background: th === 'day' ? '#fff' : '#1c1c1e',
      border: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 14, padding: '12px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
      <span style={{ fontSize: 32 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color, textAlign: 'center' }}>{val}<span style={{ fontSize: 11, opacity: 0.7 }}>{unit}</span></span>
      <span style={{ fontSize: 11, color: tc2(th), textAlign: 'center' }}>{name}</span>
    </div>
  )
})

// ─── Thermostat Card ──────────────────────────────────────────────────────────

export const ThermostatCard = memo(({ s }: { s: HaState }) => {
  const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const isDay = th === 'day'
  return (
    <div style={{
      gridColumn: 'span 2',
      background: isDay ? '#f2f2f7' : '#1c1c1e',
      border: `1px solid ${isDay ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 20, padding: '18px 14px 14px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      boxShadow: isDay ? '0 4px 20px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.4)',
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase',
        color: isDay ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)',
        fontFamily: "'Helvetica Neue', sans-serif",
      }}>
        {name}
      </span>
      <NestThermostat s={s} />
    </div>
  )
})
