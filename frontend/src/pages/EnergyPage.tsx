import { useState, useEffect, useCallback } from 'react'
import { useHa } from '../context/HaContext'

interface HistoryPoint { entity_id?: string; last_changed: string; state: string }

interface EnergyEntity {
  entity_id: string
  name: string
  unit: string
  currentValue: number | null
  deviceClass: string
  history: HistoryPoint[]
}

const RANGES: { label: string; hours: number }[] = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
]

const POWER_UNITS = new Set(['W', 'kW', 'VA', 'kVA'])
const ENERGY_UNITS = new Set(['Wh', 'kWh', 'MWh'])

function isPowerOrEnergy(s: any): boolean {
  const dc = s.attributes?.device_class as string | undefined
  if (dc === 'power' || dc === 'energy') return true
  const unit = s.attributes?.unit_of_measurement as string | undefined
  if (unit && (POWER_UNITS.has(unit) || ENERGY_UNITS.has(unit))) return true
  return false
}

// ── SVG Sparkline ────────────────────────────────────────────────────────────

function Sparkline({ points, color = '#007aff', height = 52 }: { points: number[]; color?: string; height?: number }) {
  if (points.length < 2) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 11 }}>No data</div>
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const pad = 3
  const w = 260
  const h = height - pad * 2
  const step = w / (points.length - 1)
  const toY = (v: number) => pad + h - ((v - min) / range) * h

  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
  const area = `${d} L${((points.length - 1) * step).toFixed(1)},${(height).toFixed(1)} L0,${(height).toFixed(1)} Z`

  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height, display: 'block', overflow: 'visible' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace('#', '')})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Entity Card ──────────────────────────────────────────────────────────────

function EnergyCard({ entity, rangeHours }: { entity: EnergyEntity; rangeHours: number }) {
  const pts = entity.history
    .map(p => parseFloat(p.state))
    .filter(v => !isNaN(v))

  const isPower = POWER_UNITS.has(entity.unit)
  const color = isPower ? '#ff9500' : '#30d158'

  const avg = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null
  const peak = pts.length ? Math.max(...pts) : null

  const fmt = (v: number | null) => v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)}k` : v.toFixed(1)

  return (
    <div style={{ background: 'var(--card)', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{entity.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{entity.entity_id}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>
            {fmt(entity.currentValue)}<span style={{ fontSize: 12, marginLeft: 2 }}>{entity.unit}</span>
          </div>
        </div>
      </div>

      <Sparkline points={pts} color={color} height={52} />

      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: 'var(--text2)' }}>
        <span>Avg: <b style={{ color: 'var(--text)' }}>{fmt(avg)} {entity.unit}</b></span>
        <span>Peak: <b style={{ color: 'var(--text)' }}>{fmt(peak)} {entity.unit}</b></span>
        <span>Samples: <b style={{ color: 'var(--text)' }}>{pts.length}</b></span>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function EnergyPage() {
  const { states, token } = useHa()
  const [rangeHours, setRangeHours] = useState(6)
  const [entities, setEntities] = useState<EnergyEntity[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'power' | 'energy'>('all')

  const powerEntities = Array.from(states.values()).filter(isPowerOrEnergy)

  const load = useCallback(async () => {
    if (!token || powerEntities.length === 0) return
    setLoading(true)
    try {
      const start = new Date(Date.now() - rangeHours * 3600 * 1000).toISOString()
      const ids = powerEntities.map(s => s.entity_id).join(',')
      const r = await fetch(
        `/api/history/period/${encodeURIComponent(start)}?filter_entity_id=${encodeURIComponent(ids)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const data: HistoryPoint[][] = r.ok ? await r.json() : []

      const histMap = new Map<string, HistoryPoint[]>()
      for (const arr of data) {
        if (arr.length > 0 && arr[0].entity_id) histMap.set(arr[0].entity_id, arr)
      }

      const result: EnergyEntity[] = powerEntities.map(s => {
        const unit = (s.attributes?.unit_of_measurement as string) ?? ''
        const hist = histMap.get(s.entity_id) ?? []
        const currentValue = parseFloat(s.state)
        return {
          entity_id: s.entity_id,
          name: String(s.attributes?.friendly_name ?? s.entity_id.replace(/[._]/g, ' ')),
          unit,
          currentValue: isNaN(currentValue) ? null : currentValue,
          deviceClass: String(s.attributes?.device_class ?? ''),
          history: hist,
        }
      }).sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0))

      setEntities(result)
    } catch {}
    setLoading(false)
  }, [token, rangeHours, states])

  useEffect(() => { load() }, [rangeHours])

  // Total current power (W entities only)
  const totalW = entities
    .filter(e => e.unit === 'W' && e.currentValue != null)
    .reduce((sum, e) => sum + (e.currentValue ?? 0), 0)

  const totalKwh = entities
    .filter(e => e.unit === 'kWh' && e.currentValue != null)
    .reduce((sum, e) => sum + (e.currentValue ?? 0), 0)

  const filtered = entities.filter(e => {
    if (filter === 'power') return POWER_UNITS.has(e.unit)
    if (filter === 'energy') return ENERGY_UNITS.has(e.unit)
    return true
  })

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="nav-title">⚡ Energy Monitor</div>
          <button className="btn" onClick={load} style={{ fontSize: 12 }}>↻</button>
        </div>

        {/* Summary banner */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, background: 'rgba(255,149,0,0.12)', borderRadius: 12, padding: '14px 16px', textAlign: 'center', border: '1.5px solid #ff9500' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#ff9500' }}>
              {totalW >= 1000 ? `${(totalW / 1000).toFixed(2)} kW` : `${totalW.toFixed(0)} W`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Live Power</div>
          </div>
          {totalKwh > 0 && (
            <div style={{ flex: 1, background: 'rgba(48,209,88,0.12)', borderRadius: 12, padding: '14px 16px', textAlign: 'center', border: '1.5px solid #30d158' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#30d158' }}>
                {totalKwh.toFixed(2)} kWh
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Total Energy</div>
            </div>
          )}
          <div style={{ flex: 1, background: 'var(--card)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{entities.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Sensors</div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--card)', borderRadius: 8, padding: 4 }}>
            {RANGES.map(r => (
              <button
                key={r.label}
                onClick={() => setRangeHours(r.hours)}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: rangeHours === r.hours ? 'var(--blue, #007aff)' : 'transparent',
                  color: rangeHours === r.hours ? '#fff' : 'var(--text2)',
                }}
              >{r.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--card)', borderRadius: 8, padding: 4 }}>
            {(['all', 'power', 'energy'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: filter === f ? 'var(--blue, #007aff)' : 'transparent',
                  color: filter === f ? '#fff' : 'var(--text2)',
                  textTransform: 'capitalize',
                }}
              >{f}</button>
            ))}
          </div>
        </div>

        {loading && <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '2rem', fontSize: 13 }}>Loading…</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
            No power or energy sensors found.<br />
            Add sensors with <code style={{ fontFamily: 'monospace', fontSize: 11 }}>device_class: power</code> or <code style={{ fontFamily: 'monospace', fontSize: 11 }}>device_class: energy</code>.
          </div>
        )}

        {!loading && filtered.map(e => (
          <EnergyCard key={e.entity_id} entity={e} rangeHours={rangeHours} />
        ))}
      </div>
    </div>
  )
}
