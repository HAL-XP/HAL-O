import { useRef, useMemo, useState, useEffect, memo } from 'react'
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
  rulesOutdated?: boolean // show UPDATE badge when rules version is behind
  isFavorite?: boolean // show gold star indicator on favorited projects
  isExternal?: boolean // an external Claude session is running for this project
  isAbsorbing?: boolean // absorption in progress
  onAbsorb?: () => void // trigger absorption of the external session
  // Search-aware animated positioning (U7) — when set, panel lerps to these targets
  searchTarget?: { position: [number, number, number]; rotation: [number, number, number] }
  searchDimmed?: boolean // true = non-matching panel during search, dim to ~0.1 opacity
  // IDE & Terminal buttons (U19)
  ideLabel?: string // short label for IDE button (e.g. "CODE", "CURSOR", "WS") — null hides button
  onOpenIde?: () => void // click: open in preferred IDE
  onOpenIdeMenu?: (e: React.MouseEvent) => void // right-click: show IDE picker
  onOpenTerminal?: () => void // click: open external terminal at project path
}

// Health-based edge glow colors — status overrides use theme semantic colors when available (P3)
function getHealthColors(theme: ReturnType<typeof useThreeTheme>): Record<HealthStatus, string> {
  return {
    ok: '',       // empty = use default (accent or groupColor)
    warning: '#' + theme.warning.getHexString(),
    outdated: '#fb923c',  // dim orange — no direct theme mapping
    error: '#' + theme.error.getHexString(),
    neutral: '#4a5568',   // dim gray — bare projects, not broken
  }
}
// Edge glow opacity multipliers per health status — multiplied with style.edgeGlowBase (P3)
const HEALTH_EDGE_OPACITY_MULT: Record<HealthStatus, number> = {
  ok: 1.0,
  warning: 1.2,
  outdated: 0.6,
  error: 1.4,
  neutral: 0.4,
}

// Scratch vectors — reused every frame to avoid GC pressure
const _targetScale = new THREE.Vector3()
const _screenNormal = new THREE.Vector3()
const _toCamera = new THREE.Vector3()

// Shared geometries — created once, reused across all ScreenPanel instances (PERF2)
const PANEL_W = 2.8
const PANEL_H = 1.8
const _sharedFaceGeo = new THREE.PlaneGeometry(PANEL_W, PANEL_H)
const _sharedEdgeHGeo = new THREE.PlaneGeometry(PANEL_W, 0.02)
const _sharedEdgeVGeo = new THREE.PlaneGeometry(0.02, PANEL_H)
const _sharedFramePositions = new Float32Array([
  -PANEL_W / 2, -PANEL_H / 2, 0,  PANEL_W / 2, -PANEL_H / 2, 0,
  PANEL_W / 2, PANEL_H / 2, 0,  -PANEL_W / 2, PANEL_H / 2, 0,
])
const _sharedFrameGeo = new THREE.BufferGeometry()
_sharedFrameGeo.setAttribute('position', new THREE.BufferAttribute(_sharedFramePositions, 3))

// ── Global camera-move detection for throttling Html updates (B22 PERF) ──
// drei's Html component recalculates CSS transform3d from the 3D world matrix EVERY frame.
// With 100+ panels, that's 100+ matrix decompositions per frame — the #1 cause of orbit stutter.
// We track whether the camera actually moved and skip Html rendering for frames where it didn't,
// and during active interaction we throttle back-face checks to every 3rd frame.
let _prevCamX = 0
let _prevCamY = 0
let _prevCamZ = 0
let _cameraMovedThisFrame = true
let _frameCounter = 0
let _isUserInteracting = false
let _interactionEndTimer: ReturnType<typeof setTimeout> | null = null

/** Called once per frame from ScreenPanelUpdater to detect camera movement */
export function updateCameraMovementFlag(camera: THREE.Camera): void {
  _frameCounter++
  const dx = camera.position.x - _prevCamX
  const dy = camera.position.y - _prevCamY
  const dz = camera.position.z - _prevCamZ
  // Threshold: camera moved more than 0.001 units (covers sub-pixel precision)
  _cameraMovedThisFrame = (dx * dx + dy * dy + dz * dz) > 0.000001
  _prevCamX = camera.position.x
  _prevCamY = camera.position.y
  _prevCamZ = camera.position.z
}

