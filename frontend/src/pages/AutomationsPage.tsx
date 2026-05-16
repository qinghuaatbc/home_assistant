import { useState, useEffect, useMemo } from 'react'
import { useHa } from '../context/HaContext'

const TRIGGER_TYPES = [
  { id: 'state',         label: '🔄 State Change',    fields: ['entity_id', 'from', 'to'] },
  { id: 'time',          label: '⏰ Time',             fields: ['at'] },
  { id: 'sun',           label: '🌅 Sun',              fields: ['event', 'offset'] },
  { id: 'numeric_state', label: '📊 Numeric State',    fields: ['entity_id', 'above', 'below'] },
  { id: 'event',         label: '📡 Event',            fields: ['event_type'] },
]

const ACTION_TYPES = [
  { id: 'turn_on',      label: '💡 Turn On',     fields: ['entity_id'] },
  { id: 'turn_off',     label: '💡 Turn Off',    fields: ['entity_id'] },
  { id: 'toggle',       label: '🔀 Toggle',      fields: ['entity_id'] },
  { id: 'scene',        label: '🎬 Activate Scene', fields: ['entity_id'] },
  { id: 'script',       label: '📜 Run Script',  fields: ['entity_id'] },
  { id: 'delay',        label: '⏳ Delay',        fields: ['hours', 'minutes', 'seconds'] },
  { id: 'notify',       label: '📢 Notify',      fields: ['message', 'title'] },
]

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 3 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, boxSizing: 'border-box' }} />
    </div>
  )
}

function VisualEditor({ onYaml }: { onYaml: (yaml: string) => void }) {
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState(TRIGGER_TYPES[0].id)
  const [triggerFields, setTriggerFields] = useState<Record<string,string>>({})
  const [actionType, setActionType] = useState(ACTION_TYPES[0].id)
  const [actionFields, setActionFields] = useState<Record<string,string>>({})

  const trigger = TRIGGER_TYPES.find(t => t.id === triggerType)!
  const action = ACTION_TYPES.find(a => a.id === actionType)!

  const setTF = (k: string, v: string) => setTriggerFields(p => ({ ...p, [k]: v }))
  const setAF = (k: string, v: string) => setActionFields(p => ({ ...p, [k]: v }))

  const generate = () => {
    const id = (name || 'my_automation').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const tLines = trigger.fields.map(f => triggerFields[f] ? `    ${f}: "${triggerFields[f]}"` : '').filter(Boolean).join('\n')
    const aLines = action.fields.map(f => actionFields[f] ? `    ${f}: "${actionFields[f]}"` : '').filter(Boolean).join('\n')

    let yaml = `- id: "${id}"\n`
    yaml += `  alias: "${name || id}"\n`
    yaml += `  trigger:\n`
    yaml += `    - platform: ${triggerType}\n`
    if (tLines) yaml += tLines + '\n'
    yaml += `  action:\n`
    if (actionType === 'turn_on' || actionType === 'turn_off' || actionType === 'toggle') {
      yaml += `    - service: homeassistant.${actionType}\n`
      yaml += `      target:\n`
      yaml += `        entity_id: "${actionFields['entity_id'] || ''}"\n`
    } else if (actionType === 'scene') {
      yaml += `    - service: scene.turn_on\n`
      yaml += `      target:\n`
      yaml += `        entity_id: "${actionFields['entity_id'] || ''}"\n`
    } else if (actionType === 'script') {
      yaml += `    - service: script.turn_on\n`
      yaml += `      target:\n`
      yaml += `        entity_id: "${actionFields['entity_id'] || ''}"\n`
    } else if (actionType === 'delay') {
      yaml += `    - delay:\n`
      if (actionFields['hours'])   yaml += `        hours: ${actionFields['hours']}\n`
      if (actionFields['minutes']) yaml += `        minutes: ${actionFields['minutes']}\n`
      if (actionFields['seconds']) yaml += `        seconds: ${actionFields['seconds']}\n`
    } else if (actionType === 'notify') {
      yaml += `    - service: notify.notify\n`
      yaml += `      data:\n`
      yaml += `        message: "${actionFields['message'] || ''}"\n`
      if (actionFields['title']) yaml += `        title: "${actionFields['title']}"\n`
    }
    onYaml(yaml)
  }

  return (
    <div style={{ background: 'var(--card)', borderRadius: 10, padding: '14px', marginBottom: 12, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>✨ New Automation</div>

      <Field label="Name" value={name} onChange={setName} />

      {/* Trigger */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, marginTop: 4 }}>TRIGGER</div>
      <select value={triggerType} onChange={e => { setTriggerType(e.target.value); setTriggerFields({}) }}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }}>
        {TRIGGER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      {trigger.fields.map(f => <Field key={f} label={f} value={triggerFields[f] || ''} onChange={v => setTF(f, v)} />)}

      {/* Action */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, marginTop: 8 }}>ACTION</div>
      <select value={actionType} onChange={e => { setActionType(e.target.value); setActionFields({}) }}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }}>
        {ACTION_TYPES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
      {action.fields.map(f => <Field key={f} label={f} value={actionFields[f] || ''} onChange={v => setAF(f, v)} />)}

      <button className="btn btn-accent" style={{ width: '100%', marginTop: 8, fontSize: 12, padding: '8px' }}
        onClick={generate}>Generate YAML →</button>
    </div>
  )
}

export default function AutomationsPage() {
  const { token, states, callService } = useHa()
  const [tab, setTab] = useState<'list' | 'new' | 'edit'>('list')
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
    if (tab !== 'edit' && tab !== 'new' || !token || yaml) return
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

  const appendYaml = (snippet: string) => {
    setYaml(prev => {
      const trimmed = prev.trimEnd()
      return trimmed ? trimmed + '\n\n' + snippet : snippet
    })
    setDirty(true)
    setTab('edit')
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="nav-title">⚡ Automations</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button className={`btn${tab === 'list' ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setTab('list')}>List</button>
            <button className={`btn${tab === 'new' ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setTab('new')}>+ New</button>
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
                No automations. Use "+ New" or edit YAML.
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
                      <div className="ios-list-subtitle">{on ? '● Enabled' : '○ Disabled'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }}
                        onClick={() => callService('automation', 'trigger', {}, s.entity_id)}>▶ Run</button>
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

        {tab === 'new' && (
          <VisualEditor onYaml={appendYaml} />
        )}

        {tab === 'edit' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
              Edit automations.yaml. Restart server to apply.
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
