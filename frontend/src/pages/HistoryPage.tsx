import { useState, useEffect, useRef } from 'react'
import { useHa } from '../context/HaContext'

interface HistoryPoint {
  entity_id: string
  state: number
  last_changed: string
}

interface LogEntry {
  id: number
  time: string
  event: string
  data: string
}

function ChartTab() {
  const { token, states } = useHa()
  const [entityId, setEntityId] = useState('sensor.temperature')
  const [range, setRange] = useState('1h')
  const [data, setData] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const sensors = Array.from(states.entries())
    .filter(([, s]) => s.attributes?.unit_of_measurement || s.entity_id.startsWith('sensor.'))
    .map(([id]) => id)
    .sort()

  const rangeMs: Record<string, number> = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 }

  useEffect(() => {
    if (!token || !entityId) return
    setLoading(true)
    const start = new Date(Date.now() - rangeMs[range]).toISOString()
    fetch(`/api/history/period/${start}?filter_entity_id=${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((rows: HistoryPoint[][]) => {
        const pts = (rows[0] ?? [])
          .filter(p => p.state != null)
          .map(p => ({ ...p, state: Number(p.state) }))
          .filter(p => !isNaN(p.state))
        setData(pts)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [entityId, range, token])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    const W = rect.width, H = rect.height

    ctx.clearRect(0, 0, W, H)

    const pad = { top: 10, right: 10, bottom: 25, left: 50 }
    const x0 = pad.left, x1 = W - pad.right, y0 = pad.top, y1 = H - pad.bottom
    const cw = x1 - x0, ch = y1 - y0

    const values = data.map(d => d.state)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const valRange = Math.max(max - min, 1)
    const times = data.map(d => new Date(d.last_changed).getTime())
    const tMin = Math.min(...times)
    const tRange = Math.max(Math.max(...times) - tMin, 1)

    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = y0 + (ch * i) / 4
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke()
    }

    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const val = min + (valRange * (4 - i)) / 4
      const y = y0 + (ch * i) / 4
      ctx.fillText(val.toFixed(1), x0 - 6, y + 4)
    }

    ctx.textAlign = 'center'
    const fmt = (t: number) => {
      const d = new Date(t)
      return range === '24h' || range === '7d'
        ? `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
        : `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
    }
    for (let i = 0; i <= 4; i++) {
      const t = tMin + (tRange * i) / 4
      ctx.fillText(fmt(t), x0 + (cw * i) / 4, H - 6)
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(0, y0, 0, y1)
    grad.addColorStop(0, 'rgba(77,143,255,0.3)')
    grad.addColorStop(1, 'rgba(77,143,255,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    data.forEach((d, i) => {
      const x = x0 + ((new Date(d.last_changed).getTime() - tMin) / tRange) * cw
      const y = y1 - ((d.state - min) / valRange) * ch
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.lineTo(x0 + ((new Date(data[data.length - 1].last_changed).getTime() - tMin) / tRange) * cw, y1)
    ctx.lineTo(x0, y1)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = '#4d8fff'
    ctx.lineWidth = 2
    ctx.beginPath()
    data.forEach((d, i) => {
      const x = x0 + ((new Date(d.last_changed).getTime() - tMin) / tRange) * cw
      const y = y1 - ((d.state - min) / valRange) * ch
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()

    const step = Math.max(1, Math.floor(data.length / 60))
    data.forEach((d, i) => {
      if (i % step !== 0 && i !== data.length - 1) return
      const x = x0 + ((new Date(d.last_changed).getTime() - tMin) / tRange) * cw
      const y = y1 - ((d.state - min) / valRange) * ch
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#4d8fff'
      ctx.fill()
    })
  }, [data])

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <select value={entityId} onChange={e => setEntityId(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}>
          {sensors.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
        {(['1h', '6h', '24h', '7d'] as const).map(r => (
          <button key={r} className={`btn${range === r ? ' active' : ''}`}
            style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => setRange(r)}>{r}</button>
        ))}
      </div>

      <div style={{ marginTop: 12, background: 'var(--card)', borderRadius: 8, padding: 8 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: 200 }} />
        {loading && <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '2rem 0' }}>Loading…</div>}
        {!loading && data.length < 2 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '4rem 0', fontSize: 13 }}>
            {data.length === 0 ? 'No numeric history for this entity' : 'Need at least 2 data points'}
          </div>
        )}
        {!loading && data.length >= 2 && (
          <div style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center', marginTop: 4 }}>
            {data.length} points · min {Math.min(...data.map(d => d.state)).toFixed(1)} · max {Math.max(...data.map(d => d.state)).toFixed(1)}
          </div>
        )}
      </div>
    </>
  )
}

function EventsTab() {
  const { token } = useHa()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState('')
  const [paused, setPaused] = useState(false)
  const idRef = useRef(0)

  useEffect(() => {
    if (!token) return
    const ws = new WebSocket(`ws://${location.host}/api/websocket`)
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', access_token: token }))
      ws.send(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'state_changed' }))
    }
    ws.onmessage = (msg) => {
      try {
        const m = JSON.parse(msg.data)
        if (m.type === 'event' && m.event?.event_type) {
          idRef.current++
          const entry: LogEntry = {
            id: idRef.current,
            time: new Date().toLocaleTimeString(),
            event: m.event.event_type,
            data: JSON.stringify(m.event.data ?? {}).slice(0, 200),
          }
          if (!paused) setLogs(prev => [entry, ...prev].slice(0, 500))
        }
      } catch {}
    }
    return () => ws.close()
  }, [token, paused])

  const filtered = filter
    ? logs.filter(l => l.event.includes(filter) || l.data.includes(filter))
    : logs

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
        <input placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)}
          style={{ flex: 1, fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' }} />
        <button className={`btn${paused ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
          onClick={() => setPaused(!paused)}>{paused ? '▶' : '⏸'}</button>
        <button className="btn" style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
          onClick={() => setLogs([])}>Clear</button>
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 11, overflowY: 'auto', flex: 1 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
            Waiting for events…
          </div>
        )}
        {filtered.map(log => (
          <div key={log.id} style={{
            display: 'flex', gap: 8, padding: '3px 8px', borderBottom: '1px solid var(--border)',
            alignItems: 'flex-start',
          }}>
            <span style={{ color: 'var(--text2)', whiteSpace: 'nowrap', minWidth: 70 }}>{log.time}</span>
            <span style={{
              color: log.event === 'state_changed' ? '#4d8fff' : '#ff9a3c',
              whiteSpace: 'nowrap', fontWeight: 600, minWidth: 130,
            }}>{log.event}</span>
            <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {log.data}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Shared canvas line-chart helper ────────────────────────────────────────

function drawLine(canvas: HTMLCanvasElement, pts: { t: number; v: number }[], color = '#4d8fff', fill = true) {
  const ctx = canvas.getContext('2d')
  if (!ctx || pts.length < 2) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)
  const W = rect.width, H = rect.height
  const pad = { top: 4, right: 4, bottom: 4, left: 4 }
  const cw = W - pad.left - pad.right
  const ch = H - pad.top - pad.bottom
  const vals = pts.map(p => p.v)
  const min = Math.min(...vals), max = Math.max(...vals)
  const vr = Math.max(max - min, 0.001)
  const tMin = pts[0].t, tMax = pts[pts.length - 1].t, tr = Math.max(tMax - tMin, 1)
  const x = (t: number) => pad.left + ((t - tMin) / tr) * cw
  const y = (v: number) => pad.top + (1 - (v - min) / vr) * ch
  if (fill) {
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch)
    grad.addColorStop(0, color.replace(')', ',0.3)').replace('rgb', 'rgba'))
    grad.addColorStop(1, color.replace(')', ',0)').replace('rgb', 'rgba'))
    ctx.fillStyle = grad
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(x(p.t), y(p.v)) : ctx.lineTo(x(p.t), y(p.v)))
    ctx.lineTo(x(pts[pts.length - 1].t), pad.top + ch)
    ctx.lineTo(x(pts[0].t), pad.top + ch)
    ctx.closePath(); ctx.fill()
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
  ctx.beginPath()
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(x(p.t), y(p.v)) : ctx.lineTo(x(p.t), y(p.v)))
  ctx.stroke()
}

// ─── Energy Tab ─────────────────────────────────────────────────────────────

interface HP { t: number; v: number }

const ENERGY_UNITS = new Set(['W', 'kW', 'Wh', 'kWh', 'VA', 'A'])
const ENERGY_KEYWORDS = ['power', 'energy', 'consumption', 'watt', 'kwh', 'ampere', 'current', 'voltage']

function isEnergySensor(entityId: string, unit?: string): boolean {
  if (unit && ENERGY_UNITS.has(unit)) return true
  const lower = entityId.toLowerCase()
  return ENERGY_KEYWORDS.some(k => lower.includes(k))
}

function Sparkline({ token, entityId, color }: { token: string; entityId: string; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const start = new Date(Date.now() - 3600000 * 6).toISOString()
    fetch(`/api/history/period/${start}?filter_entity_id=${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((rows: any[][]) => {
        const pts: HP[] = (rows[0] ?? [])
          .map((p: any) => ({ t: new Date(p.last_changed).getTime(), v: Number(p.state) }))
          .filter(p => !isNaN(p.v))
        if (canvasRef.current && pts.length > 1) drawLine(canvasRef.current, pts, color, false)
      })
      .catch(() => {})
  }, [token, entityId, color])
  return <canvas ref={canvasRef} style={{ width: '100%', height: 36 }} />
}

function EnergyDetail({ token, entityId, label, unit }: { token: string; entityId: string; label: string; unit: string }) {
  const [range, setRange] = useState('24h')
  const [pts, setPts] = useState<HP[]>([])
  const [loading, setLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rangeMs: Record<string, number> = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000 }

  useEffect(() => {
    if (!token) return
    setLoading(true)
    const start = new Date(Date.now() - rangeMs[range]).toISOString()
    fetch(`/api/history/period/${start}?filter_entity_id=${entityId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((rows: any[][]) => {
        const p: HP[] = (rows[0] ?? [])
          .map((p: any) => ({ t: new Date(p.last_changed).getTime(), v: Number(p.state) }))
          .filter(p => !isNaN(p.v))
        setPts(p)
      })
      .catch(() => setPts([]))
      .finally(() => setLoading(false))
  }, [token, entityId, range])

  useEffect(() => {
    if (canvasRef.current && pts.length > 1) drawLine(canvasRef.current, pts, '#ff9a3c')
  }, [pts])

  const avg = pts.length ? pts.reduce((s, p) => s + p.v, 0) / pts.length : 0
  const peak = pts.length ? Math.max(...pts.map(p => p.v)) : 0

  return (
    <div style={{ background: 'var(--card)', borderRadius: 10, padding: 12, marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{label}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['1h', '6h', '24h', '7d'] as const).map(r => (
            <button key={r} className={`btn${range === r ? ' active' : ''}`}
              style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: 120 }} />
      {loading && <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)', padding: 8 }}>Loading…</div>}
      {!loading && pts.length < 2 && <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)', padding: 8 }}>No data</div>}
      {pts.length > 1 && (
        <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>
          <span>Avg: <b style={{ color: 'var(--text)' }}>{avg.toFixed(1)} {unit}</b></span>
          <span>Peak: <b style={{ color: '#ff9a3c' }}>{peak.toFixed(1)} {unit}</b></span>
          <span>Points: {pts.length}</span>
        </div>
      )}
    </div>
  )
}

function EnergyTab() {
  const { token, states } = useHa()
  const [selected, setSelected] = useState<string | null>(null)

  const sensors = Array.from(states.values())
    .filter(s => isEnergySensor(s.entity_id, s.attributes?.unit_of_measurement as string))
    .sort((a, b) => {
      const va = Number(a.state) || 0
      const vb = Number(b.state) || 0
      return vb - va
    })

  // Group by unit
  const byUnit = sensors.reduce<Record<string, typeof sensors>>((acc, s) => {
    const u = (s.attributes?.unit_of_measurement as string) || '?'
    ;(acc[u] ??= []).push(s)
    return acc
  }, {})

  const unitColors: Record<string, string> = {
    W: '#ff9a3c', kW: '#ff6b3d', Wh: '#4d8fff', kWh: '#af52de',
    A: '#30d158', V: '#5ac8fa', VA: '#ffd60a',
  }

  const selSensor = selected ? states.get(selected) : null

  // Bar chart of top consumers (watts only)
  const wattSensors = sensors.filter(s => ['W', 'kW'].includes(s.attributes?.unit_of_measurement as string)).slice(0, 8)
  const topCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = topCanvasRef.current
    if (!canvas || wattSensors.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    const W = rect.width, H = rect.height
    const vals = wattSensors.map(s => {
      const v = Number(s.state)
      const u = s.attributes?.unit_of_measurement as string
      return u === 'kW' ? v * 1000 : v
    })
    const maxVal = Math.max(...vals, 1)
    const barW = (W - 8) / vals.length - 4
    vals.forEach((v, i) => {
      const h = Math.max(4, (v / maxVal) * (H - 24))
      const x = 4 + i * (barW + 4)
      const grad = ctx.createLinearGradient(0, H - h - 4, 0, H - 4)
      grad.addColorStop(0, '#ff9a3c'); grad.addColorStop(1, '#ff6b3d44')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.roundRect?.(x, H - h - 20, barW, h, 3) ?? ctx.fillRect(x, H - h - 20, barW, h)
      ctx.fill()
      ctx.fillStyle = 'var(--text2)'
      ctx.font = `${Math.min(10, barW - 2)}px sans-serif`
      ctx.textAlign = 'center'
      const label = String(wattSensors[i].attributes?.friendly_name ?? wattSensors[i].entity_id.split('.')[1]).slice(0, 8)
      ctx.fillText(label, x + barW / 2, H - 4)
      ctx.fillStyle = '#ff9a3c'
      ctx.font = `bold 9px sans-serif`
      ctx.fillText(v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${v.toFixed(0)}`, x + barW / 2, H - h - 23)
    })
  }, [wattSensors.map(s => s.state).join(',')])

  if (sensors.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
        No energy / power sensors found. Add a power monitoring integration.
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 12 }}>
      {/* Top consumers bar chart */}
      {wattSensors.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4, fontWeight: 600 }}>⚡ Top Power Consumers (W)</div>
          <div style={{ background: 'var(--card)', borderRadius: 8, padding: '8px 8px 4px' }}>
            <canvas ref={topCanvasRef} style={{ width: '100%', height: 80 }} />
          </div>
        </div>
      )}

      {/* Sensor cards grouped by unit */}
      {Object.entries(byUnit).map(([unit, ss]) => (
        <div key={unit} style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>
            {unitColors[unit] ? <span style={{ color: unitColors[unit] }}>●</span> : null} {unit}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {ss.map(s => {
              const name = String(s.attributes?.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
              const val = Number(s.state)
              const color = unitColors[unit] || '#4d8fff'
              const isSelected = selected === s.entity_id
              return (
                <div
                  key={s.entity_id}
                  onClick={() => setSelected(isSelected ? null : s.entity_id)}
                  style={{
                    background: isSelected ? 'var(--surface)' : 'var(--card)',
                    borderRadius: 10, padding: '10px 10px 6px',
                    border: `1.5px solid ${isSelected ? color : 'transparent'}`,
                    cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>
                    {isNaN(val) ? s.state : val.toFixed(val < 10 ? 1 : 0)}
                    <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2, color: 'var(--text2)' }}>{unit}</span>
                  </div>
                  {token && <Sparkline token={token} entityId={s.entity_id} color={color} />}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Detail chart */}
      {selected && selSensor && token && (
        <EnergyDetail
          token={token}
          entityId={selected}
          label={String(selSensor.attributes?.friendly_name ?? selected)}
          unit={String(selSensor.attributes?.unit_of_measurement ?? '')}
        />
      )}
    </div>
  )
}

interface VoiceEntry {
  id: number
  transcript: string
  response: string
  lang: string
  action: string | null
  createdAt: string
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`
  return new Date(iso).toLocaleDateString()
}

function langIcon(lang: string) {
  if (lang === 'zh') return '🇨🇳'
  if (lang === 'fa') return '🇮🇷'
  return '🇺🇸'
}

function VoiceTab() {
  const { token } = useHa()
  const [entries, setEntries] = useState<VoiceEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    fetch('/api/ai/voice/history', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  const repeat = (text: string, lang: string) => {
    if (!window.speechSynthesis) return
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = lang === 'zh' ? 'zh-CN' : lang === 'fa' ? 'fa-IR' : 'en-US'
    window.speechSynthesis.speak(utt)
  }

  if (loading) return <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem' }}>Loading…</div>
  if (entries.length === 0) return (
    <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
      No voice commands yet. Use the 🎤 voice button to get started.
    </div>
  )

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {entries.map(e => (
        <div key={e.id} style={{
          background: 'var(--card)', borderRadius: 10, padding: '10px 12px',
          marginTop: 8, display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 18, lineHeight: 1, paddingTop: 2, flexShrink: 0 }}>{langIcon(e.lang)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>{relTime(e.createdAt)}</span>
              {e.action && <span style={{ fontSize: 10, background: '#4d8fff22', color: '#4d8fff', borderRadius: 4, padding: '1px 6px' }}>action</span>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🎤 {e.transcript}
            </div>
            {e.response && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                🤖 {e.response}
              </div>
            )}
          </div>
          <button
            onClick={() => repeat(e.transcript, e.lang)}
            title="Repeat with TTS"
            style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 14, color: 'var(--text2)' }}
          >🔁</button>
        </div>
      ))}
    </div>
  )
}

export default function HistoryPage() {
  const [tab, setTab] = useState<'chart' | 'events' | 'energy' | 'voice'>('chart')

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="page-inner" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="nav-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="nav-title" style={{ margin: 0 }}>📊 History</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`btn${tab === 'chart' ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setTab('chart')}>Chart</button>
              <button className={`btn${tab === 'events' ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setTab('events')}>Events</button>
              <button className={`btn${tab === 'energy' ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setTab('energy')}>⚡ Energy</button>
              <button className={`btn${tab === 'voice' ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setTab('voice')}>🎤 Voice</button>
            </div>
          </div>
        </div>

        {tab === 'chart' && <ChartTab />}
        {tab === 'events' && <EventsTab />}
        {tab === 'energy' && <EnergyTab />}
        {tab === 'voice' && <VoiceTab />}
      </div>
    </div>
  )
}
