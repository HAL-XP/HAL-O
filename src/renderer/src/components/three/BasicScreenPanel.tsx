import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

// PERF: Scratch vector reused in useFrame — avoids per-frame Vector3 allocation
const _scratchScale = new THREE.Vector3()

interface Props {
  position: [number, number, number]
  rotation: [number, number, number]
  projectName: string
  stack: string
  ready: boolean
  isHovered: boolean
  onHover: (hovered: boolean) => void
  onClick: () => void
}

export function ScreenPanel({ position, rotation, projectName, stack, ready, isHovered, onHover, onClick }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const frameRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    // Subtle hover animation
    if (frameRef.current) {
      const targetScale = isHovered ? 1.08 : 1
      _scratchScale.set(targetScale, targetScale, 1)
      frameRef.current.scale.lerp(_scratchScale, 0.1)
    }
    if (glowRef.current) {
      glowRef.current.visible = isHovered
    }
  })

  const screenW = 1.8
  const screenH = 1.1
  const primaryHex = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#84cc16'

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Screen frame — glows through bloom */}
      <mesh ref={frameRef}>
        <planeGeometry args={[screenW, screenH]} />
        <meshBasicMaterial
          color="#0a1018"
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Edge glow frame — emissive for bloom */}
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([
              -screenW/2, -screenH/2, 0.01,
              screenW/2, -screenH/2, 0.01,
              screenW/2, screenH/2, 0.01,
              -screenW/2, screenH/2, 0.01,
            ]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={ready ? primaryHex : '#fbbf24'} transparent opacity={0.6} toneMapped={false} />
      </lineLoop>

      {/* Corner brackets — brighter */}
      {[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx, sy], i) => (
        <group key={i} position={[sx * screenW/2, sy * screenH/2, 0.02]}>
          <mesh>
            <planeGeometry args={[0.15, 0.02]} />
            <meshBasicMaterial color={primaryHex} toneMapped={false} transparent opacity={0.8} />
          </mesh>
          <mesh>
            <planeGeometry args={[0.02, 0.15]} />
            <meshBasicMaterial color={primaryHex} toneMapped={false} transparent opacity={0.8} />
          </mesh>
        </group>
      ))}

      {/* Hover glow plane */}
      <mesh ref={glowRef} position={[0, 0, -0.05]} visible={false}>
        <planeGeometry args={[screenW + 0.3, screenH + 0.3]} />
        <meshBasicMaterial
          color={primaryHex}
          transparent
          opacity={0.05}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* HTML content overlay — actual readable project info */}
      <Html
        transform
        distanceFactor={5}
        position={[0, 0, 0.02]}
        style={{
          width: '180px',
          padding: '8px 10px',
          pointerEvents: 'auto',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onPointerOver={() => onHover(true)}
        onPointerOut={() => onHover(false)}
        onClick={onClick}
      >
        <div style={{
          fontFamily: "'Cascadia Code', 'Fira Code', monospace",
          color: '#e0e0e8',
          fontSize: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: ready ? '#4ade80' : '#fbbf24',
              boxShadow: `0 0 6px ${ready ? '#4ade80' : '#fbbf24'}`,
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{ fontWeight: 600, letterSpacing: '1px', fontSize: '11px' }}>
              {projectName}
            </span>
          </div>
          {stack && (
            <span style={{
              fontSize: '7px', color: primaryHex,
              background: 'rgba(132,204,22,0.1)',
              padding: '1px 5px', borderRadius: '2px',
              letterSpacing: '0.5px',
            }}>
              {stack}
            </span>
          )}
        </div>
      </Html>
    </group>
  )
}
