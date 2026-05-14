import { useState, useEffect, useCallback, memo } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useSound, useRestCall, tc2 } from '../PanelContext'
import { IconTile } from '../ui/IconTile'

// ─── CSS Garage Door ──────────────────────────────────────────────────────────

export function GarageDoorVisual({ open, toggling }: { open: boolean; toggling: boolean }) {
  const PANELS = 4
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 160, margin: '0 auto' }}>
      {/* Frame */}
      <div style={{
        border: '3px solid #555', borderRadius: '6px 6px 0 0',
        background: '#1a1a2a', overflow: 'hidden',
        height: 120, position: 'relative',
      }}>
        {/* Door panels */}
        <div style={{
          position: 'absolute', inset: 0,
          transform: `translateY(${open ? '-100%' : '0'})`,
          transition: toggling ? 'transform 1.4s cubic-bezier(0.4,0,0.2,1)' : 'none',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg,#4a5568 0%,#374151 100%)',
        }}>
          {Array.from({ length: PANELS }).map((_, i) => (
            <div key={i} style={{
              flex: 1, borderBottom: '2px solid #555',
              display: 'flex', gap: 3, padding: '2px 4px', alignItems: 'center',
            }}>
              <div style={{ flex: 1, height: '60%', background: 'rgba(255,255,255,0.04)', borderRadius: 2 }} />
              <div style={{ flex: 1, height: '60%', background: 'rgba(255,255,255,0.04)', borderRadius: 2 }} />
              <div style={{ flex: 1, height: '60%', background: 'rgba(255,255,255,0.04)', borderRadius: 2 }} />
            </div>
          ))}
        </div>
        {/* Ground line */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#333', borderTop: '1px solid #555' }} />
        {/* Open indicator light */}
        {open && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(48,209,88,0.06)',
          }}>
            <span style={{ fontSize: 22, filter: 'drop-shadow(0 0 8px rgba(48,209,88,0.8))' }}>🚗</span>
          </div>
        )}
      </div>
      {/* Ground */}
      <div style={{ height: 6, background: 'linear-gradient(180deg,#444 0%,#333 100%)', borderRadius: '0 0 4px 4px' }} />
    </div>
  )
}

// ─── Garage Cover Card (cover.* entities) ────────────────────────────────────

export const GarageCoverCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh(); const sound = useSound()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const isOpen   = s.state === 'open'    || s.state === 'opening'
  const isMoving = s.state === 'opening' || s.state === 'closing'
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (isMoving) { setToggling(true); return }
    const id = setTimeout(() => setToggling(false), 1200)
    return () => clearTimeout(id)
  }, [isMoving])

  const toggle = useCallback(() => {
    let svc = 'open_cover'
    if (isMoving) svc = 'stop_cover'
    else if (isOpen) svc = 'close_cover'
    callService('cover', svc, {}, s.entity_id)
    sound('garage', !isOpen, name)
    setToggling(true)
  }, [isOpen, isMoving, s.entity_id, callService, sound, name])

  const color = isMoving ? 'rgb(255,159,10)' : isOpen ? 'rgb(255,69,58)' : 'rgb(48,209,88)'
  const statusLabel = s.state === 'opening' ? '⬆ Opening' : s.state === 'closing' ? '⬇ Closing' : isOpen ? t.open : t.closed
  const active = isOpen || isMoving

  return (
    <IconTile
      icon={
        <span style={{
          fontSize: 36,
          filter: active ? `drop-shadow(0 0 12px ${color}88)` : 'opacity(0.65)',
          animation: isMoving ? 'sensorPing 0.9s ease-in-out infinite' : (toggling ? 'sensorPing 0.8s ease-in-out' : 'none'),
          transition: 'filter 0.3s',
          display: 'inline-block',
        }}>🚗</span>
      }
      name={name}
      active={active}
      th={th}
      glowColor={active ? color : undefined}
      fillPct={active ? 70 : 0}
      onClick={toggle}
      sub={
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: active ? color : tc2(th),
          background: active ? `${color}22` : 'rgba(128,128,128,0.12)',
          borderRadius: 6, padding: '1px 7px',
          animation: isMoving ? 'sensorPing 0.9s ease-in-out infinite' : 'none',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: active ? `0 0 6px ${color}` : 'none' }} />
          {statusLabel}
        </span>
      }
    />
  )
})
