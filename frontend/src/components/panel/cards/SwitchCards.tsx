import { useState, useCallback, memo } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useSound, useRestCall, cardSt, mkBtn, tc1, tc2 } from '../PanelContext'
import { GlassIcon } from '../ui/IconTile'
import { IconTile } from '../ui/IconTile'
import { FancySlider } from '../ui/FancySlider'
import { GarageDoorVisual } from './GarageCards'

// ─── Switch / Garage Card ─────────────────────────────────────────────────────

export const SwitchRtiCard = memo(({ s, icon = '🔌' }: { s: HaState; icon?: string }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh(); const sound = useSound()
  const on = s.state === 'on'
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const isGarage = s.entity_id.includes('garage') || icon === '🚗'
  const [toggling, setToggling] = useState(false)

  const toggle = useCallback(() => {
    const domain = s.entity_id.split('.')[0]
    callService(domain, on ? 'turn_off' : 'turn_on', {}, s.entity_id)
    if (isGarage) {
      sound('garage', !on, name)
      setToggling(true)
      setTimeout(() => setToggling(false), 1600)
    } else {
      sound('switch', !on, name)
    }
  }, [on, s.entity_id, callService, isGarage, sound, name])

  if (isGarage) {
    const color = on ? '#ff453a' : '#30d158'
    return (
      <div style={{
        ...cardSt(th, {
          padding: '12px 10px 10px', gap: 0,
          background: on ? 'rgba(255,69,58,0.04)' : th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
          boxShadow: on ? '0 2px 24px rgba(255,69,58,0.18)' : th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
          transition: 'background 0.4s, box-shadow 0.4s',
        })
      }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: on ? '#ff453a' : tc1(th), transition: 'color 0.3s' }}>{name}</span>
        </div>
        {/* Garage door visual */}
        <div style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'center', marginBottom: 8 }}>
          <GarageDoorVisual open={on} toggling={toggling} />
          {/* Controller */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            background: th === 'day' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '10px 8px',
          }}>
            <span style={{ fontSize: 10, color: tc2(th), fontWeight: 600, letterSpacing: 0.5 }}>CTRL</span>
            <button onClick={toggle} style={{
              width: 36, height: 36, borderRadius: 18, border: 'none', cursor: 'pointer',
              background: on ? 'rgba(255,69,58,0.25)' : 'rgba(48,209,88,0.15)',
              boxShadow: toggling ? `0 0 16px ${color}` : 'none',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'box-shadow 0.3s',
            }}>⚡</button>
            <div style={{
              width: 8, height: 8, borderRadius: 4, background: color,
              boxShadow: `0 0 6px ${color}`, animation: on ? 'sensorPing 1.5s ease-in-out infinite' : 'none',
              transition: 'background 0.3s',
            }} />
          </div>
        </div>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}20`, borderRadius: 6, padding: '3px 10px' }}>
            {on ? t.open : t.closed}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...cardSt(th, { alignItems: 'center', justifyContent: 'center', gap: 8 }) }}>
      <GlassIcon size={50} th={th}
        color={on ? 'rgba(10,132,255,0.18)' : undefined}
        glow={on ? 'rgba(10,132,255,0.45)' : undefined}>
        <span style={{ filter: on ? 'drop-shadow(0 0 6px rgba(10,132,255,0.7))' : 'opacity(0.55)', transition: 'filter 0.3s' }}>{icon}</span>
      </GlassIcon>
      <span style={{ fontSize: 11, color: tc2(th), textAlign: 'center' }}>{name}</span>
      <button onClick={toggle} style={{ ...mkBtn(on, false, th), width: '100%', padding: '10px 0', fontSize: 13 }}>
        {on ? t.on : t.off}
      </button>
    </div>
  )
})

// ─── Switch Tile ──────────────────────────────────────────────────────────────

export const SwitchTile = memo(({ s, icon }: { s: HaState; icon?: string }) => {
  const callService = useRestCall()
  const th = useTh(); const sound = useSound()
  const on = s.state === 'on'
  const isDoor = s.entity_id.includes('door') || s.entity_id.includes('garage') || String(s.attributes.device_class ?? '').includes('door')
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const ic = icon ?? (on ? (isDoor ? '🚪' : '💡') : (isDoor ? '🚪' : '💡'))
  const glowColor = on ? (isDoor ? 'rgb(48,209,88)' : 'rgb(255,214,10)') : undefined

  const toggle = useCallback(() => {
    const dom = s.entity_id.startsWith('light') ? 'light' : s.entity_id.startsWith('switch') ? 'switch' : 'homeassistant'
    callService(dom, on ? 'turn_off' : 'turn_on', {}, s.entity_id)
    sound('switch', !on, name)
  }, [on, s.entity_id, callService, sound, name])

  return (
    <IconTile
      icon={<span style={{ fontSize: 32, filter: on ? 'none' : 'grayscale(1) opacity(0.4)', transition: 'filter 0.3s' }}>{ic}</span>}
      name={name}
      active={on}
      th={th}
      glowColor={glowColor}
      onClick={toggle}
      sub={<span style={{ fontSize: 10, fontWeight: 700, color: on ? glowColor : tc2(th), background: on ? `${glowColor}22` : 'rgba(128,128,128,0.12)', borderRadius: 6, padding: '1px 7px' }}>{on ? '●  ON' : '○  OFF'}</span>}
    />
  )
})

// ─── Fan Card ─────────────────────────────────────────────────────────────────

export const FanRtiCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh()
  const on = s.state === 'on'
  const pct = Number(s.attributes.percentage ?? 0)
  const presets: string[] = (s.attributes.preset_modes as string[]) ?? []
  const preset = String(s.attributes.preset_mode ?? '')
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const period = on ? (2.5 - pct / 100 * 2.1).toFixed(2) : '2'

  const toggle = useCallback(() => {
    callService('fan', on ? 'turn_off' : 'turn_on', {}, s.entity_id)
  }, [on, s.entity_id, callService])

  const setSpeed = useCallback((v: number) => {
    callService('fan', 'set_percentage', { percentage: v }, s.entity_id)
  }, [s.entity_id, callService])

  return (
    <div style={{
      ...cardSt(th, {
        padding: '12px 12px 10px', gap: 6, cursor: 'pointer', touchAction: 'manipulation',
        background: on ? 'rgba(48,209,88,0.05)' : th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
        boxShadow: on ? '0 4px 20px rgba(48,209,88,0.2)' : th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
        transition: 'background 0.4s, box-shadow 0.4s',
      })
    }} onClick={toggle}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: on ? '#30d158' : tc1(th), transition: 'color 0.3s' }}>{name}</span>
        {on && <span style={{ fontSize: 11, color: tc2(th), marginLeft: 6 }}>{t.speed} {pct}%</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
        <GlassIcon size={62} th={th}
          color={on ? 'rgba(48,209,88,0.16)' : undefined}
          glow={on ? 'rgba(48,209,88,0.50)' : undefined}>
          <span style={{
            fontSize: 36, display: 'inline-block',
            animation: on ? `spin ${period}s linear infinite` : 'none',
            filter: on ? 'drop-shadow(0 0 8px rgba(48,209,88,0.65))' : 'grayscale(1) opacity(0.3)',
            transition: 'filter 0.4s',
          }}>🌀</span>
        </GlassIcon>
      </div>
      <div onClick={e => e.stopPropagation()}>
        <FancySlider value={pct} min={0} max={100} color={on ? '#30d158' : '#555'} onChange={setSpeed} />
      </div>
      {presets.length > 0 && on && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
          {presets.map(p => (
            <button key={p} onClick={() => callService('fan', 'set_preset_mode', { preset_mode: p }, s.entity_id)}
              style={{ ...mkBtn(preset === p, false, th), padding: '5px 8px', fontSize: 11, flex: 'none', borderRadius: 8 }}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
