import { useHa } from '../context/HaContext'
import { useState, useEffect, useMemo, useRef } from 'react'
import { usePushSubscription } from '../hooks/usePushSubscription'
import { SystemStats } from '../components/SystemStats'

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
            flex: 1, background: 'var(--bg2)', border: '1px solid var(--sep)',
            borderRadius: 8, padding: '7px 12px', color: 'var(--text1)', fontSize: 14,
          }}
        />
        <button
          onClick={create}
          disabled={creating || !newName.trim()}
          style={{
            background: 'var(--blue)', color: '#fff', border: 'none',
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
                background: copied ? 'rgba(48,209,88,0.2)' : 'var(--blue)',
                color: copied ? '#30d158' : '#fff', border: 'none',
                borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
              }}
            >
              {copied ? '✓ Copied' : 'Copy Token'}
            </button>
            <button
              onClick={() => copy(`${window.location.origin}/panel?token=${newToken}`)}
              style={{
                background: 'rgba(10,132,255,0.15)', color: 'var(--blue)',
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
            padding: '8px 0', borderBottom: '1px solid var(--sep)',
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

const CARD_TYPES = [
  { type: 'light',        desc: '灯光，带亮度滑块',            domain: 'light' },
  { type: 'switch',       desc: '通用开关，可自定义 icon',      domain: 'switch / input_boolean' },
  { type: 'sensor',       desc: '门/窗/移动 二进制传感器',      domain: 'binary_sensor' },
  { type: 'curtain',      desc: '窗帘 / 百叶窗',               domain: 'cover / binary_sensor' },
  { type: 'cover',        desc: '车库门 cover 实体',           domain: 'cover' },
  { type: 'lock',         desc: '门锁',                        domain: 'lock' },
  { type: 'alarm',        desc: '报警控制面板',                 domain: 'alarm_control_panel' },
  { type: 'camera',       desc: '摄像头实时画面',               domain: 'camera' },
  { type: 'media-player', desc: '音响/媒体播放器，带音量',       domain: 'media_player' },
  { type: 'climate',      desc: '温湿度传感器',                 domain: 'sensor' },
  { type: 'thermostat',   desc: '温控器 (Nest/Ecobee)',         domain: 'climate' },
  { type: 'fan',          desc: '风扇，带速度滑块',             domain: 'fan' },
  { type: 'scene',        desc: '场景磁贴',                    domain: 'scene' },
  { type: 'automation',   desc: '自动化，可启用/触发',           domain: 'automation' },
  { type: 'button',       desc: '按一下触发动作',               domain: 'button / script' },
  { type: 'number',       desc: '数值滑块调节',                 domain: 'number / input_number' },
  { type: 'select',       desc: '循环切换选项',                 domain: 'select / input_select' },
  { type: 'chart',        desc: '传感器 24h 历史曲线',          domain: 'sensor' },
]

function DashboardEditorSection() {
  const { token, states } = useHa()
  const [yaml, setYaml] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (!token) return
    fetch('/api/config/dashboard/text', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setYaml(d.content ?? '')).catch(() => {})
  }, [token])

  const save = async () => {
    setSaving(true); setMsg('')
    try {
      const r = await fetch('/api/config/dashboard/text', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: yaml }),
      })
      setMsg(r.ok ? '✅ 已保存' : '❌ 保存失败')
    } catch { setMsg('❌ 网络错误') }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const domains = useMemo(() => {
    const s = new Set<string>()
    states.forEach((_, id) => s.add(id.split('.')[0]))
    return Array.from(s).sort()
  }, [states])

  const entities = useMemo(() => {
    const list: { id: string; name: string; domain: string }[] = []
    states.forEach((s, id) => {
      const domain = id.split('.')[0]
      const name = String(s.attributes.friendly_name ?? id)
      if (domainFilter && domain !== domainFilter) return
      if (search && !id.includes(search) && !name.toLowerCase().includes(search.toLowerCase())) return
      list.push({ id, name, domain })
    })
    return list.sort((a, b) => a.id.localeCompare(b.id))
  }, [states, search, domainFilter])

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(''), 1500) })
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div className="section-title">📋 Dashboard 编辑器</div>

      {/* YAML editor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
        <textarea
          value={yaml}
          onChange={e => setYaml(e.target.value)}
          spellCheck={false}
          style={{
            width: '100%', minHeight: 260, fontFamily: 'monospace', fontSize: 12,
            padding: 12, borderRadius: 10, boxSizing: 'border-box',
            background: 'var(--surface)', border: '1px solid var(--sep)',
            color: 'var(--text)', resize: 'vertical', lineHeight: 1.55,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={save} disabled={saving} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--blue)', color: '#fff', fontWeight: 600, fontSize: 13,
          }}>{saving ? '保存中…' : '保存'}</button>
          {msg && <span style={{ fontSize: 12, color: msg.startsWith('✅') ? '#30d158' : '#ff453a' }}>{msg}</span>}
        </div>
      </div>

      {/* Card type reference */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Card Types</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {CARD_TYPES.map(c => (
            <div key={c.type} onClick={() => copy(c.type)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
              borderRadius: 8, cursor: 'pointer', fontSize: 12,
              background: copied === c.type ? 'rgba(48,209,88,0.12)' : 'var(--surface)',
              border: '1px solid var(--sep)', transition: 'background 0.2s',
            }}>
              <code style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--blue)', minWidth: 100 }}>{c.type}</code>
              <span style={{ color: 'var(--text)', flex: 1 }}>{c.desc}</span>
              <span style={{ color: 'var(--text2)', fontSize: 11 }}>{c.domain}</span>
              {copied === c.type && <span style={{ color: '#30d158', fontSize: 11 }}>✓ 已复制</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Entity browser */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Entity IDs（点击复制）</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            placeholder="搜索 entity_id 或名称…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12,
              background: 'var(--surface)', border: '1px solid var(--sep)', color: 'var(--text)',
            }}
          />
          <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)} style={{
            padding: '7px 8px', borderRadius: 8, fontSize: 12,
            background: 'var(--surface)', border: '1px solid var(--sep)', color: 'var(--text)',
          }}>
            <option value="">全部 domain</option>
            {domains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {entities.map(e => (
            <div key={e.id} onClick={() => copy(e.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
              borderRadius: 8, cursor: 'pointer', fontSize: 12,
              background: copied === e.id ? 'rgba(48,209,88,0.12)' : 'var(--surface)',
              border: '1px solid var(--sep)', transition: 'background 0.2s',
            }}>
              <code style={{ fontFamily: 'monospace', color: 'var(--blue)', flex: 1 }}>{e.id}</code>
              <span style={{ color: 'var(--text2)', fontSize: 11, flexShrink: 0 }}>{e.name}</span>
              {copied === e.id && <span style={{ color: '#30d158', fontSize: 11, flexShrink: 0 }}>✓</span>}
            </div>
          ))}
          {entities.length === 0 && <div style={{ fontSize: 12, color: 'var(--text2)', padding: 8 }}>无匹配实体</div>}
        </div>
      </div>
    </div>
  )
}

