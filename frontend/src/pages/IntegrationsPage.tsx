import { useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'

const INTEGRATIONS = [
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
                    placeholder={field.placeholder}
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
      </div>
    </div>
  )
}
