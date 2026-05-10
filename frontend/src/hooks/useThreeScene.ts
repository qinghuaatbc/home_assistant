import { useRef, useEffect, RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface SceneHandle {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
}

export function useThreeScene(
  containerRef: RefObject<HTMLDivElement | null>,
  onAnimate: (time: number) => void,
) {
  const handleRef = useRef<SceneHandle | null>(null)
  const animRef = useRef(0)
  const clockRef = useRef(new THREE.Clock())

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(Math.max(el.clientWidth, 100), Math.max(el.clientHeight, 100))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.localClippingEnabled = true
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x2a2a4e)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x111122, 0.4))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(8, 18, 10)
    dir.castShadow = true
    dir.shadow.mapSize.setScalar(1024)
    scene.add(dir)

    const camera = new THREE.PerspectiveCamera(48, el.clientWidth / el.clientHeight, 0.1, 200)
    camera.position.set(0, 14, 13)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.target.set(0, 1, 0)
    controls.minDistance = 2
    controls.maxDistance = 60
    controls.maxPolarAngle = Math.PI / 2.05
    controls.update()

    const handle: SceneHandle = { renderer, scene, camera, controls }
    handleRef.current = handle

    let prevH = el.clientHeight
    const onResize = () => {
      const w = Math.max(el.clientWidth, 100)
      const h = Math.max(el.clientHeight, 100)
      // Ignore drastic height changes (>20%) — likely mobile keyboard open/close
      if (Math.abs(h - prevH) / prevH > 0.2 && Math.abs(w - prevH) < 50) return
      prevH = h
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    const animate = () => {
      animRef.current = requestAnimationFrame(animate)
      controls.update()
      onAnimate(clockRef.current.getElapsedTime())
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      el.removeChild(renderer.domElement)
      handleRef.current = null
    }
  }, [])

  return handleRef
}
