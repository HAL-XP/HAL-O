import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

interface Props {
  position: [number, number, number]
  rotation: [number, number, number]
  count: number       // how many projects are hidden in this stack
  groupColor?: string // matches group color
  groupName?: string  // optional group label
}

const CYAN = '#00d4ff'

// Scratch vectors for face-culling
const _screenNormal = new THREE.Vector3()
const _toCamera = new THREE.Vector3()

/**
 * Stack indicator — shows 2-3 overlapping panel outlines with a "+ N more" badge.
 * Placed at the 6th position in a group when that group has > 6 projects.
 */
export function StackIndicatorPanel({ position, rotation, count, groupColor, groupName }: Props) {
  const edgeColor = groupColor || CYAN
  const groupRef = useRef<THREE.Group>(null)
  const htmlWrapRef = useRef<HTMLDivElement>(null)
  const { camera } = useThree()

  const W = 2.8
  const H = 1.8

  // Frame points for a single outline
  const framePoints = useMemo(() => {
    const hw = W / 2, hh = H / 2
    return new Float32Array([
      -hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0,
    ])
  }, [])

  useFrame(() => {
    if (groupRef.current) {
      // Face-culling for Html visibility
      _screenNormal.set(0, 0, 1)
      _screenNormal.applyQuaternion(groupRef.current.quaternion)
      _toCamera.subVectors(camera.position, groupRef.current.position).normalize()
      const dot = _screenNormal.dot(_toCamera)
      const isFront = dot > 0
      if (htmlWrapRef.current) {
        htmlWrapRef.current.style.opacity = isFront ? '1' : '0'
        htmlWrapRef.current.style.pointerEvents = isFront ? 'auto' : 'none'
      }
    }
  })

  // Number of stacked outlines behind the front one (2 or 3 layers total)
  const layerCount = count > 3 ? 3 : 2

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Stacked panel outlines behind the front — tilted slightly for depth */}
      {Array.from({ length: layerCount }, (_, layer) => {
        const zOff = -0.12 * (layer + 1)  // push back
        const xOff = 0.08 * (layer + 1)   // shift right
        const yOff = 0.06 * (layer + 1)   // shift up
        const tiltZ = -0.03 * (layer + 1) // slight rotation
        const opacity = 0.25 - layer * 0.06
        return (
          <group key={layer} position={[xOff, yOff, zOff]} rotation={[0, 0, tiltZ]}>
            {/* Outline frame */}
            <lineLoop>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[framePoints, 3]} />
              </bufferGeometry>
              <lineBasicMaterial
                color={edgeColor}
                toneMapped={false}
                linewidth={1}
                transparent
                opacity={opacity}
              />
            </lineLoop>
            {/* Dim filled panel */}
            <mesh>
              <planeGeometry args={[W, H]} />
              <meshBasicMaterial
                color="#050810"
                transparent
                opacity={opacity * 0.6}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        )
      })}

      {/* Front panel — dark background */}
      <mesh>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          color="#050810"
          metalness={0.3}
          roughness={0.9}
          emissive="#001520"
          emissiveIntensity={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Front frame outline */}
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[framePoints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={edgeColor} toneMapped={false} linewidth={1} />
      </lineLoop>

      {/* Emissive edge glow — dimmer than normal panels */}
      {/* Top */}
      <mesh position={[0, H / 2, 0.001]}>
        <planeGeometry args={[W, 0.02]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={0.35} />
      </mesh>
      {/* Bottom */}
      <mesh position={[0, -H / 2, 0.001]}>
        <planeGeometry args={[W, 0.02]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={0.35} />
      </mesh>
      {/* Left */}
      <mesh position={[-W / 2, 0, 0.001]}>
        <planeGeometry args={[0.02, H]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={0.35} />
      </mesh>
      {/* Right */}
      <mesh position={[W / 2, 0, 0.001]}>
        <planeGeometry args={[0.02, H]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={0.35} />
      </mesh>

      {/* HTML count badge */}
      <Html
        transform
        distanceFactor={4}
        position={[0, 0, 0.05]}
        style={{
          width: '260px',
          padding: '12px 14px',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div ref={htmlWrapRef} style={{
          fontFamily: "'Cascadia Code', 'Fira Code', monospace",
          color: '#c8dce8',
          transition: 'opacity 0.3s ease',
          willChange: 'opacity',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '8px',
        }}>
          {groupName && (
            <span style={{
              fontSize: '8px',
              color: edgeColor,
              background: `${edgeColor}18`,
              padding: '2px 8px',
              borderRadius: '2px',
              letterSpacing: '1.5px',
              border: `1px solid ${edgeColor}33`,
              textTransform: 'uppercase',
            }}>
              {groupName}
            </span>
          )}
          <span style={{
            fontSize: '20px',
            fontWeight: 700,
            color: edgeColor,
            textShadow: `0 0 12px ${edgeColor}`,
            letterSpacing: '2px',
          }}>
            + {count}
          </span>
          <span style={{
            fontSize: '8px',
            color: '#6b7a8d',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}>
            more projects
          </span>
        </div>
      </Html>
    </group>
  )
}
