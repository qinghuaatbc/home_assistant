import { useMemo } from 'react'
import { useHa } from '../context/HaContext'
import WeatherCard from '../components/cards/WeatherCard'
import CameraCard from '../components/cards/CameraCard'
import LightCard from '../components/cards/LightCard'
import SwitchCard from '../components/cards/SwitchCard'
import SensorCard from '../components/cards/SensorCard'
import MediaPlayerCard from '../components/cards/MediaPlayerCard'

const DOMAIN_ORDER = ['weather', 'camera', 'media_player', 'light', 'switch', 'binary_sensor', 'sensor']
const DOMAIN_META: Record<string, { label: string; icon: string }> = {
  light:         { label: 'Lights',         icon: '💡' },
  switch:        { label: 'Switches',        icon: '🔌' },
  binary_sensor: { label: 'Binary Sensors',  icon: '🔍' },
  sensor:        { label: 'Sensors',         icon: '📊' },
  weather:       { label: 'Weather',         icon: '🌤️' },
  media_player:  { label: 'Media Players',   icon: '🎵' },
  camera:        { label: 'Cameras',         icon: '📷' },
}

export default function DashboardPage() {
  const { states, wsConnected } = useHa()

  const groups = useMemo(() => {
    const map = new Map<string, typeof states extends Map<string, infer V> ? V[] : never[]>()
    for (const s of states.values()) {
      const domain = s.entity_id.split('.')[0]
      if (!map.has(domain)) map.set(domain, [])
      map.get(domain)!.push(s)
    }
    return map
  }, [states])

  const ordered = useMemo(() => [
    ...DOMAIN_ORDER.filter((d) => groups.has(d)),
    ...[...groups.keys()].filter((d) => !DOMAIN_ORDER.includes(d)).sort(),
  ], [groups])

  const totalOn = useMemo(() => {
    let n = 0
    for (const s of states.values()) if (s.state === 'on') n++
    return n
  }, [states])

  return (
    <div className="page">
      <div className="page-inner">
        {/* Nav header */}
        <div className="nav-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="nav-title">Home</div>
            <span
              className={`ws-dot ${wsConnected ? 'connected' : ''}`}
              title={wsConnected ? 'Live' : 'Connecting…'}
              style={{ marginBottom: 10 }}
            />
          </div>
        </div>

        {/* Stats row */}
        {states.size > 0 && (
          <div className="section" style={{ marginTop: 16 }}>
            <div className="stat-row">
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--blue)' }}>{states.size}</div>
                <div className="stat-label">Total Devices</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--green)' }}>{totalOn}</div>
                <div className="stat-label">Active</div>
              </div>
            </div>
          </div>
        )}

        {states.size === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '4rem 2rem', fontSize: 14 }}>
            {wsConnected ? 'No devices found.' : 'Connecting to Home Assistant…'}
          </div>
        )}

        {ordered.map((domain) => {
          const entities = groups.get(domain)!.sort((a, b) => a.entity_id.localeCompare(b.entity_id))
          const meta = DOMAIN_META[domain] ?? { label: domain, icon: '🔧' }

          return (
            <div className="section" key={domain} style={{ marginTop: 20 }}>
              <div className="section-title">{meta.icon} {meta.label}</div>

              {domain === 'weather' && entities.map((s) => (
                <WeatherCard key={s.entity_id} state={s} />
              ))}

              {domain === 'camera' && (
                <div className="card-grid">
                  {entities.map((s) => <CameraCard key={s.entity_id} state={s} />)}
                </div>
              )}

              {domain === 'media_player' && entities.map((s) => (
                <MediaPlayerCard key={s.entity_id} state={s} />
              ))}

              {domain === 'light' && (
                <div className="card-grid">
                  {entities.map((s) => <LightCard key={s.entity_id} state={s} />)}
                </div>
              )}

              {domain === 'switch' && (
                <div className="card-grid">
                  {entities.map((s) => <SwitchCard key={s.entity_id} state={s} />)}
                </div>
              )}

              {domain === 'binary_sensor' && (
                <div className="card-grid">
                  {entities.map((s) => <SensorCard key={s.entity_id} state={s} binary />)}
                </div>
              )}

              {domain === 'sensor' && (
                <div className="card-grid">
                  {entities.map((s) => <SensorCard key={s.entity_id} state={s} />)}
                </div>
              )}

              {!DOMAIN_META[domain] && (
                <div className="ios-list">
                  {entities.map((s) => (
                    <div className="ios-list-row" key={s.entity_id}>
                      <div className="ios-list-content">
                        <div className="ios-list-title">{s.entity_id}</div>
                        <div className="ios-list-subtitle">{s.state}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
