import { useHa } from '../context/HaContext'
import { useState } from 'react'

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
