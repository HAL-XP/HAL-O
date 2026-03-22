import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// A single ring with tick marks
function DetailedRing({ radius, width, ticks, speed, opacity, color }: {
  radius: number
  width: number
  ticks: number
  speed: number
  opacity: number
  color: string
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * speed
  })

  const tickGeometry = useMemo(() => {
    const positions: number[] = []
    for (let i = 0; i < ticks; i++) {
      const angle = (i / ticks) * Math.PI * 2
      const isMajor = i % 5 === 0
      const len = isMajor ? width * 3 : width * 1.5
      const innerR = radius - len / 2
      const outerR = radius + len / 2

      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      positions.push(cos * innerR, 0, sin * innerR)
      positions.push(cos * outerR, 0, sin * outerR)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [radius, width, ticks])

  return (
    <group ref={groupRef}>
      {/* Main ring */}
      <mesh rotation={[0, 0, 0]}>
        <ringGeometry args={[radius - width / 2, radius + width / 2, 128]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Tick marks */}
      <lineSegments geometry={tickGeometry}>
        <lineBasicMaterial color={color} transparent opacity={opacity * 0.7} />
      </lineSegments>
    </group>
  )
}

// Arc segment — partial ring
function ArcSegment({ radius, width, startAngle, endAngle, color, opacity, speed }: {
  radius: number
  width: number
  startAngle: number
  endAngle: number
  color: string
  opacity: number
  speed: number
}) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * speed
  })

  const arc = endAngle - startAngle
  const segments = Math.max(16, Math.floor(arc * 20))

  return (
    <mesh ref={ref} rotation={[0, startAngle, 0]}>
      <ringGeometry args={[radius - width / 2, radius + width / 2, segments, 1, 0, arc]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export function OrbitalRings() {
  const primaryHex = useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    return style.getPropertyValue('--primary').trim() || '#84cc16'
  }, [])

  return (
    <group position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Platform rings — concentric, horizontal */}
      <DetailedRing radius={2.5} width={0.02} ticks={60} speed={0.05} opacity={0.4} color={primaryHex} />
      <DetailedRing radius={3.0} width={0.03} ticks={40} speed={-0.03} opacity={0.3} color={primaryHex} />
      <DetailedRing radius={3.5} width={0.015} ticks={80} speed={0.02} opacity={0.25} color={primaryHex} />
      <DetailedRing radius={4.0} width={0.04} ticks={30} speed={-0.04} opacity={0.2} color={primaryHex} />
      <DetailedRing radius={4.5} width={0.01} ticks={100} speed={0.01} opacity={0.15} color={primaryHex} />
      <DetailedRing radius={5.0} width={0.025} ticks={50} speed={-0.02} opacity={0.12} color={primaryHex} />

      {/* Arc segments — partial rings for visual interest */}
      <ArcSegment radius={2.2} width={0.08} startAngle={0} endAngle={Math.PI * 0.7} color={primaryHex} opacity={0.15} speed={0.08} />
      <ArcSegment radius={2.8} width={0.06} startAngle={Math.PI} endAngle={Math.PI * 1.8} color={primaryHex} opacity={0.12} speed={-0.06} />
      <ArcSegment radius={3.3} width={0.1} startAngle={0.5} endAngle={1.5} color="#ff3300" opacity={0.08} speed={0.04} />
      <ArcSegment radius={3.8} width={0.05} startAngle={2.5} endAngle={4.5} color={primaryHex} opacity={0.1} speed={-0.03} />
      <ArcSegment radius={4.3} width={0.07} startAngle={1} endAngle={3} color={primaryHex} opacity={0.08} speed={0.05} />

      {/* Inner glow disc */}
      <mesh>
        <circleGeometry args={[2, 64]} />
        <meshBasicMaterial
          color="#ff1100"
          transparent
          opacity={0.02}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
