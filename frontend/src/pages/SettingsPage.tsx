import { useHa } from '../context/HaContext'
import { useState, useEffect } from 'react'

function BackupSection() {
  const { token } = useHa()
  const [msg, setMsg] = useState('')

  const doBackup = async () => {
    try {
      const r = await fetch('/api/backup', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!r.ok) throw new Error('Backup failed')
      const blob = await r.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `ha-backup-${new Date().toISOString().slice(0, 10)}.db`
      a.click()
      setMsg('✅ Downloaded')
      setTimeout(() => setMsg(''), 3000)
    } catch { setMsg('❌ Backup failed') }
  }

  return (
    <>
      <div className="ios-list-row" style={{ cursor: 'pointer' }} onClick={doBackup}>
        <div className="ios-list-icon" style={{ background: 'rgba(48,209,88,0.15)' }}>💾</div>
        <div className="ios-list-content">
          <div className="ios-list-title">Download Backup</div>
          <div className="ios-list-subtitle">SQLite database snapshot</div>
        </div>
        <span style={{ fontSize: 11 }}>⬇</span>
      </div>
      {msg && <div style={{ padding: '6px 16px', fontSize: 12, color: msg.startsWith('✅') ? '#30d158' : '#ff453a' }}>{msg}</div>}
    </>
  )
}

