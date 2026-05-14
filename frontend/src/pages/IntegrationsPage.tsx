import { useState, useEffect, useRef } from 'react'
import { useHa } from '../context/HaContext'

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light')
  localStorage.setItem('ha_theme', isLight ? 'light' : 'dark')
}

interface FieldDef {
  key: string; label: string; placeholder?: string; default?: string; type?: string; options?: string[]
}

interface IntegrationDef {
  domain: string; name: string; icon: string; desc: string
  fields: FieldDef[]
  dynamicFields?: { label: string; key: string; type?: string; placeholder?: string; options?: string[] }[]
}

const INTEGRATIONS: IntegrationDef[] = [
  { domain: 'demo', name: 'Demo', icon: '🧪', desc: 'Simulated test devices (lights, switches, sensors)',
    fields: [{ key: 'enable', label: 'Enable demo devices', type: 'checkbox', default: 'true' }]},
  { domain: 'mqtt', name: 'MQTT', icon: '📡', desc: 'MQTT broker connection (Tasmota, ESPHome, Sonoff...)',
    fields: [
      { key: 'broker', label: 'Broker', placeholder: 'localhost', default: 'localhost' },
      { key: 'port', label: 'Port', placeholder: '1883', default: '1883', type: 'number' },
      { key: 'username', label: 'Username (optional)', placeholder: '', default: '' },
      { key: 'password', label: 'Password (optional)', placeholder: '', default: '', type: 'password' },
    ],
    dynamicFields: [
      { label: 'State Topic', key: 'topic', placeholder: 'stat/lamp1/POWER' },
      { label: 'Cmd Topic', key: 'command_topic', placeholder: 'cmnd/lamp1/POWER' },
      { label: 'Type', key: 'type', placeholder: 'light' },
      { label: 'Name', key: 'name', placeholder: 'Living Room Lamp' },
    ]},
  { domain: 'envisalink', name: 'EnvisaLink (DSC/Honeywell)', icon: '🔒', desc: 'DSC/Honeywell alarm panels via EnvisaLink',
    fields: [
      { key: 'host', label: 'EnvisaLink IP', placeholder: '192.168.1.50', default: '' },
      { key: 'port', label: 'Port', placeholder: '4025', default: '4025', type: 'number' },
      { key: 'panel_type', label: 'Panel Type', placeholder: 'HONEYWELL or DSC', default: 'DSC' },
      { key: 'user_name', label: 'Username', placeholder: 'user', default: 'user' },
      { key: 'password', label: 'Password', placeholder: 'user', default: 'user', type: 'password' },
      { key: 'code', label: 'Alarm Code', placeholder: '1234', default: '1234' },
    ],
    dynamicFields: [
      { label: 'Zone #', key: 'zone', type: 'number', placeholder: '1' },
      { label: 'Name', key: 'name', placeholder: 'Front Door' },
      { label: 'Type', key: 'type', placeholder: 'door' },
    ]},
  { domain: 'isy994', name: 'ISY994 / Insteon', icon: '🏗️', desc: 'ISY994 home automation controller (Insteon, Z-Wave)',
    fields: [
      { key: 'host', label: 'ISY IP', placeholder: '192.168.1.100', default: '' },
      { key: 'port', label: 'Port', placeholder: '80', default: '80', type: 'number' },
      { key: 'username', label: 'Username', placeholder: 'admin', default: 'admin' },
      { key: 'password', label: 'Password', placeholder: 'admin', default: 'admin', type: 'password' },
    ],
    dynamicFields: [
      { label: 'Address (ID)', key: 'address', placeholder: '11 22 33 1' },
      { label: 'Type', key: 'type', options: ['dimmer', 'switch', 'sensor'] },
      { label: 'Name', key: 'name', placeholder: 'Living Room Dimmer' },
    ]},
  { domain: 'weather_station', name: 'Weather Station', icon: '🌤️', desc: 'HTTP-polled temperature, humidity, wind sensor',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Weather Station', default: 'Weather Station' },
      { key: 'host', label: 'Host / IP', placeholder: '192.168.1.100', default: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', placeholder: '8080', default: '8080' },
      { key: 'interval_seconds', label: 'Poll interval (s)', type: 'number', placeholder: '60', default: '60' },
    ]},
  { domain: 'http_sensor', name: 'HTTP Sensor', icon: '📡', desc: 'Poll any HTTP JSON endpoint for sensor values',
    fields: [],
    dynamicFields: [
      { label: 'Name', key: 'name', placeholder: 'Living Room' },
      { label: 'URL', key: 'url', placeholder: 'http://192.168.1.100/api' },
      { label: 'Interval (s)', key: 'interval', type: 'number', placeholder: '60' },
      { label: 'JSON path', key: 'path', placeholder: 'temperature' },
      { label: 'Field label', key: 'label', placeholder: 'Temperature' },
      { label: 'Field key', key: 'key', placeholder: 'temperature' },
      { label: 'Unit', key: 'unit', placeholder: '°C' },
    ]},
  { domain: 'rtsp2hls', name: 'RTSP2HLS', icon: '📷', desc: 'IP cameras via RTSP (requires FFmpeg)',
    fields: [],
    dynamicFields: [
      { label: 'Name', key: 'name', placeholder: 'Driveway' },
      { label: 'RTSP URL', key: 'rtsp_url', placeholder: 'rtsp://user:pass@ip:554/stream' },
    ]},
  { domain: 'rti', name: 'RTI Control (MQTT Bridge)', icon: '🎛️', desc: 'RTI XP processor ↔ HA via MQTT. Bidirectional: RTI buttons control devices, HA state feeds back to RTI variables.',
    fields: [
      { key: 'broker', label: 'MQTT Broker IP', placeholder: '192.168.1.10', default: 'localhost' },
      { key: 'port', label: 'Port', placeholder: '1883', default: '1883', type: 'number' },
      { key: 'username', label: 'Username (optional)', placeholder: '', default: '' },
      { key: 'password', label: 'Password (optional)', placeholder: '', default: '', type: 'password' },
      { key: 'command_prefix', label: 'Command prefix (RTI → HA)', placeholder: 'rti/command', default: 'rti/command' },
      { key: 'state_prefix', label: 'State prefix (HA → RTI)', placeholder: 'rti/state', default: 'rti/state' },
    ]},
  { domain: 'lutron_caseta', name: 'Lutron Caseta', icon: '💡', desc: 'Lutron Caseta Smart Bridge',
    fields: [
      { key: 'host', label: 'Bridge IP', placeholder: '192.168.1.167', default: '' },
      { key: 'port', label: 'Port', placeholder: '23', default: '23', type: 'number' },
      { key: 'username', label: 'Username', placeholder: 'lutron', default: 'lutron' },
      { key: 'password', label: 'Password', placeholder: 'integration', default: 'integration' },
    ],
    dynamicFields: [
      { label: 'Integration ID', key: 'integrationId', type: 'number', placeholder: '1' },
      { label: 'Entity ID', key: 'entity_id', placeholder: 'light.lutron_living_room' },
      { label: 'Type', key: 'type', placeholder: 'dimmer' },
      { label: 'Name', key: 'name', placeholder: 'Living Room' },
    ]},
]

