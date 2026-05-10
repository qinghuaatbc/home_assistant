import { useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light')
  localStorage.setItem('ha_theme', isLight ? 'light' : 'dark')
}

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
      { label: 'Type', key: 'type', placeholder: 'light' },
      { label: 'Name', key: 'name', placeholder: 'Living Room Dimmer' },
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

export default function IntegrationsPage() {
  const { token } = useHa()
  const [configs, setConfigs] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(INTEGRATIONS.map(i => i.domain)))

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
            <button className="btn" style={{ fontSize: 14, padding: '2px 8px', position: 'absolute', right: 12, top: 12 }}
              onClick={toggleTheme}>
              {document.documentElement.classList.contains('light') ? '🌙' : '☀️'}
            </button>
          </div>

        {INTEGRATIONS.map(int => {
          const cfg = configs[int.domain] || {}
          const isCollapsed = collapsed.has(int.domain)
          return (
            <div className="section" key={int.domain} style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setCollapsed(prev => { const n = new Set(prev); if (n.has(int.domain)) n.delete(int.domain); else n.add(int.domain); return n })}>
                <span className="section-title">{int.icon} {int.name}</span>
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
              </>}
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
        // enrich with GLB file info
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