interface LltEntry {
  id: string
  name: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

function LongLivedTokensSection() {
  const { token } = useHa()
  const [tokens, setTokens] = useState<LltEntry[]>([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const authHeader = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    fetch('/api/auth/long_lived_tokens', { headers: authHeader })
      .then(r => r.json())
      .then(setTokens)
      .catch(() => {})
  }, [token])

  const create = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const r = await fetch('/api/auth/long_lived_tokens', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), expires_days: 3650 }),
      })
      if (!r.ok) throw new Error()
      const data = await r.json()
      setNewToken(data.token)
      setTokens(prev => [...prev, data])
      setNewName('')
    } catch { /* ignore */ }
    setCreating(false)
  }

  const revoke = async (id: string) => {
    setRevoking(id)
    try {
      await fetch(`/api/auth/long_lived_tokens/${id}`, {
        method: 'DELETE',
        headers: authHeader,
      })
      setTokens(prev => prev.filter(t => t.id !== id))
    } catch { /* ignore */ }
    setRevoking(null)
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ padding: '0 16px' }}>
      {/* New token */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()}
          placeholder="Token name (e.g. RTI Panel)"
          style={{
            flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '7px 12px', color: 'var(--text1)', fontSize: 14,
          }}
        />
        <button
          onClick={create}
          disabled={creating || !newName.trim()}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
            opacity: creating || !newName.trim() ? 0.5 : 1,
          }}
        >
          {creating ? '…' : 'Create'}
        </button>
      </div>

      {/* One-time token display */}
      {newToken && (
        <div style={{
          background: 'rgba(255,159,10,0.1)', border: '1px solid rgba(255,159,10,0.4)',
          borderRadius: 8, padding: '10px 12px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--yellow)', marginBottom: 6, fontWeight: 600 }}>
            ⚠ Copy now — token cannot be retrieved again
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all',
            color: 'var(--text1)', marginBottom: 8,
          }}>
            {newToken}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => copy(newToken)}
              style={{
                background: copied ? 'rgba(48,209,88,0.2)' : 'var(--accent)',
                color: copied ? '#30d158' : '#fff', border: 'none',
                borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
              }}
            >
              {copied ? '✓ Copied' : 'Copy Token'}
            </button>
            <button
              onClick={() => copy(`${window.location.origin}/panel?token=${newToken}`)}
              style={{
                background: 'rgba(10,132,255,0.15)', color: 'var(--accent)',
                border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
              }}
            >
              Copy Panel URL
            </button>
            <button
              onClick={() => setNewToken(null)}
              style={{
                marginLeft: 'auto', background: 'none', color: 'var(--text2)',
                border: 'none', fontSize: 18, cursor: 'pointer', padding: '0 4px',
              }}
            >×</button>
          </div>
        </div>
      )}

      {/* Token list */}
      {tokens.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text2)', padding: '8px 0' }}>No tokens yet</div>
      ) : (
        tokens.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 0', borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--text1)', fontWeight: 500 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                Created {new Date(t.created_at).toLocaleDateString()}
                {t.last_used_at && ` · Used ${new Date(t.last_used_at).toLocaleDateString()}`}
                {t.expires_at && ` · Expires ${new Date(t.expires_at).toLocaleDateString()}`}
              </div>
            </div>
            <button
              onClick={() => revoke(t.id)}
              disabled={revoking === t.id}
              style={{
                background: 'rgba(255,69,58,0.12)', color: '#ff453a',
                border: 'none', borderRadius: 6, padding: '4px 10px',
                fontSize: 12, cursor: 'pointer', flexShrink: 0,
                opacity: revoking === t.id ? 0.5 : 1,
              }}
            >
              {revoking === t.id ? '…' : 'Revoke'}
            </button>
          </div>
        ))
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { logout, wsConnected } = useHa()

  const isLight = document.documentElement.classList.contains('light')

  const toggleTheme = () => {
    const next = isLight ? 'dark' : 'light'
    if (next === 'light') document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
    localStorage.setItem('ha_theme', next)
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">Settings</div>
        </div>

        {/* Appearance */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">Appearance</div>
          <div className="ios-list">
            <div className="ios-list-row">
              <div className="ios-list-icon" style={{ background: 'rgba(255,159,10,0.15)' }}>
                {isLight ? '☀️' : '🌙'}
              </div>
              <div className="ios-list-content">
                <div className="ios-list-title">Theme</div>
                <div className="ios-list-subtitle">{isLight ? 'Light mode' : 'Dark mode'}</div>
              </div>
              <label className="ios-toggle">
                <input type="checkbox" checked={isLight} onChange={toggleTheme} />
                <span className="ios-slider" />
              </label>
            </div>
          </div>
        </div>

        {/* Connection */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">Connection</div>
          <div className="ios-list">
            <div className="ios-list-row">
              <div
                className="ios-list-icon"
                style={{ background: wsConnected ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)' }}
              >
                {wsConnected ? '🟢' : '🔴'}
              </div>
              <div className="ios-list-content">
                <div className="ios-list-title">WebSocket</div>
                <div className="ios-list-subtitle">{wsConnected ? 'Connected — Live updates active' : 'Disconnected'}</div>
              </div>
            </div>
            <div className="ios-list-row">
              <div className="ios-list-icon" style={{ background: 'rgba(10,132,255,0.15)' }}>🏠</div>
              <div className="ios-list-content">
                <div className="ios-list-title">Server</div>
                <div className="ios-list-subtitle">localhost:8123</div>
              </div>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">About</div>
          <div className="ios-list">
            <div className="ios-list-row">
              <div className="ios-list-icon" style={{ background: 'rgba(10,132,255,0.15)' }}>🏠</div>
              <div className="ios-list-content">
                <div className="ios-list-title">Home Assistant</div>
                <div className="ios-list-subtitle">NestJS · v2026.3.0</div>
              </div>
            </div>
          </div>
        </div>

        {/* Backup */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">📦 Maintenance</div>
          <div className="ios-list">
            <BackupSection />
          </div>
        </div>

        {/* Long-Lived Tokens */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">🔑 Long-Lived Tokens</div>
          <LongLivedTokensSection />
        </div>

        {/* Account */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">Account</div>
          <div className="ios-list">
            <button
              className="ios-list-row"
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onClick={logout}
            >
              <div className="ios-list-icon" style={{ background: 'rgba(255,69,58,0.15)' }}>🚪</div>
              <div className="ios-list-content">
                <div className="ios-list-title" style={{ color: 'var(--red)' }}>Sign Out</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
