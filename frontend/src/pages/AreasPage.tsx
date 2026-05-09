import { useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'

interface Area {
  area_id: string
  name: string
  picture: string | null
}

interface EntityReg {
  entity_id: string
  name: string
  area_id: string | null
}

export default function AreasPage() {
  const { token, states } = useHa()
  const [areas, setAreas] = useState<Area[]>([])
  const [entities, setEntities] = useState<EntityReg[]>([])
  const [newName, setNewName] = useState('')
  const [tab, setTab] = useState<'areas' | 'assign'>('areas')

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  useEffect(() => {
    if (!token) return
    fetch('/api/area_registry', { headers }).then(r => r.json()).then(setAreas).catch(() => {})
    fetch('/api/entity_registry', { headers }).then(r => r.json()).then(setEntities).catch(() => {})
  }, [token])

  const createArea = async () => {
    if (!newName.trim()) return
    const r = await fetch('/api/area_registry', {
      method: 'POST', headers, body: JSON.stringify({ name: newName.trim() }),
    })
    if (r.ok) {
      const a = await r.json()
      setAreas(prev => [...prev, a])
      setNewName('')
    }
  }

  const deleteArea = async (id: string) => {
    await fetch(`/api/area_registry/${id}`, { method: 'DELETE', headers })
    setAreas(prev => prev.filter(a => a.area_id !== id))
  }

  const assignEntity = async (entityId: string, areaId: string | null) => {
    const r = await fetch(`/api/entity_registry/${entityId}`, {
      method: 'PUT', headers, body: JSON.stringify({ area_id: areaId }),
    })
    if (r.ok) {
      setEntities(prev => prev.map(e => e.entity_id === entityId ? { ...e, area_id: areaId } : e))
    }
  }

  const areaMap = new Map(areas.map(a => [a.area_id, a.name]))
  const unassigned = entities.filter(e => !e.area_id)
  const byArea = new Map<string, EntityReg[]>()
  entities.filter(e => e.area_id).forEach(e => {
    if (!byArea.has(e.area_id!)) byArea.set(e.area_id!, [])
    byArea.get(e.area_id!)!.push(e)
  })

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">🏠 Areas</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className={`btn${tab === 'areas' ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => setTab('areas')}>Areas</button>
            <button className={`btn${tab === 'assign' ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => setTab('assign')}>Assign</button>
          </div>
        </div>

        {tab === 'areas' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="New area name…" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
                onKeyDown={e => e.key === 'Enter' && createArea()} />
              <button className="btn btn-accent" style={{ fontSize: 12 }} onClick={createArea}>Add</button>
            </div>
            <div className="ios-list">
              {areas.map(a => (
                <div className="ios-list-row" key={a.area_id}>
                  <div className="ios-list-icon" style={{ background: 'rgba(10,132,255,0.15)' }}>🏠</div>
                  <div className="ios-list-content">
                    <div className="ios-list-title">{a.name}</div>
                    <div className="ios-list-subtitle">{a.area_id}</div>
                  </div>
                  <button className="btn" style={{ fontSize: 11, padding: '4px 8px', color: '#ff453a' }}
                    onClick={() => deleteArea(a.area_id)}>✕</button>
                </div>
              ))}
              {areas.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
                  No areas yet. Create one above.
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'assign' && (
          <>
            {Array.from(byArea.entries()).map(([areaId, ents]) => (
              <div className="section" key={areaId} style={{ marginTop: 16 }}>
                <div className="section-title">🏠 {areaMap.get(areaId) || areaId}</div>
                {ents.map(e => (
                  <EntityRow key={e.entity_id} entity={e} areaMap={areaMap} areas={areas} onAssign={assignEntity} />
                ))}
              </div>
            ))}
            {unassigned.length > 0 && (
              <div className="section" style={{ marginTop: 16 }}>
                <div className="section-title" style={{ color: 'var(--text2)' }}>📦 Unassigned</div>
                {unassigned.map(e => (
                  <EntityRow key={e.entity_id} entity={e} areaMap={areaMap} areas={areas} onAssign={assignEntity} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EntityRow({ entity, areaMap, areas, onAssign }: {
  entity: EntityReg
  areaMap: Map<string, string>
  areas: Area[]
  onAssign: (entityId: string, areaId: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="ios-list-row" key={entity.entity_id}>
      <div className="ios-list-content">
        <div className="ios-list-title">{entity.name || entity.entity_id}</div>
        <div className="ios-list-subtitle">
          {entity.area_id ? areaMap.get(entity.area_id) || entity.area_id : 'No area'}
        </div>
      </div>
      {editing ? (
        <select value={entity.area_id || ''} onChange={e => {
          onAssign(entity.entity_id, e.target.value || null)
          setEditing(false)
        }} onBlur={() => setEditing(false)} autoFocus
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }}>
          <option value="">— None —</option>
          {areas.map(a => <option key={a.area_id} value={a.area_id}>{a.name}</option>)}
        </select>
      ) : (
        <button className="btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setEditing(true)}>Edit</button>
      )}
    </div>
  )
}
