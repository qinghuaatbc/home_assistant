import { useState, useEffect, useMemo } from 'react'
import { useHa } from '../context/HaContext'

export default function AutomationsPage() {
  const { token, states, callService } = useHa()
  const [tab, setTab] = useState<'list' | 'edit'>('list')
  const [yaml, setYaml] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)

  const automations = useMemo(() =>
    Array.from(states.values())
      .filter((s) => s.entity_id.startsWith('automation.'))
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id)),
    [states]
  )

  useEffect(() => {
    if (tab !== 'edit' || !token || yaml) return
    fetch('/api/config/automations', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setYaml(d.content || '')).catch(() => {})
  }, [tab, token])

  const saveYaml = async () => {
    if (!token) return
    setSaving(true)
    try {
      const r = await fetch('/api/config/automations', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: yaml }),
      })
      if (r.ok) {
        setMsg('✅ Saved — restart to apply')
        setDirty(false)
      } else throw new Error()
    } catch { setMsg('❌ Save failed') }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="nav-title">⚡ Automations</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button className={`btn${tab === 'list' ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setTab('list')}>List</button>
            <button className={`btn${tab === 'edit' ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setTab('edit')}>YAML</button>
          </div>
        </div>

        {tab === 'list' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
              {automations.length} automation{automations.length !== 1 ? 's' : ''}
            </div>
            {automations.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem', fontSize: 14 }}>
                No automations. Add them in the YAML editor.
              </div>
            )}
            <div className="ios-list">
              {automations.map(s => {
                const on = s.state === 'on'
                const name = (s.attributes.friendly_name as string) ?? s.entity_id.replace('automation.', '').replace(/_/g, ' ')
                return (
                  <div className="ios-list-row" key={s.entity_id}>
                    <div className="ios-list-icon" style={{ background: on ? 'rgba(10,132,255,0.15)' : 'rgba(255,255,255,0.06)' }}>⚡</div>
                    <div className="ios-list-content">
                      <div className="ios-list-title">{name}</div>
                      <div className="ios-list-subtitle">{on ? 'Enabled' : 'Disabled'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }}
                        onClick={() => callService('automation', 'trigger', {}, s.entity_id)}>Run</button>
                      <label className="ios-toggle">
                        <input type="checkbox" checked={on}
                          onChange={() => callService('automation', on ? 'turn_off' : 'turn_on', {}, s.entity_id)} />
                        <span className="ios-slider" />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {tab === 'edit' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
              Edit automations.yaml directly. Restart server to apply changes.
            </div>
            <textarea value={yaml} onChange={e => { setYaml(e.target.value); setDirty(true) }}
              style={{ width: '100%', height: 'calc(100vh - 240px)', padding: 12, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)',
                fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, resize: 'none', boxSizing: 'border-box' }}
              spellCheck={false} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button className="btn btn-accent" onClick={saveYaml} disabled={saving || !dirty}
                style={{ fontSize: 12 }}>{saving ? 'Saving…' : '💾 Save'}</button>
              {msg && <span style={{ fontSize: 12, color: msg.startsWith('✅') ? '#30d158' : '#ff453a' }}>{msg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
