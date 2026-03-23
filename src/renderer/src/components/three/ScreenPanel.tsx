import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useThreeTheme } from '../../contexts/ThreeThemeContext'

interface ProjectStats {
  lastCommit: string
  lastCommitTime: number
  commitCount30d: number
  fileCount: number
}

export type HealthStatus = 'ok' | 'warning' | 'outdated' | 'error' | 'neutral'

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
  healthStatus?: HealthStatus // visual health indicator — changes edge glow color
  healthText?: string // status text shown in scrolling background layer (e.g. "SYNC OK", "3 BEHIND")
  demoStats?: ProjectStats // pre-baked stats for demo projects (bypasses IPC getProjectStats)
  onContextMenu?: (e: React.MouseEvent) => void
}

// Health-based edge glow colors
const HEALTH_COLORS: Record<HealthStatus, string> = {
  ok: '',       // empty = use default (accent or groupColor)
  warning: '#fbbf24',   // amber
  outdated: '#fb923c',  // dim orange
  error: '#f87171',     // red
  neutral: '#4a5568',   // dim gray — bare projects, not broken
}
const HEALTH_EDGE_OPACITY: Record<HealthStatus, number> = {
  ok: 0.5,
  warning: 0.6,
  outdated: 0.3,
  error: 0.7,
  neutral: 0.2,
}

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

// Convert hex color to rgba string
function hexToRgba(hex: string, alpha: number): string {
  const c = new THREE.Color(hex)
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`
}

export function ScreenPanel({
  position, rotation, projectName, projectPath, stack, ready,
  isHovered, onHover, onResume, onNewSession, onFiles, runCmd, onRunApp,
  screenOpacity = 1, groupColor, healthStatus = 'ok', healthText,
  demoStats, onContextMenu,
}: Props) {
  const theme = useThreeTheme()
  const groupRef = useRef<THREE.Group>(null)
  const htmlWrapRef = useRef<HTMLDivElement>(null)
  const { camera } = useThree()
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [visible, setVisible] = useState(false)

  // Lazy-load stats when screen becomes visible (front-facing)
  // If demoStats is provided (demo projects), use it directly without IPC
  useEffect(() => {
    if (!visible) return
    if (demoStats) {
      setStats(demoStats)
      return
    }
    if (!projectPath) return
    let cancelled = false
    window.api.getProjectStats(projectPath).then((s) => {
      if (!cancelled) setStats(s)
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [visible, projectPath, demoStats])

  // Derive effective health from prop + stats (stats can upgrade 'ok' to 'outdated')
  const effectiveHealth: HealthStatus = useMemo(() => {
    if (healthStatus === 'neutral') return 'neutral' // bare projects stay neutral, no upgrade
    if (healthStatus !== 'ok') return healthStatus
    if (stats && stats.commitCount30d === 0) return 'outdated'
    return 'ok'
  }, [healthStatus, stats])

  // Derive health text from status + stats
  const effectiveHealthText: string | undefined = useMemo(() => {
    if (healthText) return healthText
    if (effectiveHealth === 'neutral') return undefined // bare projects — no scrolling text
    if (effectiveHealth === 'warning') return 'SETUP INCOMPLETE'
    if (effectiveHealth === 'outdated') return 'NO COMMITS 30D'
    if (effectiveHealth === 'error') return 'ERROR'
    if (stats && stats.commitCount30d > 0) return `SYNC OK // ${stats.commitCount30d} COMMITS`
    return undefined
  }, [healthText, effectiveHealth, stats])

  // Health status overrides edge color (except 'ok' which uses default)
  const healthColor = HEALTH_COLORS[effectiveHealth]
  const accentHex = theme.screenEdgeHex
  const edgeColor = healthColor || groupColor || accentHex
  const edgeBaseOpacity = HEALTH_EDGE_OPACITY[effectiveHealth]

  // Button styles derived from theme accent color
  const btnPrimary: React.CSSProperties = useMemo(() => ({
    padding: '3px 9px', background: accentHex, border: `1px solid ${accentHex}`,
    color: '#000', fontSize: '8px', fontWeight: 700, letterSpacing: '1.5px',
    cursor: 'pointer', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    textTransform: 'uppercase',
  }), [accentHex])

  const btnGhost: React.CSSProperties = useMemo(() => ({
    padding: '3px 9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
    color: '#8b8fa3', fontSize: '8px', fontWeight: 700, letterSpacing: '1.5px',
    cursor: 'pointer', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    textTransform: 'uppercase',
  }), [])

  // Stack tag badge colors
  const stackBadgeBg = useMemo(() => hexToRgba(accentHex, 0.1), [accentHex])
  const stackBadgeBorder = useMemo(() => hexToRgba(accentHex, 0.2), [accentHex])

  // Activity bar highlight color
  const activityBarHighlight = useMemo(() => {
    const c = theme.accent
    return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)},`
  }, [theme.accent])

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
          color={theme.screenFaceHex}
          metalness={0.3}
          roughness={0.9}
          emissive={theme.gridLineHex}
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
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : edgeBaseOpacity} />
      </mesh>
      {/* Bottom */}
      <mesh position={[0, -H / 2, 0.001]}>
        <planeGeometry args={[W, 0.02]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : edgeBaseOpacity} />
      </mesh>
      {/* Left */}
      <mesh position={[-W / 2, 0, 0.001]}>
        <planeGeometry args={[0.02, H]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : edgeBaseOpacity} />
      </mesh>
      {/* Right */}
      <mesh position={[W / 2, 0, 0.001]}>
        <planeGeometry args={[0.02, H]} />
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : edgeBaseOpacity} />
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
        <div ref={htmlWrapRef} onContextMenu={onContextMenu} style={{
          fontFamily: "'Cascadia Code', 'Fira Code', monospace",
          color: '#c8dce8',
          transition: 'opacity 0.3s ease',
          willChange: 'opacity',
          position: 'relative',
        }}>
          {/* Scrolling background status text — very low opacity, behind content */}
          {effectiveHealthText && (
            <div style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
              zIndex: 0,
              opacity: effectiveHealth === 'ok' ? 0.08 : 0.12,
            }}>
              <div style={{
                fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                fontSize: '9px',
                letterSpacing: '2px',
                color: edgeColor,
                whiteSpace: 'nowrap',
                lineHeight: '14px',
                animation: 'healthScrollY 8s linear infinite',
              }}>
                {/* Repeat text to fill vertical space */}
                {Array.from({ length: 12 }, (_, i) => (
                  <div key={i}>{effectiveHealthText}</div>
                ))}
              </div>
              <style>{`
                @keyframes healthScrollY {
                  0% { transform: translateY(0); }
                  100% { transform: translateY(-50%); }
                }
              `}</style>
            </div>
          )}
          <div style={{ position: 'relative', zIndex: 1 }}>
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
                fontSize: '8px', color: accentHex,
                background: stackBadgeBg,
                padding: '2px 7px', borderRadius: '2px',
                letterSpacing: '1px', border: `1px solid ${stackBadgeBorder}`,
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
                        ? `${activityBarHighlight} ${0.4 + v * 0.5})`
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
          </div>{/* close zIndex:1 content wrapper */}
        </div>
      </Html>
    </group>
  )
}
