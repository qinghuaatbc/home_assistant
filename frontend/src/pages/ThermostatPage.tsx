import { useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SLOTS = ['00:00', '06:00', '08:00', '12:00', '17:00', '21:00', '23:00']

const STORAGE_KEY = 'ha_thermostat_schedules'

type SlotTemp = number | null
type DaySchedule = Record<string, SlotTemp>  // slot → temp
type ThermostatSchedule = Record<string, DaySchedule>  // day → slots

function loadSchedules(): Record<string, ThermostatSchedule> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function saveSchedules(s: Record<string, ThermostatSchedule>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

function defaultSchedule(): ThermostatSchedule {
  const s: ThermostatSchedule = {}
  for (const d of DAYS) {
    s[d] = {}
    for (const sl of SLOTS) s[d][sl] = null
  }
  return s
}

function tempColor(t: number | null): string {
  if (t == null) return 'var(--card)'
  if (t <= 16) return '#5ac8fa'
  if (t <= 19) return '#007aff'
  if (t <= 21) return '#30d158'
  if (t <= 24) return '#ff9500'
  return '#ff3b30'
}

function ScheduleGrid({
  schedule,
  onChange,
}: {
  schedule: ThermostatSchedule
  onChange: (s: ThermostatSchedule) => void
}) {
  const [editing, setEditing] = useState<{ day: string; slot: string } | null>(null)
  const [draft, setDraft] = useState('')

  const startEdit = (day: string, slot: string) => {
    const v = schedule[day]?.[slot]
    setDraft(v == null ? '' : String(v))
    setEditing({ day, slot })
  }

  const commit = () => {
    if (!editing) return
    const n = parseFloat(draft)
    const next = { ...schedule }
    next[editing.day] = { ...next[editing.day], [editing.slot]: isNaN(n) ? null : Math.round(n * 10) / 10 }
    onChange(next)
    setEditing(null)
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 6px', color: 'var(--text2)', fontWeight: 600, textAlign: 'left', minWidth: 48 }}>Time</th>
            {DAYS.map(d => (
              <th key={d} style={{ padding: '4px 6px', color: 'var(--text2)', fontWeight: 600, textAlign: 'center', minWidth: 44 }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SLOTS.map(slot => (
            <tr key={slot}>
              <td style={{ padding: '3px 6px', color: 'var(--text2)', whiteSpace: 'nowrap', fontSize: 11 }}>{slot}</td>
              {DAYS.map(day => {
                const val = schedule[day]?.[slot] ?? null
                const isEditing = editing?.day === day && editing?.slot === slot
                return (
                  <td key={day} style={{ padding: 2, textAlign: 'center' }}>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null) }}
                        placeholder="°"
                        style={{
                          width: 40, padding: '3px 4px', textAlign: 'center', fontSize: 12,
                          border: '1.5px solid var(--blue, #007aff)', borderRadius: 6,
                          background: 'var(--bg)', color: 'var(--text)',
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => startEdit(day, slot)}
                        style={{
                          width: 40, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: tempColor(val),
                          color: val != null ? '#fff' : 'var(--text2)',
                          fontWeight: val != null ? 700 : 400,
                          fontSize: 11,
                        }}
                      >
                        {val != null ? `${val}°` : '—'}
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 8, textAlign: 'center' }}>
        Tap a cell to set temperature · Leave blank to hold previous
      </div>
    </div>
  )
}

export default function ThermostatPage() {
  const { states, callService, token } = useHa()
  const [schedules, setSchedules] = useState<Record<string, ThermostatSchedule>>(loadSchedules)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [msg, setMsg] = useState('')

  const climates = Array.from(states.values())
    .filter(s => s.entity_id.startsWith('climate.'))
    .sort((a, b) => String(a.attributes?.friendly_name ?? a.entity_id).localeCompare(String(b.attributes?.friendly_name ?? b.entity_id)))

  useEffect(() => {
    if (climates.length > 0 && !activeId) setActiveId(climates[0].entity_id)
  }, [climates.length])

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(''), 4000) }

  const getSchedule = (id: string): ThermostatSchedule => schedules[id] ?? defaultSchedule()

  const updateSchedule = (id: string, s: ThermostatSchedule) => {
    const next = { ...schedules, [id]: s }
    setSchedules(next)
    saveSchedules(next)
  }

  // Apply current slot temperature to the real thermostat
  const applyNow = async (entityId: string) => {
    const now = new Date()
    const dayIdx = (now.getDay() + 6) % 7 // 0=Mon
    const day = DAYS[dayIdx]
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:00`
    const sched = getSchedule(entityId)
    const daySlots = sched[day] ?? {}

    // Find the most recent slot that's <= now
    let targetTemp: number | null = null
    for (const slot of SLOTS) {
      if (slot <= hhmm && daySlots[slot] != null) targetTemp = daySlots[slot]
    }

    if (targetTemp == null) { flash('No temperature set for current time slot'); return }
    setApplying(true)
    try {
      await callService('climate', 'set_temperature', { temperature: targetTemp }, entityId)
      flash(`✅ Applied ${targetTemp}°C to ${entityId}`)
    } catch { flash('❌ Failed to apply') }
    setApplying(false)
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">🌡️ Thermostat Schedule</div>
        </div>

        {climates.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
            No climate entities found.<br />
            Add a <code style={{ fontFamily: 'monospace', fontSize: 11 }}>climate.*</code> entity to use scheduling.
          </div>
        )}

        {/* Thermostat selector */}
        {climates.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
            {climates.map(c => {
              const name = String(c.attributes?.friendly_name ?? c.entity_id.replace('climate.', '').replace(/_/g, ' '))
              return (
                <button
                  key={c.entity_id}
                  onClick={() => setActiveId(c.entity_id)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: activeId === c.entity_id ? 'var(--blue, #007aff)' : 'var(--card)',
                    color: activeId === c.entity_id ? '#fff' : 'var(--text)',
                    fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >{name}</button>
              )
            })}
          </div>
        )}

        {activeId && (() => {
          const entity = states.get(activeId)
          if (!entity) return null
          const name = String(entity.attributes?.friendly_name ?? activeId.replace('climate.', '').replace(/_/g, ' '))
          const current = entity.attributes?.current_temperature as number | undefined
          const setpoint = entity.attributes?.temperature as number | undefined
          const hvacMode = entity.state
          const sched = getSchedule(activeId)

          return (
            <>
              {/* Current status */}
              <div style={{ background: 'var(--card)', borderRadius: 12, padding: '12px 14px', marginTop: climates.length <= 1 ? 12 : 0, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                      Mode: <span style={{ color: 'var(--text)', fontWeight: 600, textTransform: 'capitalize' }}>{hvacMode}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {current != null && <div style={{ fontSize: 28, fontWeight: 700 }}>{current}°</div>}
                    {setpoint != null && <div style={{ fontSize: 12, color: 'var(--text2)' }}>→ {setpoint}° set</div>}
                  </div>
                </div>
              </div>

              {/* Temperature legend */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {[
                  { label: '≤16°', color: '#5ac8fa' }, { label: '17-19°', color: '#007aff' },
                  { label: '20-21°', color: '#30d158' }, { label: '22-24°', color: '#ff9500' },
                  { label: '≥25°', color: '#ff3b30' },
                ].map(({ label, color }) => (
                  <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text2)' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
                    {label}
                  </span>
                ))}
              </div>

              {/* Schedule grid */}
              <div style={{ background: 'var(--card)', borderRadius: 12, padding: '12px 10px', marginBottom: 14 }}>
                <ScheduleGrid schedule={sched} onChange={s => updateSchedule(activeId, s)} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-accent"
                  onClick={() => applyNow(activeId)}
                  disabled={applying}
                  style={{ flex: 1 }}
                >
                  {applying ? 'Applying…' : '▶ Apply Current Slot Now'}
                </button>
                <button
                  className="btn"
                  onClick={() => { updateSchedule(activeId, defaultSchedule()); flash('Schedule cleared') }}
                  style={{ flexShrink: 0 }}
                >
                  Clear
                </button>
              </div>

              {msg && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 8, fontSize: 13, textAlign: 'center',
                  background: msg.startsWith('✅') ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)',
                  color: msg.startsWith('✅') ? '#30d158' : msg.startsWith('❌') ? '#ff453a' : 'var(--text2)',
                }}>
                  {msg}
                </div>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}
