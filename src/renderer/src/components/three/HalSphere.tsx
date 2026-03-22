import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface HalSphereProps {
  listening?: boolean
}

export function HalSphere({ listening = false }: HalSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uListening: { value: 0 },
    uPrimary: { value: new THREE.Color('#84cc16') },
    uCore: { value: new THREE.Color('#ff2200') }, // HAL red — always
  }), [])

  // Read primary color from CSS
  useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    const primary = style.getPropertyValue('--primary').trim()
    if (primary) uniforms.uPrimary.value.set(primary)
  }, [uniforms])

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta
      // Smoothly interpolate listening state
      const target = listening ? 1 : 0
      const current = materialRef.current.uniforms.uListening.value
      materialRef.current.uniforms.uListening.value += (target - current) * delta * 5
    }
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * (listening ? 0.4 : 0.1)
    }
    // Pulse the outer glow when listening
    if (glowRef.current) {
      const s = listening ? 2.2 + Math.sin(Date.now() * 0.005) * 0.3 : 1.8
      glowRef.current.scale.setScalar(s)
    }
    // Boost light when listening
    if (lightRef.current) {
      lightRef.current.intensity = listening ? 5 : 2
    }
  })

  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;
    varying vec3 vPosition;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;

      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPos.xyz);

      gl_Position = projectionMatrix * mvPos;
    }
  `

  const fragmentShader = `
    uniform float uTime;
    uniform float uListening;
    uniform vec3 uPrimary;
    uniform vec3 uCore;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec2 vUv;
    varying vec3 vPosition;

    void main() {
      // Fresnel — brighter at edges
      float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 3.0);

      // Scanlines — faster when listening
      float scanSpeed = 2.0 + uListening * 4.0;
      float scanline = smoothstep(0.4, 0.6, sin(vPosition.y * 40.0 - uTime * scanSpeed) * 0.5 + 0.5);
      float scanlineAlpha = scanline * (0.3 + uListening * 0.3);

      // Pulse — faster and brighter when listening
      float pulseSpeed = 1.5 + uListening * 3.0;
      float pulse = 0.7 + sin(uTime * pulseSpeed) * 0.3 + uListening * 0.3;

      // Core glow — red center (HAL identity)
      float coreDist = length(vUv - 0.5) * 2.0;
      float coreGlow = smoothstep(1.0, 0.0, coreDist) * pulse;

      // Mix: red core blending into primary at edges
      vec3 coreColor = uCore * 2.5; // bright red
      vec3 edgeColor = uPrimary * 1.5;
      vec3 color = mix(coreColor, edgeColor, fresnel);

      // Add scanline brightness
      color += uPrimary * scanlineAlpha * 0.5;

      // Alpha: solid core, fresnel edges, scanline detail
      float alpha = max(coreGlow * 0.8, fresnel * 0.6) + scanlineAlpha * 0.2;
      alpha *= pulse;

      // Emissive boost for bloom (values > 1.0 trigger selective bloom)
      color *= 1.5;

      gl_FragColor = vec4(color, alpha);
    }
  `

  return (
    <group position={[0, 0.8, 0]} scale={0.35}>
      {/* Outer glow sphere */}
      <mesh ref={glowRef} scale={1.8}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color={uniforms.uCore.value}
          transparent
          opacity={0.03}
          depthWrite={false}
        />
      </mesh>

      {/* Main holographic sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          side={THREE.FrontSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Inner bright core */}
      <mesh scale={0.3}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color="#ff4400"
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </mesh>

      {/* Point light emanating from core */}
      <pointLight ref={lightRef} color="#ff2200" intensity={2} distance={15} decay={2} />
    </group>
  )
}
