import { useRef, useImperativeHandle, forwardRef, useMemo, useState, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getOrCreateContext } from '../../utils/audioAnalyser'

export interface SpaceshipFlybyHandle {
  trigger: () => void
}

// ── Scratch vectors — never allocate in animation loops ──
const _pos = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _lookTarget = new THREE.Vector3()
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

// A10: Heavier — capital ship inertia (was 11s)
const FLYBY_DURATION = 18.0 // seconds

// Trail particle budget
const TRAIL_COUNT = 120

// ── A10: Quintic ease-in-out for heavy inertia feel ──
// Ship starts very slow (lumbering out of hyperspace), accelerates through the middle,
// then gradually decelerates as it exits. Much more dramatic than quadratic.
function quinticEaseInOut(t: number): number {
  if (t < 0.5) {
    return 16 * t * t * t * t * t
  }
  const p = -2 * t + 2
  return 1 - (p * p * p * p * p) / 2
}

// Derivative of the quintic ease — gives us instantaneous "speed" (0..max)
// Used to scale engine trail intensity proportional to velocity
function quinticEaseInOutDerivative(t: number): number {
  if (t < 0.5) {
    return 80 * t * t * t * t // 5 * 16 * t^4
  }
  const p = -2 * t + 2
  return 80 * (p * p * p * p) / 2 // chain rule, simplified: 5 * 16 * ((1-t)*2)^4 / 2
  // = 40 * p^4
}

// Normalize derivative to 0..1 range — peak is at t=0.5 where derivative = 80*0.0625 = 5
// Actually at t=0.5: 80*(0.5)^4 = 80*0.0625 = 5
const QUINTIC_PEAK_DERIVATIVE = 5.0

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

// A10: Camera shake constants — very subtle rumble at closest approach
const SHAKE_MAX_INTENSITY = 0.012  // max displacement in world units — barely perceptible
const SHAKE_CLOSEST_T = 0.42       // approximate t value where ship is nearest sphere
const SHAKE_FALLOFF = 0.15         // how quickly shake tapers off from closest point

