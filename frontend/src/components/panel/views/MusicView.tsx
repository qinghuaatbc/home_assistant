import React from 'react'
import type { HaState } from '../../../context/HaContext'
import { useMapped, useDashboard } from '../PanelContext'
import { CardGrid, EmptyState } from '../ui/CardGrid'
import { MediaRtiCard } from '../cards/MediaCards'
import { renderCard, filterStates } from './renderCard'

export function MusicView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const mapped = useMapped()
  const dashboard = useDashboard()
  const effectiveMapped = dashboard ? null : mapped

  const dbCards = dashboard?.views?.music
  if (dbCards !== undefined) {
    const rendered = dbCards.map(e => { const s = states.get(e.entity); return s ? renderCard(s, e.card_type, e.icon, e.label) : null }).filter(Boolean)
    return rendered.length ? <CardGrid cols={cols}>{rendered}</CardGrid> : <EmptyState icon="🎵" cat="music" />
  }

  const players = filterStates(states, s => s.entity_id.startsWith('media_player.'), effectiveMapped)
  if (!players.length) return <EmptyState icon="🎵" cat="music" />
  return <CardGrid cols={cols}>{players.map(s => <MediaRtiCard key={s.entity_id} s={s} />)}</CardGrid>
}
