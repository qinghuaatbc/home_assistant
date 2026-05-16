import { useState, useEffect } from 'react'
import { useHa } from '../context/HaContext'

interface Stats {
  cpu: { usedPercent: number; cores: number; model: string }
  memory: { totalMb: number; usedMb: number; usedPercent: number }
  disk: { totalGb: number; usedGb: number; freeGb: number; usedPercent: number } | null
  process: { uptimeSec: number; heapUsedMb: number; rss: number }
  platform: string
  nodeVersion: string
  hostname: string
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  )
}

function uptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function SystemStats({ token }: { token: string }) {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    const load = () => {
      fetch('/api/system/stats', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(setStats)
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [token])

  if (!stats) return null

  const cpuColor = stats.cpu.usedPercent > 80 ? '#ff453a' : stats.cpu.usedPercent > 50 ? '#ff9500' : '#30d158'
  const memColor = stats.memory.usedPercent > 80 ? '#ff453a' : stats.memory.usedPercent > 60 ? '#ff9500' : '#007aff'
  const diskColor = stats.disk && stats.disk.usedPercent > 85 ? '#ff453a' : '#30d158'

  return (
    <div style={{ background: 'var(--card)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, letterSpacing: 0.5 }}>
        SERVER HEALTH · {stats.hostname} · {stats.platform} · Node {stats.nodeVersion}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
        {/* CPU */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text2)' }}>CPU ({stats.cpu.cores}c)</span>
            <span style={{ color: cpuColor, fontWeight: 700 }}>{stats.cpu.usedPercent}%</span>
          </div>
          <Bar pct={stats.cpu.usedPercent} color={cpuColor} />
        </div>

        {/* Memory */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text2)' }}>RAM</span>
            <span style={{ color: memColor, fontWeight: 700 }}>{stats.memory.usedPercent}%</span>
          </div>
          <Bar pct={stats.memory.usedPercent} color={memColor} />
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
            {stats.memory.usedMb}MB / {stats.memory.totalMb}MB
          </div>
        </div>

        {/* Disk */}
        {stats.disk && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text2)' }}>Disk</span>
              <span style={{ color: diskColor, fontWeight: 700 }}>{stats.disk.usedPercent}%</span>
            </div>
            <Bar pct={stats.disk.usedPercent} color={diskColor} />
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
              {stats.disk.usedGb}GB / {stats.disk.totalGb}GB
            </div>
          </div>
        )}

        {/* Uptime */}
        <div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>Uptime</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>
            {uptime(stats.process.uptimeSec)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text2)' }}>Heap {stats.process.heapUsedMb}MB</div>
        </div>
      </div>
    </div>
  )
}
