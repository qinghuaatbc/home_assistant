import { useEffect, useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useHa, HaState } from '../context/HaContext'

const FW = 19, FD = 14, WH = 2.8, WT = 0.15, BR = 0.35
const SR = 0.28  // sensor indicator radius

function buildFallback(floor: 1 | 2 | 3): THREE.Group {
  const g = new THREE.Group()
  const fM = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9 })
  const wM = new THREE.MeshStandardMaterial({ color: 0x3c3c44, roughness: 0.85 })
  const box = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m)
  }
  box(fM, 0, -0.06, 0, FW, 0.12, FD)
  const hy = WH / 2
  box(wM, 0, hy, -FD / 2, FW, WH, WT); box(wM, 0, hy, FD / 2, FW, WH, WT)
  box(wM, -FW / 2, hy, 0, WT, WH, FD); box(wM, FW / 2, hy, 0, WT, WH, FD)
  if (floor === 1) box(new THREE.MeshStandardMaterial({ color: 0x48484e }), 0, hy, 0, WT, WH, FD)
  const grid = new THREE.GridHelper(FW, 19, 0x3a3a44, 0x333338)
  grid.position.y = 0.01; g.add(grid)
  return g
}

function makeSphere(x: number, z: number, entityId: string, scene: THREE.Scene) {
  const by = WH + 0.35
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(BR, 20, 20),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(1, 0.88, 0.35), emissive: new THREE.Color(1, 0.72, 0.15),
      emissiveIntensity: 0.05, transparent: true, opacity: 0.3, roughness: 0.05,
    }),
  )
  bulb.position.set(x, by, z); bulb.userData.entityId = entityId; scene.add(bulb)

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(BR * 1.9, 20, 20),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(1, 0.88, 0.35), emissive: new THREE.Color(1, 0.72, 0.15),
      transparent: true, opacity: 0.04, depthWrite: false, side: THREE.BackSide,
    }),
  )
  glow.position.set(x, by, z); scene.add(glow)

  const pl = new THREE.PointLight(new THREE.Color(1, 0.88, 0.35), 0, 9, 1.6)
  pl.position.set(x, by, z); scene.add(pl)

  return { bulb, glow, ptLight: pl }
}

// Door/window/curtain sensor indicator
function makeSensorMarker(x: number, z: number, entityId: string, deviceClass: string, scene: THREE.Scene) {
  const isCurtain = deviceClass === 'curtain' || deviceClass === 'blind'
  const isDoor    = deviceClass === 'door' || deviceClass === 'garage_door'

  // Curtain/blind: full-height flat panel; door: tall box; window: wide box
  const by  = isCurtain ? WH / 2 : WH * 0.55
  const geo = isCurtain
    ? new THREE.BoxGeometry(SR * 4, WH, SR * 0.15)
    : isDoor
      ? new THREE.BoxGeometry(SR * 1.6, SR * 2.2, SR * 0.4)
      : new THREE.BoxGeometry(SR * 2.2, SR * 0.8, SR * 0.4)

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.15, 0.9, 0.35),
    emissive: new THREE.Color(0.05, 0.5, 0.1),
    emissiveIntensity: 0.4, transparent: true, opacity: 0.85, roughness: 0.2,
  })
  const marker = new THREE.Mesh(geo, mat)
  marker.position.set(x, by, z); marker.userData.entityId = entityId; scene.add(marker)

  // Curtain/blind: attach clip plane for roll-up animation (same as garage door)
  let clipPlane: THREE.Plane | undefined
  if (isCurtain) {
    const worldBottomY = by - WH / 2
    const worldTopY    = by + WH / 2
    clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(worldBottomY - 0.01))
    mat.clippingPlanes = [clipPlane]
    marker.userData.worldBottomY = worldBottomY
    marker.userData.worldTopY    = worldTopY
  }

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(SR * 1.4, 16, 16),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.1, 1, 0.3),
      transparent: true, opacity: 0.06, depthWrite: false, side: THREE.BackSide,
    }),
  )
  glow.position.set(x, by, z); scene.add(glow)

  const pl = new THREE.PointLight(new THREE.Color(0.2, 1, 0.4), 0, 5, 2)
  pl.position.set(x, by, z); scene.add(pl)

  return { marker, glow, ptLight: pl, deviceClass, clipPlane }
}

function guessBehavior(entityId: string): string {
  if (entityId.startsWith('light.')) return 'light'
  if (entityId.startsWith('binary_sensor.')) return 'door'
  if (entityId.startsWith('switch.')) return 'switch'
  return 'light'
}

const BEHAVIORS = [
  { id: 'light', label: '💡 Light', desc: 'On/off with brightness' },
  { id: 'door', label: '🚪 Door', desc: 'Hinged open/close' },
  { id: 'curtain', label: '🪟 Curtain', desc: 'Roll-up/down' },
  { id: 'garage_door', label: '🚗 Garage', desc: 'Roll-up/down' },
  { id: 'switch', label: '🔌 Switch', desc: 'On/off toggle' },
]

