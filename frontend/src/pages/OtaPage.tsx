import { useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'

interface OtaStatus {
  currentVersion: string
  hasUpdate: boolean
  gitBranch: string
  gitCommit: string
  gitLog: string[]
  updateEntities: {
    entity_id: string
    name: string
    state: string
    installedVersion: string
    latestVersion: string
    title: string
    releaseNotes: string
  }[]
}

export default function OtaPage() {
  const { token, callService } = useHa()
  const [status, setStatus] = useState<OtaStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(true)
  const [confirmUpdate, setConfirmUpdate] = useState(false)

  const hdrs = { Authorization: `Bearer ${token ?? ''}` }

  const flash = (text: string, ok = true) => { setMsg(text); setMsgOk(ok); setTimeout(() => setMsg(''), 5000) }

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/ota/status', { headers: hdrs })
      if (r.ok) setStatus(await r.json())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const doServerUpdate = async () => {
    setUpdating(true)
    setConfirmUpdate(false)
    try {
      const r = await fetch('/api/ota/update-server', { method: 'POST', headers: hdrs })
      if (r.ok) {
        flash('✅ Update started. Server will restart in ~60 seconds…')
        setTimeout(() => location.reload(), 70_000)
      } else flash('❌ Update failed', false)
    } catch { flash('❌ Network error', false) }
    setUpdating(false)
  }

  const installDevice = async (entity_id: string) => {
    setInstallingId(entity_id)
    try {
      await callService('update', 'install', {}, entity_id)
      flash(`✅ Update triggered for ${entity_id}`)
      setTimeout(load, 3000)
    } catch { flash('❌ Install failed', false) }
    setInstallingId(null)
  }

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="nav-title">🔄 Firmware & Updates</div>
          <button className="btn" onClick={load} style={{ fontSize: 12 }}>↻ Refresh</button>
        </div>

        {loading && <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem' }}>Checking for updates…</div>}

        {!loading && status && (
          <>
            {/* Server update */}
            <div style={{ background: 'var(--card)', borderRadius: 12, padding: 16, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🖥 Home Assistant Server</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                    Version <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{status.currentVersion}</span>
                    {' · '}Branch <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{status.gitBranch}</span>
                    {' · '}Commit <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{status.gitCommit}</span>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {status.hasUpdate ? (
                      <span style={{ fontSize: 12, background: '#ff9a3c22', color: '#ff9a3c', borderRadius: 6, padding: '2px 8px' }}>
                        ⬆ {status.gitLog.length} commit{status.gitLog.length !== 1 ? 's' : ''} available
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, background: '#30d15822', color: '#30d158', borderRadius: 6, padding: '2px 8px' }}>
                        ✓ Up to date
                      </span>
                    )}
                  </div>
                </div>
                {status.hasUpdate && !confirmUpdate && (
                  <button
                    className="btn btn-accent"
                    onClick={() => setConfirmUpdate(true)}
                    style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}
                  >⬆ Update</button>
                )}
              </div>

              {/* Pending commits */}
              {status.gitLog.length > 0 && (
                <div style={{ marginTop: 12, background: 'var(--surface)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4, fontWeight: 600 }}>PENDING CHANGES</div>
                  {status.gitLog.map((line, i) => (
                    <div key={i} style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text)', padding: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {/* Confirm update */}
              {confirmUpdate && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#ff9a3c15', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#ff9a3c' }}>Pull latest code and restart server?</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setConfirmUpdate(false)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text2)' }}>Cancel</button>
                    <button onClick={doServerUpdate} disabled={updating} style={{ padding: '4px 14px', borderRadius: 6, border: 'none', background: '#ff9a3c', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      {updating ? 'Updating…' : 'Update Now'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Device firmware updates */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8, letterSpacing: 0.5 }}>
                DEVICE FIRMWARE ({status.updateEntities.length})
              </div>

              {status.updateEntities.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '2rem', fontSize: 13 }}>
                  No updatable devices found. Devices expose firmware updates as <code style={{ fontFamily: 'monospace', fontSize: 11 }}>update.*</code> entities.
                </div>
              )}

              {status.updateEntities.map(e => (
                <div key={e.entity_id} style={{ background: 'var(--card)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{e.title || e.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                        {e.installedVersion && <>Installed: <span style={{ fontFamily: 'monospace' }}>{e.installedVersion}</span></>}
                        {e.latestVersion && e.latestVersion !== e.installedVersion && (
                          <> → Latest: <span style={{ fontFamily: 'monospace', color: '#ff9a3c' }}>{e.latestVersion}</span></>
                        )}
                      </div>
                    </div>
                    {e.state === 'on' ? (
                      <button
                        className="btn btn-accent"
                        onClick={() => installDevice(e.entity_id)}
                        disabled={installingId === e.entity_id}
                        style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}
                      >{installingId === e.entity_id ? 'Installing…' : '⬆ Install'}</button>
                    ) : (
                      <span style={{ fontSize: 11, color: '#30d158', background: '#30d15820', borderRadius: 6, padding: '3px 8px' }}>✓ Current</span>
                    )}
                  </div>
                  {e.releaseNotes && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                      {e.releaseNotes.slice(0, 200)}{e.releaseNotes.length > 200 ? '…' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

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
