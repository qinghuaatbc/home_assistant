import { memo, useCallback } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useSound, useRestCall, cardSt, mkBtn, tc2 } from '../PanelContext'
import { IconTile } from '../ui/IconTile'

// ─── Sensor / Door Card ───────────────────────────────────────────────────────

const DOOR_CLOSED_SRC = '/door-closed.png'
const DOOR_OPEN_SRC   = '/door-open.png'

export const SensorRtiCard = memo(({ s }: { s: HaState }) => {
  const t = useT(); const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const dc = String(s.attributes.device_class ?? '')
  const open = s.state === 'on'
  const label = open ? (dc === 'motion' ? t.detected : t.open) : (dc === 'motion' ? t.clear : t.closed)
  const color = open ? 'rgb(255,69,58)' : 'rgb(48,209,88)'
  const isDoor = dc === 'door' || dc === 'garage_door'
  const fallbackIcon = dc === 'window' ? '🪟' : dc === 'motion' ? '🚶' : '🚪'

  const icon = isDoor ? (
    <img src={open ? DOOR_OPEN_SRC : DOOR_CLOSED_SRC} alt={open ? 'open' : 'closed'} style={{
      width: 48, height: 'auto', display: 'block',
      filter: open ? 'drop-shadow(0 0 10px rgba(255,69,58,0.8))' : 'grayscale(0.4) opacity(0.7)',
      animation: open ? 'sensorPing 2.5s ease-in-out infinite' : 'none',
      transition: 'filter 0.4s',
    }} />
  ) : (
    <span style={{
      fontSize: 32,
      filter: open ? `drop-shadow(0 0 8px ${color}99)` : 'grayscale(0.5) opacity(0.6)',
      animation: open ? 'sensorPing 2s ease-in-out infinite' : 'none',
      transition: 'filter 0.3s',
    }}>{fallbackIcon}</span>
  )

  return (
    <IconTile
      icon={icon}
      name={name}
      active={open}
      th={th}
      glowColor={open ? color : undefined}
      fillPct={open ? 60 : 0}
      onClick={() => {}}
      sub={
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: open ? color : tc2(th),
          background: open ? `${color}22` : 'rgba(128,128,128,0.12)',
          borderRadius: 6, padding: '1px 7px',
          animation: open ? 'sensorPing 1.5s ease-in-out infinite' : 'none',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: open ? `0 0 6px ${color}` : 'none' }} />
          {label}
        </span>
      }
    />
  )
})

// ─── Alarm Card ───────────────────────────────────────────────────────────────

export const AlarmCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh()
  const name = String(s.attributes.friendly_name ?? 'Alarm')
  const armed = s.state.startsWith('armed')
  const pending = s.state === 'pending' || s.state === 'arming'
  const triggered = s.state === 'triggered'
  const stateColor = triggered ? '#ff453a' : armed ? '#ff9f0a' : '#30d158'
  return (
    <div style={{ ...cardSt(th, { gridColumn: 'span 2', borderLeft: `3px solid ${stateColor}`, animation: triggered ? 'alarmRing 1.4s ease-in-out infinite' : 'none' }) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22, filter: triggered ? 'drop-shadow(0 0 10px rgba(255,69,58,0.9))' : armed ? 'drop-shadow(0 0 6px rgba(255,159,10,0.7))' : 'none', animation: pending || triggered ? 'sensorPing 1.2s ease-in-out infinite' : 'none' }}>🔒</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: th === 'day' ? '#6b4400' : 'rgba(240,200,120,0.92)' }}>{name}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: stateColor, background: `${stateColor}20`, borderRadius: 6, padding: '3px 8px' }}>{s.state.replace(/_/g, ' ').toUpperCase()}</span>
      </div>
      {!armed && !pending && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => callService('alarm_control_panel', 'alarm_arm_home', {}, s.entity_id)} style={mkBtn(false, false, th)}>{t.armHome}</button>
          <button onClick={() => callService('alarm_control_panel', 'alarm_arm_away', {}, s.entity_id)} style={mkBtn(false, false, th)}>{t.armAway}</button>
        </div>
      )}
      {(armed || pending) && (
        <button onClick={() => callService('alarm_control_panel', 'alarm_disarm', {}, s.entity_id)}
          style={{ ...mkBtn(true, true, th), padding: '11px 0', fontSize: 14 }}>{t.disarm}</button>
      )}
    </div>
  )
})

// ─── Lock Tile ────────────────────────────────────────────────────────────────

export const LockTile = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh(); const sound = useSound()
  const locked = s.state === 'locked'
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const glowColor = locked ? undefined : 'rgb(255,159,10)'

  const toggle = useCallback(() => {
    callService('lock', locked ? 'unlock' : 'lock', {}, s.entity_id)
    sound('switch', !locked, name)
  }, [locked, s.entity_id, callService, sound, name])

  return (
    <IconTile
      icon={<span style={{ fontSize: 32, filter: locked ? 'none' : `drop-shadow(0 0 8px rgba(255,159,10,0.8))`, transition: 'filter 0.3s' }}>{locked ? '🔒' : '🔓'}</span>}
      name={name}
      active={!locked}
      th={th}
      glowColor={glowColor}
      onClick={toggle}
      sub={<span style={{ fontSize: 10, fontWeight: 700, color: locked ? tc2(th) : glowColor, background: locked ? 'rgba(128,128,128,0.12)' : `${glowColor}22`, borderRadius: 6, padding: '1px 7px' }}>{locked ? '🔒 LOCKED' : '🔓 UNLOCKED'}</span>}
    />
  )
})

// ─── Curtain Tile ─────────────────────────────────────────────────────────────

export const CurtainTile = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh(); const sound = useSound()
  const open = s.state === 'on' || s.state === 'open'
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const glowColor = open ? 'rgb(48,209,88)' : undefined
  const domain = s.entity_id.split('.')[0]

  const toggle = useCallback(() => {
    if (domain === 'cover') callService('cover', open ? 'close_cover' : 'open_cover', {}, s.entity_id)
    else callService('binary_sensor', open ? 'turn_off' : 'turn_on', {}, s.entity_id)
    sound('switch', !open, name)
  }, [open, domain, s.entity_id, callService, sound, name])

  return (
    <IconTile
      icon={<span style={{ fontSize: 32, filter: open ? `drop-shadow(0 0 8px rgba(48,209,88,0.7))` : 'grayscale(0.5) opacity(0.6)', transition: 'filter 0.3s' }}>🪟</span>}
      name={name}
      active={open}
      th={th}
      glowColor={glowColor}
      onClick={toggle}
      sub={<span style={{ fontSize: 10, fontWeight: 700, color: open ? glowColor : tc2(th), background: open ? `${glowColor}22` : 'rgba(128,128,128,0.12)', borderRadius: 6, padding: '1px 7px' }}>{open ? 'OPEN' : 'CLOSED'}</span>}
    />
  )
})
