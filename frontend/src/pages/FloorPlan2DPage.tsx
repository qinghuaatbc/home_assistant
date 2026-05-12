import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useHa } from '../context/HaContext'
import { useToast } from '../context/ToastContext'
import { HaState } from '../types'
import {
  playLightToggle, playDoorToggle, playGarageToggle,
  playCurtainToggle, playMediaToggle, playSwitchToggle,
  playDing, speakState, Lang, setLang, startMusic, stopMusic,
} from '../utils/sounds'

const HARDCODED = 'f033260c0a8940ade499be72fd22be3955db72a2bee845214e64575ca73000af'

const BEHAVIOR_META: Record<string, { icon: string; label: string; color: string }> = {
  light:          { icon: '💡', label: 'Lights',          color: '#ffd60a' },
  switch:         { icon: '🔌', label: 'Switches',         color: '#5ac8fa' },
  media_player:   { icon: '🎵', label: 'Media Players',    color: '#bf5af2' },
  door_hinge:     { icon: '🚪', label: 'Doors (Hinge)',    color: '#30d158' },
  door_sliding:   { icon: '🚪', label: 'Doors (Slide)',    color: '#30d158' },
  window_hinge:   { icon: '🪟', label: 'Windows (Hinge)',  color: '#5ac8fa' },
  window_sliding: { icon: '🪟', label: 'Windows (Slide)',  color: '#5ac8fa' },
  curtain:        { icon: '🪟', label: 'Curtains / Blinds', color: '#ff9f0a' },
  garage_door:    { icon: '🚗', label: 'Garage Doors',     color: '#ff9f0a' },
  sensor:         { icon: '📊', label: 'Sensors',          color: '#ff9f0a' },
  camera:         { icon: '📷', label: 'Cameras',          color: '#888' },
  weather:        { icon: '🌤', label: 'Weather',          color: '#5ac8fa' },
  alarm:          { icon: '🔒', label: 'Alarm',            color: '#ff453a' },
  other:          { icon: '🔧', label: 'Other',            color: '#888' },
}

const BEHAVIOR_ORDER = ['light', 'switch', 'media_player', 'door_hinge', 'door_sliding', 'window_hinge', 'window_sliding', 'curtain', 'garage_door', 'sensor', 'camera', 'weather', 'alarm', 'other']

function getBehavior(eid: string, dc?: string): string {
  if (eid.startsWith('light.')) return 'light'
  if (eid.startsWith('media_player.')) return 'media_player'
  if (eid.startsWith('switch.')) return 'switch'
  if (eid.startsWith('camera.')) return 'camera'
  if (eid.startsWith('weather.')) return 'weather'
  if (eid.startsWith('alarm_control_panel.')) return 'alarm'
  if (eid.startsWith('sensor.')) return 'sensor'
  if (eid.startsWith('binary_sensor.')) {
    if (dc === 'garage_door') return 'garage_door'
    if (dc === 'curtain' || dc === 'blind') return 'curtain'
    if (dc === 'door') return 'door_hinge'
    if (dc === 'window') return 'window_hinge'
    return 'door_hinge'
  }
  return 'other'
}

const BehaviorIcons: Record<string, string> = {
  light: '💡',
  switch: '🔌',
  media_player: '🎵',
  door_hinge: '🚪',
  door_sliding: '🚪',
  window_hinge: '🪟',
  window_sliding: '🪟',
  curtain: '🪟',
  garage_door: '🚗',
  sensor: '📊',
  camera: '📷',
  weather: '🌤',
  alarm: '🔒',
  other: '🔧',
}

interface GroupedDevice {
  entityId: string
  name: string
  floor: number
  behavior: string
  isMapped: boolean
}

interface Props {
  fullscreen?: boolean
  onFullscreenChange?: (v: boolean) => void
  standaloneToken?: string | null
}

