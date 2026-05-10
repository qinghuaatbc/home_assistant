import { useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'

interface FieldDef {
  key: string; label: string; placeholder?: string; default?: string; type?: string
}

interface IntegrationDef {
  domain: string; name: string; icon: string; desc: string
  fields: FieldDef[]
  dynamicFields?: { label: string; key: string; type?: string; placeholder?: string }[]
}

const INTEGRATIONS: IntegrationDef[] = [
  { domain: 'demo', name: 'Demo', icon: '🧪', desc: 'Simulated test devices (lights, switches, sensors)',
    fields: [{ key: 'enable', label: 'Enable demo devices', type: 'checkbox', default: 'true' }]},
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

export default function IntegrationsPage() {
  const { token } = useHa()
  const [configs, setConfigs] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

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
      list.push({ integrationId: 0, entity_id: '', type: 'dimmer', name: '' })
      return { ...prev, [domain]: { ...cfg, devices: list } }
    })
  }

  const updateDevice = (domain: string, idx: number, key: string, value: string) => {
    setConfigs(prev => {
      const cfg = { ...(prev[domain] || {}) }
      const list = [...(cfg.devices || [])]
      list[idx] = { ...list[idx], [key]: value }
      return { ...prev, [domain]: { ...cfg, devices: list } }
    })
  }

  const removeDevice = (domain: string, idx: number) => {
    setConfigs(prev => {
      const cfg = { ...(prev[domain] || {}) }
      return { ...prev, [domain]: { ...cfg, devices: (cfg.devices || []).filter((_: any, i: number) => i !== idx) } }
    })
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
          return !!v
        })
        if (!hasVal) return null
        const out: any = { domain: int.domain }
        for (const [k, v] of Object.entries(cfg)) {
          if (k === 'devices') {
            if (Array.isArray(v) && v.length > 0) out.devices = v
          } else if (v) {
            out[k] = v
          }
        }
        return out
      }).filter(Boolean)

      const r = await fetch('/api/config/apply', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrations }),
      })
      if (r.ok) setMsg('✅ Configuration saved. Server is restarting… Refresh in a few seconds.')
      else setMsg('❌ Save failed: ' + await r.text())
    } catch { setMsg('❌ Network error') }
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
          return (
            <div className="section" key={int.domain} style={{ marginTop: 20 }}>
              <div className="section-title">{int.icon} {int.name}</div>
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
              {int.dynamicFields && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Devices</div>
                  {(cfg.devices || []).map((dev: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                      {int.dynamicFields!.map(f => (
                        <input key={f.key} type={f.type || 'text'} value={dev[f.key] || ''}
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
            </div>
          )
        })}

        <div style={{ marginTop: 20, marginBottom: 80 }}>
          <button className="btn btn-accent" onClick={save} disabled={saving}
            style={{ width: '100%', fontSize: 13, padding: 12 }}>
            {saving ? 'Saving & Restarting…' : '💾 Save & Restart'}
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
