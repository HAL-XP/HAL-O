import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

interface Props {
  position: [number, number, number]
  rotation: [number, number, number]
  projectName: string
  stack: string
  ready: boolean
  isHovered: boolean
  onHover: (hovered: boolean) => void
  onResume: () => void
  onNewSession: () => void
  onFiles: () => void
  runCmd?: string
  onRunApp?: () => void
}

const CYAN = '#00d4ff'

export function ScreenPanel({
  position, rotation, projectName, stack, ready,
  isHovered, onHover, onResume, onNewSession, onFiles, runCmd, onRunApp,
}: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const htmlWrapRef = useRef<HTMLDivElement>(null)
  const { camera } = useThree()

  const W = 2.8
  const H = 1.8

  // Edge frame as a single line loop — clean from any angle
  const framePoints = useMemo(() => {
    const hw = W / 2, hh = H / 2
    return new Float32Array([
      -hw, -hh, 0,  hw, -hh, 0,  hw, hh, 0,  -hw, hh, 0,
    ])
  }, [])

  useFrame(() => {
    if (groupRef.current) {
      const s = isHovered ? 1.04 : 1.0
      groupRef.current.scale.lerp(new THREE.Vector3(s, s, s), 0.08)

      // Hide Html for back-facing screens via DOM opacity
      const screenNormal = new THREE.Vector3(0, 0, 1)
      screenNormal.applyQuaternion(groupRef.current.quaternion)
      const toCamera = new THREE.Vector3()
      toCamera.subVectors(camera.position, groupRef.current.position).normalize()
      const dot = screenNormal.dot(toCamera)
      if (htmlWrapRef.current) {
        htmlWrapRef.current.style.opacity = dot > 0 ? '1' : '0'
        htmlWrapRef.current.style.pointerEvents = dot > 0 ? 'auto' : 'none'
      }
    }
  })

  return (
    <group ref={groupRef} position={position} rotation={rotation}>

      {/* Screen face — flat dark panel */}
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

      {/* Frame edge — single line loop, always clean */}
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[framePoints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color={CYAN}
          toneMapped={false}
          linewidth={1}
        />
      </lineLoop>

      {/* Emissive edge glow planes — thin strips on each edge for bloom */}
      {/* Top */}
      <mesh position={[0, H / 2, 0.001]}>
        <planeGeometry args={[W, 0.02]} />
        <meshBasicMaterial color={CYAN} toneMapped={false} transparent opacity={isHovered ? 0.9 : 0.5} />
      </mesh>
      {/* Bottom */}
      <mesh position={[0, -H / 2, 0.001]}>
        <planeGeometry args={[W, 0.02]} />
        <meshBasicMaterial color={CYAN} toneMapped={false} transparent opacity={isHovered ? 0.9 : 0.5} />
      </mesh>
      {/* Left */}
      <mesh position={[-W / 2, 0, 0.001]}>
        <planeGeometry args={[0.02, H]} />
        <meshBasicMaterial color={CYAN} toneMapped={false} transparent opacity={isHovered ? 0.9 : 0.5} />
      </mesh>
      {/* Right */}
      <mesh position={[W / 2, 0, 0.001]}>
        <planeGeometry args={[0.02, H]} />
        <meshBasicMaterial color={CYAN} toneMapped={false} transparent opacity={isHovered ? 0.9 : 0.5} />
      </mesh>

      {/* HTML content */}
      <Html
        transform
        distanceFactor={4}
        position={[0, 0, 0.05]}
        style={{
          width: '260px',
          padding: '12px 14px',
          pointerEvents: 'auto',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onPointerOver={() => onHover(true)}
        onPointerOut={() => onHover(false)}
      >
        <div ref={htmlWrapRef} style={{
          fontFamily: "'Cascadia Code', 'Fira Code', monospace",
          color: '#c8dce8',
          transition: 'opacity 0.3s ease',
          willChange: 'opacity',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: ready ? '#4ade80' : '#fbbf24',
              boxShadow: `0 0 8px ${ready ? '#4ade80' : '#fbbf24'}`,
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{ fontWeight: 700, letterSpacing: '1.5px', fontSize: '12px', textTransform: 'uppercase' }}>
              {projectName}
            </span>
          </div>

          {stack && (
            <div style={{ marginBottom: '8px' }}>
              <span style={{
                fontSize: '8px', color: CYAN,
                background: 'rgba(0,212,255,0.1)',
                padding: '2px 7px', borderRadius: '2px',
                letterSpacing: '1px', border: '1px solid rgba(0,212,255,0.2)',
              }}>
                {stack}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <button onClick={onResume} style={btnPrimary}>RESUME</button>
            <button onClick={onNewSession} style={btnGhost}>NEW</button>
            {runCmd && onRunApp && <button onClick={onRunApp} style={{ ...btnGhost, color: '#22d3ee', borderColor: 'rgba(34,211,238,0.3)' }}>RUN</button>}
            <button onClick={onFiles} style={btnGhost}>FILES</button>
          </div>
        </div>
      </Html>
    </group>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: '3px 9px', background: CYAN, border: `1px solid ${CYAN}`,
  color: '#000', fontSize: '8px', fontWeight: 700, letterSpacing: '1.5px',
  cursor: 'pointer', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
  textTransform: 'uppercase',
}

const btnGhost: React.CSSProperties = {
  padding: '3px 9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
  color: '#8b8fa3', fontSize: '8px', fontWeight: 700, letterSpacing: '1.5px',
  cursor: 'pointer', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
  textTransform: 'uppercase',
}