function BehaviorSelect({ behavior, onChange }: { behavior: string; onChange: (b: string) => void }) {
  return (
    <select value={behavior} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 11, marginTop: 4 }}>
      {BEHAVIORS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
    </select>
  )
}

function DevicePicker({ meshName, states, mappings, onPick }: { meshName: string; states: Map<string, any>; mappings: Record<string, string>; onPick: (mesh: string, eid: string) => void }) {
  const [open, setOpen] = useState(false)
  const mappedIds = new Set(Object.values(mappings))
  const devices = Array.from(states.entries())
    .filter(([id]) => !mappedIds.has(id))
    .map(([id, s]) => ({ id, name: (s.attributes?.friendly_name as string) || id }))
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setOpen(!open)}>+</button>
      {open && (
        <div style={{ position: 'absolute', left: 0, top: 22, zIndex: 30, width: 200, background: 'var(--card)', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', padding: 6, maxHeight: 180, overflowY: 'auto' }}>
          {devices.length === 0 && <div style={{ fontSize: 11, color: 'var(--text2)', padding: 4 }}>No devices</div>}
          {devices.map(d => (
            <button key={d.id} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 8px', fontSize: 11, background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', borderRadius: 4 }}
              onClick={() => { onPick(meshName, d.id); setOpen(false) }}
              onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--surface2)'}
              onMouseLeave={e => (e.target as HTMLElement).style.background = 'none'}>
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FloorPlanPage() {
  const { token, states, callService, setEntityState } = useHa()
  const containerRef = useRef<HTMLDivElement>(null)

  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef     = useRef<THREE.Scene | null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef  = useRef<OrbitControls | null>(null)
  const animFrame    = useRef(0)
  const statesRef    = useRef(states)
  const clock        = useRef(new THREE.Clock())
  const isDragging   = useRef(false)
  const ptrDown      = useRef({ x: 0, y: 0 })

  const fallbackRef = useRef<THREE.Group | null>(null)
  const glbModelRef = useRef<THREE.Group | null>(null)   // loaded GLB root, kept for late-arriving entities
  const glbRefs     = useRef(new Map<string, { mesh: THREE.Mesh; ptLight: THREE.PointLight; origColor: THREE.Color }>())
  const sphRefs     = useRef(new Map<string, { bulb: THREE.Mesh; glow: THREE.Mesh; ptLight: THREE.PointLight }>())
  const senRefs     = useRef(new Map<string, { marker: THREE.Mesh; glow: THREE.Mesh; ptLight: THREE.PointLight; deviceClass: string; clipPlane?: THREE.Plane }>())
  // door/window sensor GLB meshes: highlight real door/window geometry + animate on open
  const senGlbRefs  = useRef(new Map<string, { meshes: THREE.Mesh[]; ptLight: THREE.PointLight; origColors: THREE.Color[]; doorObj: THREE.Object3D; origRotY: number; deviceClass: string; origPosY: number }>())
  const clickables  = useRef<THREE.Mesh[]>([])
  const migratedRef = useRef(false)
  const addedSphIds = useRef(new Set<string>())
  const addedSenIds = useRef(new Set<string>())
  const glbLightsRef    = useRef<Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string }>>([])
  const senGlbRef       = useRef<Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string; deviceClass: string; pos?: [number, number] }>>([])

  const [floor, setFloor]           = useState<1 | 2 | 3>(1)
  const [glbLoading, setGlbLoading] = useState(false)
  const [glbLoaded,  setGlbLoaded]  = useState(false)
  const [floorNames, setFloorNames] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [meshNames, setMeshNames] = useState<string[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [behaviors, setBehaviors] = useState<Record<string, string>>({})
  const [mappingDirty, setMappingDirty] = useState(false)
  const [clickedMesh, setClickedMesh] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null)

  // Load floor names
  useEffect(() => {
    if (!token) return
    fetch('/api/config/floors', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((list: any[]) => {
        const m: Record<string, string> = {}
        list.forEach(f => { m[f.id] = f.name })
        setFloorNames(m)
      }).catch(() => {})
  }, [token])

  const saveAll = async (m: Record<string, string>, b: Record<string, string>) => {
    if (!token) return
    // Merge mappings + behaviors into one extended format
    const extended: Record<string, any> = {}
    for (const [mesh, eid] of Object.entries(m)) {
      extended[mesh] = { entity: eid, behavior: b[mesh] || guessBehavior(eid) }
    }
    try {
      await fetch('/api/config/3d-mappings', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: extended }) })
    } catch {}
  }

  // ── Derive layout from state attributes + saved mappings ─────────────────
  const { glbLights, sphereLights, sensorMarkers, sensorGlbMeshes } = useMemo(() => {
    const glb:    Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string }> = []
    const sph:    Array<{ entityId: string; name: string; floor: 1|2|3; x: number; z: number }> = []
    const sen:    Array<{ entityId: string; name: string; floor: 1|2|3; x: number; z: number; deviceClass: string }> = []
    const senGlb: Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string; deviceClass: string; pos?: [number, number] }> = []

    // Build reverse map: entityId → meshName
    const entityToMesh = new Map<string, string>()
    for (const [mesh, eid] of Object.entries(mappings)) entityToMesh.set(eid, mesh)

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
      }
    })
    return { glbLights: glb, sphereLights: sph, sensorMarkers: sen, sensorGlbMeshes: senGlb }
  }, [states, mappings])

  useEffect(() => { statesRef.current    = states         }, [states])
  useEffect(() => { glbLightsRef.current = glbLights      }, [glbLights])
  useEffect(() => { senGlbRef.current    = sensorGlbMeshes }, [sensorGlbMeshes])

  // ── Init Three.js once ────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current; if (!el) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1
    renderer.localClippingEnabled = true
    el.appendChild(renderer.domElement); rendererRef.current = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#111113')
    scene.fog = new THREE.FogExp2('#111113', 0.016)
    sceneRef.current = scene

    scene.add(new THREE.AmbientLight(0xffffff, 0.3))
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x111122, 0.2))
    const dir = new THREE.DirectionalLight(0xffffff, 0.5)
    dir.position.set(8, 18, 10); dir.castShadow = true; dir.shadow.mapSize.setScalar(1024); scene.add(dir)

    const camera = new THREE.PerspectiveCamera(48, el.clientWidth / el.clientHeight, 0.1, 200)
    camera.position.set(0, 14, 13); cameraRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.07
    controls.target.set(0, 1, 0); controls.minDistance = 2
    controls.maxDistance = 60; controls.maxPolarAngle = Math.PI / 2.05
    controls.update(); controlsRef.current = controls

    const animate = () => {
      animFrame.current = requestAnimationFrame(animate)
      const t = clock.current.getElapsedTime()

      glbRefs.current.forEach(({ mesh, ptLight, origColor }, eid) => {
        const st  = statesRef.current.get(eid)
        const on  = st?.state === 'on'
        const b   = ((st?.attributes?.brightness as number) ?? 255) / 255
        const mat = mesh.material as THREE.MeshStandardMaterial
        if (on) {
          const p = 0.8 + 0.2 * Math.sin(t * 2.5)
          mat.emissive.set(1, 0.92, 0.6); mat.emissiveIntensity = p * b * 3
          mat.color.set(1, 0.98, 0.9);    ptLight.intensity = b * 5 * p
        } else {
          mat.emissive.setScalar(0); mat.emissiveIntensity = 0
          mat.color.copy(origColor);  ptLight.intensity = 0
        }
      })

      sphRefs.current.forEach(({ bulb, glow, ptLight }, eid) => {
        const st  = statesRef.current.get(eid)
        const on  = st?.state === 'on'
        const b   = ((st?.attributes?.brightness as number) ?? 255) / 255
        const bM  = bulb.material as THREE.MeshStandardMaterial
        const gM  = glow.material as THREE.MeshStandardMaterial
        if (on) {
          const p = 0.78 + 0.22 * Math.sin(t * 2.8)
          bM.emissiveIntensity = p * b * 2.5; bM.opacity = 1
          gM.opacity = 0.10 + 0.06 * Math.sin(t * 2.8); gM.emissiveIntensity = p * b * 0.8
          ptLight.intensity = b * 3 * p
        } else {
          bM.emissiveIntensity = 0.15; bM.opacity = 0.55
          gM.opacity = 0.08; gM.emissiveIntensity = 0.05; ptLight.intensity = 0
        }
      })

      // Door/window sensor GLB meshes: animate on open/close
      senGlbRefs.current.forEach(({ doorObj, deviceClass }, eid) => {
        const open = statesRef.current.get(eid)?.state === 'on'
        if (deviceClass === 'garage_door' || deviceClass === 'curtain' || deviceClass === 'blind') {
          // Clip-plane roll-up: bottom edge sweeps up, top stays fixed
          const clipPlane = doorObj.userData.clipPlane as THREE.Plane | undefined
          if (clipPlane) {
            const wBot: number = doorObj.userData.worldBottomY
            const wTop: number = doorObj.userData.worldTopY
            const height = wTop - wBot
            const openTarget = wBot + height * 0.9  // 10% left
            const target = open ? -openTarget : -(wBot - height)
            const step = height * 0.018  // fixed units/frame — no startup jump
            const diff = target - clipPlane.constant
            clipPlane.constant = Math.abs(diff) < step ? target : clipPlane.constant + Math.sign(diff) * step
          }
        } else {
          // Hinged door rotates along Z
          const targetRotZ = open ? doorObj.userData.origRotZ + (75 * Math.PI / 180) : doorObj.userData.origRotZ
          doorObj.rotation.z = THREE.MathUtils.lerp(doorObj.rotation.z, targetRotZ, 0.03)
        }
      })

      // Door/window sensors: green=closed, red=open with pulse
      // Curtain/blind sensors: clip-plane roll-up (same as garage door)
      senRefs.current.forEach(({ marker, glow, ptLight, deviceClass, clipPlane }, eid) => {
        const st   = statesRef.current.get(eid)
        const open = st?.state === 'on'
        const mM   = marker.material as THREE.MeshStandardMaterial
        const gM   = glow.material as THREE.MeshStandardMaterial

        if ((deviceClass === 'curtain' || deviceClass === 'blind') && clipPlane) {
          const wBot: number = marker.userData.worldBottomY
          const wTop: number = marker.userData.worldTopY
          const height = wTop - wBot
          const openTarget = wBot + height * 0.9
          const target = open ? -openTarget : -(wBot - height)
          const step = height * 0.018
          const diff = target - clipPlane.constant
          clipPlane.constant = Math.abs(diff) < step ? target : clipPlane.constant + Math.sign(diff) * step
          mM.color.set(0.5, 0.75, 1); mM.emissive.set(0.1, 0.3, 0.8)
          mM.emissiveIntensity = 0.3; mM.opacity = 0.7
        } else if (open) {
          const p = 0.7 + 0.3 * Math.sin(t * 4)
          mM.color.set(1, 0.2, 0.1); mM.emissive.set(1, 0.1, 0.05)
          mM.emissiveIntensity = p * 1.5; mM.opacity = 1
          gM.color.set(1, 0.2, 0.1); gM.opacity = 0.18 + 0.1 * Math.sin(t * 4)
          ptLight.color.set(1, 0.15, 0.05); ptLight.intensity = p * 2
        } else {
          mM.color.set(0.15, 0.9, 0.35); mM.emissive.set(0.05, 0.5, 0.1)
          mM.emissiveIntensity = 0.4; mM.opacity = 0.85
          gM.color.set(0.1, 1, 0.3); gM.opacity = 0.06
          ptLight.color.set(0.2, 1, 0.4); ptLight.intensity = 0
        }
      })

      controls.update(); renderer.render(scene, camera)
    }
    animate()

    const doResize = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (w === 0 || h === 0) return
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h)
    }

    const ro = new ResizeObserver(doResize)
    ro.observe(el)

    let orientTimer: ReturnType<typeof setTimeout>
    const onOrientationChange = () => {
      clearTimeout(orientTimer)
      orientTimer = setTimeout(doResize, 150)
    }
    window.addEventListener('orientationchange', onOrientationChange)
    screen.orientation?.addEventListener('change', onOrientationChange)

    return () => {
      cancelAnimationFrame(animFrame.current); ro.disconnect()
      window.removeEventListener('orientationchange', onOrientationChange)
      screen.orientation?.removeEventListener('change', onOrientationChange)
      clearTimeout(orientTimer)
      renderer.dispose(); el.removeChild(renderer.domElement)
      rendererRef.current = null; sceneRef.current = null; cameraRef.current = null; controlsRef.current = null
    }
  }, [])

  // ── Full scene rebuild — runs ONLY when floor changes ─────────────────────
  useEffect(() => {
    const scene = sceneRef.current; if (!scene) return

    if (fallbackRef.current) { scene.remove(fallbackRef.current); fallbackRef.current = null }
    glbRefs.current.forEach(({ mesh, ptLight }) => { scene.remove(mesh); scene.remove(ptLight) })
    glbRefs.current.clear()
    sphRefs.current.forEach(({ bulb, glow, ptLight }) => { scene.remove(bulb); scene.remove(glow); scene.remove(ptLight) })
    sphRefs.current.clear()
    senRefs.current.forEach(({ marker, glow, ptLight }) => { scene.remove(marker); scene.remove(glow); scene.remove(ptLight) })
    senRefs.current.clear()
    senGlbRefs.current.forEach(({ ptLight, doorObj, origRotY, origPosY }) => {
      scene.remove(ptLight)
      doorObj.rotation.y = origRotY; doorObj.rotation.z = doorObj.userData.origRotZ ?? 0; doorObj.position.y = origPosY
      const cp = doorObj.userData.clipPlane as THREE.Plane | undefined
      if (cp) cp.constant = -(doorObj.userData.worldBottomY as number - 0.01)
    })
    senGlbRefs.current.clear()
    glbModelRef.current = null
    clickables.current = []
    addedSphIds.current.clear()
    addedSenIds.current.clear()
    setGlbLoaded(false); setGlbLoading(true)

    const fb = buildFallback(floor); scene.add(fb); fallbackRef.current = fb

    cameraRef.current!.position.set(0, 14, 13)
    cameraRef.current!.lookAt(0, 0, 0)
    controlsRef.current!.target.set(0, 1, 0); controlsRef.current!.update()

    const targetFloor = floor
    new GLTFLoader().load(
      `/data/floors/floor${floor}.glb`,
      (gltf) => {
        if (targetFloor !== floor) return
        setGlbLoading(false); setGlbLoaded(true)
        const model = gltf.scene

        model.updateWorldMatrix(true, true)
        const box = new THREE.Box3().setFromObject(model)
        model.position.sub(box.getCenter(new THREE.Vector3())); model.position.y = 0
        const sz = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
        model.scale.setScalar(Math.min(FW / sz.x, FD / sz.z) * 0.92)
        scene.add(model)
        model.updateWorldMatrix(true, true)  // refresh after scale change so child bboxes are correct

        const floorGlbLights = glbLightsRef.current.filter(l => l.floor === floor)
        const floorSenGlb    = senGlbRef.current.filter(s => s.floor === floor)

        // Collect all mesh names for edit mode
        const names: string[] = []
        // Match light meshes by traversal
        model.traverse(child => {
          const m = child as THREE.Mesh; if (!m.isMesh) return
          m.castShadow = true; m.receiveShadow = true
          if (child.name) names.push(child.name)
          const lcfg = floorGlbLights.find(l => l.meshName === child.name)
          if (!lcfg) return
          const mat = (m.material as THREE.MeshStandardMaterial).clone()
          m.material = mat; m.updateWorldMatrix(true, false)
          const wp = new THREE.Vector3(); m.getWorldPosition(wp)
          const pl = new THREE.PointLight(new THREE.Color(1, 0.92, 0.7), 0, 12, 1.4)
          pl.position.copy(wp); scene.add(pl)
          m.userData.entityId = lcfg.entityId
          glbRefs.current.set(lcfg.entityId, { mesh: m, ptLight: pl, origColor: mat.color.clone() })
          clickables.current.push(m)
        })

        // Match door/window nodes by name — may be a Group, so collect all child meshes
        floorSenGlb.forEach(cfg => {
          const doorObj = model.getObjectByName(cfg.meshName)
          if (!doorObj) {
            // GLB mesh not found — fall back to procedural marker if glb_pos given
            if (cfg.pos && !addedSenIds.current.has(cfg.entityId)) {
              addedSenIds.current.add(cfg.entityId)
              const refs = makeSensorMarker(cfg.pos[0], cfg.pos[1], cfg.entityId, cfg.deviceClass, scene)
              senRefs.current.set(cfg.entityId, refs)
              clickables.current.push(refs.marker)
            }
            return
          }
          const meshes: THREE.Mesh[] = []
          const origColors: THREE.Color[] = []
          doorObj.traverse(child => {
            const m = child as THREE.Mesh; if (!m.isMesh) return
            const mat = (m.material as THREE.MeshStandardMaterial).clone()
            m.material = mat
            m.userData.entityId = cfg.entityId
            meshes.push(m); origColors.push(mat.color.clone())
            clickables.current.push(m)
          })
          if (meshes.length === 0) return
          const pl = new THREE.PointLight(0xffffff, 0, 1, 1)  // dummy, unused
          doorObj.userData.origRotZ = doorObj.rotation.z
          const origPosY = doorObj.position.y

          if (cfg.deviceClass === 'garage_door' || cfg.deviceClass === 'curtain' || cfg.deviceClass === 'blind') {
            const b = new THREE.Box3().setFromObject(doorObj)
            const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(b.min.y - 0.01))
            doorObj.userData.clipPlane = clipPlane
            doorObj.userData.worldBottomY = b.min.y
            doorObj.userData.worldTopY = b.max.y
            meshes.forEach(m => {
              const mat = m.material as THREE.MeshStandardMaterial
              mat.clippingPlanes = [clipPlane]
            })
          }

          senGlbRefs.current.set(cfg.entityId, { meshes, ptLight: pl, origColors, doorObj, origRotY: doorObj.rotation.y, deviceClass: cfg.deviceClass, origPosY })
        })

        setMeshNames(names.filter((v, i, a) => a.indexOf(v) === i))
        glbModelRef.current = model
        // Add all named meshes to clickables for edit mode
        model.traverse(child => {
          const m = child as THREE.Mesh; if (!m.isMesh) return
          const meshName = m.name || (m.parent?.name || '')
          if (!meshName) return
          if (!clickables.current.includes(m)) {
            m.userData.meshName = meshName
            clickables.current.push(m)
          }
        })
        if (fallbackRef.current) fallbackRef.current.visible = false

        const sz2 = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
        const d   = Math.max(sz2.x, sz2.z)
        cameraRef.current!.position.set(0, d * 0.9, d * 0.75)
        cameraRef.current!.lookAt(0, 0, 0)
        controlsRef.current!.target.set(0, 0, 0); controlsRef.current!.update()
      },
      undefined,
      () => setGlbLoading(false),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor])

  // ── Wire GLB sensor meshes for late-arriving entities (e.g. curtains) ──────
  useEffect(() => {
    const scene = sceneRef.current
    const model = glbModelRef.current
    if (!scene || !model) return
    sensorGlbMeshes.filter(s => s.floor === floor && !senGlbRefs.current.has(s.entityId) && !senRefs.current.has(s.entityId)).forEach(cfg => {
      const doorObj = model.getObjectByName(cfg.meshName)
      if (!doorObj) {
        if (cfg.pos && !addedSenIds.current.has(cfg.entityId)) {
          addedSenIds.current.add(cfg.entityId)
          const refs = makeSensorMarker(cfg.pos[0], cfg.pos[1], cfg.entityId, cfg.deviceClass, scene!)
          senRefs.current.set(cfg.entityId, refs)
          clickables.current.push(refs.marker)
        }
        return
      }
      const meshes: THREE.Mesh[] = []
      const origColors: THREE.Color[] = []
      doorObj.traverse(child => {
        const m = child as THREE.Mesh; if (!m.isMesh) return
        const mat = (m.material as THREE.MeshStandardMaterial).clone()
        m.material = mat
        m.userData.entityId = cfg.entityId
        meshes.push(m); origColors.push(mat.color.clone())
        clickables.current.push(m)
      })
      if (meshes.length === 0) return
      const pl = new THREE.PointLight(0xffffff, 0, 1, 1)
      doorObj.userData.origRotZ = doorObj.userData.origRotZ ?? doorObj.rotation.z
      const origPosY = doorObj.position.y
      if (cfg.deviceClass === 'garage_door' || cfg.deviceClass === 'curtain' || cfg.deviceClass === 'blind') {
        const b = new THREE.Box3().setFromObject(doorObj)
        const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(b.min.y - 0.01))
        doorObj.userData.clipPlane = clipPlane
        doorObj.userData.worldBottomY = b.min.y
        doorObj.userData.worldTopY = b.max.y
        meshes.forEach(m => { (m.material as THREE.MeshStandardMaterial).clippingPlanes = [clipPlane] })
      }
      senGlbRefs.current.set(cfg.entityId, { meshes, ptLight: pl, origColors, doorObj, origRotY: doorObj.rotation.y, deviceClass: cfg.deviceClass, origPosY })
    })
  }, [sensorGlbMeshes, floor])

  // ── Add sphere light indicators ───────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current; if (!scene) return
    sphereLights.filter(l => l.floor === floor).forEach(cfg => {
      if (addedSphIds.current.has(cfg.entityId)) return
      addedSphIds.current.add(cfg.entityId)
      const refs = makeSphere(cfg.x, cfg.z, cfg.entityId, scene)
      sphRefs.current.set(cfg.entityId, refs)
      clickables.current.push(refs.bulb)
    })
  }, [sphereLights, floor])

  // ── Add door/window sensor indicators ────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current; if (!scene) return
    sensorMarkers.filter(s => s.floor === floor).forEach(cfg => {
      if (addedSenIds.current.has(cfg.entityId)) return
      addedSenIds.current.add(cfg.entityId)
      const refs = makeSensorMarker(cfg.x, cfg.z, cfg.entityId, cfg.deviceClass, scene)
      senRefs.current.set(cfg.entityId, refs)
      clickables.current.push(refs.marker)
    })
  }, [sensorMarkers, floor])

  // ── Click detection ───────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = false; ptrDown.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const dx = e.clientX - ptrDown.current.x, dy = e.clientY - ptrDown.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 5) isDragging.current = true
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (isDragging.current) return
    const el = containerRef.current, cam = cameraRef.current; if (!el || !cam) return
    setClickedMesh(null)
    const rect = el.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, cam)
    const hits = ray.intersectObjects(clickables.current, false)
    if (hits.length > 0) {
      const eid = hits[0].object.userData.entityId as string
      const hitName = (hits[0].object as any).name || hits[0].object.userData.meshName as string || ''
      if (editMode) {
        setSelectedId(eid || null)
        if (!eid && hitName) setClickedMesh(hitName)
        return
      }
      if (eid) {
        setSelectedId(eid)
        const st = statesRef.current.get(eid)
        const newState = st?.state === 'on' ? 'off' : 'on'
        statesRef.current = new Map(statesRef.current).set(eid, { ...st!, state: newState })
        setEntityState(eid, newState)
      }
    } else setSelectedId(null)
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  const selState     = selectedId ? states.get(selectedId) : null
  const selOn        = selState?.state === 'on'
  const selName      = selState ? (selState.attributes.friendly_name as string) ?? selectedId : ''
  const selDomain    = selectedId?.split('.')[0] ?? ''
  const selDevClass  = selState?.attributes?.device_class as string | undefined
  const isSensor     = selDomain === 'binary_sensor'

  const selBrightPct = selState?.attributes?.brightness != null
    ? Math.round(((selState.attributes.brightness as number) / 255) * 100) : 100
  const toggle    = () => selectedId && callService('light', selOn ? 'turn_off' : 'turn_on', {}, selectedId)
  const setBright = (pct: number) =>
    selectedId && callService('light', 'turn_on', { brightness: Math.round(pct / 100 * 255) }, selectedId)

  const sensorIcon = (dc?: string) =>
    dc === 'door' || dc === 'garage_door' ? '🚪' : dc === 'curtain' || dc === 'blind' ? '🪟' : '🪟'
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
  ], [glbLights, sphereLights, sensorGlbMeshes, sensorMarkers, floor])

  // Load saved mappings (once). Only migrate from YAML if no saved file yet.
  useEffect(() => {
    if (!token || states.size === 0 || migratedRef.current) return
    migratedRef.current = true
    fetch('/api/config/3d-mappings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then((d: any) => {
        const keys = Object.keys(d).filter(k => k !== 'mappings')
        if (keys.length > 0) {
          // Parse old format (string) and new format ({entity, behavior})
          const m: Record<string, string> = {}
          const b: Record<string, string> = {}
          for (const [mesh, val] of Object.entries(d)) {
            if (typeof val === 'string') { m[mesh] = val; b[mesh] = guessBehavior(val) }
            else { const v = val as any; m[mesh] = v.entity; b[mesh] = v.behavior || guessBehavior(v.entity) }
          }
          setMappings(m); setBehaviors(b)
          return
        }
        const merged: Record<string, string> = {}
        const beh: Record<string, string> = {}
        let added = false
        states.forEach((st, eid) => {
          const mesh = st.attributes?.glb_mesh as string | undefined
          if (mesh) { merged[mesh] = eid; beh[mesh] = guessBehavior(eid); added = true }
        })
        setMappings(merged); setBehaviors(beh)
        if (added) saveAll(merged, beh)
      }).catch(() => {})
  }, [token, states])

  return (
    <div className="fp-page">
      <div className="fp-header">
        <span className="fp-title">3D Floor Plan</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className={`btn${editMode ? ' active' : ''}`} style={{ fontSize: 10, padding: '3px 8px' }}
            onClick={() => setEditMode(!editMode)}>
            {editMode ? '✕ Done' : '✎ Edit'}
          </button>
          <div className="fp-floor-btns">
            {['1', '2', '3', '4', '5'].map(id => (
              <button key={id} className={`fp-floor-btn${String(floor) === id ? ' active' : ''}`}
                onClick={() => { setFloor(Number(id) as any); setSelectedId(null) }}
                style={{ display: floorNames[id] ? undefined : 'none' }}>
                {floorNames[id] || id}
              </button>
            ))}
          </div>
        </div>
      </div>

      {editMode && glbLoaded && (
        <div className="fp-edit-panel" style={{
          position: 'absolute', left: 12, top: 60, zIndex: 20, width: 220,
          background: 'var(--card)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          padding: 10, maxHeight: '60vh', overflowY: 'auto', fontSize: 11,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>📋 Meshes</span>
            <button className="btn" style={{ fontSize: 10, padding: '2px 8px' }}
              onClick={async () => {
                if (!token) return alert('Not logged in')
                const r = await fetch('/api/config/3d-mappings', {
                  method: 'PUT',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mappings: mappings })
                })
                alert(r.ok ? '✅ Saved' : '❌ ' + await r.text())
              }}>
              💾 Save
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>
            Tap a mesh to bind/unbind
          </div>
          {meshNames.map(meshName => {
            const mapped = !!mappings[meshName]
            return (
              <div key={meshName} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px',
                borderRadius: 4, marginBottom: 1,
                background: clickedMesh === meshName ? 'var(--surface2)' : mapped ? 'rgba(48,209,88,0.08)' : 'transparent',
              }}>
                <span style={{ width: 14, fontSize: 10, color: mapped ? '#30d158' : 'var(--text3)', cursor: 'pointer' }}
                  onClick={() => { setClickedMesh(meshName); setSelectedId(null) }}>
                  {mapped ? '✓' : '○'}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', flex: 1 }}
                  onClick={() => { setClickedMesh(meshName); setSelectedId(null) }}>
                  {meshName}
                </span>
                {mapped ? (
                  <span style={{ fontSize: 9, color: 'var(--text2)' }}>{(states.get(mappings[meshName])?.attributes?.friendly_name as string) || mappings[meshName]}</span>
                ) : (
                  <DevicePicker meshName={meshName} states={states} mappings={mappings} onPick={async (mesh, eid) => {
                    const next = { ...mappings, [mesh]: eid }
                    setMappings(next)
                    const r = await fetch('/api/config/3d-mappings', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: next }) })
                    if (!r.ok) alert('Save failed: ' + await r.text())
                  }} />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="fp-canvas" ref={containerRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />

      {glbLoading && <div className="fp-glb-badge"><div className="fp-spinner-sm" /> Loading model…</div>}
      {glbLoaded  && <div className="fp-glb-badge" style={{ color: 'rgba(48,209,88,0.8)' }}>● 3D model · click fixtures</div>}

      <div className="fp-legend">
        {legendLights.map(({ entityId, name, isGlb, isSensor }) => {
          const on = states.get(entityId)?.state === 'on'
          const dc = states.get(entityId)?.attributes?.device_class as string | undefined
          return (
            <button key={entityId}
              className={`fp-legend-item${on ? ' on' : ''}${selectedId === entityId ? ' sel' : ''}${isSensor ? ' sensor' : ''}`}
              onClick={() => setSelectedId(p => p === entityId ? null : entityId)}>
              <span className={`fp-dot${on ? ' on' : ''}${isGlb ? ' glb' : ''}${isSensor ? (on ? ' open' : ' closed') : ''}`} />
              <span className="fp-legend-name">{name}</span>
              {isGlb && !isSensor && <span className="fp-legend-3d">3D</span>}
              {isSensor && <span className={`fp-legend-3d${on ? ' alert' : ''}`}>{on ? sensorLabel(dc, true) : sensorLabel(dc, false)}</span>}
            </button>
          )
        })}
      </div>

      {(selectedId || (editMode && clickedMesh)) && (
        <div className="fp-panel" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
          <div className="fp-panel-row">
            <span className="fp-panel-icon">{isSensor ? sensorIcon(selDevClass) : '💡'}</span>
            <div className="fp-panel-info">
              <div className="fp-panel-name">{selName}</div>
              <div className={`fp-panel-state${selOn ? ' on' : ''}`}>
                {isSensor ? sensorLabel(selDevClass, selOn) : (selOn ? 'On' : 'Off')}
              </div>
            </div>
            {!isSensor && (
              <label className="ios-toggle" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selOn ?? false} onChange={toggle} />
                <span className="ios-slider" />
              </label>
            )}
            {isSensor && (
              <label className="ios-toggle" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selOn ?? false}
                  onChange={() => selectedId && setEntityState(selectedId, selOn ? 'off' : 'on')} />
                <span className="ios-slider" />
              </label>
            )}
            <button className="fp-close" onClick={() => setSelectedId(null)}>✕</button>
          </div>
          {!isSensor && selOn && (
            <div className="brightness-row" style={{ padding: '4px 4px 2px' }}>
              <span className="brightness-icon">☀</span>
              <input type="range" className="ios-range" min={1} max={100} value={selBrightPct}
                onChange={e => setBright(Number(e.target.value))} />
              <span className="fp-bright-val">{selBrightPct}%</span>
            </div>
          )}
           {editMode && (() => {
             const boundMesh = selectedId ? Object.entries(mappings).find(([, eid]) => eid === selectedId)?.[0] : null
             const targetMesh = boundMesh || clickedMesh
             if (!targetMesh) return null
             const isBound = !!boundMesh
             const curBehavior = behaviors[targetMesh] || guessBehavior(mappings[targetMesh] || '')
             const setBehavior = (b: string) => setBehaviors(prev => ({ ...prev, [targetMesh]: b }))
             return (
               <div style={{ padding: '8px 12px', borderTop: '1px solid var(--sep)' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span style={{ fontSize: 11, color: 'var(--text2)' }}>🎯 <code style={{ fontSize: 11 }}>{targetMesh}</code></span>
                   {isBound && (
                     <button className="btn" style={{ fontSize: 10, padding: '2px 8px', color: '#ff453a' }}
                       onClick={async () => {
                         const n = { ...mappings }; delete n[targetMesh]; setMappings(n)
                         const nb = { ...behaviors }; delete nb[targetMesh]; setBehaviors(nb)
                         const r = await fetch('/api/config/3d-mappings', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: n }) })
                         if (!r.ok) alert('Save failed: ' + await r.text())
                       }}>
                       Unbind
                     </button>
                   )}
                 </div>
                 <BehaviorSelect behavior={curBehavior} onChange={setBehavior} />
                 {!isBound && (() => {
                   const mappedIds = new Set(Object.values(mappings))
                   const available = Array.from(states.entries())
                     .filter(([id]) => !mappedIds.has(id))
                     .map(([id, s]) => ({ id, name: (s.attributes?.friendly_name as string) || id }))
                   return (
                     <select style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, marginTop: 4 }}
                       defaultValue="" onChange={async e => {
                         if (!e.target.value) return
                         const next = { ...mappings, [targetMesh]: e.target.value }
                         setMappings(next)
                         setBehaviors(prev => ({ ...prev, [targetMesh]: curBehavior }))
                         const r = await fetch('/api/config/3d-mappings', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: next }) })
                         if (!r.ok) alert('Save failed: ' + await r.text())
                       }}>
                       <option value="" disabled>Select device…</option>
                       {available.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                     </select>
                   )
                 })()}
               </div>
             )
           })()}
        </div>
      )}
    </div>
  )
}
