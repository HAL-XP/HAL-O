/**
 * SphereZzz — Floating "Zzz" particles rising from the sphere when HAL session is idle/stale.
 * Classic sleep visual: Z characters float upward, drift sideways, fade out.
 * Only visible when statusline data is stale (>30s since last update).
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

const Z_COUNT = 5
const RISE_SPEED = 0.4
const DRIFT_SPEED = 0.15
const CYCLE_DURATION = 4 // seconds per Z lifecycle

interface ZState {
  phase: number // 0-1 lifecycle
  x: number
  y: number
  z: number
  size: number
  drift: number
}

export function SphereZzz({ visible = false }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const zStates = useRef<ZState[]>(
    Array.from({ length: Z_COUNT }, (_, i) => ({
      phase: i / Z_COUNT, // stagger
      x: 0, y: 0, z: 0,
      size: 0.15 + Math.random() * 0.15,
      drift: (Math.random() - 0.5) * 2,
    }))
  )

  const colors = useMemo(() => [
    new THREE.Color('#00e5ff'),
    new THREE.Color('#00bcd4'),
    new THREE.Color('#0088aa'),
    new THREE.Color('#006688'),
    new THREE.Color('#004466'),
  ], [])

  useFrame((_, delta) => {
    if (!visible || !groupRef.current) return
    groupRef.current.visible = true

    const states = zStates.current
    for (let i = 0; i < Z_COUNT; i++) {
      const s = states[i]
      s.phase += delta / CYCLE_DURATION
      if (s.phase > 1) {
        s.phase -= 1
        s.drift = (Math.random() - 0.5) * 2
        s.size = 0.15 + Math.random() * 0.15
      }
      // Rise + drift
      s.x = s.drift * s.phase * DRIFT_SPEED * 3
      s.y = 2.0 + s.phase * RISE_SPEED * CYCLE_DURATION
      s.z = Math.sin(s.phase * Math.PI * 2 + i) * 0.3

      // Update mesh
      const child = groupRef.current.children[i] as any
      if (child) {
        child.position.set(s.x, s.y, s.z)
        const fadeIn = Math.min(1, s.phase * 4)
        const fadeOut = 1 - Math.pow(s.phase, 2)
        child.fillOpacity = fadeIn * fadeOut * 0.6
        child.fontSize = s.size * (0.8 + s.phase * 0.4) // grow as they rise
      }
    }
  })

  // Hide when not visible (useFrame won't update)
  useFrame(() => {
    if (!visible && groupRef.current) groupRef.current.visible = false
  })

  if (!visible) return null

  return (
    <group ref={groupRef} position={[0, 1.3, 0]}>
      {Array.from({ length: Z_COUNT }, (_, i) => (
        <Text
          key={i}
          fontSize={0.2}
          color={colors[i]}
          anchorX="center"
          anchorY="middle"
          fillOpacity={0}
          outlineWidth={0.005}
          outlineColor="#003344"
          font={undefined}
        >
          {i % 3 === 0 ? 'Z' : i % 3 === 1 ? 'z' : 'z'}
        </Text>
      ))}
    </group>
  )
}
