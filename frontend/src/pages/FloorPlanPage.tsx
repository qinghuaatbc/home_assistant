import { useEffect, useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useHa } from '../context/HaContext'
import { useToast } from '../context/ToastContext'
import { HaState, Mappings, MappingEntry, BehaviorMap, FloorId } from '../types'
import { guessBehavior, BEHAVIORS, BrightnessSlider, DevicePicker } from '../components/DevicePicker'
import EditPanel from '../components/EditPanel'
import { useThreeScene } from '../hooks/useThreeScene'
import { useSceneClick } from '../hooks/useSceneClick'

const FW = 19, FD = 14, WH = 2.8, WT = 0.15, BR = 0.35
const SR = 0.28  // sensor indicator radius

function buildFallback(floor: 1 | 2 | 3): THREE.Group {
  const g = new THREE.Group()
  const fM = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.7 })
  const wM = new THREE.MeshStandardMaterial({ color: 0x9999aa, roughness: 0.7 })
  const box = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m)
  }
  box(fM, 0, -0.06, 0, FW, 0.12, FD)
  const hy = WH / 2
  box(wM, 0, hy, -FD / 2, FW, WH, WT); box(wM, 0, hy, FD / 2, FW, WH, WT)
  box(wM, -FW / 2, hy, 0, WT, WH, FD); box(wM, FW / 2, hy, 0, WT, WH, FD)
  if (floor === 1) box(new THREE.MeshStandardMaterial({ color: 0x48484e }), 0, hy, 0, WT, WH, FD)
  const grid = new THREE.GridHelper(FW, 19, 0x666688, 0x555566)
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



