import { useState, useRef } from 'react'
import { useHa } from '../context/HaContext'

interface Shortcut {
  id: string
  entityId: string
  label: string
  icon: string
}

const STORAGE_KEY = 'ha_shortcuts'

function loadShortcuts(): Shortcut[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function saveShortcuts(s: Shortcut[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

function domainIcon(entityId: string): string {
  const d = entityId.split('.')[0]
  const icons: Record<string, string> = {
    scene: '🎬', script: '📜', light: '💡', switch: '🔌',
    input_boolean: '🔘', automation: '⚡', cover: '🚪', fan: '🌀',
    media_player: '🎵', climate: '🌡️', lock: '🔒', camera: '📷',
  }
  return icons[d] || '▶️'
}

function callFor(entityId: string): { domain: string; service: string } {
  const d = entityId.split('.')[0]
  if (d === 'scene') return { domain: 'scene', service: 'turn_on' }
  if (d === 'script') return { domain: 'script', service: 'turn_on' }
  if (d === 'automation') return { domain: 'automation', service: 'trigger' }
  if (d === 'input_boolean') return { domain: 'input_boolean', service: 'toggle' }
  return { domain: 'homeassistant', service: 'toggle' }
}

interface AddModalProps {
  onAdd: (s: Shortcut) => void
  onClose: () => void
}

function AddModal({ onAdd, onClose }: AddModalProps) {
  const { states } = useHa()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState('')
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState('')

  const ALLOWED = ['scene', 'script', 'light', 'switch', 'input_boolean', 'automation', 'cover', 'fan', 'media_player', 'climate', 'lock']
  const candidates = Array.from(states.values())
    .filter(s => ALLOWED.includes(s.entity_id.split('.')[0]))
    .filter(s => !query || s.entity_id.includes(query) || String(s.attributes?.friendly_name ?? '').toLowerCase().includes(query.toLowerCase()))
    .slice(0, 80)

  function pick(entityId: string) {
    const s = states.get(entityId)
    setPicked(entityId)
    setLabel(String(s?.attributes?.friendly_name ?? entityId.split('.')[1].replace(/_/g, ' ')))
    setIcon(domainIcon(entityId))
  }

  function confirm() {
    if (!picked) return
    onAdd({ id: crypto.randomUUID(), entityId: picked, label: label || picked, icon: icon || domainIcon(picked) })
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9900, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: '100%', maxHeight: '72vh', background: 'var(--card)', borderRadius: '16px 16px 0 0',
        display: 'flex', flexDirection: 'column', padding: '16px 0',
      }}>
        <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Search entity…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', fontSize: 14,
            }}
          />
          <button className="btn" style={{ fontSize: 12, padding: '6px 12px', flexShrink: 0 }} onClick={onClose}>Cancel</button>
        </div>

        {picked && (
          <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8 }}>
            <input
              value={icon}
              onChange={e => setIcon(e.target.value)}
              placeholder="Icon"
              style={{
                width: 56, padding: '6px 8px', borderRadius: 8, textAlign: 'center',
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', fontSize: 20,
              }}
            />
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Label"
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', fontSize: 14,
              }}
            />
            <button className="btn active" style={{ fontSize: 12, padding: '6px 14px', flexShrink: 0 }} onClick={confirm}>Add</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {candidates.map(s => (
            <div
              key={s.entity_id}
              onClick={() => pick(s.entity_id)}
              style={{
                padding: '10px 16px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center',
                background: picked === s.entity_id ? 'var(--surface)' : 'transparent',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 20 }}>{domainIcon(s.entity_id)}</span>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text)' }}>
                  {String(s.attributes?.friendly_name ?? s.entity_id)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{s.entity_id}</div>
              </div>
            </div>
          ))}
          {candidates.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '2rem', fontSize: 13 }}>No entities found</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ShortcutBar() {
  const { callService } = useHa()
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(loadShortcuts)
  const [editMode, setEditMode] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [firing, setFiring] = useState<string | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function addShortcut(s: Shortcut) {
    const next = [...shortcuts, s]
    setShortcuts(next)
    saveShortcuts(next)
  }

  function removeShortcut(id: string) {
    const next = shortcuts.filter(s => s.id !== id)
    setShortcuts(next)
    saveShortcuts(next)
    if (next.length === 0) setEditMode(false)
  }

  async function fire(s: Shortcut) {
    if (editMode) return
    setFiring(s.id)
    const { domain, service } = callFor(s.entityId)
    await callService(domain, service, {}, s.entityId).catch(() => {})
    setTimeout(() => setFiring(null), 600)
  }

  function onPointerDown(id: string) {
    longPressRef.current = setTimeout(() => {
      setEditMode(true)
    }, 600)
  }

  function onPointerUp() {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
  }

  if (shortcuts.length === 0 && !editMode) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', overflowX: 'auto' }}>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
            borderRadius: 20, border: '1.5px dashed var(--border)',
            background: 'transparent', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 16 }}>＋</span> Add shortcut
        </button>
        {showAdd && <AddModal onAdd={addShortcut} onClose={() => setShowAdd(false)} />}
      </div>
    )
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any,
      }}>
        {shortcuts.map(s => (
          <div key={s.id} style={{ position: 'relative', flexShrink: 0 }}>
            {editMode && (
              <button
                onClick={() => removeShortcut(s.id)}
                style={{
                  position: 'absolute', top: -6, right: -6, zIndex: 2,
                  width: 18, height: 18, borderRadius: 9, border: 'none',
                  background: '#ff453a', color: '#fff', fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}
              >×</button>
            )}
            <button
              onPointerDown={() => onPointerDown(s.id)}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onClick={() => fire(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 20, border: 'none',
                background: firing === s.id ? 'var(--accent, #4d8fff)' : 'var(--surface)',
                color: firing === s.id ? '#fff' : 'var(--text)',
                fontSize: 13, fontWeight: 500, cursor: editMode ? 'default' : 'pointer',
                whiteSpace: 'nowrap', transition: 'background 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              }}
            >
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              {s.label}
            </button>
          </div>
        ))}

        {editMode ? (
          <>
            <button
              onClick={() => setShowAdd(true)}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                borderRadius: 20, border: '1.5px dashed var(--border)',
                background: 'transparent', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >＋</button>
            <button
              onClick={() => setEditMode(false)}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
                borderRadius: 20, border: 'none', background: 'var(--surface)',
                color: 'var(--text2)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >Done</button>
          </>
        ) : (
          <button
            onClick={() => setEditMode(true)}
            style={{
              flexShrink: 0, padding: '6px 10px', borderRadius: 20, border: 'none',
              background: 'transparent', color: 'var(--text2)', fontSize: 18, cursor: 'pointer',
            }}
            title="Edit shortcuts"
          >✎</button>
        )}
      </div>

      {showAdd && <AddModal onAdd={addShortcut} onClose={() => setShowAdd(false)} />}
    </>
  )
}
