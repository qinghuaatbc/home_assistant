import { memo } from 'react'
import { HaState, useHa } from '../../context/HaContext'

interface Props { state: HaState }

function MediaPlayerCard({ state }: Props) {
  const { callService } = useHa()
  const a = state.attributes
  const on = state.state === 'on'
  const name = (a.friendly_name as string) ?? state.entity_id.split('.')[1].replace(/_/g, ' ')
  const muted = (a.is_volume_muted as boolean) ?? false
  const volPct = a.volume_level != null ? Math.round((a.volume_level as number) * 100) : 0
  const source = (a.source as string) ?? ''
  const sources = (a.source_list as string[]) ?? []

  const svc = (s: string, d?: Record<string, unknown>) =>
    callService('media_player', s, d, state.entity_id)

  return (
    <div className="media-card">
      <div className="media-header">
        <span className="media-name">🎵 {name}</span>
        <span className="media-state" style={{ color: on ? 'var(--purple)' : undefined }}>
          {on ? 'On' : state.state === 'unavailable' ? 'Unavailable' : 'Standby'}
        </span>
      </div>

      <div className="media-controls">
        <button
          className={`media-btn ${on ? 'active' : ''}`}
          onClick={() => svc(on ? 'turn_off' : 'turn_on')}
        >
          ⏻ {on ? 'On' : 'Off'}
        </button>
        <button
          className={`media-btn ${muted ? 'active' : ''}`}
          disabled={!on}
          onClick={() => svc('mute_volume', { is_volume_muted: !muted })}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="media-btn" disabled={!on} onClick={() => svc('volume_down')}>−</button>
        <button className="media-btn" disabled={!on} onClick={() => svc('volume_up')}>+</button>
      </div>

      <div className="media-vol-row">
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>🔉</span>
        <input
          type="range"
          className="ios-range"
          min={0} max={100}
          value={volPct}
          disabled={!on || muted}
          onChange={(e) => svc('volume_set', { volume_level: Number(e.target.value) / 100 })}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 32, textAlign: 'right' }}>
          {on ? `${volPct}%` : '--'}
        </span>
      </div>

      {sources.length > 0 && (
        <select
          className="media-source"
          value={source}
          disabled={!on}
          onChange={(e) => svc('select_source', { source: e.target.value })}
        >
          {sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export default memo(MediaPlayerCard)
