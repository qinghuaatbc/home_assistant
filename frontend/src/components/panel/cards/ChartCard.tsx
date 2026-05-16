import { useState, useEffect, memo } from 'react'
import { useHa } from '../../../context/HaContext'
import type { HaState } from '../../../context/HaContext'
import { useTh, cardSt } from '../PanelContext'

interface HistoryPoint { t: number; v: number }

function Sparkline({ points, color }: { points: HistoryPoint[]; color: string }) {
  if (points.length < 2) return <div style={{ flex: 1 }} />
  const W = 240, H = 56
  const min = Math.min(...points.map(p => p.v))
  const max = Math.max(...points.map(p => p.v))
  const range = max - min || 1
  const tMin = points[0].t, tRange = (points[points.length - 1].t - tMin) || 1

  const xs = points.map(p => ((p.t - tMin) / tRange) * W)
  const ys = points.map(p => H - ((p.v - min) / range) * H)

  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const fill = `${d} L${W},${H} L0,${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 56 }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color.replace('#','')})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const ChartCard = memo(({ s }: { s: HaState }) => {
  const { token } = useHa(); const th = useTh()
  const [points, setPoints] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)

  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const unit = String(s.attributes.unit_of_measurement ?? '')
  const current = parseFloat(s.state)

  const isTemp = unit.includes('°') || unit.toLowerCase().includes('temp')
  const color = isTemp
    ? (current > 26 ? '#ff9f0a' : current < 18 ? '#64d2ff' : '#30d158')
    : '#0a84ff'

  useEffect(() => {
    if (!token) return
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    fetch(`/api/history/period/${encodeURIComponent(since)}?filter_entity_id=${encodeURIComponent(s.entity_id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: { state: string; last_changed: string }[][]) => {
        const records = Array.isArray(data) ? (data[0] ?? []) : []
        const pts = records
          .map((d: { state: string; last_changed: string }) => ({ t: new Date(d.last_changed).getTime(), v: parseFloat(d.state) }))
          .filter(p => !isNaN(p.v))
        setPoints(pts)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [s.entity_id, token])

  const minV = points.length ? Math.min(...points.map(p => p.v)) : null
  const maxV = points.length ? Math.max(...points.map(p => p.v)) : null

  return (
    <div style={{ ...cardSt(th, { padding: '12px 14px 10px', gridColumn: 'span 2' }) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: th === 'day' ? '#555' : 'rgba(255,255,255,0.65)', letterSpacing: 0.2 }}>
          📈 {name}
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, color: th === 'day' ? '#111' : '#fff', letterSpacing: -0.5 }}>
          {isNaN(current) ? s.state : current.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 400, marginLeft: 2 }}>{unit}</span>
        </span>
      </div>

      {loading ? (
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(128,128,128,0.6)', fontSize: 11 }}>
          Loading…
        </div>
      ) : points.length < 2 ? (
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(128,128,128,0.6)', fontSize: 11 }}>
          No history
        </div>
      ) : (
        <Sparkline points={points} color={color} />
      )}

      {minV !== null && maxV !== null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'rgba(128,128,128,0.7)' }}>
          <span>↓ {minV.toFixed(1)}{unit}</span>
          <span style={{ color: 'rgba(128,128,128,0.5)' }}>24h</span>
          <span>↑ {maxV.toFixed(1)}{unit}</span>
        </div>
      )}
    </div>
  )
})
