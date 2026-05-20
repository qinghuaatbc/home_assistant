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
    // Thermostat (Nest) cards first, then sensors
    const sorted = [...dbCards].sort((a, b) =>
      a.card_type === 'thermostat' ? -1 : b.card_type === 'thermostat' ? 1 : 0
    )
    const rendered = sorted.map(e => { const s = states.get(e.entity); return s ? renderCard(s, e.card_type, e.icon, e.label) : null }).filter(Boolean)
    return rendered.length ? <CardGrid cols={cols}>{rendered}</CardGrid> : <EmptyState icon="🌡️" cat="climate" />
  }

  // climate entities are never in 3D mappings — don't filter by mapped
  const sensors = filterStates(states, s => s.entity_id.startsWith('sensor.') && ['temperature', 'humidity', 'carbon_dioxide'].includes(String(s.attributes.device_class ?? '')))
  const thermostats = filterStates(states, s => s.entity_id.startsWith('climate.'))
  if (!sensors.length && !thermostats.length) return <EmptyState icon="🌡️" cat="climate" />
  return (
    <CardGrid cols={cols}>
      {thermostats.map(s => <ThermostatCard key={s.entity_id} s={s} />)}
      {sensors.map(s => <ClimateRtiCard key={s.entity_id} s={s} />)}
    </CardGrid>
  )
}
