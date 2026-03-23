import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls, Environment, MeshReflectorMaterial, Float, useTexture } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { Starfield } from './Starfield'
import { ScreenPanel } from './ScreenPanel'
import { DataParticles } from './DataParticles'
import { HudScrollText } from './HudScrollText'
import { SpaceshipFlyby } from './SpaceshipFlyby'
import type { SpaceshipFlybyHandle } from './SpaceshipFlyby'
import type { ProjectInfo } from '../../types'
import type { ProjectGroup } from '../../hooks/useProjectGroups'
import { DEFAULT_CAMERA, type CameraSettings } from '../../hooks/useSettings'
import { LAYOUT_3D_FNS, GROUP_LAYOUT_3D_FNS, computeStackInfo } from '../../layouts3d'
import { StackIndicatorPanel } from './StackIndicatorPanel'
import { ThreeThemeProvider, useThreeTheme } from '../../contexts/ThreeThemeContext'

// ── Reflective Floor Platform ──
function ReflectiveFloor() {
  const theme = useThreeTheme()
  // Derive a dark floor color from the screen face
  const floorColor = useMemo(() => {
    return theme.screenFaceHex
  }, [theme.screenFaceHex])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <circleGeometry args={[16, 128]} />
      <MeshReflectorMaterial
        mirror={0.15}
        resolution={512}
        mixBlur={10}
        mixStrength={0.4}
        roughness={0.92}
        metalness={0.3}
        color={floorColor}
        blur={[400, 150]}
      />
    </mesh>
  )
}

// ── Grid Lines (separate mesh on top of reflective floor) ──
function GridOverlay() {
  const theme = useThreeTheme()
  const matRef = useRef<THREE.ShaderMaterial>(null)

  // Convert gridLine color to vec3 for shader
  const gridRGB = useMemo(() => {
    const c = theme.gridLine
    return [c.r, c.g, c.b]
  }, [theme.gridLine])

  useFrame((_, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += delta
  })

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uGridColor: { value: new THREE.Vector3(gridRGB[0], gridRGB[1], gridRGB[2]) },
  }), [gridRGB])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <circleGeometry args={[16, 128]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vWorldPos;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform vec3 uGridColor;
          varying vec3 vWorldPos;
          void main() {
            float dist = length(vWorldPos.xz);
            float gs = 1.5;
            vec2 g = abs(fract(vWorldPos.xz / gs - 0.5) - 0.5) / fwidth(vWorldPos.xz / gs);
            float line = 1.0 - min(min(g.x, g.y), 1.0);
            float edge = smoothstep(16.0, 10.0, dist);
            vec3 color = uGridColor * line * 0.5;
            float alpha = line * 0.1 * edge;
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </mesh>
  )
}

// ── Textured Platform Disc ──
function TexturedPlatform() {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useMemo(() => {
    const loader = new THREE.TextureLoader()
    loader.load('/ring_platform.png',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        setTexture(tex)
        console.log('[PBR] Ring platform texture loaded')
      },
      undefined,
      (err) => console.error('[PBR] Texture load failed:', err)
    )
  }, [])

  if (!texture) return null

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <circleGeometry args={[12, 128]} />
      <meshStandardMaterial
        map={texture}
        emissiveMap={texture}
        emissive="#ffffff"
        emissiveIntensity={2.0}
        metalness={0.7}
        roughness={0.3}
        toneMapped={false}
      />
    </mesh>
  )
}

