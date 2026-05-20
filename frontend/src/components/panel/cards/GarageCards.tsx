import { useState, useEffect, useCallback, memo } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useSound, useRestCall } from '../PanelContext'

// ─── Garage Door SVG ──────────────────────────────────────────────────────────

const W = 220; const H = 160
const WALL_X = 20; const DOOR_W = W - WALL_X * 2   // 180
const DOOR_H = 120; const PANELS = 4; const PANEL_H = DOOR_H / PANELS

function GarageDoorSVG({ open, moving, isDay }: { open: boolean; moving: boolean; isDay: boolean }) {
  // animate: when door is open or in-progress, panels translate up
  const lifted = open
  const wallFill   = isDay ? '#b0b0b0' : '#3a3a3c'
  const wallStroke = isDay ? '#888'    : '#555'
  const trackFill  = isDay ? '#888'    : '#555'
  const groundFill = isDay ? '#c8c8c8' : '#2c2c2e'
  const ceilFill   = isDay ? '#d0d0d0' : '#222'
  const interiorFill = isDay ? '#e8e0d8' : '#1a1a1a'
  const panelFill    = isDay ? '#d0cfc8' : '#4a4a4c'
  const panelStripe  = isDay ? '#bcbbb4' : '#3a3a3c'
  const panelBevel   = isDay ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.12)'
  const panelShadow  = isDay ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.5)'
  const trackW = 4; const doorX = WALL_X; const doorY = 0

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 240, display: 'block' }}>
      <defs>
        <linearGradient id="gWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isDay ? '#c0c0c0' : '#444'} />
          <stop offset="100%" stopColor={isDay ? '#a8a8a8' : '#2e2e2e'} />
        </linearGradient>
        <linearGradient id="gPanel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={isDay ? '#dedad2' : '#525254'} />
          <stop offset="40%"  stopColor={panelFill} />
          <stop offset="100%" stopColor={isDay ? '#c8c6be' : '#3e3e40'} />
        </linearGradient>
        <linearGradient id="gGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isDay ? '#d8d8d8' : '#3a3a3c'} />
          <stop offset="100%" stopColor={groundFill} />
        </linearGradient>
        <linearGradient id="gInterior" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isDay ? '#e0d8d0' : '#252525'} />
          <stop offset="100%" stopColor={isDay ? '#c8c0b8' : '#111'} />
        </linearGradient>
        <clipPath id="gClip">
          <rect x={doorX} y={doorY} width={DOOR_W} height={DOOR_H} />
        </clipPath>
      </defs>

      {/* Ceiling strip (above door — door panels slide into here) */}
      <rect x={0} y={0} width={W} height={6} fill={ceilFill} />

      {/* Left wall */}
      <rect x={0} y={0} width={WALL_X} height={DOOR_H} fill="url(#gWall)" stroke={wallStroke} strokeWidth={0.5} />
      {/* Right wall */}
      <rect x={DOOR_W + WALL_X} y={0} width={WALL_X} height={DOOR_H} fill="url(#gWall)" stroke={wallStroke} strokeWidth={0.5} />

      {/* Interior (garage inside — visible when door opens) */}
      <rect x={doorX} y={doorY} width={DOOR_W} height={DOOR_H} fill="url(#gInterior)" />

      {/* Interior detail when open */}
      {open && <>
        {/* Floor line */}
        <line x1={doorX + 10} y1={DOOR_H - 2} x2={doorX + DOOR_W - 10} y2={DOOR_H - 2}
          stroke={isDay ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'} strokeWidth={1} />
        {/* Ceiling light */}
        <ellipse cx={W / 2} cy={14} rx={18} ry={5}
          fill={isDay ? 'rgba(255,220,100,0.5)' : 'rgba(255,200,80,0.3)'}
          style={{ filter: 'blur(3px)' }} />
        <rect x={W / 2 - 6} y={6} width={12} height={6} rx={2}
          fill={isDay ? '#ffe080' : '#ffcc44'} opacity={0.9} />
        {/* Car silhouette */}
        <g opacity={0.6}>
          <rect x={doorX + 28} y={DOOR_H - 34} width={DOOR_W - 56} height={22} rx={4}
            fill={isDay ? '#9090a0' : '#505060'} />
          <rect x={doorX + 44} y={DOOR_H - 52} width={DOOR_W - 88} height={22} rx={6}
            fill={isDay ? '#a0a0b0' : '#606070'} />
          {/* wheels */}
          <circle cx={doorX + 50} cy={DOOR_H - 13} r={9} fill={isDay ? '#555' : '#222'} />
          <circle cx={doorX + DOOR_W - 50} cy={DOOR_H - 13} r={9} fill={isDay ? '#555' : '#222'} />
          <circle cx={doorX + 50} cy={DOOR_H - 13} r={5} fill={isDay ? '#888' : '#444'} />
          <circle cx={doorX + DOOR_W - 50} cy={DOOR_H - 13} r={5} fill={isDay ? '#888' : '#444'} />
        </g>
      </>}

      {/* Door panels group — clips to door opening, translates up when open */}
      <g clipPath="url(#gClip)">
        <g style={{
          transform: `translateY(${lifted ? '-100%' : '0%'})`,
          transition: moving ? 'transform 1.6s cubic-bezier(0.45,0,0.2,1)' : 'none',
        }}>
          {Array.from({ length: PANELS }).map((_, i) => {
            const py = doorY + i * PANEL_H
            return (
              <g key={i}>
                {/* Panel base */}
                <rect x={doorX} y={py} width={DOOR_W} height={PANEL_H} fill="url(#gPanel)" />
                {/* Horizontal crease line between panels */}
                <line x1={doorX} y1={py + PANEL_H} x2={doorX + DOOR_W} y2={py + PANEL_H}
                  stroke={panelShadow} strokeWidth={2} />
                <line x1={doorX} y1={py + PANEL_H - 1} x2={doorX + DOOR_W} y2={py + PANEL_H - 1}
                  stroke={panelBevel} strokeWidth={1} />
                {/* Three raised rectangular inserts per panel */}
                {[0, 1, 2].map(j => {
                  const pw = (DOOR_W - 32) / 3; const ph = PANEL_H - 10
                  const px2 = doorX + 8 + j * (pw + 8); const py2 = py + 5
                  return (
                    <g key={j}>
                      <rect x={px2} y={py2} width={pw} height={ph} rx={2}
                        fill={panelStripe}
                        stroke={panelShadow} strokeWidth={0.8} />
                      {/* Bevel highlight top */}
                      <line x1={px2} y1={py2} x2={px2 + pw} y2={py2}
                        stroke={panelBevel} strokeWidth={1} />
                      {/* Bevel left */}
                      <line x1={px2} y1={py2} x2={px2} y2={py2 + ph}
                        stroke={panelBevel} strokeWidth={1} />
                    </g>
                  )
                })}
                {/* Top highlight on panel */}
                <rect x={doorX} y={py} width={DOOR_W} height={3} fill={panelBevel} opacity={0.5} />
              </g>
            )
          })}
        </g>
      </g>

      {/* Left track */}
      <rect x={doorX} y={0} width={trackW} height={DOOR_H} fill={trackFill} opacity={0.7} />
      {/* Right track */}
      <rect x={doorX + DOOR_W - trackW} y={0} width={trackW} height={DOOR_H} fill={trackFill} opacity={0.7} />
      {/* Track bolts */}
      {[20, 60, 100].map(ty => (
        <g key={ty}>
          <circle cx={doorX + 2} cy={ty} r={2.5} fill={isDay ? '#aaa' : '#666'} />
          <circle cx={doorX + DOOR_W - 2} cy={ty} r={2.5} fill={isDay ? '#aaa' : '#666'} />
        </g>
      ))}

      {/* Ground / driveway */}
      <rect x={0} y={DOOR_H} width={W} height={H - DOOR_H} fill="url(#gGround)" />
      {/* Driveway line */}
      <line x1={doorX + 20} y1={DOOR_H + 6} x2={doorX + DOOR_W - 20} y2={DOOR_H + 6}
        stroke={isDay ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'} strokeWidth={1} />

      {/* Moving indicator: light strip along top when in motion */}
      {moving && (
        <rect x={doorX} y={0} width={DOOR_W} height={3} rx={1}
          fill="#ffa030" opacity={0.85}
          style={{ animation: 'shimmerPulse 0.8s ease-in-out infinite' }} />
      )}
    </svg>
  )
}