// ── A11b: Procedural engine whoosh via Web Audio API ──
// Synthesised white noise → bandpass filter chain → gain envelope.
// The sound ramps up as the ship approaches, peaks near closest pass (~t=0.4),
// and fades out as it departs.  Intentionally very subtle — more felt than heard.
function playEngineWhoosh(): void {
  let ctx: AudioContext
  try {
    ctx = getOrCreateContext()
  } catch {
    return // no audio support — silently skip
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})

  const now = ctx.currentTime
  const duration = FLYBY_DURATION + 2 // a little tail for fade-out

  // ── White noise buffer (2 seconds, looped) ──
  const sampleRate = ctx.sampleRate
  const bufLen = sampleRate * 2
  const noiseBuf = ctx.createBuffer(1, bufLen, sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuf
  noise.loop = true

  // ── Low rumble band — deep engine throb ──
  const bpLow = ctx.createBiquadFilter()
  bpLow.type = 'bandpass'
  bpLow.frequency.value = 120
  bpLow.Q.value = 0.8

  // ── Mid presence band — gives the whoosh its "air" character ──
  const bpMid = ctx.createBiquadFilter()
  bpMid.type = 'bandpass'
  bpMid.frequency.value = 350
  bpMid.Q.value = 1.2

  // ── High shimmer — subtle hiss for sci-fi texture ──
  const bpHigh = ctx.createBiquadFilter()
  bpHigh.type = 'bandpass'
  bpHigh.frequency.value = 2200
  bpHigh.Q.value = 2.0

  // Gain nodes for each band
  const gainLow = ctx.createGain()
  gainLow.gain.value = 1.0
  const gainMid = ctx.createGain()
  gainMid.gain.value = 0.4
  const gainHigh = ctx.createGain()
  gainHigh.gain.value = 0.15

  // ── Master gain envelope — shapes the whoosh over the flyby ──
  const master = ctx.createGain()
  master.gain.setValueAtTime(0, now)

  // The quintic easing means the ship moves slowest at start/end, fastest at ~t=0.4-0.5.
  // We shape the volume to match: slow ramp → peak at closest approach → slow fade.
  //
  // Timeline (seconds):
  //   0.0 → 0.0    silence at start
  //   0.5 → 0.01   barely audible rumble as ship appears
  //   4.0 → 0.04   building up as ship accelerates
  //   7.0 → 0.07   approaching closest pass
  //   8.0 → 0.08   PEAK — closest approach (t≈0.42 of 18s ≈ 7.6s)
  //   9.0 → 0.07   still close
  //  12.0 → 0.04   receding
  //  16.0 → 0.01   distant rumble
  //  18.0 → 0.0    silence
  const peak = 0.08
  master.gain.linearRampToValueAtTime(0.0,          now + 0.0)
  master.gain.linearRampToValueAtTime(peak * 0.12,  now + 0.5)
  master.gain.linearRampToValueAtTime(peak * 0.5,   now + 4.0)
  master.gain.linearRampToValueAtTime(peak * 0.88,  now + 7.0)
  master.gain.linearRampToValueAtTime(peak,         now + 8.0)   // peak at closest approach
  master.gain.linearRampToValueAtTime(peak * 0.88,  now + 9.0)
  master.gain.linearRampToValueAtTime(peak * 0.5,   now + 12.0)
  master.gain.linearRampToValueAtTime(peak * 0.12,  now + 16.0)
  master.gain.linearRampToValueAtTime(0.0,          now + FLYBY_DURATION)

  // Doppler-like frequency sweep on mid band — pitch drops as ship passes
  bpMid.frequency.setValueAtTime(420, now)
  bpMid.frequency.linearRampToValueAtTime(450, now + 7.5)   // slight rise on approach
  bpMid.frequency.linearRampToValueAtTime(280, now + 10.0)  // drop as it passes
  bpMid.frequency.linearRampToValueAtTime(200, now + FLYBY_DURATION) // low rumble receding

  // Wire up: noise → 3 parallel filter bands → master → destination
  noise.connect(bpLow)
  noise.connect(bpMid)
  noise.connect(bpHigh)
  bpLow.connect(gainLow)
  bpMid.connect(gainMid)
  bpHigh.connect(gainHigh)
  gainLow.connect(master)
  gainMid.connect(master)
  gainHigh.connect(master)
  master.connect(ctx.destination)

  // Start and schedule auto-stop
  noise.start(now)
  noise.stop(now + duration)

  // Cleanup after completion — disconnect all nodes to free resources
  noise.onended = () => {
    try {
      noise.disconnect()
      bpLow.disconnect()
      bpMid.disconnect()
      bpHigh.disconnect()
      gainLow.disconnect()
      gainMid.disconnect()
      gainHigh.disconnect()
      master.disconnect()
    } catch {
      // nodes may already be disconnected — safe to ignore
    }
  }
}

interface SpaceshipFlybyProps {
  enabled?: boolean
}

/**
 * Star Destroyer style capital ship flyby.
 * A10 — heavier physics/inertia: 18s duration, quintic easing, scale 0.6,
 * speed-proportional engine trail, subtle camera shake at closest approach.
 * Triggered via ref.trigger(). Pass enabled=false to make trigger() a no-op.
 */
