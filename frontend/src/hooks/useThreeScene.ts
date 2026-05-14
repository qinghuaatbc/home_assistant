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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(Math.max(el.clientWidth, 100), Math.max(el.clientHeight, 100))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.localClippingEnabled = true
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    // transparent background — theme layers show through the 3D canvas
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x111122, 0.5))
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

    let prevW = el.clientWidth
    let prevH = el.clientHeight
    let isPortrait = prevW < prevH

    // Rotate camera 90° around Y and scale distance to fit new viewport
    const adaptToOrientation = (toPortrait: boolean, w: number, h: number) => {
      const angle = toPortrait ? Math.PI / 2 : -Math.PI / 2
      const cos = Math.cos(angle), sin = Math.sin(angle)
      const { x, y, z } = camera.position
      camera.position.set(x * cos + z * sin, y, -x * sin + z * cos)
      // Scale distance: portrait viewport is narrower, need to zoom out
      // 1.8x multiplier: sqrt handles aspect ratio, extra factor pulls camera back
      const scale = Math.sqrt(Math.max(w, h) / Math.min(w, h)) * 1.8
      const factor = toPortrait ? scale : 1 / scale
      camera.position.multiplyScalar(factor)
      controls.update()
    }

    // If starting in portrait, adapt immediately
    if (isPortrait) adaptToOrientation(true, prevW, prevH)

    const onResize = () => {
      const w = Math.max(el.clientWidth, 100)
      const h = Math.max(el.clientHeight, 100)
      // Skip mobile keyboard open/close (height changes but width stays)
      const hChange = Math.abs(h - prevH) / Math.max(prevH, 1)
      const wChange = Math.abs(w - prevW) / Math.max(prevW, 1)
      if (hChange > 0.15 && wChange < 0.05) return

      const nowPortrait = w < h
      if (isPortrait !== nowPortrait) {
        adaptToOrientation(nowPortrait, w, h)
        isPortrait = nowPortrait
      }

      prevW = w
      prevH = h
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', () => setTimeout(onResize, 150))

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
      window.removeEventListener('orientationchange', onResize)
      renderer.dispose()
      el.removeChild(renderer.domElement)
      handleRef.current = null
    }
  }, [])

  return handleRef
}
