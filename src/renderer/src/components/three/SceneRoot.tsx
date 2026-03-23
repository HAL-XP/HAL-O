import { useMemo, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'
import { Starfield } from './Starfield'
import { GridFloor } from './GridFloor'
import { HalSphere } from './HalSphere'
import { OrbitalRings } from './OrbitalRings'
import { Perf } from 'r3f-perf'

function PerfStatsExporter() {
  const { gl } = useThree()
  const init = useRef(false)
  useEffect(() => { gl.info.autoReset = false; init.current = true; return () => { gl.info.autoReset = true } }, [gl])
  useFrame(() => {
    if (!init.current) return
    ;(window as any).__haloPerfStats = {
      drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0, timestamp: Date.now(),
    }
    gl.info.reset()
  })
  return null
}

// ── Minimal Scene Ready Gate — counts frames then signals ready ──
function ClassicSceneReadyGate({ onReady }: { onReady: () => void }) {
  const frameCount = useRef(0)
  const signaled = useRef(false)
  useFrame(() => {
    if (signaled.current) return
    frameCount.current++
    if (frameCount.current >= 3) {
      signaled.current = true
      onReady()
    }
  })
  return null
}

interface Props {
  projectCount?: number
  listening?: boolean
  showPerf?: boolean
  onSceneReady?: () => void
  renderQuality?: number
}

function PostProcessing() {
  const offset = useMemo(() => new Vector2(0.0015, 0.0015), [])

  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.2}
        luminanceSmoothing={0.9}
        intensity={2.5}
        radius={0.9}
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

export function SceneRoot({ projectCount = 0, listening = false, showPerf = false, onSceneReady, renderQuality }: Props) {
  void projectCount

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
      camera={{ position: [0, 4, 8], fov: 50, near: 0.1, far: 1000 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      dpr={renderQuality ?? Math.min(window.devicePixelRatio, 2)}
    >
      {showPerf && <Perf position="top-left" deepAnalyze />}
      <PerfStatsExporter />
      <color attach="background" args={['#030308']} />
      <ambientLight intensity={0.05} />

      <Starfield />
      <GridFloor />
      <HalSphere listening={listening} />
      <OrbitalRings />

      <PostProcessing />
      {onSceneReady && <ClassicSceneReadyGate onReady={onSceneReady} />}
    </Canvas>
  )
}