// ── Concentric Ring Platform with PBR materials ──
function PbrRingPlatform() {
  const theme = useThreeTheme()
  const groupRef = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.015
  })

  // Derive inner/outer colors from theme
  const innerRGB = useMemo(() => {
    const c = theme.sphere
    return [c.r, c.g, c.b]
  }, [theme.sphere])
  const outerRGB = useMemo(() => {
    const c = theme.accent
    return [c.r, c.g, c.b]
  }, [theme.accent])

  return (
    <group ref={groupRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Shader ring lines — concentric rings with theme colors */}
      <mesh position={[0, 0, -0.01]}>
        <ringGeometry args={[1.0, 8.5, 128]} />
        <shaderMaterial
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          uniforms={{
            uInnerColor: { value: new THREE.Vector3(innerRGB[0], innerRGB[1], innerRGB[2]) },
            uOuterColor: { value: new THREE.Vector3(outerRGB[0], outerRGB[1], outerRGB[2]) },
          }}
          vertexShader={`
            varying vec2 vUv;
            varying float vDist;
            void main() {
              vUv = uv;
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vDist = length(wp.xy);
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `}
          fragmentShader={`
            uniform vec3 uInnerColor;
            uniform vec3 uOuterColor;
            varying vec2 vUv;
            varying float vDist;

            void main() {
              // Dark base
              vec3 base = vec3(0.015, 0.02, 0.025);

              // Concentric ring lines at specific radii
              float line = 0.0;

              // Inner rings
              line += smoothstep(0.02, 0.0, abs(vDist - 1.5)) * 0.8;
              line += smoothstep(0.015, 0.0, abs(vDist - 1.9)) * 0.5;
              line += smoothstep(0.03, 0.0, abs(vDist - 2.3)) * 0.6;
              line += smoothstep(0.015, 0.0, abs(vDist - 2.7)) * 0.4;

              // Transition rings
              line += smoothstep(0.02, 0.0, abs(vDist - 3.2)) * 0.7;
              line += smoothstep(0.04, 0.0, abs(vDist - 3.6)) * 0.3;
              line += smoothstep(0.015, 0.0, abs(vDist - 4.0)) * 0.9;
              line += smoothstep(0.03, 0.0, abs(vDist - 4.4)) * 0.4;
              line += smoothstep(0.015, 0.0, abs(vDist - 4.8)) * 0.6;

              // Outer rings
              line += smoothstep(0.035, 0.0, abs(vDist - 5.3)) * 0.3;
              line += smoothstep(0.015, 0.0, abs(vDist - 5.7)) * 0.8;
              line += smoothstep(0.025, 0.0, abs(vDist - 6.1)) * 0.4;
              line += smoothstep(0.02, 0.0, abs(vDist - 6.5)) * 0.7;
              line += smoothstep(0.04, 0.0, abs(vDist - 6.9)) * 0.3;
              line += smoothstep(0.015, 0.0, abs(vDist - 7.3)) * 0.6;

              // Color: inner near center, outer at edges
              float t = smoothstep(1.5, 5.0, vDist);
              vec3 lineColor = mix(uInnerColor, uOuterColor, t);

              float frontFade = 1.0;

              // Pulse wave expanding from center
              float pulse = smoothstep(0.3, 0.0, abs(vDist - mod(uTime * 2.0, 9.0))) * 0.3;
              line += pulse;

              vec3 color = lineColor * line * 0.8;
              float alpha = line * 0.8;

              gl_FragColor = vec4(color, alpha);
            }
          `}
        />
      </mesh>

      {Array.from({ length: 32 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2
        const r = 7.0
        return (
          <mesh key={`dot-${i}`} position={[Math.cos(a) * r, Math.sin(a) * r, -0.03]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial emissive={theme.accentHex} emissiveIntensity={3} toneMapped={false} color={theme.def.accentDim} metalness={1} roughness={0} />
          </mesh>
        )
      })}
    </group>
  )
}

