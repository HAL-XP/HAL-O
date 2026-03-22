import { useMemo, useState, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, MeshReflectorMaterial, Float } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { Starfield } from './Starfield'
import { ScreenPanel } from './ScreenPanel'
import type { ProjectInfo } from '../../types'

const CYAN = new THREE.Color('#00d4ff')
const RED = new THREE.Color('#ff2200')

// ── Reflective Floor Platform ──
function ReflectiveFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <circleGeometry args={[16, 128]} />
      <MeshReflectorMaterial
        mirror={0.15}
        resolution={1024}
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

// ── Concentric Ring Platform with PBR materials ──
function PbrRingPlatform() {
  const groupRef = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.015
  })

  const ringDefs = [
    // Inner — red zone (thin, etched into surface)
    { r: 1.5, tube: 0.03, color: '#220000', emissive: '#ff2200', ei: 1.0 },
    { r: 1.9, tube: 0.015, color: '#110000', emissive: '#ff1100', ei: 0.6 },
    { r: 2.3, tube: 0.05, color: '#110808', emissive: '#991100', ei: 0.4 },
    { r: 2.7, tube: 0.02, color: '#110000', emissive: '#cc1100', ei: 0.5 },
    // Middle — transition zone
    { r: 3.2, tube: 0.025, color: '#001a2e', emissive: '#006699', ei: 0.8 },
    { r: 3.6, tube: 0.06, color: '#001222', emissive: '#003355', ei: 0.3 },
    { r: 4.0, tube: 0.02, color: '#003355', emissive: '#00bbee', ei: 1.0 },
    { r: 4.4, tube: 0.04, color: '#001522', emissive: '#004466', ei: 0.35 },
    { r: 4.8, tube: 0.015, color: '#004466', emissive: '#00ccee', ei: 0.7 },
    // Outer — screen zone
    { r: 5.3, tube: 0.05, color: '#001a33', emissive: '#004466', ei: 0.3 },
    { r: 5.7, tube: 0.02, color: '#005577', emissive: '#00d4ff', ei: 1.0 },
    { r: 6.1, tube: 0.04, color: '#001a2e', emissive: '#004466', ei: 0.35 },
    { r: 6.5, tube: 0.025, color: '#006688', emissive: '#00d4ff', ei: 0.9 },
    // Edge rings
    { r: 6.9, tube: 0.05, color: '#001122', emissive: '#003355', ei: 0.25 },
    { r: 7.3, tube: 0.02, color: '#005577', emissive: '#00ccdd', ei: 0.7 },
    { r: 7.7, tube: 0.03, color: '#001a2e', emissive: '#003355', ei: 0.3 },
  ]

  return (
    <group ref={groupRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Torus rings removed — shader disc handles all ring visuals */}

      {/* Bright marker dots */}
      {/* Platform disc with ETCHED ring lines via shader */}
      <mesh position={[0, 0, 0.01]}>
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

  useFrame((_, delta) => {
    if (wireRef.current) wireRef.current.rotation.y += delta * 0.15
    if (coreRef.current) {
      const s = 0.38 + Math.sin(Date.now() * 0.002) * 0.03
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

// ── Post Processing ──
function PostFX() {
  const offset = useMemo(() => new Vector2(0.0006, 0.0006), [])
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
}

export function PbrHoloScene({ projects, listening, isFullySetup, onOpenTerminal }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const screenPositions = useMemo(() => {
    const count = projects.length
    const radius = 7
    const yBase = 0.8
    return projects.map((_, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2
      return {
        position: [Math.cos(angle) * radius, yBase, Math.sin(angle) * radius] as [number, number, number],
        rotation: [0, -angle + Math.PI / 2, 0] as [number, number, number],
      }
    })
  }, [projects.length])

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      camera={{ position: [0, 12, 14], fov: 42, near: 0.1, far: 1000 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      shadows
    >
      <color attach="background" args={['#010104']} />

      <SceneLights />
      {/* No starfield in PBR — pure dark cinematic */}
      <ReflectiveFloor />
      <GridOverlay />
      <PbrRingPlatform />
      <PbrHalSphere />

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
            stack={project.stack}
            ready={isFullySetup(project)}
            isHovered={hoveredId === project.path}
            onHover={(h) => setHoveredId(h ? project.path : null)}
            onResume={() => onOpenTerminal?.(project.path, project.name, true)}
            onNewSession={() => onOpenTerminal?.(project.path, project.name, false)}
            onFiles={() => window.api.openFolder(project.path)}
            runCmd={project.runCmd}
            onRunApp={project.runCmd ? () => window.api.runApp(project.path, project.runCmd) : undefined}
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
