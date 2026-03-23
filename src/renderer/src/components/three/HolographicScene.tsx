import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { Starfield } from './Starfield'
import { ScreenPanel } from './ScreenPanel'
import type { ProjectInfo } from '../../types'
import { LAYOUT_3D_FNS } from '../../layouts3d'

// ── Holographic colors (cyan, not green) ──
const CYAN = '#00d4ff'
const CYAN_DIM = '#006688'
const RED = '#ff2200'

// ── Dark Platform Floor ──
function HoloFloor() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  useFrame((_, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += delta
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <circleGeometry args={[15, 128]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        uniforms={{
          uTime: { value: 0 },
        }}
        vertexShader={`
          varying vec2 vUv;
          varying vec3 vWorldPos;
          void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vWorldPos;

          void main() {
            float dist = length(vWorldPos.xz);

            // Thin grid
            float gs = 1.5;
            vec2 g = abs(fract(vWorldPos.xz / gs - 0.5) - 0.5) / fwidth(vWorldPos.xz / gs);
            float line = 1.0 - min(min(g.x, g.y), 1.0);

            // Edge fade
            float edge = smoothstep(15.0, 12.0, dist);
            float centerFade = smoothstep(0.0, 3.0, dist);

            // Dark surface
            vec3 baseColor = vec3(0.01, 0.015, 0.02);

            // Grid lines — very subtle cyan
            vec3 gridColor = vec3(0.0, 0.3, 0.5) * line * 0.08 * edge;

            // Red center reflection from sphere
            float redGlow = exp(-dist * 0.3) * 0.06;
            vec3 redReflect = vec3(1.0, 0.05, 0.0) * redGlow;

            vec3 color = baseColor + gridColor + redReflect;
            float alpha = (0.9 + line * 0.05) * edge;

            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </mesh>
  )
}

// ── Concentric Ring Platform ──
function RingPlatform() {
  const groupRef = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.02
  })

  // Multiple ring layers with varying properties
  const rings = [
    // Inner rings — redder, closer to sphere
    { r: 1.5, w: 0.08, color: '#ff3322', opacity: 0.3, segments: 64 },
    { r: 2.0, w: 0.03, color: CYAN_DIM, opacity: 0.4, segments: 80 },
    { r: 2.5, w: 0.12, color: '#003355', opacity: 0.25, segments: 96 },
    // Middle rings — cyan
    { r: 3.0, w: 0.04, color: CYAN, opacity: 0.35, segments: 64 },
    { r: 3.5, w: 0.15, color: '#002244', opacity: 0.2, segments: 128 },
    { r: 4.0, w: 0.03, color: CYAN_DIM, opacity: 0.4, segments: 80 },
    { r: 4.5, w: 0.06, color: CYAN, opacity: 0.3, segments: 96 },
    // Outer rings — where screens sit
    { r: 5.5, w: 0.2, color: '#001a33', opacity: 0.15, segments: 128 },
    { r: 6.0, w: 0.04, color: CYAN_DIM, opacity: 0.3, segments: 64 },
    { r: 6.5, w: 0.08, color: CYAN, opacity: 0.2, segments: 96 },
    { r: 7.0, w: 0.03, color: CYAN_DIM, opacity: 0.25, segments: 80 },
    { r: 7.5, w: 0.15, color: '#001122', opacity: 0.12, segments: 128 },
    { r: 8.0, w: 0.04, color: CYAN_DIM, opacity: 0.2, segments: 64 },
  ]

  // Arc segments — partial rings with gaps
  const arcs = [
    { r: 2.2, w: 0.06, start: 0, arc: Math.PI * 1.2, color: '#ff2200', opacity: 0.15 },
    { r: 3.2, w: 0.1, start: 1, arc: Math.PI * 0.8, color: CYAN, opacity: 0.12 },
    { r: 4.8, w: 0.08, start: 2.5, arc: Math.PI * 1.5, color: CYAN_DIM, opacity: 0.15 },
    { r: 5.8, w: 0.12, start: 0.5, arc: Math.PI * 1.0, color: CYAN, opacity: 0.1 },
    { r: 7.2, w: 0.06, start: 3.0, arc: Math.PI * 0.7, color: CYAN_DIM, opacity: 0.12 },
  ]

  // Tick marks on specific rings
  const tickRings = [
    { r: 3.0, count: 60, len: 0.15 },
    { r: 4.5, count: 80, len: 0.1 },
    { r: 6.0, count: 48, len: 0.2 },
    { r: 7.5, count: 100, len: 0.08 },
  ]

  return (
    <group ref={groupRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      {/* Full rings */}
      {rings.map((ring, i) => (
        <mesh key={`ring-${i}`}>
          <ringGeometry args={[ring.r - ring.w / 2, ring.r + ring.w / 2, ring.segments]} />
          <meshBasicMaterial color={ring.color} transparent opacity={ring.opacity} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Arc segments */}
      {arcs.map((arc, i) => (
        <mesh key={`arc-${i}`} rotation={[0, 0, arc.start]}>
          <ringGeometry args={[arc.r - arc.w / 2, arc.r + arc.w / 2, 64, 1, 0, arc.arc]} />
          <meshBasicMaterial color={arc.color} transparent opacity={arc.opacity} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Tick marks */}
      {tickRings.map((tr, ri) => {
        const positions: number[] = []
        for (let i = 0; i < tr.count; i++) {
          const a = (i / tr.count) * Math.PI * 2
          const cos = Math.cos(a), sin = Math.sin(a)
          const isMajor = i % 5 === 0
          const l = isMajor ? tr.len : tr.len * 0.5
          positions.push(cos * (tr.r - l), sin * (tr.r - l), 0)
          positions.push(cos * (tr.r + l), sin * (tr.r + l), 0)
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        return (
          <lineSegments key={`ticks-${ri}`} geometry={geo}>
            <lineBasicMaterial color={CYAN_DIM} transparent opacity={0.25} />
          </lineSegments>
        )
      })}

      {/* Bright marker dots on outer ring */}
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2
        return (
          <mesh key={`dot-${i}`} position={[Math.cos(a) * 6.5, Math.sin(a) * 6.5, 0.01]}>
            <circleGeometry args={[0.04, 8]} />
            <meshBasicMaterial color={CYAN} toneMapped={false} transparent opacity={0.6} />
          </mesh>
        )
      })}
    </group>
  )
}

// ── Red Atmospheric Glow ──
function AtmosphericGlow() {
  return (
    <mesh position={[0, 2, 0]}>
      <sphereGeometry args={[4, 16, 16]} />
      <meshBasicMaterial color="#ff1100" transparent opacity={0.015} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  )
}

// ── Post Processing ──
function PostProcessing() {
  const { gl } = useThree()
  const [ready, setReady] = useState(false)
  const offset = useMemo(() => new Vector2(0.0008, 0.0008), [])

  // Delay one frame so the WebGL context is fully initialized after Canvas remount
  useEffect(() => { setReady(true) }, [])

  if (!ready || !gl?.domElement) return null
  return (
    <EffectComposer>
      <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.8} intensity={3.5} radius={0.95} mipmapBlur />
      <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={offset} />
      <Vignette darkness={0.65} offset={0.3} />
    </EffectComposer>
  )
}

// ── Main Scene ──

interface Props {
  projects: ProjectInfo[]
  listening: boolean
  isFullySetup: (p: ProjectInfo) => boolean
  onOpenTerminal?: (path: string, name: string, resume: boolean) => void
  layoutId?: string
  screenOpacity?: number
}

export function HolographicScene({ projects, listening, isFullySetup, onOpenTerminal, layoutId = 'default', screenOpacity = 1 }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const screenPositions = useMemo(() => {
    const layoutFn = LAYOUT_3D_FNS[layoutId] || LAYOUT_3D_FNS['default']
    return layoutFn(projects.length)
  }, [projects.length, layoutId])

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      camera={{ position: [0, 5, 11], fov: 55, near: 0.1, far: 1000 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#010104']} />
      <ambientLight intensity={0.02} />

      <Starfield />
      <HoloFloor />
      <RingPlatform />
      <AtmosphericGlow />

      {/* HAL Sphere — imported, keeps its red wireframe */}
      <group>
        {/* Using inline sphere for holographic — bigger, more defined wireframe */}
        <mesh>
          <sphereGeometry args={[1.2, 32, 20]} />
          <meshBasicMaterial color="#ff2200" wireframe transparent opacity={0.45} toneMapped={false} />
        </mesh>
        {/* Inner glow core */}
        <mesh scale={0.4}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="#ff4400" transparent opacity={0.9} toneMapped={false} />
        </mesh>
        {/* Equatorial bright band */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.2, 0.015, 8, 64]} />
          <meshBasicMaterial color="#ff4400" toneMapped={false} transparent opacity={0.7} />
        </mesh>
        {/* Vertical meridian */}
        <mesh>
          <torusGeometry args={[1.2, 0.01, 8, 64]} />
          <meshBasicMaterial color="#ff3300" toneMapped={false} transparent opacity={0.5} />
        </mesh>
        {/* Point light */}
        <pointLight color="#ff2200" intensity={4} distance={20} decay={2} />
      </group>

      {/* 3D Screen Panels */}
      {projects.map((project, i) => {
        const sp = screenPositions[i]
        if (!sp) return null
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
            healthStatus={(project as any).configLevel === 'bare' ? 'neutral' : !isFullySetup(project) ? 'warning' : 'ok'}
            demoStats={project.demoStats}
            screenOpacity={screenOpacity}
          />
        )
      })}

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={5}
        maxDistance={20}
        minPolarAngle={0.4}
        maxPolarAngle={Math.PI / 2.2}
        autoRotate
        autoRotateSpeed={0.15}
        target={[0, 0.3, 0]}
      />

      <PostProcessing />
    </Canvas>
  )
}