// ── HAL Sphere — PBR version ──
function PbrHalSphere({ blockedInput = false }: { blockedInput?: boolean }) {
  const theme = useThreeTheme()
  const wireRef = useRef<THREE.Mesh>(null)
  const coreRef = useRef<THREE.Mesh>(null)
  const flashRef = useRef(0) // countdown timer for blocked flash

  // Derive a darkened version of sphere color for the wireframe base
  const sphereDark = useMemo(() => {
    const c = theme.sphere.clone()
    const hsl = { h: 0, s: 0, l: 0 }
    c.getHSL(hsl)
    c.setHSL(hsl.h, hsl.s, hsl.l * 0.2)
    return '#' + c.getHexString()
  }, [theme.sphere])

  const sphereVeryDark = useMemo(() => {
    const c = theme.sphere.clone()
    const hsl = { h: 0, s: 0, l: 0 }
    c.getHSL(hsl)
    c.setHSL(hsl.h, hsl.s, hsl.l * 0.08)
    return '#' + c.getHexString()
  }, [theme.sphere])

  // Trigger flash when blockedInput goes true
  useEffect(() => {
    if (blockedInput) flashRef.current = 0.5 // 0.5 second flash
  }, [blockedInput])

  useFrame((state, delta) => {
    if (wireRef.current) wireRef.current.rotation.y += delta * 0.15
    if (coreRef.current) {
      const s = 0.38 + Math.sin(state.clock.elapsedTime * 2) * 0.03
      coreRef.current.scale.setScalar(s)

      // Blocked flash: briefly flash core red
      if (flashRef.current > 0) {
        flashRef.current -= delta
        const intensity = Math.max(0, flashRef.current / 0.5)
        const mat = coreRef.current.material as THREE.MeshStandardMaterial
        mat.emissive.setRGB(1, intensity * 0.2, intensity * 0.2) // red flash
        mat.emissiveIntensity = 3 + intensity * 8
      }
    }
  })

  return (
    <group position={[0, 1.3, 0]}>
      {/* Wireframe globe */}
      <mesh ref={wireRef}>
        <sphereGeometry args={[1.3, 36, 24]} />
        <meshStandardMaterial
          color={sphereDark}
          emissive={theme.sphereHex}
          emissiveIntensity={0.6}
          wireframe
          transparent
          opacity={0.7}
          metalness={0.9}
          roughness={0.2}
          toneMapped={false}
        />
      </mesh>

      {/* Inner volume — subtle fill */}
      <mesh>
        <sphereGeometry args={[1.25, 32, 32]} />
        <meshStandardMaterial
          color={sphereVeryDark}
          emissive={theme.sphereHex}
          emissiveIntensity={0.1}
          transparent
          opacity={0.15}
          metalness={0.5}
          roughness={0.8}
        />
      </mesh>

      {/* Bright core */}
      <mesh ref={coreRef} scale={0.38}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial
          color={theme.sphereHex}
          emissive={theme.sphereGlowHex}
          emissiveIntensity={theme.style?.sphereGlowIntensity ?? 3}
          toneMapped={false}
        />
      </mesh>

      {/* Equatorial band */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.3, 0.02, 8, 128]} />
        <meshStandardMaterial emissive={theme.sphereGlowHex} emissiveIntensity={2} toneMapped={false} metalness={1} roughness={0} />
      </mesh>

      {/* Latitude rings for globe detail */}
      {[0.4, 0.8, -0.4, -0.8].map((y, i) => (
        <mesh key={`lat-${i}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[Math.sqrt(1.3 * 1.3 - y * y), 0.006, 6, 64]} />
          <meshStandardMaterial emissive={theme.sphereHex} emissiveIntensity={0.5} toneMapped={false} metalness={1} roughness={0} />
        </mesh>
      ))}

      {/* Atmospheric glow — subtle, smaller */}
      <mesh>
        <sphereGeometry args={[2, 16, 16]} />
        <meshBasicMaterial color={theme.sphereHex} transparent opacity={0.008} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Lights from sphere — contained, not flooding */}
      <pointLight color={theme.sphereHex} intensity={3} distance={8} decay={2} />
      <pointLight color={theme.sphereGlowHex} intensity={1.5} distance={5} decay={2} position={[0, 1, 0]} />
    </group>
  )
}

// ── Sonar Pulse Ring — HAL heartbeat indicator ──
function PulseRing() {
  const theme = useThreeTheme()
  const ringRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  // Each ring cycles: scale 1->3 over 3s, opacity 0.6->0
  useFrame((state) => {
    if (!ringRef.current || !matRef.current) return
    const t = (state.clock.elapsedTime % 3) / 3
    const scale = 1 + t * 2
    ringRef.current.scale.set(scale, scale, 1)
    matRef.current.opacity = 0.6 * (1 - t) * (1 - t)
  })

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <ringGeometry args={[0.8, 1.0, 128]} />
      <meshBasicMaterial
        ref={matRef}
        color={theme.accentHex}
        transparent
        opacity={0.6}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

// Two staggered pulse rings for continuous sonar effect
function SonarPulse() {
  const theme = useThreeTheme()
  const ring2Ref = useRef<THREE.Mesh>(null)
  const mat2Ref = useRef<THREE.MeshBasicMaterial>(null)

  // Second ring is offset by 1.5s (half the 3s cycle)
  useFrame((state) => {
    if (!ring2Ref.current || !mat2Ref.current) return
    const t = ((state.clock.elapsedTime + 1.5) % 3) / 3
    const scale = 1 + t * 2
    ring2Ref.current.scale.set(scale, scale, 1)
    mat2Ref.current.opacity = 0.6 * (1 - t) * (1 - t)
  })

  return (
    <group>
      <PulseRing />
      {/* Second staggered ring */}
      <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.8, 1.0, 128]} />
        <meshBasicMaterial
          ref={mat2Ref}
          color={theme.accentHex}
          transparent
          opacity={0.6}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

// ── Post Processing ──
class PostFXErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch() { /* EffectComposer alpha crash — swallow and retry */ }
  componentDidUpdate(_: any, prevState: { hasError: boolean }) {
    if (this.state.hasError && !prevState.hasError) {
      setTimeout(() => this.setState({ hasError: false }), 500)
    }
  }
  render() { return this.state.hasError ? null : this.props.children }
}

function PostFXInner() {
  const theme = useThreeTheme()
  const { gl } = useThree()
  const chromaticVal = theme.style?.chromaticOffset ?? 0.0006
  const vignetteVal = theme.style?.vignetteStrength ?? 0.6
  const offset = useMemo(() => new Vector2(chromaticVal, chromaticVal), [chromaticVal])

  if (!gl?.domElement || !gl?.getContext?.()) return null
  return (
    <EffectComposer>
      <Bloom luminanceThreshold={theme.bloom.threshold} luminanceSmoothing={0.8} intensity={theme.bloom.intensity} radius={theme.bloom.radius} mipmapBlur />
      <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={offset} />
      <Vignette darkness={vignetteVal} offset={0.3} />
    </EffectComposer>
  )
}

function PostFX() {
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])
  if (!ready) return null
  return (
    <PostFXErrorBoundary>
      <PostFXInner />
    </PostFXErrorBoundary>
  )
}

// ── Scene Lighting ──
function SceneLights() {
  const theme = useThreeTheme()
  // Derive a dim spot light color from accent
  const spotColor = useMemo(() => {
    const c = theme.accent.clone()
    const hsl = { h: 0, s: 0, l: 0 }
    c.getHSL(hsl)
    c.setHSL(hsl.h, hsl.s * 0.6, hsl.l * 0.3)
    return '#' + c.getHexString()
  }, [theme.accent])

  return (
    <>
      <ambientLight intensity={0.008} color="#080818" />
      {/* Overhead spot lights illuminating the screens */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        const r = 7
        return (
          <spotLight
            key={i}
            position={[Math.cos(a) * r, 6, Math.sin(a) * r]}
            target-position={[Math.cos(a) * r, 0, Math.sin(a) * r]}
            angle={0.4}
            penumbra={0.8}
            intensity={0.5}
            color={spotColor}
            distance={12}
          />
        )
      })}
    </>
  )
}

// ── Scene Background ──
function SceneBackground() {
  const theme = useThreeTheme()
  return <color attach="background" args={[theme.backgroundHex]} />
}

// ── Camera Driver — pushes settings changes into the actual Three.js camera + OrbitControls ──
function CameraDriver({ distance, angle }: { distance: number; angle: number }) {
  const { camera, controls } = useThree()
  const prevDist = useRef(distance)
  const prevAngle = useRef(angle)

  useEffect(() => {
    // Only drive camera when settings changed (not from orbit sync)
    if (Math.abs(distance - prevDist.current) > 0.3 || Math.abs(angle - prevAngle.current) > 0.5) {
      const angleRad = (angle * Math.PI) / 180
      const y = Math.sin(angleRad) * distance
      const z = Math.cos(angleRad) * distance
      camera.position.set(0, y, z)
      camera.lookAt(0, 0, 0)
      if (controls && 'update' in controls) (controls as any).update()
      prevDist.current = distance
      prevAngle.current = angle
    }
  }, [distance, angle, camera, controls])

  return null
}

// ── Camera Sync — reads orbit/zoom and reports back to settings sliders ──
function CameraSync({ onCameraMove }: { onCameraMove: (distance: number, angle: number) => void }) {
  const { camera } = useThree()
  const lastReportRef = useRef({ distance: 0, angle: 0, time: 0 })

  useFrame(() => {
    const now = performance.now()
    const last = lastReportRef.current
    // Throttle: max 2 updates/second (500ms)
    if (now - last.time < 500) return

    const distance = camera.position.length()
    const angle = Math.asin(camera.position.y / distance) * (180 / Math.PI)

    // Only report if values changed significantly (distance ±0.5, angle ±1°)
    if (Math.abs(distance - last.distance) < 0.5 && Math.abs(angle - last.angle) < 1) return

    lastReportRef.current = { distance, angle, time: now }
    onCameraMove(distance, angle)
  })

  return null
}

// ── Main PBR Scene ──
interface Props {
  projects: ProjectInfo[]
  listening: boolean
  isFullySetup: (p: ProjectInfo) => boolean
  onOpenTerminal?: (path: string, name: string, resume: boolean) => void
  halOnline?: boolean
  layoutId?: string
  terminalCount?: number
  vfxFrequency?: number // seconds between auto-spawns, 0 = only on terminal open
  groups?: ProjectGroup[]
  assignments?: Record<string, string>
  camera?: CameraSettings
  themeId?: string
  onCameraMove?: (distance: number, angle: number) => void
  blockedInput?: boolean
  onProjectContextMenu?: (x: number, y: number, projectPath: string, projectName: string) => void
}

export function PbrHoloScene({ projects, listening, isFullySetup, onOpenTerminal, halOnline, layoutId = 'default', terminalCount = 0, vfxFrequency = 0, groups = [], assignments = {}, camera = DEFAULT_CAMERA, themeId = 'tactical', onCameraMove, blockedInput = false, onProjectContextMenu }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const flybyRef = useRef<SpaceshipFlybyHandle>(null)
  const prevTermCountRef = useRef(terminalCount)

  // Read --primary CSS var to bridge Tier 1 color palette → Tier 2 3D style
  const [accentHex, setAccentHex] = useState(() => {
    if (typeof document === 'undefined') return '#84cc16'
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#84cc16'
  })

  // Observe style attribute changes on <html> to detect palette switches
  useEffect(() => {
    const root = document.documentElement
    const readAccent = () => {
      const v = getComputedStyle(root).getPropertyValue('--primary').trim()
      if (v) setAccentHex(v)
    }
    readAccent()
    const observer = new MutationObserver(readAccent)
    observer.observe(root, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [])

  // Build group index map: project index -> group order index (-1 = ungrouped)
  const groupIndices = useMemo(() => {
    if (groups.length === 0) return projects.map(() => -1)
    const groupIdToIndex = new Map(groups.map((g, i) => [g.id, i]))
    return projects.map((p) => {
      const gId = assignments[p.path]
      if (!gId) return -1
      return groupIdToIndex.get(gId) ?? -1
    })
  }, [projects, groups, assignments])

  // Build per-project group colors
  const projectGroupColors = useMemo(() => {
    if (groups.length === 0) return projects.map(() => undefined as string | undefined)
    return projects.map((p) => {
      const gId = assignments[p.path]
      if (!gId) return undefined
      return groups.find((g) => g.id === gId)?.color
    })
  }, [projects, groups, assignments])

  // ALL hooks before any conditional return
  const screenPositions = useMemo(() => {
    // Check if this is a group-aware layout
    const groupFn = GROUP_LAYOUT_3D_FNS[layoutId]
    if (groupFn) {
      return groupFn(projects.length, groupIndices, groups.length)
    }
    const layoutFn = LAYOUT_3D_FNS[layoutId] || LAYOUT_3D_FNS['default']
    return layoutFn(projects.length)
  }, [projects.length, layoutId, groupIndices, groups.length])

  // Compute stack info for group-aware layouts (hide overflow, show stack indicators)
  const stackInfo = useMemo(() => {
    const isGroupLayout = !!GROUP_LAYOUT_3D_FNS[layoutId]
    if (!isGroupLayout || groups.length === 0) return null
    return computeStackInfo(groupIndices, groups.length, screenPositions, 6)
  }, [layoutId, groupIndices, groups.length, screenPositions])

  // Build group index -> group name map for stack indicator labels
  const groupNameMap = useMemo(() => {
    const m = new Map<number, string>()
    groups.forEach((g, i) => m.set(i, g.name))
    return m
  }, [groups])

  // Trigger spaceship flyby when a new terminal opens
  useEffect(() => {
    if (terminalCount > prevTermCountRef.current) {
      flybyRef.current?.trigger()
    }
    prevTermCountRef.current = terminalCount
  }, [terminalCount])

  // Periodic VFX spawns (demo mode frequency slider)
  useEffect(() => {
    if (!vfxFrequency || vfxFrequency <= 0) return
    const interval = setInterval(() => {
      flybyRef.current?.trigger()
    }, vfxFrequency * 1000)
    return () => clearInterval(interval)
  }, [vfxFrequency])

  // Compute camera position from settings
  const angleRad = (camera.cameraAngle * Math.PI) / 180
  const camY = Math.sin(angleRad) * camera.cameraDistance
  const camZ = Math.cos(angleRad) * camera.cameraDistance

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      camera={{ position: [0, camY, camZ], fov: 48, near: 0.1, far: 1000 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
    >
      <ThreeThemeProvider styleId={themeId} accentHex={accentHex}>
        <SceneBackground />

        <SceneLights />
        {/* No starfield in PBR — pure dark cinematic */}
        <ReflectiveFloor />
        <GridOverlay />
        <TexturedPlatform />
        <PbrRingPlatform />
        <PbrHalSphere blockedInput={blockedInput} />

        {/* Ambient data particles */}
        <DataParticles projectCount={projects.length} hideDist={camera.particleHideDist} />

        {/* Scrolling HUD text strips — left and right edges */}
        <HudScrollText />

        {/* Spaceship flyby — triggered on new terminal open */}
        <SpaceshipFlyby ref={flybyRef} />

        {/* Sonar pulse — HAL heartbeat */}
        {halOnline && <SonarPulse />}

        {/* Screens — skip stacked (hidden) projects when stack info is active */}
        {projects.map((project, i) => {
          const sp = screenPositions[i]
          if (!sp) return null
          // If stack info exists and this project is not in the visible set, skip it
          if (stackInfo && !stackInfo.visibleIndices.has(i)) return null
          return (
            <ScreenPanel
              key={project.path}
              position={sp.position}
              rotation={sp.rotation}
              projectName={project.name}
              projectPath={project.path}
              stack={project.stack}
              ready={isFullySetup(project)}
              isHovered={hoveredId === project.path}
              onHover={(h) => setHoveredId(h ? project.path : null)}
              onResume={() => onOpenTerminal?.(project.path, project.name, true)}
              onNewSession={() => onOpenTerminal?.(project.path, project.name, false)}
              onFiles={() => window.api.openFolder(project.path)}
              runCmd={project.runCmd}
              onRunApp={project.runCmd ? () => window.api.runApp(project.path, project.runCmd) : undefined}
              groupColor={projectGroupColors[i]}
              healthStatus={(project as any).configLevel === 'bare' ? 'neutral' : !isFullySetup(project) ? 'warning' : 'ok'}
              demoStats={project.demoStats}
              onContextMenu={onProjectContextMenu ? (e: React.MouseEvent) => {
                e.preventDefault()
                onProjectContextMenu(e.clientX, e.clientY, project.path, project.name)
              } : undefined}
            />
          )
        })}

        {/* Stack indicator panels — shown when groups overflow */}
        {stackInfo?.stacks.map((stack) => (
          <StackIndicatorPanel
            key={`stack-${stack.groupIndex}`}
            position={stack.position}
            rotation={stack.rotation}
            count={stack.hiddenCount}
            groupColor={groups[stack.groupIndex]?.color}
            groupName={groupNameMap.get(stack.groupIndex)}
          />
        ))}

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={5}
          maxDistance={20}
          minPolarAngle={0.3}
          maxPolarAngle={Math.PI / 2.2}
          autoRotate
          autoRotateSpeed={0.12}
          target={[0, 0.3, 0]}
        />

        <CameraDriver distance={camera.cameraDistance} angle={camera.cameraAngle} />
        {onCameraMove && <CameraSync onCameraMove={onCameraMove} />}

        <PostFX />
      </ThreeThemeProvider>
    </Canvas>
  )
}
