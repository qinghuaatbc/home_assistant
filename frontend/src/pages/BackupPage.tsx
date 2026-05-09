import { useState } from 'react'
import { useHa } from '../context/HaContext'

export default function BackupPage() {
  const { token } = useHa()
  const [msg, setMsg] = useState('')

  const doBackup = async () => {
    try {
      const r = await fetch('/api/backup', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!r.ok) throw new Error('Backup failed')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `home-assistant-backup-${new Date().toISOString().slice(0, 10)}.db`
      a.click()
      URL.revokeObjectURL(url)
      setMsg('✅ Backup downloaded')
    } catch (err: any) {
      setMsg(`❌ ${err.message}`)
    }
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">Backup & Restore</div>
        </div>

        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">📦 Backup Database</div>
          <div className="ios-list">
            <div className="ios-list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                Download a snapshot of the SQLite database. Contains all entity states,
                registered devices, and configuration history.
              </div>
              <button className="btn btn-accent" style={{ alignSelf: 'flex-start' }} onClick={doBackup}>
                ⬇ Download Backup
              </button>
            </div>
          </div>
        </div>

        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">📥 Restore</div>
          <div className="ios-list">
            <div className="ios-list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                Upload a previously downloaded backup file to restore. This will replace
                the current database. The server will restart automatically.
              </div>
              <input type="file" accept=".db" style={{ fontSize: 13 }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const form = new FormData()
                  form.append('backup', file)
                  try {
                    const r = await fetch('/api/backup/restore', {
                      method: 'POST',
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                      body: form,
                    })
                    if (!r.ok) throw new Error(await r.text())
                    setMsg('✅ Restore successful! Reloading…')
                    setTimeout(() => location.reload(), 2000)
                  } catch (err: any) {
                    setMsg(`❌ ${err.message}`)
                  }
                  e.target.value = ''
                }} />
            </div>
          </div>
        </div>

        {msg && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, fontSize: 13,
            background: msg.startsWith('✅') ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)',
            color: msg.startsWith('✅') ? '#30d158' : '#ff453a', textAlign: 'center' }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  )
}
