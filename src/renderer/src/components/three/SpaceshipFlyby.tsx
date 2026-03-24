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
const _prevPos = new THREE.Vector3()
const _curPos = new THREE.Vector3()

// A9: Wider arc — Star Destroyer takes a much heavier, grander sweep through the scene.
// Entry from deeper left/behind, sweeps wide past the sphere, exits right.
const FLIGHT_POINTS = [
  new THREE.Vector3(-50, 6.0, 18),    // entry — far left, high and deep
  new THREE.Vector3(-22, 4.0, 8),     // approach from distance
  new THREE.Vector3(-8, 2.5, -2),     // close pass near sphere
  new THREE.Vector3(6, 3.0, -4),      // curve through
  new THREE.Vector3(20, 4.5, 8),      // pull away
  new THREE.Vector3(50, 8.0, 18),     // exit — far right, climbing
]

const FLIGHT_CURVE = new THREE.CatmullRomCurve3(FLIGHT_POINTS, false, 'catmullrom', 0.5)

// A9: Slower — capital ship feel
const FLYBY_DURATION = 11.0 // seconds

// A9: Larger trail to match the bigger ship
const TRAIL_COUNT = 120

// ── Pre-compute hull geometry with native -Z nose orientation ──
// Shape is drawn in XY plane (nose at +Y), extruded along +Z (hull thickness).
// We bake rotateX(-π/2) into the geometry so nose points -Z natively.
// This means lookAt() works directly — no rotation hack on the mesh.
// Stern is at +Z; all engine/bridge positions use positive Z.
function makeHullGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  const W = 1.0   // half-width at stern
  const L = 2.2   // length nose→stern
  // Triangular plan view — nose tip at +Y (will become -Z after rotateX)
  shape.moveTo(0, L)         // nose tip (forward)
  shape.lineTo(W, -L)        // starboard stern corner
  shape.lineTo(-W, -L)       // port stern corner
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.28,       // vertical thickness of the wedge hull
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  })
  // Bake rotation into vertices: +Y→-Z, +Z→+Y — nose now natively points -Z
  geo.rotateX(-Math.PI / 2)
  return geo
}

const HULL_GEOMETRY = makeHullGeometry()

// Exhaust particle spawn offsets — one per engine, in ship local space (stern at +Z)
const EXHAUST_OFFSETS = [
  new THREE.Vector3(-0.55, -0.1, 2.0),
  new THREE.Vector3(0, -0.1, 2.3),
  new THREE.Vector3(0.55, -0.1, 2.0),
]

// Materials — defined once, shared across all ship instances
const MAT_HULL = new THREE.MeshStandardMaterial({
  color: '#0d1117',
  metalness: 0.85,
  roughness: 0.25,
  emissive: '#0a1628',
  emissiveIntensity: 0.4,
})
const MAT_TOWER = new THREE.MeshStandardMaterial({
  color: '#111820',
  metalness: 0.8,
  roughness: 0.3,
  emissive: '#0a1628',
  emissiveIntensity: 0.35,
})
const MAT_TRENCH = new THREE.MeshStandardMaterial({
  color: '#060a10',
  metalness: 0.6,
  roughness: 0.6,
})
const MAT_ENGINE = new THREE.MeshBasicMaterial({
  color: '#00e5ff',
  toneMapped: false,
})
const MAT_ENGINE_OUTER = new THREE.MeshBasicMaterial({
  color: '#0066cc',
  transparent: true,
  opacity: 0.6,
  toneMapped: false,
})
const MAT_RUNNING_RED = new THREE.MeshBasicMaterial({
  color: '#ff2020',
  toneMapped: false,
})

interface SpaceshipFlybyProps {
  enabled?: boolean
}

/**
 * Star Destroyer style capital ship flyby.
 * A9 — heavier movement: 11s duration, wider arc, 2.2x scale, Z-banking.
 * Triggered via ref.trigger(). Pass enabled=false to make trigger() a no-op.
 */