/** Signal that user started interacting (orbit drag / zoom) */
export function setUserInteracting(active: boolean): void {
  if (active) {
    _isUserInteracting = true
    if (_interactionEndTimer) { clearTimeout(_interactionEndTimer); _interactionEndTimer = null }
  } else {
    // Debounce: keep throttling for 200ms after interaction ends (covers inertia)
    if (_interactionEndTimer) clearTimeout(_interactionEndTimer)
    _interactionEndTimer = setTimeout(() => { _isUserInteracting = false }, 200)
  }
}

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

/**
 * ScreenPanelUpdater — ONE instance in the scene (in PbrSceneInner).
 * Runs a single useFrame to update the global camera-movement flag.
 * This replaces N per-panel useFrame calls for camera detection. (B22 PERF)
 */
export function ScreenPanelUpdater() {
  const { camera, controls } = useThree()

  // Wire up interaction detection to OrbitControls events
  useEffect(() => {
    if (!controls) return
    const oc = controls as any
    const onStart = () => setUserInteracting(true)
    const onEnd = () => setUserInteracting(false)
    oc.addEventListener('start', onStart)
    oc.addEventListener('end', onEnd)
    return () => {
      oc.removeEventListener('start', onStart)
      oc.removeEventListener('end', onEnd)
    }
  }, [controls])

  useFrame(() => {
    updateCameraMovementFlag(camera)
  })

  return null
}

// B25 PERF: React.memo prevents re-rendering ALL panels when parent state changes
// (e.g. hoveredId change only affects 1-2 panels, the rest skip re-render).
// Custom comparator ignores callback props (stable in behavior, unstable in reference due to inline arrows).
const CALLBACK_PROPS = new Set([
  'onHover', 'onResume', 'onNewSession', 'onFiles', 'onRunApp', 'onAbsorb',
  'onContextMenu', 'onOpenIde', 'onOpenIdeMenu', 'onOpenTerminal',
])

function screenPanelAreEqual(prev: Props, next: Props): boolean {
  for (const key of Object.keys(next) as (keyof Props)[]) {
    if (CALLBACK_PROPS.has(key)) continue // skip callback reference comparison
    if (key === 'position' || key === 'rotation') {
      const a = prev[key] as [number, number, number]
      const b = next[key] as [number, number, number]
      if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) return false
      continue
    }
    if (key === 'searchTarget') {
      const a = prev.searchTarget
      const b = next.searchTarget
      if (a === b) continue
      if (!a || !b) return false
      if (a.position[0] !== b.position[0] || a.position[1] !== b.position[1] || a.position[2] !== b.position[2]) return false
      if (a.rotation[0] !== b.rotation[0] || a.rotation[1] !== b.rotation[1] || a.rotation[2] !== b.rotation[2]) return false
      continue
    }
    if (prev[key] !== next[key]) return false
  }
  return true
}

