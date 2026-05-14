import { memo } from 'react'
import { HaState } from '../../context/HaContext'
import { useHa } from '../../context/HaContext'

interface Props { state: HaState }

function LightCard({ state }: Props) {
  const { callService } = useHa()
  const on = state.state === 'on'
  const name = (state.attributes.friendly_name as string) ?? state.entity_id
  const brightness = state.attributes.brightness as number | undefined
  const brightPct = brightness != null ? Math.round((brightness / 255) * 100) : undefined

  const toggle = () => callService('light', on ? 'turn_off' : 'turn_on', {}, state.entity_id)

  const onBrightness = (v: number) => {
    callService('light', 'turn_on', { brightness: Math.round((v / 100) * 255) }, state.entity_id)
  }

  return (
    <div className={`entity-card ${on ? 'on' : ''}`} onClick={toggle}>
      <div className="card-top">
        <span className={`card-icon ${!on ? 'dim' : ''}`}>💡</span>
        <label className="ios-toggle" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={on} onChange={toggle} />
          <span className="ios-slider" />
        </label>
      </div>
      <div>
        <div className="card-name">{name}</div>
        <div className={`card-state ${on ? 'on' : ''}`}>
          {on ? (brightPct != null ? `${brightPct}%` : 'On') : 'Off'}
        </div>
      </div>
      {on && brightPct != null && (
        <div className="brightness-row" onClick={(e) => e.stopPropagation()}>
          <span className="brightness-icon">☀</span>
          <input
            type="range"
            className="ios-range"
            min={1} max={100}
            value={brightPct}
            onChange={(e) => onBrightness(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  )
}

export default memo(LightCard)
