import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import { useHa } from '../context/HaContext'
import { useToast } from '../context/ToastContext'
import { HaState, Mappings, MappingEntry, BehaviorMap, FloorId } from '../types'
import { guessBehavior, BEHAVIORS, BrightnessSlider, DevicePicker } from '../components/DevicePicker'
import EditPanel from '../components/EditPanel'
import { playLightToggle, playDoorToggle, playGarageToggle, playCurtainToggle, playMediaToggle, playSwitchToggle, playDing, speakState, Lang, setLang, startMusic, stopMusic } from '../utils/sounds'
import { useThreeScene } from '../hooks/useThreeScene'
import { useSceneClick } from '../hooks/useSceneClick'
import { useSceneContent } from '../hooks/useSceneContent'



export default function FloorPlanPage({ fullscreen, onFullscreenChange, standaloneToken }: { fullscreen?: boolean; onFullscreenChange?: (v: boolean) => void; standaloneToken?: string | null }) {
  const { token: ctxToken, states, callService } = useHa()
  const { toast } = useToast()
  const HARDCODED = 'bd811f7d72f5e7010b1712cf6e4c44dd891ca20ee452e0c6cf8eec2b2ee596af'
  const token = standaloneToken || ctxToken || HARDCODED
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef     = useRef<THREE.Scene | null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef  = useRef<any>(null) // OrbitControls
  const statesRef    = useRef(states)

  const migratedRef = useRef(false)

  const [floor, setFloor]           = useState<FloorId>(1)
  const [glbLoading, setGlbLoading] = useState(false)
  const [glbLoaded,  setGlbLoaded]  = useState(false)
  const [glbError,   setGlbError]   = useState(false)
  const [floorNames, setFloorNames] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [meshNames, setMeshNames] = useState<string[]>([])
  const [mappings, setMappings] = useState<Mappings>({})
  const [behaviors, setBehaviors] = useState<BehaviorMap>({})
  const [mappingDirty, setMappingDirty] = useState(false)
  const [clickedMesh, setClickedMesh] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null)
  const [localRev, setLocalRev] = useState(0) // increment to trigger re-render after local toggle
  const [soundMode, setSoundMode] = useState(0)
  const [camLocked, setCamLocked] = useState(false)
  const [langIdx, setLangIdx] = useState(0)
  const LANG_LIST: Lang[] = ['en', 'zh', 'fa']
  const filterParam = new URLSearchParams(window.location.search).get('filter') || ''
  const activeBehaviors = filterParam ? new Set(filterParam.split(',')) : null
  const getState = (eid: string) => statesRef.current.get(eid) || states.get(eid)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    let iv: ReturnType<typeof setInterval> | null = null
    const load = () => {
      if (cancelled || document.hidden) return
      fetch('/api/config/floors', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then((list: any[]) => {
          if (cancelled) return
          const m: Record<string, string> = {}
          list.forEach(f => { m[f.id] = f.name })
          setFloorNames(m)
        }).catch(() => {})
    }
    const start = () => { load(); iv = setInterval(load, 30000) }
    const stop = () => { if (iv !== null) { clearInterval(iv); iv = null } }
    const onVisibility = () => document.hidden ? stop() : start()
    document.addEventListener('visibilitychange', onVisibility)
    start()
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [token])

  const saveMappings = async (m: Mappings, b: BehaviorMap) => {
    if (!token) return
    const body = buildMappingsPayload(m, b)
    try {
      const r = await fetch('/api/config/3d-mappings', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: body }) })
      if (!r.ok) toast('Save failed', 'error')
    } catch { toast('Network error saving mappings', 'error') }
  }

  function buildMappingsPayload(m: Mappings, b: BehaviorMap): Record<string, MappingEntry> {
    const out: Record<string, MappingEntry> = {}
    for (const [mesh, val] of Object.entries(m)) {
      const eid = typeof val === 'string' ? val : val.entity
      const dc = states.get(eid)?.attributes?.device_class as string | undefined
      out[mesh] = { entity: eid, behavior: b[mesh] || guessBehavior(eid, dc) }
    }
    return out
  }

  // ── Derive layout from state attributes + saved mappings ─────────────────
    const { glbLights, sphereLights, sensorMarkers, sensorGlbMeshes, mediaGlbMeshes } = useMemo(() => {
    const glb:    Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string }> = []
    const sph:    Array<{ entityId: string; name: string; floor: 1|2|3; x: number; z: number }> = []
    const sen:    Array<{ entityId: string; name: string; floor: 1|2|3; x: number; z: number; deviceClass: string }> = []
    const senGlb: Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string; deviceClass: string; pos?: [number, number] }> = []
    const med:    Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string }> = []

    const entityToMesh = new Map<string, string>()
    for (const [mesh, val] of Object.entries(mappings)) {
      const eid = typeof val === 'string' ? val : val.entity
      entityToMesh.set(eid, mesh)
    }

    states.forEach((st: HaState, entityId: string) => {
      const a = st.attributes
      const name = (a.friendly_name as string) ?? entityId
      const meshName = (a.glb_mesh as string) || entityToMesh.get(entityId)
      const f = (a.glb_floor as number) || (meshName ? 1 : undefined)
      if (!f) return

      if (entityId.startsWith('light.')) {
        if (meshName)                glb.push({ entityId, name, floor: f as 1|2|3, meshName })
        else if (Array.isArray(a.glb_pos)) sph.push({ entityId, name, floor: f as 1|2|3, x: (a.glb_pos as number[])[0], z: (a.glb_pos as number[])[1] })
      } else if (entityId.startsWith('binary_sensor.')) {
        const dc = (a.device_class as string) ?? 'door'
        if (meshName) {
          const pos = Array.isArray(a.glb_pos) ? [(a.glb_pos as number[])[0], (a.glb_pos as number[])[1]] as [number, number] : undefined
          senGlb.push({ entityId, name, floor: f as 1|2|3, meshName, deviceClass: dc, pos })
        } else if (Array.isArray(a.glb_pos)) sen.push({ entityId, name, floor: f as 1|2|3, x: (a.glb_pos as number[])[0], z: (a.glb_pos as number[])[1], deviceClass: dc })
      } else if (entityId.startsWith('media_player.')) {
        if (meshName) med.push({ entityId, name, floor: f as 1|2|3, meshName })
      }
    })
    return { glbLights: glb, sphereLights: sph, sensorMarkers: sen, sensorGlbMeshes: senGlb, mediaGlbMeshes: med }
  }, [states, mappings])

  useEffect(() => { statesRef.current = states }, [states])

  // ── Init Three.js + scene content ──────────────────────────────────────
  const sceneHandle = useThreeScene(containerRef, (t) => {
    if (onAnimateRef.current) onAnimateRef.current(t)
  })
  useEffect(() => {
    const h = sceneHandle.current; if (!h) return
    sceneRef.current = h.scene; cameraRef.current = h.camera
    rendererRef.current = h.renderer; controlsRef.current = h.controls
  }, [sceneHandle])

  useEffect(() => {
    const c = controlsRef.current; if (!c) return
    c.enabled = !camLocked
  }, [camLocked])

  const { clickables, onAnimate, updateVisuals } = useSceneContent({
    getScene: () => sceneRef.current,
    getCamera: () => cameraRef.current,
    getControls: () => controlsRef.current,
    getRenderer: () => rendererRef.current,
    floor, statesRef, activeBehaviors, getBehavior: (eid) => guessBehavior(eid, statesRef.current.get(eid)?.attributes?.device_class as string | undefined),
    glbLights, sphereLights, sensorMarkers, sensorGlbMeshes, mediaGlbMeshes,
    glbLoading, glbLoaded, glbError,
    onGlbStart: () => { setGlbLoaded(false); setGlbLoading(true); setGlbError(false) },
    onGlbSuccess: () => { setGlbLoading(false); setGlbLoaded(true) },
    onGlbError: () => { setGlbLoading(false); setGlbError(true) },
    onMeshNames: setMeshNames,
  })
  const onAnimateRef = useRef(onAnimate)
  onAnimateRef.current = onAnimate

  useEffect(() => { updateVisuals() }, [localRev, states, updateVisuals])

  // ── Click detection via hook ─────────────────────────────────────────────
  const { onClick } = useSceneClick(
    containerRef,
    () => cameraRef.current,
    () => clickables.current, // from useSceneContent
    (result) => {
      let meshName = result.meshName
      if (!meshName && result.entityId) {
        for (const [m, v] of Object.entries(mappings)) {
          const e = typeof v === 'string' ? v : v.entity
          if (e === result.entityId) { meshName = m; break }
        }
      }
      if (result.entityId && activeBehaviors) {
        const dc = states.get(result.entityId)?.attributes?.device_class as string | undefined
        let beh = ''
        if (result.entityId.startsWith('light.')) beh = 'light'
        else if (result.entityId.startsWith('camera.')) beh = 'camera'
        else if (result.entityId.startsWith('media_player.')) beh = 'media_player'
        else if (result.entityId.startsWith('switch.')) beh = 'switch'
        else if (dc === 'garage_door') beh = 'garage_door'
        else if (dc === 'curtain' || dc === 'blind') beh = 'curtain'
        else if (dc === 'door' || dc === 'window') {
          beh = (meshName ? behaviors[meshName] : undefined) || guessBehavior(result.entityId, dc)
        }
        if (!activeBehaviors.has(beh)) return
      }
      setClickedMesh(null)
      setTimeout(() => {
        if (editMode) {
          setSelectedId(result.entityId || null)
          if (meshName) setClickedMesh(meshName)
          return
        }
        if (result.entityId) {
          setSelectedId(result.entityId)
          const st = statesRef.current.get(result.entityId)
          // Cameras: select only, don't toggle state
          if (result.entityId.startsWith('camera.')) return
          const prevSt = st
          const newState = st?.state === 'on' ? 'off' : 'on'
          statesRef.current = new Map(statesRef.current).set(result.entityId, { ...st!, state: newState })
          setLocalRev(n => n + 1)
          playBehaviorSound(result.entityId, newState === 'on')
          haSetState(result.entityId, newState).then(ok => {
            if (!ok && prevSt) {
              statesRef.current = new Map(statesRef.current).set(result.entityId, prevSt)
              setLocalRev(n => n + 1)
            }
          })
        } else setSelectedId(null)
      }, 0)
    },
  )

  // ── Controls ──────────────────────────────────────────────────────────────
  const selState     = selectedId ? getState(selectedId) : null
  const selOn        = selState?.state === 'on'
  const selName      = selState ? (selState.attributes.friendly_name as string) ?? selectedId : ''
  const selDomain    = selectedId?.split('.')[0] ?? ''
  const selDevClass  = selState?.attributes?.device_class as string | undefined
  const isSensor     = selDomain === 'binary_sensor'
  const haSetState = async (eid: string, state: string, attrs?: Record<string, unknown>): Promise<boolean> => {
    const cur = getState(eid)
    try {
      const r = await fetch(`/api/states/${eid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ state, attributes: { ...cur?.attributes, ...attrs } }),
      })
      if (!r.ok) { toast('Failed to set state', 'error'); return false }
      return true
    } catch { toast('Network error', 'error'); return false }
  }

  const playBehaviorSound = (eid: string, on: boolean) => {
    // Music always plays regardless of sound mode
    if (eid.startsWith('media_player.')) {
      if (on) startMusic(); else stopMusic()
    }
    if (soundMode === 0) return
    const name = states.get(eid)?.attributes?.friendly_name as string || eid
    const stateLabel = eid.startsWith('binary_sensor.') ? (on ? 'open' : 'closed') : (on ? 'on' : 'off')
    if (soundMode === 1) {
      playDing()
    } else {
      if (eid.startsWith('light.')) playLightToggle(on)
      else if (eid.startsWith('media_player.')) playMediaToggle(on)
      else if (eid.startsWith('switch.')) playSwitchToggle(on)
      else if (eid.startsWith('binary_sensor.')) {
        const dc = states.get(eid)?.attributes?.device_class as string
        if (dc === 'garage_door') playGarageToggle(on)
        else if (dc === 'curtain' || dc === 'blind') playCurtainToggle(on)
        else playDoorToggle(on)
      } else playSwitchToggle(on)
      speakState(name, stateLabel)
    }
  }

  const selBrightPct = selState?.attributes?.brightness != null
    ? Math.round(((selState.attributes.brightness as number) / 255) * 100) : 100
  const toggle = () => {
    if (!selectedId) return
    const prevState = statesRef.current.get(selectedId)
    const newState = selOn ? 'off' : 'on'
    statesRef.current = new Map(statesRef.current).set(selectedId, { ...selState!, state: newState })
    setLocalRev(n => n + 1)
    playBehaviorSound(selectedId, newState === 'on')
    haSetState(selectedId, newState).then(ok => {
      if (!ok && prevState) {
        statesRef.current = new Map(statesRef.current).set(selectedId, prevState)
        setLocalRev(n => n + 1)
      }
    })
  }
  const setBright = (pct: number) => {
    if (!selectedId) return
    haSetState(selectedId, 'on', { brightness: Math.round(pct / 100 * 255) })
  }

  const sensorIcon = (dc?: string) =>
    dc === 'door' || dc === 'garage_door' ? '🚪' : dc === 'curtain' || dc === 'blind' ? '🪟' : dc === 'camera' ? '📷' : '🔲'
  const isCamera = selectedId?.startsWith('camera.')
  const sensorLabel = (dc?: string, open?: boolean) => {
    if (dc === 'garage_door') return open ? 'Open' : 'Closed'
    if (dc === 'door')        return open ? 'Open' : 'Closed'
    if (dc === 'curtain')     return open ? 'Open' : 'Closed'
    if (dc === 'blind')       return open ? 'Open' : 'Closed'
    return open ? 'Open' : 'Closed'
  }

  const legendLights = useMemo(() => [
    ...glbLights.filter(l => l.floor === floor).map(l => ({ ...l, isGlb: true,  isSensor: false })),
    ...sphereLights.filter(l => l.floor === floor).map(l => ({ ...l, isGlb: false, isSensor: false })),
    ...sensorGlbMeshes.filter(s => s.floor === floor).map(s => ({ ...s, isGlb: true,  isSensor: true })),
    ...sensorMarkers.filter(s => s.floor === floor).map(s => ({ ...s, isGlb: false, isSensor: true })),
    ...mediaGlbMeshes.filter(l => l.floor === floor).map(l => ({ ...l, isGlb: true,  isSensor: false })),
  ], [glbLights, sphereLights, sensorGlbMeshes, sensorMarkers, mediaGlbMeshes, floor])

  // Load saved mappings (once). Only migrate from YAML if no saved file yet.
  useEffect(() => {
    if (!token || migratedRef.current) return
    migratedRef.current = true
    fetch('/api/config/3d-mappings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((d: any) => {
        const keys = Object.keys(d).filter(k => k !== 'mappings')
        if (keys.length > 0) {
          // Parse old format (string) and new format ({entity, behavior})
          const m: Record<string, string> = {}
          const b: Record<string, string> = {}
          for (const [mesh, val] of Object.entries(d)) {
            if (typeof val === 'string') { m[mesh] = val; b[mesh] = guessBehavior(val, states.get(val)?.attributes?.device_class as string | undefined) }
            else { const v = val as any; b[mesh] = v.behavior || guessBehavior(v.entity, states.get(v.entity)?.attributes?.device_class as string | undefined); m[mesh] = v.entity }
          }
          setMappings(m); setBehaviors(b)
          return
        }
        const merged: Record<string, string> = {}
        const beh: Record<string, string> = {}
        let added = false
        states.forEach((st, eid) => {
          const mesh = st.attributes?.glb_mesh as string | undefined
          if (mesh) { merged[mesh] = eid; beh[mesh] = guessBehavior(eid, st.attributes?.device_class as string | undefined); added = true }
        })
        setMappings(merged); setBehaviors(beh)
        if (added) saveMappings(merged, beh)
      }).catch(() => {})
  }, [token, states])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') { setSelectedId(null) }
      if (e.key === 'e' || e.key === 'E') { if (!fullscreen) setEditMode(!editMode) }
      if (e.key === '1') setFloor(1)
      if (e.key === '2') setFloor(2)
      if (e.key === '3') setFloor(3)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode, fullscreen])

  // ── Binding history (undo) ──────────────────────────────────────────────
  const [hist, setHist] = useState<Array<{ m: Mappings; b: BehaviorMap }>>([])
  const [histIdx, setHistIdx] = useState(-1)
  const pushHist = useCallback((m: Mappings, b: BehaviorMap) => {
    setHist(prev => { const next = prev.slice(0, histIdx + 1); next.push({ m: JSON.parse(JSON.stringify(m)), b: JSON.parse(JSON.stringify(b)) }); return next.slice(-20) })
    setHistIdx(prev => Math.min(prev + 1, 19))
  }, [histIdx])
  const undoHist = useCallback(() => {
    if (histIdx < 0 || !hist[histIdx]) return
    setMappings(hist[histIdx].m); setBehaviors(hist[histIdx].b)
    setHistIdx(prev => prev - 1)
  }, [hist, histIdx])
  // Override save/pick/delete to push history first
  const saveWithHist = (m: Mappings, b: BehaviorMap) => { pushHist(mappings, behaviors); saveMappings(m, b) }
  const editPanelOnPick = (mesh: string, eid: string, next: Mappings, beh: BehaviorMap) => { pushHist(mappings, behaviors); setMappings(next); setBehaviors(beh); saveMappings(next, beh) }
  const editPanelOnDelete = (next: Mappings, beh: BehaviorMap) => { pushHist(mappings, behaviors); setMappings(next); setBehaviors(beh); saveMappings(next, beh) }

  // Reset body overflow on unmount
  useEffect(() => () => { document.body.style.overflow = '' }, [])

  // ── Canvas is always rendered (ref stays stable) ──

  const panel = selectedId ? (
    <div className="fp-panel"
      onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
      <div className="fp-panel-row">
        <span className="fp-panel-icon">{isSensor ? sensorIcon(selDevClass) : '💡'}</span>
        <div className="fp-panel-info">
          <div className="fp-panel-name">{selName}</div>
          <div className={`fp-panel-state${selOn ? ' on' : ''}`}>
            {isSensor ? sensorLabel(selDevClass, selOn) : (selOn ? 'On' : 'Off')}
          </div>
        </div>
        {isCamera ? (
          <a href={`/dashboard?camera=${selectedId}`} className="btn" style={{ fontSize: 11, padding: '4px 8px', textDecoration: 'none' }}>📷 View</a>
        ) : (
          <label className="ios-toggle" onClick={e => e.stopPropagation()}>
            <input type="checkbox" checked={selOn ?? false} onChange={toggle} />
            <span className="ios-slider" />
          </label>
        )}
        <button className="fp-close" onClick={() => setSelectedId(null)}>✕</button>
      </div>
      {selDomain === 'light' && <BrightnessSlider value={selBrightPct} onChange={setBright} />}
    </div>
  ) : null

  if (fullscreen) document.body.style.overflow = 'hidden'
  else document.body.style.overflow = ''

  return (
    <div className={`fp-page${fullscreen ? ' fp-fullscreen' : ''}`}>
      {!fullscreen && (
        <div className="fp-header">
          <span className="fp-title">3D Floor Plan</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn" style={{ fontSize: 10, padding: '3px 8px' }}
              onClick={() => onFullscreenChange?.(true)}>⛶</button>
            <button className={`btn${editMode ? ' active' : ''}`} style={{ fontSize: 10, padding: '3px 8px' }}
              onClick={() => setEditMode(!editMode)}>
              {editMode ? '✕ Done' : '✎ Edit'}
            </button>
          </div>
        </div>
      )}



      {editMode && glbLoaded && !fullscreen && (
        <>
          <EditPanel
            token={token}
            meshNames={meshNames}
            mappings={mappings}
            behaviors={behaviors}
            states={states}
            clickedMesh={clickedMesh}
            onSetMappings={setMappings}
            onSetBehaviors={setBehaviors}
            onSetClickedMesh={(n) => { setClickedMesh(n); setSelectedId(null) }}
            onPick={editPanelOnPick}
            onDelete={editPanelOnDelete}
            onSaveMappings={() => { if (token) { saveWithHist(mappings, behaviors); toast('Saved', 'success') } }}
          />
          <div style={{ position: 'absolute', left: 12, top: 56, zIndex: 25 }}>
            <button className="btn" style={{ fontSize: 10, padding: '2px 6px', opacity: histIdx >= 0 ? 1 : 0.3 }}
              disabled={histIdx < 0} onClick={undoHist}>
              ↩️
            </button>
          </div>
        </>
      )}

      <div className="fp-canvas" ref={containerRef} onClick={onClick} />
      <div style={{ position: 'absolute', bottom: fullscreen ? 80 : 'calc(80px + var(--safe-bottom))', left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', gap: 6 }}>
        {['1', '2', '3', '4', '5'].map(id => (
          <button key={id} className={`fp-floor-btn${String(floor) === id ? ' active' : ''}`}
            onClick={() => { setFloor(Number(id) as any); setSelectedId(null) }}
            style={{ display: floorNames[id] ? undefined : 'none' }}>
            {floorNames[id] || id}
          </button>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: fullscreen ? 80 : 'calc(80px + var(--safe-bottom))', right: 16, zIndex: 20, display: 'flex', gap: 6 }}>
        <button className="fp-floor-btn" style={{ fontSize: 14, padding: '4px 10px', opacity: camLocked ? 1 : 0.5 }}
          onClick={() => setCamLocked(!camLocked)}>
          {camLocked ? '🔒' : '🔓'}
        </button>
        <button className="fp-floor-btn" style={{ fontSize: 14, padding: '4px 10px' }}
          onClick={() => setSoundMode((soundMode + 1) % 3)}>
          {soundMode === 0 ? '🔇' : soundMode === 1 ? '🔔' : '🗣'}
        </button>
        {soundMode === 2 && (
          <button className="fp-floor-btn" style={{ fontSize: 11, padding: '4px 6px' }}
            onClick={() => { const n = (langIdx + 1) % 3; setLangIdx(n); setLang(LANG_LIST[n]) }}>
            {LANG_LIST[langIdx] === 'en' ? 'EN' : LANG_LIST[langIdx] === 'zh' ? '中文' : 'فارسی'}
          </button>
        )}
      </div>

      {glbLoading && <div className="fp-glb-badge"><div className="fp-spinner-sm" /> Loading model…</div>}
      {glbError && <div className="fp-glb-badge" style={{ color: '#ff453a', cursor: 'pointer' }} onClick={() => { setGlbError(false); setGlbLoaded(false); setGlbLoading(true); /* re-trigger floor effect */ setFloor(f => f as FloorId) }}>⚠️ Model not found · Tap to retry</div>}
      {glbLoaded && !fullscreen && <div className="fp-glb-badge" style={{ color: 'rgba(48,209,88,0.8)' }}>● 3D model · click fixtures</div>}

      {!fullscreen && (
        <div className="fp-legend">
          {legendLights.map(({ entityId, name, isGlb, isSensor }) => {
            const on = states.get(entityId)?.state === 'on'
            const dc = states.get(entityId)?.attributes?.device_class as string | undefined
            return (
              <button key={entityId}
                className={`fp-legend-item${on ? ' on' : ''}${selectedId === entityId ? ' sel' : ''}${isSensor ? ' sensor' : ''}`}
                onClick={() => { setSelectedId(p => p === entityId ? null : entityId); const st = states.get(entityId); haSetState(entityId, st?.state === 'on' ? 'off' : 'on') }}>
                <span className={`fp-dot${on ? ' on' : ''}${isGlb ? ' glb' : ''}${isSensor ? (on ? ' open' : ' closed') : ''}`} />
                <span className="fp-legend-name">{name}</span>
                {isGlb && !isSensor && <span className="fp-legend-3d">3D</span>}
                {isSensor && <span className={`fp-legend-3d${on ? ' alert' : ''}`}>{on ? sensorLabel(dc, true) : sensorLabel(dc, false)}</span>}
              </button>
            )
          })}
        </div>
      )}

      {panel}
    </div>
  )
}