export const ScreenPanel = memo(function ScreenPanel({
  position, rotation, projectName, projectPath, stack, ready,
  isHovered, onHover, onResume, onNewSession, onFiles, runCmd, onRunApp,
  screenOpacity = 1, groupColor, healthStatus = 'ok', healthText,
  demoStats, onContextMenu, rulesOutdated = false, isFavorite = false,
  isExternal = false, isAbsorbing = false, onAbsorb,
  searchTarget, searchDimmed = false,
  ideLabel, onOpenIde, onOpenIdeMenu, onOpenTerminal,
}: Props) {
  const theme = useThreeTheme()
  const groupRef = useRef<THREE.Group>(null)
  const htmlWrapRef = useRef<HTMLDivElement>(null)
  const { camera } = useThree()
  const [stats, setStats] = useState<ProjectStats | null>(null)

  // Track if panel has ever been front-facing (triggers Html mount — never unmounts after) (B22 PERF)
  const [htmlMounted, setHtmlMounted] = useState(false)
  // isFront ref: true = facing camera. Starts null (unknown).
  const wasFrontRef = useRef<boolean | null>(null)

  // Lazy-load stats when screen becomes visible (front-facing)
  // If demoStats is provided (demo projects), use it directly without IPC
  useEffect(() => {
    if (!htmlMounted) return
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
  }, [htmlMounted, projectPath, demoStats])

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

  // Health status overrides edge color (except 'ok' which uses default) (P3 theme)
  // External sessions get a distinctive purple glow to draw attention (T3)
  const healthColors = useMemo(() => getHealthColors(theme), [theme.warning, theme.error])
  const healthColor = healthColors[effectiveHealth]
  const accentHex = theme.screenEdgeHex
  const edgeColor = isExternal ? '#c084fc' : (healthColor || groupColor || accentHex)
  // Edge glow opacity: style.edgeGlowBase * health multiplier (P3), boosted for external (T3)
  const edgeBaseOpacity = isExternal ? 0.7 : ((theme.style?.edgeGlowBase ?? 0.5) * HEALTH_EDGE_OPACITY_MULT[effectiveHealth])

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

  // Absorb button style (T3)
  const btnAbsorb: React.CSSProperties = useMemo(() => ({
    padding: '3px 9px', background: 'rgba(192,132,252,0.15)', border: '1px solid rgba(192,132,252,0.5)',
    color: '#c084fc', fontSize: '8px', fontWeight: 700, letterSpacing: '1.5px',
    cursor: isAbsorbing ? 'wait' : 'pointer', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    textTransform: 'uppercase' as const, opacity: isAbsorbing ? 0.6 : 1,
  }), [isAbsorbing])

  // Stack tag badge colors
  const stackBadgeBg = useMemo(() => hexToRgba(accentHex, 0.1), [accentHex])
  const stackBadgeBorder = useMemo(() => hexToRgba(accentHex, 0.2), [accentHex])

  // Activity bar highlight color
  const activityBarHighlight = useMemo(() => {
    const c = theme.accent
    return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)},`
  }, [theme.accent])

  const W = PANEL_W
  const H = PANEL_H

  const edgeMeshRefs = useRef<THREE.Object3D[]>([])
  const faceMeshRef = useRef<THREE.Mesh>(null)

  // Track current dim opacity for smooth animation (U7)
  const dimOpacityRef = useRef(1)

  useFrame(() => {
    if (!groupRef.current) return

    // ── Search position lerp (U7) — animate toward search target or back to layout ──
    const tp = searchTarget ? searchTarget.position : position
    const tr = searchTarget ? searchTarget.rotation : rotation
    const dx = tp[0] - groupRef.current.position.x
    const dy = tp[1] - groupRef.current.position.y
    const dz = tp[2] - groupRef.current.position.z
    const distSq = dx * dx + dy * dy + dz * dz
    // Only lerp when position is meaningfully different (> 0.001 units)
    const panelMoving = distSq > 0.000001
    if (panelMoving) {
      const lerpFactor = 0.06 // ~500ms settle at 60fps
      groupRef.current.position.x += dx * lerpFactor
      groupRef.current.position.y += dy * lerpFactor
      groupRef.current.position.z += dz * lerpFactor
      groupRef.current.rotation.x += (tr[0] - groupRef.current.rotation.x) * lerpFactor
      groupRef.current.rotation.y += (tr[1] - groupRef.current.rotation.y) * lerpFactor
      groupRef.current.rotation.z += (tr[2] - groupRef.current.rotation.z) * lerpFactor
    }

    // ── Search dim fade (U7) — smoothly fade non-matching panels ──
    const dimTarget = searchDimmed ? 0.08 : 1
    const dimDelta = dimTarget - dimOpacityRef.current
    // Only update materials when dim is actually changing (> 0.5% difference)
    if (Math.abs(dimDelta) > 0.005) {
      dimOpacityRef.current += dimDelta * 0.08
      // Apply dim to face mesh material opacity
      if (faceMeshRef.current) {
        const mat = faceMeshRef.current.material as THREE.MeshStandardMaterial
        mat.opacity = screenOpacity * dimOpacityRef.current
        mat.transparent = mat.opacity < 1
      }
      // Apply dim to edge meshes + frame line
      for (const m of edgeMeshRefs.current) {
        if (!m) continue
        const mat = (m as any).material as THREE.Material & { opacity: number }
        if (!mat) continue
        const baseOp = isHovered ? 0.9 : edgeBaseOpacity
        mat.opacity = baseOp * dimOpacityRef.current
      }
      // Apply dim to HTML content
      if (htmlWrapRef.current) {
        const vis = wasFrontRef.current !== false
        htmlWrapRef.current.style.opacity = vis ? String(Math.min(1, dimOpacityRef.current)) : '0'
        htmlWrapRef.current.style.pointerEvents = (vis && dimOpacityRef.current > 0.3) ? 'auto' : 'none'
      }
    }

    // Hover scale lerp — always runs (cheap: one lerp)
    const s = isHovered ? 1.04 : 1.0
    groupRef.current.scale.lerp(_targetScale.set(s, s, s), 0.08)

    // ── Back-face detection — throttled during interaction (B22 PERF FIX) ──
    // During active camera orbit/zoom, only check every 3rd frame.
    // The visual difference is imperceptible but saves 66% of per-panel vector math.
    if (_isUserInteracting && (_frameCounter % 3 !== 0) && !panelMoving) return

    // Only recompute when camera actually moved OR panel is animating (U7: search repositioning)
    if (!_cameraMovedThisFrame && !panelMoving && wasFrontRef.current !== null) return

    _screenNormal.set(0, 0, 1)
    _screenNormal.applyQuaternion(groupRef.current.quaternion)
    _toCamera.subVectors(camera.position, groupRef.current.position).normalize()
    const dot = _screenNormal.dot(_toCamera)
    const isFront = dot > 0.05

    // Update DOM only on state change OR first frame (null -> force write)
    if (isFront !== wasFrontRef.current) {
      wasFrontRef.current = isFront
      for (const m of edgeMeshRefs.current) { if (m) m.visible = isFront }
      if (htmlWrapRef.current) {
        // When search-dimmed, let the dim handler above control opacity
        const dimOp = searchDimmed ? dimOpacityRef.current : 1
        htmlWrapRef.current.style.opacity = isFront ? String(dimOp) : '0'
        htmlWrapRef.current.style.pointerEvents = (isFront && dimOp > 0.3) ? 'auto' : 'none'
      }
    }
    // Mount Html the first time this panel faces the camera (never unmount — avoids flicker) (B22 PERF)
    if (isFront && !htmlMounted) setHtmlMounted(true)
  })

  return (
    <group ref={groupRef} position={position} rotation={rotation}>

      {/* Screen face — shared geometry (PERF2), metalness/roughness from style (P3) */}
      <mesh ref={faceMeshRef} geometry={_sharedFaceGeo}>
        <meshStandardMaterial
          color={theme.screenFaceHex}
          metalness={theme.style?.surfaceMetalness ?? 0.3}
          roughness={theme.style?.surfaceRoughness ?? 0.9}
          emissive={theme.gridLineHex}
          emissiveIntensity={0.1}
          side={THREE.DoubleSide}
          transparent
          opacity={screenOpacity}
        />
      </mesh>

      {/* Frame edge — shared geometry (PERF2), hidden when back-facing (PERF1) */}
      <lineLoop ref={(el: any) => { if (el) edgeMeshRefs.current[4] = el }} geometry={_sharedFrameGeo}>
        <lineBasicMaterial
          color={edgeColor}
          transparent
          opacity={0.6}
          linewidth={1}
        />
      </lineLoop>

      {/* Emissive edge glow — shared geometries (PERF2), hidden when back-facing (PERF1) */}
      <mesh position={[0, H / 2, 0.001]} geometry={_sharedEdgeHGeo} ref={(el) => { if (el) edgeMeshRefs.current[0] = el }}>
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : edgeBaseOpacity} />
      </mesh>
      <mesh position={[0, -H / 2, 0.001]} geometry={_sharedEdgeHGeo} ref={(el) => { if (el) edgeMeshRefs.current[1] = el }}>
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : edgeBaseOpacity} />
      </mesh>
      <mesh position={[-W / 2, 0, 0.001]} geometry={_sharedEdgeVGeo} ref={(el) => { if (el) edgeMeshRefs.current[2] = el }}>
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : edgeBaseOpacity} />
      </mesh>
      <mesh position={[W / 2, 0, 0.001]} geometry={_sharedEdgeVGeo} ref={(el) => { if (el) edgeMeshRefs.current[3] = el }}>
        <meshBasicMaterial color={edgeColor} toneMapped={false} transparent opacity={isHovered ? 0.9 : edgeBaseOpacity} />
      </mesh>

      {/* HTML content — deferred mount: only mounts when panel first faces camera (B22 PERF FIX).
          drei's Html with transform recalculates CSS transform3d from world matrix EVERY frame.
          By not mounting Html for back-facing panels, we avoid 50%+ of matrix decompositions.
          Once mounted, Html stays mounted (just hidden via opacity) to avoid flicker. */}
      {htmlMounted && (
        <Html
          transform
          distanceFactor={4}
          position={[0, 0, 0.05]}
          zIndexRange={[1, 0]}
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
            transition: 'opacity 0.15s ease',
            willChange: 'opacity',
            position: 'relative',
          }}>
            {/* CRT scanline overlay — sci-fi holographic display effect */}
            <div style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 10,
              background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
              mixBlendMode: 'multiply',
            }} />
            {/* Horizontal refresh line — sweeps down like a CRT beam */}
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '2px',
              background: `linear-gradient(90deg, transparent, ${edgeColor}44, transparent)`,
              pointerEvents: 'none',
              zIndex: 11,
              animation: 'crtSweep 3s linear infinite',
              opacity: 0.6,
            }} />
            <style>{`
              @keyframes crtSweep {
                0% { top: -2px; }
                100% { top: 100%; }
              }
              @keyframes extPulse {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
              }
            `}</style>
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
                background: ready ? ('#' + theme.success.getHexString()) : ('#' + theme.warning.getHexString()),
                boxShadow: `0 0 8px ${ready ? ('#' + theme.success.getHexString()) : ('#' + theme.warning.getHexString())}`,
                display: 'inline-block', flexShrink: 0,
              }} />
              <span style={{ fontWeight: 700, letterSpacing: '1.5px', fontSize: '12px', textTransform: 'uppercase' }}>
                {projectName}
              </span>
              {isExternal && (
                <span style={{
                  fontSize: '7px', letterSpacing: '1px', color: '#c084fc',
                  background: 'rgba(192,132,252,0.15)', border: '1px solid rgba(192,132,252,0.4)',
                  padding: '1px 4px', borderRadius: '2px', flexShrink: 0,
                  animation: 'extPulse 2s ease-in-out infinite',
                }} title="External Claude session detected">
                  EXT
                </span>
              )}
              {rulesOutdated && (
                <span style={{
                  fontSize: '7px', letterSpacing: '1px', color: '#fb923c',
                  background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.35)',
                  padding: '1px 4px', borderRadius: '2px', flexShrink: 0,
                }} title="HAL-O rules update available">
                  UPDATE
                </span>
              )}
              {isFavorite && (
                <span className="favorite-star" title="Favorite" style={{
                  fontSize: '10px', color: '#fbbf24', flexShrink: 0, lineHeight: 1,
                  textShadow: '0 0 6px rgba(251,191,36,0.6)',
                }}>&#x2605;</span>
              )}
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
              {isExternal && onAbsorb && (
                <button onClick={onAbsorb} disabled={isAbsorbing} style={btnAbsorb}>
                  {isAbsorbing ? 'ABSORBING...' : 'ABSORB'}
                </button>
              )}
              <button onClick={onResume} style={btnPrimary}>RESUME</button>
              <button onClick={onNewSession} style={btnGhost}>NEW</button>
              {runCmd && onRunApp && <button onClick={onRunApp} style={{ ...btnGhost, color: '#22d3ee', borderColor: 'rgba(34,211,238,0.3)' }}>RUN</button>}
              <button onClick={onFiles} style={btnGhost}>FILES</button>
              {onOpenIde && (
                <button
                  onClick={onOpenIde}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onOpenIdeMenu?.(e) }}
                  style={{ ...btnGhost, color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)' }}
                  title={ideLabel ? `Open in ${ideLabel} (right-click to change)` : 'Open in IDE'}
                >
                  {ideLabel || '</>'}
                </button>
              )}
              {onOpenTerminal && (
                <button
                  onClick={onOpenTerminal}
                  style={{ ...btnGhost, color: '#34d399', borderColor: 'rgba(52,211,153,0.3)' }}
                  title="Open external terminal"
                >
                  {'>_'}
                </button>
              )}
            </div>
            </div>{/* close zIndex:1 content wrapper */}
          </div>
        </Html>
      )}
    </group>
  )
}, screenPanelAreEqual)
