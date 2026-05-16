import { useState, useEffect, useMemo } from 'react'
import { useHa, HaState } from '../context/HaContext'

const DOMAIN_META: Record<string, { label: string; icon: string }> = {
  light:         { label: 'Lights',        icon: '💡' },
  switch:        { label: 'Switches',      icon: '🔌' },
  binary_sensor: { label: 'Sensors',       icon: '🔍' },
  sensor:        { label: 'Sensors',       icon: '📊' },
  weather:       { label: 'Weather',       icon: '🌤️' },
  media_player:  { label: 'Media',         icon: '🎵' },
  camera:        { label: 'Cameras',       icon: '📷' },
  automation:    { label: 'Automations',   icon: '⚡' },
}

interface EntityReg {
  entity_id: string
  name: string | null
  area_id: string | null
  disabled: boolean
}

function usePinned() {
  const [pinned, setPinned] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ha_pinned') || '[]')) } catch { return new Set<string>() }
  })
  const toggle = (id: string) => setPinned(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    localStorage.setItem('ha_pinned', JSON.stringify([...next]))
    return next
  })
  return { pinned, togglePin: toggle }
}

export default function EntitiesPage() {
  const { token, states, callService, setEntityState } = useHa()
  const { pinned, togglePin } = usePinned()
  const [filter, setFilter] = useState('')
  const [reg, setReg] = useState<Map<string, EntityReg>>(new Map())
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const batchTurnOn  = () => { selected.forEach(id => { const d = id.split('.')[0]; callService(d, 'turn_on',  {}, id) }); setSelected(new Set()) }
  const batchTurnOff = () => { selected.forEach(id => { const d = id.split('.')[0]; callService(d, 'turn_off', {}, id) }); setSelected(new Set()) }

  const groupTurnAll = (items: HaState[], on: boolean) => {
    const controllable = items.filter(s => { const d = s.entity_id.split('.')[0]; return d === 'light' || d === 'switch' })
    controllable.forEach(s => { const d = s.entity_id.split('.')[0]; callService(d, on ? 'turn_on' : 'turn_off', {}, s.entity_id) })
  }

  useEffect(() => {
    if (!token) return
    fetch('/api/entity_registry', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((list: EntityReg[]) => {
        const m = new Map(list.map(e => [e.entity_id, e]))
        setReg(m)
      }).catch(() => {})
  }, [token])

  const updateReg = async (entityId: string, changes: Partial<EntityReg>) => {
    const r = await fetch(`/api/entity_registry/${entityId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    })
    if (r.ok) {
      setReg(prev => {
        const next = new Map(prev)
        const existing = next.get(entityId) || { entity_id: entityId, name: null, area_id: null, disabled: false }
        next.set(entityId, { ...existing, ...changes })
        return next
      })
    }
  }

  const entities = useMemo(() => {
    const list = Array.from(states.values())
    if (filter) {
      const f = filter.toLowerCase()
      return list.filter(s => s.entity_id.includes(f) || (s.attributes.friendly_name as string || '').toLowerCase().includes(f))
    }
    return list
  }, [states, filter])

  const toggle = (s: HaState) => {
    const domain = s.entity_id.split('.')[0]
    if (domain === 'light' || domain === 'switch') {
      callService(domain, s.state === 'on' ? 'turn_off' : 'turn_on', {}, s.entity_id)
    } else if (s.entity_id.startsWith('binary_sensor.')) {
      setEntityState(s.entity_id, s.state === 'on' ? 'off' : 'on')
    }
  }

  const startRename = (id: string, current: string) => {
    setEditing(id)
    setEditName(current)
  }

  const submitRename = async (id: string) => {
    if (editName.trim() && editName !== id) {
      await updateReg(id, { name: editName.trim() })
    }
    setEditing(null)
  }

  const groups = useMemo(() => {
    const m = new Map<string, HaState[]>()
    for (const s of entities) {
      const d = s.entity_id.split('.')[0]
      if (reg.get(s.entity_id)?.disabled) continue
      if (!m.has(d)) m.set(d, [])
      m.get(d)!.push(s)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.entity_id.localeCompare(b.entity_id))
    return m
  }, [entities, reg])

  const ordered = useMemo(() => {
    const order = ['weather', 'camera', 'media_player', 'light', 'switch', 'binary_sensor', 'sensor', 'automation']
    return [...order.filter(d => groups.has(d)), ...[...groups.keys()].filter(d => !order.includes(d)).sort()]
  }, [groups])

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="nav-title" style={{ margin: 0 }}>Devices</div>
            <button className={`btn${selectMode ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => { setSelectMode(m => !m); setSelected(new Set()) }}>
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          </div>
          {selectMode && selected.size > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{selected.size} selected</span>
              <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(48,209,88,0.15)', color: '#30d158' }} onClick={batchTurnOn}>All On</button>
              <button className="btn" style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255,69,58,0.12)', color: '#ff453a' }} onClick={batchTurnOff}>All Off</button>
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            <input value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Search devices…" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>

        {ordered.map(domain => {
          const meta = DOMAIN_META[domain] ?? { label: domain, icon: '🔧' }
          const items = groups.get(domain)!
          return (
            <div className="section" key={domain} style={{ marginTop: 16 }}>
              <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{meta.icon} {meta.label} ({items.length})</span>
                {(domain === 'light' || domain === 'switch') && !selectMode && (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button className="btn" style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(48,209,88,0.12)', color: '#30d158' }} onClick={() => groupTurnAll(items, true)}>All On</button>
                    <button className="btn" style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(255,69,58,0.08)', color: '#ff453a' }} onClick={() => groupTurnAll(items, false)}>All Off</button>
                  </span>
                )}
              </div>
              <div className="ios-list">
                {items.map(s => {
                  const name = reg.get(s.entity_id)?.name || (s.attributes.friendly_name as string) || s.entity_id
                  const on = s.state === 'on'
                  const isEditing = editing === s.entity_id
                  const isSelected = selected.has(s.entity_id)

                  return (
                    <div className="ios-list-row" key={s.entity_id}
                      style={{ cursor: 'pointer', background: isSelected ? 'rgba(10,132,255,0.10)' : undefined }}
                      onClick={() => selectMode ? toggleSelect(s.entity_id) : (!isEditing && toggle(s))}>
                      {selectMode ? (
                        <div style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${isSelected ? '#0a84ff' : 'var(--border)'}`, background: isSelected ? '#0a84ff' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>}
                        </div>
                      ) : (
                        <div className="ios-list-icon" style={{ background: on ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.06)' }}>
                          {meta.icon}
                        </div>
                      )}
                      <div className="ios-list-content" style={{ flex: 1, minWidth: 0 }} onClick={e => e.stopPropagation()}>
                        {isEditing ? (
                          <form onSubmit={e => { e.preventDefault(); submitRename(s.entity_id) }} style={{ display: 'flex', gap: 6 }}>
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                              style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
                              onBlur={() => submitRename(s.entity_id)} autoFocus />
                          </form>
                        ) : (
                          <div className="ios-list-title" onDoubleClick={() => !selectMode && startRename(s.entity_id, name)}
                            title="Double-click to rename">{name}</div>
                        )}
                        <div className="ios-list-subtitle">
                          <span style={{ color: on ? 'var(--green)' : 'var(--text2)', fontWeight: on ? 600 : 400 }}>{s.state}</span>
                          <span style={{ marginLeft: 8 }}>{s.entity_id}</span>
                        </div>
                      </div>
                      {!selectMode && (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          {!isEditing && (
                            <>
                              <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }}
                                onClick={() => startRename(s.entity_id, name)} title="Rename">✎</button>
                              <button className="btn" style={{ fontSize: 14, padding: '2px 6px', opacity: pinned.has(s.entity_id) ? 1 : 0.3 }}
                                onClick={() => togglePin(s.entity_id)} title={pinned.has(s.entity_id) ? 'Unpin from Dashboard' : 'Pin to Dashboard'}>
                                {pinned.has(s.entity_id) ? '★' : '☆'}
                              </button>
                            </>
                          )}
                          <label className="ios-toggle">
                            <input type="checkbox" checked={on} onChange={() => toggle(s)} />
                            <span className="ios-slider" />
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {states.size === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem', fontSize: 14 }}>No devices found.</div>
        )}
      </div>
    </div>
  )
}
