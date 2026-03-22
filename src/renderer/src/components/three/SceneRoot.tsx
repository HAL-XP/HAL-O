import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'
import { Starfield } from './Starfield'
import { GridFloor } from './GridFloor'
import { HalSphere } from './HalSphere'
import { OrbitalRings } from './OrbitalRings'

interface Props {
  projectCount?: number
  listening?: boolean
}

function PostProcessing() {
  const offset = useMemo(() => new Vector2(0.0015, 0.0015), [])

  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.4}
        luminanceSmoothing={0.9}
        intensity={1.8}
        radius={0.8}
        mipmapBlur
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={offset}
      />
      <Vignette darkness={0.7} offset={0.25} />
    </EffectComposer>
  )
}

export function SceneRoot({ projectCount = 0, listening = false }: Props) {
  void projectCount

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      camera={{ position: [0, 0.5, 10], fov: 50, near: 0.1, far: 1000 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#030308']} />
      <ambientLight intensity={0.05} />

      <Starfield />
      <GridFloor />
      <HalSphere listening={listening} />
      <OrbitalRings />

      <PostProcessing />
    </Canvas>
  )
}
