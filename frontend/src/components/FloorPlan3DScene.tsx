import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import Hls from 'hls.js'
import { useHa } from '../context/HaContext'
import { useToast } from '../context/ToastContext'
import { HaState, Mappings, MappingEntry, BehaviorMap, FloorId } from '../types'
import { guessBehavior, DevicePicker } from '../components/DevicePicker'
import EditPanel from '../components/EditPanel'
import { playLightToggle, playDoorToggle, playGarageToggle, playCurtainToggle, playMediaToggle, playSwitchToggle, playDing, speakState, speakText, Lang, getLang, setLang, startMusic, stopMusic } from '../utils/sounds'
import { useThreeScene } from '../hooks/useThreeScene'
import { useSceneClick } from '../hooks/useSceneClick'
import { useSceneContent } from '../hooks/useSceneContent'

const FLOOR_TR: Record<string, { zh: string; fa: string }> = {
  'Main Floor': { zh: '主层', fa: 'اصلی' },
  'Up Floor':   { zh: '上层', fa: 'بالا' },
  'Basement':   { zh: '地下室', fa: 'زیرزمین' },
  'Main':       { zh: '主层', fa: 'اصلی' },
  'Upper':      { zh: '上层', fa: 'بالا' },
  'Lower':      { zh: '下层', fa: 'پایین' },
}
function trFloor(name: string, lang: string): string {
  if (lang === 'en') return name
  return (FLOOR_TR[name] as any)?.[lang] ?? name
}

export interface FloorPlan3DSceneProps {
  /** Auth token override (e.g. from URL ?token=). Falls back to context token. */
  tokenOverride?: string | null
  /** Sound mode: 0=mute, 1=ding, 2=voice. Default 1. */
  soundMode?: number
  /**
   * When true the scene fills its container and hides page-level chrome
   * (header, legend, edit panel, badges). Used when embedded inside RtiPanelPage.
   */
  embedded?: boolean
}

const HARDCODED_TOKEN = 'f033260c0a8940ade499be72fd22be3955db72a2bee845214e64575ca73000af'

function VerticalSlider({ value, onChange, onPreview, color }: {
  value: number; onChange: (v: number) => void; onPreview?: (v: number) => void; color: string
}) {
  const [v, setV] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setV(value) }, [value])
  const preview = (n: number) => { setV(n); onPreview?.(n) }
  const commit  = () => onChange(Number(inputRef.current?.value ?? v))
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => { e.stopPropagation(); commit() }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ width: 32, height: 80, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 16, background: 'rgba(255,255,255,0.09)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${v}%`, background: `linear-gradient(to top, ${color}77, ${color})`, borderRadius: 16 }} />
        </div>
        <input
          ref={inputRef}
          type="range" min={1} max={100} value={v}
          onChange={e => preview(Number(e.target.value))}
          style={{
            position: 'absolute',
            width: 80, height: 32,
            top: 24, left: -24,
            transform: 'rotate(-90deg)',
            opacity: 0,
            cursor: 'pointer',
            margin: 0, padding: 0,
          }}
        />
      </div>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{v}%</span>
    </div>
  )
}

