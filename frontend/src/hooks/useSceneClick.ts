import { useRef, RefObject, useCallback } from 'react'
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
  const onHitRef = useRef(onHit)
  onHitRef.current = onHit

  const onClick = useCallback((e: React.MouseEvent) => {
    // Ignore drags — only process clicks
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
      onHitRef.current({ entityId: entityId || '', meshName, object: obj })
    }
  }, [])

  return { onClick }
}
