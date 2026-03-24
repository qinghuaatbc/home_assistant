import { HaState } from '../../context/HaContext'

interface Props { state: HaState; binary?: boolean }

const SENSOR_ICONS: Record<string, string> = {
  temperature: '🌡️', humidity: '💧', pressure: '🌀',
  motion: '🚶', door: '🚪', window: '🪟', smoke: '💨',
  moisture: '🌊', gas: '⚗️', occupancy: '👤',
}

function sensorIcon(state: HaState): string {
  const dc = (state.attributes.device_class as string) ?? ''
  return SENSOR_ICONS[dc] ?? (state.entity_id.includes('temperature') ? '🌡️' : '📊')
}

function binaryLabel(state: HaState): string {
  const dc = (state.attributes.device_class as string) ?? ''
  const on = state.state === 'on'
  const labels: Record<string, [string, string]> = {
    motion:    ['Detected', 'Clear'],
    door:      ['Open', 'Closed'],
    window:    ['Open', 'Closed'],
    moisture:  ['Wet', 'Dry'],
    smoke:     ['Detected', 'Clear'],
    occupancy: ['Occupied', 'Clear'],
  }
  const pair = labels[dc] ?? ['On', 'Off']
  return on ? pair[0] : pair[1]
}

export default function SensorCard({ state, binary = false }: Props) {
  const name = (state.attributes.friendly_name as string) ?? state.entity_id
  const unit = (state.attributes.unit_of_measurement as string) ?? ''
  const icon = sensorIcon(state)
  const on = state.state === 'on' || state.state === 'open'

  return (
    <div className="entity-card">
      <div className="card-top">
        <span className={`card-icon ${binary && !on ? 'dim' : ''}`}>{icon}</span>
      </div>
      <div>
        <div className="card-name">{name}</div>
        {binary ? (
          <div className={`card-state ${on ? 'on' : ''}`}>{binaryLabel(state)}</div>
        ) : (
          <div className="card-state" style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text)' }}>
            {state.state}<span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text2)', marginLeft: 2 }}>{unit}</span>
          </div>
        )}
      </div>
    </div>
  )
}