export function FloorPlan3DScene({ tokenOverride, soundMode: soundModeProp, embedded = false }: FloorPlan3DSceneProps) {
  const { token: ctxToken, states, callService, patchState } = useHa()
  const { toast } = useToast()
  const token = tokenOverride || ctxToken || HARDCODED_TOKEN
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef     = useRef<THREE.Scene | null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null)
  const camVideoRef  = useRef<HTMLVideoElement>(null)
  const camHlsRef    = useRef<Hls | null>(null)
  const controlsRef  = useRef<any>(null)
  const statesRef    = useRef(states)
  const migratedRef  = useRef(false)

  const [floor, setFloor]           = useState<FloorId>(1)
  const [glbLoading, setGlbLoading] = useState(false)
  const [glbLoaded,  setGlbLoaded]  = useState(false)
  const [glbError,   setGlbError]   = useState(false)
  const [floorNames, setFloorNames] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editMode, setEditMode]     = useState(false)
  const [meshNames, setMeshNames]   = useState<string[]>([])
  const [mappings, setMappings]     = useState<Mappings>({})
  const [behaviors, setBehaviors]   = useState<BehaviorMap>({})
  const [mappingDirty, setMappingDirty] = useState(false)
  const [clickedMesh, setClickedMesh]   = useState<string | null>(null)
  const [saveStatus, setSaveStatus]     = useState<'saved' | 'saving' | 'error' | null>(null)
  const [localRev, setLocalRev]         = useState(0)
  const soundMode = soundModeProp ?? 1
  const [camLocked, setCamLocked]       = useState(false)
  const [cameraViewer, setCameraViewer] = useState<string | null>(null)
  const [camMuted, setCamMuted]         = useState(true)
  const [langIdx, setLangIdx] = useState(() => { const l = getLang(); return l === 'zh' ? 1 : l === 'fa' ? 2 : 0 })
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
      } else if (entityId.startsWith('binary_sensor.') || entityId.startsWith('cover.')) {
        const dc = (a.device_class as string) ?? (entityId.startsWith('cover.') ? 'curtain' : 'door')
        if (meshName) {
          const pos = Array.isArray(a.glb_pos) ? [(a.glb_pos as number[])[0], (a.glb_pos as number[])[1]] as [number, number] : undefined
          senGlb.push({ entityId, name, floor: f as 1|2|3, meshName, deviceClass: dc, pos })
        } else if (Array.isArray(a.glb_pos)) sen.push({ entityId, name, floor: f as 1|2|3, x: (a.glb_pos as number[])[0], z: (a.glb_pos as number[])[1], deviceClass: dc })
      } else if (entityId.startsWith('camera.')) {
        const dc = 'camera'
        if (meshName) {
          senGlb.push({ entityId, name, floor: f as 1|2|3, meshName, deviceClass: dc })
        } else if (Array.isArray(a.glb_pos)) sen.push({ entityId, name, floor: f as 1|2|3, x: (a.glb_pos as number[])[0], z: (a.glb_pos as number[])[1], deviceClass: dc })
      } else if (entityId.startsWith('media_player.')) {
        if (meshName) med.push({ entityId, name, floor: f as 1|2|3, meshName })
      }
    })
    return { glbLights: glb, sphereLights: sph, sensorMarkers: sen, sensorGlbMeshes: senGlb, mediaGlbMeshes: med }
  }, [states, mappings])

  useEffect(() => { statesRef.current = states }, [states])

  useEffect(() => {
    if (!cameraViewer || !camVideoRef.current) return
    const st = states.get(cameraViewer)
    const url = st?.attributes?.hls_url as string
    if (!url) return
    camHlsRef.current?.destroy()
    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true })
      hls.loadSource(url)
      hls.attachMedia(camVideoRef.current)
      hls.on(Hls.Events.MANIFEST_PARSED, () => camVideoRef.current?.play().catch(() => {}))
      camHlsRef.current = hls
    } else if (camVideoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      camVideoRef.current.src = url
      camVideoRef.current.play().catch(() => {})
    }
    return () => { camHlsRef.current?.destroy(); camHlsRef.current = null }
  }, [cameraViewer, states])

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

  const { onClick } = useSceneClick(
    containerRef,
    () => cameraRef.current,
    () => clickables.current,
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
          if (result.entityId.startsWith('camera.')) { playBehaviorSound(result.entityId, true); setCameraViewer(result.entityId); return }
          const prevSt = st
          const isCoverEid = result.entityId.startsWith('cover.')
          const curOpen = st?.state === 'on' || st?.state === 'open'
          const newState = isCoverEid ? (curOpen ? 'closed' : 'open') : (curOpen ? 'off' : 'on')
          statesRef.current = new Map(statesRef.current).set(result.entityId, { ...st!, state: newState })
          patchState(result.entityId, newState)
          setLocalRev(n => n + 1)
          playBehaviorSound(result.entityId, !curOpen)
          callToggle(result.entityId, !curOpen).then(ok => {
            if (!ok && prevSt) {
              statesRef.current = new Map(statesRef.current).set(result.entityId, prevSt)
              patchState(result.entityId, prevSt.state, prevSt.attributes)
              setLocalRev(n => n + 1)
            }
          })
        } else setSelectedId(null)
      }, 0)
    },
  )

  const selState    = selectedId ? getState(selectedId) : null
  const selDomain   = selectedId?.split('.')[0] ?? ''
  const isCover     = selDomain === 'cover'
  const selOn       = selState?.state === 'on' || selState?.state === 'open'
  const selName     = selState ? (selState.attributes.friendly_name as string) ?? selectedId : ''
  const selDevClass = selState?.attributes?.device_class as string | undefined
  const isSensor    = selDomain === 'binary_sensor' || isCover
  const isCamera    = selectedId?.startsWith('camera.')

  const callToggle = useCallback(async (eid: string, on: boolean): Promise<boolean> => {
    const domain = eid.split('.')[0]
    if (domain === 'cover') {
      const { success } = await callService('cover', on ? 'open_cover' : 'close_cover', {}, eid)
      return success
    }
    const { success } = await callService(domain, on ? 'turn_on' : 'turn_off', {}, eid)
    return success
  }, [callService])

  const playBehaviorSound = (eid: string, on: boolean) => {
    if (eid.startsWith('media_player.')) { if (on) startMusic(); else stopMusic() }
    if (soundMode === 0) return
    const name = states.get(eid)?.attributes?.friendly_name as string || eid
    const isBinarySensor = eid.startsWith('binary_sensor.') || eid.startsWith('cover.')
    const stateLabel = isBinarySensor ? (on ? 'open' : 'closed') : (on ? 'on' : 'off')
    if (soundMode === 1) { playDing() } else {
      if (eid.startsWith('light.')) playLightToggle(on)
      else if (eid.startsWith('media_player.')) playMediaToggle(on)
      else if (eid.startsWith('switch.')) playSwitchToggle(on)
      else if (eid.startsWith('cover.') || eid.startsWith('binary_sensor.')) {
        const dc = states.get(eid)?.attributes?.device_class as string
        if (dc === 'garage' || dc === 'garage_door') playGarageToggle(on)
        else if (dc === 'curtain' || dc === 'blind') playCurtainToggle(on)
        else playDoorToggle(on)
      } else playSwitchToggle(on)
      speakState(name, stateLabel)
    }
  }

  const selBrightPct = selState?.attributes?.brightness != null
    ? Math.round(((selState.attributes.brightness as number) / 255) * 100) : 100
  const selVolPct = selState?.attributes?.volume_level != null
    ? Math.round((selState.attributes.volume_level as number) * 100) : 50
  const setVolume = (pct: number) => {
    if (!selectedId) return
    patchState(selectedId, selState?.state ?? 'on', { volume_level: pct / 100 })
    callService('media_player', 'volume_set', { volume_level: pct / 100 }, selectedId)
  }
  const toggle = () => {
    if (!selectedId) return
    const prevState = statesRef.current.get(selectedId)
    const opening = !selOn
    const newState = isCover ? (opening ? 'open' : 'closed') : (opening ? 'on' : 'off')
    statesRef.current = new Map(statesRef.current).set(selectedId, { ...selState!, state: newState })
    patchState(selectedId, newState)
    setLocalRev(n => n + 1)
    playBehaviorSound(selectedId, opening)
    callToggle(selectedId, opening).then(ok => {
      if (!ok && prevState) {
        statesRef.current = new Map(statesRef.current).set(selectedId, prevState)
        patchState(selectedId, prevState.state, prevState.attributes)
        setLocalRev(n => n + 1)
      }
    })
  }
  const setBright = (pct: number) => {
    if (!selectedId) return
    callService('light', 'turn_on', { brightness: Math.round(pct / 100 * 255) }, selectedId)
  }

  const sensorIcon = (dc?: string) =>
    dc === 'door' || dc === 'garage_door' || dc === 'garage' ? '🚪' : dc === 'curtain' || dc === 'blind' ? '🪟' : dc === 'camera' ? '📷' : '🔲'
  const sensorLabel = (dc?: string, open?: boolean) => open ? 'Open' : 'Closed'

  const legendLights = useMemo(() => [
    ...glbLights.filter(l => l.floor === floor).map(l => ({ ...l, isGlb: true,  isSensor: false })),
    ...sphereLights.filter(l => l.floor === floor).map(l => ({ ...l, isGlb: false, isSensor: false })),
    ...sensorGlbMeshes.filter(s => s.floor === floor).map(s => ({ ...s, isGlb: true,  isSensor: true })),
    ...sensorMarkers.filter(s => s.floor === floor).map(s => ({ ...s, isGlb: false, isSensor: true })),
    ...mediaGlbMeshes.filter(l => l.floor === floor).map(l => ({ ...l, isGlb: true,  isSensor: false })),
  ], [glbLights, sphereLights, sensorGlbMeshes, sensorMarkers, mediaGlbMeshes, floor])

  useEffect(() => {
    if (!token || migratedRef.current) return
    migratedRef.current = true
    fetch('/api/config/3d-mappings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((d: any) => {
        const keys = Object.keys(d).filter(k => k !== 'mappings')
        if (keys.length > 0) {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') setSelectedId(null)
      if ((e.key === 'e' || e.key === 'E') && !embedded) setEditMode(v => !v)
      if (e.key === '1') setFloor(1)
      if (e.key === '2') setFloor(2)
      if (e.key === '3') setFloor(3)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [embedded])

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
  const saveWithHist = (m: Mappings, b: BehaviorMap) => { pushHist(mappings, behaviors); saveMappings(m, b) }
  const editPanelOnPick = (mesh: string, eid: string, next: Mappings, beh: BehaviorMap) => { pushHist(mappings, behaviors); setMappings(next); setBehaviors(beh); saveMappings(next, beh) }
  const editPanelOnDelete = (next: Mappings, beh: BehaviorMap) => { pushHist(mappings, behaviors); setMappings(next); setBehaviors(beh); saveMappings(next, beh) }

  useEffect(() => () => { document.body.style.overflow = '' }, [])
  if (embedded) document.body.style.overflow = 'hidden'
  else document.body.style.overflow = ''

  const panelIcon = isSensor ? sensorIcon(selDevClass)
    : selDomain === 'media_player' ? '🔊'
    : selDomain === 'light' ? '💡'
    : '⚡'

  const popup = selectedId ? (
    <div className="fp-panel" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 22 }}>{panelIcon}</span>
        <button className="fp-close" style={{ width: 22, height: 22, fontSize: 10 }} onClick={() => setSelectedId(null)}>✕</button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#fff', textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word', width: '100%' }}>{selName}</div>
      <div className={`fp-panel-state${selOn ? ' on' : ''}`} style={{ fontSize: 11 }}>
        {isSensor ? sensorLabel(selDevClass, selOn) : (selOn ? 'On' : 'Off')}
      </div>
      {isCamera ? (
        <a href={`/dashboard?camera=${selectedId}`} className="btn" style={{ fontSize: 10, padding: '3px 7px', textDecoration: 'none' }}>📷 View</a>
      ) : (
        <label className="ios-toggle"
          onPointerDown={e => e.stopPropagation()}
          onPointerUp={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selOn ?? false} onChange={toggle} />
          <span className="ios-slider" />
        </label>
      )}
      {selDomain === 'light' && (
        <VerticalSlider
          value={selBrightPct}
          onPreview={pct => {
            if (!selectedId) return
            const cur = statesRef.current.get(selectedId)
            if (!cur) return
            const brightness = Math.round(pct / 100 * 255)
            statesRef.current = new Map(statesRef.current).set(selectedId, {
              ...cur, state: 'on',
              attributes: { ...cur.attributes, brightness },
            })
            patchState(selectedId, 'on', { brightness })
            setLocalRev(n => n + 1)
          }}
          onChange={setBright}
          color="#f0c840"
        />
      )}
      {selDomain === 'media_player' && <VerticalSlider value={selVolPct} onChange={setVolume} color="#30d158" />}
    </div>
  ) : null

  return (
    <div className={`fp-page${embedded ? ' fp-fullscreen' : ''}`} style={embedded ? undefined : { bottom: 0 }}>
      {/* Page chrome — hidden when embedded */}
      {!embedded && (
        <div className="fp-header">
          <span className="fp-title">3D Floor Plan</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className={`btn${editMode ? ' active' : ''}`} style={{ fontSize: 10, padding: '3px 8px' }}
              onClick={() => setEditMode(!editMode)}>
              {editMode ? '✕ Done' : '✎ Edit'}
            </button>
          </div>
        </div>
      )}

      {editMode && glbLoaded && !embedded && (
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
              disabled={histIdx < 0} onClick={undoHist}>↩️</button>
          </div>
        </>
      )}

      <div className="fp-canvas" ref={containerRef} onClick={onClick} />

      {/* Floor selector + camlock */}
      <div style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: 'rgba(10,12,30,0.55)', backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)', border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 18, boxShadow: '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)',
        padding: '8px 6px', gap: 4,
      }}>
        {['1', '2', '3', '4', '5'].map(id => {
          if (!floorNames[id]) return null
          const lang = LANG_LIST[langIdx]
          const label = trFloor(floorNames[id], lang)
          const active = String(floor) === id
          return (
            <button key={id} onClick={() => {
              setFloor(Number(id) as FloorId); setSelectedId(null)
              if (soundMode >= 1) playDing()
              if (soundMode === 2) speakText(label)
            }} style={{
              width: 48, minHeight: 40, borderRadius: 11, cursor: 'pointer',
              background: active ? 'rgba(240,168,0,0.22)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${active ? 'rgba(240,168,0,0.50)' : 'rgba(255,255,255,0.10)'}`,
              boxShadow: active ? '0 0 10px rgba(240,168,0,0.35), inset 0 1px 0 rgba(255,220,80,0.25)' : 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2, padding: '5px 3px', transition: 'all 0.18s',
            }}>
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: active ? '#f0c840' : 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 1.25, wordBreak: 'keep-all' }}>{label}</span>
            </button>
          )
        })}
        <div style={{ width: 32, height: 1, background: 'rgba(255,255,255,0.12)', margin: '2px 0' }} />
        <button onClick={() => setCamLocked(!camLocked)} style={{
          width: 48, height: 40, borderRadius: 11, cursor: 'pointer',
          background: camLocked ? 'rgba(240,168,0,0.22)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${camLocked ? 'rgba(240,168,0,0.50)' : 'rgba(255,255,255,0.10)'}`,
          boxShadow: camLocked ? '0 0 10px rgba(240,168,0,0.35), inset 0 1px 0 rgba(255,220,80,0.25)' : 'none',
          fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s',
        }}>{camLocked ? '🔒' : '🔓'}</button>
      </div>

      {glbLoading && <div className="fp-glb-badge"><div className="fp-spinner-sm" /> Loading model…</div>}
      {glbError   && <div className="fp-glb-badge" style={{ color: '#ff453a', cursor: 'pointer' }}
        onClick={() => { setGlbError(false); setGlbLoaded(false); setGlbLoading(true); setFloor(f => f as FloorId) }}>
        ⚠️ Model not found · Tap to retry</div>}
      {glbLoaded && !embedded && <div className="fp-glb-badge" style={{ color: 'rgba(48,209,88,0.8)' }}>● 3D model · click fixtures</div>}

      {!embedded && (
        <div className="fp-legend">
          {legendLights.map(({ entityId, name, isGlb, isSensor }) => {
            const st = states.get(entityId)
            const on = st?.state === 'on' || st?.state === 'open'
            const dc = st?.attributes?.device_class as string | undefined
            return (
              <button key={entityId}
                className={`fp-legend-item${on ? ' on' : ''}${selectedId === entityId ? ' sel' : ''}${isSensor ? ' sensor' : ''}`}
                onClick={() => {
                  setSelectedId(p => p === entityId ? null : entityId)
                  const newSt = entityId.startsWith('cover.') ? (on ? 'closed' : 'open') : (on ? 'off' : 'on')
                  patchState(entityId, newSt)
                  callToggle(entityId, !on)
                }}>
                <span className={`fp-dot${on ? ' on' : ''}${isGlb ? ' glb' : ''}${isSensor ? (on ? ' open' : ' closed') : ''}`} />
                <span className="fp-legend-name">{name}</span>
                {isGlb && !isSensor && <span className="fp-legend-3d">3D</span>}
                {isSensor && <span className={`fp-legend-3d${on ? ' alert' : ''}`}>{on ? sensorLabel(dc, true) : sensorLabel(dc, false)}</span>}
              </button>
            )
          })}
        </div>
      )}

      {popup}

      {cameraViewer && (() => {
        const st = states.get(cameraViewer)
        const camName = (st?.attributes?.friendly_name as string) || cameraViewer
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#000', display: 'flex', flexDirection: 'column' }}
            onClick={() => setCameraViewer(null)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(15,18,30,0.75)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 14, flex: 1 }}>📷 {camName} {LANG_LIST[langIdx] === 'en' ? '' : LANG_LIST[langIdx] === 'zh' ? '直播' : 'زنده'}</span>
              <button onClick={e => { e.stopPropagation(); setCamMuted(m => !m) }}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>
                {camMuted ? '🔇' : '🔊'}
              </button>
              <button onClick={e => {
                e.stopPropagation()
                const video = camVideoRef.current
                if (!video) return
                const canvas = document.createElement('canvas')
                canvas.width = video.videoWidth; canvas.height = video.videoHeight
                canvas.getContext('2d')?.drawImage(video, 0, 0)
                const a = document.createElement('a')
                a.download = `${camName}-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.png`
                a.href = canvas.toDataURL('image/png')
                a.click()
              }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>📸</button>
              <button onClick={e => { e.stopPropagation(); setCameraViewer(null) }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>✕</button>
            </div>
            <video ref={camVideoRef} autoPlay muted={camMuted} playsInline
              style={{ flex: 1, width: '100%', objectFit: 'contain' }}
              onClick={e => e.stopPropagation()} />
          </div>
        )
      })()}
    </div>
  )
}