export default function FloorPlan2DPage({ fullscreen, onFullscreenChange, standaloneToken }: Props = {}) {
  const { token: ctxToken, states } = useHa()
  const { toast } = useToast()
  const token = standaloneToken || ctxToken || HARDCODED

  const [floorNames, setFloorNames] = useState<Record<string, string>>({})
  const [floor, setFloor] = useState<number | null>(null)
  const [showAllFloors, setShowAllFloors] = useState(true)
  const [soundMode, setSoundMode] = useState(0)
  const [langIdx, setLangIdx] = useState(0)
  const [localRev, setLocalRev] = useState(0)
  const statesRef = useRef(states)
  const LANG_LIST: Lang[] = ['en', 'zh', 'fa']

  const filterParam = new URLSearchParams(window.location.search).get('filter') || ''
  const activeBehaviors = filterParam ? new Set(filterParam.split(',')) : null

  useEffect(() => { statesRef.current = states }, [states])
  useEffect(() => () => { document.body.style.overflow = '' }, [])

  const getState = useCallback((eid: string) => statesRef.current.get(eid) || states.get(eid), [states])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const load = () => fetch('/api/config/floors', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((list: any[]) => {
        if (cancelled) return
        const m: Record<string, string> = {}
        list.forEach((f: any) => { m[f.id] = f.name })
        setFloorNames(m)
        const keys = Object.keys(m)
        if (keys.length > 0 && floor === null) setFloor(Number(keys[0]))
      }).catch(() => {})
    load()
    const iv = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [token, floor])

  const [mappings, setMappings] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const load = () => fetch('/api/config/3d-mappings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((d: any) => {
        if (cancelled) return
        const keys = Object.keys(d).filter(k => k !== 'mappings')
        if (keys.length > 0) {
          const m: Record<string, string> = {}
          for (const [mesh, val] of Object.entries(d)) {
            if (typeof val === 'string') m[mesh] = val
            else m[mesh] = (val as any).entity
          }
          setMappings(m)
        }
      }).catch(() => {})
    load()
    const iv = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [token])

  const allDevices: GroupedDevice[] = useMemo(() => {
    const entityToMesh = new Map<string, string>()
    for (const [, eid] of Object.entries(mappings)) {
      entityToMesh.set(eid, '')
    }

    const result: GroupedDevice[] = []
    states.forEach((st, eid) => {
      const domain = eid.split('.')[0]
      if (domain === 'automation' || domain === 'group') return
      const a = st.attributes
      const isMapped = entityToMesh.has(eid)
      const dc = a.device_class as string | undefined
      const beh = getBehavior(eid, dc)
      if (activeBehaviors && !activeBehaviors.has(beh)) return
      const hasExplicitFloor = a.glb_floor !== undefined && a.glb_floor !== null
      result.push({
        entityId: eid,
        name: (a.friendly_name as string) ?? eid,
        floor: hasExplicitFloor ? (a.glb_floor as number) : -1,
        isMapped,
        behavior: beh,
      })
    })
    return result.sort((a, b) => a.entityId.localeCompare(b.entityId))
  }, [states, mappings, activeBehaviors])

  const floorsList = useMemo(() => {
    const ids = new Set<number>()
    allDevices.forEach(d => { if (d.floor > 0) ids.add(d.floor) })
    return [...ids].sort((a, b) => a - b)
  }, [allDevices])

  const hasMappedDevices = useMemo(() => allDevices.some(d => d.isMapped || d.floor > 0), [allDevices])

  const currentFloorDeviceIds = useMemo(() => {
    if (floor === null) return new Set<string>()
    if (showAllFloors) return new Set(allDevices.map(d => d.entityId))
    if (floor === 0) return new Set(allDevices.filter(d => d.isMapped || (d.floor > 0)).map(d => d.entityId))
    return new Set(allDevices.filter(d => d.floor === floor).map(d => d.entityId))
  }, [allDevices, floor, showAllFloors])

  const grouped = useMemo(() => {
    let onFloor: GroupedDevice[]
    if (showAllFloors) {
      onFloor = allDevices
    } else if (floor === 0) {
      onFloor = allDevices.filter(d => d.isMapped || d.floor > 0)
    } else {
      onFloor = floor !== null ? allDevices.filter(d => d.floor === floor) : []
    }
    const m = new Map<string, GroupedDevice[]>()
    for (const d of onFloor) {
      if (!m.has(d.behavior)) m.set(d.behavior, [])
      m.get(d.behavior)!.push(d)
    }
    return m
  }, [allDevices, floor, showAllFloors])

  const haSetState = useCallback(async (eid: string, state: string, attrs?: Record<string, unknown>) => {
    const cur = getState(eid)
    try {
      const r = await fetch(`/api/states/${eid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ state, attributes: { ...cur?.attributes, ...attrs } }),
      })
      if (!r.ok) toast('Failed to set state', 'error')
    } catch { toast('Network error', 'error') }
  }, [getState, toast])

  const playBehaviorSound = useCallback((eid: string, on: boolean) => {
    if (eid.startsWith('media_player.')) {
      if (on) startMusic(); else stopMusic()
    }
    if (soundMode === 0) return
    const name = statesRef.current.get(eid)?.attributes?.friendly_name as string || eid
    const stateLabel = eid.startsWith('binary_sensor.') ? (on ? 'open' : 'closed') : (on ? 'on' : 'off')
    if (soundMode === 1) {
      playDing()
    } else {
      if (eid.startsWith('light.')) playLightToggle(on)
      else if (eid.startsWith('media_player.')) playMediaToggle(on)
      else if (eid.startsWith('switch.')) playSwitchToggle(on)
      else if (eid.startsWith('binary_sensor.')) {
        const dc = statesRef.current.get(eid)?.attributes?.device_class as string
        if (dc === 'garage_door') playGarageToggle(on)
        else if (dc === 'curtain' || dc === 'blind') playCurtainToggle(on)
        else playDoorToggle(on)
      } else playSwitchToggle(on)
      speakState(name, stateLabel)
    }
  }, [soundMode])

  const toggleDevice = useCallback((eid: string) => {
    const st = getState(eid)
    if (!st) return
    const newState = st.state === 'on' ? 'off' : 'on'
    statesRef.current = new Map(statesRef.current).set(eid, { ...st, state: newState })
    setLocalRev(n => n + 1)
    playBehaviorSound(eid, newState === 'on')
    haSetState(eid, newState)
  }, [getState, haSetState, playBehaviorSound])

  const onBrightness = useCallback((eid: string, pct: number) => {
    haSetState(eid, 'on', { brightness: Math.round(pct / 100 * 255) })
  }, [haSetState])

  const renderCard = useCallback((d: GroupedDevice) => {
    const st = getState(d.entityId)
    if (!st) return null
    const on = st.state === 'on'
    const meta = BEHAVIOR_META[d.behavior] ?? { icon: '🔧', label: 'Other', color: '#888' }
    const brightness = st.attributes?.brightness as number | undefined
    const brightPct = brightness != null ? Math.round((brightness / 255) * 100) : undefined
    const dc = st.attributes?.device_class as string | undefined
    const volumeLevel = st.attributes?.volume_level as number | undefined
    const volPct = volumeLevel != null ? Math.round(volumeLevel * 100) : undefined
    const domain = d.entityId.split('.')[0]

    const sensorStateLabel = () => {
      if (domain !== 'binary_sensor') return ''
      const isOn = st.state === 'on'
      if (dc === 'garage_door') return isOn ? 'Open' : 'Closed'
      if (dc === 'door' || dc === 'window') return isOn ? 'Open' : 'Closed'
      if (dc === 'curtain' || dc === 'blind') return isOn ? 'Open' : 'Closed'
      if (dc === 'motion') return isOn ? 'Detected' : 'Clear'
      if (dc === 'smoke') return isOn ? 'Smoke!' : 'Clear'
      if (dc === 'moisture') return isOn ? 'Wet' : 'Dry'
      if (dc === 'occupancy') return isOn ? 'Occupied' : 'Clear'
      if (dc === 'presence') return isOn ? 'Home' : 'Away'
      return isOn ? 'Open' : 'Closed'
    }

    const stateDisplay = d.behavior === 'light'
      ? (on ? (brightPct != null ? `${brightPct}%` : 'On') : 'Off')
      : d.behavior === 'media_player'
        ? (on ? `On${volPct != null ? ` · ${volPct}%` : ''}` : st.state === 'unavailable' ? 'Unavailable' : 'Off')
        : d.behavior === 'camera'
          ? (st.state === 'streaming' ? '● Live' : 'Idle')
          : d.behavior === 'weather'
            ? `${st.state} · ${st.attributes?.temperature ?? ''}${st.attributes?.temperature_unit ?? ''}`
            : d.behavior === 'sensor'
              ? `${st.state}${st.attributes?.unit_of_measurement ?? ''}`
              : d.behavior.startsWith('door_') || d.behavior.startsWith('window_') || d.behavior === 'curtain' || d.behavior === 'garage_door'
                ? sensorStateLabel()
                : (on ? 'On' : 'Off')

    const accentColor = meta.color
    const cardBg = on ? { background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}11)` } : {}

    return (
      <div key={d.entityId}
        className={`entity-card ${on ? 'on' : ''}`}
        onClick={() => toggleDevice(d.entityId)}
        style={{
          ...cardBg,
          borderLeft: on ? `3px solid ${accentColor}` : '3px solid transparent',
          position: 'relative',
          overflow: 'hidden',
        }}>
        {on && (
          <div style={{
            position: 'absolute', top: -20, right: -20, width: 60, height: 60,
            borderRadius: '50%',
            background: `${accentColor}15`,
          }} />
        )}
        <div className="card-top">
          <span className={`card-icon ${!on ? 'dim' : ''}`}
            style={{ fontSize: 26 }}>{BehaviorIcons[d.behavior] ?? '🔧'}</span>
          <label className="ios-toggle" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={on} onChange={() => toggleDevice(d.entityId)} />
            <span className="ios-slider" />
          </label>
        </div>
        <div>
          <div className="card-name" style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
          <div className={`card-state ${on ? 'on' : ''}`}
            style={on ? { color: accentColor, fontWeight: 600 } : undefined}>
            {stateDisplay}
          </div>
        </div>
        {d.behavior === 'light' && (
          <div className="brightness-row" onClick={(e) => e.stopPropagation()}
            style={{ marginTop: 6 }}>
            <span style={{ fontSize: 11, opacity: 0.5 }}>☀</span>
            <input type="range" className="ios-range" min={1} max={100}
              value={brightPct ?? 100}
              onChange={(e) => {
                const v = Number(e.target.value)
                onBrightness(d.entityId, v)
                if (!on) toggleDevice(d.entityId)
              }} />
          </div>
        )}
        {d.behavior === 'media_player' && (
          <div className="brightness-row" onClick={(e) => e.stopPropagation()}
            style={{ marginTop: 6 }}>
            <span style={{ fontSize: 11, opacity: 0.5 }}>🔊</span>
            <input type="range" className="ios-range" min={0} max={100}
              value={volPct ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value)
                haSetState(d.entityId, on ? 'on' : 'on', { volume_level: v / 100 })
                if (!on) toggleDevice(d.entityId)
              }} />
          </div>
        )}
        {(d.behavior.startsWith('door_') || d.behavior.startsWith('window_') || d.behavior === 'curtain' || d.behavior === 'garage_door') && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginTop: 6, padding: '2px 8px', borderRadius: 4,
            fontSize: 10, fontWeight: 600,
            background: on ? `${accentColor}22` : `${accentColor}11`,
            color: on ? accentColor : 'var(--text2)',
            alignSelf: 'flex-start',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: on ? accentColor : 'var(--text3)',
              display: 'inline-block',
            }} />
            {sensorStateLabel()}
          </div>
        )}
      </div>
    )
  }, [getState, toggleDevice, onBrightness, haSetState])

  const orderedBehaviors = useMemo(() => {
    return [...BEHAVIOR_ORDER.filter(b => grouped.has(b)), ...[...grouped.keys()].filter(b => !BEHAVIOR_ORDER.includes(b))]
  }, [grouped])

  if (fullscreen) document.body.style.overflow = 'hidden'
  else document.body.style.overflow = ''

  return (
    <div className="page" style={fullscreen ? { bottom: 0 } : undefined}>
      <div className="page-inner"
        style={fullscreen ? { padding: '0 16px 2rem', minHeight: '100%' } : undefined}>
        {!fullscreen && (
          <div className="nav-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="nav-title">🏠 2D Floor Plan</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <button className="btn" style={{ fontSize: 14, padding: '4px 10px' }}
                  onClick={() => onFullscreenChange?.(true)}>⛶</button>
                <button className="btn" style={{ fontSize: 14, padding: '4px 10px' }}
                  onClick={() => setSoundMode((soundMode + 1) % 3)}>
                  {soundMode === 0 ? '🔇' : soundMode === 1 ? '🔔' : '🗣'}
                </button>
                {soundMode === 2 && (
                  <button className="btn" style={{ fontSize: 11, padding: '4px 6px' }}
                    onClick={() => { const n = (langIdx + 1) % 3; setLangIdx(n); setLang(LANG_LIST[n]) }}>
                    {LANG_LIST[langIdx] === 'en' ? 'EN' : LANG_LIST[langIdx] === 'zh' ? '中文' : 'فارسی'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Floor selector (pill buttons, same as 3D) ── */}
        {allDevices.length > 0 && (
          <div style={{
            position: 'sticky', top: fullscreen ? 0 : 60, zIndex: 10,
            background: fullscreen ? '#111113' : 'var(--bg)',
            padding: '8px 0', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center',
          }}>
            <button
              className="fp-floor-btn"
              style={{
                background: showAllFloors ? 'var(--blue)' : 'var(--surface)',
                color: showAllFloors ? '#fff' : 'var(--text)',
              }}
              onClick={() => { setShowAllFloors(true); setFloor(null) }}>
              📋 All
            </button>
            {hasMappedDevices && (
              <button
                className="fp-floor-btn"
                style={{
                  background: !showAllFloors && floor === 0 ? 'var(--blue)' : 'var(--surface)',
                  color: !showAllFloors && floor === 0 ? '#fff' : 'var(--text)',
                }}
                onClick={() => { setShowAllFloors(false); setFloor(0) }}>
                📦 Bound
              </button>
            )}
            {floorsList.map(id => (
              <button key={id}
                className="fp-floor-btn"
                style={{
                  background: !showAllFloors && floor === id ? 'var(--blue)' : 'var(--surface)',
                  color: !showAllFloors && floor === id ? '#fff' : 'var(--text)',
                }}
                onClick={() => { setShowAllFloors(false); setFloor(id) }}>
                {floorNames[String(id)] ?? `Floor ${id}`}
              </button>
            ))}
          </div>
        )}

        {allDevices.length === 0 && (
          <div style={{
            textAlign: 'center', color: 'var(--text2)', padding: '4rem 2rem', fontSize: 14,
            lineHeight: 1.6,
          }}>
            No GLB-bound devices found.<br />
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              Use 3D Floor Plan → Edit mode to bind devices to this floor.
            </span>
          </div>
        )}

        {allDevices.length > 0 && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 4px', marginBottom: 2,
            }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>
                {showAllFloors
                  ? 'All Devices'
                  : floor === 0
                    ? 'Bound Devices'
                    : floorNames[String(floor!)] ?? `Floor ${floor}`
                }
              </span>
              <span style={{
                fontSize: 11, color: 'var(--text2)',
                background: 'var(--surface)', padding: '2px 8px', borderRadius: 10,
              }}>
                {currentFloorDeviceIds.size}
              </span>
            </div>

            {orderedBehaviors.map(beh => {
              const devices = grouped.get(beh)
              if (!devices || devices.length === 0) return null
              const meta = BEHAVIOR_META[beh] ?? { icon: '🔧', label: 'Other', color: '#888' }
              return (
                <div className="section" key={beh} style={{ marginTop: 8 }}>
                  <div className="section-title" style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    marginBottom: 8,
                  }}>
                    <span style={{ color: meta.color }}>{meta.icon}</span>
                    <span>{meta.label}</span>
                    <span style={{
                      fontSize: 10, color: 'var(--text3)', fontWeight: 400,
                      marginLeft: 2,
                    }}>({devices.length})</span>
                  </div>
                  <div className="card-grid">
                    {devices.map(d => renderCard(d))}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ── Floor indicator (bottom pill, same as 3D) ── */}
      {!fullscreen && allDevices.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 'calc(var(--tab-h) + 8px)', left: '50%',
          transform: 'translateX(-50%)', zIndex: 10,
          background: 'var(--surface)', borderRadius: 20,
          padding: '4px 16px', fontSize: 12, color: 'var(--text2)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--green)', display: 'inline-block',
          }} />
          {showAllFloors
            ? `All · ${allDevices.length}`
            : floor === 0
              ? `Bound · ${currentFloorDeviceIds.size}`
              : `${floorNames[String(floor!)] ?? `Floor ${floor}`} · ${currentFloorDeviceIds.size}`
          }
        </div>
      )}
    </div>
  )
}
