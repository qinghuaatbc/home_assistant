import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useHa } from '../context/HaContext'
import ShortcutBar from '../components/ShortcutBar'
import WeatherCard from '../components/cards/WeatherCard'
import CameraCard from '../components/cards/CameraCard'
import LightCard from '../components/cards/LightCard'
import SwitchCard from '../components/cards/SwitchCard'
import SensorCard from '../components/cards/SensorCard'
import MediaPlayerCard from '../components/cards/MediaPlayerCard'

const DOMAIN_META: Record<string, { label: string; icon: string }> = {
  light:         { label: 'Lights',         icon: '💡' },
  switch:        { label: 'Switches',        icon: '🔌' },
  binary_sensor: { label: 'Sensors',         icon: '🔍' },
  sensor:        { label: 'Sensors',         icon: '📊' },
  weather:       { label: 'Weather',         icon: '🌤️' },
  media_player:  { label: 'Media',           icon: '🎵' },
  camera:        { label: 'Cameras',         icon: '📷' },
  automation:    { label: 'Automations',     icon: '⚡' },
}

const ORDER_KEY = 'ha_section_order'
function loadOrder(): string[] {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]') } catch { return [] }
}

function usePinned() {
  const [pinned] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ha_pinned') || '[]')) } catch { return new Set<string>() }
  })
  return pinned
}

interface SunData { rise: string; set: string; elevation: number; isAboveHorizon: boolean }

