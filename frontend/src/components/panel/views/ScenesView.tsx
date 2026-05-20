import React from 'react'
import type { HaState } from '../../../context/HaContext'
import { useMapped, useDashboard } from '../PanelContext'
import { CardGrid, EmptyState } from '../ui/CardGrid'
import { SceneTile, AutomationTile } from '../cards/SceneCards'
import { renderCard, filterStates } from './renderCard'

export function ScenesView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const mapped = useMapped()
  const dashboard = useDashboard()
  const effectiveMapped = dashboard ? null : mapped

  const dbCards = dashboard?.views?.scenes
  if (dbCards !== undefined) {
    const rendered = dbCards.map(e => { const s = states.get(e.entity); return s ? renderCard(s, e.card_type, e.icon, e.label) : null }).filter(Boolean)
    return rendered.length ? <CardGrid cols={cols}>{rendered}</CardGrid> : <EmptyState icon="🎭" cat="scenes" />
  }

  const scenes     = filterStates(states, s => s.entity_id.startsWith('scene.'), effectiveMapped)
  const automations = filterStates(states, s => s.entity_id.startsWith('automation.'), effectiveMapped)
  if (!scenes.length && !automations.length) return <EmptyState icon="🎭" cat="scenes" />
  return (
    <CardGrid cols={cols}>
      {scenes.map(s => <SceneTile key={s.entity_id} s={s} />)}
      {automations.map(s => <AutomationTile key={s.entity_id} s={s} />)}
    </CardGrid>
  )
}
