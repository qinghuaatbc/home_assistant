import { useRef, useEffect, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { HaState, Mappings, FloorId } from '../types'

const FW = 19, FD = 14, WH = 2.8, WT = 0.15, BR = 0.35, SR = 0.28

function buildFallback(floor: FloorId): THREE.Group {
  const g = new THREE.Group()
  const fM = new THREE.MeshStandardMaterial({ color: 0xa8b8cc, roughness: 0.6, metalness: 0.05 })
  const wM = new THREE.MeshStandardMaterial({ color: 0xb8c8dc, roughness: 0.55, metalness: 0.05 })
  const box = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m)
  }
  box(fM, 0, -0.06, 0, FW, 0.12, FD)
  const hy = WH / 2
  box(wM, 0, hy, -FD / 2, FW, WH, WT); box(wM, 0, hy, FD / 2, FW, WH, WT)
  box(wM, -FW / 2, hy, 0, WT, WH, FD); box(wM, FW / 2, hy, 0, WT, WH, FD)
  if (floor === 1) box(new THREE.MeshStandardMaterial({ color: 0x7888a0, roughness: 0.55 }), 0, hy, 0, WT, WH, FD)
  const grid = new THREE.GridHelper(FW, 19, 0x8899bb, 0x7788aa)
  grid.position.y = 0.01; g.add(grid)
  return g
}

function makeSphere(x: number, z: number, entityId: string, scene: THREE.Scene) {
  const by = WH + 0.35
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(BR, 20, 20),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 0.88, 0.35), emissive: new THREE.Color(1, 0.72, 0.15), emissiveIntensity: 0.05, transparent: true, opacity: 0.3, roughness: 0.05 }),
  )
  bulb.position.set(x, by, z); bulb.userData.entityId = entityId; scene.add(bulb)
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(BR * 1.9, 20, 20),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 0.88, 0.35), emissive: new THREE.Color(1, 0.72, 0.15), transparent: true, opacity: 0.04, depthWrite: false, side: THREE.BackSide }),
  )
  glow.position.set(x, by, z); scene.add(glow)
  const pl = new THREE.PointLight(new THREE.Color(1, 0.88, 0.35), 0, 9, 1.6)
  pl.position.set(x, by, z); scene.add(pl)
  return { bulb, glow, ptLight: pl }
}

function makeSensorMarker(x: number, z: number, entityId: string, deviceClass: string, scene: THREE.Scene) {
  const isCurtain = deviceClass === 'curtain' || deviceClass === 'blind'
  const isDoor = deviceClass === 'door' || deviceClass === 'garage_door'
  const by = isCurtain ? WH / 2 : WH * 0.55
  const geo = isCurtain
    ? new THREE.BoxGeometry(SR * 4, WH, SR * 0.15)
    : isDoor ? new THREE.BoxGeometry(SR * 1.6, SR * 2.2, SR * 0.4) : new THREE.BoxGeometry(SR * 2.2, SR * 0.8, SR * 0.4)
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.15, 0.9, 0.35), emissive: new THREE.Color(0.05, 0.5, 0.1), emissiveIntensity: 0.4, transparent: true, opacity: 0.85, roughness: 0.2 })
  const marker = new THREE.Mesh(geo, mat)
  marker.position.set(x, by, z); marker.userData.entityId = entityId; scene.add(marker)
  let clipPlane: THREE.Plane | undefined
  if (isCurtain) {
    const worldBottomY = by - WH / 2, worldTopY = by + WH / 2
    clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(worldBottomY - 0.01))
    mat.clippingPlanes = [clipPlane]
    marker.userData.worldBottomY = worldBottomY; marker.userData.worldTopY = worldTopY
  }
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(SR * 1.4, 16, 16),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.1, 1, 0.3), transparent: true, opacity: 0.06, depthWrite: false, side: THREE.BackSide }),
  )
  glow.position.set(x, by, z); scene.add(glow)
  const pl = new THREE.PointLight(new THREE.Color(0.2, 1, 0.4), 0, 5, 2)
  pl.position.set(x, by, z); scene.add(pl)
  return { marker, glow, ptLight: pl, deviceClass, clipPlane }
}

export interface SceneContent {
  clickables: React.MutableRefObject<THREE.Mesh[]>
  meshNames: string[]
  onAnimate: (t: number) => void
  updateVisuals: () => void
}

