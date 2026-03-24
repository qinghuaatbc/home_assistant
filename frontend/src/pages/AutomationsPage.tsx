import { useMemo } from 'react'
import { useHa } from '../context/HaContext'

export default function AutomationsPage() {
  const { states, callService } = useHa()

  const automations = useMemo(() =>
    Array.from(states.values())
      .filter((s) => s.entity_id.startsWith('automation.'))
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id)),
    [states]
  )

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">Automations</div>
          <div className="nav-subtitle">{automations.length} automation{automations.length !== 1 ? 's' : ''}</div>
        </div>

        {automations.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem', fontSize: 14 }}>
            No automations configured.
          </div>
        )}

        {automations.length > 0 && (
          <div className="section">
            <div className="ios-list">
              {automations.map((s) => {
                const on = s.state === 'on'
                const name = (s.attributes.friendly_name as string)
                  ?? s.entity_id.replace('automation.', '').replace(/_/g, ' ')
                const lastTriggered = s.attributes.last_triggered as string | undefined

                return (
                  <div className="auto-row" key={s.entity_id}>
                    <div
                      className="auto-icon"
                      style={{ background: on ? 'rgba(10,132,255,0.15)' : 'rgba(255,255,255,0.06)' }}
                    >
                      ⚡
                    </div>
                    <div className="auto-content">
                      <div className="auto-name">{name}</div>
                      <div className="auto-meta">
                        {on ? 'Enabled' : 'Disabled'}
                        {lastTriggered && ` · Last: ${new Date(lastTriggered).toLocaleString()}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        style={{
                          background: 'var(--surface2)',
                          border: 'none',
                          borderRadius: 8,
                          color: 'var(--blue)',
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '5px 10px',
                          cursor: 'pointer',
                        }}
                        onClick={() => callService('automation', 'trigger', {}, s.entity_id)}
                      >
                        Run
                      </button>
                      <label className="ios-toggle">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            callService('automation', on ? 'turn_off' : 'turn_on', {}, s.entity_id)
                          }
                        />
                        <span className="ios-slider" />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
