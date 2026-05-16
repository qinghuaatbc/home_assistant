import { useState, useEffect, useRef, useCallback } from 'react'
import { useHa } from '../context/HaContext'

interface Zone { id: number; name: string; latitude: number; longitude: number; radiusMeters: number; icon: string }
interface DeviceLoc { deviceId: string; displayName: string; latitude: number; longitude: number; accuracy: number; zoneId: number | null; updatedAt: string }

const DEVICE_ID = (() => {
  let id = localStorage.getItem('comm_device_id')
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('comm_device_id', id) }
  return id
})()

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// Static map image URL (OpenStreetMap-based)
function staticMapUrl(lat: number, lon: number, zoom = 14): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${zoom}&size=400x200&markers=${lat},${lon},ol-marker`
}

interface ZoneFormProps { initial?: Partial<Zone>; pos: { lat: number; lon: number } | null; onSave: (z: Partial<Zone>) => void; onCancel: () => void }
function ZoneForm({ initial, pos, onSave, onCancel }: ZoneFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [lat, setLat] = useState(String(initial?.latitude ?? pos?.lat ?? ''))
  const [lon, setLon] = useState(String(initial?.longitude ?? pos?.lon ?? ''))
  const [radius, setRadius] = useState(String(initial?.radiusMeters ?? 100))
  const [icon, setIcon] = useState(initial?.icon ?? '📍')

  function useCurrentPos() {
    if (pos) { setLat(String(pos.lat.toFixed(6))); setLon(String(pos.lon.toFixed(6))) }
  }

  return (
    <div style={{ background: 'var(--card)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{initial?.id ? 'Edit Zone' : 'New Zone'}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={icon} onChange={e => setIcon(e.target.value)} style={{ width: 48, fontSize: 20, textAlign: 'center', padding: '6px 4px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
        <input placeholder="Zone name (e.g. Home, Work)" value={name} onChange={e => setName(e.target.value)}
          style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input placeholder="Latitude" value={lat} onChange={e => setLat(e.target.value)} type="number" step="0.000001"
          style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
        <input placeholder="Longitude" value={lon} onChange={e => setLon(e.target.value)} type="number" step="0.000001"
          style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
        {pos && <button className="btn" style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }} onClick={useCurrentPos}>📍 Use mine</button>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>Radius:</span>
        <input type="range" min={25} max={5000} step={25} value={Number(radius)} onChange={e => setRadius(e.target.value)} style={{ flex: 1 }} />
        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 60 }}>{Number(radius) >= 1000 ? `${(Number(radius)/1000).toFixed(1)} km` : `${radius} m`}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn active" style={{ fontSize: 12 }} onClick={() => onSave({ ...initial, name, latitude: Number(lat), longitude: Number(lon), radiusMeters: Number(radius), icon })}>
          {initial?.id ? 'Update' : 'Create Zone'}
        </button>
        <button className="btn" style={{ fontSize: 12 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export default function GeofencePage() {
  const { token } = useHa()
  const [zones, setZones] = useState<Zone[]>([])
  const [devices, setDevices] = useState<DeviceLoc[]>([])
  const [myPos, setMyPos] = useState<{ lat: number; lon: number; accuracy: number } | null>(null)
  const [tracking, setTracking] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editZone, setEditZone] = useState<Zone | null>(null)
  const [msg, setMsg] = useState('')
  const watchRef = useRef<number | null>(null)
  const reportRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const displayName = localStorage.getItem('ha_display_name') || DEVICE_ID.slice(0, 8)

  const load = useCallback(() => {
    if (!token) return
    fetch('/api/geofence/zones', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(setZones).catch(() => {})
    fetch('/api/geofence/locations', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(setDevices).catch(() => {})
  }, [token])

  useEffect(() => { load() }, [load])

  // Report location to backend
  const reportLocation = useCallback(async (lat: number, lon: number, accuracy: number) => {
    if (!token) return
    const res = await fetch('/api/geofence/location', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: DEVICE_ID, latitude: lat, longitude: lon, accuracy, displayName }),
    })
    if (res.ok) load()
  }, [token, load])

  function startTracking() {
    if (!navigator.geolocation) { setMsg('Geolocation not supported'); return }
    setTracking(true)
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords
        setMyPos({ lat, lon, accuracy })
      },
      () => setMsg('Location access denied'),
      { enableHighAccuracy: true, maximumAge: 10000 },
    )
    // Report every 30s
    reportRef.current = setInterval(() => {
      if (myPos) reportLocation(myPos.lat, myPos.lon, myPos.accuracy)
    }, 30000)
    // Report immediately
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords
      setMyPos({ lat, lon, accuracy })
      reportLocation(lat, lon, accuracy)
    })
  }

  function stopTracking() {
    setTracking(false)
    if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null }
    if (reportRef.current) { clearInterval(reportRef.current); reportRef.current = null }
  }

  useEffect(() => () => { stopTracking() }, [])

  async function saveZone(data: Partial<Zone>) {
    if (!token || !data.name || !data.latitude || !data.longitude) return
    const method = data.id ? 'PUT' : 'POST'
    const url = data.id ? `/api/geofence/zones/${data.id}` : '/api/geofence/zones'
    await fetch(url, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setShowForm(false); setEditZone(null); load()
    setMsg(data.id ? 'Zone updated' : 'Zone created'); setTimeout(() => setMsg(''), 2000)
  }

  async function deleteZone(id: number) {
    if (!token) return
    await fetch(`/api/geofence/zones/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    load(); setMsg('Zone deleted'); setTimeout(() => setMsg(''), 2000)
  }

  const pos = myPos ? { lat: myPos.lat, lon: myPos.lon } : null

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="nav-title">📍 Geofencing</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
              {msg && <span style={{ fontSize: 11, color: '#30d158', fontWeight: 600 }}>{msg}</span>}
              <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setShowForm(true); setEditZone(null) }}>+ Zone</button>
              <button
                className={`btn${tracking ? ' active' : ''}`}
                style={{ fontSize: 11, padding: '4px 10px', color: tracking ? '#30d158' : undefined }}
                onClick={tracking ? stopTracking : startTracking}
              >{tracking ? '⏹ Stop' : '▶ Track me'}</button>
            </div>
          </div>
        </div>

        {/* Add/Edit form */}
        {(showForm || editZone) && (
          <ZoneForm
            initial={editZone ?? undefined}
            pos={pos}
            onSave={saveZone}
            onCancel={() => { setShowForm(false); setEditZone(null) }}
          />
        )}

        {/* My location status */}
        {myPos && (
          <div style={{ background: 'var(--card)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 20 }}>📱</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>My Location</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{myPos.lat.toFixed(5)}, {myPos.lon.toFixed(5)} · ±{Math.round(myPos.accuracy)}m</div>
            </div>
            {zones.map(z => {
              const d = haversineMeters(myPos.lat, myPos.lon, z.latitude, z.longitude)
              const inside = d <= z.radiusMeters
              return inside ? (
                <span key={z.id} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: '#30d15820', color: '#30d158', fontWeight: 600 }}>
                  {z.icon} In {z.name}
                </span>
              ) : null
            })}
          </div>
        )}

        {/* Zone list */}
        {zones.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
            No zones yet. Click "+ Zone" to create your first geofence.
          </div>
        )}

        {zones.map(zone => {
          const dist = myPos ? haversineMeters(myPos.lat, myPos.lon, zone.latitude, zone.longitude) : null
          const inside = dist !== null && dist <= zone.radiusMeters
          const devicesInZone = devices.filter(d => d.zoneId === zone.id)

          return (
            <div key={zone.id} style={{ background: 'var(--card)', borderRadius: 12, marginBottom: 12, overflow: 'hidden', border: `1.5px solid ${inside ? '#30d158' : 'transparent'}` }}>
              {/* Map thumbnail */}
              <div style={{ position: 'relative', height: 120, background: '#111', overflow: 'hidden' }}>
                <img
                  src={staticMapUrl(zone.latitude, zone.longitude)}
                  alt="map"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
                  loading="lazy"
                />
                {/* Radius circle overlay */}
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    border: `2px solid ${inside ? '#30d158' : '#ff9a3c'}`,
                    background: `${inside ? '#30d158' : '#ff9a3c'}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20,
                  }}>{zone.icon}</div>
                </div>
              </div>

              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{zone.icon} {zone.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                      {zone.latitude.toFixed(4)}, {zone.longitude.toFixed(4)} · r={fmtDist(zone.radiusMeters)}
                    </div>
                    {dist !== null && (
                      <div style={{ fontSize: 12, marginTop: 4, color: inside ? '#30d158' : 'var(--text2)', fontWeight: inside ? 600 : 400 }}>
                        {inside ? '✓ You are inside' : `${fmtDist(dist)} away`}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setEditZone(zone)}>Edit</button>
                    <button className="btn" style={{ fontSize: 10, padding: '3px 8px', color: '#ff453a' }} onClick={() => deleteZone(zone.id)}>Delete</button>
                  </div>
                </div>

                {/* Devices in zone */}
                {devicesInZone.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {devicesInZone.map(d => (
                      <span key={d.deviceId} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--surface)', color: 'var(--text2)' }}>
                        📱 {d.displayName} · {relTime(d.updatedAt)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* All device locations */}
        {devices.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>📱 All Devices</div>
            <div className="ios-list">
              {devices.map(d => {
                const zone = zones.find(z => z.id === d.zoneId)
                return (
                  <div key={d.deviceId} className="ios-list-row">
                    <div className="ios-list-icon" style={{ fontSize: 18 }}>📱</div>
                    <div className="ios-list-content">
                      <div className="ios-list-title">{d.displayName}</div>
                      <div className="ios-list-subtitle">
                        {zone ? `${zone.icon} ${zone.name}` : 'Not in any zone'} · {relTime(d.updatedAt)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
