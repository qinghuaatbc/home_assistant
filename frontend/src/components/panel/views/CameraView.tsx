import React from 'react'
import type { HaState } from '../../../context/HaContext'
import { useDashboard } from '../PanelContext'
import { CardGrid, EmptyState } from '../ui/CardGrid'
import { CameraRtiCard } from '../cards/CameraCard'
import { renderCard, filterStates } from './renderCard'

export function CameraView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const dashboard = useDashboard()

  const dbCards = dashboard?.views?.camera
  if (dbCards !== undefined) {
    const rendered = dbCards.map(e => { const s = states.get(e.entity); return s ? renderCard(s, e.card_type, e.icon, e.label) : null }).filter(Boolean)
    return rendered.length ? <CardGrid cols={cols}>{rendered}</CardGrid> : <EmptyState icon="📷" cat="camera" />
  }

  const cameras = filterStates(states, s => s.entity_id.startsWith('camera.'))
  if (!cameras.length) return <EmptyState icon="📷" cat="camera" />
  return (
    <CardGrid cols={cols}>
      {cameras.map(s => <CameraRtiCard key={s.entity_id} s={s} />)}
    </CardGrid>
  )
}
