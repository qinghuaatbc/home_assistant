import { useState, useEffect, memo, useRef } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useRestCall, cardSt, mkBtn, tc1, tc2, tempColor } from '../PanelContext'

// ─── Nest Thermostat ──────────────────────────────────────────────────────────

const SVG_S = 200; const CX = 100; const CY = 100; const R_ARC = 74; const ARC_START = 135; const ARC_SPAN = 270

function polar(angle: number, r = R_ARC): [number, number] {
  const a = angle * Math.PI / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function arcPath(startAngle: number, spanDeg: number, r = R_ARC): string {
  const [sx, sy] = polar(startAngle, r)
  const endAngle = startAngle + spanDeg
  const [ex, ey] = polar(endAngle, r)
  const large = spanDeg > 180 ? 1 : 0
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`
}

function rawAngleToProgress(raw: number): number {
  if (raw >= ARC_START) return Math.min((raw - ARC_START) / ARC_SPAN, 1)
  if (raw <= ARC_START - 360 + ARC_SPAN) return Math.min((raw + 360 - ARC_START) / ARC_SPAN, 1)
  return raw <= 90 ? 1 : 0
}

export const NestThermostat = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh(); const t = useT()
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const minT = Number(s.attributes.min_temp ?? 10)
  const maxT = Number(s.attributes.max_temp ?? 35)
  const current = Number(s.attributes.current_temperature ?? 20)
  const setpointRaw = Number(s.attributes.temperature ?? 21)
  const [setpoint, setSetpoint] = useState(setpointRaw)
  useEffect(() => { setSetpoint(setpointRaw) }, [setpointRaw])

  const hvacAction = String(s.attributes.hvac_action ?? 'idle')
  const hvacMode = s.state ?? 'off'
  const modeColor = hvacAction === 'heating' ? '#ff6b3d' : hvacAction === 'cooling' ? '#0af3ff' : th === 'day' ? '#888' : '#555'
  const modeLabel = hvacAction === 'heating' ? t.heating : hvacAction === 'cooling' ? t.cooling : t.idle

  const span = ((setpoint - minT) / (maxT - minT)) * ARC_SPAN
  const [thumbX, thumbY] = polar(ARC_START + span)

  const getNewTemp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return setpoint
    const rect = svgRef.current.getBoundingClientRect()
    const dx = e.clientX - rect.left - CX * (rect.width / SVG_S)
    const dy = e.clientY - rect.top - CY * (rect.height / SVG_S)
    const raw = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
    const prog = rawAngleToProgress(raw)
    return Math.round(minT + prog * (maxT - minT))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg ref={svgRef} viewBox={`0 0 ${SVG_S} ${SVG_S}`} style={{ width: 180, height: 180, cursor: 'pointer', touchAction: 'none' }}
        onPointerDown={e => { dragging.current = true; svgRef.current?.setPointerCapture(e.pointerId) }}
        onPointerMove={e => { if (!dragging.current) return; setSetpoint(getNewTemp(e)) }}
        onPointerUp={e => {
          if (!dragging.current) return; dragging.current = false
          const nt = getNewTemp(e)
          setSetpoint(nt)
          callService('climate', 'set_temperature', { temperature: nt }, s.entity_id)
        }}
      >
        {/* Background ring */}
        <circle cx={CX} cy={CY} r={R_ARC + 10} fill={th === 'day' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'} />
        {/* Track */}
        <path d={arcPath(ARC_START, ARC_SPAN)} fill="none" stroke={th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'} strokeWidth={8} strokeLinecap="round" />
        {/* Active arc */}
        {span > 2 && (
          <path d={arcPath(ARC_START, span)} fill="none" stroke={modeColor} strokeWidth={8} strokeLinecap="round" style={{ transition: 'stroke 0.5s' }} />
        )}
        {/* Thumb */}
        <circle cx={thumbX} cy={thumbY} r={12} fill={modeColor} stroke="rgba(255,255,255,0.4)" strokeWidth={2} style={{ filter: `drop-shadow(0 0 6px ${modeColor}88)`, transition: 'fill 0.5s' }} />
        {/* Current temp */}
        <text x={CX} y={CY - 10} textAnchor="middle" fill={tc1(th)} fontSize={32} fontWeight={700} fontFamily="system-ui">{current}°</text>
        {/* Setpoint */}
        <text x={CX} y={CY + 20} textAnchor="middle" fill={modeColor} fontSize={15} fontFamily="system-ui">→ {setpoint}°</text>
        {/* Mode label */}
        <text x={CX} y={CY + 40} textAnchor="middle" fill={tc2(th)} fontSize={11} fontFamily="system-ui">{modeLabel}</text>
      </svg>
      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: 6, width: '100%' }}>
        {['off', 'heat', 'cool'].map(m => (
          <button key={m} onClick={() => callService('climate', 'set_hvac_mode', { hvac_mode: m }, s.entity_id)}
            style={{ ...mkBtn(hvacMode === m, false, th), padding: '6px 0', fontSize: 12, flex: 1 }}>
            {m === 'heat' ? '🔥' : m === 'cool' ? '❄️' : '⏸'}
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
  const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  return (
    <div style={{ ...cardSt(th, { padding: '12px 10px', alignItems: 'center', gridColumn: 'span 1' }) }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: tc1(th), textAlign: 'center', marginBottom: 4 }}>{name}</span>
      <NestThermostat s={s} />
    </div>
  )
})
