import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useHa } from '../context/HaContext'


interface FieldDef {
  key: string; label: string; placeholder?: string; default?: string; type?: string; options?: string[]
}

interface IntegrationDef {
  domain: string; name: string; icon: string; desc: string
  category: string
  fields: FieldDef[]
  dynamicFields?: { label: string; key: string; type?: string; placeholder?: string; options?: string[] }[]
  devicesLabel?: string
  addLabel?: string
}

const CATEGORIES = [
  { key: 'climate',    label: '🌡️ Climate & Sensors' },
  { key: 'lighting',   label: '💡 Lighting & Control' },
  { key: 'security',   label: '🔒 Security' },
  { key: 'media',      label: '🎛️ Media & AV' },
  { key: 'camera',     label: '📷 Cameras' },
  { key: 'protocol',   label: '📡 Protocols & Bridges' },
  { key: 'developer',  label: '🧪 Developer' },
]

const INTEGRATIONS: IntegrationDef[] = [
  { domain: 'nest_thermostat', name: 'Google Nest Thermostat', icon: '🌡️', category: 'climate',
    desc: 'Google Nest Thermostat via Smart Device Management (SDM) API',
    fields: [
      { key: 'project_id', label: 'SDM Project ID', placeholder: 'my-project-12345', default: '' },
      { key: 'client_id', label: 'OAuth Client ID', placeholder: '123456789-abc.apps.googleusercontent.com', default: '' },
      { key: 'client_secret', label: 'OAuth Client Secret', placeholder: '', default: '', type: 'password' },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: '', default: '', type: 'password' },
      { key: 'poll_interval', label: 'Poll interval (s)', placeholder: '60', default: '60', type: 'number' },
    ]},
  { domain: 'ecobee', name: 'Ecobee Thermostat', icon: '🌿', category: 'climate',
    desc: 'Ecobee smart thermostat via Ecobee API',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'From developer.ecobee.com', default: '' },
      { key: 'refresh_token', label: 'Refresh Token', placeholder: '', default: '', type: 'password' },
      { key: 'poll_interval', label: 'Poll interval (s)', placeholder: '180', default: '180', type: 'number' },
    ]},
  { domain: 'weather_station', name: 'Weather Station', icon: '🌤️', category: 'climate',
    desc: 'HTTP-polled temperature, humidity, wind sensor',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Weather Station', default: 'Weather Station' },
      { key: 'host', label: 'Host / IP', placeholder: '192.168.1.100', default: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', placeholder: '8080', default: '8080' },
      { key: 'interval_seconds', label: 'Poll interval (s)', type: 'number', placeholder: '60', default: '60' },
    ]},
  { domain: 'http_sensor', name: 'HTTP Sensor', icon: '📊', category: 'climate',
    desc: 'Poll any HTTP JSON endpoint for sensor values',
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
  { domain: 'lutron_caseta', name: 'Lutron Caseta', icon: '💡', category: 'lighting',
    desc: 'Lutron Caseta Smart Bridge',
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
  { domain: 'isy994', name: 'ISY994 / Insteon', icon: '🏗️', category: 'lighting',
    desc: 'ISY994 home automation controller (Insteon, Z-Wave)',
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
  { domain: 'envisalink', name: 'EnvisaLink (DSC/Honeywell)', icon: '🔒', category: 'security',
    desc: 'DSC/Honeywell alarm panels via EnvisaLink',
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
  { domain: 'rti', name: 'RTI Control (MQTT Bridge)', icon: '🎛️', category: 'media',
    desc: 'RTI XP processor ↔ HA via MQTT. Bidirectional: RTI buttons control devices, HA state feeds back to RTI variables.',
    fields: [
      { key: 'broker', label: 'MQTT Broker IP', placeholder: '192.168.1.10', default: 'localhost' },
      { key: 'port', label: 'Port', placeholder: '1883', default: '1883', type: 'number' },
      { key: 'username', label: 'Username (optional)', placeholder: '', default: '' },
      { key: 'password', label: 'Password (optional)', placeholder: '', default: '', type: 'password' },
      { key: 'command_prefix', label: 'Command prefix (RTI → HA)', placeholder: 'rti/command', default: 'rti/command' },
      { key: 'state_prefix', label: 'State prefix (HA → RTI)', placeholder: 'rti/state', default: 'rti/state' },
    ],
    dynamicFields: [
      { label: 'Entity ID', key: 'entity_id', placeholder: 'light.demo_living_room' },
      { label: 'Subscribe topic (RTI→HA)', key: 'subscribe_topic', placeholder: 'rti/cmd/light1' },
      { label: 'Publish topic (HA→RTI)', key: 'publish_topic', placeholder: 'rti/fb/light1' },
      { label: 'Payload ON', key: 'payload_on', placeholder: 'ON' },
      { label: 'Payload OFF', key: 'payload_off', placeholder: 'OFF' },
    ],
    devicesLabel: 'Entity Mappings',
    addLabel: '+ Add mapping',
  },
  { domain: 'rtsp2hls', name: 'RTSP to HLS', icon: '📷', category: 'camera',
    desc: 'IP cameras via RTSP → HLS (requires FFmpeg). Shown in Security tab.',
    fields: [],
    dynamicFields: [
      { label: 'Name', key: 'name', placeholder: 'Driveway' },
      { label: 'RTSP URL', key: 'rtsp_url', placeholder: 'rtsp://user:pass@ip:554/stream' },
    ]},
  { domain: 'rtsp2webrtc', name: 'RTSP to WebRTC', icon: '🔴', category: 'camera',
    desc: 'IP cameras via RTSP → WebRTC (go2rtc, low-latency). Shown in Security tab.',
    fields: [],
    devicesLabel: 'Cameras',
    addLabel: '+ Add camera',
    dynamicFields: [
      { label: 'Name', key: 'name', placeholder: 'Front Door' },
      { label: 'RTSP URL', key: 'rtsp_url', placeholder: 'rtsp://user:pass@ip:554/stream' },
    ]},
  { domain: 'mqtt', name: 'MQTT', icon: '📡', category: 'protocol',
    desc: 'MQTT broker connection (Tasmota, ESPHome, Sonoff...)',
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
  { domain: 'demo', name: 'Demo', icon: '🧪', category: 'developer',
    desc: 'Simulated test devices (lights, switches, sensors)',
    fields: [{ key: 'enable', label: 'Enable demo devices', type: 'checkbox', default: 'true' }]},
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

// ── Plugin Marketplace ───────────────────────────────────────────────────────

const MARKETPLACE = [
  { domain: 'rtsp2hls', name: 'RTSP to HLS Camera', icon: '📹', category: 'Cameras', desc: 'Stream RTSP cameras in the browser via HLS transcoding. Requires ffmpeg.' },
  { domain: 'zigbee2mqtt', name: 'Zigbee2MQTT Bridge', icon: '📡', category: 'Protocols', desc: 'Integrate all Zigbee devices via Zigbee2MQTT (MQTT bridge).' },
  { domain: 'tasmota', name: 'Tasmota', icon: '💡', category: 'Smart Plugs', desc: 'Auto-discover and control Tasmota-flashed devices on the local network.' },
  { domain: 'esphome', name: 'ESPHome', icon: '🔧', category: 'DIY', desc: 'Native integration for ESPHome-based sensors and actuators.' },
  { domain: 'shelly', name: 'Shelly', icon: '🔌', category: 'Smart Plugs', desc: 'Control Shelly Gen1/Gen2 relays, dimmers, and energy meters.' },
  { domain: 'tuya_local', name: 'Tuya Local', icon: '🏠', category: 'Smart Home', desc: 'Control Tuya/Smart Life devices locally without cloud dependency.' },
  { domain: 'broadlink', name: 'Broadlink RM', icon: '📻', category: 'IR/RF', desc: 'Learn and send IR/RF codes via Broadlink RM mini/pro devices.' },
  { domain: 'govee', name: 'Govee Lights', icon: '🌈', category: 'Lighting', desc: 'Control Govee RGB LED strips and bulbs via local LAN API.' },
  { domain: 'modbus', name: 'Modbus', icon: '⚙️', category: 'Industrial', desc: 'Read/write Modbus TCP/RTU registers — useful for solar inverters and meters.' },
  { domain: 'mqtt_sensor', name: 'MQTT Sensors', icon: '📡', category: 'MQTT', desc: 'Create sensors that subscribe to arbitrary MQTT topics.' },
]

function PluginsTab({ token }: { token: string }) {
  const [installed, setInstalled] = useState<{ domain: string; name: string; version: string; description: string; loaded: boolean }[]>([])
  const [installUrl, setInstallUrl] = useState('')
  const [installName, setInstallName] = useState('')
  const [installing, setInstalling] = useState(false)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(true)

  const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const flash = (t: string, ok = true) => { setMsg(t); setMsgOk(ok); setTimeout(() => setMsg(''), 4000) }

  const load = () => {
    fetch('/api/plugins', { headers: hdrs })
      .then(r => r.json()).then(d => setInstalled(d.plugins ?? [])).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const install = async (url?: string, name?: string) => {
    const u = url ?? installUrl
    if (!u.trim()) return
    setInstalling(true)
    try {
      const r = await fetch('/api/plugins/install', { method: 'POST', headers: hdrs, body: JSON.stringify({ url: u, name: (name ?? installName) || undefined }) })
      const d = await r.json()
      if (d.ok) { flash('✅ ' + d.message); setInstallUrl(''); setInstallName(''); load() }
      else flash('❌ ' + (d.message ?? 'Failed'), false)
    } catch { flash('❌ Network error', false) }
    setInstalling(false)
  }

  const uninstall = async (domain: string) => {
    setUninstalling(domain)
    const r = await fetch(`/api/plugins/${domain}`, { method: 'DELETE', headers: hdrs })
    const d = await r.json()
    if (d.ok) { flash('Removed ' + domain); load() }
    else flash('❌ ' + d.message, false)
    setUninstalling(null)
  }

  const installedDomains = new Set(installed.map(p => p.domain))

  return (
    <div>
      {/* Install from URL */}
      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>📦 Install from Git URL</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input value={installUrl} onChange={e => setInstallUrl(e.target.value)}
            placeholder="https://github.com/user/ha-plugin.git"
            style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }} />
          <input value={installName} onChange={e => setInstallName(e.target.value)}
            placeholder="name (opt)"
            style={{ width: 90, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }} />
          <button className="btn btn-accent" onClick={() => install()} disabled={installing || !installUrl} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {installing ? '…' : 'Install'}
          </button>
        </div>
        {msg && <div style={{ fontSize: 12, color: msgOk ? '#30d158' : '#ff453a', marginTop: 4 }}>{msg}</div>}
      </div>

      {/* Installed */}
      {installed.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, letterSpacing: 0.5 }}>INSTALLED ({installed.length})</div>
          {installed.map(p => (
            <div key={p.domain} style={{ background: 'var(--card)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{MARKETPLACE.find(m => m.domain === p.domain)?.icon ?? '🧩'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>v{p.version} · {p.loaded ? '✓ loaded' : 'not loaded'}</div>
              </div>
              <button onClick={() => uninstall(p.domain)} disabled={uninstalling === p.domain}
                style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: '#ff453a22', color: '#ff453a', cursor: 'pointer', fontSize: 11 }}>
                {uninstalling === p.domain ? '…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Marketplace */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, letterSpacing: 0.5 }}>MARKETPLACE</div>
      {MARKETPLACE.map(p => {
        const isInstalled = installedDomains.has(p.domain)
        return (
          <div key={p.domain} style={{ background: 'var(--card)', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 24, lineHeight: 1, paddingTop: 2, flexShrink: 0 }}>{p.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: '#4d8fff', background: '#4d8fff15', borderRadius: 4, padding: '1px 6px', display: 'inline-block', marginBottom: 4 }}>{p.category}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>{p.desc}</div>
            </div>
            {isInstalled
              ? <span style={{ flexShrink: 0, fontSize: 11, color: '#30d158', background: '#30d15820', borderRadius: 6, padding: '4px 8px' }}>✓ Installed</span>
              : <button onClick={() => install(`https://github.com/home-assistant-plugins/${p.domain}.git`, p.domain)}
                  disabled={installing}
                  style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#0a84ff', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  Install
                </button>
            }
          </div>
        )
      })}
    </div>
  )
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
  const [subTab, setSubTab] = useState<'integrations' | 'yaml' | 'dashboard' | 'floors' | 'areas' | 'plugins'>('integrations')
  const yamlRef  = useRef<{ save: () => Promise<{ok:boolean;msg:string}> }>(null)
  const dashRef  = useRef<{ save: () => Promise<{ok:boolean;msg:string}> }>(null)
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorMsg,    setEditorMsg]    = useState('')

  const handleEditorSave = async (ref: React.RefObject<{ save: () => Promise<{ok:boolean;msg:string}> } | null>) => {
    if (!ref.current) return
    setEditorSaving(true); setEditorMsg('')
    const { ok, msg } = await ref.current.save()
    setEditorSaving(false); setEditorMsg(msg)
    if (ok) setTimeout(() => setEditorMsg(''), 3000)
  }

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
            if ((domain === 'rtsp2hls' || domain === 'rtsp2webrtc') && k === 'cameras') {
              existing.devices = (v as any[]).map((cam: any) => ({
                name: cam.name || '',
                rtsp_url: cam.rtsp_url || (cam.streams?.[0]?.rtsp_url) || '',
              }))
            } else if (domain === 'rti' && k === 'entities') {
              existing.devices = v as any[]
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
    const iv = setInterval(load, 60000)
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
          if ((domain === 'rtsp2hls' || domain === 'rtsp2webrtc') && k === 'cameras') {
            existing.devices = (v as any[]).map((cam: any) => ({
              name: cam.name || '',
              rtsp_url: cam.rtsp_url || (cam.streams?.[0]?.rtsp_url) || '',
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
            if (Array.isArray(v) && v.length > 0)
              out.cameras = v.map((d: any) => ({ name: d.name || 'Camera', streams: [{ label: 'Main', rtsp_url: d.rtsp_url }] }))
          } else if (k === 'devices' && int.domain === 'rtsp2webrtc') {
            if (Array.isArray(v) && v.length > 0)
              out.cameras = v.map((d: any) => ({ name: d.name || 'Camera', rtsp_url: d.rtsp_url || '' }))
          } else if (k === 'devices' && int.domain === 'rti') {
            if (Array.isArray(v) && v.length > 0) out.entities = v.filter((d: any) => d.entity_id)
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

  // ── Render a single integration card ───────────────────────────────────
  const renderIntegration = (int: IntegrationDef) => {
    const cfg = configs[int.domain] || {}
    const isCollapsed = collapsed.has(int.domain)
    const configured = enabledDomains.has(int.domain)
    const status = loadedStatuses[int.domain]
    const isLoaded = status === 'loaded'
    const isFailed = status === 'failed'

    const statusColor = isLoaded ? '#30d158' : isFailed ? '#ff453a' : configured ? '#ff9f0a' : 'var(--text3)'
    const statusBg    = isLoaded ? 'rgba(48,209,88,0.14)' : isFailed ? 'rgba(255,69,58,0.14)' : configured ? 'rgba(255,159,10,0.14)' : 'rgba(255,255,255,0.07)'
    const statusLabel = isLoaded ? '● Loaded' : isFailed ? '● Failed' : configured ? '● Pending' : '○ Off'

    const registeredItems = [...reg.values()].filter(e => e.platform === int.domain)

    return (
      <div key={int.domain} style={{
        marginTop: 10, borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--card)', overflow: 'hidden',
      }}>
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', cursor: 'pointer',
            borderBottom: isCollapsed ? 'none' : '1px solid var(--sep)',
          }}
          onClick={() => setCollapsed(prev => { const n = new Set(prev); if (n.has(int.domain)) n.delete(int.domain); else n.add(int.domain); return n })}>

          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>{int.icon}</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{int.name}</div>
            {isCollapsed && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{int.desc}</div>
            )}
          </div>

          <span style={{
            fontSize: 10, padding: '3px 9px', borderRadius: 20,
            background: statusBg, color: statusColor,
            fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
          }}>{statusLabel}</span>

          <span style={{
            fontSize: 11, color: 'var(--text2)', flexShrink: 0,
            display: 'inline-block',
            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}>▼</span>
        </div>

        {/* ── Body ── */}
        {!isCollapsed && (
          <div style={{ padding: '14px 14px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.55 }}>{int.desc}</div>

            {/* Static fields */}
            {int.fields.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {int.fields.map(field => (
                  field.type === 'checkbox' ? (
                    <label key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input type="checkbox"
                        checked={cfg[field.key] !== 'false' && (cfg[field.key] === 'true' || field.default === 'true')}
                        onChange={e => updateField(int.domain, field.key, e.target.checked ? 'true' : 'false')}
                        style={{ width: 16, height: 16, accentColor: '#0a84ff', cursor: 'pointer' }} />
                      <span style={{ fontSize: 13, color: 'var(--text)' }}>{field.label}</span>
                    </label>
                  ) : (
                    <div key={field.key}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>{field.label}</label>
                      <input
                        type={field.type || 'text'}
                        value={cfg[field.key] || ''}
                        onChange={e => updateField(int.domain, field.key, e.target.value)}
                        placeholder={field.placeholder || ''}
                        style={{
                          width: '100%', padding: '10px 12px',
                          borderRadius: 10, border: '1px solid var(--border)',
                          background: 'var(--surface)', color: 'var(--text)',
                          fontSize: 13, boxSizing: 'border-box', outline: 'none',
                        }}
                      />
                    </div>
                  )
                ))}
              </div>
            )}

            {/* Dynamic device cards */}
            {int.dynamicFields && (
              <div style={{ marginTop: int.fields.length > 0 ? 18 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{int.devicesLabel ?? 'Devices'}</span>
                  <button className="btn" style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20 }}
                    onClick={() => addDevice(int.domain)}>{int.addLabel ?? '+ Add'}</button>
                </div>

                {(cfg.devices || []).length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '16px 0', borderRadius: 10, border: '1px dashed var(--border)' }}>
                    No devices yet
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(cfg.devices || []).map((dev: any, idx: number) => {
                    const devLabel = dev.name || dev.entity_id || `#${idx + 1}`
                    return (
                      <div key={idx} style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', overflow: 'hidden' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--sep)',
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{devLabel}</span>
                          <button className="btn" style={{ fontSize: 10, padding: '2px 8px', color: '#ff453a', borderRadius: 6 }}
                            onClick={() => removeDevice(int.domain, idx)}>✕ Remove</button>
                        </div>
                        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {int.dynamicFields!.map(f => (
                            <div key={f.key}>
                              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>{f.label || f.key}</label>
                              {f.options
                                ? <select value={dev[f.key] || ''}
                                    onChange={e => updateDevice(int.domain, idx, f.key, e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, outline: 'none' }}>
                                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                : <input type={f.type || 'text'} value={dev[f.key] || ''}
                                    placeholder={f.placeholder || ''}
                                    onChange={e => updateDevice(int.domain, idx, f.key, e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, boxSizing: 'border-box', outline: 'none' }} />
                              }
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {int.domain === 'rti' && <RtiWebObjectPanel token={token} cfg={cfg} />}

            {/* Registered entities */}
            {registeredItems.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                  Registered entities ({registeredItems.length})
                </div>
                <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  {registeredItems.sort((a, b) => a.entity_id.localeCompare(b.entity_id)).map((item, i, arr) => (
                    <div key={item.entity_id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                      borderBottom: i < arr.length - 1 ? '1px solid var(--sep)' : 'none',
                      background: 'var(--surface)', fontSize: 12,
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: states.get(item.entity_id)?.state === 'on' ? '#30d158' : 'rgba(255,255,255,0.2)' }} />
                      <span style={{ fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>{item.name || item.entity_id}</span>
                      <span style={{ color: 'var(--text2)', fontSize: 10, flexShrink: 0 }}>{item.entity_id}</span>
                      <button className="btn" style={{ fontSize: 9, padding: '1px 6px', color: '#ff453a', flexShrink: 0 }}
                        onClick={() => removeEntity(item.entity_id)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Areas panel (inline) ────────────────────────────────────────────────────
  const [areas, setAreas] = useState<{area_id:string;name:string}[]>([])
  const [areaEntities, setAreaEntities] = useState<{entity_id:string;name:string|null;area_id:string|null}[]>([])
  const [newAreaName, setNewAreaName] = useState('')
  const [assigningId, setAssigningId] = useState<string|null>(null)

  useEffect(() => {
    if (subTab !== 'areas' || !token) return
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    fetch('/api/area_registry',   { headers: h }).then(r => r.json()).then(setAreas).catch(() => {})
    fetch('/api/entity_registry', { headers: h }).then(r => r.json()).then(setAreaEntities).catch(() => {})
  }, [subTab, token])

  const createArea = async () => {
    if (!newAreaName.trim()) return
    const r = await fetch('/api/area_registry', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newAreaName.trim() }) })
    if (r.ok) { const a = await r.json(); setAreas(prev => [...prev, a]); setNewAreaName('') }
  }
  const deleteArea = async (id: string) => {
    await fetch(`/api/area_registry/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setAreas(prev => prev.filter(a => a.area_id !== id))
  }
  const assignArea = async (entityId: string, areaId: string | null) => {
    const r = await fetch(`/api/entity_registry/${entityId}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ area_id: areaId }) })
    if (r.ok) { setAreaEntities(prev => prev.map(e => e.entity_id === entityId ? { ...e, area_id: areaId } : e)); setAssigningId(null) }
  }

  const SUB_TABS = [
    { key: 'integrations', label: '🔌 Integrations' },
    { key: 'plugins',      label: '🧩 Plugins' },
    { key: 'yaml',         label: '⚙️ Config YAML' },
    { key: 'dashboard',    label: '📋 Dashboard' },
    { key: 'floors',       label: '🏗️ Floors' },
    { key: 'areas',        label: '🏠 Areas' },
  ] as const

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 'var(--tab-h, 0px)', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, padding: '12px 16px 0', background: 'var(--bg)', borderBottom: '1px solid var(--sep)' }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>⚙️ Config</div>
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10 }}>
          {SUB_TABS.map(t => (
            <button key={t.key} onClick={() => setSubTab(t.key)} style={{
              flexShrink: 0, fontSize: 12, padding: '6px 14px', borderRadius: 20,
              border: '1px solid var(--border)',
              background: subTab === t.key ? '#0a84ff' : 'var(--card)',
              color: subTab === t.key ? '#fff' : 'var(--text)',
              fontWeight: subTab === t.key ? 600 : 400,
              cursor: 'pointer', outline: 'none',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any, padding: '12px 16px' }}>

        {/* Integrations */}
        {subTab === 'integrations' && (
          <>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search integrations…"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }} />
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
              {filtered.length} of {INTEGRATIONS.length} integrations
              {enabledDomains.size > 0 && ` · ${enabledDomains.size} enabled`}
            </div>
            {CATEGORIES.map(cat => {
              const catItems = filtered.filter(i => i.category === cat.key)
              if (catItems.length === 0) return null
              return (
                <div key={cat.key}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '18px 0 6px', paddingLeft: 4 }}>
                    {cat.label}
                  </div>
                  {catItems.map(int => renderIntegration(int))}
                </div>
              )
            })}
            {filtered.filter(i => !CATEGORIES.find(c => c.key === i.category)).map(int => renderIntegration(int))}
            <div style={{ height: 20 }} />
          </>
        )}

        {/* Config YAML */}
        {subTab === 'yaml' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.5 }}>直接编辑主配置文件，保存后自动重启服务。</div>
            <ConfigYamlEditor ref={yamlRef} token={token} fullHeight />
          </div>
        )}

        {/* Dashboard */}
        {subTab === 'dashboard' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.5 }}>
              编辑 <code style={{ fontSize: 11, background: 'var(--surface)', padding: '1px 4px', borderRadius: 3 }}>dashboard.yaml</code> — 为每个 2D 面板标签分配实体和卡片类型。
            </div>
            <DashboardYamlEditor ref={dashRef} token={token} fullHeight />
          </div>
        )}

        {/* Floors */}
        {subTab === 'floors' && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.5 }}>管理楼层名称并上传 .glb 模型（SketchUp、Blender 导出）。</div>
            <FloorsManager token={token} />
          </div>
        )}

        {subTab === 'areas' && (
          <>
            {/* Create area */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
                placeholder="New area name…"
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
                onKeyDown={e => e.key === 'Enter' && createArea()} />
              <button className="btn btn-accent" style={{ fontSize: 12 }} onClick={createArea}>Add</button>
            </div>
            {/* Area list */}
            <div className="ios-list" style={{ marginBottom: 18 }}>
              {areas.map(a => (
                <div className="ios-list-row" key={a.area_id}>
                  <div className="ios-list-icon" style={{ background: 'rgba(10,132,255,0.15)' }}>🏠</div>
                  <div className="ios-list-content">
                    <div className="ios-list-title">{a.name}</div>
                    <div className="ios-list-subtitle">{a.area_id} · {areaEntities.filter(e => e.area_id === a.area_id).length} entities</div>
                  </div>
                  <button className="btn" style={{ fontSize: 11, padding: '4px 8px', color: '#ff453a' }} onClick={() => deleteArea(a.area_id)}>✕</button>
                </div>
              ))}
              {areas.length === 0 && <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>No areas yet</div>}
            </div>
            {/* Assign entities */}
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Assign Entities to Areas</div>
            <div className="ios-list">
              {areaEntities.slice().sort((a,b) => (a.area_id||'zzz').localeCompare(b.area_id||'zzz') || a.entity_id.localeCompare(b.entity_id)).map(e => {
                const areaName = areas.find(a => a.area_id === e.area_id)?.name
                return (
                  <div className="ios-list-row" key={e.entity_id}>
                    <div className="ios-list-content" style={{ flex: 1, minWidth: 0 }}>
                      <div className="ios-list-title">{e.name || e.entity_id}</div>
                      <div className="ios-list-subtitle">{areaName ? `🏠 ${areaName}` : 'No area'}</div>
                    </div>
                    {assigningId === e.entity_id ? (
                      <select value={e.area_id || ''} autoFocus
                        onChange={ev => assignArea(e.entity_id, ev.target.value || null)}
                        onBlur={() => setAssigningId(null)}
                        style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
                        <option value="">— None —</option>
                        {areas.map(a => <option key={a.area_id} value={a.area_id}>{a.name}</option>)}
                      </select>
                    ) : (
                      <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setAssigningId(e.entity_id)}>Edit</button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
        {subTab === 'plugins' && <PluginsTab token={token ?? ''} />}

      </div>

      {/* ── Unified save bar ── */}
      {(subTab === 'integrations' || subTab === 'yaml' || subTab === 'dashboard') && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px calc(8px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--sep)', background: 'var(--bg)' }}>
          <button className="btn btn-accent"
            disabled={subTab === 'integrations' ? saving : editorSaving}
            onClick={() => {
              if (subTab === 'integrations') save()
              else if (subTab === 'yaml') handleEditorSave(yamlRef)
              else handleEditorSave(dashRef)
            }}
            style={{ fontSize: 12, padding: '6px 16px' }}>
            {subTab === 'integrations'
              ? (saving ? '…' : '💾 Save & Restart')
              : subTab === 'yaml'
                ? (editorSaving ? '…' : editorMsg.startsWith('✓') ? editorMsg : '💾 Save & Restart')
                : (editorSaving ? '…' : editorMsg.startsWith('✓') ? editorMsg : '💾 Save')}
          </button>
          {subTab === 'integrations' && msg && <div style={{ fontSize: 12, color: msg.startsWith('✅') ? '#30d158' : '#ff453a' }}>{msg}</div>}
          {(subTab === 'yaml' || subTab === 'dashboard') && editorMsg && !editorMsg.startsWith('✓') && (
            <div style={{ fontSize: 12, color: '#ff453a' }}>{editorMsg}</div>
          )}
        </div>
      )}
    </div>
  )
}


function RtiWebObjectPanel({ token, cfg }: { token: string | null; cfg: any }) {
  const devices: any[] = cfg.devices || []
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

      {/* Per-entity topic table */}
      {devices.filter((d: any) => d.entity_id).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}><b style={{ color: 'var(--text)' }}>Entity topic map</b></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: 'monospace' }}>
              <thead>
                <tr style={{ color: 'var(--text3)', textAlign: 'left' }}>
                  <th style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>Entity</th>
                  <th style={{ padding: '2px 6px', whiteSpace: 'nowrap', color: '#4d8fff' }}>Subscribe (RTI→HA)</th>
                  <th style={{ padding: '2px 6px', whiteSpace: 'nowrap', color: '#ff9f0a' }}>Publish (HA→RTI)</th>
                  <th style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>ON / OFF</th>
                </tr>
              </thead>
              <tbody>
                {devices.filter((d: any) => d.entity_id).map((d: any, i: number) => (
                  <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '3px 6px', color: 'var(--text)' }}>{d.entity_id}</td>
                    <td style={{ padding: '3px 6px', color: '#4d8fff' }}>{d.subscribe_topic || '—'}</td>
                    <td style={{ padding: '3px 6px', color: '#ff9f0a' }}>{d.publish_topic || '—'}</td>
                    <td style={{ padding: '3px 6px', color: 'var(--text2)' }}>{d.payload_on || 'ON'} / {d.payload_off || 'OFF'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

type EditorHandle = { save: () => Promise<{ok:boolean;msg:string}> }

function validateYaml(text: string): string | null {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.includes('\t')) return `Line ${i+1}: YAML does not allow tabs — use spaces`
    const trimmed = raw.trimStart()
    if (!trimmed || trimmed.startsWith('#')) continue
    // Detect duplicate colon in key (e.g. "key:: value")
    if (/^[^:#\[\{'"]+::/.test(trimmed)) return `Line ${i+1}: Double colon detected`
    // Detect unclosed bracket
    const opens = (raw.match(/\[|\{/g) || []).length
    const closes = (raw.match(/\]|\}/g) || []).length
    if (opens !== closes) return `Line ${i+1}: Unclosed bracket`
  }
  return null
}

const ConfigYamlEditor = forwardRef<EditorHandle, { token: string | null; fullHeight?: boolean }>(
  ({ token, fullHeight }, ref) => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [yamlError, setYamlError] = useState<string|null>(null)

  useEffect(() => {
    if (!token) return
    fetch('/api/config/text', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setContent(d.content || ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const onChange = (v: string) => { setContent(v); setYamlError(validateYaml(v)) }

  const save = async (): Promise<{ok:boolean;msg:string}> => {
    const err = validateYaml(content)
    if (err) return { ok: false, msg: `⚠ ${err}` }
    try {
      const r = await fetch('/api/config/text', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (r.ok) return { ok: true, msg: '✓ Saved — restarting' }
      const d = await r.json().catch(() => ({}))
      return { ok: false, msg: d.message || 'Save failed' }
    } catch { return { ok: false, msg: 'Network error' } }
  }

  useImperativeHandle(ref, () => ({ save }))

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: fullHeight ? 1 : undefined, minHeight: 0, gap: 4 }}>
      <textarea
        value={content}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%', flex: fullHeight ? 1 : undefined,
          minHeight: fullHeight ? 0 : 580,
          padding: '10px 12px',
          borderRadius: 8, border: `1px solid ${yamlError ? '#ff453a' : 'var(--border)'}`,
          background: 'var(--surface)', color: 'var(--text)',
          fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6,
          resize: fullHeight ? 'none' : 'vertical', boxSizing: 'border-box', outline: 'none',
        }}
      />
      {yamlError && <div style={{ fontSize: 11, color: '#ff453a', padding: '2px 4px' }}>⚠ {yamlError}</div>}
    </div>
  )
})

const DashboardYamlEditor = forwardRef<EditorHandle, { token: string | null; fullHeight?: boolean }>(
  ({ token, fullHeight }, ref) => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [yamlError, setYamlError] = useState<string|null>(null)

  useEffect(() => {
    if (!token) return
    fetch('/api/config/dashboard/text', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setContent(d.content || ''); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const onChange = (v: string) => { setContent(v); setYamlError(validateYaml(v)) }

  const save = async (): Promise<{ok:boolean;msg:string}> => {
    const err = validateYaml(content)
    if (err) return { ok: false, msg: `⚠ ${err}` }
    const r = await fetch('/api/config/dashboard/text', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (r.ok) return { ok: true, msg: '✓ Saved' }
    const d = await r.json().catch(() => ({}))
    return { ok: false, msg: d.message || 'Save failed' }
  }

  useImperativeHandle(ref, () => ({ save }))

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text2)' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: fullHeight ? 1 : undefined, minHeight: 0, gap: 4 }}>
      <textarea
        value={content}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%', flex: fullHeight ? 1 : undefined,
          minHeight: fullHeight ? 0 : 320,
          padding: '10px 12px',
          borderRadius: 8, border: `1px solid ${yamlError ? '#ff453a' : 'var(--border)'}`,
          background: 'var(--surface)', color: 'var(--text)',
          fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6,
          resize: fullHeight ? 'none' : 'vertical', boxSizing: 'border-box', outline: 'none',
        }}
      />
      {yamlError && <div style={{ fontSize: 11, color: '#ff453a', padding: '2px 4px' }}>⚠ {yamlError}</div>}
    </div>
  )
})

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
