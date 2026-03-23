import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface Props {
  projectCount: number
}

// Pre-allocated scratch vectors — never allocate in useFrame
const _v3 = new THREE.Vector3()

/**
 * Ambient data particles drifting through the scene.
 * A mix of slow-swirling cyan/green motes and faster vertical "data stream" columns.
 * Particle count scales with project count.
 */
export function DataParticles({ projectCount }: Props) {
  const pointsRef = useRef<THREE.Points>(null)

  const count = 200 + projectCount * 10

  // Generate initial positions, velocities, and per-particle properties
  const { positions, seeds, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const sd = new Float32Array(count * 4) // x: phase, y: speed, z: radius, w: isStream (0|1)
    const col = new Float32Array(count * 3)

    const cyan = new THREE.Color('#00d4ff')
    const green = new THREE.Color('#84cc16')

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const i4 = i * 4

      // Spread particles in a cylinder around the scene
      const angle = Math.random() * Math.PI * 2
      const radius = 2 + Math.random() * 14
      const height = -1 + Math.random() * 12

      pos[i3] = Math.cos(angle) * radius
      pos[i3 + 1] = height
      pos[i3 + 2] = Math.sin(angle) * radius

      // ~15% are "data stream" particles — faster, more vertical, in columns
      const isStream = Math.random() < 0.15 ? 1.0 : 0.0

      sd[i4] = Math.random() * Math.PI * 2   // phase offset for swirl
      sd[i4 + 1] = isStream ? (0.8 + Math.random() * 1.2) : (0.05 + Math.random() * 0.15) // vertical speed
      sd[i4 + 2] = radius                     // original radius
      sd[i4 + 3] = isStream

      // Color: cyan dominant, some green. Streams are always cyan.
      const c = isStream ? cyan : (Math.random() < 0.35 ? green : cyan)
      col[i3] = c.r
      col[i3 + 1] = c.g
      col[i3 + 2] = c.b
    }

    return { positions: pos, seeds: sd, colors: col }
  }, [count])

  // Custom shader material for soft round points with varying opacity
  const shaderData = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aStream;
      varying float vOpacity;
      varying vec3 vColor;
      uniform float uTime;
      uniform float uPixelRatio;

      void main() {
        vColor = color;
        // Streams are brighter; normal particles shimmer
        float shimmer = sin(uTime * 1.5 + position.x * 3.0 + position.z * 2.0) * 0.3 + 0.7;
        vOpacity = aStream > 0.5 ? 0.6 : shimmer * 0.35;

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // Size: streams slightly larger
        float size = aStream > 0.5 ? 3.0 : (1.5 + sin(aSeed * 6.28 + uTime) * 0.5);
        gl_PointSize = size * uPixelRatio * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vOpacity;
      varying vec3 vColor;

      void main() {
        // Soft round particle
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.15, d) * vOpacity;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  }), [])

  // Per-particle attributes for the shader
  const { seedAttr, streamAttr } = useMemo(() => {
    const sd = new Float32Array(count)
    const st = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      sd[i] = seeds[i * 4]     // phase
      st[i] = seeds[i * 4 + 3] // isStream
    }
    return { seedAttr: sd, streamAttr: st }
  }, [count, seeds])

  useFrame((state, delta) => {
    if (!pointsRef.current) return

    const geo = pointsRef.current.geometry
    const posArr = geo.attributes.position.array as Float32Array
    const elapsed = state.clock.elapsedTime

    // Update shader time uniform
    const mat = pointsRef.current.material as THREE.ShaderMaterial
    if (mat.uniforms) mat.uniforms.uTime.value = elapsed

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const i4 = i * 4

      const phase = seeds[i4]
      const speed = seeds[i4 + 1]
      const origRadius = seeds[i4 + 2]
      const isStream = seeds[i4 + 3]

      // Move upward
      posArr[i3 + 1] += speed * delta

      // Swirl for normal particles — sine wave offsets on X and Z
      if (isStream < 0.5) {
        const swirlAngle = elapsed * 0.3 + phase
        const swirlAmt = 0.015
        posArr[i3] += Math.sin(swirlAngle) * swirlAmt
        posArr[i3 + 2] += Math.cos(swirlAngle * 0.7 + 1.0) * swirlAmt
      }

      // Wrap: when particle goes above ceiling, reset to bottom
      if (posArr[i3 + 1] > 12) {
        posArr[i3 + 1] = -1 + Math.random() * 0.5
        // Re-randomize horizontal position slightly for streams, fully for normal
        if (isStream > 0.5) {
          // Stream: stay in roughly same column
          posArr[i3] += (Math.random() - 0.5) * 0.3
          posArr[i3 + 2] += (Math.random() - 0.5) * 0.3
        } else {
          const angle = Math.random() * Math.PI * 2
          const r = 2 + Math.random() * 14
          posArr[i3] = Math.cos(angle) * r
          posArr[i3 + 2] = Math.sin(angle) * r
        }
      }
    }

    geo.attributes.position.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[seedAttr, 1]} />
        <bufferAttribute attach="attributes-aStream" args={[streamAttr, 1]} />
      </bufferGeometry>
      <shaderMaterial
        {...shaderData}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexColors
      />
    </points>
  )
}
