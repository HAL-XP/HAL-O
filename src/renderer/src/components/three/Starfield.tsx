import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import type { Group } from 'three'

export function Starfield() {
  const ref = useRef<Group>(null)

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.01
      ref.current.rotation.x += delta * 0.005
    }
  })

  return (
    <group ref={ref}>
      <Stars
        radius={300}
        depth={100}
        count={6000}
        factor={4}
        saturation={0}
        fade
        speed={0.5}
      />
    </group>
  )
}
