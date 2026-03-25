import { useEffect, useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useHa, HaState } from '../context/HaContext'

const FW = 19, FD = 14, WH = 2.8, WT = 0.15, BR = 0.22

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

export default function FloorPlanPage() {
  const { states, callService } = useHa()
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
  // entityId → { mesh, ptLight, origColor }
  const glbRefs  = useRef(new Map<string, { mesh: THREE.Mesh; ptLight: THREE.PointLight; origColor: THREE.Color }>())
  // entityId → { bulb, glow, ptLight }
  const sphRefs  = useRef(new Map<string, { bulb: THREE.Mesh; glow: THREE.Mesh; ptLight: THREE.PointLight }>())
  const clickables  = useRef<THREE.Mesh[]>([])
  const addedSphIds = useRef(new Set<string>())    // tracks which spheres are in the scene
  const glbLightsRef = useRef<Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string }>>([])

  const [floor, setFloor]           = useState<1 | 2 | 3>(1)
  const [glbLoading, setGlbLoading] = useState(false)
  const [glbLoaded,  setGlbLoaded]  = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Derive layout from state attributes (glb_floor/glb_mesh/glb_pos) ──────
  // These attributes are set by configuration.yaml → light integration → state machine.
  const { glbLights, sphereLights } = useMemo(() => {
    const glb: Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string }> = []
    const sph: Array<{ entityId: string; name: string; floor: 1|2|3; x: number; z: number }> = []
    states.forEach((st: HaState, entityId: string) => {
      if (!entityId.startsWith('light.')) return
      const a = st.attributes
      const f = a.glb_floor as number | undefined; if (!f) return
      const name = (a.friendly_name as string) ?? entityId
      if (a.glb_mesh)                    glb.push({ entityId, name, floor: f as 1|2|3, meshName: a.glb_mesh as string })
      else if (Array.isArray(a.glb_pos)) sph.push({ entityId, name, floor: f as 1|2|3, x: (a.glb_pos as number[])[0], z: (a.glb_pos as number[])[1] })
    })
    return { glbLights: glb, sphereLights: sph }
  }, [states])

  // Always keep refs current — animation loop and GLB callback read from refs
  useEffect(() => { statesRef.current    = states       }, [states])
  useEffect(() => { glbLightsRef.current = glbLights    }, [glbLights])

  // ── Init Three.js once ────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current; if (!el) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1
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
          bM.emissiveIntensity = 0.05; bM.opacity = 0.3
          gM.opacity = 0.04; gM.emissiveIntensity = 0; ptLight.intensity = 0
        }
      })

      controls.update(); renderer.render(scene, camera)
    }
    animate()

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h)
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(animFrame.current); ro.disconnect()
      renderer.dispose(); el.removeChild(renderer.domElement)
      rendererRef.current = null; sceneRef.current = null; cameraRef.current = null; controlsRef.current = null
    }
  }, [])

  // ── Full scene rebuild — runs ONLY when floor changes ─────────────────────
  useEffect(() => {
    const scene = sceneRef.current; if (!scene) return

    // Cleanup previous floor objects
    if (fallbackRef.current) { scene.remove(fallbackRef.current); fallbackRef.current = null }
    glbRefs.current.forEach(({ mesh, ptLight }) => { scene.remove(mesh); scene.remove(ptLight) })
    glbRefs.current.clear()
    sphRefs.current.forEach(({ bulb, glow, ptLight }) => { scene.remove(bulb); scene.remove(glow); scene.remove(ptLight) })
    sphRefs.current.clear()
    clickables.current = []
    addedSphIds.current.clear()
    setGlbLoaded(false); setGlbLoading(true)

    // Procedural fallback room
    const fb = buildFallback(floor); scene.add(fb); fallbackRef.current = fb

    // Sphere lights that are already known when floor loads
    // (reads from current ref — does NOT re-run this effect when states change)
    glbLightsRef.current  // just ensures ref is accessed, actual sphere add in next effect

    // Reset camera to default
    cameraRef.current!.position.set(0, 14, 13)
    cameraRef.current!.lookAt(0, 0, 0)
    controlsRef.current!.target.set(0, 1, 0); controlsRef.current!.update()

    // Load GLB — camera repositioned only once here, not on state changes
    const targetFloor = floor
    new GLTFLoader().load(
      `/floor${floor}.glb`,
      (gltf) => {
        if (targetFloor !== floor) return  // floor changed while loading, discard
        setGlbLoading(false); setGlbLoaded(true)
        const model = gltf.scene

        model.updateWorldMatrix(true, true)
        const box = new THREE.Box3().setFromObject(model)
        model.position.sub(box.getCenter(new THREE.Vector3())); model.position.y = 0
        const sz = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
        model.scale.setScalar(Math.min(FW / sz.x, FD / sz.z) * 0.92)
        scene.add(model)

        // Match mesh node names to glb_mesh values from configuration.yaml (via state attrs)
        const floorGlbLights = glbLightsRef.current.filter(l => l.floor === floor)
        model.traverse(child => {
          const m = child as THREE.Mesh; if (!m.isMesh) return
          m.castShadow = true; m.receiveShadow = true
          const cfg = floorGlbLights.find(l => l.meshName === child.name); if (!cfg) return
          const mat = (m.material as THREE.MeshStandardMaterial).clone()
          m.material = mat; m.updateWorldMatrix(true, false)
          const wp = new THREE.Vector3(); m.getWorldPosition(wp)
          const pl = new THREE.PointLight(new THREE.Color(1, 0.92, 0.7), 0, 12, 1.4)
          pl.position.copy(wp); scene.add(pl)
          m.userData.entityId = cfg.entityId
          glbRefs.current.set(cfg.entityId, { mesh: m, ptLight: pl, origColor: mat.color.clone() })
          clickables.current.push(m)
        })

        if (fallbackRef.current) fallbackRef.current.visible = false

        // Fit camera — happens once per GLB load, never again unless floor changes
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
  }, [floor])   // ← ONLY floor, never state changes

  // ── Add new sphere indicators when states arrive (without rebuilding scene) ─
  // Runs when sphereLights changes, but only ADDS new entities — never removes or reloads GLB.
  useEffect(() => {
    const scene = sceneRef.current; if (!scene) return
    sphereLights.filter(l => l.floor === floor).forEach(cfg => {
      if (addedSphIds.current.has(cfg.entityId)) return  // already in scene
      addedSphIds.current.add(cfg.entityId)
      const refs = makeSphere(cfg.x, cfg.z, cfg.entityId, scene)
      sphRefs.current.set(cfg.entityId, refs)
      clickables.current.push(refs.bulb)
    })
  }, [sphereLights, floor])

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
    const rect = el.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, cam)
    const hits = ray.intersectObjects(clickables.current, false)
    if (hits.length > 0) {
      const eid = hits[0].object.userData.entityId as string
      if (eid) {
        setSelectedId(eid)  // show popup
        const st = statesRef.current.get(eid)
        const turningOn = st?.state !== 'on'
        callService('light', turningOn ? 'turn_on' : 'turn_off', turningOn ? { brightness: 255 } : {}, eid)
      }
    } else setSelectedId(null)
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  const selState     = selectedId ? states.get(selectedId) : null
  const selOn        = selState?.state === 'on'
  const selBrightPct = selState?.attributes?.brightness != null
    ? Math.round(((selState.attributes.brightness as number) / 255) * 100) : 100
  const selName = selState ? (selState.attributes.friendly_name as string) ?? selectedId : ''
  const toggle    = () => selectedId && callService('light', selOn ? 'turn_off' : 'turn_on', {}, selectedId)
  const setBright = (pct: number) =>
    selectedId && callService('light', 'turn_on', { brightness: Math.round(pct / 100 * 255) }, selectedId)

  const legendLights = useMemo(() => [
    ...glbLights.filter(l => l.floor === floor).map(l => ({ ...l, isGlb: true  })),
    ...sphereLights.filter(l => l.floor === floor).map(l => ({ ...l, isGlb: false })),
  ], [glbLights, sphereLights, floor])

  return (
    <div className="fp-page">
      <div className="fp-header">
        <span className="fp-title">3D Floor Plan</span>
        <div className="fp-floor-btns">
          {([1, 2, 3] as const).map(f => (
            <button key={f} className={`fp-floor-btn${floor === f ? ' active' : ''}`}
              onClick={() => { setFloor(f); setSelectedId(null) }}>
              {f === 1 ? 'Main' : f === 2 ? 'Upper' : 'Basement'}
            </button>
          ))}
        </div>
      </div>

      <div className="fp-canvas" ref={containerRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />

      {glbLoading && <div className="fp-glb-badge"><div className="fp-spinner-sm" /> Loading model…</div>}
      {glbLoaded  && <div className="fp-glb-badge" style={{ color: 'rgba(48,209,88,0.8)' }}>● 3D model · click fixtures</div>}

      <div className="fp-legend">
        {legendLights.map(({ entityId, name, isGlb }) => {
          const on = states.get(entityId)?.state === 'on'
          return (
            <button key={entityId}
              className={`fp-legend-item${on ? ' on' : ''}${selectedId === entityId ? ' sel' : ''}`}
              onClick={() => setSelectedId(p => p === entityId ? null : entityId)}>
              <span className={`fp-dot${on ? ' on' : ''}${isGlb ? ' glb' : ''}`} />
              <span className="fp-legend-name">{name}</span>
              {isGlb && <span className="fp-legend-3d">3D</span>}
            </button>
          )
        })}
      </div>

      {selectedId && (
        <div className="fp-panel" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
          <div className="fp-panel-row">
            <span className="fp-panel-icon">💡</span>
            <div className="fp-panel-info">
              <div className="fp-panel-name">{selName}</div>
              <div className={`fp-panel-state${selOn ? ' on' : ''}`}>{selOn ? 'On' : 'Off'}</div>
            </div>
            <label className="ios-toggle" onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={selOn ?? false} onChange={toggle} />
              <span className="ios-slider" />
            </label>
            <button className="fp-close" onClick={() => setSelectedId(null)}>✕</button>
          </div>
          {selOn && (
            <div className="brightness-row" style={{ padding: '4px 4px 2px' }}>
              <span className="brightness-icon">☀</span>
              <input type="range" className="ios-range" min={1} max={100} value={selBrightPct}
                onChange={e => setBright(Number(e.target.value))} />
              <span className="fp-bright-val">{selBrightPct}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
