import React from 'react'
import type { HaState } from '../../../context/HaContext'
import { useDashboard } from '../PanelContext'
import { EmptyState } from '../ui/CardGrid'
import { CameraRtiCard } from '../cards/CameraCard'
import { filterStates } from './renderCard'

export function CameraView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const dashboard = useDashboard()

  const dbEntities = dashboard?.views?.camera
    ?.filter(e => e.card_type === 'camera')
    .map(e => states.get(e.entity))
    .filter((s): s is HaState => !!s)

  const cameras = dbEntities ?? filterStates(states, s => s.entity_id.startsWith('camera.'))

  if (!cameras.length) return <EmptyState icon="📷" cat="camera" />

  const gridCols = Math.min(cols, cameras.length)
  const rows = Math.ceil(cameras.length / gridCols)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: 8,
      padding: 8,
      height: '100%',
      boxSizing: 'border-box',
    }}>
      {cameras.map(s => <CameraRtiCard key={s.entity_id} s={s} fill />)}
    </div>
  )
}
