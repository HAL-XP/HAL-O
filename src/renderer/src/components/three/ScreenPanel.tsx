import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

interface ProjectStats {
  lastCommit: string
  lastCommitTime: number
  commitCount30d: number
  fileCount: number
}

interface Props {
  position: [number, number, number]
  rotation: [number, number, number]
  projectName: string
  projectPath: string
  stack: string
  ready: boolean
  isHovered: boolean
  onHover: (hovered: boolean) => void
  onResume: () => void
  onNewSession: () => void
  onFiles: () => void
  runCmd?: string
  onRunApp?: () => void
  screenOpacity?: number // 0-1, default 1 (opaque). Lower = more see-through
  groupColor?: string    // override edge color with group color
}

const CYAN = '#00d4ff'

// Scratch vectors — reused every frame to avoid GC pressure
const _targetScale = new THREE.Vector3()
const _screenNormal = new THREE.Vector3()
const _toCamera = new THREE.Vector3()

// Format epoch timestamp into relative "time ago" string
function timeAgo(epoch: number): string {
  if (!epoch) return ''
  const diff = Date.now() - epoch
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// Generate 7 activity bars from commit count (visual intensity mapping)
function activityBars(commitCount: number): number[] {
  const intensity = Math.min(commitCount / 50, 1)
  return Array.from({ length: 7 }, (_, i) => {
    const base = intensity * (0.4 + 0.6 * Math.sin((i + 1) * 1.3 + commitCount * 0.7))
    return Math.max(0.08, Math.min(1, base))
  })
}

export function ScreenPanel({
  position, rotation, projectName, projectPath, stack, ready,
  isHovered, onHover, onResume, onNewSession, onFiles, runCmd, onRunApp,
  screenOpacity = 1, groupColor,
}: Props) {
  const edgeColor = groupColor || CYAN
  const groupRef = useRef<THREE.Group>(null)
  const htmlWrapRef = useRef<HTMLDivElement>(null)
  const { camera } = useThree()
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [visible, setVisible] = useState(false)

  // Lazy-load stats when screen becomes visible (front-facing)
  useEffect(() => {
    if (!visible || !projectPath) return
    let cancelled = false
    window.api.getProjectStats(projectPath).then((s) => {
      if (!cancelled) setStats(s)
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [visible, projectPath])

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
      groupRef.current.scale.lerp(_targetScale.set(s, s, s), 0.08)

      // Hide Html for back-facing screens via DOM opacity
      _screenNormal.set(0, 0, 1)
      _screenNormal.applyQuaternion(groupRef.current.quaternion)
      _toCamera.subVectors(camera.position, groupRef.current.position).normalize()
      const dot = _screenNormal.dot(_toCamera)
      const isFront = dot > 0
      if (htmlWrapRef.current) {
        htmlWrapRef.current.style.opacity = isFront ? '1' : '0'
        htmlWrapRef.current.style.pointerEvents = isFront ? 'auto' : 'none'
      }
      // Trigger stats load once the panel faces the camera
      if (isFront && !visible) setVisible(true)
    }
  })

  return (
    <group ref={groupRef} position={position} rotation={rotation}>

      {/* Screen face — flat dark panel with adjustable opacity */}
      <mesh>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          color="#050810"
          metalness={0.3}
          roughness={0.9}
          emissive="#001520"
          emissiveIntensity={0.1}
          side={THREE.DoubleSide}
          transparent={screenOpacity < 1}
          opacity={screenOpacity}
        />
      </mesh>

      {/* Frame edge — single line loop, always clean */}
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[framePoints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color={edgeColor}
          toneMapped={false}
          linewidth={1}
        />
      </lineLoop>

      {/* Emissive edge glow planes — thin strips on each edge for bloom */}
      {/* Top */}
      <mesh position={[0, H / 2, 0.001]}>
        <planeGeometry args={[W, 0.02]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : 0.5} />
      </mesh>
      {/* Bottom */}
      <mesh position={[0, -H / 2, 0.001]}>
        <planeGeometry args={[W, 0.02]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : 0.5} />
      </mesh>
      {/* Left */}
      <mesh position={[-W / 2, 0, 0.001]}>
        <planeGeometry args={[0.02, H]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : 0.5} />
      </mesh>
      {/* Right */}
      <mesh position={[W / 2, 0, 0.001]}>
        <planeGeometry args={[0.02, H]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : 0.5} />
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
            <div style={{ marginBottom: '6px' }}>
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

          {/* ── Project Stats ── */}
          {stats && (
            <div style={{ marginBottom: '6px', fontSize: '8px', lineHeight: '1.5' }}>
              {/* Last commit */}
              {stats.lastCommit && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', color: '#6b7a8d' }}>
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: '160px', color: '#8b9bb0',
                  }} title={stats.lastCommit}>
                    {stats.lastCommit.length > 30 ? stats.lastCommit.slice(0, 28) + '..' : stats.lastCommit}
                  </span>
                  <span style={{ flexShrink: 0, color: '#4a5568', fontSize: '7px' }}>
                    {timeAgo(stats.lastCommitTime)}
                  </span>
                </div>
              )}

              {/* Activity bar + file count row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                {/* 7-bar activity indicator */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '12px' }} title={`${stats.commitCount30d} commits (30d)`}>
                  {activityBars(stats.commitCount30d).map((v, i) => (
                    <div key={i} style={{
                      width: '3px',
                      height: `${Math.max(3, v * 12)}px`,
                      borderRadius: '1px',
                      background: v > 0.6
                        ? `rgba(0, 212, 255, ${0.4 + v * 0.5})`
                        : `rgba(100, 130, 160, ${0.2 + v * 0.4})`,
                      transition: 'height 0.3s ease',
                    }} />
                  ))}
                  <span style={{ fontSize: '7px', color: '#4a5568', marginLeft: '3px' }}>
                    {stats.commitCount30d > 0 ? `${stats.commitCount30d}` : '0'}
                  </span>
                </div>

                {/* File count badge */}
                {stats.fileCount > 0 && (
                  <span style={{
                    fontSize: '7px', color: '#4a5568',
                    background: 'rgba(255,255,255,0.04)',
                    padding: '1px 5px', borderRadius: '2px',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {stats.fileCount} files
                  </span>
                )}
              </div>
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
