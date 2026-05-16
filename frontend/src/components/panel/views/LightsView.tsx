import React from 'react'
import type { HaState } from '../../../context/HaContext'
import { useMapped, useDashboard } from '../PanelContext'
import { CardGrid, EmptyState } from '../ui/CardGrid'
import { LightTile } from '../cards/LightCards'
import { FanRtiCard } from '../cards/SwitchCards'
import { renderCard, filterStates } from './renderCard'

export function LightsView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const mapped = useMapped()
  const dashboard = useDashboard()

  const dbCards = dashboard?.views?.lights
  if (dbCards !== undefined) {
    const rendered = dbCards.map(e => { const s = states.get(e.entity); return s ? renderCard(s, e.card_type, e.icon, e.label) : null }).filter(Boolean)
    return rendered.length ? <CardGrid cols={cols}>{rendered}</CardGrid> : <EmptyState icon="💡" cat="lights" />
  }

  const lights = filterStates(states, s => s.entity_id.startsWith('light.'), mapped)
  const fans   = filterStates(states, s => s.entity_id.startsWith('fan.'), mapped)
  if (!lights.length && !fans.length) return <EmptyState icon="💡" cat="lights" />
  return (
    <CardGrid cols={cols}>
      {lights.map(s => <LightTile key={s.entity_id} s={s} />)}
      {fans.map(s => <FanRtiCard key={s.entity_id} s={s} />)}
    </CardGrid>
  )
}
