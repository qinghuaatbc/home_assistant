import { useState, useMemo } from 'react'
import { useHa, HaState } from '../context/HaContext'
import LightCard from '../components/cards/LightCard'
import SwitchCard from '../components/cards/SwitchCard'
import SensorCard from '../components/cards/SensorCard'
import MediaPlayerCard from '../components/cards/MediaPlayerCard'
import WeatherCard from '../components/cards/WeatherCard'
import CameraCard from '../components/cards/CameraCard'

const DOMAIN_META: Record<string, { label: string; icon: string }> = {
  light:         { label: 'Lights',        icon: '💡' },
  switch:        { label: 'Switches',      icon: '🔌' },
  binary_sensor: { label: 'Sensors',       icon: '🔍' },
  sensor:        { label: 'Sensors',       icon: '📊' },
  weather:       { label: 'Weather',       icon: '🌤️' },
  media_player:  { label: 'Media',         icon: '🎵' },
  camera:        { label: 'Cameras',       icon: '📷' },
  automation:    { label: 'Automations',   icon: '⚡' },
}

function EntityRow({ state }: { state: HaState }) {
  const domain = state.entity_id.split('.')[0]
  const meta = DOMAIN_META[domain] ?? { icon: '🔧' }
  const name = (state.attributes.friendly_name as string) ?? state.entity_id
  const on = state.state === 'on'

  return (
    <div className="ios-list-row">
      <div
        className="ios-list-icon"
        style={{ background: on ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.06)' }}
      >
        {meta.icon}
      </div>
      <div className="ios-list-content">
        <div className="ios-list-title">{name}</div>
        <div className="ios-list-subtitle">{state.entity_id}</div>
      </div>
      <div className="ios-list-right">
        <span style={{ color: on ? 'var(--green)' : 'var(--text3)', fontSize: 13 }}>
          {state.state}
        </span>
        <span style={{ color: 'var(--text3)', fontSize: 14 }}>›</span>
      </div>
    </div>
  )
}

export default function EntitiesPage() {
  const { states } = useHa()
  const [filter, setFilter] = useState('all')

  const domains = useMemo(() => {
    const set = new Set<string>()
    for (const s of states.values()) set.add(s.entity_id.split('.')[0])
    return ['all', ...Array.from(set).sort()]
  }, [states])

  const filtered = useMemo(() => {
    const list = Array.from(states.values())
    return filter === 'all'
      ? list.sort((a, b) => a.entity_id.localeCompare(b.entity_id))
      : list
          .filter((s) => s.entity_id.split('.')[0] === filter)
          .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
  }, [states, filter])

  const groups = useMemo(() => {
    if (filter !== 'all') return null
    const map = new Map<string, HaState[]>()
    for (const s of filtered) {
      const d = s.entity_id.split('.')[0]
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(s)
    }
    return map
  }, [filtered, filter])

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">Devices</div>
          <div className="seg-ctrl">
            {domains.map((d) => (
              <button
                key={d}
                className={`seg-btn ${filter === d ? 'active' : ''}`}
                onClick={() => setFilter(d)}
              >
                {d === 'all' ? 'All' : (DOMAIN_META[d]?.label ?? d)}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem', fontSize: 14 }}>
            No devices.
          </div>
        )}

        {filter === 'all' && groups ? (
          Array.from(groups.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([domain, items]) => (
              <div className="section" key={domain}>
                <div className="section-title">
                  {DOMAIN_META[domain]?.icon ?? '🔧'} {DOMAIN_META[domain]?.label ?? domain}
                  <span style={{ marginLeft: 6, color: 'var(--text3)', fontWeight: 400 }}>
                    ({items.length})
                  </span>
                </div>
                <div className="ios-list">
                  {items.map((s) => <EntityRow key={s.entity_id} state={s} />)}
                </div>
              </div>
            ))
        ) : (
          <>
            {/* Show full cards for controllable domains */}
            {filter === 'light' && (
              <div className="section">
                <div className="card-grid">
                  {filtered.map((s) => <LightCard key={s.entity_id} state={s} />)}
                </div>
              </div>
            )}
            {filter === 'switch' && (
              <div className="section">
                <div className="card-grid">
                  {filtered.map((s) => <SwitchCard key={s.entity_id} state={s} />)}
                </div>
              </div>
            )}
            {filter === 'sensor' && (
              <div className="section">
                <div className="card-grid">
                  {filtered.map((s) => <SensorCard key={s.entity_id} state={s} />)}
                </div>
              </div>
            )}
            {filter === 'binary_sensor' && (
              <div className="section">
                <div className="card-grid">
                  {filtered.map((s) => <SensorCard key={s.entity_id} state={s} binary />)}
                </div>
              </div>
            )}
            {filter === 'weather' && (
              <div className="section">
                {filtered.map((s) => <WeatherCard key={s.entity_id} state={s} />)}
              </div>
            )}
            {filter === 'camera' && (
              <div className="section">
                <div className="card-grid">
                  {filtered.map((s) => <CameraCard key={s.entity_id} state={s} />)}
                </div>
              </div>
            )}
            {filter === 'media_player' && (
              <div className="section">
                {filtered.map((s) => <MediaPlayerCard key={s.entity_id} state={s} />)}
              </div>
            )}
            {!['light','switch','sensor','binary_sensor','weather','camera','media_player'].includes(filter) && filter !== 'all' && (
              <div className="section">
                <div className="ios-list">
                  {filtered.map((s) => <EntityRow key={s.entity_id} state={s} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
