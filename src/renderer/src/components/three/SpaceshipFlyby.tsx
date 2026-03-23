import { useRef, useImperativeHandle, forwardRef, useMemo, useState, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export interface SpaceshipFlybyHandle {
  trigger: () => void
}

// ── Scratch vectors — never allocate in animation loops ──
const _pos = new THREE.Vector3()
const _tangent = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _lookTarget = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _mat4 = new THREE.Matrix4()
const _shakeOffset = new THREE.Vector3()

// Flight path: a CatmullRom curve that enters from far left,
// sweeps through the scene near the sphere, and exits far right.
const FLIGHT_POINTS = [
  new THREE.Vector3(-30, 3.5, 8),     // entry — far left, slightly behind
  new THREE.Vector3(-12, 2.5, 4),     // approach
  new THREE.Vector3(-3, 1.8, -1),     // close pass near sphere
  new THREE.Vector3(4, 2.2, -2),      // curve through
  new THREE.Vector3(12, 3.0, 5),      // pull away
  new THREE.Vector3(30, 5.0, 10),     // exit — far right, climbing
]

const FLIGHT_CURVE = new THREE.CatmullRomCurve3(FLIGHT_POINTS, false, 'catmullrom', 0.5)
const FLYBY_DURATION = 3.0 // seconds

// ── Engine trail particle pool ──
const TRAIL_COUNT = 60

/**
 * A small spaceship built from basic Three.js geometry.
 * Triggered via ref.trigger() — flies through the scene in ~3 seconds
 * with engine trail, camera shake, and bloom-friendly emissive materials.
 */
export const SpaceshipFlyby = forwardRef<SpaceshipFlybyHandle>(function SpaceshipFlyby(_, ref) {
  const shipGroupRef = useRef<THREE.Group>(null)
  const trailRef = useRef<THREE.Points>(null)
  const engineGlowRef = useRef<THREE.PointLight>(null)
  const engineSphereRef = useRef<THREE.Mesh>(null)
  const { controls } = useThree()

  // Animation state — kept in refs to avoid re-renders
  const activeRef = useRef(false)
  const progressRef = useRef(0)
  const trailIdxRef = useRef(0)
  const originalTargetRef = useRef<THREE.Vector3 | null>(null)

  // Track whether we've ever been active (for cleanup)
  const [visible, setVisible] = useState(false)

  const trigger = useCallback(() => {
    if (activeRef.current) return // don't stack flybys
    activeRef.current = true
    progressRef.current = 0
    trailIdxRef.current = 0
    setVisible(true)

    // Store original orbit target for shake restoration
    if (controls && 'target' in controls) {
      originalTargetRef.current = (controls as any).target.clone()
    }

    // Reset trail positions offscreen
    if (trailRef.current) {
      const posArr = trailRef.current.geometry.attributes.position.array as Float32Array
      for (let i = 0; i < TRAIL_COUNT * 3; i++) posArr[i] = -999
      trailRef.current.geometry.attributes.position.needsUpdate = true
    }
  }, [controls])

  useImperativeHandle(ref, () => ({ trigger }), [trigger])

  // Trail geometry — reused buffer
  const trailPositions = useMemo(() => new Float32Array(TRAIL_COUNT * 3).fill(-999), [])
  const trailOpacities = useMemo(() => new Float32Array(TRAIL_COUNT).fill(0), [])

  useFrame((state, delta) => {
    if (!activeRef.current || !shipGroupRef.current) return

    progressRef.current += delta / FLYBY_DURATION

    const t = Math.min(progressRef.current, 1)
    // Ease-in-out for smooth motion
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

    // Position ship along curve
    FLIGHT_CURVE.getPointAt(eased, _pos)
    shipGroupRef.current.position.copy(_pos)

    // Orient ship along tangent
    const tNext = Math.min(eased + 0.01, 1)
    FLIGHT_CURVE.getPointAt(tNext, _tangent)
    _lookTarget.copy(_tangent)
    shipGroupRef.current.lookAt(_lookTarget)

    // Engine glow pulsing
    if (engineGlowRef.current) {
      const pulse = 2 + Math.sin(state.clock.elapsedTime * 25) * 1
      engineGlowRef.current.intensity = pulse
    }
    if (engineSphereRef.current) {
      const s = 0.12 + Math.sin(state.clock.elapsedTime * 30) * 0.04
      engineSphereRef.current.scale.setScalar(s)
    }

    // Engine trail — deposit particles at ship's rear
    if (trailRef.current) {
      const posArr = trailRef.current.geometry.attributes.position.array as Float32Array
      const opArr = trailRef.current.geometry.attributes.aOpacity.array as Float32Array

      // Place a new trail particle every other frame
      const idx = trailIdxRef.current % TRAIL_COUNT
      const i3 = idx * 3
      // Ship's rear is behind it along negative Z in local space
      _v3Trail.set(0, 0, -0.8)
      shipGroupRef.current.localToWorld(_v3Trail)
      posArr[i3] = _v3Trail.x + (Math.random() - 0.5) * 0.1
      posArr[i3 + 1] = _v3Trail.y + (Math.random() - 0.5) * 0.1
      posArr[i3 + 2] = _v3Trail.z + (Math.random() - 0.5) * 0.1
      opArr[idx] = 1.0
      trailIdxRef.current++

      // Fade all trail particles
      for (let i = 0; i < TRAIL_COUNT; i++) {
        opArr[i] = Math.max(0, opArr[i] - delta * 1.5)
      }

      trailRef.current.geometry.attributes.position.needsUpdate = true
      trailRef.current.geometry.attributes.aOpacity.needsUpdate = true
    }

    // Camera shake — tiny offset on orbit target
    if (controls && 'target' in controls && originalTargetRef.current) {
      const shakeIntensity = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1
      const shake = 0.03 * shakeIntensity
      _shakeOffset.set(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake * 0.5,
        (Math.random() - 0.5) * shake
      )
      ;(controls as any).target.copy(originalTargetRef.current).add(_shakeOffset)
    }

    // Flyby complete
    if (t >= 1) {
      activeRef.current = false

      // Restore orbit target
      if (controls && 'target' in controls && originalTargetRef.current) {
        ;(controls as any).target.copy(originalTargetRef.current)
      }

      // Fade out trail
      setTimeout(() => setVisible(false), 2000)
    }
  })

  if (!visible) return null

  return (
    <group>
      {/* Ship group */}
      <group ref={shipGroupRef} scale={0.5}>
        {/* Hull — elongated cone */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.25, 2.0, 6]} />
          <meshStandardMaterial
            color="#1a1a2e"
            metalness={0.9}
            roughness={0.2}
            emissive="#0a1628"
            emissiveIntensity={0.3}
          />
        </mesh>

        {/* Cockpit dome */}
        <mesh position={[0, 0, -0.6]}>
          <sphereGeometry args={[0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial
            color="#00d4ff"
            emissive="#00d4ff"
            emissiveIntensity={1.5}
            metalness={0.8}
            roughness={0.1}
            toneMapped={false}
          />
        </mesh>

        {/* Wings — thin flat boxes */}
        <mesh position={[0.9, 0, 0.2]} rotation={[0, 0, -0.15]}>
          <boxGeometry args={[1.4, 0.03, 0.6]} />
          <meshStandardMaterial
            color="#0d1117"
            metalness={0.85}
            roughness={0.3}
            emissive="#001830"
            emissiveIntensity={0.2}
          />
        </mesh>
        <mesh position={[-0.9, 0, 0.2]} rotation={[0, 0, 0.15]}>
          <boxGeometry args={[1.4, 0.03, 0.6]} />
          <meshStandardMaterial
            color="#0d1117"
            metalness={0.85}
            roughness={0.3}
            emissive="#001830"
            emissiveIntensity={0.2}
          />
        </mesh>

        {/* Wing tips — emissive accents */}
        <mesh position={[1.55, 0, 0.2]}>
          <boxGeometry args={[0.08, 0.05, 0.5]} />
          <meshStandardMaterial
            color="#00d4ff"
            emissive="#00d4ff"
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[-1.55, 0, 0.2]}>
          <boxGeometry args={[0.08, 0.05, 0.5]} />
          <meshStandardMaterial
            color="#00d4ff"
            emissive="#00d4ff"
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>

        {/* Engine nacelles — two small cylinders at wing roots */}
        <mesh position={[0.45, -0.05, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 0.4, 8]} />
          <meshStandardMaterial color="#0d1117" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[-0.45, -0.05, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 0.4, 8]} />
          <meshStandardMaterial color="#0d1117" metalness={0.9} roughness={0.2} />
        </mesh>

        {/* Engine exhaust glow — sphere at rear */}
        <mesh ref={engineSphereRef} position={[0, 0, 0.9]} scale={0.12}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            color="#00d4ff"
            toneMapped={false}
          />
        </mesh>

        {/* Engine point light */}
        <pointLight
          ref={engineGlowRef}
          position={[0, 0, 0.9]}
          color="#00d4ff"
          intensity={2}
          distance={5}
          decay={2}
        />
      </group>

      {/* Engine trail particles */}
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[trailPositions, 3]} />
          <bufferAttribute attach="attributes-aOpacity" args={[trailOpacities, 1]} />
        </bufferGeometry>
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
          }}
          vertexShader={/* glsl */ `
            attribute float aOpacity;
            varying float vOpacity;
            uniform float uPixelRatio;

            void main() {
              vOpacity = aOpacity;
              vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = aOpacity * 4.0 * uPixelRatio * (150.0 / -mvPos.z);
              gl_Position = projectionMatrix * mvPos;
            }
          `}
          fragmentShader={/* glsl */ `
            varying float vOpacity;

            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;
              float alpha = smoothstep(0.5, 0.0, d) * vOpacity;
              // Cyan core fading to white
              vec3 color = mix(vec3(0.0, 0.83, 1.0), vec3(1.0), vOpacity * 0.3);
              gl_FragColor = vec4(color, alpha * 0.7);
            }
          `}
        />
      </points>
    </group>
  )
})

// Scratch vector for trail position calculation
const _v3Trail = new THREE.Vector3()
