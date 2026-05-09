import { useState, useEffect, useRef } from 'react'
import { useHa } from '../context/HaContext'

interface HistoryPoint {
  entity_id: string
  state: number
  last_changed: string
}

export default function HistoryPage() {
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

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = y0 + (ch * i) / 4
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke()
    }

    // Y-axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const val = min + (valRange * (4 - i)) / 4
      const y = y0 + (ch * i) / 4
      ctx.fillText(val.toFixed(1), x0 - 6, y + 4)
    }

    // X-axis labels
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

    // Data line
    if (data.length >= 2) {
      ctx.strokeStyle = '#4d8fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      data.forEach((d, i) => {
        const x = x0 + ((new Date(d.last_changed).getTime() - tMin) / tRange) * cw
        const y = y1 - ((d.state - min) / valRange) * ch
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Dots
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
    }
  }, [data])

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">📊 History</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <select value={entityId} onChange={e => setEntityId(e.target.value)}
            style={{ flex: 1, minWidth: 180, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}>
            {sensors.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          {['1h', '6h', '24h', '7d'].map(r => (
            <button key={r} className={`btn${range === r ? ' active' : ''}`}
              style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>

        <div style={{ marginTop: 12, background: 'var(--card)', borderRadius: 8, padding: 8 }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: 200 }} />
          {loading && <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '2rem 0' }}>Loading…</div>}
          {!loading && data.length < 2 && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '4rem 0', fontSize: 13 }}>
              {data.length === 0 ? 'No history data for this entity' : 'Need at least 2 data points'}
            </div>
          )}
          {!loading && data.length >= 2 && (
            <div style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'center', marginTop: 4 }}>
              {data.length} data points · {entityId}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
