import { useState, useEffect, useCallback, memo } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useSound, useRestCall } from '../PanelContext'

// ─── Realistic Garage Door SVG ────────────────────────────────────────────────

const W = 300; const H = 200
const DX = 38                    // left wall width
const DW = 224                   // door width
const DH = 132                   // door height
const PANELS = 4
const PH = DH / PANELS           // panel section height = 33

// Two raised rectangular inserts per panel section
const INS_PAD = 10               // margin from door edge
const INS_GAP = 14               // stile between two inserts
const INS_W = (DW - INS_PAD * 2 - INS_GAP) / 2   // ~94px each
const INS_VPAD = 6               // vertical margin inside panel

// Track dimensions
const TRK_W = 7                  // track width
const TRK_X_L = DX              // left track x
const TRK_X_R = DX + DW - TRK_W // right track x

function GarageDoorSVG({ open, moving, isDay }: { open: boolean; moving: boolean; isDay: boolean }) {
  // colour palette
  const sky       = isDay ? '#e8eaf0' : '#1a1a1e'
  const wallA     = isDay ? '#c4c4c4' : '#3a3a3c'
  const wallB     = isDay ? '#b0b0b0' : '#2e2e30'
  const sidingLn  = isDay ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)'
  const frameCol  = isDay ? '#f0f0ee' : '#e0e0dc'    // white door trim
  const doorFaceA = isDay ? '#e8e6e0' : '#56565a'    // door panel top gradient
  const doorFaceB = isDay ? '#d4d2cc' : '#44444a'
  const insTop    = isDay ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.10)'
  const insSide   = isDay ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.06)'
  const insShadow = isDay ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.60)'
  const creaseBot = isDay ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.55)'
  const creaseTop = isDay ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.08)'
  const trkCol    = isDay ? '#888' : '#555'
  const trkShine  = isDay ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)'
  const glassA    = isDay ? '#b8d4e8' : '#1c3040'
  const glassB    = isDay ? '#d4eaf8' : '#263848'
  const glassRef  = isDay ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.18)'
  const springCol = isDay ? '#888' : '#666'
  const driveA    = isDay ? '#ccc' : '#38383a'
  const driveB    = isDay ? '#b8b8b8' : '#28282a'
  const jointCol  = isDay ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)'

  // interior colours
  const intA  = isDay ? '#d8d0c8' : '#1e1e20'
  const intB  = isDay ? '#b8b0a8' : '#141416'
  const floorA = isDay ? '#ccc8c0' : '#252528'
  const floorB = isDay ? '#b0a8a0' : '#181818'
  const wallInt = isDay ? '#c8c0b8' : '#202022'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 300, display: 'block' }}>
      <defs>
        <linearGradient id="gdWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={wallA} /><stop offset="100%" stopColor={wallB} />
        </linearGradient>
        <linearGradient id="gdPanel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={doorFaceA} /><stop offset="100%" stopColor={doorFaceB} />
        </linearGradient>
        <linearGradient id="gdInt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={intA} /><stop offset="100%" stopColor={intB} />
        </linearGradient>
        <linearGradient id="gdFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={floorA} /><stop offset="100%" stopColor={floorB} />
        </linearGradient>
        <linearGradient id="gdDrive" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={driveA} /><stop offset="100%" stopColor={driveB} />
        </linearGradient>
        <linearGradient id="gdGlass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={glassA} /><stop offset="100%" stopColor={glassB} />
        </linearGradient>
        <linearGradient id="gdTrack" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={trkCol} />
          <stop offset="40%" stopColor={trkShine} />
          <stop offset="100%" stopColor={trkCol} />
        </linearGradient>
        <linearGradient id="gdSpring" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isDay ? '#aaa' : '#777'} />
          <stop offset="50%" stopColor={isDay ? '#ddd' : '#999'} />
          <stop offset="100%" stopColor={isDay ? '#999' : '#666'} />
        </linearGradient>
        <clipPath id="gdClip">
          <rect x={DX} y={0} width={DW} height={DH} />
        </clipPath>
        {/* Soft light glow for opener LED */}
        <filter id="gdLED" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── Sky / exterior background ─────────────────────────────────── */}
      <rect x={0} y={0} width={W} height={DH} fill={sky} />

      {/* ── Left wall with siding ─────────────────────────────────────── */}
      <rect x={0} y={0} width={DX + 2} height={DH} fill="url(#gdWall)" />
      {Array.from({ length: Math.ceil(DH / 7) }).map((_, i) => (
        <g key={i}>
          <line x1={0} y1={i * 7} x2={DX + 2} y2={i * 7} stroke={sidingLn} strokeWidth={0.7} />
          <line x1={0} y1={i * 7 + 1} x2={DX + 2} y2={i * 7 + 1} stroke={isDay ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.03)'} strokeWidth={0.5} />
        </g>
      ))}

      {/* ── Right wall with siding ────────────────────────────────────── */}
      <rect x={DX + DW - 2} y={0} width={W - DX - DW + 2} height={DH} fill="url(#gdWall)" />
      {Array.from({ length: Math.ceil(DH / 7) }).map((_, i) => (
        <g key={i}>
          <line x1={DX + DW - 2} y1={i * 7} x2={W} y2={i * 7} stroke={sidingLn} strokeWidth={0.7} />
          <line x1={DX + DW - 2} y1={i * 7 + 1} x2={W} y2={i * 7 + 1} stroke={isDay ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.03)'} strokeWidth={0.5} />
        </g>
      ))}

      {/* ── Interior (garage inside) ──────────────────────────────────── */}
      <rect x={DX} y={0} width={DW} height={DH} fill="url(#gdInt)" />

      {/* Perspective side walls (interior) */}
      <polygon points={`${DX},0 ${DX + 24},16 ${DX + 24},${DH} ${DX},${DH}`}
        fill={wallInt} opacity={0.55} />
      <polygon points={`${DX + DW},0 ${DX + DW - 24},16 ${DX + DW - 24},${DH} ${DX + DW},${DH}`}
        fill={wallInt} opacity={0.55} />
      {/* Perspective floor */}
      <polygon points={`${DX},${DH} ${DX + 24},${DH - 14} ${DX + DW - 24},${DH - 14} ${DX + DW},${DH}`}
        fill="url(#gdFloor)" />

      {/* Interior visible when door is open */}
      {open && <>
        {/* Ceiling opener rail (horizontal track into garage) */}
        <rect x={W / 2 - 4} y={4} width={8} height={DH - 20} rx={2}
          fill={isDay ? '#aaa' : '#555'} opacity={0.7} />
        {/* Chain on rail */}
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={i} x={W / 2 - 2} y={10 + i * 10} width={4} height={5} rx={1}
            fill={isDay ? '#888' : '#444'} opacity={0.5} />
        ))}
        {/* Opener motor box */}
        <rect x={W / 2 - 18} y={6} width={36} height={20} rx={4}
          fill={isDay ? '#707070' : '#404040'} />
        <rect x={W / 2 - 16} y={8} width={32} height={16} rx={3}
          fill={isDay ? '#888' : '#555'} />
        {/* LED indicator on opener */}
        <circle cx={W / 2 + 10} cy={16} r={4}
          fill={moving ? '#ff9f0a' : open ? '#30d158' : '#ff453a'}
          filter="url(#gdLED)" />

        {/* Torsion spring shaft */}
        <rect x={DX + 14} y={1} width={DW - 28} height={5} rx={2}
          fill="url(#gdSpring)" />
        {/* Spring coils (left side) */}
        {Array.from({ length: 10 }).map((_, i) => (
          <ellipse key={i} cx={DX + 20 + i * 8} cy={3.5} rx={3} ry={2.5}
            fill="none" stroke={springCol} strokeWidth={1} opacity={0.7} />
        ))}
        {/* Spring coils (right side) */}
        {Array.from({ length: 10 }).map((_, i) => (
          <ellipse key={i} cx={DX + DW - 20 - i * 8} cy={3.5} rx={3} ry={2.5}
            fill="none" stroke={springCol} strokeWidth={1} opacity={0.7} />
        ))}

        {/* Interior ceiling light */}
        <rect x={W / 2 - 20} y={24} width={40} height={10} rx={3}
          fill={isDay ? '#fff9c4' : '#fff5a0'} opacity={0.9} />
        <ellipse cx={W / 2} cy={34} rx={40} ry={18}
          fill={isDay ? 'rgba(255,245,150,0.25)' : 'rgba(255,240,100,0.15)'}
          style={{ filter: 'blur(8px)' }} />

        {/* Car silhouette (more detailed) */}
        <g opacity={0.65} transform={`translate(${DX + 22}, ${DH - 44})`}>
          {/* Car body */}
          <rect x={0} y={14} width={DW - 44} height={20} rx={3}
            fill={isDay ? '#7a8090' : '#404450'} />
          {/* Cabin roof */}
          <path d={`M 18 14 Q 28 0 ${(DW - 44) * 0.38} 0 L ${(DW - 44) * 0.7} 0 Q ${(DW - 44) * 0.82} 0 ${DW - 58} 14 Z`}
            fill={isDay ? '#8a90a0' : '#505560'} />
          {/* Windshield */}
          <path d={`M 24 13 Q 30 2 ${(DW - 44) * 0.38} 2 L ${(DW - 44) * 0.56} 2 L ${(DW - 44) * 0.56} 13 Z`}
            fill={isDay ? 'rgba(160,200,230,0.6)' : 'rgba(60,100,130,0.6)'} />
          {/* Rear window */}
          <path d={`M ${(DW - 44) * 0.62} 2 L ${(DW - 44) * 0.7} 2 Q ${(DW - 44) * 0.82} 2 ${DW - 58} 13 L ${(DW - 44) * 0.62} 13 Z`}
            fill={isDay ? 'rgba(160,200,230,0.5)' : 'rgba(60,100,130,0.5)'} />
          {/* Wheels */}
          {[18, DW - 62].map(wx => (
            <g key={wx}>
              <circle cx={wx} cy={34} r={12} fill={isDay ? '#333' : '#1a1a1a'} />
              <circle cx={wx} cy={34} r={8}  fill={isDay ? '#555' : '#2a2a2a'} />
              <circle cx={wx} cy={34} r={4}  fill={isDay ? '#888' : '#444'} />
            </g>
          ))}
          {/* Headlights */}
          <rect x={DW - 56} y={18} width={8} height={6} rx={2}
            fill={isDay ? '#fffacc' : '#ffee88'} opacity={0.8} />
          {/* Tail lights */}
          <rect x={2} y={18} width={6} height={6} rx={1}
            fill="#ff453a" opacity={0.7} />
        </g>
      </>}

      {/* ── Door panels (animated) ────────────────────────────────────── */}
      <g clipPath="url(#gdClip)">
        <g style={{
          transform: `translateY(${open ? '-100%' : '0%'})`,
          transition: moving ? 'transform 1.8s cubic-bezier(0.42,0,0.18,1)' : 'none',
        }}>
          {Array.from({ length: PANELS }).map((_, pi) => {
            const py = pi * PH
            const isTopPanel = pi === 0
            return (
              <g key={pi}>
                {/* Panel base */}
                <rect x={DX} y={py} width={DW} height={PH} fill="url(#gdPanel)" />

                {/* Two raised insert sections */}
                {[0, 1].map(ii => {
                  const ix = DX + INS_PAD + ii * (INS_W + INS_GAP)
                  const iy = py + INS_VPAD
                  const iw = INS_W
                  const ih = PH - INS_VPAD * 2

                  // If top panel: split insert into window zone + lower zone
                  const winH = isTopPanel ? ih * 0.55 : 0
                  const lowerY = iy + winH
                  const lowerH = ih - winH

                  return (
                    <g key={ii}>
                      {/* Inset shadow (outer edge, gives recessed look) */}
                      <rect x={ix} y={iy} width={iw} height={ih} rx={1}
                        fill={insShadow} />
                      {/* Insert face (slightly inset) */}
                      <rect x={ix + 1.5} y={iy + 1.5} width={iw - 3} height={ih - 3} rx={1}
                        fill="url(#gdPanel)" />

                      {/* Top-panel windows */}
                      {isTopPanel && <>
                        {/* Window background */}
                        <rect x={ix + 2} y={iy + 2} width={iw - 4} height={winH - 4} rx={1}
                          fill="url(#gdGlass)" />
                        {/* Glass reflection diagonal */}
                        <line x1={ix + 4} y1={iy + 4} x2={ix + 10} y2={iy + 4}
                          stroke={glassRef} strokeWidth={2} strokeLinecap="round" opacity={0.8} />
                        <line x1={ix + 4} y1={iy + 4} x2={ix + 4} y2={iy + 10}
                          stroke={glassRef} strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
                        {/* Window frame */}
                        <rect x={ix + 2} y={iy + 2} width={iw - 4} height={winH - 4} rx={1}
                          fill="none" stroke={isDay ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.4)'} strokeWidth={1} />
                        {/* Lower panel section below windows */}
                        <rect x={ix + 2} y={lowerY} width={iw - 4} height={lowerH - 2} rx={1}
                          fill={isDay ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.04)'} />
                      </>}

                      {/* Non-top panel: plain raised surface */}
                      {!isTopPanel && (
                        <rect x={ix + 2} y={iy + 2} width={iw - 4} height={ih - 4} rx={1}
                          fill={isDay ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)'} />
                      )}

                      {/* Bevel highlight (top edge of insert) */}
                      <line x1={ix + 1.5} y1={iy + 1.5} x2={ix + iw - 1.5} y2={iy + 1.5}
                        stroke={insTop} strokeWidth={1.2} />
                      {/* Bevel left edge */}
                      <line x1={ix + 1.5} y1={iy + 1.5} x2={ix + 1.5} y2={iy + ih - 1.5}
                        stroke={insSide} strokeWidth={1} />
                      {/* Shadow bottom */}
                      <line x1={ix + 2} y1={iy + ih - 1.5} x2={ix + iw - 1.5} y2={iy + ih - 1.5}
                        stroke={insShadow} strokeWidth={1} />
                    </g>
                  )
                })}

                {/* Horizontal crease between panel sections */}
                {pi < PANELS - 1 && <>
                  <line x1={DX} y1={py + PH}     x2={DX + DW} y2={py + PH}
                    stroke={creaseBot} strokeWidth={2} />
                  <line x1={DX} y1={py + PH + 1}  x2={DX + DW} y2={py + PH + 1}
                    stroke={creaseTop} strokeWidth={1} />
                  {/* Hinge markers at crease */}
                  {[0.2, 0.8].map(fx => {
                    const hx = DX + DW * fx
                    return (
                      <g key={fx}>
                        <rect x={hx - 8} y={py + PH - 4} width={16} height={8} rx={2}
                          fill={isDay ? '#bbb' : '#555'} />
                        <rect x={hx - 5} y={py + PH - 2.5} width={10} height={5} rx={1}
                          fill={isDay ? '#ccc' : '#666'} />
                        <circle cx={hx} cy={py + PH} r={1.5} fill={isDay ? '#999' : '#444'} />
                      </g>
                    )
                  })}
                </>}

                {/* Track roller on each side at top of panel */}
                <circle cx={TRK_X_L + TRK_W / 2} cy={py + 6} r={4}
                  fill={isDay ? '#aaa' : '#666'} stroke={isDay ? '#888' : '#444'} strokeWidth={0.8} />
                <circle cx={TRK_X_R + TRK_W / 2} cy={py + 6} r={4}
                  fill={isDay ? '#aaa' : '#666'} stroke={isDay ? '#888' : '#444'} strokeWidth={0.8} />
                {/* Roller axle */}
                <circle cx={TRK_X_L + TRK_W / 2} cy={py + 6} r={1.5}
                  fill={isDay ? '#777' : '#333'} />
                <circle cx={TRK_X_R + TRK_W / 2} cy={py + 6} r={1.5}
                  fill={isDay ? '#777' : '#333'} />

                {/* Panel top highlight strip */}
                <rect x={DX} y={py} width={DW} height={2}
                  fill={isDay ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)'} />
              </g>
            )
          })}

          {/* Weather seal at door bottom */}
          <rect x={DX} y={DH - 5} width={DW} height={5}
            fill={isDay ? '#888' : '#333'} rx={1} />
          <rect x={DX + 2} y={DH - 3} width={DW - 4} height={2}
            fill={isDay ? '#999' : '#444'} opacity={0.6} />
        </g>
      </g>

      {/* ── Left C-channel track ──────────────────────────────────────── */}
      <rect x={TRK_X_L} y={0} width={TRK_W} height={DH} fill="url(#gdTrack)" opacity={0.85} />
      <line x1={TRK_X_L + 1} y1={0} x2={TRK_X_L + 1} y2={DH}
        stroke={trkShine} strokeWidth={1} opacity={0.6} />

      {/* ── Right C-channel track ─────────────────────────────────────── */}
      <rect x={TRK_X_R} y={0} width={TRK_W} height={DH} fill="url(#gdTrack)" opacity={0.85} />
      <line x1={TRK_X_R + TRK_W - 1} y1={0} x2={TRK_X_R + TRK_W - 1} y2={DH}
        stroke={trkShine} strokeWidth={1} opacity={0.6} />

      {/* ── Door frame / trim ─────────────────────────────────────────── */}
      {/* Top frame */}
      <rect x={DX - 6} y={0} width={DW + 12} height={7} fill={frameCol} />
      <rect x={DX - 6} y={6} width={DW + 12} height={1} fill={isDay ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.4)'} />
      {/* Left frame */}
      <rect x={DX - 6} y={0} width={6} height={DH + 4} fill={frameCol} />
      <rect x={DX - 1} y={0} width={1} height={DH + 4} fill={isDay ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.35)'} />
      {/* Right frame */}
      <rect x={DX + DW} y={0} width={6} height={DH + 4} fill={frameCol} />
      <rect x={DX + DW} y={0} width={1} height={DH + 4} fill={isDay ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.35)'} />

      {/* ── Driveway / ground ─────────────────────────────────────────── */}
      <rect x={0} y={DH} width={W} height={H - DH} fill="url(#gdDrive)" />
      {/* Expansion joint lines */}
      <line x1={0} y1={DH + 20} x2={W} y2={DH + 20} stroke={jointCol} strokeWidth={1.5} />
      <line x1={0} y1={DH + 45} x2={W} y2={DH + 45} stroke={jointCol} strokeWidth={1.5} />
      <line x1={W * 0.33} y1={DH} x2={W * 0.33} y2={H} stroke={jointCol} strokeWidth={1} />
      <line x1={W * 0.66} y1={DH} x2={W * 0.66} y2={H} stroke={jointCol} strokeWidth={1} />
      {/* Driveway-to-door threshold */}
      <rect x={DX - 6} y={DH} width={DW + 12} height={4}
        fill={isDay ? '#aaa' : '#4a4a4c'} />

      {/* ── Motion orange strip ───────────────────────────────────────── */}
      {moving && (
        <rect x={DX} y={0} width={DW} height={4} rx={1}
          fill="#ff9f0a" opacity={0.9} />
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

  useEffect(() => {
    setAnimMoving(true)
    setAnimOpen(isOpen)
    const id = setTimeout(() => setAnimMoving(false), 2000)
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
    setTimeout(() => setAnimMoving(false), 2000)
  }, [isOpen, isMoving, s.entity_id, callService, sound, name])

  const stateColor = isMoving ? '#ff9f0a' : isOpen ? '#ff453a' : '#30d158'
  const stateLabel = s.state === 'opening' ? 'Opening…'
    : s.state === 'closing' ? 'Closing…'
    : isOpen ? (t.open ?? 'Open') : (t.closed ?? 'Closed')
  const btnLabel = isMoving ? '⏹ Stop' : isOpen ? '⬇ Close' : '⬆ Open'

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
      <span style={{
        fontSize: 11, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase',
        color: isDay ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)',
        fontFamily: "'Helvetica Neue', sans-serif",
      }}>{name}</span>

      <GarageDoorSVG open={animOpen} moving={animMoving} isDay={isDay} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flex: 1,
          padding: '7px 10px', borderRadius: 10,
          background: isDay ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${isDay ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
            background: stateColor,
            boxShadow: isMoving ? `0 0 8px ${stateColor}` : 'none',
            animation: isMoving ? 'sensorPing 0.9s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: stateColor }}>{stateLabel}</span>
        </div>
        <button onClick={toggle} style={{
          padding: '7px 16px', fontSize: 12, fontWeight: 600,
          background: `${stateColor}18`,
          border: `1px solid ${stateColor}`,
          borderRadius: 10, cursor: 'pointer', color: stateColor,
          boxShadow: `0 0 10px ${stateColor}33`,
          transition: 'all 0.3s', whiteSpace: 'nowrap',
        }}>{btnLabel}</button>
      </div>
    </div>
  )
})

// ─── Compat shim for SwitchCards import ──────────────────────────────────────
export function GarageDoorVisual({ open, toggling }: { open: boolean; toggling: boolean }) {
  return <GarageDoorSVG open={open} moving={toggling} isDay={false} />
}
