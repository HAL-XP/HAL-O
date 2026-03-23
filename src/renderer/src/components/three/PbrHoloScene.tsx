import { useMemo, useState, useRef, useEffect } from 'react'
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
import { LAYOUT_3D_FNS, GROUP_LAYOUT_3D_FNS } from '../../layouts3d'

const CYAN = new THREE.Color('#00d4ff')
const RED = new THREE.Color('#ff2200')

// ── Reflective Floor Platform ──
function ReflectiveFloor() {
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
        color="#040608"
        blur={[400, 150]}
      />
    </mesh>
  )
}

// ── Grid Lines (separate mesh on top of reflective floor) ──
function GridOverlay() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  useFrame((_, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += delta
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <circleGeometry args={[16, 128]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        uniforms={{ uTime: { value: 0 } }}
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
          varying vec3 vWorldPos;
          void main() {
            float dist = length(vWorldPos.xz);
            float gs = 1.5;
            vec2 g = abs(fract(vWorldPos.xz / gs - 0.5) - 0.5) / fwidth(vWorldPos.xz / gs);
            float line = 1.0 - min(min(g.x, g.y), 1.0);
            float edge = smoothstep(16.0, 10.0, dist);
            vec3 color = vec3(0.0, 0.5, 0.8) * line * 0.06;
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
  const groupRef = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.015
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Torus rings removed — shader disc handles all ring visuals */}

      {/* Bright marker dots */}
      {/* Shader ring lines — kept as fallback, may be hidden by texture */}
      <mesh position={[0, 0, -0.01]}>
        <ringGeometry args={[1.0, 8.5, 128]} />
        <shaderMaterial
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
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
            varying vec2 vUv;
            varying float vDist;

            void main() {
              // Dark base
              vec3 base = vec3(0.015, 0.02, 0.025);

              // Concentric ring lines at specific radii
              float line = 0.0;

              // Inner red rings
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

              // Color: red near center, cyan at edges
              float t = smoothstep(1.5, 5.0, vDist);
              vec3 innerColor = vec3(1.0, 0.1, 0.0);
              vec3 outerColor = vec3(0.0, 0.7, 1.0);
              vec3 lineColor = mix(innerColor, outerColor, t);

              // Fade lines on far side (distance from front edge)
              // vDist is the ring radius, but we also need camera-facing fade
              // Use a simple front-bias: fade based on how far back the point is
              float frontFade = 1.0; // shader disc is flat, all points are equal distance in disc-space

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
            <meshStandardMaterial emissive="#00d4ff" emissiveIntensity={3} toneMapped={false} color="#003355" metalness={1} roughness={0} />
          </mesh>
        )
      })}
    </group>
  )
}

// ── HAL Sphere — PBR version ──
function PbrHalSphere() {
  const wireRef = useRef<THREE.Mesh>(null)
  const coreRef = useRef<THREE.Mesh>(null)

  useFrame((state, delta) => {
    if (wireRef.current) wireRef.current.rotation.y += delta * 0.15
    if (coreRef.current) {
      const s = 0.38 + Math.sin(state.clock.elapsedTime * 2) * 0.03
      coreRef.current.scale.setScalar(s)
    }
  })

  return (
    <group position={[0, 1.3, 0]}>
      {/* Wireframe globe */}
      <mesh ref={wireRef}>
        <sphereGeometry args={[1.3, 36, 24]} />
        <meshStandardMaterial
          color="#330000"
          emissive="#ff2200"
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
          color="#110000"
          emissive="#ff1100"
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
          color="#ff2200"
          emissive="#ff4400"
          emissiveIntensity={3}
          toneMapped={false}
        />
      </mesh>

      {/* Equatorial band */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.3, 0.02, 8, 128]} />
        <meshStandardMaterial emissive="#ff4400" emissiveIntensity={2} toneMapped={false} metalness={1} roughness={0} />
      </mesh>

      {/* Latitude rings for globe detail */}
      {[0.4, 0.8, -0.4, -0.8].map((y, i) => (
        <mesh key={`lat-${i}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[Math.sqrt(1.3 * 1.3 - y * y), 0.006, 6, 64]} />
          <meshStandardMaterial emissive="#ff2200" emissiveIntensity={0.5} toneMapped={false} metalness={1} roughness={0} />
        </mesh>
      ))}

      {/* Red atmospheric glow — subtle, smaller */}
      <mesh>
        <sphereGeometry args={[2, 16, 16]} />
        <meshBasicMaterial color="#ff1100" transparent opacity={0.008} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Lights from sphere — contained, not flooding */}
      <pointLight color="#ff2200" intensity={3} distance={8} decay={2} />
      <pointLight color="#ff4400" intensity={1.5} distance={5} decay={2} position={[0, 1, 0]} />
    </group>
  )
}

// ── Sonar Pulse Ring — HAL heartbeat indicator ──
function PulseRing() {
  const ringRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  // Each ring cycles: scale 1→3 over 3s, opacity 0.6→0
  useFrame((state) => {
    if (!ringRef.current || !matRef.current) return
    // Use a smooth sawtooth based on clock
    const t = (state.clock.elapsedTime % 3) / 3 // 0→1 over 3 seconds
    const scale = 1 + t * 2 // 1→3
    ringRef.current.scale.set(scale, scale, 1)
    matRef.current.opacity = 0.6 * (1 - t) * (1 - t) // quadratic fade for smoother tail
  })

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <ringGeometry args={[0.8, 1.0, 128]} />
      <meshBasicMaterial
        ref={matRef}
        color="#00d4ff"
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
          color="#00d4ff"
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
function PostFX() {
  const { gl } = useThree()
  const offset = useMemo(() => new Vector2(0.0006, 0.0006), [])
  // Guard: EffectComposer crashes if WebGL context isn't fully ready (canvas remount race)
  if (!gl?.domElement) return null
  return (
    <EffectComposer>
      <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.8} intensity={1.8} radius={0.7} mipmapBlur />
      <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={offset} />
      <Vignette darkness={0.6} offset={0.3} />
    </EffectComposer>
  )
}

// ── Scene Lighting ──
function SceneLights() {
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
            color="#224466"
            distance={12}
          />
        )
      })}
    </>
  )
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
}

export function PbrHoloScene({ projects, listening, isFullySetup, onOpenTerminal, halOnline, layoutId = 'default', terminalCount = 0, vfxFrequency = 0, groups = [], assignments = {}, camera = DEFAULT_CAMERA }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const flybyRef = useRef<SpaceshipFlybyHandle>(null)
  const prevTermCountRef = useRef(terminalCount)

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
      <color attach="background" args={['#010104']} />

      <SceneLights />
      {/* No starfield in PBR — pure dark cinematic */}
      <ReflectiveFloor />
      <GridOverlay />
      <TexturedPlatform />
      <PbrRingPlatform />
      <PbrHalSphere />

      {/* Ambient data particles */}
      <DataParticles projectCount={projects.length} hideDist={camera.particleHideDist} />

      {/* Scrolling HUD text strips — left and right edges */}
      <HudScrollText />

      {/* Spaceship flyby — triggered on new terminal open */}
      <SpaceshipFlyby ref={flybyRef} />

      {/* Sonar pulse — HAL heartbeat */}
      {halOnline && <SonarPulse />}

      {/* Screens */}
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
            groupColor={projectGroupColors[i]}
          />
        )
      })}

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

      <PostFX />
    </Canvas>
  )
}
