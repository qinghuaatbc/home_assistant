import React from 'react'
import type { HaState } from '../../../context/HaContext'
import { useMapped, useDashboard } from '../PanelContext'
import { CardGrid, EmptyState } from '../ui/CardGrid'
import { GarageCoverCard } from '../cards/GarageCards'
import { SwitchTile } from '../cards/SwitchCards'
import { SensorRtiCard } from '../cards/SecurityCards'
import { renderCard, filterStates } from './renderCard'

export function GarageView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const mapped = useMapped()
  const dashboard = useDashboard()

  const dbCards = dashboard?.views?.garage
  if (dbCards !== undefined) {
    const rendered = dbCards.map(e => { const s = states.get(e.entity); return s ? renderCard(s, e.card_type, e.icon) : null }).filter(Boolean)
    return rendered.length ? <CardGrid cols={cols}>{rendered}</CardGrid> : <EmptyState icon="🚗" cat="garage" />
  }

  const covers   = filterStates(states, s => s.entity_id.startsWith('cover.') && (s.entity_id.includes('garage') || String(s.attributes.device_class ?? '').includes('garage')), mapped)
  const switches = filterStates(states, s => s.entity_id.startsWith('switch.') && (s.entity_id.includes('garage') || s.entity_id.includes('gate')), mapped)
  const sensors  = filterStates(states, s => s.entity_id.startsWith('binary_sensor.') && (s.entity_id.includes('garage') || String(s.attributes.device_class ?? '').includes('garage')), mapped)
  if (!covers.length && !switches.length && !sensors.length) return <EmptyState icon="🚗" cat="garage" />
  return (
    <CardGrid cols={cols}>
      {covers.map(s => <GarageCoverCard key={s.entity_id} s={s} />)}
      {switches.map(s => <SwitchTile key={s.entity_id} s={s} icon="🚗" />)}
      {sensors.map(s => <SensorRtiCard key={s.entity_id} s={s} />)}
    </CardGrid>
  )
}
