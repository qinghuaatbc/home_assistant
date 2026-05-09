import { useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'

const INTEGRATIONS = [
  { domain: 'demo', name: 'Demo', icon: '🧪', desc: 'Simulated test devices (lights, switches, sensors)',
    fields: [
      { key: 'enable', label: 'Enable demo devices', type: 'checkbox', default: true },
    ]},
  { domain: 'mqtt', name: 'MQTT', icon: '📡', desc: 'Connect MQTT devices (Tasmota, ESPHome, Sonoff...)',
    fields: [
      { key: 'broker', label: 'Broker', placeholder: 'broker.hivemq.com', default: 'broker.hivemq.com' },
      { key: 'port', label: 'Port', placeholder: '1883', default: '1883', type: 'number' },
      { key: 'username', label: 'Username (optional)', placeholder: '', default: '' },
      { key: 'password', label: 'Password (optional)', placeholder: '', default: '', type: 'password' },
    ]},
  { domain: 'lutron_caseta', name: 'Lutron Caseta', icon: '💡', desc: 'Lutron Caseta Smart Bridge',
    fields: [
      { key: 'host', label: 'Bridge IP', placeholder: '192.168.1.167', default: '' },
      { key: 'port', label: 'Port', placeholder: '23', default: '23', type: 'number' },
    ]},
  { domain: 'camera', name: 'Camera (RTSP)', icon: '📷', desc: 'RTSP camera streams',
    fields: [
      { key: 'name', label: 'Camera Name', placeholder: 'Driveway', default: '' },
      { key: 'rtsp_url', label: 'RTSP URL', placeholder: 'rtsp://user:pass@host:554/stream', default: '' },
    ]},
  { domain: 'isy994', name: 'ISY994 / Insteon', icon: '🏗️', desc: 'ISY994 home automation controller',
    fields: [
      { key: 'host', label: 'ISY IP', placeholder: '192.168.1.100', default: '' },
      { key: 'username', label: 'Username', placeholder: 'admin', default: 'admin' },
      { key: 'password', label: 'Password', placeholder: 'admin', default: 'admin', type: 'password' },
    ]},
  { domain: 'yamaha_avr', name: 'Yamaha AVR', icon: '🎵', desc: 'Yamaha AV receiver',
    fields: [
      { key: 'host', label: 'Receiver IP', placeholder: '192.168.1.50', default: '' },
    ]},
]

export default function IntegrationsPage() {
  const { token } = useHa()
  const [configs, setConfigs] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!token) return
    fetch('/api/config', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).catch(() => {})
  }, [token])

  const updateField = (domain: string, key: string, value: string) => {
    setConfigs(prev => ({
      ...prev,
      [domain]: { ...(prev[domain] || {}), [key]: value },
    }))
  }

  const getYaml = (domain: string) => {
    const cfg = configs[domain] || {}
    const int = INTEGRATIONS.find(i => i.domain === domain)
    const lines = [`  - domain: ${domain}`]
    for (const field of int?.fields || []) {
      const val = cfg[field.key] || field.default
      if (val) lines.push(`    ${field.key}: ${val}`)
    }
    return lines.join('\n')
  }

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      const lines = ['# Integration configuration', '# Copy these blocks into config/configuration.yaml under integrations:']
      for (const int of INTEGRATIONS) {
        const cfg = configs[int.domain]
        if (!cfg || !Object.values(cfg).some(Boolean)) continue
        lines.push('')
        lines.push(`  # ${int.name}`)
        lines.push(`  - domain: ${int.domain}`)
        for (const field of int.fields) {
          const val = cfg[field.key]
          if (val) lines.push(`    ${field.key}: ${val}`)
        }
      }
      setMsg('✅ Copy the YAML below into config/configuration.yaml\nThen restart the server.')
    } catch { setMsg('❌ Error') }
    setSaving(false)
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">🔌 Integrations</div>
        </div>

        {INTEGRATIONS.map(int => {
          const cfg = configs[int.domain] || {}
          const hasValues = Object.values(cfg).some(Boolean)
          return (
            <div className="section" key={int.domain} style={{ marginTop: 20 }}>
              <div className="section-title">{int.icon} {int.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', margin: '-4px 0 8px', paddingLeft: 4 }}>{int.desc}</div>
              {int.fields.map(field => (
                <div key={field.key} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 2 }}>{field.label}</label>
                  <input type={field.type || 'text'} value={cfg[field.key] || ''}
                    onChange={e => updateField(int.domain, field.key, e.target.value)}
                    placeholder={(field as any).placeholder || ''}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              ))}
              {hasValues && (
                <pre style={{ fontSize: 11, background: 'var(--bg)', padding: 8, borderRadius: 4, marginTop: 4, overflow: 'auto' }}>
                  {getYaml(int.domain)}
                </pre>
              )}
            </div>
          )
        })}

        <div style={{ marginTop: 20, marginBottom: 80 }}>
          <button className="btn btn-accent" onClick={save} disabled={saving}
            style={{ width: '100%', fontSize: 13, padding: 12 }}>
            {saving ? 'Processing…' : '📋 Generate YAML'}
          </button>
          {msg && <div style={{ marginTop: 12, fontSize: 12, color: msg.startsWith('✅') ? '#30d158' : '#ff453a', whiteSpace: 'pre-line', textAlign: 'center' }}>{msg}</div>}
        </div>

        {/* 3D Floors */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">🏗️ 3D Floors</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', margin: '-4px 0 12px', paddingLeft: 4 }}>
            Name floors and upload .glb models (SketchUp, Blender exports).
          </div>
          <FloorsManager token={token} />
        </div>
      </div>
    </div>
  )
}

function FloorsManager({ token }: { token: string | null }) {
  const [floors, setFloors] = useState<{ id: string; name: string }[]>([])
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [uploading, setUploading] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetch('/api/config/floors', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setFloors).catch(() => {})
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

  const deleteFloor = async (id: string) => {
    await fetch(`/api/config/floors/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setFloors(prev => prev.filter(f => f.id !== id))
  }

  const uploadGlb = async (floorId: string, file: File) => {
    setUploading(floorId)
    const form = new FormData()
    form.append('file', file)
    await fetch(`/api/glb/upload/${floorId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    setUploading(null)
  }

  return (
    <div className="ios-list">
      {(floors || []).map(f => (
        <div key={f.id} className="ios-list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="ios-list-title">{f.name}</div>
              <div className="ios-list-subtitle">ID: {f.id}</div>
            </div>
            <button className="btn" style={{ fontSize: 10, padding: '2px 8px', color: '#ff453a' }}
              onClick={() => deleteFloor(f.id)}>✕</button>
          </div>
          <label className="btn" style={{ fontSize: 11, textAlign: 'center', cursor: 'pointer', margin: 0 }}>
            {uploading === f.id ? '⏳ Uploading…' : '📁 Upload .glb'}
            <input type="file" accept=".glb,.gltf" style={{ display: 'none' }}
              onChange={e => { const fl = e.target.files?.[0]; if (fl) uploadGlb(f.id, fl); e.target.value = '' }} />
          </label>
        </div>
      ))}
      <div className="ios-list-row" style={{ flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newId} onChange={e => setNewId(e.target.value)} placeholder="Floor ID (e.g. 4)"
            style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12 }} />
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Floor name"
            style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12 }}
            onKeyDown={e => e.key === 'Enter' && addFloor()} />
          <button className="btn btn-accent" style={{ fontSize: 11, padding: '6px 12px' }} onClick={addFloor}>+ Add</button>
        </div>
      </div>
    </div>
  )
}