export const SpaceshipFlyby = forwardRef<SpaceshipFlybyHandle, SpaceshipFlybyProps>(function SpaceshipFlyby({ enabled = true }, ref) {
  const shipGroupRef = useRef<THREE.Group>(null)
  const trailRef = useRef<THREE.Points>(null)
  const trailMatRef = useRef<THREE.ShaderMaterial>(null)
  const engine1GlowRef = useRef<THREE.PointLight>(null)
  const engine2GlowRef = useRef<THREE.PointLight>(null)
  const engine3GlowRef = useRef<THREE.PointLight>(null)
  const { controls, camera } = useThree()

  // Animation state — kept in refs to avoid re-renders
  const activeRef = useRef(false)
  const progressRef = useRef(0)
  const trailIdxRef = useRef(0)
  const originalTargetRef = useRef<THREE.Vector3 | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Store original camera position for shake recovery
  const cameraBaseRef = useRef(new THREE.Vector3())

  const [visible, setVisible] = useState(false)

  const trigger = useCallback(() => {
    if (!enabled) return
    if (activeRef.current) return
    console.log('[Flyby] trigger() — Star Destroyer flyby starting (A10: heavy inertia)')

    // A11b: Play procedural engine whoosh sound
    playEngineWhoosh()

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

    // Snapshot camera base position for shake offset
    cameraBaseRef.current.copy(camera.position)

    // Reset trail offscreen
    if (trailRef.current) {
      const posArr = trailRef.current.geometry.attributes.position.array as Float32Array
      const opArr = trailRef.current.geometry.attributes.aOpacity.array as Float32Array
      for (let i = 0; i < TRAIL_COUNT * 3; i++) posArr[i] = -999
      for (let i = 0; i < TRAIL_COUNT; i++) opArr[i] = 0
      trailRef.current.geometry.attributes.position.needsUpdate = true
      trailRef.current.geometry.attributes.aOpacity.needsUpdate = true
    }
  }, [controls, enabled, camera])

  useImperativeHandle(ref, () => ({ trigger }), [trigger])

  const trailPositions = useMemo(() => new Float32Array(TRAIL_COUNT * 3).fill(-999), [])
  const trailOpacities = useMemo(() => new Float32Array(TRAIL_COUNT).fill(0), [])

  useFrame((state, delta) => {
    if (!activeRef.current || !shipGroupRef.current) return

    progressRef.current += delta / FLYBY_DURATION
    const t = Math.min(progressRef.current, 1)

    // A10: Quintic ease-in-out — dramatic heavy inertia
    // Ship crawls at entry/exit, surges through the middle arc
    const eased = quinticEaseInOut(t)

    // Compute normalized speed (0..1) from easing derivative
    const rawSpeed = quinticEaseInOutDerivative(t)
    const normalizedSpeed = Math.min(rawSpeed / QUINTIC_PEAK_DERIVATIVE, 1)

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
    // Bank angle: proportional to lateral curve, max ±25°
    const bankAngle = -dX * 0.55
    const clampedBank = Math.max(-0.44, Math.min(0.44, bankAngle))
    shipGroupRef.current.rotateOnWorldAxis(_up, 0) // no-op to keep rotation chain clean
    // Apply Z-roll on top of the lookAt rotation
    shipGroupRef.current.rotateZ(clampedBank)

    // A10: Engine glow scales with speed — brighter during acceleration phase
    const speedGlow = 0.3 + normalizedSpeed * 0.7  // 30% idle glow + 70% speed-driven
    const basePulse = (2.0 + Math.sin(state.clock.elapsedTime * 20) * 0.8) * speedGlow
    if (engine1GlowRef.current) engine1GlowRef.current.intensity = basePulse
    if (engine2GlowRef.current) engine2GlowRef.current.intensity = basePulse * 0.95
    if (engine3GlowRef.current) engine3GlowRef.current.intensity = basePulse * 0.9

    // A10: Pass speed to trail shader for size scaling
    if (trailMatRef.current) {
      trailMatRef.current.uniforms.uSpeed.value = normalizedSpeed
    }

    // Engine trail — deposit particles at ship's stern (3 exhaust points)
    if (trailRef.current) {
      const posArr = trailRef.current.geometry.attributes.position.array as Float32Array
      const opArr = trailRef.current.geometry.attributes.aOpacity.array as Float32Array

      // A10: Trail spread scales with speed — tighter stream when slow, wider when fast
      const spread = 0.08 + normalizedSpeed * 0.25

      // Deposit 3 particles per frame (one per engine)
      // Stern is at +Z (nose at -Z), so exhaust spawns at positive Z offsets
      for (let e = 0; e < 3; e++) {
        const idx = trailIdxRef.current % TRAIL_COUNT
        const i3 = idx * 3
        _v3Trail.copy(EXHAUST_OFFSETS[e])
        shipGroupRef.current.localToWorld(_v3Trail)
        posArr[i3]     = _v3Trail.x + (Math.random() - 0.5) * spread
        posArr[i3 + 1] = _v3Trail.y + (Math.random() - 0.5) * spread
        posArr[i3 + 2] = _v3Trail.z + (Math.random() - 0.5) * spread
        // A10: Initial opacity proportional to speed — dimmer exhaust when coasting slow
        opArr[idx] = 0.3 + normalizedSpeed * 0.7
        trailIdxRef.current++
      }

      // Fade all trail particles — A10: fade rate inversely scales with speed
      // Fast = longer trails, slow = shorter wisps
      const fadeRate = 0.5 + (1 - normalizedSpeed) * 0.8
      for (let i = 0; i < TRAIL_COUNT; i++) {
        opArr[i] = Math.max(0, opArr[i] - delta * fadeRate)
      }

      trailRef.current.geometry.attributes.position.needsUpdate = true
      trailRef.current.geometry.attributes.aOpacity.needsUpdate = true
    }

    // A10: Subtle camera shake at closest approach — rumble as mass passes nearby
    const shakeProximity = Math.exp(-Math.pow((t - SHAKE_CLOSEST_T) / SHAKE_FALLOFF, 2))
    const shakeIntensity = SHAKE_MAX_INTENSITY * shakeProximity * normalizedSpeed
    if (shakeIntensity > 0.001) {
      // High-frequency shake (different per axis for organic feel)
      const time = state.clock.elapsedTime
      const shakeX = Math.sin(time * 47) * shakeIntensity
      const shakeY = Math.cos(time * 53) * shakeIntensity * 0.7
      const shakeZ = Math.sin(time * 41 + 1.3) * shakeIntensity * 0.5
      camera.position.x += shakeX
      camera.position.y += shakeY
      camera.position.z += shakeZ
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
      {/* ── Star Destroyer — A10: scale 0.6 (max length ≈ sphere radius) ── */}
      <group ref={shipGroupRef} scale={0.6}>
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
          color="#00e5ff" intensity={2.0} distance={4} decay={2} />
        <pointLight ref={engine2GlowRef} position={[0, -0.05, 2.6]}
          color="#00e5ff" intensity={2.5} distance={5} decay={2} />
        <pointLight ref={engine3GlowRef} position={[0.55, -0.05, 2.4]}
          color="#00e5ff" intensity={2.0} distance={4} decay={2} />

        {/* === Running lights — red at stern wing edges === */}
        {/* A10b: bumped radius 0.04→0.07 so lights stay ≥3 px at 0.6 scale */}
        <mesh position={[-0.96, 0.1, 1.9]}>
          <sphereGeometry args={[0.07, 6, 6]} />
          <primitive object={MAT_RUNNING_RED} attach="material" />
        </mesh>
        <mesh position={[0.96, 0.1, 1.9]}>
          <sphereGeometry args={[0.07, 6, 6]} />
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
          ref={trailMatRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
            uSpeed: { value: 0.0 },
          }}
          vertexShader={/* glsl */ `
            attribute float aOpacity;
            varying float vOpacity;
            uniform float uPixelRatio;
            uniform float uSpeed;

            void main() {
              vOpacity = aOpacity;
              vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
              // A10: trail size scales with speed — thicker during acceleration, thinner at coast
              float speedScale = 0.4 + uSpeed * 0.6;
              gl_PointSize = aOpacity * 5.0 * speedScale * uPixelRatio * (200.0 / -mvPos.z);
              gl_Position = projectionMatrix * mvPos;
            }
          `}
          fragmentShader={/* glsl */ `
            varying float vOpacity;

            void main() {
              float d = length(gl_PointCoord - vec2(0.5));
              if (d > 0.5) discard;
              float alpha = smoothstep(0.5, 0.0, d) * vOpacity;
              // Bright cyan core -> blue-white fade
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
