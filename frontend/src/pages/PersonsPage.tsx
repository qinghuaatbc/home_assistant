import { useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'

interface ZoneInfo {
  entity_id: string
  name: string
  icon: string
  latitude: number
  longitude: number
  radius: number
}

function staticMapUrl(lat: number, lon: number, zoom = 14) {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${zoom}&size=160x80&markers=${lat},${lon},red`
}

export default function PersonsPage() {
  const { states, token, callService } = useHa()
  const [deviceLocations, setDeviceLocations] = useState<any[]>([])

  // Load geofence device locations from backend
  useEffect(() => {
    if (!token) return
    fetch('/api/geofence/locations', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setDeviceLocations)
      .catch(() => {})
  }, [token])

  // Person entities
  const persons = Array.from(states.values())
    .filter(s => s.entity_id.startsWith('person.'))
    .sort((a, b) => String(a.attributes?.friendly_name ?? a.entity_id).localeCompare(String(b.attributes?.friendly_name ?? b.entity_id)))

  // Device tracker entities
  const trackers = Array.from(states.values())
    .filter(s => s.entity_id.startsWith('device_tracker.'))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id))

  // Zone entities
  const zones: ZoneInfo[] = Array.from(states.values())
    .filter(s => s.entity_id.startsWith('zone.'))
    .map(s => ({
      entity_id: s.entity_id,
      name: String(s.attributes?.friendly_name ?? s.entity_id.replace('zone.', '').replace(/_/g, ' ')),
      icon: String(s.attributes?.icon ?? '📍'),
      latitude: Number(s.attributes?.latitude ?? 0),
      longitude: Number(s.attributes?.longitude ?? 0),
      radius: Number(s.attributes?.radius ?? 100),
    }))

  // Group trackers by zone state
  const byZone: Record<string, typeof trackers> = {}
  for (const t of trackers) {
    const zone = t.state ?? 'away'
    ;(byZone[zone] ??= []).push(t)
  }

  const isHome = (state: string) => state === 'home' || state === 'Home'

  const homeCount = trackers.filter(t => isHome(t.state)).length
  const awayCount = trackers.filter(t => !isHome(t.state)).length

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">👥 Who's Home</div>
        </div>

        {/* Summary banner */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, background: homeCount > 0 ? 'rgba(48,209,88,0.12)' : 'var(--card)', borderRadius: 12, padding: '14px 16px', textAlign: 'center', border: `1.5px solid ${homeCount > 0 ? '#30d158' : 'transparent'}` }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#30d158' }}>{homeCount}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Home</div>
          </div>
          <div style={{ flex: 1, background: 'var(--card)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text2)' }}>{awayCount}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Away</div>
          </div>
          <div style={{ flex: 1, background: 'var(--card)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>{trackers.length + persons.length}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Total</div>
          </div>
        </div>

        {/* Person entities */}
        {persons.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, letterSpacing: 0.5 }}>PERSONS</div>
            <div className="ios-list">
              {persons.map(p => {
                const name = String(p.attributes?.friendly_name ?? p.entity_id.replace('person.', '').replace(/_/g, ' '))
                const home = isHome(p.state)
                const pic = p.attributes?.entity_picture as string | undefined
                return (
                  <div key={p.entity_id} className="ios-list-row">
                    <div className="ios-list-icon" style={{ background: home ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.06)', overflow: 'hidden', padding: 0 }}>
                      {pic
                        ? <img src={pic} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 20 }}>👤</span>
                      }
                    </div>
                    <div className="ios-list-content">
                      <div className="ios-list-title">{name}</div>
                      <div className="ios-list-subtitle" style={{ color: home ? '#30d158' : 'var(--text2)' }}>
                        {home ? '🏠 Home' : `📍 ${p.state}`}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: home ? '#30d158' : 'var(--text2)' }}>
                      {home ? '●' : '○'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Device trackers */}
        {trackers.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, letterSpacing: 0.5 }}>
              DEVICE TRACKERS ({trackers.length})
            </div>
            <div className="ios-list">
              {trackers.map(t => {
                const name = String(t.attributes?.friendly_name ?? t.entity_id.replace('device_tracker.', '').replace(/_/g, ' '))
                const home = isHome(t.state)
                const battery = t.attributes?.battery_level as number | undefined
                return (
                  <div key={t.entity_id} className="ios-list-row">
                    <div className="ios-list-icon" style={{ background: home ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.06)' }}>
                      {t.attributes?.source_type === 'gps' ? '📡' : t.attributes?.source_type === 'bluetooth' ? '🔵' : '📱'}
                    </div>
                    <div className="ios-list-content">
                      <div className="ios-list-title">{name}</div>
                      <div className="ios-list-subtitle" style={{ color: home ? '#30d158' : 'var(--text2)' }}>
                        {home ? '🏠 Home' : `📍 ${t.state}`}
                        {battery != null && <span style={{ marginLeft: 8, color: battery < 20 ? '#ff453a' : 'var(--text2)' }}>🔋{battery}%</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Geofence device locations */}
        {deviceLocations.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, letterSpacing: 0.5 }}>
              TRACKED DEVICES ({deviceLocations.length})
            </div>
            <div className="ios-list">
              {deviceLocations.map((d: any) => {
                const lastSeen = d.updatedAt ? new Date(d.updatedAt) : null
                const age = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 60000) : null
                const fresh = age != null && age < 10
                return (
                  <div key={d.deviceId} className="ios-list-row">
                    <div className="ios-list-icon" style={{ background: fresh ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.06)' }}>📲</div>
                    <div className="ios-list-content">
                      <div className="ios-list-title">{d.displayName ?? d.deviceId.slice(0, 12)}</div>
                      <div className="ios-list-subtitle">
                        {d.zoneName
                          ? <span style={{ color: '#30d158' }}>🏠 {d.zoneName}</span>
                          : <span>📍 {d.latitude?.toFixed(4)}, {d.longitude?.toFixed(4)}</span>
                        }
                        {age != null && <span style={{ marginLeft: 8, color: fresh ? '#30d158' : 'var(--text2)' }}>{age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Zones */}
        {zones.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, letterSpacing: 0.5 }}>
              ZONES ({zones.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {zones.map(z => {
                const occupants = [...persons, ...trackers].filter(e =>
                  e.state?.toLowerCase() === z.name.toLowerCase() ||
                  e.state === z.entity_id.replace('zone.', '')
                )
                return (
                  <div key={z.entity_id} style={{ background: 'var(--card)', borderRadius: 10, overflow: 'hidden' }}>
                    {z.latitude && z.longitude && (
                      <img
                        src={staticMapUrl(z.latitude, z.longitude)}
                        alt={z.name}
                        style={{ width: '100%', height: 60, objectFit: 'cover', display: 'block' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    )}
                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{z.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>r = {z.radius}m</div>
                      {occupants.length > 0 && (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#30d158' }}>
                          {occupants.length} person{occupants.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {persons.length === 0 && trackers.length === 0 && deviceLocations.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
            No persons or device trackers found.<br />
            Add a <code style={{ fontFamily: 'monospace', fontSize: 11 }}>person.*</code> or <code style={{ fontFamily: 'monospace', fontSize: 11 }}>device_tracker.*</code> entity,
            or enable Geofencing on a mobile device.
          </div>
        )}
      </div>
    </div>
  )
}