export default function FloorPlanPage({ fullscreen, onFullscreenChange, standaloneToken }: { fullscreen?: boolean; onFullscreenChange?: (v: boolean) => void; standaloneToken?: string | null }) {
  const { token: ctxToken, states, callService } = useHa()
  const { toast } = useToast()
  const HARDCODED = '4e850946782c1e214827ba1ed5b18f33dcaca0182b8c13f66bd823b3b42fabce'
  const token = standaloneToken || ctxToken || HARDCODED
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef     = useRef<THREE.Scene | null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef  = useRef<OrbitControls | null>(null)
  const statesRef    = useRef(states)

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

  const [floor, setFloor]           = useState<FloorId>(1)
  const [glbLoading, setGlbLoading] = useState(false)
  const [glbLoaded,  setGlbLoaded]  = useState(false)
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
  const getState = (eid: string) => statesRef.current.get(eid) || states.get(eid)

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

  const saveAll = async (m: Mappings, b: BehaviorMap) => {
    if (!token) return
    const body = buildMappingsPayload(m, b)
    try {
      const r = await fetch('/api/config/3d-mappings', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: body }) })
      if (!r.ok) toast('Save failed', 'error')
    } catch { toast('Network error saving mappings', 'error') }
  }

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
      out[mesh] = { entity: eid, behavior: b[mesh] || guessBehavior(eid) }
    }
    return out
  }

  // ── Derive layout from state attributes + saved mappings ─────────────────
  const { glbLights, sphereLights, sensorMarkers, sensorGlbMeshes } = useMemo(() => {
    const glb:    Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string }> = []
    const sph:    Array<{ entityId: string; name: string; floor: 1|2|3; x: number; z: number }> = []
    const sen:    Array<{ entityId: string; name: string; floor: 1|2|3; x: number; z: number; deviceClass: string }> = []
    const senGlb: Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string; deviceClass: string; pos?: [number, number] }> = []

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
      }
    })
    return { glbLights: glb, sphereLights: sph, sensorMarkers: sen, sensorGlbMeshes: senGlb }
  }, [states, mappings])

  useEffect(() => { statesRef.current    = states         }, [states])
  useEffect(() => { glbLightsRef.current = glbLights      }, [glbLights])
  useEffect(() => { senGlbRef.current    = sensorGlbMeshes }, [sensorGlbMeshes])

  // ── Init Three.js via hook ───────────────────────────────────────────────
  const sceneHandle = useThreeScene(containerRef, (t) => {
    glbRefs.current.forEach(({ mesh, ptLight, origColor }, eid) => {
      const st  = statesRef.current.get(eid)
      const on  = st?.state === 'on'
      const b   = ((st?.attributes?.brightness as number) ?? 255) / 255
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (on) {
          const p = 0.95 + 0.05 * Math.sin(t * 2.5)
          mat.emissive.set(1, 0.98, 0.8); mat.emissiveIntensity = p * b * 20
          mat.color.set(1, 1, 1);         ptLight.intensity = b * 25 * p
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
          const p = 0.9 + 0.1 * Math.sin(t * 2.8)
          bM.emissiveIntensity = p * b * 15; bM.opacity = 1
          gM.opacity = 0.2 + 0.1 * Math.sin(t * 2.8); gM.emissiveIntensity = p * b * 5
          ptLight.intensity = b * 20 * p
        } else {
          bM.emissiveIntensity = 0.15; bM.opacity = 0.55
          gM.opacity = 0.08; gM.emissiveIntensity = 0.05; ptLight.intensity = 0
        }
    })
    senGlbRefs.current.forEach(({ doorObj, deviceClass }, eid) => {
      const open = statesRef.current.get(eid)?.state === 'on'
      if (deviceClass === 'garage_door' || deviceClass === 'curtain' || deviceClass === 'blind') {
        const clipPlane = doorObj.userData.clipPlane as THREE.Plane | undefined
        if (clipPlane) {
          const wBot: number = doorObj.userData.worldBottomY
          const wTop: number = doorObj.userData.worldTopY
          const height = wTop - wBot
          const openTarget = wBot + height * 0.9
          const target = open ? -openTarget : -(wBot - height)
          const step = height * 0.018
          const diff = target - clipPlane.constant
          clipPlane.constant = Math.abs(diff) < step ? target : clipPlane.constant + Math.sign(diff) * step
        }
      } else {
        const targetRotZ = open ? doorObj.userData.origRotZ + (75 * Math.PI / 180) : doorObj.userData.origRotZ
        doorObj.rotation.z = THREE.MathUtils.lerp(doorObj.rotation.z, targetRotZ, 0.03)
      }
    })
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
  })

  useEffect(() => {
    const h = sceneHandle.current
    if (!h) return
    sceneRef.current = h.scene
    cameraRef.current = h.camera
    rendererRef.current = h.renderer
    controlsRef.current = h.controls
  }, [sceneHandle])

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
    if (glbModelRef.current) scene.remove(glbModelRef.current)
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

  // ── Wire GLB light meshes for late-arriving entities ────────────────────
  useEffect(() => {
    const model = glbModelRef.current
    if (!model) return
    const floorGlbLights = glbLights.filter(l => l.floor === floor)
    model.traverse(child => {
      const m = child as THREE.Mesh; if (!m.isMesh) return
      const lcfg = floorGlbLights.find(l => l.meshName === (m.name || m.userData.meshName || ''))
      if (!lcfg || m.userData.entityId) return
      if (glbRefs.current.has(lcfg.entityId)) return
      const mat = (m.material as THREE.MeshStandardMaterial).clone()
      m.material = mat; m.updateWorldMatrix(true, false)
      const wp = new THREE.Vector3(); m.getWorldPosition(wp)
      const pl = new THREE.PointLight(new THREE.Color(1, 0.92, 0.7), 0, 12, 1.4)
      pl.position.copy(wp); sceneRef.current?.add(pl)
      m.userData.entityId = lcfg.entityId
      glbRefs.current.set(lcfg.entityId, { mesh: m, ptLight: pl, origColor: mat.color.clone() })
      if (!clickables.current.includes(m)) clickables.current.push(m)
    })
  }, [glbLights, floor])

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

  // ── Click detection via hook ─────────────────────────────────────────────
  const { onPointerDown, onPointerMove, onPointerUp } = useSceneClick(
    containerRef,
    () => cameraRef.current,
    () => clickables.current,
    (result) => {
      // Look up mesh name from entityId (for mapped meshes) or from hit
      let meshName = result.meshName
      if (!meshName && result.entityId) {
        for (const [m, v] of Object.entries(mappings)) {
          const e = typeof v === 'string' ? v : v.entity
          if (e === result.entityId) { meshName = m; break }
        }
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
          const newState = st?.state === 'on' ? 'off' : 'on'
          statesRef.current = new Map(statesRef.current).set(result.entityId, { ...st!, state: newState })
          setLocalRev(n => n + 1)
          haSetState(result.entityId, newState)
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
  const SET_TOKEN = '4e850946782c1e214827ba1ed5b18f33dcaca0182b8c13f66bd823b3b42fabce'
  const haSetState = async (eid: string, state: string, attrs?: Record<string, unknown>) => {
    const cur = getState(eid)
    try {
      const r = await fetch(`/api/states/${eid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SET_TOKEN}` },
        body: JSON.stringify({ state, attributes: { ...cur?.attributes, ...attrs } }),
      })
      if (!r.ok) toast('Failed to set state', 'error')
    } catch { toast('Network error', 'error') }
  }

  const selBrightPct = selState?.attributes?.brightness != null
    ? Math.round(((selState.attributes.brightness as number) / 255) * 100) : 100
  const toggle = () => {
    if (!selectedId) return
    const newState = selOn ? 'off' : 'on'
    statesRef.current = new Map(statesRef.current).set(selectedId, { ...selState!, state: newState })
    setLocalRev(n => n + 1)
    haSetState(selectedId, newState)
  }
  const setBright = (pct: number) => {
    if (!selectedId) return
    haSetState(selectedId, 'on', { brightness: Math.round(pct / 100 * 255) })
  }

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
        <label className="ios-toggle" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selOn ?? false} onChange={toggle} />
          <span className="ios-slider" />
        </label>
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
          onPick={(mesh, eid, next, beh) => { setMappings(next); setBehaviors(beh); saveMappings(next, beh) }}
          onDelete={(next, beh) => { setMappings(next); setBehaviors(beh); saveMappings(next, beh) }}
          onSaveMappings={() => { if (token) { saveMappings(mappings, behaviors); toast('Saved', 'success') } }}
        />
      )}

      <div className="fp-canvas" ref={containerRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: 6 }}>
          {['1', '2', '3', '4', '5'].map(id => (
            <button key={id} className={`fp-floor-btn${String(floor) === id ? ' active' : ''}`}
              onClick={() => { setFloor(Number(id) as any); setSelectedId(null) }}
              style={{ display: floorNames[id] ? undefined : 'none' }}>
              {floorNames[id] || id}
            </button>
          ))}
        </div>
      </div>

      {glbLoading && <div className="fp-glb-badge"><div className="fp-spinner-sm" /> Loading model…</div>}
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


