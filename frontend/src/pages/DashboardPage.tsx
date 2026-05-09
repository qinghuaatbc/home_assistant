import { useMemo, useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'
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

export default function DashboardPage() {
  const { token, states, wsConnected, health } = useHa()
  const [areas, setAreas] = useState<{ area_id: string; name: string }[]>([])
  const [entityAreas, setEntityAreas] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!token) return
    fetch('/api/area_registry', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setAreas).catch(() => {})
    fetch('/api/entity_registry', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((list: { entity_id: string; area_id: string | null }[]) => {
        const m = new Map<string, string>()
        list.forEach(e => { if (e.area_id) m.set(e.entity_id, e.area_id) })
        setEntityAreas(m)
      }).catch(() => {})
  }, [token])

  const totalOn = useMemo(() => {
    let n = 0
    for (const s of states.values()) if (s.state === 'on') n++
    return n
  }, [states])

  // Group by area, then by domain
  const byArea = useMemo(() => {
    const unassigned: Record<string, unknown[]> = {}
    const grouped: Record<string, Record<string, unknown[]>> = {}

    for (const s of states.values()) {
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
  }, [states, entityAreas])

  const areaMap = new Map(areas.map(a => [a.area_id, a.name]))

  const renderEntities = (entities: any[]) => {
    const first = entities[0]
    if (!first) return null
    const domain = first.entity_id.split('.')[0]
    const sorted = [...entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id))
    if (domain === 'weather') return sorted.map(s => <WeatherCard key={s.entity_id} state={s} />)
    if (domain === 'camera') return <div className="card-grid">{sorted.map(s => <CameraCard key={s.entity_id} state={s} />)}</div>
    if (domain === 'media_player') return sorted.map(s => <MediaPlayerCard key={s.entity_id} state={s} />)
    if (domain === 'light') return <div className="card-grid">{sorted.map(s => <LightCard key={s.entity_id} state={s} />)}</div>
    if (domain === 'switch') return <div className="card-grid">{sorted.map(s => <SwitchCard key={s.entity_id} state={s} />)}</div>
    if (domain === 'binary_sensor') return <div className="card-grid">{sorted.map(s => <SensorCard key={s.entity_id} state={s} binary />)}</div>
    if (domain === 'sensor') return <div className="card-grid">{sorted.map(s => <SensorCard key={s.entity_id} state={s} />)}</div>
    return <div className="ios-list">{sorted.map(s => (
      <div className="ios-list-row" key={s.entity_id}>
        <div className="ios-list-content">
          <div className="ios-list-title">{s.entity_id}</div>
          <div className="ios-list-subtitle">{s.state}</div>
        </div>
      </div>
    ))}</div>
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

        {/* Areas */}
        {areas.map(area => {
          const domains = byArea.grouped[area.area_id]
          if (!domains || Object.keys(domains).length === 0) return null
          return (
            <div className="section" key={area.area_id} style={{ marginTop: 20 }}>
              <div className="section-title">🏠 {area.name}</div>
              {Object.entries(domains).map(([domain, entities]) => (
                <div key={domain}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', margin: '8px 0 4px', paddingLeft: 4 }}>
                    {DOMAIN_META[domain]?.icon} {DOMAIN_META[domain]?.label || domain}
                  </div>
                  {renderEntities(entities)}
                </div>
              ))}
            </div>
          )
        })}

        {/* Unassigned */}
        {Object.keys(byArea.unassigned).length > 0 && (
          <div className="section" style={{ marginTop: 20 }}>
            <div className="section-title" style={{ color: 'var(--text2)' }}>📦 Other</div>
            {Object.entries(byArea.unassigned).map(([domain, entities]) => (
              <div key={domain}>
                <div style={{ fontSize: 11, color: 'var(--text2)', margin: '8px 0 4px', paddingLeft: 4 }}>
                  {DOMAIN_META[domain]?.icon} {DOMAIN_META[domain]?.label || domain}
                </div>
                {renderEntities(entities)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