interface EntityRegItem {
  entity_id: string
  name: string | null
  platform: string | null
  area_id: string | null
  disabled: boolean
  device_class: string | null
  original_name: string | null
}

const DOMAIN_ICONS: Record<string, string> = {
  light: '💡', switch: '🔌', binary_sensor: '🔍', sensor: '📊',
  media_player: '🎵', camera: '📷', weather: '🌤', alarm_control_panel: '🔒',
  automation: '⚡', scene: '🎬', script: '📜',
}

export default function IntegrationsPage() {
  const { token, states } = useHa()
  const [configs, setConfigs] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(INTEGRATIONS.map(i => i.domain)))
  const [search, setSearch] = useState('')
  const [loadedStatuses, setLoadedStatuses] = useState<Record<string, string>>({})
  const [reg, setReg] = useState<Map<string, EntityRegItem>>(new Map())
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [activeTab, setActiveTab] = useState<'integrations' | 'devices'>('devices')

  useEffect(() => {
    if (!token) return
    fetch('/api/config/integrations-status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        const m: Record<string, string> = {}
        for (const s of (d.statuses || [])) m[s.domain] = s.status
        setLoadedStatuses(m)
      }).catch(() => {})
  }, [token])

  // Load current config from server to pre-populate forms
  useEffect(() => {
    if (!token) return
    fetch('/api/config', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((cfg: any) => {
        const ints = (cfg.integrations || []) as any[]
        const m: Record<string, any> = {}
        for (const int of ints) {
          const domain = int.domain
          const existing = m[domain] || {}
          for (const [k, v] of Object.entries(int)) {
            if (k === 'domain') continue
            if (domain === 'rtsp2hls' && k === 'cameras') {
              existing.devices = (v as any[]).map((cam: any) => ({
                name: cam.name || '',
                rtsp_url: (cam.streams?.[0]?.rtsp_url) || '',
              }))
            } else {
              existing[k] = v
            }
          }
          m[domain] = existing
        }
        setConfigs(prev => {
          const merged = { ...m }
          // Keep any user edits that aren't in server config
          for (const [k, v] of Object.entries(prev)) {
            if (!merged[k]) merged[k] = v
          }
          return merged
        })
      }).catch(() => {})
  }, [token])

  useEffect(() => {
    if (!token) return
    const load = () => fetch('/api/entity_registry', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((list: EntityRegItem[]) => {
        setReg(new Map(list.map(e => [e.entity_id, e])))
      }).catch(() => {})
    load()
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [token])

  const updateReg = async (entityId: string, changes: Partial<EntityRegItem>) => {
    const r = await fetch(`/api/entity_registry/${entityId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    })
    if (r.ok) {
      setReg(prev => {
        const next = new Map(prev)
        const existing = next.get(entityId) || { entity_id: entityId, name: null, platform: null, area_id: null, disabled: false, device_class: null, original_name: null }
        next.set(entityId, { ...existing, ...changes })
        return next
      })
    }
  }

  const addEntity = async (domain: string, integration?: string) => {
    const prefix = integration || domain
    let entityId: string | null = null
    let name: string | null = null

    if (integration === 'isy994') {
      const insteonId = prompt(`Enter Insteon ID (e.g. 11 22 33 1):`)
      if (!insteonId) return
      const d = prompt('Enter domain (light/switch/binary_sensor):') || 'light'
      entityId = `${d}.isy994_${insteonId.replace(/ /g, '_')}`
      name = prompt('Enter friendly name:') || entityId
    } else {
      const input = prompt(`Enter device identifier (e.g. living_room):`)
      if (!input) return
      const defaultDomain = domain.startsWith('light') ? 'light' : domain.startsWith('switch') ? 'switch' : 'light'
      entityId = `${defaultDomain}.${prefix}_${input}`
      name = prompt('Enter friendly name:') || entityId
    }

    try {
      const r = await fetch(`/api/states/${entityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ state: 'off', attributes: { friendly_name: name } }),
      })
      if (!r.ok) throw new Error(await r.text())
    } catch (e: any) { alert(`Failed: ${e.message}`) }
  }

  const removeEntity = async (entityId: string) => {
    if (!confirm(`Remove ${entityId}?`)) return
    try {
      const r = await fetch(`/api/states/${entityId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error(await r.text())
      setReg(prev => { const n = new Map(prev); n.delete(entityId); return n })
    } catch (e: any) { alert(`Failed: ${e.message}`) }
  }

  const enabledDomains = new Set(Object.keys(configs).filter(d => {
    const cfg = configs[d]
    if (!cfg) return false
    return Object.entries(cfg).some(([k, v]) => {
      if (k === 'devices') return Array.isArray(v) && v.length > 0
      return !!v
    })
  }))

  const filtered = INTEGRATIONS.filter(int =>
    !search || int.name.toLowerCase().includes(search.toLowerCase()) ||
    int.desc.toLowerCase().includes(search.toLowerCase()) ||
    int.domain.toLowerCase().includes(search.toLowerCase())
  )

  const updateField = (domain: string, key: string, value: string) => {
    setConfigs(prev => ({
      ...prev,
      [domain]: { ...(prev[domain] || {}), [key]: value },
    }))
  }

  const addDevice = (domain: string) => {
    setConfigs(prev => {
      const cfg = { ...(prev[domain] || {}) }
      const list = [...(cfg.devices || [])]
      list.push({})
      return { ...prev, [domain]: { ...cfg, devices: list } }
    })
  }

  const updateDevice = (domain: string, idx: number, key: string, value: string) => {
    setConfigs(prev => {
      const cfg = { ...(prev[domain] || {}) }
      const list = [...(cfg.devices || [])]
      list[idx] = { ...(list[idx] || {}), [key]: value }
      return { ...prev, [domain]: { ...cfg, devices: list } }
    })
  }

  const removeDevice = (domain: string, idx: number) => {
    setConfigs(prev => {
      const cfg = { ...(prev[domain] || {}) }
      return { ...prev, [domain]: { ...cfg, devices: (cfg.devices || []).filter((_: any, i: number) => i !== idx) } }
    })
  }

  const waitForServer = async (): Promise<void> => {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const r = await fetch('/api/health')
        if (r.ok) return
      } catch {}
    }
    throw new Error('Server did not come back')
  }

  const reloadConfig = async () => {
    try {
      const r = await fetch('/api/config', { headers: { Authorization: `Bearer ${token}` } })
      const cfg = await r.json()
      const ints = (cfg.integrations || []) as any[]
      const m: Record<string, any> = {}
      for (const int of ints) {
        const domain = int.domain
        const existing = m[domain] || {}
        for (const [k, v] of Object.entries(int)) {
          if (k === 'domain') continue
          if (domain === 'rtsp2hls' && k === 'cameras') {
            // Transform server cameras format → UI devices format
            existing.devices = (v as any[]).map((cam: any) => ({
              name: cam.name || '',
              rtsp_url: (cam.streams?.[0]?.rtsp_url) || '',
            }))
          } else {
            existing[k] = v
          }
        }
        m[domain] = existing
      }
      setConfigs(m)
    } catch {}
  }

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      const integrations = INTEGRATIONS.map(int => {
        const cfg = configs[int.domain]
        if (!cfg) return null
        const hasVal = Object.entries(cfg).some(([k, v]) => {
          if (k === 'devices') return Array.isArray(v) && v.length > 0
          return v !== undefined && v !== null && v !== ''
        })
        if (!hasVal) return null
        const out: any = { domain: int.domain }
        for (const [k, v] of Object.entries(cfg)) {
          if (k === 'devices' && int.domain === 'rtsp2hls') {
            if (Array.isArray(v) && v.length > 0) {
              out.cameras = v.map((d: any) => ({
                name: d.name || 'Camera',
                streams: [{ label: 'Main', rtsp_url: d.rtsp_url }],
              }))
            }
          } else if (k === 'devices') { if (Array.isArray(v) && v.length > 0) out.devices = v }
          else if (v) { out[k] = v }
        }
        return out
      }).filter(Boolean)
      const r = await fetch('/api/config/apply', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrations }),
      })
      if (!r.ok) { setMsg('❌ Save failed: ' + await r.text()); setSaving(false); return }
      setMsg('✅ Saving… restarting server')
      await waitForServer()
      await reloadConfig()
      setMsg('✅ Configuration applied and server restarted')
      setTimeout(() => setMsg(''), 3000)
    } catch { setMsg('❌ Network error - server may be restarting') }
    setSaving(false)
  }

  // ── Group registry by platform ──────────────────────────────────────────
  const byPlatform = new Map<string, EntityRegItem[]>()
  for (const [, item] of reg) {
    const plat = item.platform || 'unknown'
    if (!byPlatform.has(plat)) byPlatform.set(plat, [])
    byPlatform.get(plat)!.push(item)
  }
  const platformOrder = [...INTEGRATIONS.map(i => i.domain), 'demo', 'mqtt', 'isy994', 'lutron_caseta', 'yamaha_avr', 'envisalink', 'weather']
  const sortedPlatforms = [...platformOrder.filter(p => byPlatform.has(p)), ...[...byPlatform.keys()].filter(p => !platformOrder.includes(p))]

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="nav-title">🔌 Integrations</div>
            <button className="btn" style={{ fontSize: 14, padding: '2px 8px', marginBottom: 10 }}
              onClick={toggleTheme}>
              {document.documentElement.classList.contains('light') ? '🌙' : '☀️'}
            </button>
          </div>
          <div className="seg-ctrl" style={{ marginBottom: 10 }}>
            <button className={`seg-btn ${activeTab === 'devices' ? 'active' : ''}`}
              onClick={() => setActiveTab('devices')}>📋 Devices</button>
            <button className={`seg-btn ${activeTab === 'integrations' ? 'active' : ''}`}
              onClick={() => setActiveTab('integrations')}>⚙️ Config</button>
          </div>
        </div>

        {activeTab === 'devices' && (
          <>
            <div style={{
              position: 'sticky', top: 108, zIndex: 10, background: 'var(--bg)', padding: '8px 0',
            }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search devices…"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, marginBottom: 8 }}>
              {reg.size} devices · {byPlatform.size} integrations
            </div>

            {sortedPlatforms.map(platform => {
              const items = byPlatform.get(platform)!.filter(item => {
                if (!search) return true
                const q = search.toLowerCase()
                return item.entity_id.includes(q) || (item.name || '').toLowerCase().includes(q)
              })
              if (items.length === 0) return null
              const meta = INTEGRATIONS.find(i => i.domain === platform)
              const icon = meta?.icon ?? DOMAIN_ICONS[items[0]?.entity_id?.split('.')[0]] ?? '🔧'
              return (
                <div className="section" key={platform} style={{ marginTop: 12 }}>
                  <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{icon} {meta?.name ?? platform}</span>
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>({items.length})</span>
                  </div>
                  <div className="ios-list">
                    {items.sort((a, b) => a.entity_id.localeCompare(b.entity_id)).map(item => {
                      const st = states.get(item.entity_id)
                      const on = st?.state === 'on'
                      const domain = item.entity_id.split('.')[0]
                      const domainIcon = DOMAIN_ICONS[domain] ?? '🔧'
                      const isEditing = editingName === item.entity_id
                      const name = item.name || (st?.attributes?.friendly_name as string) || item.entity_id
                      return (
                        <div className="ios-list-row" key={item.entity_id}>
                          <div className="ios-list-icon" style={{
                            background: on ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.06)',
                          }}>{domainIcon}</div>
                          <div className="ios-list-content" style={{ flex: 1, minWidth: 0 }}>
                            {isEditing ? (
                              <form onSubmit={e => { e.preventDefault(); if (editValue.trim()) { updateReg(item.entity_id, { name: editValue.trim() }); setEditingName(null) } }}
                                style={{ display: 'flex', gap: 4 }}>
                                <input value={editValue} onChange={e => setEditValue(e.target.value)}
                                  style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
                                  onBlur={() => setEditingName(null)} autoFocus />
                              </form>
                            ) : (
                              <div className="ios-list-title" style={{ cursor: 'pointer' }}
                                onDoubleClick={() => { setEditingName(item.entity_id); setEditValue(name) }}>
                                {name}
                              </div>
                            )}
                            <div className="ios-list-subtitle">
                              <span style={{ color: on ? 'var(--green)' : 'var(--text2)', fontWeight: on ? 600 : 400 }}>
                                {st?.state ?? '—'}
                              </span>
                              <span style={{ marginLeft: 6 }}>{item.entity_id}</span>
                              {item.disabled && <span style={{ marginLeft: 6, color: 'var(--orange)' }}>⏸ Disabled</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }}
                              onClick={() => { setEditingName(item.entity_id); setEditValue(name) }}>✎</button>
                            {platform === 'demo' && (
                              <button className="btn" style={{ fontSize: 10, padding: '2px 6px', color: '#ff453a' }}
                                onClick={() => removeEntity(item.entity_id)}>✕</button>
                            )}
                            <label className="ios-toggle" style={{ transform: 'scale(0.8)' }}>
                              <input type="checkbox" checked={!item.disabled}
                                onChange={() => updateReg(item.entity_id, { disabled: !item.disabled })} />
                              <span className="ios-slider" />
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {activeTab === 'integrations' && (
          <>
            <div style={{ position: 'sticky', top: 108, zIndex: 10, background: 'var(--bg)', padding: '8px 0' }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search integrations…"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, marginBottom: 8 }}>
              Showing {filtered.length} of {INTEGRATIONS.length} integrations
              {enabledDomains.size > 0 && ` · ${enabledDomains.size} enabled`}
            </div>

            {filtered.map(int => {
              const cfg = configs[int.domain] || {}
              const isCollapsed = collapsed.has(int.domain)
              const configured = enabledDomains.has(int.domain)
              const status = loadedStatuses[int.domain]
              const isLoaded = status === 'loaded'
              const isFailed = status === 'failed'
              return (
                <div className="section" key={int.domain} style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => setCollapsed(prev => { const n = new Set(prev); if (n.has(int.domain)) n.delete(int.domain); else n.add(int.domain); return n })}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="section-title">{int.icon} {int.name}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        background: isLoaded ? 'rgba(48,209,88,0.2)' : isFailed ? 'rgba(255,69,58,0.2)' : configured ? 'rgba(255,159,10,0.2)' : 'rgba(255,255,255,0.08)',
                        color: isLoaded ? '#30d158' : isFailed ? '#ff453a' : configured ? '#ff9f0a' : 'var(--text3)' }}>
                        {isLoaded ? '✓ Loaded' : isFailed ? '✕ Failed' : configured ? '⏎ Pending' : '⚪'}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{isCollapsed ? '▶' : '▼'}</span>
                  </div>
                  {!isCollapsed && <>
                    <div style={{ fontSize: 12, color: 'var(--text2)', margin: '-4px 0 8px', paddingLeft: 4 }}>{int.desc}</div>
                    {int.fields.map(field => (
                      <div key={field.key} style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 2 }}>{field.label}</label>
                        <input type={field.type || 'text'} value={cfg[field.key] || ''}
                          onChange={e => updateField(int.domain, field.key, e.target.value)}
                          placeholder={field.placeholder || ''}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                      </div>
                    ))}
                    {int.domain === 'rti' && (
                      <RtiWebObjectPanel token={token} cfg={cfg} />
                    )}
                    {int.dynamicFields && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Devices</div>
                        {(cfg.devices || []).map((dev: any, idx: number) => (
                          <div key={idx} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                            {int.dynamicFields!.map(f => (
                              f.options
                                ? <select key={f.key} value={dev[f.key] || ''}
                                    onChange={e => updateDevice(int.domain, idx, f.key, e.target.value)}
                                    style={{ flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 11 }}>
                                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                : <input key={f.key} type={f.type || 'text'} value={dev[f.key] || ''}
                                    placeholder={f.placeholder || f.key}
                                    onChange={e => updateDevice(int.domain, idx, f.key, e.target.value)}
                                    style={{ flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 11 }} />
                            ))}
                            <button className="btn" style={{ fontSize: 10, padding: '2px 6px', color: '#ff453a' }}
                              onClick={() => removeDevice(int.domain, idx)}>✕</button>
                          </div>
                        ))}
                        <button className="btn" style={{ fontSize: 10, padding: '4px 10px' }}
                          onClick={() => addDevice(int.domain)}>+ Add device</button>
                      </div>
                    )}
                    {/* Show existing devices from this integration */}
                    {reg.size > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
                          Existing devices ({[...reg.values()].filter(e => e.platform === int.domain).length})
                        </div>
                        {[...reg.values()].filter(e => e.platform === int.domain).sort((a, b) => a.entity_id.localeCompare(b.entity_id)).map(item => (
                          <div key={item.entity_id} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 8px', borderRadius: 4, marginBottom: 2,
                            background: 'var(--surface2)', fontSize: 12,
                          }}>
                            <span style={{ fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.name || item.entity_id}
                            </span>
                            <span style={{ color: 'var(--text2)', fontSize: 10 }}>{item.entity_id}</span>
                            <button className="btn" style={{ fontSize: 9, padding: '1px 5px', color: '#ff453a' }}
                              onClick={() => removeEntity(item.entity_id)}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>}
                </div>
              )
            })}
          </>
        )}
      </div>

      {activeTab === 'integrations' && (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 20, background: 'var(--bg)', padding: '12px 16px calc(12px + var(--tab-h, 0px))', borderTop: '1px solid var(--sep)' }}>
          <button className="btn btn-accent" onClick={save} disabled={saving}
            style={{ width: '100%', fontSize: 13, padding: 12 }}>
            {saving ? 'Saving & Restarting…' : '💾 Save & Restart'}
          </button>
          {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg.startsWith('✅') ? '#30d158' : '#ff453a', whiteSpace: 'pre-line', textAlign: 'center' }}>{msg}</div>}
        </div>
      )}

      <div className="page-inner" style={{ paddingBottom: '100px' }}>
        {activeTab === 'integrations' && (
          <>
            <div className="section" style={{ marginTop: 24 }}>
              <div className="section-title">📋 Dashboard Cards</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', margin: '-4px 0 12px', paddingLeft: 4 }}>
                Edit <code style={{ fontSize: 11, background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>dashboard.yaml</code> — assign card types to entities for each 2D panel tab.
              </div>
              <DashboardYamlEditor token={token} />
            </div>
            <div className="section" style={{ marginTop: 24 }}>
              <div className="section-title">🏗️ 3D Floors</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', margin: '-4px 0 12px', paddingLeft: 4 }}>
                Name floors and upload .glb models (SketchUp, Blender exports).
              </div>
              <FloorsManager token={token} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RtiWebObjectPanel({ token, cfg }: { token: string | null; cfg: any }) {
  const [lltName, setLltName] = useState('RTI Panel')
  const [lltToken, setLltToken] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)

  const cmdPrefix = cfg.command_prefix || 'rti/command'
  const statePrefix = cfg.state_prefix || 'rti/state'

  const webObjectUrl = lltToken
    ? `${window.location.origin}/panel?token=${lltToken}`
    : `${window.location.origin}/panel?token=<paste-token-here>`

  const createToken = async () => {
    if (!token) return
    setCreating(true)
    try {
      const r = await fetch('/api/auth/long_lived_tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: lltName, expires_days: 3650 }),
      })
      if (r.ok) {
        const { token: t } = await r.json()
        setLltToken(t)
      }
    } finally {
      setCreating(false)
    }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', fontSize: 11, boxSizing: 'border-box', fontFamily: 'monospace',
  }

  return (
    <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(77,143,255,0.08)', border: '1px solid rgba(77,143,255,0.25)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#4d8fff', marginBottom: 10 }}>🎛️ RTI Integration Designer Setup</div>

      {/* MQTT topic reference */}
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
        <b style={{ color: 'var(--text)' }}>MQTT Driver topics</b>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text2)', minWidth: 80 }}>RTI → HA</span>
          <input readOnly value={`${cmdPrefix}/<domain>/<entity_name>`} style={inputStyle} onClick={e => (e.target as HTMLInputElement).select()} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text2)', minWidth: 80 }}>HA → RTI</span>
          <input readOnly value={`${statePrefix}/<domain>/<entity_name>`} style={inputStyle} onClick={e => (e.target as HTMLInputElement).select()} />
        </div>
      </div>

      {/* Example payloads */}
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}><b style={{ color: 'var(--text)' }}>Payload examples</b></div>
      <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12 }}>
        <div><span style={{ color: '#4d8fff' }}>{cmdPrefix}/light/living_room</span> ← <span style={{ color: '#30d158' }}>{`{"state":"ON","brightness_pct":80}`}</span></div>
        <div><span style={{ color: '#4d8fff' }}>{cmdPrefix}/switch/fan</span> ← <span style={{ color: '#30d158' }}>"TOGGLE"</span></div>
        <div><span style={{ color: '#4d8fff' }}>{cmdPrefix}/media_player/receiver</span> ← <span style={{ color: '#30d158' }}>{`{"state":"ON","volume":45,"source":"HDMI1"}`}</span></div>
        <div><span style={{ color: '#ff9f0a' }}>{statePrefix}/light/living_room</span> → <span style={{ color: 'var(--text2)' }}>{`{"state":"on","brightness_pct":78}`}</span></div>
      </div>

      {/* Web Object URL generator */}
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}><b style={{ color: 'var(--text)' }}>Web Object URL</b> (RTI touchpanel)</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input value={lltName} onChange={e => setLltName(e.target.value)}
          placeholder="Token name" style={{ ...inputStyle, flex: 1 }} />
        <button className="btn btn-accent" style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
          onClick={createToken} disabled={creating}>
          {creating ? '…' : '+ Token'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input ref={urlRef} readOnly value={webObjectUrl}
          style={{ ...inputStyle, flex: 1, color: lltToken ? 'var(--text)' : 'var(--text3)' }}
          onClick={e => (e.target as HTMLInputElement).select()} />
        <button className="btn" style={{ fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}
          onClick={() => copy(webObjectUrl)}>
          {copied ? '✓' : '📋'}
        </button>
      </div>
      {lltToken && (
        <div style={{ fontSize: 10, color: '#ff9f0a', marginTop: 4 }}>
          ⚠ Copy this URL now — token cannot be retrieved again.
        </div>
      )}
    </div>
  )
}

function DashboardYamlEditor({ token }: { token: string | null }) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    fetch('/api/config/dashboard/text', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setContent(d.content || ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const save = async () => {
    setErr('')
    const r = await fetch('/api/config/dashboard/text', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    else { const d = await r.json().catch(() => ({})); setErr(d.message || 'Save failed') }
  }

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
        Controls which cards appear in each tab of the 2D panel. No restart needed — refresh the panel page after saving.
      </div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%', minHeight: 320, padding: '10px 12px',
          borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--text)',
          fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6,
          resize: 'vertical', boxSizing: 'border-box', outline: 'none',
        }}
      />
      {err && <div style={{ fontSize: 11, color: '#ff453a', marginTop: 4 }}>{err}</div>}
      <button className="btn btn-accent" onClick={save}
        style={{ marginTop: 8, fontSize: 12, padding: '6px 16px' }}>
        {saved ? '✓ Saved' : '💾 Save'}
      </button>
    </div>
  )
}

function FloorsManager({ token }: { token: string | null }) {
  const [floors, setFloors] = useState<{ id: string; name: string; glb?: string }[]>([])
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [uploading, setUploading] = useState<string | null>(null)
  const [editingFloor, setEditingFloor] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    if (!token) return
    fetch('/api/config/floors', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((list: any[]) => {
        setFloors(list.map(f => ({ ...f, glb: f.glb || `floor_${f.id}.glb` })))
      }).catch(() => {})
  }, [token])

  const addFloor = async () => {
    if (!newId.trim() || !newName.trim()) return
    const r = await fetch('/api/config/floors', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId.trim(), name: newName.trim() }),
    })
    if (r.ok) {
      setFloors(prev => [...prev, { id: newId.trim(), name: newName.trim() }])
      setNewId(''); setNewName('')
    }
  }

  const renameFloor = async (id: string) => {
    if (!editName.trim()) return
    await fetch('/api/config/floors', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: editName.trim() }),
    })
    setFloors(prev => prev.map(f => f.id === id ? { ...f, name: editName.trim() } : f))
    setEditingFloor(null)
  }

  const deleteFloor = async (id: string) => {
    await fetch(`/api/config/floors/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setFloors(prev => prev.filter(f => f.id !== id))
  }

  const uploadGlb = async (floorId: string, file: File) => {
    setUploading(floorId)
    const form = new FormData()
    form.append('file', file)
    const r = await fetch(`/api/glb/upload/${floorId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (r.ok) {
      const data = await r.json()
      setFloors(prev => prev.map(f => f.id === floorId ? { ...f, glb: data.filename } : f))
    }
    setUploading(null)
  }

  return (
    <div>
      {(floors || []).map(f => {
        const editing = editingFloor === f.id
        return (
        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: 'var(--surface)', marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <input value={editName} onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') renameFloor(f.id); if (e.key === 'Escape') setEditingFloor(null) }}
                onBlur={() => renameFloor(f.id)}
                style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #555', background: '#222', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                autoFocus />
            ) : (
              <div style={{ fontSize: 14, color: 'var(--text)', cursor: 'pointer' }} onClick={() => { setEditingFloor(f.id); setEditName(f.name) }}>{f.name}</div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>ID: {f.id}{f.glb ? ` · ${f.glb}` : ' · no model'}</div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }}
              onClick={() => { setEditingFloor(f.id); setEditName(f.name) }}>✎</button>
            <label className="btn" style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer', margin: 0 }}>
              {uploading === f.id ? '⏳' : '📁'}
              <input type="file" accept=".glb,.gltf" style={{ display: 'none' }}
                onChange={e => { const fl = e.target.files?.[0]; if (fl) uploadGlb(f.id, fl); e.target.value = '' }} />
            </label>
            <button className="btn" style={{ fontSize: 10, padding: '2px 6px', color: '#ff453a' }}
              onClick={() => deleteFloor(f.id)}>✕</button>
          </div>
        </div>
      )})}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input value={newId} onChange={e => setNewId(e.target.value)} placeholder="ID (e.g. 4)"
          style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid #555', background: '#222', color: '#fff', fontSize: 12 }} />
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Floor name"
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #555', background: '#222', color: '#fff', fontSize: 12 }}
          onKeyDown={e => e.key === 'Enter' && addFloor()} />
        <button className="btn btn-accent" style={{ fontSize: 11, padding: '6px 12px' }} onClick={addFloor}>+ Add</button>
      </div>
    </div>
  )
}
