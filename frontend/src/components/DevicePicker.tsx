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

const DOMAIN_ICON: Record<string, string> = {
  light: '💡', switch: '🔌', binary_sensor: '🔍', sensor: '📊',
  camera: '📷', media_player: '🎵', cover: '🪟', lock: '🔒',
  climate: '🌡️', fan: '💨', scene: '🎬', automation: '⚡',
}

export function DevicePicker({ meshName, states, onPick }: { meshName: string; states: Map<string, HaState>; onPick: (mesh: string, eid: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const devices: DeviceItem[] = Array.from(states.entries())
    .map(([id, s]) => ({ id, name: (s.attributes?.friendly_name as string) || id }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const filtered = q
    ? devices.filter(d => d.id.includes(q.toLowerCase()) || d.name.toLowerCase().includes(q.toLowerCase()))
    : devices

  const openPicker = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const x = Math.min(r.left, window.innerWidth - 290)
      const y = r.bottom + 4 + window.scrollY
      setPos({ x, y })
    }
    setOpen(v => !v)
    setQ('')
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  return (
    <>
      <button ref={btnRef} className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={openPicker}>+</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999, width: 290, background: '#1c1c1e', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #333' }}>
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search entity…"
                style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #444', background: '#2c2c2e', color: '#fff', fontSize: 12, boxSizing: 'border-box' }} />
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {filtered.length === 0 && <div style={{ padding: 12, color: '#888', fontSize: 12, textAlign: 'center' }}>No matches</div>}
              {filtered.map(d => {
                const domain = d.id.split('.')[0]
                const icon = DOMAIN_ICON[domain] || '🔧'
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #222' }}
                    onClick={() => { onPick(meshName, d.id); setOpen(false) }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#2c2c2e'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                      <div style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.id}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </>
  )
}
