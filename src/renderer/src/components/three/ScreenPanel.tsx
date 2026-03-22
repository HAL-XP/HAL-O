import { useRef } from 'react'
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
const CYAN_DARK = '#003355'
const FRAME_DEPTH = 0.08

export function ScreenPanel({
  position, rotation, projectName, stack, ready,
  isHovered, onHover, onResume, onNewSession, onFiles, runCmd, onRunApp,
}: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const htmlWrapRef = useRef<HTMLDivElement>(null)
  const { camera } = useThree()

  const W = 2.8   // screen width
  const H = 1.8   // screen height
  const bar = 0.04 // frame bar thickness — thin like a real monitor bezel
  const depth = 0.05 // thin like a flat panel

  useFrame(() => {
    if (groupRef.current) {
      const s = isHovered ? 1.04 : 1.0
      groupRef.current.scale.lerp(new THREE.Vector3(s, s, s), 0.08)

      // Check if screen faces camera — fade Html via opacity (no snap, no flash)
      const screenNormal = new THREE.Vector3(0, 0, 1)
      screenNormal.applyQuaternion(groupRef.current.quaternion)
      const toCamera = new THREE.Vector3()
      toCamera.subVectors(camera.position, groupRef.current.position).normalize()
      const dot = screenNormal.dot(toCamera)
      if (htmlWrapRef.current) {
        const visible = dot > 0
        htmlWrapRef.current.style.opacity = visible ? '1' : '0'
        htmlWrapRef.current.style.pointerEvents = visible ? 'auto' : 'none'
      }
    }
  })

  // Shared PBR material for frame
  const frameMat = {
    color: '#081018',
    emissive: CYAN,
    emissiveIntensity: isHovered ? 1.2 : 0.6,
    metalness: 0.95,
    roughness: 0.1,
    toneMapped: false as const,
  }

  return (
    <group ref={groupRef} position={position} rotation={rotation}>

      {/* ── Back panel (screen face) — dark but visible ── */}
      <mesh position={[0, 0, -depth / 2]}>
        <boxGeometry args={[W - bar * 2, H - bar * 2, 0.01]} />
        <meshStandardMaterial
          color="#060a10"
          metalness={0.2}
          roughness={0.95}
          emissive="#002235"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* ── Inner screen glow border (inside the frame) ── */}
      <mesh position={[0, 0, -depth / 2 + 0.005]}>
        <planeGeometry args={[W - bar * 2 + 0.02, H - bar * 2 + 0.02]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.02} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* ── Frame — 4 bars as 3D boxes ── */}
      {/* Top bar */}
      <mesh position={[0, H / 2 - bar / 2, 0]}>
        <boxGeometry args={[W, bar, depth]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
      {/* Bottom bar */}
      <mesh position={[0, -H / 2 + bar / 2, 0]}>
        <boxGeometry args={[W, bar, depth]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
      {/* Left bar */}
      <mesh position={[-W / 2 + bar / 2, 0, 0]}>
        <boxGeometry args={[bar, H, depth]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
      {/* Right bar */}
      <mesh position={[W / 2 - bar / 2, 0, 0]}>
        <boxGeometry args={[bar, H, depth]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>

      {/* ── Subtle edge glow (bloom catcher) ── */}
      <mesh position={[0, 0, depth / 2 + 0.01]}>
        <planeGeometry args={[W + 0.05, H + 0.05]} />
        <meshBasicMaterial
          color={CYAN}
          transparent
          opacity={isHovered ? 0.03 : 0.01}
          toneMapped={false}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* ── HTML content — visibility controlled via DOM ref, not React state ── */}
      <Html
        transform
        distanceFactor={4}
        position={[0, 0, depth / 2 + 0.06]}
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