function SunWidget({ token }: { token: string }) {
  const [sun, setSun] = useState<SunData | null>(null)
  useEffect(() => {
    fetch('/api/sun', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setSun).catch(() => {})
  }, [token])
  if (!sun) return null
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const above = sun.isAboveHorizon
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 12px', background: 'var(--card)', borderRadius: 10, margin: '0 0 8px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 24 }}>{above ? '☀️' : '🌙'}</span>
      <div style={{ fontSize: 12, color: 'var(--text2)' }}>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{above ? 'Sun is up' : 'Below horizon'}</span>
        <span style={{ marginLeft: 6 }}>{sun.elevation > 0 ? '+' : ''}{sun.elevation}°</span>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
        <span>🌅 <b>{fmt(sun.rise)}</b></span>
        <span>🌇 <b>{fmt(sun.set)}</b></span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { token, states, wsConnected, health } = useHa()
  const [mappingCount, setMappingCount] = useState(0)
  useEffect(() => {
    if (!token) return
    fetch('/api/config/3d-mappings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((d: any) => setMappingCount(Object.keys(d).filter(k => k !== 'mappings').length)).catch(() => {})
  }, [token])

  const pinned = usePinned()
  const [areas, setAreas] = useState<{ area_id: string; name: string }[]>([])
  const [entityAreas, setEntityAreas] = useState<Map<string, string>>(new Map())
  const [disabledEntities, setDisabledEntities] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [platforms, setPlatforms] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!token) return
    fetch('/api/area_registry', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((data: any) => { if (Array.isArray(data)) setAreas(data) }).catch(() => {})
    fetch('/api/entity_registry', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((data: any) => {
        if (!Array.isArray(data)) return
        const areaMap = new Map<string, string>()
        const disabled = new Set<string>()
        const platformMap = new Map<string, string>()
        data.forEach((e: any) => {
          if (e.area_id) areaMap.set(e.entity_id, e.area_id)
          if (e.disabled) disabled.add(e.entity_id)
          platformMap.set(e.entity_id, e.platform)
        })
        setEntityAreas(areaMap)
        setDisabledEntities(disabled)
        setPlatforms(platformMap)
      }).catch(() => {}).finally(() => setLoading(false))
  }, [token])

  const totalOn = useMemo(() => {
    let n = 0
    for (const s of states.values()) if (s.state === 'on') n++
    return n
  }, [states])

  const byArea = useMemo(() => {
    const unassigned: Record<string, unknown[]> = {}
    const grouped: Record<string, Record<string, unknown[]>> = {}
    for (const s of states.values()) {
      if (disabledEntities.has(s.entity_id)) continue
      const areaId = entityAreas.get(s.entity_id)
      const domain = s.entity_id.split('.')[0]
      if (areaId) {
        if (!grouped[areaId]) grouped[areaId] = {}
        if (!grouped[areaId][domain]) grouped[areaId][domain] = []
        grouped[areaId][domain].push(s)
      } else {
        if (!unassigned[domain]) unassigned[domain] = []
        unassigned[domain].push(s)
      }
    }
    return { grouped, unassigned }
  }, [states, entityAreas, disabledEntities])

  // ─── Section ordering ─────────────────────────────────────────────────────

  // Canonical section ids: 'pinned', area_ids, 'other'
  const allSectionIds = useMemo(() => {
    const ids: string[] = []
    if (pinned.size > 0) ids.push('pinned')
    areas.forEach(a => {
      if (byArea.grouped[a.area_id] && Object.keys(byArea.grouped[a.area_id]).length > 0)
        ids.push(a.area_id)
    })
    if (Object.keys(byArea.unassigned).length > 0) ids.push('other')
    return ids
  }, [pinned, areas, byArea])

  const [sectionOrder, setSectionOrder] = useState<string[]>(loadOrder)

  const orderedIds = useMemo(() => {
    const saved = sectionOrder.filter(id => allSectionIds.includes(id))
    const missing = allSectionIds.filter(id => !saved.includes(id))
    return [...saved, ...missing]
  }, [sectionOrder, allSectionIds])

  function saveOrder(order: string[]) {
    setSectionOrder(order)
    localStorage.setItem(ORDER_KEY, JSON.stringify(order))
  }

  // ─── Drag state ────────────────────────────────────────────────────────────

  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const onDragStart = useCallback((id: string, e: React.DragEvent) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }, [])

  const onDragOver = useCallback((id: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }, [])

  const onDrop = useCallback((targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const next = [...orderedIds]
    const from = next.indexOf(dragId)
    const to = next.indexOf(targetId)
    if (from === -1 || to === -1) { setDragId(null); setDragOverId(null); return }
    next.splice(from, 1)
    next.splice(to, 0, dragId)
    saveOrder(next)
    setDragId(null)
    setDragOverId(null)
  }, [dragId, orderedIds])

  const onDragEnd = useCallback(() => {
    setDragId(null)
    setDragOverId(null)
  }, [])

  // ─── Touch drag ────────────────────────────────────────────────────────────

  const touchDragId = useRef<string | null>(null)
  const touchScrollTop = useRef(0)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())

  function onTouchStart(id: string, e: React.TouchEvent) {
    touchDragId.current = id
    touchScrollTop.current = e.currentTarget.closest('.page')?.scrollTop ?? 0
    setDragId(id)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchDragId.current) return
    const touch = e.touches[0]
    for (const [id, el] of sectionRefs.current) {
      if (id === touchDragId.current) continue
      const rect = el.getBoundingClientRect()
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        setDragOverId(id)
        return
      }
    }
    setDragOverId(null)
  }

  function onTouchEnd() {
    if (touchDragId.current && dragOverId) {
      onDrop(dragOverId)
    }
    touchDragId.current = null
    setDragId(null)
    setDragOverId(null)
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderEntities = (entities: any[]) => {
    const first = entities[0]
    if (!first) return null
    const domain = first.entity_id.split('.')[0]
    const sorted = [...entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id))
    const tag = (s: any) => {
      const plat = platforms.get(s.entity_id) || ''
      if (plat && plat !== domain)
        return { ...s, attributes: { ...s.attributes, friendly_name: `${plat} · ${s.attributes?.friendly_name || s.entity_id}` } }
      return s
    }
    if (domain === 'weather') return sorted.map(s => <WeatherCard key={s.entity_id} state={tag(s)} />)
    if (domain === 'camera') return <div className="card-grid">{sorted.map(s => <CameraCard key={s.entity_id} state={tag(s)} />)}</div>
    if (domain === 'media_player') return sorted.map(s => <MediaPlayerCard key={s.entity_id} state={tag(s)} />)
    if (domain === 'light') return <div className="card-grid">{sorted.map(s => <LightCard key={s.entity_id} state={tag(s)} />)}</div>
    if (domain === 'switch') return <div className="card-grid">{sorted.map(s => <SwitchCard key={s.entity_id} state={tag(s)} />)}</div>
    if (domain === 'binary_sensor') return <div className="card-grid">{sorted.map(s => <SensorCard key={s.entity_id} state={tag(s)} binary />)}</div>
    if (domain === 'sensor') return <div className="card-grid">{sorted.map(s => <SensorCard key={s.entity_id} state={tag(s)} />)}</div>
    return <div className="ios-list">{sorted.map(s => (
      <div className="ios-list-row" key={s.entity_id}>
        <div className="ios-list-content">
          <div className="ios-list-title">{s.entity_id}</div>
          <div className="ios-list-subtitle">{s.state}</div>
        </div>
      </div>
    ))}</div>
  }

  const renderSection = (id: string) => {
    if (id === 'pinned') {
      const pinnedEntities = Array.from(states.values()).filter(s => pinned.has(s.entity_id))
      if (pinnedEntities.length === 0) return null
      return (
        <div key="pinned" style={{ marginTop: 16 }}>
          <div className="section-title">⭐ Pinned</div>
          {renderEntities(pinnedEntities)}
        </div>
      )
    }
    if (id === 'other') {
      if (Object.keys(byArea.unassigned).length === 0) return null
      return (
        <div key="other" style={{ marginTop: 20 }}>
          <div className="section-title" style={{ color: 'var(--text2)' }}>📦 Other</div>
          {Object.entries(byArea.unassigned).map(([domain, entities]) => (
            <div key={domain}>
              <div style={{ fontSize: 11, color: 'var(--text2)', margin: '8px 0 4px', paddingLeft: 4 }}>
                {DOMAIN_META[domain]?.icon} {DOMAIN_META[domain]?.label || domain}
              </div>
              {renderEntities(entities as any[])}
            </div>
          ))}
        </div>
      )
    }
    // area section
    const area = areas.find(a => a.area_id === id)
    if (!area) return null
    const domains = byArea.grouped[area.area_id]
    if (!domains || Object.keys(domains).length === 0) return null
    return (
      <div key={id} style={{ marginTop: 20 }}>
        <div className="section-title">🏠 {area.name}</div>
        {Object.entries(domains).map(([domain, entities]) => (
          <div key={domain}>
            <div style={{ fontSize: 11, color: 'var(--text2)', margin: '8px 0 4px', paddingLeft: 4 }}>
              {DOMAIN_META[domain]?.icon} {DOMAIN_META[domain]?.label || domain}
            </div>
            {renderEntities(entities as any[])}
          </div>
        ))}
      </div>
    )
  }

  const sectionLabel = (id: string) => {
    if (id === 'pinned') return '⭐ Pinned'
    if (id === 'other') return '📦 Other'
    return '🏠 ' + (areas.find(a => a.area_id === id)?.name ?? id)
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="nav-title">Home</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              {health && (
                <span className={`ws-dot ${health.status === 'ok' ? 'connected' : ''}`}
                  title={`Server: ${health.status} · up ${Math.round(health.uptime / 60)}m`} style={{ position: 'static' }} />
              )}
              <span className={`ws-dot ${wsConnected ? 'connected' : ''}`}
                title={wsConnected ? 'Live' : 'Connecting…'} style={{ position: 'static' }} />
            </div>
          </div>
        </div>

        {loading && (
          <div className="section" style={{ marginTop: 12 }}>
            {[1,2,3].map(i => (
              <div key={i} className="ios-list-row" style={{ opacity: 0.4 }}>
                <div className="ios-list-content"><div className="ios-list-title" style={{ background: 'var(--border)', height: 14, width: '60%', borderRadius: 4 }} /></div>
              </div>
            ))}
          </div>
        )}

        <ShortcutBar />
        {token && <SunWidget token={token} />}

        <div className="section" style={{ marginTop: 12 }}>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--blue)' }}>{states.size}</div>
              <div className="stat-label">Devices</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--green)' }}>{totalOn}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--orange)' }}>{areas.length}</div>
              <div className="stat-label">Areas</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--purple)' }}>{mappingCount}</div>
              <div className="stat-label">3D Bound</div>
            </div>
          </div>
        </div>

        {!wsConnected && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', color: '#ff453a', fontSize: 13, textAlign: 'center' }}>
            ⚠️ WebSocket disconnected — changes won't update live
          </div>
        )}

        {states.size === 0 && wsConnected && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '4rem 2rem', fontSize: 14 }}>
            No devices found. Check your integration configuration.
          </div>
        )}

        {/* Draggable sections */}
        {orderedIds.map(id => {
          const isDragging = dragId === id
          const isOver = dragOverId === id

          return (
            <div
              key={id}
              ref={el => { if (el) sectionRefs.current.set(id, el); else sectionRefs.current.delete(id) }}
              draggable
              onDragStart={e => onDragStart(id, e)}
              onDragOver={e => onDragOver(id, e)}
              onDrop={() => onDrop(id)}
              onDragEnd={onDragEnd}
              style={{
                opacity: isDragging ? 0.35 : 1,
                borderTop: isOver && !isDragging ? '2px solid var(--accent, #4d8fff)' : '2px solid transparent',
                borderRadius: 6,
                transition: 'opacity 0.15s, border-color 0.1s',
                cursor: 'grab',
                touchAction: 'none',
              }}
              onTouchStart={e => onTouchStart(id, e)}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {/* Drag handle strip shown on long-press or hover */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                paddingLeft: 2, paddingTop: isDragging ? 0 : undefined,
                userSelect: 'none',
              }}>
                <span style={{ fontSize: 14, color: 'var(--text2)', opacity: 0.5, letterSpacing: '-1px', cursor: 'grab' }}>⣿</span>
                {isDragging && (
                  <span style={{ fontSize: 12, color: 'var(--accent, #4d8fff)', fontWeight: 600 }}>
                    {sectionLabel(id)}
                  </span>
                )}
              </div>
              <div className="section">
                {renderSection(id)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
