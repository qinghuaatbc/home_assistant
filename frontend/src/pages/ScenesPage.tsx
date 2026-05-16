import { useState, useMemo, useCallback } from 'react'
import { useHa } from '../context/HaContext'

const FAVORITES_KEY = 'ha_scene_favorites'

function loadFavorites(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')) } catch { return new Set() }
}
function saveFavorites(s: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(s)))
}

function domainMeta(domain: string): { icon: string; label: string; color: string } {
  if (domain === 'scene')  return { icon: '🎬', label: 'Scenes',  color: '#af52de' }
  if (domain === 'script') return { icon: '📜', label: 'Scripts', color: '#007aff' }
  return { icon: '▶', label: domain, color: 'var(--text2)' }
}

function relTime(isoOrTs: string | number | undefined): string {
  if (!isoOrTs) return ''
  const d = typeof isoOrTs === 'number' ? new Date(isoOrTs) : new Date(isoOrTs)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 5)    return 'just now'
  if (diff < 60)   return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400)return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

export default function ScenesPage() {
  const { states, callService } = useHa()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'all' | 'scene' | 'script'>('all')
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Set<string>>(new Set())
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites)

  const allEntities = useMemo(() => {
    return Array.from(states.values())
      .filter(s => s.entity_id.startsWith('scene.') || s.entity_id.startsWith('script.'))
      .sort((a, b) => {
        const an = String(a.attributes?.friendly_name ?? a.entity_id)
        const bn = String(b.attributes?.friendly_name ?? b.entity_id)
        return an.localeCompare(bn)
      })
  }, [states])

  const filtered = useMemo(() => {
    let list = tab === 'all' ? allEntities
      : allEntities.filter(s => s.entity_id.startsWith(tab + '.'))
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(s => {
        const name = String(s.attributes?.friendly_name ?? s.entity_id).toLowerCase()
        return name.includes(q) || s.entity_id.toLowerCase().includes(q)
      })
    }
    // favorites first
    return [...list].sort((a, b) => {
      const af = favorites.has(a.entity_id) ? 0 : 1
      const bf = favorites.has(b.entity_id) ? 0 : 1
      return af - bf
    })
  }, [allEntities, tab, query, favorites])

  const activate = useCallback(async (entityId: string) => {
    if (running.has(entityId)) return
    const domain = entityId.split('.')[0]
    setRunning(prev => new Set(prev).add(entityId))
    try {
      await callService(domain, 'turn_on', {}, entityId)
      setDone(prev => new Set(prev).add(entityId))
      setTimeout(() => setDone(prev => { const n = new Set(prev); n.delete(entityId); return n }), 2000)
    } catch {}
    setRunning(prev => { const n = new Set(prev); n.delete(entityId); return n })
  }, [callService, running])

  const toggleFavorite = useCallback((entityId: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(entityId)) next.delete(entityId)
      else next.add(entityId)
      saveFavorites(next)
      return next
    })
  }, [])

  const sceneCount = allEntities.filter(s => s.entity_id.startsWith('scene.')).length
  const scriptCount = allEntities.filter(s => s.entity_id.startsWith('script.')).length

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">🎬 Scenes & Scripts</div>
        </div>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, background: 'rgba(175,82,222,0.12)', borderRadius: 12, padding: '12px 14px', textAlign: 'center', border: '1.5px solid #af52de' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#af52de' }}>{sceneCount}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>Scenes</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(0,122,255,0.12)', borderRadius: 12, padding: '12px 14px', textAlign: 'center', border: '1.5px solid #007aff' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#007aff' }}>{scriptCount}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>Scripts</div>
          </div>
          <div style={{ flex: 1, background: 'var(--card)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#ff9500' }}>{favorites.size}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>Favorites</div>
          </div>
        </div>

        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            style={{
              flex: 1, padding: '7px 12px', borderRadius: 8,
              border: '1px solid var(--sep)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: 13,
            }}
          />
          <div style={{ display: 'flex', gap: 3, background: 'var(--card)', borderRadius: 8, padding: 3 }}>
            {(['all', 'scene', 'script'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: tab === t ? 'var(--blue, #007aff)' : 'transparent',
                  color: tab === t ? '#fff' : 'var(--text2)',
                  textTransform: 'capitalize',
                }}
              >{t}</button>
            ))}
          </div>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
            {allEntities.length === 0
              ? <>No scenes or scripts found.<br />Add <code style={{ fontFamily: 'monospace', fontSize: 11 }}>scene.*</code> or <code style={{ fontFamily: 'monospace', fontSize: 11 }}>script.*</code> entities.</>
              : 'No results for "' + query + '"'}
          </div>
        )}

        {/* Grid of cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {filtered.map(s => {
            const domain = s.entity_id.split('.')[0]
            const meta = domainMeta(domain)
            const name = String(s.attributes?.friendly_name ?? s.entity_id.replace(`${domain}.`, '').replace(/_/g, ' '))
            const isRunning = running.has(s.entity_id)
            const isDone = done.has(s.entity_id)
            const isFav = favorites.has(s.entity_id)
            const lastRan = s.attributes?.last_triggered as string | undefined
            const isScript = domain === 'script'
            const scriptRunning = isScript && s.state === 'on'

            return (
              <div
                key={s.entity_id}
                style={{
                  background: isDone ? 'rgba(48,209,88,0.12)' : 'var(--card)',
                  borderRadius: 12,
                  padding: '14px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  border: isDone ? '1.5px solid #30d158' : isFav ? `1.5px solid ${meta.color}` : '1.5px solid transparent',
                  cursor: 'pointer',
                  transition: 'transform 0.1s, opacity 0.1s',
                  transform: isRunning ? 'scale(0.97)' : 'scale(1)',
                  position: 'relative',
                }}
                onClick={() => activate(s.entity_id)}
              >
                {/* Favorite star */}
                <button
                  onClick={e => { e.stopPropagation(); toggleFavorite(s.entity_id) }}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 14, color: isFav ? '#ff9500' : 'var(--text2)', padding: 0, lineHeight: 1,
                  }}
                >
                  {isFav ? '★' : '☆'}
                </button>

                <div style={{ fontSize: 28 }}>
                  {isDone ? '✅' : isRunning || scriptRunning ? '⏳' : meta.icon}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, paddingRight: 16 }}>{name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${meta.color}22`, color: meta.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {domain}
                  </span>
                  {lastRan && <span style={{ fontSize: 10, color: 'var(--text2)' }}>{relTime(lastRan)}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
