import { HaState, useHa } from '../../context/HaContext'

interface Props { state: HaState }

const SWITCH_ICONS: Record<string, string> = {
  'switch.fan': '💨',
  'switch.tv':  '📺',
}

export default function SwitchCard({ state }: Props) {
  const { callService } = useHa()
  const on = state.state === 'on'
  const name = (state.attributes.friendly_name as string) ?? state.entity_id
  const icon = SWITCH_ICONS[state.entity_id] ?? '🔌'

  const toggle = () => callService('switch', on ? 'turn_off' : 'turn_on', {}, state.entity_id)

  return (
    <div className={`entity-card ${on ? 'on' : ''}`} onClick={toggle}>
      <div className="card-top">
        <span className={`card-icon ${!on ? 'dim' : ''}`}>{icon}</span>
        <label className="ios-toggle" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={on} onChange={toggle} />
          <span className="ios-slider" />
        </label>
      </div>
      <div>
        <div className="card-name">{name}</div>
        <div className={`card-state ${on ? 'on' : ''}`}>{on ? 'On' : 'Off'}</div>
      </div>
    </div>
  )
}
