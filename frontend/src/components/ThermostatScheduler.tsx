import { useState, useEffect, useRef, useCallback } from 'react'
import { useHa } from '../context/HaContext'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface Entry { dayOfWeek: number; hour: number; temperature: number; enabled: boolean }

// Temperature → hue-based color (blue=cold, green=comfortable, red=hot)
function tempColor(temp: number, min: number, max: number): string {
  const ratio = Math.max(0, Math.min(1, (temp - min) / (max - min)))
  // 220 (blue) → 60 (yellow) → 0 (red)
  const hue = Math.round(220 - ratio * 220)
  return `hsl(${hue}, 75%, 48%)`
}

function formatHour(h: number) {
  return h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`
}

export default function ThermostatScheduler() {
  const { token, states } = useHa()
  const [entityId, setEntityId] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [selectedTemp, setSelectedTemp] = useState(21)
  const [tempMin] = useState(15)
  const [tempMax] = useState(30)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [unit, setUnit] = useState<'C' | 'F'>('C')

  const climates = Array.from(states.values()).filter(s => s.entity_id.startsWith('climate.'))

  // Load saved entities list and pre-select first
  useEffect(() => {
    if (!token) return
    fetch('/api/schedule/thermostat/entities', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((ids: string[]) => { if (ids.length && !entityId) setEntityId(ids[0]) })
      .catch(() => {})
  }, [token])

  // Auto-select first climate entity if none saved
  useEffect(() => {
    if (!entityId && climates.length) setEntityId(climates[0].entity_id)
  }, [climates.length])

  // Load schedule for selected entity
  useEffect(() => {
    if (!entityId || !token) return
    fetch(`/api/schedule/thermostat?entity_id=${encodeURIComponent(entityId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((rows: Entry[]) => setEntries(rows))
      .catch(() => setEntries([]))
  }, [entityId, token])

  function getTemp(day: number, hour: number): number | null {
    const e = entries.find(e => e.dayOfWeek === day && e.hour === hour)
    return e?.enabled ? e.temperature : null
  }

  const dragRef = useRef(false)

  function setCell(day: number, hour: number) {
    setEntries(prev => {
      const next = prev.filter(e => !(e.dayOfWeek === day && e.hour === hour))
      next.push({ dayOfWeek: day, hour, temperature: selectedTemp, enabled: true })
      return next
    })
  }

  function clearCell(day: number, hour: number) {
    setEntries(prev => prev.filter(e => !(e.dayOfWeek === day && e.hour === hour)))
  }

  const onCellDown = useCallback((day: number, hour: number, e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = true
    setCell(day, hour)
  }, [selectedTemp])

  const onCellEnter = useCallback((day: number, hour: number) => {
    if (dragRef.current) setCell(day, hour)
  }, [selectedTemp])

  useEffect(() => {
    const up = () => { dragRef.current = false }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  function fillDay(day: number) {
    setEntries(prev => {
      const next = prev.filter(e => e.dayOfWeek !== day)
      HOURS.forEach(h => next.push({ dayOfWeek: day, hour: h, temperature: selectedTemp, enabled: true }))
      return next
    })
  }

  function fillHour(hour: number) {
    setEntries(prev => {
      const next = prev.filter(e => e.hour !== hour)
      DAYS.forEach((_, d) => next.push({ dayOfWeek: d, hour, temperature: selectedTemp, enabled: true }))
      return next
    })
  }

  function clearAll() { setEntries([]) }

  async function save() {
    if (!entityId || !token) return
    setSaving(true)
    try {
      const r = await fetch('/api/schedule/thermostat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId, entries }),
      })
      if (r.ok) { setMsg('Saved ✓') } else { setMsg('Error saving') }
    } catch { setMsg('Error saving') }
    setSaving(false)
    setTimeout(() => setMsg(''), 2500)
  }

  async function applyNow() {
    if (!token) return
    await fetch('/api/schedule/thermostat/apply', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    setMsg('Applied ✓')
    setTimeout(() => setMsg(''), 2000)
  }

  const toDisplay = (t: number) => unit === 'F' ? Math.round(t * 9 / 5 + 32) : t
  const fromDisplay = (t: number) => unit === 'F' ? Math.round((t - 32) * 5 / 9) : t

  if (climates.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
        No climate entities found. Add a thermostat integration first.
      </div>
    )
  }

  const CELL_W = 28
  const CELL_H = 26

  return (
    <div style={{ fontSize: 13 }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select
          value={entityId}
          onChange={e => setEntityId(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, flex: 1, minWidth: 160 }}
        >
          {climates.map(s => (
            <option key={s.entity_id} value={s.entity_id}>
              {String(s.attributes?.friendly_name ?? s.entity_id)}
            </option>
          ))}
        </select>

        <button
          onClick={() => setUnit(u => u === 'C' ? 'F' : 'C')}
          className="btn"
          style={{ fontSize: 11, padding: '4px 10px' }}
        >°{unit}</button>

        <button onClick={applyNow} className="btn" style={{ fontSize: 11, padding: '4px 10px' }}>Apply now</button>
        <button onClick={clearAll} className="btn" style={{ fontSize: 11, padding: '4px 10px', color: '#ff453a' }}>Clear all</button>
        <button onClick={save} className={`btn active`} disabled={saving} style={{ fontSize: 11, padding: '4px 14px' }}>
          {saving ? '…' : 'Save'}
        </button>
        {msg && <span style={{ color: msg.includes('Error') ? '#ff453a' : '#30d158', fontSize: 12, fontWeight: 600 }}>{msg}</span>}
      </div>

      {/* Temperature selector */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 80 }}>Set temp:</span>
        <input
          type="range"
          min={toDisplay(tempMin)} max={toDisplay(tempMax)} step={0.5}
          value={toDisplay(selectedTemp)}
          onChange={e => setSelectedTemp(fromDisplay(Number(e.target.value)))}
          style={{ flex: 1, accentColor: tempColor(selectedTemp, tempMin, tempMax) }}
        />
        <span style={{
          minWidth: 48, textAlign: 'center', fontWeight: 700, fontSize: 14,
          color: tempColor(selectedTemp, tempMin, tempMax),
          background: 'var(--card)', borderRadius: 6, padding: '2px 6px',
        }}>
          {toDisplay(selectedTemp)}°{unit}
        </span>
      </div>

      {/* Color legend */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8, fontSize: 11, color: 'var(--text2)' }}>
        <span>{toDisplay(tempMin)}°</span>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'linear-gradient(to right, hsl(220,75%,48%), hsl(120,75%,48%), hsl(60,75%,48%), hsl(0,75%,48%))' }} />
        <span>{toDisplay(tempMax)}°</span>
        <span style={{ marginLeft: 8, color: 'var(--text2)' }}>· drag to paint · click day/hour headers to fill</span>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
        <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(24, ${CELL_W}px)`, gap: 2, minWidth: 40 + 24 * (CELL_W + 2) }}>
          {/* Hour header */}
          <div />
          {HOURS.map(h => (
            <div
              key={h}
              onClick={() => fillHour(h)}
              title={`Fill hour ${formatHour(h)}`}
              style={{
                height: 18, fontSize: 9, color: 'var(--text2)', textAlign: 'center',
                cursor: 'pointer', lineHeight: '18px', userSelect: 'none',
              }}
            >
              {formatHour(h)}
            </div>
          ))}

          {/* Day rows */}
          {DAYS.map((day, d) => (
            <>
              <div
                key={day + '-label'}
                onClick={() => fillDay(d)}
                title={`Fill ${day}`}
                style={{
                  height: CELL_H, lineHeight: `${CELL_H}px`, fontSize: 11, fontWeight: 600,
                  color: 'var(--text2)', textAlign: 'right', paddingRight: 6,
                  cursor: 'pointer', userSelect: 'none',
                }}
              >
                {day}
              </div>
              {HOURS.map(h => {
                const t = getTemp(d, h)
                return (
                  <div
                    key={h}
                    onPointerDown={e => onCellDown(d, h, e)}
                    onPointerEnter={() => onCellEnter(d, h)}
                    onContextMenu={e => { e.preventDefault(); clearCell(d, h) }}
                    style={{
                      height: CELL_H, borderRadius: 3, cursor: 'crosshair',
                      background: t !== null ? tempColor(t, tempMin, tempMax) : 'var(--border)',
                      opacity: t !== null ? 1 : 0.4,
                      transition: 'background 0.1s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title={t !== null ? `${toDisplay(t)}°${unit}` : 'No schedule'}
                  >
                    {t !== null && <span style={{ fontSize: 8, color: '#fff', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{toDisplay(t)}</span>}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
        Left-click/drag to set temperature · Right-click to clear · Schedule applies automatically every 5 min
      </div>
    </div>
  )
}