interface Props {
  getScene: () => THREE.Scene | null
  getCamera: () => THREE.PerspectiveCamera | null
  getControls: () => any | null
  getRenderer: () => THREE.WebGLRenderer | null
  floor: FloorId
  statesRef: React.MutableRefObject<Map<string, HaState>>
  activeBehaviors: Set<string> | null
  getBehavior: (eid: string) => string
  glbLights: Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string }>
  sphereLights: Array<{ entityId: string; name: string; floor: 1|2|3; x: number; z: number }>
  sensorMarkers: Array<{ entityId: string; name: string; floor: 1|2|3; x: number; z: number; deviceClass: string }>
  sensorGlbMeshes: Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string; deviceClass: string; pos?: [number, number] }>
  mediaGlbMeshes: Array<{ entityId: string; name: string; floor: 1|2|3; meshName: string }>
  glbLoading: boolean
  glbLoaded: boolean
  glbError: boolean
  onGlbStart: () => void
  onGlbSuccess: () => void
  onGlbError: () => void
  onMeshNames: (names: string[]) => void
}

export function useSceneContent(p: Props) {
  const fallbackRef = useRef<THREE.Group | null>(null)
  const glbModelRef = useRef<THREE.Group | null>(null)
  const glbRefs = useRef(new Map<string, { mesh: THREE.Mesh; ptLight: THREE.PointLight; origColor: THREE.Color }>())
  const sphRefs = useRef(new Map<string, { bulb: THREE.Mesh; glow: THREE.Mesh; ptLight: THREE.PointLight }>())
  const senRefs = useRef(new Map<string, { marker: THREE.Mesh; glow: THREE.Mesh; ptLight: THREE.PointLight; deviceClass: string; clipPlane?: THREE.Plane }>())
  const senGlbRefs = useRef(new Map<string, { meshes: THREE.Mesh[]; ptLight: THREE.PointLight; origColors: THREE.Color[]; doorObj: THREE.Object3D; origRotY: number; deviceClass: string; origPosY: number; behavior?: string }>())
  const clickables = useRef<THREE.Mesh[]>([])
  const addedSphIds = useRef(new Set<string>())
  const addedSenIds = useRef(new Set<string>())
  const glbLightsRef = useRef(p.glbLights)
  const senGlbRef = useRef(p.sensorGlbMeshes)
  const mediaGlbRefs = useRef(new Map<string, { mesh: THREE.Mesh; origScale: THREE.Vector3; bars: THREE.Mesh[] }>())
  const clickRings = useRef(new Map<string, THREE.Mesh>())

  function addClickRing(eid: string, pos: THREE.Vector3, scene: THREE.Scene) {
    if (clickRings.current.has(eid)) return
    const geom = new THREE.TorusGeometry(0.25, 0.04, 12, 20)
    const mat = new THREE.MeshBasicMaterial({ color: 0x4d8fff, transparent: true, opacity: 0 })
    const ring = new THREE.Mesh(geom, mat)
    ring.position.copy(pos); ring.position.y += 0.2
    ring.visible = false
    scene.add(ring)
    clickRings.current.set(eid, ring)
    // Also add to refs for sensor/door entities
  }

  useEffect(() => { glbLightsRef.current = p.glbLights }, [p.glbLights])
  useEffect(() => { senGlbRef.current = p.sensorGlbMeshes }, [p.sensorGlbMeshes])

  // ── Full scene rebuild on floor change ─────────────────────────────────
  useEffect(() => {
    const scene = p.getScene(); if (!scene) return
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
    p.onGlbStart()

    const fb = buildFallback(p.floor); scene.add(fb); fallbackRef.current = fb
    const cam1 = p.getCamera(); if (cam1) { cam1.position.set(0, 14, 13); cam1.lookAt(0, 0, 0) }
    const ctrl1 = p.getControls(); if (ctrl1) { ctrl1.target.set(0, 1, 0); ctrl1.update() }

    const targetFloor = p.floor
    new GLTFLoader().load(
      `/data/floors/floor${p.floor}.glb`,
      (gltf) => {
        if (targetFloor !== p.floor) return
        p.onGlbSuccess()
        const model = gltf.scene
        model.updateWorldMatrix(true, true)
        const box = new THREE.Box3().setFromObject(model)
        model.position.sub(box.getCenter(new THREE.Vector3())); model.position.y = 0
        const sz = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
        model.scale.setScalar(Math.min(FW / sz.x, FD / sz.z) * 0.92)
        scene.add(model)
        model.updateWorldMatrix(true, true)

        const floorGlbLights = glbLightsRef.current.filter(l => l.floor === p.floor)
        const floorSenGlb = senGlbRef.current.filter(s => s.floor === p.floor)
        const names: string[] = []
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
          addClickRing(lcfg.entityId, wp, scene)
        })
        floorSenGlb.forEach(cfg => {
          const doorObj = model.getObjectByName(cfg.meshName)
          if (!doorObj) {
            if (cfg.pos && !addedSenIds.current.has(cfg.entityId)) {
              addedSenIds.current.add(cfg.entityId)
              const refs = makeSensorMarker(cfg.pos[0], cfg.pos[1], cfg.entityId, cfg.deviceClass, scene)
              senRefs.current.set(cfg.entityId, refs)
              clickables.current.push(refs.marker)
            }
            return
          }
          const meshes: THREE.Mesh[] = []; const origColors: THREE.Color[] = []
          doorObj.traverse(child => {
            const m = child as THREE.Mesh; if (!m.isMesh) return
            const mat = (m.material as THREE.MeshStandardMaterial).clone()
            m.material = mat; m.userData.entityId = cfg.entityId
            meshes.push(m); origColors.push(mat.color.clone())
            clickables.current.push(m)
          })
          if (meshes.length === 0) return
          const pl = new THREE.PointLight(0xffffff, 0, 1, 1)
          doorObj.userData.origRotZ = doorObj.rotation.z
          const origPosY = doorObj.position.y
          if (cfg.deviceClass === 'garage_door' || cfg.deviceClass === 'curtain' || cfg.deviceClass === 'blind') {
            const b = new THREE.Box3().setFromObject(doorObj)
            const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(b.min.y - 0.01))
            doorObj.userData.clipPlane = clipPlane; doorObj.userData.worldBottomY = b.min.y; doorObj.userData.worldTopY = b.max.y
            meshes.forEach(m => { (m.material as THREE.MeshStandardMaterial).clippingPlanes = [clipPlane] })
          }
          senGlbRefs.current.set(cfg.entityId, { meshes, ptLight: pl, origColors, doorObj, origRotY: doorObj.rotation.y, deviceClass: cfg.deviceClass, origPosY, behavior: p.getBehavior(cfg.entityId) })
        })
        // Process media player meshes
        const floorMedia = p.mediaGlbMeshes.filter(l => l.floor === p.floor)
        model.traverse(child => {
          const m = child as THREE.Mesh; if (!m.isMesh) return
          const mcfg = floorMedia.find(l => l.meshName === child.name)
          if (!mcfg) return
          if (mediaGlbRefs.current.has(mcfg.entityId)) return
          m.userData.entityId = mcfg.entityId
          const origScale = m.scale.clone()
          // Create frequency bars
          const bars: THREE.Mesh[] = []
          const bb = new THREE.Box3().setFromObject(m)
          const cx = (bb.min.x + bb.max.x) / 2, cz = bb.max.z + 0.6, cy = bb.min.y
          for (let i = 0; i < 9; i++) {
            const bw = 0.1, bh = 0.15 + i * 0.06
            const barMat = new THREE.MeshStandardMaterial({ color: 0x4d8fff, emissive: 0x4d8fff, emissiveIntensity: 0, transparent: true, opacity: 0 })
            const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), barMat)
            bar.position.set(cx + (i - 4) * 0.14, cy + bh / 2, cz)
            bar.userData.baseH = bh
            bar.userData.phase = Math.random() * 10
            bar.userData.speed = 3 + Math.random() * 3
            bar.visible = false
            scene.add(bar); bars.push(bar)
          }
          mediaGlbRefs.current.set(mcfg.entityId, { mesh: m, origScale, bars })
          clickables.current.push(m)
          addClickRing(mcfg.entityId, new THREE.Vector3().copy(m.position), scene)
        })
        p.onMeshNames(names.filter((v, i, a) => a.indexOf(v) === i))
        glbModelRef.current = model
        model.traverse(child => {
          const m = child as THREE.Mesh; if (!m.isMesh) return
          const meshName = m.name || (m.parent?.name || '')
          if (!meshName) return
          if (!clickables.current.includes(m)) { m.userData.meshName = meshName; clickables.current.push(m) }
        })
        if (fallbackRef.current) fallbackRef.current.visible = false
        const sz2 = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
        const d = Math.max(sz2.x, sz2.z)
        const cam2 = p.getCamera(); if (cam2) { cam2.position.set(0, d * 0.9, d * 0.75); cam2.lookAt(0, 0, 0) }
        const ctrl2 = p.getControls(); if (ctrl2) { ctrl2.target.set(0, 0, 0); ctrl2.update() }
      },
      undefined,
      () => p.onGlbError(),
    )
  }, [p.floor])

  // ── Late-arriving entities ────────────────────────────────────────────────
  useEffect(() => {
    const scene = p.getScene(); const model = glbModelRef.current; if (!scene || !model) return
    p.sensorGlbMeshes.filter(s => s.floor === p.floor && !senGlbRefs.current.has(s.entityId) && !senRefs.current.has(s.entityId)).forEach(cfg => {
      const doorObj = model.getObjectByName(cfg.meshName)
      if (!doorObj) {
        if (cfg.pos && !addedSenIds.current.has(cfg.entityId)) {
          addedSenIds.current.add(cfg.entityId)
          const refs = makeSensorMarker(cfg.pos[0], cfg.pos[1], cfg.entityId, cfg.deviceClass, scene!)
          senRefs.current.set(cfg.entityId, refs); clickables.current.push(refs.marker)
        }
        return
      }
      const meshes: THREE.Mesh[] = []; const origColors: THREE.Color[] = []
      doorObj.traverse(child => {
        const m = child as THREE.Mesh; if (!m.isMesh) return
        const mat = (m.material as THREE.MeshStandardMaterial).clone(); m.material = mat
        m.userData.entityId = cfg.entityId; meshes.push(m); origColors.push(mat.color.clone())
        clickables.current.push(m)
      })
      if (meshes.length === 0) return
      const pl = new THREE.PointLight(0xffffff, 0, 1, 1)
      doorObj.userData.origRotZ = doorObj.userData.origRotZ ?? doorObj.rotation.z
      const origPosY = doorObj.position.y
      if (cfg.deviceClass === 'garage_door' || cfg.deviceClass === 'curtain' || cfg.deviceClass === 'blind') {
        const b = new THREE.Box3().setFromObject(doorObj)
        const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(b.min.y - 0.01))
        doorObj.userData.clipPlane = clipPlane; doorObj.userData.worldBottomY = b.min.y; doorObj.userData.worldTopY = b.max.y
        meshes.forEach(m => { (m.material as THREE.MeshStandardMaterial).clippingPlanes = [clipPlane] })
      }
      senGlbRefs.current.set(cfg.entityId, { meshes, ptLight: pl, origColors, doorObj, origRotY: doorObj.rotation.y, deviceClass: cfg.deviceClass, origPosY, behavior: p.getBehavior(cfg.entityId) })
    })
  }, [p.sensorGlbMeshes, p.floor])

  useEffect(() => {
    const model = glbModelRef.current; if (!model) return
    const floorGlbLights = p.glbLights.filter(l => l.floor === p.floor)
    model.traverse(child => {
      const m = child as THREE.Mesh; if (!m.isMesh) return
      const lcfg = floorGlbLights.find(l => l.meshName === (m.name || m.userData.meshName || ''))
      if (!lcfg || m.userData.entityId) return
      if (glbRefs.current.has(lcfg.entityId)) return
      const mat = (m.material as THREE.MeshStandardMaterial).clone(); m.material = mat
      m.updateWorldMatrix(true, false)
      const wp = new THREE.Vector3(); m.getWorldPosition(wp)
      const pl = new THREE.PointLight(new THREE.Color(1, 0.92, 0.7), 0, 12, 1.4)
      pl.position.copy(wp); p.getScene()?.add(pl)
      m.userData.entityId = lcfg.entityId
      glbRefs.current.set(lcfg.entityId, { mesh: m, ptLight: pl, origColor: mat.color.clone() })
      if (!clickables.current.includes(m)) clickables.current.push(m)
      const scene2 = p.getScene(); if (scene2) addClickRing(lcfg.entityId, wp, scene2)
    })
  }, [p.glbLights, p.floor])

  useEffect(() => {
    const scene = p.getScene(); if (!scene) return
    p.sphereLights.filter(l => l.floor === p.floor).forEach(cfg => {
      if (addedSphIds.current.has(cfg.entityId)) return
      addedSphIds.current.add(cfg.entityId)
      const refs = makeSphere(cfg.x, cfg.z, cfg.entityId, scene)
      sphRefs.current.set(cfg.entityId, refs)
      clickables.current.push(refs.bulb)
    })
  }, [p.sphereLights, p.floor])

  useEffect(() => {
    const scene = p.getScene(); if (!scene) return
    p.sensorMarkers.filter(s => s.floor === p.floor).forEach(cfg => {
      if (addedSenIds.current.has(cfg.entityId)) return
      addedSenIds.current.add(cfg.entityId)
      const refs = makeSensorMarker(cfg.x, cfg.z, cfg.entityId, cfg.deviceClass, scene)
      senRefs.current.set(cfg.entityId, refs)
      clickables.current.push(refs.marker)
    })
  }, [p.sensorMarkers, p.floor])

  // ── Late-arriving media GLB entities ────────────────────────────────────
  useEffect(() => {
    const model = glbModelRef.current
    if (!model) { // retry when GLB loads
      const t = setTimeout(() => {
        const m2 = glbModelRef.current
        if (!m2) return
        processMedia(m2)
      }, 500)
      return () => clearTimeout(t)
    }
    processMedia(model)
    function processMedia(mdl: THREE.Group) {
      const floorMedia = p.mediaGlbMeshes.filter(l => l.floor === p.floor)
      mdl.traverse(child => {
        const m = child as THREE.Mesh; if (!m.isMesh) return
        const mcfg = floorMedia.find(l => l.meshName === child.name)
        if (!mcfg) return
        if (mediaGlbRefs.current.has(mcfg.entityId)) return
        m.userData.entityId = mcfg.entityId
        const origScale = m.scale.clone()
        const bars: THREE.Mesh[] = []
        const bb = new THREE.Box3().setFromObject(m)
        const cx = (bb.min.x + bb.max.x) / 2, cz = bb.max.z + 0.6, cy = bb.min.y
        for (let i = 0; i < 9; i++) {
          const bw = 0.1, bh = 0.15 + i * 0.06
          const barMat = new THREE.MeshStandardMaterial({ color: 0x4d8fff, emissive: 0x4d8fff, emissiveIntensity: 0, transparent: true, opacity: 0 })
          const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), barMat)
          bar.position.set(cx + (i - 4) * 0.14, cy + bh / 2, cz)
          bar.userData.baseH = bh; bar.userData.phase = Math.random() * 10; bar.userData.speed = 3 + Math.random() * 3
          bar.visible = false
          p.getScene()?.add(bar); bars.push(bar)
        }
        mediaGlbRefs.current.set(mcfg.entityId, { mesh: m, origScale, bars })
        if (!clickables.current.includes(m)) clickables.current.push(m)
        const scene3 = p.getScene(); if (scene3) addClickRing(mcfg.entityId, new THREE.Vector3().copy(m.position), scene3)
      })
    }
  }, [p.mediaGlbMeshes, p.floor, p.glbLoaded])

  // ── Behavior filter: hide non-matching devices (except doors/windows) ──
  useEffect(() => {
    const showAll = !p.activeBehaviors || p.activeBehaviors.size === 0
    const setVis = (eid: string, objs: THREE.Object3D[]) => {
      let match = showAll
      if (!match) {
        const dc = p.statesRef.current.get(eid)?.attributes?.device_class as string | undefined
        if (eid.startsWith('light.')) match = p.activeBehaviors!.has('light')
        else if (eid.startsWith('media_player.')) match = p.activeBehaviors!.has('media_player')
        else if (eid.startsWith('switch.')) match = p.activeBehaviors!.has('switch')
        else if (dc === 'garage_door' || dc === 'garage') match = p.activeBehaviors!.has('garage_door')
        else if (dc === 'curtain' || dc === 'blind') match = p.activeBehaviors!.has('curtain')
        else if (dc === 'door' || dc === 'window') match = true
        else if (eid.startsWith('binary_sensor.') && dc === 'door') match = true // door_r/door_s always visible
      }
      objs.forEach(o => { o.visible = match })
    }
    glbRefs.current.forEach(({ mesh, ptLight }, eid) => { const m = glbRefs.current.get(eid); if (m) setVis(eid, [m.mesh, m.ptLight]) })
    sphRefs.current.forEach(({ bulb, glow, ptLight }, eid) => setVis(eid, [bulb, glow, ptLight]))
    senRefs.current.forEach(({ marker, glow, ptLight }, eid) => setVis(eid, [marker, glow, ptLight]))
    senGlbRefs.current.forEach(({ meshes, ptLight }, eid) => setVis(eid, [...meshes, ptLight]))
    mediaGlbRefs.current.forEach(({ mesh, bars }, eid) => setVis(eid, [mesh, ...bars]))
    // Click indicators: show rings on filterable devices when filter active
    const allShown = !p.activeBehaviors || p.activeBehaviors.size === 0
    clickRings.current.forEach((ring, eid) => {
      if (allShown) { ring.visible = false; return }
      const st = p.statesRef.current.get(eid); if (!st) { ring.visible = false; return }
      const dc = st.attributes?.device_class as string | undefined
      let match = false
      if (eid.startsWith('light.')) match = p.activeBehaviors!.has('light')
      else if (eid.startsWith('media_player.')) match = p.activeBehaviors!.has('media_player')
      else if (eid.startsWith('switch.')) match = p.activeBehaviors!.has('switch')
      else if (dc === 'garage_door' || dc === 'garage') match = p.activeBehaviors!.has('garage_door')
      else if (dc === 'curtain' || dc === 'blind') match = p.activeBehaviors!.has('curtain')
      else if (dc === 'door') match = true // doors always clickable
      ring.visible = match
    })
  }, [p.activeBehaviors])

  // ── Per-frame: smooth door/curtain animation ──────────────────────────
  const onAnimate = useCallback((t: number) => {
    senGlbRefs.current.forEach(({ doorObj, deviceClass, behavior }, eid) => {
      const s = p.statesRef.current.get(eid)?.state; const open = s === 'on' || s === 'open'
      if (deviceClass === 'garage_door' || deviceClass === 'curtain' || deviceClass === 'blind') {
        const cp = doorObj.userData.clipPlane as THREE.Plane | undefined
        if (cp) {
          const wBot: number = doorObj.userData.worldBottomY; const wTop: number = doorObj.userData.worldTopY
          const height = wTop - wBot; const openTarget = wBot + height * 0.9
          const target = open ? -openTarget : -(wBot - height); const step = height * 0.018
          const diff = target - cp.constant; cp.constant = Math.abs(diff) < step ? target : cp.constant + Math.sign(diff) * step
        }
      } else if (behavior === 'door_s') {
        // Sliding door: translate along Z
        const origZ = (doorObj.userData.origSlideZ as number) ?? doorObj.position.z
        if (!doorObj.userData.origSlideZ) doorObj.userData.origSlideZ = doorObj.position.z
        const targetZ = open ? origZ - 0.6 : origZ
        doorObj.position.z = THREE.MathUtils.lerp(doorObj.position.z, targetZ, 0.03)
      } else {
        // Rotation door (door_r): rotate along Z
        const targetRotZ = open ? doorObj.userData.origRotZ + (75 * Math.PI / 180) : doorObj.userData.origRotZ
        doorObj.rotation.z = THREE.MathUtils.lerp(doorObj.rotation.z, targetRotZ, 0.03)
      }
    })
    senRefs.current.forEach(({ marker, glow, ptLight, deviceClass, clipPlane }, eid) => {
      const st = p.statesRef.current.get(eid); const open = st?.state === 'on'
      const mM = marker.material as THREE.MeshStandardMaterial; const gM = glow.material as THREE.MeshStandardMaterial
      if ((deviceClass === 'curtain' || deviceClass === 'blind') && clipPlane) {
        const wBot: number = marker.userData.worldBottomY; const wTop: number = marker.userData.worldTopY
        const height = wTop - wBot; const openTarget = wBot + height * 0.9
        const target = open ? -openTarget : -(wBot - height); const step = height * 0.018
        const diff = target - clipPlane.constant; clipPlane.constant = Math.abs(diff) < step ? target : clipPlane.constant + Math.sign(diff) * step
      }
    })
    // Media player: pulsing scale + shake + frequency bars
    mediaGlbRefs.current.forEach(({ mesh, origScale, bars }, eid) => {
      if (!mesh.visible) return // hidden by behavior filter
      const st = p.statesRef.current.get(eid)
      const on = st?.state === 'on'
      if (on) {
        const pulse = 1 + 0.06 * Math.sin(t * 4)
        mesh.scale.set(origScale.x * pulse, origScale.y * pulse, origScale.z * 0.95 + 0.05 * Math.sin(t * 3))
        mesh.position.x += Math.sin(t * 5) * 0.003
        bars.forEach((bar) => {
          const baseH = bar.userData.baseH as number
          const phase = bar.userData.phase as number
          const speed = bar.userData.speed as number
          const val = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * speed + phase))
          bar.scale.y = val
          bar.visible = true
          const mat = bar.material as THREE.MeshStandardMaterial
          mat.opacity = 0.5 + 0.5 * val
          mat.emissiveIntensity = 0.2 + 0.8 * val
        })
      } else {
        mesh.scale.copy(origScale)
        bars.forEach(bar => {
          bar.visible = false
          bar.scale.y = 1
          const mat = bar.material as THREE.MeshStandardMaterial
          mat.emissiveIntensity = 0
        })
      }
    })
    // Click indicator rings: pulse on visible items
    clickRings.current.forEach((ring, eid) => {
      if (!ring.visible) return
      const s = 1 + 0.1 * Math.sin(t * 3)
      ring.scale.set(s, s, 1)
      ring.rotation.z = t * 0.4
      const mat = ring.material as THREE.MeshBasicMaterial
      mat.opacity = 0.35 + 0.15 * Math.sin(t * 3)
    })
  }, [])
  const updateVisuals = useCallback(() => {
    glbRefs.current.forEach(({ mesh, ptLight, origColor }, eid) => {
      const st = p.statesRef.current.get(eid); if (!st) return
      const on = st.state === 'on'; const b = ((st.attributes?.brightness as number) ?? 255) / 255
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (on) { mat.emissive.set(1, 0.98, 0.8); mat.emissiveIntensity = b * 20; mat.color.set(1, 1, 1); ptLight.intensity = b * 25 }
      else { mat.emissive.setScalar(0); mat.emissiveIntensity = 0; mat.color.copy(origColor); ptLight.intensity = 0 }
    })
    sphRefs.current.forEach(({ bulb, glow, ptLight }, eid) => {
      const st = p.statesRef.current.get(eid); if (!st) return
      const on = st.state === 'on'; const b = ((st.attributes?.brightness as number) ?? 255) / 255
      const bM = bulb.material as THREE.MeshStandardMaterial; const gM = glow.material as THREE.MeshStandardMaterial
      if (on) { bM.emissiveIntensity = b * 15; bM.opacity = 1; gM.opacity = 0.3; gM.emissiveIntensity = b * 5; ptLight.intensity = b * 20 }
      else { bM.emissiveIntensity = 0.15; bM.opacity = 0.55; gM.opacity = 0.08; gM.emissiveIntensity = 0.05; ptLight.intensity = 0 }
    })
    senRefs.current.forEach(({ marker, glow, ptLight, deviceClass, clipPlane }, eid) => {
      const st = p.statesRef.current.get(eid); if (!st) return
      const open = st.state === 'on'; const mM = marker.material as THREE.MeshStandardMaterial; const gM = glow.material as THREE.MeshStandardMaterial
      if ((deviceClass === 'curtain' || deviceClass === 'blind') && clipPlane) {
        mM.color.set(0.5, 0.75, 1); mM.emissive.set(0.1, 0.3, 0.8); mM.emissiveIntensity = 0.3; mM.opacity = 0.7
      } else if (open) {
        mM.color.set(1, 0.2, 0.1); mM.emissive.set(1, 0.1, 0.05); mM.emissiveIntensity = 1.5; mM.opacity = 1
        gM.color.set(1, 0.2, 0.1); gM.opacity = 0.2; ptLight.color.set(1, 0.15, 0.05); ptLight.intensity = 2
      } else {
        mM.color.set(0.15, 0.9, 0.35); mM.emissive.set(0.05, 0.5, 0.1); mM.emissiveIntensity = 0.4; mM.opacity = 0.85
        gM.color.set(0.1, 1, 0.3); gM.opacity = 0.06; ptLight.color.set(0.2, 1, 0.4); ptLight.intensity = 0
      }
    })
    mediaGlbRefs.current.forEach(({ mesh, origScale }, eid) => {
      const st = p.statesRef.current.get(eid); if (!st) return
      const on = st.state === 'on'
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (on) { mat.color.set(1, 1, 1); mat.emissive.set(0.3, 0.5, 1); mat.emissiveIntensity = 0.5 }
      else { mat.color.set(0.5, 0.5, 0.55); mat.emissive.setScalar(0); mat.emissiveIntensity = 0 }
    })
  }, [])

  return { clickables, onAnimate, updateVisuals }
}
