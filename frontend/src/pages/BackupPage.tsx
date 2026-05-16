import { useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'

interface Snapshot {
  id: string
  label: string
  createdAt: string
  sizeBytes: number
  files: string[]
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function BackupPage() {
  const { token } = useHa()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [label, setLabel] = useState('')
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(true)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  const hdrs = () => ({ Authorization: `Bearer ${token ?? ''}` })

  const flash = (text: string, ok = true) => { setMsg(text); setMsgOk(ok); setTimeout(() => setMsg(''), 4000) }

  const load = () => {
    fetch('/api/backup/snapshots', { headers: hdrs() })
      .then(r => r.json()).then(setSnapshots).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const createSnapshot = async () => {
    setCreating(true)
    try {
      const r = await fetch('/api/backup/snapshot', {
        method: 'POST',
        headers: { ...hdrs(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label || new Date().toLocaleString() }),
      })
      if (r.ok) { flash('✅ Snapshot created'); setLabel(''); load() }
      else flash('❌ Failed to create snapshot', false)
    } catch { flash('❌ Network error', false) }
    setCreating(false)
  }

  const deleteSnapshot = async (id: string) => {
    const r = await fetch(`/api/backup/snapshots/${id}`, { method: 'DELETE', headers: hdrs() })
    if (r.ok) { flash('Snapshot deleted'); load() }
    setConfirming(null)
  }

  const restoreSnapshot = async (id: string) => {
    const r = await fetch(`/api/backup/snapshots/${id}/restore`, { method: 'POST', headers: hdrs() })
    if (r.ok) { flash('✅ Restoring… page will reload'); setTimeout(() => location.reload(), 3000) }
    else flash('❌ Restore failed', false)
    setConfirming(null)
  }

  const downloadLive = async () => {
    const r = await fetch('/api/backup', { headers: hdrs() })
    if (!r.ok) { flash('❌ Download failed', false); return }
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ha-backup-${new Date().toISOString().slice(0, 10)}.db`
    a.click()
    URL.revokeObjectURL(a.href)
    flash('✅ Database downloaded')
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">🗄 Backup & Restore</div>
        </div>

        {/* Create snapshot */}
        <div style={{ background: 'var(--card)', borderRadius: 12, padding: 16, marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>📸 Create Snapshot</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
            Saves the database + all YAML config files. Snapshots are stored on the server and can be restored later.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Snapshot label (optional)…"
              onKeyDown={e => e.key === 'Enter' && createSnapshot()}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
            />
            <button className="btn btn-accent" onClick={createSnapshot} disabled={creating} style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
              {creating ? '…' : '+ Create'}
            </button>
          </div>
          <button className="btn" onClick={downloadLive} style={{ fontSize: 12 }}>
            ⬇ Download Live DB
          </button>
        </div>

        {/* Snapshot list */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, letterSpacing: 0.5 }}>
            SAVED SNAPSHOTS ({snapshots.length})
          </div>

          {snapshots.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '2rem', fontSize: 13 }}>
              No snapshots yet. Create one above.
            </div>
          )}

          {snapshots.map(snap => (
            <div key={snap.id} style={{ background: 'var(--card)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {snap.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>
                    {relTime(snap.createdAt)} · {fmtSize(snap.sizeBytes)} · {snap.files.join(', ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <a
                    href={`/api/backup/snapshots/${snap.id}/download`}
                    style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 11, textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                  >⬇</a>
                  <button
                    onClick={() => setConfirming(`restore:${snap.id}`)}
                    style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: '#30d158', cursor: 'pointer', fontSize: 11 }}
                  >Restore</button>
                  <button
                    onClick={() => setConfirming(`delete:${snap.id}`)}
                    style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: '#ff453a22', color: '#ff453a', cursor: 'pointer', fontSize: 11 }}
                  >✕</button>
                </div>
              </div>

              {/* Confirm dialog inline */}
              {confirming === `delete:${snap.id}` && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#ff453a' }}>Delete this snapshot?</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setConfirming(null)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text2)' }}>Cancel</button>
                    <button onClick={() => deleteSnapshot(snap.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#ff453a', color: '#fff', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                  </div>
                </div>
              )}
              {confirming === `restore:${snap.id}` && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#30d158' }}>Restore "{snap.label}"? Server will restart.</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setConfirming(null)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text2)' }}>Cancel</button>
                    <button onClick={() => restoreSnapshot(snap.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#30d158', color: '#fff', cursor: 'pointer', fontSize: 12 }}>Restore</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Upload restore */}
        <div style={{ background: 'var(--card)', borderRadius: 12, padding: 16, marginTop: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>📥 Restore from File</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>Upload a .db file to restore the database directly.</div>
          <input type="file" accept=".db" style={{ fontSize: 13 }}
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              const form = new FormData()
              form.append('backup', file)
              try {
                const r = await fetch('/api/backup/restore', { method: 'POST', headers: hdrs(), body: form })
                if (r.ok) { flash('✅ Restoring… page will reload'); setTimeout(() => location.reload(), 3000) }
                else { const d = await r.json(); flash(`❌ ${d.error}`, false) }
              } catch { flash('❌ Upload failed', false) }
              e.target.value = ''
            }} />
        </div>

        {msg && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 8, fontSize: 13,
            background: msgOk ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)',
            color: msgOk ? '#30d158' : '#ff453a', textAlign: 'center' }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  )
}