function PanelQrSection() {
  const { token } = useHa()
  const [panelToken, setPanelToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const url = panelToken
    ? `https://${window.location.hostname}/panel?token=${panelToken}`
    : null

  const generate = async () => {
    if (!token) return
    setLoading(true)
    try {
      const r = await fetch('/api/auth/long_lived_tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Panel QR', expires_days: 3650 }),
      })
      if (!r.ok) throw new Error()
      const data = await r.json()
      setPanelToken(data.token)
      setShow(true)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    if (!show || !url || !canvasRef.current) return
    const canvas = canvasRef.current
    import('qrcode').then(m => m.default.toCanvas(canvas, url, { width: 200, margin: 1, color: { dark: '#000', light: '#fff' } })).catch(() => {})
  }, [show, url])

  return (
    <div style={{ padding: '10px 16px 8px' }}>
      {!panelToken ? (
        <button
          onClick={generate}
          disabled={loading}
          style={{ fontSize: 12, color: 'var(--blue)', background: 'rgba(10,132,255,0.1)', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? '…' : '📱 Generate QR Code for Panel'}
        </button>
      ) : (
        <>
          <button
            onClick={() => setShow(s => !s)}
            style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: show ? 10 : 0 }}
          >
            {show ? '▲ Hide QR Code' : '▼ Show QR Code'}
          </button>
          {show && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <canvas ref={canvasRef} style={{ borderRadius: 10, display: 'block' }} />
              <span style={{ fontSize: 10, color: 'var(--text2)', wordBreak: 'break-all', textAlign: 'center', maxWidth: 260 }}>
                {url}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(url!)}
                  style={{ fontSize: 12, color: 'var(--blue)', background: 'rgba(10,132,255,0.1)', border: 'none', borderRadius: 8, padding: '5px 14px', cursor: 'pointer' }}
                >
                  Copy URL
                </button>
                <button
                  onClick={() => { setPanelToken(null); setShow(false) }}
                  style={{ fontSize: 12, color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  New token
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PushNotificationSection() {
  const { token } = useHa()
  const { supported, subscribed, loading, error: pushError, toggle } = usePushSubscription(token)
  const [msg, setMsg] = useState('')

  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isStandalone = typeof navigator !== 'undefined' && 'standalone' in navigator && !!(navigator as any).standalone

  const handle = async () => {
    await toggle()
    setMsg(subscribed ? '✅ Unsubscribed' : '✅ Enabled')
    setTimeout(() => setMsg(''), 2500)
  }

  if (!supported) return (
    <div className="ios-list-row">
      <div className="ios-list-icon" style={{ background: 'rgba(255,159,10,0.15)' }}>🔔</div>
      <div className="ios-list-content">
        <div className="ios-list-title">Push Notifications</div>
        <div className="ios-list-subtitle">
          {isIos && !isStandalone
            ? 'iPhone: Safari → Share → Add to Home Screen，再从主屏幕打开'
            : 'Not supported in this browser'}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div className="ios-list-row" style={{ cursor: 'pointer' }} onClick={handle}>
        <div className="ios-list-icon" style={{ background: subscribed ? 'rgba(48,209,88,0.15)' : 'rgba(10,132,255,0.15)' }}>
          {subscribed ? '🔔' : '🔕'}
        </div>
        <div className="ios-list-content">
          <div className="ios-list-title">Push Notifications</div>
          <div className="ios-list-subtitle">{subscribed ? 'Enabled — tap to disable' : 'Tap to enable (doors, alarms, locks)'}</div>
        </div>
        {loading
          ? <span style={{ fontSize: 12, color: 'var(--text2)' }}>…</span>
          : <label className="ios-toggle" onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={subscribed} onChange={handle} />
              <span className="ios-slider" />
            </label>
        }
      </div>
      {(msg || pushError) && <div style={{ padding: '4px 16px', fontSize: 12, color: pushError ? '#ff453a' : '#30d158' }}>{pushError || msg}</div>}
    </>
  )
}

interface NRule { id: string; entity_id: string; state: string; title: string; body: string; enabled: boolean }

const STATE_SUGGESTIONS: Record<string, string[]> = {
  binary_sensor: ['on', 'off'],
  cover:         ['open', 'closed', 'opening', 'closing'],
  lock:          ['locked', 'unlocked'],
  alarm_control_panel: ['armed_away', 'armed_home', 'disarmed', 'triggered'],
  switch:        ['on', 'off'],
  light:         ['on', 'off'],
  sensor:        [],
}

function NotificationRulesSection() {
  const { token, states } = useHa()
  const [rules, setRules] = useState<NRule[]>([])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ entity_id: '', state: '', title: '', body: '', enabled: true })
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  useEffect(() => {
    if (!token) return
    fetch('/api/push/notification-rules', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) ? setRules(d) : null).catch(() => {})
  }, [token])

  const domain = form.entity_id.split('.')[0]
  const suggestions = STATE_SUGGESTIONS[domain] ?? []

  const entitySuggestions = useMemo(() => {
    const list: { id: string; name: string }[] = []
    states.forEach((s, id) => {
      const name = String(s.attributes.friendly_name ?? id)
      if (!search || id.includes(search) || name.toLowerCase().includes(search.toLowerCase()))
        list.push({ id, name })
    })
    return list.sort((a, b) => a.id.localeCompare(b.id)).slice(0, 20)
  }, [states, search])

  const resetForm = () => {
    setAdding(false); setEditingId(null)
    setForm({ entity_id: '', state: '', title: '', body: '', enabled: true })
    setSearch(''); setSaveError('')
  }

  const startEdit = (rule: NRule) => {
    setEditingId(rule.id)
    setAdding(false)
    setForm({ entity_id: rule.entity_id, state: rule.state, title: rule.title, body: rule.body, enabled: rule.enabled })
    setSearch(rule.entity_id)
    setSaveError('')
  }

  const save = async () => {
    if (!form.entity_id.trim()) { setSaveError('Entity ID is required'); return }
    if (!form.state.trim()) { setSaveError('State is required'); return }
    if (!form.title.trim()) { setSaveError('Title is required'); return }
    setSaving(true); setSaveError('')
    try {
      const payload = { ...form, entity_id: form.entity_id.trim(), state: form.state.trim(), title: form.title.trim() }
      if (editingId) {
        const r = await fetch(`/api/push/notification-rules/${editingId}`, { method: 'PUT', headers, body: JSON.stringify(payload) })
        if (r.ok) { const updated = await r.json(); setRules(prev => prev.map(x => x.id === editingId ? updated : x)); resetForm() }
        else { const txt = await r.text(); setSaveError(`Error ${r.status}: ${txt.slice(0, 60)}`) }
      } else {
        const r = await fetch('/api/push/notification-rules', { method: 'POST', headers, body: JSON.stringify(payload) })
        if (r.ok) { const created = await r.json(); setRules(prev => [...prev, created]); resetForm() }
        else { const txt = await r.text(); setSaveError(`Error ${r.status}: ${txt.slice(0, 60)}`) }
      }
    } catch (e: any) { setSaveError('Network error: ' + (e?.message ?? '')) }
    setSaving(false)
  }

  const toggle = async (rule: NRule) => {
    const r = await fetch(`/api/push/notification-rules/${rule.id}`, { method: 'PUT', headers, body: JSON.stringify({ enabled: !rule.enabled }) })
    if (r.ok) setRules(prev => prev.map(x => x.id === rule.id ? { ...x, enabled: !x.enabled } : x))
  }

  const del = async (id: string) => {
    await fetch(`/api/push/notification-rules/${id}`, { method: 'DELETE', headers })
    setRules(prev => prev.filter(r => r.id !== id))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--sep)', background: 'var(--surface2)',
    color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
  }

  return (
    <div style={{ marginTop: 12, padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>NOTIFICATION RULES ({rules.length})</span>
        {!adding && !editingId && (
          <button onClick={() => setAdding(true)}
            style={{ fontSize: 13, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 8, padding: '5px 14px', cursor: 'pointer', fontWeight: 600 }}>
            + Add
          </button>
        )}
      </div>

      {(adding || editingId) && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--sep)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>
            {editingId ? 'EDIT RULE' : 'NEW RULE'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={save} disabled={saving}
              style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving…' : editingId ? '✓ Update' : '✓ Save'}
            </button>
            <button onClick={resetForm}
              style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--sep)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>

          {saveError && <div style={{ fontSize: 12, color: '#ff453a', marginBottom: 10, padding: '6px 8px', background: 'rgba(255,69,58,0.1)', borderRadius: 6 }}>{saveError}</div>}

          <div style={{ marginBottom: 8, position: 'relative' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Entity ID</div>
            <input value={form.entity_id}
              onChange={e => { setForm(f => ({ ...f, entity_id: e.target.value })); setSearch(e.target.value) }}
              placeholder="cover.garage_door" autoCapitalize="none" autoCorrect="off" autoComplete="off"
              style={inputStyle} />
            {search && entitySuggestions.length > 0 && !entitySuggestions.find(e => e.id === form.entity_id) && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 99, background: 'var(--surface)', border: '1px solid var(--sep)', borderRadius: 8, maxHeight: 160, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                {entitySuggestions.map(e => (
                  <div key={e.id} onMouseDown={ev => { ev.preventDefault(); setForm(f => ({ ...f, entity_id: e.id })); setSearch(e.id) }}
                    style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid var(--sep)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--blue)', fontFamily: 'monospace', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.id}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>{e.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>State (e.g. open, on, unlocked)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: suggestions.length ? 6 : 0 }}>
              {suggestions.map(s => (
                <button key={s} onMouseDown={() => setForm(f => ({ ...f, state: s }))}
                  style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${form.state === s ? 'var(--blue)' : 'var(--sep)'}`, background: form.state === s ? 'rgba(10,132,255,0.12)' : 'var(--surface2)', color: form.state === s ? 'var(--blue)' : 'var(--text)', fontSize: 12, cursor: 'pointer' }}>
                  {s}
                </button>
              ))}
            </div>
            <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
              placeholder={suggestions[0] ?? 'on'} autoCapitalize="none" autoCorrect="off"
              style={inputStyle} />
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Notification title</div>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="🚗 Garage Door" style={inputStyle} />
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>Body (optional)</div>
            <input value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Garage door opened" style={inputStyle} />
          </div>
        </div>
      )}

      {rules.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: 'var(--text2)', padding: '8px 4px' }}>
          No rules yet. Built-in rules always active for door/motion/smoke/alarm/lock.
        </div>
      )}

      {rules.map(rule => (
        <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--sep)' }}>
          <label className="ios-toggle" style={{ flexShrink: 0 }} onClick={() => toggle(rule)}>
            <input type="checkbox" checked={rule.enabled} onChange={() => {}} />
            <span className="ios-slider" />
          </label>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{rule.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
              <code style={{ color: 'var(--blue)' }}>{rule.entity_id}</code>
              <span style={{ marginLeft: 6 }}>→ {rule.state}</span>
              {rule.body && <span style={{ marginLeft: 6, opacity: 0.7 }}>"{rule.body}"</span>}
            </div>
          </div>
          <button onClick={() => startEdit(rule)}
            style={{ background: 'rgba(10,132,255,0.12)', color: 'var(--blue)', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
            Edit
          </button>
          <button onClick={() => del(rule.id)}
            style={{ background: 'rgba(255,69,58,0.12)', color: '#ff453a', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
            Del
          </button>
        </div>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const { logout, wsConnected, token } = useHa()

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

        {/* System Health */}
        {token && <div style={{ marginTop: 16 }}><SystemStats token={token} /></div>}

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

        {/* Push Notifications */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">🔔 Push Notifications</div>
          <div className="ios-list">
            <PushNotificationSection />
          </div>
        </div>

        {/* Notification Rules */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">📋 Notification Rules</div>
          <div style={{ padding: '0 16px 16px' }}>
            <NotificationRulesSection />
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
            <div className="ios-list-row" style={{ cursor: 'pointer' }} onClick={() => window.location.hash = '#/ota'}>
              <div className="ios-list-icon" style={{ background: 'rgba(255,154,60,0.15)' }}>🔄</div>
              <div className="ios-list-content">
                <div className="ios-list-title">Firmware & Updates</div>
                <div className="ios-list-subtitle">Check for server & device firmware updates</div>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>›</span>
            </div>
          </div>
        </div>

        {/* Long-Lived Tokens */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">🔑 Long-Lived Tokens</div>
          <LongLivedTokensSection />
        </div>

        {/* Dashboard Editor */}
        <div className="section" style={{ marginTop: 24 }}>
          <DashboardEditorSection />
        </div>

        {/* Quick Links */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-title">Quick Links</div>
          <div className="ios-list">
            <div className="ios-list-row" style={{ cursor: 'pointer' }} onClick={() => window.open('/panel', '_blank')}>
              <div className="ios-list-icon" style={{ background: 'rgba(10,132,255,0.15)' }}>🎛️</div>
              <div className="ios-list-content">
                <div className="ios-list-title">Open User Panel</div>
                <div className="ios-list-subtitle">Full-screen panel for end users</div>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>↗</span>
            </div>
          </div>
          <PanelQrSection />
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
