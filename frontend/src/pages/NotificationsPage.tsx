import { useState, useEffect, useCallback } from 'react'
import { useHa } from '../context/HaContext'

interface NotifLog {
  id: number
  title: string
  body: string
  icon: string
  createdAt: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function NotificationsPage() {
  const { token } = useHa()
  const [logs, setLogs] = useState<NotifLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!token) return
    setLoading(true)
    setError('')
    fetch('/api/push/history', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setLogs)
      .catch(() => setError('Failed to load notification history'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { load() }, [load])

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="page-inner" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="nav-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="nav-title" style={{ margin: 0 }}>🔔 Alerts</div>
            <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={load}>
              Refresh
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
              Loading…
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', color: '#ff453a', padding: '2rem 1rem', fontSize: 13 }}>
              {error}
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13 }}>
              No notifications yet
            </div>
          )}

          {!loading && logs.map(log => (
            <div key={log.id} style={{
              display: 'flex', gap: 12, padding: '12px 16px',
              borderBottom: '1px solid var(--border)', alignItems: 'flex-start',
            }}>
              <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>
                {log.icon?.endsWith('.svg') || log.icon?.endsWith('.png') || log.icon?.endsWith('.ico')
                  ? '🔔'
                  : (log.icon || '🔔')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.title}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>
                    {relativeTime(log.createdAt)}
                  </span>
                </div>
                {log.body && (
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                    {log.body}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
