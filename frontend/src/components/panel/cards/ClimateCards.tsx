import { useState, useEffect, memo, useRef } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useRestCall, cardSt, mkBtn, tc1, tc2, tempColor } from '../PanelContext'

// ─── Nest Thermostat ──────────────────────────────────────────────────────────

const SVG_S = 240; const CX = 120; const CY = 120; const R_OUTER = 112; const R_ARC = 88; const ARC_START = 135; const ARC_SPAN = 270

function polar(angle: number, r = R_ARC): [number, number] {
  const a = angle * Math.PI / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function arcPath(startAngle: number, spanDeg: number, r = R_ARC): string {
  if (spanDeg <= 0) return ''
  const [sx, sy] = polar(startAngle, r)
  const endAngle = startAngle + Math.min(spanDeg, ARC_SPAN - 0.01)
  const [ex, ey] = polar(endAngle, r)
  const large = spanDeg > 180 ? 1 : 0
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`
}

function rawAngleToProgress(raw: number): number {
  if (raw >= ARC_START) return Math.min((raw - ARC_START) / ARC_SPAN, 1)
  if (raw <= ARC_START - 360 + ARC_SPAN) return Math.min((raw + 360 - ARC_START) / ARC_SPAN, 1)
  return raw <= 90 ? 1 : 0
}

function buildTicks(minT: number, maxT: number, setpoint: number, modeColor: string) {
  const ticks: JSX.Element[] = []
  const totalDeg = maxT - minT
  for (let t = minT; t <= maxT; t += 0.5) {
    const frac = (t - minT) / totalDeg
    const angle = ARC_START + frac * ARC_SPAN
    const isMajor = Number.isInteger(t)
    const r0 = isMajor ? R_OUTER - 18 : R_OUTER - 12
    const r1 = R_OUTER - 6
    const [x0, y0] = polar(angle, r0)
    const [x1, y1] = polar(angle, r1)
    const isActive = t <= setpoint
    ticks.push(
      <line key={t} x1={x0.toFixed(1)} y1={y0.toFixed(1)} x2={x1.toFixed(1)} y2={y1.toFixed(1)}
        stroke={isActive ? modeColor : 'rgba(255,255,255,0.18)'}
        strokeWidth={isMajor ? 2 : 1}
        strokeLinecap="round"
        style={{ transition: 'stroke 0.4s' }}
      />
    )
  }
  return ticks
}

export const NestThermostat = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT()
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const minT = Number(s.attributes.min_temp ?? 9)
  const maxT = Number(s.attributes.max_temp ?? 35)
  const current = Number(s.attributes.current_temperature ?? 20)
  const setpointRaw = Number(s.attributes.temperature ?? 22)
  const [setpoint, setSetpoint] = useState(setpointRaw)
  useEffect(() => { setSetpoint(setpointRaw) }, [setpointRaw])

  const hvacAction = String(s.attributes.hvac_action ?? 'idle')
  const hvacMode = s.state ?? 'off'
  const isHeating = hvacAction === 'heating'
  const isCooling = hvacAction === 'cooling'
  const modeColor = isHeating ? '#ff8c42' : isCooling ? '#41b8e8' : 'rgba(255,255,255,0.25)'
  const glowColor = isHeating ? '#ff8c4255' : isCooling ? '#41b8e855' : 'transparent'
  const statusText = isHeating ? (t.heating ?? 'HEATING') : isCooling ? (t.cooling ?? 'COOLING') : (t.idle ?? 'IDLE')

  const getNewTemp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return setpoint
    const rect = svgRef.current.getBoundingClientRect()
    const scale = rect.width / SVG_S
    const dx = e.clientX - rect.left - CX * scale
    const dy = e.clientY - rect.top - CY * scale
    const raw = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
    const prog = rawAngleToProgress(raw)
    return Math.round((minT + prog * (maxT - minT)) * 2) / 2 // 0.5 steps
  }

  const ticks = buildTicks(minT, maxT, setpoint, modeColor)
  const [thumbX, thumbY] = polar(ARC_START + ((setpoint - minT) / (maxT - minT)) * ARC_SPAN)

  // dead-zone gap: 90deg at bottom
  const deadStart = ARC_START + ARC_SPAN   // 405 = 45°
  const deadEnd = ARC_START                 // 135°

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg ref={svgRef} viewBox={`0 0 ${SVG_S} ${SVG_S}`}
        style={{ width: 210, height: 210, cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={e => { dragging.current = true; svgRef.current?.setPointerCapture(e.pointerId) }}
        onPointerMove={e => { if (!dragging.current) return; setSetpoint(getNewTemp(e)) }}
        onPointerUp={e => {
          if (!dragging.current) return; dragging.current = false
          const nt = getNewTemp(e); setSetpoint(nt)
          callService('climate', 'set_temperature', { temperature: nt }, s.entity_id)
        }}
      >
        <defs>
          {/* Outer bezel gradient — dark charcoal like physical Nest */}
          <radialGradient id="nestBezel" cx="45%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#3a3a3a" />
            <stop offset="60%" stopColor="#222" />
            <stop offset="100%" stopColor="#111" />
          </radialGradient>
          {/* Inner face */}
          <radialGradient id="nestFace" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#2e2e2e" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </radialGradient>
          {/* Ambient glow filter */}
          <filter id="nestGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="thumbGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Ambient glow when active */}
        {(isHeating || isCooling) && (
          <circle cx={CX} cy={CY} r={R_OUTER + 4} fill="none"
            stroke={glowColor} strokeWidth={18}
            style={{ filter: 'blur(12px)', transition: 'stroke 0.8s' }} />
        )}

        {/* Outer bezel */}
        <circle cx={CX} cy={CY} r={R_OUTER} fill="url(#nestBezel)" />

        {/* Tick marks around rim */}
        {ticks}

        {/* Inner face circle */}
        <circle cx={CX} cy={CY} r={R_OUTER - 22} fill="url(#nestFace)" />

        {/* Dead zone indicator (gap at bottom) */}
        <path d={arcPath(deadEnd - 360, -(360 - ARC_SPAN))} fill="none"
          stroke="rgba(0,0,0,0.6)" strokeWidth={3} strokeLinecap="round" />

        {/* Active arc highlight */}
        <path d={arcPath(ARC_START, ((setpoint - minT) / (maxT - minT)) * ARC_SPAN, R_OUTER - 8)}
          fill="none" stroke={modeColor} strokeWidth={3} strokeLinecap="round"
          style={{ transition: 'stroke 0.4s, d 0.1s' }} />

        {/* Thumb handle */}
        <circle cx={thumbX} cy={thumbY} r={10} fill={modeColor}
          stroke="rgba(255,255,255,0.5)" strokeWidth={2}
          filter="url(#thumbGlow)"
          style={{ transition: 'fill 0.4s', cursor: 'grab' }} />

        {/* Current temperature — large, white */}
        <text x={CX} y={CY - 14} textAnchor="middle"
          fill="rgba(255,255,255,0.95)" fontSize={46} fontWeight={300}
          fontFamily="-apple-system, 'Helvetica Neue', sans-serif"
          letterSpacing="-1">
          {current}°
        </text>

        {/* Setpoint row */}
        <text x={CX} y={CY + 18} textAnchor="middle"
          fill={modeColor} fontSize={16} fontWeight={400}
          fontFamily="-apple-system, 'Helvetica Neue', sans-serif"
          style={{ transition: 'fill 0.4s' }}>
          {setpoint}°
        </text>

        {/* Status label */}
        <text x={CX} y={CY + 40} textAnchor="middle"
          fill={(isHeating || isCooling) ? modeColor : 'rgba(255,255,255,0.3)'}
          fontSize={10} fontWeight={600} letterSpacing="2"
          fontFamily="-apple-system, 'Helvetica Neue', sans-serif"
          style={{ transition: 'fill 0.4s', textTransform: 'uppercase' }}>
          {statusText.toUpperCase()}
        </text>
      </svg>

      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: 210 }}>
        {[
          { m: 'off', icon: '⏸', label: 'Off' },
          { m: 'heat', icon: '🔥', label: 'Heat' },
          { m: 'cool', icon: '❄️', label: 'Cool' },
        ].map(({ m, icon, label }) => (
          <button key={m}
            onClick={() => callService('climate', 'set_hvac_mode', { hvac_mode: m }, s.entity_id)}
            style={{
              flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 600,
              background: hvacMode === m
                ? (m === 'heat' ? 'rgba(255,140,66,0.25)' : m === 'cool' ? 'rgba(65,184,232,0.25)' : 'rgba(255,255,255,0.1)')
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${hvacMode === m
                ? (m === 'heat' ? '#ff8c42' : m === 'cool' ? '#41b8e8' : 'rgba(255,255,255,0.3)')
                : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 8, cursor: 'pointer',
              color: hvacMode === m
                ? (m === 'heat' ? '#ff8c42' : m === 'cool' ? '#41b8e8' : 'rgba(255,255,255,0.8)')
                : 'rgba(255,255,255,0.35)',
              transition: 'all 0.3s',
            }}>
            {icon} {label}
          </button>
        ))}
      </div>
    </div>
  )
})

// ─── Climate Card (sensor) ─────────────────────────────────────────────────────

export const ClimateRtiCard = memo(({ s }: { s: HaState }) => {
  const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const unit = String(s.attributes.unit_of_measurement ?? '')
  const dc = String(s.attributes.device_class ?? '')
  const icon = dc === 'humidity' ? '💧' : dc === 'carbon_dioxide' ? '☁️' : '📊'
  const numVal = Number(s.state)
  const val = isNaN(numVal) ? s.state : numVal.toFixed(1)
  const color = tempColor(numVal, dc)
  const isTemp = dc === 'temperature'

  if (isTemp) {
    return (
      <div style={{
        ...cardSt(th, {
          padding: '12px 12px 10px', minHeight: 100, gap: 0,
          alignItems: 'center', justifyContent: 'center',
          borderLeft: `3px solid ${color}`,
          boxShadow: `0 2px 16px ${color}18`,
          transition: 'box-shadow 0.5s, border-color 0.5s',
        })
      }}>
        <div style={{ width: '100%', textAlign: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color, transition: 'color 0.5s' }}>{name}</span>
        </div>
        <span style={{
          fontSize: 36, fontWeight: 700, color,
          textShadow: `0 0 16px ${color}55`,
          animation: 'tempFloat 3s ease-in-out infinite',
          transition: 'color 0.5s',
        }}>{val}<span style={{ fontSize: 16, fontWeight: 400, opacity: 0.7 }}>{unit}</span></span>
      </div>
    )
  }

  return (
    <div style={{ ...cardSt(th, { alignItems: 'center', justifyContent: 'center', gap: 6 }) }}>
      <span style={{ fontSize: 32 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color, textAlign: 'center' }}>{val}<span style={{ fontSize: 11, opacity: 0.7 }}>{unit}</span></span>
      <span style={{ fontSize: 11, color: tc2(th), textAlign: 'center' }}>{name}</span>
    </div>
  )
})

// ─── Thermostat Card (climate entity) ─────────────────────────────────────────

export const ThermostatCard = memo(({ s }: { s: HaState }) => {
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  return (
    <div style={{
      gridColumn: 'span 2',
      background: '#111', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16, padding: '16px 12px 12px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
        {name}
      </span>
      <NestThermostat s={s} />
    </div>
  )
})
