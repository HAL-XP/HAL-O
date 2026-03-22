import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function ArcRing({ radius, tubeRadius, arc, color, speed, tilt }: {
  radius: number
  tubeRadius: number
  arc: number
  color: string
  speed: number
  tilt: [number, number, number]
}) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.z += delta * speed
    }
  })

  return (
    <mesh ref={ref} rotation={tilt}>
      <torusGeometry args={[radius, tubeRadius, 16, 100, arc]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.6}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function TickRing({ radius, count, color }: {
  radius: number
  count: number
  color: string
}) {
  const ref = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.05
    }
  })

  const ticks = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const isMajor = i % 5 === 0
    return (
      <mesh key={i} position={[x, 0, z]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[0.02, isMajor ? 0.15 : 0.06, 0.005]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isMajor ? 0.7 : 0.3}
          toneMapped={false}
        />
      </mesh>
    )
  })

  return <group ref={ref}>{ticks}</group>
}

export function OrbitalRings() {
  const groupRef = useRef<THREE.Group>(null)

  // Read primary color
  const primaryHex = (() => {
    const style = getComputedStyle(document.documentElement)
    return style.getPropertyValue('--primary').trim() || '#84cc16'
  })()

  return (
    <group ref={groupRef} position={[0, 0.8, 0]} scale={0.35}>
      {/* Main orbital arcs */}
      <ArcRing
        radius={1.8}
        tubeRadius={0.008}
        arc={Math.PI * 1.2}
        color={primaryHex}
        speed={0.3}
        tilt={[0.3, 0, 0]}
      />
      <ArcRing
        radius={2.0}
        tubeRadius={0.006}
        arc={Math.PI * 0.8}
        color={primaryHex}
        speed={-0.2}
        tilt={[0.8, 0.5, 0]}
      />
      <ArcRing
        radius={2.2}
        tubeRadius={0.005}
        arc={Math.PI * 1.5}
        color={primaryHex}
        speed={0.15}
        tilt={[-0.4, 0.3, 0.6]}
      />
      <ArcRing
        radius={1.6}
        tubeRadius={0.01}
        arc={Math.PI * 0.6}
        color="#ff3300"
        speed={-0.4}
        tilt={[1.2, 0, 0.3]}
      />
      <ArcRing
        radius={2.4}
        tubeRadius={0.004}
        arc={Math.PI * 1.0}
        color={primaryHex}
        speed={0.1}
        tilt={[0.1, 1.0, 0]}
      />

      {/* Tick marks ring */}
      <TickRing radius={2.6} count={60} color={primaryHex} />
    </group>
  )
}
