import React from 'react'
import type { HaState } from '../../../context/HaContext'
import { useMapped, useDashboard } from '../PanelContext'
import { CardGrid, EmptyState } from '../ui/CardGrid'
import { AlarmCard, SensorRtiCard, LockTile, CurtainTile } from '../cards/SecurityCards'
import { CameraRtiCard } from '../cards/CameraCard'
import { SwitchTile } from '../cards/SwitchCards'
import { renderCard, filterStates } from './renderCard'

export function SecurityView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const mapped = useMapped()
  const dashboard = useDashboard()

  const dbCards = dashboard?.views?.security
  if (dbCards !== undefined) {
    const rendered = dbCards.map(e => { const s = states.get(e.entity); return s ? renderCard(s, e.card_type, e.icon) : null }).filter(Boolean)
    return rendered.length ? <CardGrid cols={cols}>{rendered}</CardGrid> : <EmptyState icon="🔒" cat="security" />
  }

  const alarms = filterStates(states, s => s.entity_id.startsWith('alarm_control_panel.'), mapped)
  const locks = filterStates(states, s => s.entity_id.startsWith('lock.'), mapped)
  const curtains = filterStates(states, s => s.entity_id.startsWith('binary_sensor.') && ['curtain', 'blind'].includes(String(s.attributes.device_class ?? '')), mapped)
  const sensors = filterStates(states, s => s.entity_id.startsWith('binary_sensor.') && ['door', 'window', 'motion', 'garage_door'].includes(String(s.attributes.device_class ?? '')), mapped)
  const cameras = filterStates(states, s => s.entity_id.startsWith('camera.'), mapped)
  const alarmSwitches = filterStates(states, s => s.entity_id.startsWith('switch.') && (s.entity_id.includes('alarm') || s.entity_id.includes('siren')), mapped)
  if (!alarms.length && !locks.length && !curtains.length && !sensors.length && !cameras.length && !alarmSwitches.length) return <EmptyState icon="🔒" cat="security" />
  return (
    <CardGrid cols={cols}>
      {alarms.map(s => <AlarmCard key={s.entity_id} s={s} />)}
      {alarmSwitches.map(s => <SwitchTile key={s.entity_id} s={s} icon={s.entity_id.includes('siren') ? '🚨' : '🔒'} />)}
      {locks.map(s => <LockTile key={s.entity_id} s={s} />)}
      {curtains.map(s => <CurtainTile key={s.entity_id} s={s} />)}
      {cameras.map(s => <CameraRtiCard key={s.entity_id} s={s} />)}
      {sensors.map(s => <SensorRtiCard key={s.entity_id} s={s} />)}
    </CardGrid>
  )
}
