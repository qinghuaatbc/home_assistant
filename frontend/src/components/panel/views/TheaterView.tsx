import React from 'react'
import type { HaState } from '../../../context/HaContext'
import { useMapped, useDashboard } from '../PanelContext'
import { CardGrid, EmptyState } from '../ui/CardGrid'
import { MediaRtiCard } from '../cards/MediaCards'
import { SwitchTile } from '../cards/SwitchCards'
import { renderCard, filterStates } from './renderCard'

export function TheaterView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const mapped = useMapped()
  const dashboard = useDashboard()

  const dbCards = dashboard?.views?.theater
  if (dbCards !== undefined) {
    const rendered = dbCards.map(e => { const s = states.get(e.entity); return s ? renderCard(s, e.card_type, e.icon, e.label) : null }).filter(Boolean)
    return rendered.length ? <CardGrid cols={cols}>{rendered}</CardGrid> : <EmptyState icon="🎬" cat="theater" />
  }

  const avr = filterStates(states, s => s.entity_id.startsWith('media_player.') && (s.entity_id.includes('avr') || s.entity_id.includes('receiver') || s.entity_id.includes('theater') || s.entity_id.includes('projector')), mapped)
  const players = avr.length ? avr : filterStates(states, s => s.entity_id.startsWith('media_player.'), mapped)
  const projectors = filterStates(states, s => s.entity_id.startsWith('switch.') && (s.entity_id.includes('tv') || s.entity_id.includes('projector') || s.entity_id.includes('screen')), mapped)
  if (!players.length && !projectors.length) return <EmptyState icon="🎬" cat="theater" />
  return <CardGrid cols={cols}>{projectors.map(s => <SwitchTile key={s.entity_id} s={s} icon="📺" />)}{players.map(s => <MediaRtiCard key={s.entity_id} s={s} />)}</CardGrid>
}
