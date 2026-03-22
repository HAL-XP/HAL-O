import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface HalSphereProps {
  listening?: boolean
}

export function HalSphere({ listening = false }: HalSphereProps) {
  const wireRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const innerRef = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const audioDataRef = useRef(new Uint8Array(128))

  const primaryHex = useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    return style.getPropertyValue('--primary').trim() || '#84cc16'
  }, [])

  useFrame((_, delta) => {
    const analyser = (window as any).__halAudioAnalyser as AnalyserNode | null
    const isSpeaking = !!(window as any).__halSpeaking
    let audioLevel = 0

    if (analyser && isSpeaking) {
      analyser.getByteFrequencyData(audioDataRef.current)
      let sum = 0
      for (let i = 0; i < audioDataRef.current.length; i++) sum += audioDataRef.current[i]
      audioLevel = sum / audioDataRef.current.length / 255
    }

    const time = Date.now() * 0.001

    // Wireframe globe rotation
    if (wireRef.current) {
      wireRef.current.rotation.y += delta * (listening ? 0.5 : isSpeaking ? 0.3 : 0.15)
      wireRef.current.rotation.x = Math.sin(time * 0.2) * 0.1
      const speakScale = isSpeaking ? 1 + audioLevel * 0.15 : 1
      wireRef.current.scale.setScalar(speakScale)
    }

    // Outer glow pulsing
    if (glowRef.current) {
      const pulse = 1.6 + Math.sin(time * 1.5) * 0.1
      const s = listening ? pulse + 0.4 : isSpeaking ? pulse + audioLevel * 0.6 : pulse
      glowRef.current.scale.setScalar(s)
    }

    // Inner core pulse
    if (innerRef.current) {
      const pulse = 0.35 + Math.sin(time * 2) * 0.05
      innerRef.current.scale.setScalar(listening ? pulse + 0.1 : pulse)
    }

    // Light intensity
    if (lightRef.current) {
      lightRef.current.intensity = listening ? 6 : isSpeaking ? 3 + audioLevel * 5 : 3
    }
  })

  return (
    <group position={[0, 1.2, 0]} scale={0.6}>
      {/* Outer atmospheric glow */}
      <mesh ref={glowRef} scale={1.6}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color="#ff2200"
          transparent
          opacity={0.04}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Wireframe globe — the signature HAL look */}
      <mesh ref={wireRef}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial
          color="#ff3300"
          wireframe
          transparent
          opacity={0.5}
          toneMapped={false}
        />
      </mesh>

      {/* Solid inner sphere — subtle red fill */}
      <mesh>
        <sphereGeometry args={[0.95, 32, 32]} />
        <meshBasicMaterial
          color="#ff1100"
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </mesh>

      {/* Bright inner core */}
      <mesh ref={innerRef} scale={0.35}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color="#ff4400"
          transparent
          opacity={0.95}
          toneMapped={false}
        />
      </mesh>

      {/* Equatorial ring — like a planetary ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.15, 1.2, 64]} />
        <meshBasicMaterial
          color={primaryHex}
          transparent
          opacity={0.3}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Second ring — tilted */}
      <mesh rotation={[Math.PI / 2 + 0.3, 0.5, 0]}>
        <ringGeometry args={[1.3, 1.34, 64]} />
        <meshBasicMaterial
          color={primaryHex}
          transparent
          opacity={0.15}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Point light */}
      <pointLight ref={lightRef} color="#ff2200" intensity={3} distance={20} decay={2} />
    </group>
  )
}
