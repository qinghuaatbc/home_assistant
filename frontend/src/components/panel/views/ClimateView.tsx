import React from 'react'
import type { HaState } from '../../../context/HaContext'
import { useMapped, useDashboard } from '../PanelContext'
import { CardGrid, EmptyState } from '../ui/CardGrid'
import { ClimateRtiCard, ThermostatCard } from '../cards/ClimateCards'
import { renderCard, filterStates } from './renderCard'

export function ClimateView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const mapped = useMapped()
  const dashboard = useDashboard()

  const dbCards = dashboard?.views?.climate
  if (dbCards !== undefined) {
    const rendered = dbCards.map(e => { const s = states.get(e.entity); return s ? renderCard(s, e.card_type, e.icon) : null }).filter(Boolean)
    return rendered.length ? <CardGrid cols={cols}>{rendered}</CardGrid> : <EmptyState icon="🌡️" cat="climate" />
  }

  const sensors = filterStates(states, s => s.entity_id.startsWith('sensor.') && ['temperature', 'humidity', 'carbon_dioxide'].includes(String(s.attributes.device_class ?? '')), mapped)
  const thermostats = filterStates(states, s => s.entity_id.startsWith('climate.'), mapped)
  if (!sensors.length && !thermostats.length) return <EmptyState icon="🌡️" cat="climate" />
  return (
    <CardGrid cols={cols}>
      {sensors.map(s => <ClimateRtiCard key={s.entity_id} s={s} />)}
      {thermostats.map(s => <ThermostatCard key={s.entity_id} s={s} />)}
    </CardGrid>
  )
}
