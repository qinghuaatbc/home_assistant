import { useState, useEffect, useCallback, useMemo } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useHa } from '../../../context/HaContext'
import { useMapped, useDashboard, useTh, useRestCall, tc2 } from '../PanelContext'
import { CardGrid, EmptyState } from '../ui/CardGrid'
import { LightTile } from '../cards/LightCards'
import { FanRtiCard } from '../cards/SwitchCards'
import { renderCard, filterStates } from './renderCard'

// ─── Area-grouped section header ──────────────────────────────────────────────

function AreaHeader({ label, count, allOn, onAllOff, onAllOn }: {
  label: string; count: number; allOn: boolean
  onAllOff: () => void; onAllOn: () => void
}) {
  const th = useTh()
  return (
    <div style={{
      gridColumn: '1 / -1',
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 2px 2px',
      borderBottom: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
      marginBottom: 2,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: tc2(th), flex: 1, letterSpacing: 0.3 }}>
        {label} <span style={{ fontWeight: 400, opacity: 0.6 }}>({count})</span>
      </span>
      <button onClick={onAllOn} style={{
        fontSize: 10, padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600,
        background: 'rgba(255,230,80,0.18)', color: '#d4880a',
      }}>全开</button>
      <button onClick={onAllOff} style={{
        fontSize: 10, padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600,
        background: th === 'day' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)', color: tc2(th),
      }}>全关</button>
    </div>
  )
}

// ─── Lights View ──────────────────────────────────────────────────────────────

export function LightsView({ states, cols }: { states: Map<string, HaState>; cols: number }) {
  const mapped    = useMapped()
  const dashboard = useDashboard()
  const { token } = useHa()
  const callService = useRestCall()
  const th = useTh()

  const [entityArea, setEntityArea] = useState<Map<string, string>>(new Map())
  const [areaNames, setAreaNames]   = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!token) return
    const cached = sessionStorage.getItem('ha_area_data')
    if (cached) {
      try {
        const { ea, names } = JSON.parse(cached)
        setEntityArea(new Map(ea))
        setAreaNames(new Map(names))
        return
      } catch {}
    }
    Promise.all([
      fetch('/api/entity_registry', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []),
      fetch('/api/area_registry',   { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []),
    ]).then(([entities, areas]: [any[], any[]]) => {
      const names = new Map<string, string>()
      areas.forEach((a: any) => names.set(a.area_id, a.name))
      const ea = new Map<string, string>()
      entities.forEach((e: any) => { if (e.area_id) ea.set(e.entity_id, e.area_id) })
      setEntityArea(ea)
      setAreaNames(names)
      sessionStorage.setItem('ha_area_data', JSON.stringify({ ea: [...ea], names: [...names] }))
    }).catch(() => {})
  }, [token])

  // All hooks before any conditional returns
  const allOff = useCallback((entityIds: string[]) => {
    entityIds.forEach(id => callService('light', 'turn_off', {}, id))
  }, [callService])

  const allOn = useCallback((entityIds: string[]) => {
    entityIds.forEach(id => callService('light', 'turn_on', {}, id))
  }, [callService])

  const lights = filterStates(states, s => s.entity_id.startsWith('light.'), mapped)
  const fans   = filterStates(states, s => s.entity_id.startsWith('fan.'),   mapped)
  const anyOn  = lights.some(s => s.state === 'on')
  const hasAreas = areaNames.size > 0

  const groups = useMemo<{ areaId: string; areaName: string; lights: HaState[] }[]>(() => {
    if (!hasAreas) return []
    const map = new Map<string, HaState[]>()
    lights.forEach(s => {
      const aId = entityArea.get(s.entity_id) ?? '__none__'
      if (!map.has(aId)) map.set(aId, [])
      map.get(aId)!.push(s)
    })
    const result: { areaId: string; areaName: string; lights: HaState[] }[] = []
    map.forEach((ls, aId) => {
      result.push({ areaId: aId, areaName: areaNames.get(aId) ?? '其他', lights: ls })
    })
    return result.sort((a, b) => {
      if (a.areaId === '__none__') return 1
      if (b.areaId === '__none__') return -1
      return a.areaName.localeCompare(b.areaName)
    })
  }, [lights, entityArea, areaNames, hasAreas])

  // Conditional returns after all hooks
  if (dashboard?.views?.lights !== undefined) {
    const dbCards = dashboard.views.lights
    const rendered = dbCards.map(e => { const s = states.get(e.entity); return s ? renderCard(s, e.card_type, e.icon, e.label) : null }).filter(Boolean)
    return rendered.length ? <CardGrid cols={cols}>{rendered}</CardGrid> : <EmptyState icon="💡" cat="lights" />
  }

  if (!lights.length && !fans.length) return <EmptyState icon="💡" cat="lights" />

  return (
    <div>
      {/* Global all-off / all-on toolbar */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 10px 0', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: tc2(th), flex: 1 }}>
          {lights.length} 盏灯{lights.filter(s => s.state === 'on').length > 0 ? ` · ${lights.filter(s => s.state === 'on').length} 开启` : ''}
        </span>
        <button onClick={() => allOn(lights.map(s => s.entity_id))} style={{
          fontSize: 11, padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700,
          background: 'rgba(255,200,50,0.20)', color: '#d4880a',
        }}>全开</button>
        <button onClick={() => allOff(lights.map(s => s.entity_id))} style={{
          fontSize: 11, padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700,
          background: th === 'day' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)', color: tc2(th),
          opacity: anyOn ? 1 : 0.4,
        }}>全关</button>
      </div>

      {/* Area-grouped or flat grid */}
      {hasAreas && groups.length > 1 ? (
        groups.map(g => (
          <div key={g.areaId}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8, padding: '8px 8px 0', alignContent: 'start' }}>
              <AreaHeader
                label={g.areaName} count={g.lights.length}
                allOn={g.lights.some(s => s.state === 'off')}
                onAllOff={() => allOff(g.lights.map(s => s.entity_id))}
                onAllOn={() => allOn(g.lights.map(s => s.entity_id))}
              />
              {g.lights.map(s => <LightTile key={s.entity_id} s={s} />)}
            </div>
          </div>
        ))
      ) : (
        <CardGrid cols={cols}>
          {lights.map(s => <LightTile key={s.entity_id} s={s} />)}
          {fans.map(s => <FanRtiCard key={s.entity_id} s={s} />)}
        </CardGrid>
      )}
    </div>
  )
}
