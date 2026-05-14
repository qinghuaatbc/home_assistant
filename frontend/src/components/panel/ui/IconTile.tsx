import React, { useRef } from 'react'
import { type Theme, tc2, useTh } from '../PanelContext'

export function GlassIcon({ children, size = 48, color, glow, th }: { children: React.ReactNode; size?: number; color?: string; glow?: string; th: Theme }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28),
      background: color ?? (th === 'day' ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.10)'),
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      border: th === 'day' ? '1px solid rgba(255,255,255,0.94)' : '1px solid rgba(255,255,255,0.16)',
      boxShadow: glow
        ? `0 0 14px ${glow}, inset 0 1px 0 rgba(255,255,255,${th === 'day' ? '0.96' : '0.18'})`
        : `0 2px 10px rgba(0,0,0,${th === 'day' ? '0.10' : '0.32'}), inset 0 1px 0 rgba(255,255,255,${th === 'day' ? '0.94' : '0.15'})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.50), flexShrink: 0, transition: 'all 0.3s',
    }}>{children}</div>
  )
}

export function IconTile({ icon, name, active, th, glowColor, fillPct, onClick, onLongPress, sub }: {
  icon: React.ReactNode; name: string; active: boolean; th: Theme
  glowColor?: string; fillPct?: number; sub?: React.ReactNode
  onClick: () => void; onLongPress?: () => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fill = fillPct ?? (active ? 100 : 0)
  const bg = active && glowColor
    ? th === 'day'
      ? `linear-gradient(to top, ${glowColor}55 0%, ${glowColor}22 ${fill}%, rgba(210,222,242,0.38) 100%)`
      : `linear-gradient(to top, ${glowColor}44 0%, ${glowColor}18 ${fill}%, rgba(255,255,255,0.05) 100%)`
    : th === 'day' ? 'rgba(210,222,242,0.38)' : 'rgba(255,255,255,0.06)'

  return (
    <button
      onClick={onClick}
      onContextMenu={e => { e.preventDefault(); onLongPress?.() }}
      onTouchStart={() => { if (onLongPress) timerRef.current = setTimeout(onLongPress, 500) }}
      onTouchEnd={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }}
      onTouchMove={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }}
      style={{
        border: active && glowColor
          ? `1px solid ${glowColor}70`
          : `1px solid ${th === 'day' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 18, background: bg,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        boxShadow: active && glowColor
          ? `0 4px 20px ${glowColor}30, inset 0 1px 0 rgba(255,255,255,0.30)`
          : `inset 0 1px 0 ${th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)'}`,
        padding: '10px 6px 8px', width: '100%', minHeight: 92,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        cursor: 'pointer', transition: 'all 0.22s', touchAction: 'manipulation',
        fontFamily: 'inherit',
      }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        {icon}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: active && glowColor ? glowColor : tc2(th), textAlign: 'center', lineHeight: 1.2, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
        {name}
      </div>
      {sub}
    </button>
  )
}