// ─── Garage Cover Card ────────────────────────────────────────────────────────

export const GarageCoverCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh(); const sound = useSound()
  const isDay = th === 'day'

  const name     = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const isOpen   = s.state === 'open'    || s.state === 'opening'
  const isMoving = s.state === 'opening' || s.state === 'closing'
  const [animOpen, setAnimOpen]     = useState(isOpen)
  const [animMoving, setAnimMoving] = useState(false)

  // sync animation target with entity state
  useEffect(() => {
    setAnimMoving(true)
    setAnimOpen(isOpen)
    const id = setTimeout(() => setAnimMoving(false), 1700)
    return () => clearTimeout(id)
  }, [s.state])

  const toggle = useCallback(() => {
    let svc = 'open_cover'
    if (isMoving) svc = 'stop_cover'
    else if (isOpen) svc = 'close_cover'
    callService('cover', svc, {}, s.entity_id)
    sound('garage', !isOpen, name)
    setAnimMoving(true)
    setAnimOpen(!isOpen)
    setTimeout(() => setAnimMoving(false), 1700)
  }, [isOpen, isMoving, s.entity_id, callService, sound, name])

  const stateColor = isMoving
    ? '#ff9f0a'
    : isOpen ? '#ff453a' : '#30d158'
  const stateLabel = s.state === 'opening' ? 'Opening…'
    : s.state === 'closing' ? 'Closing…'
    : isOpen ? (t.open ?? 'Open') : (t.closed ?? 'Closed')
  const btnLabel = isMoving ? '⏹ Stop'
    : isOpen ? '⬇ Close' : '⬆ Open'

  return (
    <div style={{
      gridColumn: 'span 2',
      background: isDay ? '#f2f2f7' : '#1c1c1e',
      border: `1px solid ${isDay ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 20, padding: '16px 14px 14px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      boxShadow: isDay ? '0 4px 20px rgba(0,0,0,0.08)' : '0 4px 20px rgba(0,0,0,0.4)',
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      {/* Title */}
      <span style={{
        fontSize: 11, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase',
        color: isDay ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)',
        fontFamily: "'Helvetica Neue', sans-serif",
      }}>
        {name}
      </span>

      {/* Garage door visual */}
      <div style={{ width: '100%', maxWidth: 240 }}>
        <GarageDoorSVG open={animOpen} moving={animMoving} isDay={isDay} />
      </div>

      {/* Status + button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 240 }}>
        {/* Status badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          flex: 1, padding: '7px 10px', borderRadius: 10,
          background: isDay ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${isDay ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: stateColor,
            boxShadow: isMoving ? `0 0 8px ${stateColor}` : 'none',
            display: 'inline-block',
            animation: isMoving ? 'sensorPing 0.9s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: stateColor }}>{stateLabel}</span>
        </div>

        {/* Open/Close button */}
        <button onClick={toggle} style={{
          padding: '7px 16px', fontSize: 12, fontWeight: 600,
          background: isMoving
            ? (isDay ? 'rgba(255,159,10,0.12)' : 'rgba(255,159,10,0.2)')
            : isOpen
              ? (isDay ? 'rgba(255,69,58,0.10)' : 'rgba(255,69,58,0.2)')
              : (isDay ? 'rgba(48,209,88,0.10)' : 'rgba(48,209,88,0.2)'),
          border: `1px solid ${stateColor}`,
          borderRadius: 10, cursor: 'pointer', color: stateColor,
          boxShadow: `0 0 10px ${stateColor}33`,
          transition: 'all 0.3s', whiteSpace: 'nowrap',
        }}>
          {btnLabel}
        </button>
      </div>
    </div>
  )
})

// ─── Compat shim for SwitchCards import ──────────────────────────────────────
export function GarageDoorVisual({ open, toggling }: { open: boolean; toggling: boolean }) {
  return <GarageDoorSVG open={open} moving={toggling} isDay={false} />
}
