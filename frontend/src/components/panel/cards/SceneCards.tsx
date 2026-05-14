import { useState, useCallback, memo } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useRestCall, cardSt, mkBtn, tc1, tc2 } from '../PanelContext'
import { GlassIcon, IconTile } from '../ui/IconTile'

// ─── Scene Card ───────────────────────────────────────────────────────────────

export const SceneRtiCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const icon = String(s.attributes.icon ?? '🎭')
  const entityCount = Number(s.attributes.entity_count ?? 0)
  const lastActivated = s.attributes.last_activated as string | null
  const [pressed, setPressed] = useState(false)

  const activate = useCallback(() => {
    callService('scene', 'turn_on', {}, s.entity_id)
    setPressed(true)
    setTimeout(() => setPressed(false), 800)
  }, [s.entity_id, callService])

  return (
    <div style={{
      ...cardSt(th, {
        padding: '14px 12px', gap: 8, cursor: 'pointer', touchAction: 'manipulation',
        alignItems: 'center', justifyContent: 'center',
        background: pressed ? 'rgba(255,214,10,0.12)' : th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
        boxShadow: pressed ? '0 4px 24px rgba(255,214,10,0.35)' : th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
        transition: 'background 0.3s, box-shadow 0.3s',
        transform: pressed ? 'scale(0.96)' : 'scale(1)',
      })
    }} onClick={activate}>
      <GlassIcon size={56} th={th}
        color={pressed ? 'rgba(255,214,10,0.20)' : undefined}
        glow={pressed ? 'rgba(255,214,10,0.70)' : undefined}>
        <span style={{ filter: pressed ? 'drop-shadow(0 0 10px rgba(255,214,10,0.95))' : 'none', transition: 'filter 0.3s' }}>{icon}</span>
      </GlassIcon>
      <span style={{ fontSize: 13, fontWeight: 700, color: tc1(th), textAlign: 'center' }}>{name}</span>
      {entityCount > 0 && <span style={{ fontSize: 11, color: tc2(th) }}>{entityCount} entities</span>}
      <button style={{ ...mkBtn(pressed, false, th), width: '100%', padding: '9px 0' }}>{t.activate}</button>
      {lastActivated && (
        <span style={{ fontSize: 10, color: tc2(th) }}>{new Date(lastActivated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      )}
    </div>
  )
})

// ─── Scene Tile ───────────────────────────────────────────────────────────────

export const SceneTile = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const icon = String(s.attributes.icon ?? '🎭')
  const [pressed, setPressed] = useState(false)

  const activate = useCallback(() => {
    callService('scene', 'turn_on', {}, s.entity_id)
    setPressed(true)
    setTimeout(() => setPressed(false), 700)
  }, [s.entity_id, callService])

  return (
    <IconTile
      icon={<span style={{ fontSize: 34, filter: pressed ? 'drop-shadow(0 0 10px rgba(255,214,10,0.9))' : 'none', transform: pressed ? 'scale(1.18)' : 'scale(1)', transition: 'all 0.22s', display: 'inline-block' }}>{icon}</span>}
      name={name}
      active={pressed}
      th={th}
      glowColor={pressed ? 'rgb(255,214,10)' : undefined}
      onClick={activate}
      sub={<span style={{ fontSize: 10, color: pressed ? 'rgb(255,214,10)' : tc2(th), fontWeight: 600 }}>{pressed ? '✦ Active' : 'Scene'}</span>}
    />
  )
})

// ─── Automation Card ──────────────────────────────────────────────────────────

export const AutomationRtiCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const t = useT(); const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const enabled = s.state === 'on'
  const lastTriggered = s.attributes.last_triggered as string | null
  const [triggered, setTriggered] = useState(false)

  const trigger = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    callService('automation', 'trigger', {}, s.entity_id)
    setTriggered(true)
    setTimeout(() => setTriggered(false), 1200)
  }, [s.entity_id, callService])

  const toggleEnabled = useCallback(() => {
    callService('automation', enabled ? 'turn_off' : 'turn_on', {}, s.entity_id)
  }, [enabled, s.entity_id, callService])

  return (
    <div style={{
      ...cardSt(th, {
        padding: '12px 12px 10px', gap: 8, touchAction: 'manipulation',
        borderLeft: `3px solid ${enabled ? '#ff9f0a' : 'transparent'}`,
        background: triggered ? 'rgba(255,159,10,0.1)' : th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)',
        boxShadow: triggered ? '0 4px 24px rgba(255,159,10,0.3)' : th === 'day' ? '0 2px 10px rgba(0,0,0,0.07)' : 'none',
        transition: 'background 0.3s, box-shadow 0.3s, border-color 0.3s',
      })
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={toggleEnabled}>
        <GlassIcon size={30} th={th} color={enabled ? 'rgba(255,159,10,0.18)' : undefined} glow={enabled ? 'rgba(255,159,10,0.50)' : undefined}>
          <span style={{ fontSize: 16, filter: enabled ? 'drop-shadow(0 0 5px rgba(255,159,10,0.8))' : 'grayscale(1) opacity(0.4)', transition: 'filter 0.3s' }}>⚡</span>
        </GlassIcon>
        <span style={{ fontSize: 13, fontWeight: 700, color: enabled ? '#ff9f0a' : tc2(th), flex: 1, transition: 'color 0.3s' }}>{name}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: enabled ? '#ff9f0a' : tc2(th), background: enabled ? 'rgba(255,159,10,0.15)' : 'rgba(128,128,128,0.1)', borderRadius: 6, padding: '2px 7px' }}>
          {enabled ? t.on : t.off}
        </span>
      </div>
      {lastTriggered && (
        <span style={{ fontSize: 10, color: tc2(th), marginLeft: 28 }}>
          {new Date(lastTriggered).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
      <button onClick={trigger} style={{
        ...mkBtn(triggered, false, th),
        padding: '9px 0', width: '100%',
        background: triggered ? 'rgba(255,159,10,0.3)' : undefined,
        color: triggered ? '#ff9f0a' : undefined,
      }}>{t.trigger}</button>
    </div>
  )
})

// ─── Automation Tile ──────────────────────────────────────────────────────────

export const AutomationTile = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const enabled = s.state === 'on'
  const [triggered, setTriggered] = useState(false)

  const toggleEnabled = useCallback(() => {
    callService('automation', enabled ? 'turn_off' : 'turn_on', {}, s.entity_id)
  }, [enabled, s.entity_id, callService])

  const trigger = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    callService('automation', 'trigger', {}, s.entity_id)
    setTriggered(true)
    setTimeout(() => setTriggered(false), 1200)
  }, [s.entity_id, callService])

  return (
    <div style={{ position: 'relative' }}>
      <IconTile
        icon={<span style={{ fontSize: 30, filter: enabled ? (triggered ? 'drop-shadow(0 0 10px rgba(255,159,10,0.9))' : 'none') : 'grayscale(1) opacity(0.35)', transition: 'filter 0.3s' }}>⚡</span>}
        name={name}
        active={enabled}
        th={th}
        glowColor={enabled ? (triggered ? 'rgb(255,159,10)' : 'rgb(255,159,10)') : undefined}
        onClick={toggleEnabled}
        sub={
          <button onClick={trigger} style={{
            fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer', borderRadius: 7,
            padding: '2px 10px', fontFamily: 'inherit', transition: 'all 0.2s',
            background: triggered ? 'rgba(255,159,10,0.30)' : 'rgba(255,159,10,0.12)',
            color: triggered ? 'rgb(255,159,10)' : tc2(th),
          }}>▶ Run</button>
        }
      />
    </div>
  )
})
