import { useCallback, RefObject } from 'react'
import * as THREE from 'three'

export interface ClickResult {
  entityId: string
  meshName: string
  object: THREE.Object3D
}

export function useSceneClick(
  containerRef: RefObject<HTMLDivElement | null>,
  getCamera: () => THREE.PerspectiveCamera | null,
  getClickables: () => THREE.Object3D[],
  onHit: (result: ClickResult) => void,
) {
  const isDragging = { current: false }
  const ptrDown = { x: 0, y: 0 }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = false
    ptrDown.x = e.clientX
    ptrDown.y = e.clientY
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const dx = e.clientX - ptrDown.x
    const dy = e.clientY - ptrDown.y
    if (Math.sqrt(dx * dx + dy * dy) > 5) isDragging.current = true
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (isDragging.current) return
    const el = containerRef.current
    const cam = getCamera()
    if (!el || !cam) return

    const rect = el.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(mouse, cam)
    const hits = ray.intersectObjects(getClickables(), false)
    if (hits.length > 0) {
      const obj = hits[0].object
      const entityId = obj.userData.entityId as string | undefined
      const meshName = (obj.name as string) || (obj.userData.meshName as string) || ''
      onHit({ entityId: entityId || '', meshName, object: obj })
    }
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp }
}
