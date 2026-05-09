import { useState, useEffect, useRef } from 'react'
import { useHa } from '../context/HaContext'

interface LogEntry {
  id: number
  time: string
  event: string
  data: string
}

export default function EventsPage() {
  const { token } = useHa()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState('')
  const [paused, setPaused] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(0)

  useEffect(() => {
    if (!token) return
    const es = new EventSource('/api/events/stream')
    return () => es.close()
  }, [token])

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
          setLogs(prev => [entry, ...prev].slice(0, 500))
        }
      } catch {}
    }
    return () => ws.close()
  }, [token])

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, paused])

  const filtered = filter
    ? logs.filter(l => l.event.includes(filter) || l.data.includes(filter))
    : logs

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">Live Events</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', width: 140 }} />
            <button className={`btn${paused ? ' active' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setPaused(!paused)}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
            <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => setLogs([])}>Clear</button>
          </div>
        </div>

        <div style={{ fontFamily: 'monospace', fontSize: 11, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
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
                whiteSpace: 'nowrap', fontWeight: 600, minWidth: 140,
              }}>{log.event}</span>
              <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log.data}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
