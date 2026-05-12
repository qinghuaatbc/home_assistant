import { useState, useRef, useEffect } from 'react'
import { HaState, DeviceItem } from '../types'

export function guessBehavior(entityId: string, deviceClass?: string): string {
  if (entityId.startsWith('light.')) return 'light'
  if (entityId.startsWith('camera.')) return 'camera'
  if (entityId.startsWith('media_player.')) return 'media_player'
  if (entityId.startsWith('switch.')) return 'switch'
  if (entityId.startsWith('binary_sensor.')) {
    if (deviceClass === 'garage_door') return 'garage_door'
    if (deviceClass === 'curtain' || deviceClass === 'blind') return 'curtain'
    if (deviceClass === 'window') return 'window_hinge'
    if (deviceClass === 'door') return 'door_hinge'
    return 'door_hinge'
  }
  return 'light'
}

export interface BehaviorOption {
  id: string
  label: string
  desc: string
}

export const BEHAVIORS: BehaviorOption[] = [
  { id: 'light', label: '💡 Light', desc: 'On/off with brightness' },
  { id: 'camera', label: '📷 Camera', desc: 'View camera stream' },
  { id: 'door_hinge', label: '🚪 Door (Hinge)', desc: 'Hinged open/close' },
  { id: 'door_sliding', label: '🚪 Door (Slide)', desc: 'Sliding open/close' },
  { id: 'window_hinge', label: '🪟 Window (Hinge)', desc: 'Hinged open/close' },
  { id: 'window_sliding', label: '🪟 Window (Slide)', desc: 'Sliding open/close' },
  { id: 'curtain', label: '🪟 Curtain', desc: 'Roll-up/down' },
  { id: 'garage_door', label: '🚗 Garage', desc: 'Roll-up/down' },
  { id: 'media_player', label: '🎵 Music', desc: 'Media playback' },
  { id: 'switch', label: '🔌 Switch', desc: 'On/off toggle' },
]

export function BehaviorSelect({ behavior, onChange }: { behavior: string; onChange: (b: string) => void }) {
  return (
    <select value={behavior} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, marginTop: 4 }}>
      {BEHAVIORS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
    </select>
  )
}

export function BrightnessSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <div className="fp-panel-row" style={{ marginTop: 6, gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text2)', width: 20 }}>☀</span>
      <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onPointerDown={e => e.stopPropagation()} onClick={() => { const n = Math.max(1, v - 10); setV(n); onChange(n) }}>−</button>
      <input type="range" className="ios-range" min={1} max={100} value={v}
        onInput={e => setV(Number((e.target as HTMLInputElement).value))}
        onPointerUp={e => { const n = Number((e.target as HTMLInputElement).value); setV(n); onChange(n) }}
        style={{ flex: 1 }} />
      <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onPointerDown={e => e.stopPropagation()} onClick={() => { const n = Math.min(100, v + 10); setV(n); onChange(n) }}>+</button>
      <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 28, textAlign: 'right' }}>{v}%</span>
    </div>
  )
}

export function DevicePicker({ meshName, states, onPick }: { meshName: string; states: Map<string, HaState>; onPick: (mesh: string, eid: string) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const devices: DeviceItem[] = Array.from(states.entries())
    .map(([id, s]) => ({ id, name: (s.attributes?.friendly_name as string) || id }))
  const btnRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={btnRef} className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => {
        if (!open && btnRef.current) { const r = btnRef.current.getBoundingClientRect(); setPos({ x: r.left, y: r.bottom + 4 }) }
        setOpen(!open)
      }}>+</button>
      {open && (
        <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999, width: 280, background: '#1c1c1e', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', padding: 4, maxHeight: 350, overflowY: 'auto', fontSize: 14 }}>
          {devices.length === 0 && <div style={{ padding: 8, color: '#888', fontSize: 13 }}>No devices</div>}
          {devices.map(d => (
            <div key={d.id} style={{ padding: '8px 12px', fontSize: 14, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '1px solid #333' }}
              onClick={() => { onPick(meshName, d.id); setOpen(false) }}
              onMouseEnter={e => (e.target as HTMLElement).style.background = '#2c2c2e'}
              onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}>
              {d.name}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