export const SpaceshipFlyby = forwardRef<SpaceshipFlybyHandle, SpaceshipFlybyProps>(function SpaceshipFlyby({ enabled = true }, ref) {
  const shipGroupRef = useRef<THREE.Group>(null)
  const trailRef = useRef<THREE.Points>(null)
  const engine1GlowRef = useRef<THREE.PointLight>(null)
  const engine2GlowRef = useRef<THREE.PointLight>(null)
  const engine3GlowRef = useRef<THREE.PointLight>(null)
  const { controls } = useThree()

  // Animation state — kept in refs to avoid re-renders
  const activeRef = useRef(false)
  const progressRef = useRef(0)
  const trailIdxRef = useRef(0)
  const originalTargetRef = useRef<THREE.Vector3 | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [visible, setVisible] = useState(false)

  const trigger = useCallback(() => {
    if (!enabled) return
    if (activeRef.current) return
    console.log('[Flyby] trigger() — Star Destroyer flyby starting')

    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }

    activeRef.current = true
    progressRef.current = 0
    trailIdxRef.current = 0
    setVisible(true)

    if (controls && 'target' in controls) {
      originalTargetRef.current = (controls as any).target.clone()
    }

    // Reset trail offscreen
    if (trailRef.current) {
      const posArr = trailRef.current.geometry.attributes.position.array as Float32Array
      const opArr = trailRef.current.geometry.attributes.aOpacity.array as Float32Array
      for (let i = 0; i < TRAIL_COUNT * 3; i++) posArr[i] = -999
      for (let i = 0; i < TRAIL_COUNT; i++) opArr[i] = 0
      trailRef.current.geometry.attributes.position.needsUpdate = true
      trailRef.current.geometry.attributes.aOpacity.needsUpdate = true
    }
  }, [controls, enabled])

  useImperativeHandle(ref, () => ({ trigger }), [trigger])

  const trailPositions = useMemo(() => new Float32Array(TRAIL_COUNT * 3).fill(-999), [])
  const trailOpacities = useMemo(() => new Float32Array(TRAIL_COUNT).fill(0), [])

  useFrame((state, delta) => {
    if (!activeRef.current || !shipGroupRef.current) return

    progressRef.current += delta / FLYBY_DURATION
    const t = Math.min(progressRef.current, 1)

    // Ease-in-out — smooth entry and exit
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

    // Position ship
    FLIGHT_CURVE.getPointAt(eased, _pos)
    shipGroupRef.current.position.copy(_pos)

    // Orient along tangent
    const tNext = Math.min(eased + 0.008, 1)
    FLIGHT_CURVE.getPointAt(tNext, _lookTarget)
    shipGroupRef.current.lookAt(_lookTarget)

    // A9: Subtle banking — compute lateral curvature for roll feel
    // Sample a small segment to estimate turn direction
    const tPrev = Math.max(eased - 0.008, 0)
    FLIGHT_CURVE.getPointAt(tPrev, _prevPos)
    FLIGHT_CURVE.getPointAt(tNext, _curPos)
    // Cross product of forward and the lateral offset gives us side direction
    const dX = _curPos.x - _prevPos.x
    const dZ = _curPos.z - _prevPos.z
    // Bank angle: proportional to lateral curve, max ±25°
    const bankAngle = -dX * 0.55
    const clampedBank = Math.max(-0.44, Math.min(0.44, bankAngle))
    shipGroupRef.current.rotateOnWorldAxis(_up, 0) // no-op to keep rotation chain clean
    // Apply Z-roll on top of the lookAt rotation
    shipGroupRef.current.rotateZ(clampedBank)

    // Engine glow pulsing (3 engines)
    const pulse = 3.5 + Math.sin(state.clock.elapsedTime * 20) * 1.2
    if (engine1GlowRef.current) engine1GlowRef.current.intensity = pulse
    if (engine2GlowRef.current) engine2GlowRef.current.intensity = pulse * 0.95
    if (engine3GlowRef.current) engine3GlowRef.current.intensity = pulse * 0.9

    // Engine trail — deposit particles at ship's stern (3 exhaust points)
    if (trailRef.current) {
      const posArr = trailRef.current.geometry.attributes.position.array as Float32Array
      const opArr = trailRef.current.geometry.attributes.aOpacity.array as Float32Array

      // Deposit 3 particles per frame (one per engine)
      // Stern is at +Z (nose at -Z), so exhaust spawns at positive Z offsets
      for (let e = 0; e < 3; e++) {
        const idx = trailIdxRef.current % TRAIL_COUNT
        const i3 = idx * 3
        _v3Trail.copy(EXHAUST_OFFSETS[e])
        shipGroupRef.current.localToWorld(_v3Trail)
        posArr[i3]     = _v3Trail.x + (Math.random() - 0.5) * 0.3
        posArr[i3 + 1] = _v3Trail.y + (Math.random() - 0.5) * 0.3
        posArr[i3 + 2] = _v3Trail.z + (Math.random() - 0.5) * 0.3
        opArr[idx] = 1.0
        trailIdxRef.current++
      }

      // Fade all trail particles — slower fade for longer trail
      for (let i = 0; i < TRAIL_COUNT; i++) {
        opArr[i] = Math.max(0, opArr[i] - delta * 0.7)
      }

      trailRef.current.geometry.attributes.position.needsUpdate = true
      trailRef.current.geometry.attributes.aOpacity.needsUpdate = true
    }

    // Flyby complete
    if (t >= 1) {
      console.log('[Flyby] Star Destroyer flyby complete — deactivating')
      activeRef.current = false

      if (controls && 'target' in controls && originalTargetRef.current) {
        ;(controls as any).target.copy(originalTargetRef.current)
      }

      hideTimerRef.current = setTimeout(() => {
        setVisible(false)
        hideTimerRef.current = null
        console.log('[Flyby] hidden — ready for next trigger')
      }, 2500)
    }
  })

  return (
    <group visible={visible}>
      {/* ── Star Destroyer — A9 scale 2.2x ── */}
      <group ref={shipGroupRef} scale={2.2}>
        {/* === Main wedge hull === */}
        {/* Geometry has rotateX(-π/2) baked in — nose natively at -Z, no rotation needed */}
        <mesh position={[0, 0.12, 0]}>
          <primitive object={HULL_GEOMETRY} attach="geometry" />
          <primitive object={MAT_HULL} attach="material" />
        </mesh>

        {/* Underside reinforcement slab */}
        <mesh position={[0, -0.06, 0]}>
          <boxGeometry args={[1.5, 0.06, 3.6]} />
          <primitive object={MAT_HULL} attach="material" />
        </mesh>

        {/* === Bridge tower === */}
        {/* Stern is at +Z (opposite nose at -Z) — bridge sits near stern */}
        <group position={[0, 0.32, 1.4]}>
          {/* Lower block */}
          <mesh>
            <boxGeometry args={[0.35, 0.28, 0.55]} />
            <primitive object={MAT_TOWER} attach="material" />
          </mesh>
          {/* Upper bridge deck */}
          <mesh position={[0, 0.22, 0.04]}>
            <boxGeometry args={[0.28, 0.18, 0.38]} />
            <primitive object={MAT_TOWER} attach="material" />
          </mesh>
          {/* Command dome */}
          <mesh position={[0, 0.35, 0.04]}>
            <sphereGeometry args={[0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            <primitive object={MAT_TOWER} attach="material" />
          </mesh>
          {/* Sensor array — vertical fin */}
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.04, 0.24, 0.12]} />
            <primitive object={MAT_TOWER} attach="material" />
          </mesh>
        </group>

        {/* === Surface trench details === */}
        {/* Central spine trench — runs nose(-Z) to stern(+Z), centered slightly toward stern */}
        <mesh position={[0, 0.26, 0.2]}>
          <boxGeometry args={[0.06, 0.02, 3.2]} />
          <primitive object={MAT_TRENCH} attach="material" />
        </mesh>
        {/* Port lateral trench */}
        <mesh position={[-0.42, 0.26, 0.2]}>
          <boxGeometry args={[0.04, 0.02, 2.0]} />
          <primitive object={MAT_TRENCH} attach="material" />
        </mesh>
        {/* Starboard lateral trench */}
        <mesh position={[0.42, 0.26, 0.2]}>
          <boxGeometry args={[0.04, 0.02, 2.0]} />
          <primitive object={MAT_TRENCH} attach="material" />
        </mesh>
        {/* Cross trench near mid-ship */}
        <mesh position={[0, 0.26, 0.3]}>
          <boxGeometry args={[0.9, 0.02, 0.05]} />
          <primitive object={MAT_TRENCH} attach="material" />
        </mesh>
        {/* Cross trench near stern */}
        <mesh position={[0, 0.26, 1.3]}>
          <boxGeometry args={[1.6, 0.02, 0.05]} />
          <primitive object={MAT_TRENCH} attach="material" />
        </mesh>

        {/* === Three engine glows at stern (+Z) === */}
        {/* Engine housings */}
        <mesh position={[-0.55, -0.05, 2.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.14, 0.18, 0.22, 10]} />
          <primitive object={MAT_HULL} attach="material" />
        </mesh>
        <mesh position={[0, -0.05, 2.4]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.17, 0.22, 0.22, 10]} />
          <primitive object={MAT_HULL} attach="material" />
        </mesh>
        <mesh position={[0.55, -0.05, 2.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.14, 0.18, 0.22, 10]} />
          <primitive object={MAT_HULL} attach="material" />
        </mesh>

        {/* Engine glow discs (emissive face at exhaust — circle faces +Z by default, matching stern) */}
        <mesh position={[-0.55, -0.05, 2.31]}>
          <circleGeometry args={[0.13, 10]} />
          <primitive object={MAT_ENGINE} attach="material" />
        </mesh>
        <mesh position={[0, -0.05, 2.52]}>
          <circleGeometry args={[0.16, 10]} />
          <primitive object={MAT_ENGINE} attach="material" />
        </mesh>
        <mesh position={[0.55, -0.05, 2.31]}>
          <circleGeometry args={[0.13, 10]} />
          <primitive object={MAT_ENGINE} attach="material" />
        </mesh>

        {/* Engine outer halo discs */}
        <mesh position={[-0.55, -0.05, 2.32]}>
          <circleGeometry args={[0.2, 10]} />
          <primitive object={MAT_ENGINE_OUTER} attach="material" />
        </mesh>
        <mesh position={[0, -0.05, 2.54]}>
          <circleGeometry args={[0.24, 10]} />
          <primitive object={MAT_ENGINE_OUTER} attach="material" />
        </mesh>
        <mesh position={[0.55, -0.05, 2.32]}>
          <circleGeometry args={[0.2, 10]} />
          <primitive object={MAT_ENGINE_OUTER} attach="material" />
        </mesh>

        {/* Engine point lights */}
        <pointLight ref={engine1GlowRef} position={[-0.55, -0.05, 2.4]}
          color="#00e5ff" intensity={3.5} distance={6} decay={2} />
        <pointLight ref={engine2GlowRef} position={[0, -0.05, 2.6]}
          color="#00e5ff" intensity={4} distance={7} decay={2} />
        <pointLight ref={engine3GlowRef} position={[0.55, -0.05, 2.4]}
          color="#00e5ff" intensity={3.5} distance={6} decay={2} />

        {/* === Running lights — red at stern wing edges === */}
        <mesh position={[-0.96, 0.1, 1.9]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <primitive object={MAT_RUNNING_RED} attach="material" />
        </mesh>
        <mesh position={[0.96, 0.1, 1.9]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <primitive object={MAT_RUNNING_RED} attach="material" />
        </mesh>

      </group>{/* end shipGroupRef */}

      {/* ── Engine trail particles — 3 exhaust streams ── */}
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
              // A9: larger point size for bigger ship trail
              gl_PointSize = aOpacity * 8.0 * uPixelRatio * (200.0 / -mvPos.z);
              gl_Position = projectionMatrix * mvPos;
            }
          `}
          fragmentShader={/* glsl */ `
            varying float vOpacity;

            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;
              float alpha = smoothstep(0.5, 0.0, d) * vOpacity;
              // Bright cyan core → blue-white fade
              vec3 color = mix(vec3(0.0, 0.9, 1.0), vec3(0.8, 1.0, 1.0), vOpacity * 0.4);
              gl_FragColor = vec4(color, alpha * 0.85);
            }
          `}
        />
      </points>
    </group>
  )
})

// Scratch vector for trail position calculation
const _v3Trail = new THREE.Vector3()
