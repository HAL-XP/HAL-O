import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls, Environment, MeshReflectorMaterial, Float, useTexture } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { Starfield } from './Starfield'
import { ScreenPanel, ScreenPanelUpdater } from './ScreenPanel'
import { DataParticles } from './DataParticles'
import { HudScrollText } from './HudScrollText'
import { SpaceshipFlyby } from './SpaceshipFlyby'
import type { SpaceshipFlybyHandle } from './SpaceshipFlyby'
import { CinematicSequence } from './CinematicSequence'
import { IntroSequence } from './IntroSequence'
import { MergeGraph } from './MergeGraph'
import type { ProjectInfo } from '../../types'
import type { ProjectGroup } from '../../hooks/useProjectGroups'

// ── U4: Sphere Event System — visual feedback channel for system events ──
export type SphereEventType = 'success' | 'error' | 'warning' | 'info' | 'push'

export interface SphereEvent {
  type: SphereEventType
  intensity?: number // 0-1, default 1
}

// Color + animation mapping per event type
const SPHERE_EVENT_COLORS: Record<SphereEventType, THREE.Color> = {
  success: new THREE.Color(0x22c55e), // green
  error:   new THREE.Color(0xef4444), // red
  warning: new THREE.Color(0xf59e0b), // amber
  info:    new THREE.Color(0xffffff), // white (brightness surge)
  push:    new THREE.Color(0x3b82f6), // blue
}

// Duration in seconds for each event type's visual effect
const SPHERE_EVENT_DURATIONS: Record<SphereEventType, number> = {
  success: 1.5,
  error:   1.0,  // fast flash
  warning: 1.8,
  info:    0.8,  // brief brightness surge
  push:    2.0,  // blue ripple complements the ship flyby
}

// Simple pub/sub on window for sphere events — no React context needed since
// the sphere lives inside R3F Canvas and events fire from outside.
type SphereEventListener = (event: SphereEvent) => void
const _sphereEventListeners = new Set<SphereEventListener>()

/** Dispatch a visual event to the HAL sphere. Can be called from anywhere in the renderer. */
export function dispatchSphereEvent(event: SphereEvent): void {
  for (const listener of _sphereEventListeners) {
    listener(event)
  }
}

function subscribeSphereEvents(listener: SphereEventListener): () => void {
  _sphereEventListeners.add(listener)
  return () => { _sphereEventListeners.delete(listener) }
}

// Also expose on window for use from terminal detection or other non-module code
;(window as any).__haloDispatchSphereEvent = dispatchSphereEvent

import { terminalActivityMap, setTerminalActivityMax } from './terminalActivity'
import { isFocusRecovering, onRecoveryChange } from '../../hooks/useFocusRecovery'
import { DEFAULT_CAMERA, type CameraSettings, type SphereStyleId } from '../../hooks/useSettings'
import { LAYOUT_3D_FNS, GROUP_LAYOUT_3D_FNS, computeStackInfo } from '../../layouts3d'
import { StackIndicatorPanel } from './StackIndicatorPanel'
import { ThreeThemeProvider, useThreeTheme } from '../../contexts/ThreeThemeContext'
import { Perf } from 'r3f-perf'

// Exposes renderer.info + CPU + memory stats to window for profiling scripts
function PerfStatsExporter() {
  const { gl } = useThree()
  const initialized = useRef(false)
  const lastFrameTime = useRef(0)
  useEffect(() => {
    gl.info.autoReset = false
    initialized.current = true
    return () => { gl.info.autoReset = true }
  }, [gl])
  useFrame(() => {
    if (!initialized.current) return
    const now = performance.now()
    const frameMs = lastFrameTime.current ? now - lastFrameTime.current : 0
    lastFrameTime.current = now

    const mem = (performance as any).memory
    ;(window as any).__haloPerfStats = {
      // GPU
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      // CPU
      frameBudgetMs: Math.round(frameMs * 100) / 100,
      // Memory (Chrome/Electron only)
      jsHeapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0,
      jsHeapLimitMB: mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : 0,
      timestamp: Date.now(),
    }
    gl.info.reset()
  })
  return null
}

// ── Procedural radial alpha texture — fully opaque center, soft fade to transparent at edges (P11) ──
function useRadialAlphaMap(size = 512): THREE.Texture {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const cx = size / 2
    const cy = size / 2
    // Radial gradient: opaque center → transparent edges
    // Inner 60% is fully opaque, then smooth falloff from 60% to 100% radius
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.55, 'rgba(255,255,255,1)')
    grad.addColorStop(0.75, 'rgba(255,255,255,0.6)')
    grad.addColorStop(0.88, 'rgba(255,255,255,0.2)')
    grad.addColorStop(0.96, 'rgba(255,255,255,0.04)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [size])
}

// ── Reflective Floor Platform (P11: radial alpha fade at edges) ──
function ReflectiveFloor({ radius = 16 }: { radius?: number }) {
  const theme = useThreeTheme()
  const alphaMap = useRadialAlphaMap(512)
  // Derive a dark floor color from the screen face
  const floorColor = useMemo(() => {
    return theme.screenFaceHex
  }, [theme.screenFaceHex])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <circleGeometry args={[radius, 128]} />
      <MeshReflectorMaterial
        mirror={0.15}
        resolution={512}
        mixBlur={10}
        mixStrength={0.4}
        roughness={0.92}
        metalness={0.3}
        color={floorColor}
        blur={[400, 150]}
        transparent
        alphaMap={alphaMap}
      />
    </mesh>
  )
}

// ── Floor Edge Mist — soft atmospheric glow ring at floor boundary (P11) ──
function FloorEdgeMist({ radius = 16 }: { radius?: number }) {
  const theme = useThreeTheme()
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(theme.accentHex) },
    uBgColor: { value: new THREE.Color(theme.backgroundHex) },
    uRadius: { value: radius },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep uniforms in sync with theme
  useFrame(() => {
    if (matRef.current) {
      matRef.current.uniforms.uColor.value.set(theme.accentHex)
      matRef.current.uniforms.uBgColor.value.set(theme.backgroundHex)
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <ringGeometry args={[radius * 0.6, radius * 1.15, 128]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          varying float vDist;
          void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vDist = length(wp.xz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          uniform vec3 uBgColor;
          uniform float uRadius;
          varying vec2 vUv;
          varying float vDist;
          void main() {
            // Mist band peaks around 75-90% of floor radius, fades in both directions
            float inner = uRadius * 0.6;
            float outer = uRadius * 1.15;
            float peak = uRadius * 0.82;
            float width = uRadius * 0.22;
            // Bell curve centered on the peak
            float d = (vDist - peak) / width;
            float mist = exp(-d * d * 2.0);
            // Tint: subtle mix of accent + background for atmospheric feel
            vec3 mistColor = mix(uBgColor, uColor, 0.15);
            float alpha = mist * 0.06;
            gl_FragColor = vec4(mistColor, alpha);
          }
        `}
      />
    </mesh>
  )
}

// ── Grid Lines (separate mesh on top of reflective floor) ──
function GridOverlay({ radius = 16 }: { radius?: number }) {
  const theme = useThreeTheme()
  const matRef = useRef<THREE.ShaderMaterial>(null)

  // Convert gridLine color to vec3 for shader
  const gridRGB = useMemo(() => {
    const c = theme.gridLine
    return [c.r, c.g, c.b]
  }, [theme.gridLine])

  useFrame((_, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += delta
  })

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uGridColor: { value: new THREE.Vector3(gridRGB[0], gridRGB[1], gridRGB[2]) },
    uRadius: { value: radius },
  }), [gridRGB, radius])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <circleGeometry args={[radius, 128]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        uniforms={uniforms}
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
          uniform vec3 uGridColor;
          uniform float uRadius;
          varying vec3 vWorldPos;
          void main() {
            float dist = length(vWorldPos.xz);
            float gs = 1.5;
            vec2 g = abs(fract(vWorldPos.xz / gs - 0.5) - 0.5) / fwidth(vWorldPos.xz / gs);
            float line = 1.0 - min(min(g.x, g.y), 1.0);
            // P11: wider edge fade (40% of radius) to match floor alpha fade
            float fadeStart = uRadius * 0.55;
            float edge = smoothstep(uRadius, fadeStart, dist);
            vec3 color = uGridColor * line * 0.5;
            float alpha = line * 0.1 * edge;
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </mesh>
  )
}

// ── Textured Platform Disc ──
// ── Procedural Ring Platform — infinite resolution, zero texture, crisp at any zoom ──
const RING_PLATFORM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const RING_PLATFORM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  uniform float uRadius;
  varying vec2 vUv;

  float ring(float dist, float center, float width) {
    return smoothstep(center - width, center, dist) - smoothstep(center, center + width, dist);
  }

  void main() {
    // Distance from center in UV space (0-1), mapped to world radius
    vec2 centered = vUv - 0.5;
    float dist = length(centered) * 2.0; // 0 at center, 1 at edge
    float angle = atan(centered.y, centered.x);

    // Fade out at edges
    float edgeFade = smoothstep(1.0, 0.92, dist);
    // Fade out at center
    float innerFade = smoothstep(0.15, 0.25, dist);

    // Color gradient: inner (warm) → outer (cyan)
    float t = smoothstep(0.2, 0.9, dist);
    vec3 baseColor = mix(uInnerColor, uOuterColor, t);

    // === Concentric rings — the signature look ===
    float ringDensity = 80.0;
    float ringDist = fract(dist * ringDensity);
    // Sharp ring lines with anti-aliased edges
    float ringWidth = 0.03 + 0.02 * sin(dist * 20.0); // varied width
    float ringLine = smoothstep(0.5 - ringWidth, 0.5, ringDist) - smoothstep(0.5, 0.5 + ringWidth, ringDist);

    // Major rings (every 8th ring is brighter)
    float majorRing = fract(dist * ringDensity / 8.0);
    float majorLine = smoothstep(0.45, 0.5, majorRing) - smoothstep(0.5, 0.55, majorRing);
    ringLine = max(ringLine * 0.5, majorLine);

    // === Tick marks — radial lines at regular angles ===
    float tickCount = 72.0;
    float tickAngle = fract(angle / (2.0 * 3.14159265) * tickCount);
    float tick = smoothstep(0.48, 0.5, tickAngle) - smoothstep(0.5, 0.52, tickAngle);
    // Ticks only in certain radius bands
    float tickBand = step(0.3, dist) * step(dist, 0.85);
    // Major ticks every 8th
    float majorTickAngle = fract(angle / (2.0 * 3.14159265) * (tickCount / 8.0));
    float majorTick = smoothstep(0.46, 0.5, majorTickAngle) - smoothstep(0.5, 0.54, majorTickAngle);
    tick = max(tick * 0.3, majorTick * 0.6) * tickBand;

    // === Marker dots at intersections ===
    float dotRing = ring(dist, 0.5, 0.008) + ring(dist, 0.7, 0.008) + ring(dist, 0.35, 0.006);
    float dotAngle = fract(angle / (2.0 * 3.14159265) * 36.0);
    float dot = smoothstep(0.03, 0.0, abs(dotAngle - 0.5)) * dotRing;

    // === Pulse wave expanding from center ===
    float pulse = smoothstep(0.3, 0.0, abs(dist - fract(uTime * 0.15))) * 0.25;

    // === Combine (clamped below bloom threshold to prevent motion streaks) ===
    float intensity = (ringLine * 0.2 + tick * 0.1 + dot * 0.3 + pulse * 0.3) * innerFade * edgeFade;
    vec3 color = baseColor * intensity;

    // Clamp output to stay below bloom luminance threshold (0.3)
    // This ensures ring lines NEVER trigger bloom, eliminating motion streaks
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color *= min(1.0, 0.25 / max(lum, 0.001));

    gl_FragColor = vec4(color, intensity * edgeFade * 0.7);
  }
`

function TexturedPlatform({ radius = 12, onLoad }: { radius?: number; onLoad?: () => void }) {
  const theme = useThreeTheme()
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const signaled = useRef(false)

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uInnerColor: { value: new THREE.Color(theme.sphereHex) },
    uOuterColor: { value: new THREE.Color(theme.screenEdgeHex) },
    uRadius: { value: radius },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime
      matRef.current.uniforms.uInnerColor.value.set(theme.sphereHex)
      matRef.current.uniforms.uOuterColor.value.set(theme.screenEdgeHex)
    }
    // Signal ready on first frame (no texture to wait for)
    if (!signaled.current) {
      signaled.current = true
      onLoad?.()
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <circleGeometry args={[radius, 128]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={RING_PLATFORM_VERT}
        fragmentShader={RING_PLATFORM_FRAG}
        uniforms={uniforms}
        transparent
        toneMapped={false}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// ── Instanced marker dots — renders N dots as a single draw call ──
const _dotGeo = new THREE.SphereGeometry(0.05, 6, 6)
const _dotMat = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0, toneMapped: false })
const _dotMatrix = new THREE.Matrix4()

function InstancedDots({ radius, count, accentHex, accentDim }: { radius: number; count: number; accentHex: string; accentDim: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const im = meshRef.current
    if (!im) return
    im.material = new THREE.MeshStandardMaterial({
      color: accentDim,
      emissive: accentHex,
      emissiveIntensity: 3,
      metalness: 1,
      roughness: 0,
      toneMapped: false,
    })
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      _dotMatrix.setPosition(Math.cos(a) * radius, Math.sin(a) * radius, -0.03)
      im.setMatrixAt(i, _dotMatrix)
    }
    im.instanceMatrix.needsUpdate = true
  }, [radius, count, accentHex, accentDim])

  return <instancedMesh ref={meshRef} args={[_dotGeo, _dotMat, count]} />
}

// ── Concentric Ring Platform with PBR materials ──
function PbrRingPlatform({ radius = 8.5 }: { radius?: number }) {
  const theme = useThreeTheme()
  const groupRef = useRef<THREE.Group>(null)
  const ringMatRef = useRef<THREE.ShaderMaterial>(null)
  // Scale factor relative to original 8.5 radius
  const s = radius / 8.5
  useFrame((state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.015
    if (ringMatRef.current) ringMatRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  // Derive inner/outer colors from theme
  const innerRGB = useMemo(() => {
    const c = theme.sphere
    return [c.r, c.g, c.b]
  }, [theme.sphere])
  const outerRGB = useMemo(() => {
    const c = theme.accent
    return [c.r, c.g, c.b]
  }, [theme.accent])

  return (
    <group ref={groupRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Shader ring lines — concentric rings with theme colors */}
      <mesh position={[0, 0, -0.01]}>
        <ringGeometry args={[1.0, radius, 128]} />
        <shaderMaterial
          ref={ringMatRef}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          uniforms={{
            uTime: { value: 0 },
            uInnerColor: { value: new THREE.Vector3(innerRGB[0], innerRGB[1], innerRGB[2]) },
            uOuterColor: { value: new THREE.Vector3(outerRGB[0], outerRGB[1], outerRGB[2]) },
          }}
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
            uniform float uTime;
            uniform vec3 uInnerColor;
            uniform vec3 uOuterColor;
            varying vec2 vUv;
            varying float vDist;

            void main() {
              // Dark base
              vec3 base = vec3(0.015, 0.02, 0.025);

              // Concentric ring lines at specific radii
              float line = 0.0;

              // Inner rings
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

              // Color: inner near center, outer at edges
              float t = smoothstep(1.5, 5.0, vDist);
              vec3 lineColor = mix(uInnerColor, uOuterColor, t);

              float frontFade = 1.0;

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

      {/* 32 marker dots as InstancedMesh — 1 draw call instead of 32 */}
      <InstancedDots radius={7.0 * s} count={32} accentHex={theme.accentHex} accentDim={theme.def.accentDim} />
    </group>
  )
}

// ── Audio bridge helper — reads FFT data from any registered analyser ──
// Checks window.__haloAudioAnalyser (V4 API) then falls back to legacy __halAudioAnalyser.
// Also supports window.__haloAudioDemo for sine-wave simulation without real audio.
function readAudioData(buf: Uint8Array, demoTime: number): { bass: number; mids: number; highs: number; volume: number; isActive: boolean } {
  const w = window as any

  // Demo mode: simulate audio with sine waves at different frequencies
  if (w.__haloAudioDemo) {
    const bass  = (Math.sin(demoTime * 2.1) * 0.5 + 0.5) * (0.6 + Math.sin(demoTime * 0.7) * 0.4)
    const mids  = (Math.sin(demoTime * 3.7 + 1.2) * 0.5 + 0.5) * 0.8
    const highs = (Math.sin(demoTime * 7.3 + 2.4) * 0.5 + 0.5) * 0.5
    const volume = (bass * 0.6 + mids * 0.3 + highs * 0.1)
    return { bass, mids, highs, volume, isActive: true }
  }

  // Real analyser: prefer V4 global, fall back to legacy name
  const analyser: AnalyserNode | null = w.__haloAudioAnalyser ?? w.__halAudioAnalyser ?? null
  const isSpeaking: boolean = !!(w.__halSpeaking)

  if (!analyser || !isSpeaking) {
    return { bass: 0, mids: 0, highs: 0, volume: 0, isActive: false }
  }

  analyser.getByteFrequencyData(buf)
  const len = buf.length
  // Split FFT bins: bass=0-10%, mids=10-40%, highs=40-80%
  const bassEnd  = Math.floor(len * 0.10)
  const midsEnd  = Math.floor(len * 0.40)
  const highsEnd = Math.floor(len * 0.80)

  let bassSum = 0, midsSum = 0, highsSum = 0
  for (let i = 0; i < bassEnd; i++) bassSum += buf[i]
  for (let i = bassEnd; i < midsEnd; i++) midsSum += buf[i]
  for (let i = midsEnd; i < highsEnd; i++) highsSum += buf[i]

  const bass  = bassSum  / (bassEnd * 255)
  const mids  = midsSum  / ((midsEnd  - bassEnd) * 255)
  const highs = highsSum / ((highsEnd - midsEnd) * 255)
  const volume = bass * 0.6 + mids * 0.3 + highs * 0.1

  return { bass, mids, highs, volume, isActive: true }
}

// ── P4: Procedural HAL Eye Canvas — animated concentric rings pulsing outward ──
// Renders at 30fps to a CanvasTexture used as emissiveMap on the inner core sphere.
function useHalEyeTexture(enabled: boolean): THREE.CanvasTexture | null {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled) {
      // Clean up if disabled
      if (animRef.current) cancelAnimationFrame(animRef.current)
      animRef.current = 0
      setTexture((prev) => { prev?.dispose(); return null })
      return
    }

    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    setTexture(tex)

    const ctx = canvas.getContext('2d')!
    const cx = size / 2
    const cy = size / 2

    let lastDraw = 0
    const FPS_INTERVAL = 1000 / 30 // 30fps cap

    function draw(now: number) {
      animRef.current = requestAnimationFrame(draw)

      // Throttle to 30fps
      if (now - lastDraw < FPS_INTERVAL) return
      lastDraw = now

      const t = now * 0.001 // seconds

      ctx.clearRect(0, 0, size, size)

      // Deep black background with subtle dark red gradient
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx)
      bgGrad.addColorStop(0, 'rgba(40, 5, 5, 1)')
      bgGrad.addColorStop(0.5, 'rgba(15, 2, 2, 1)')
      bgGrad.addColorStop(1, 'rgba(0, 0, 0, 1)')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, size, size)

      // ── Concentric rings pulsing outward — HAL 9000 eye ──
      const ringCount = 8
      const maxRadius = cx * 0.92

      for (let i = 0; i < ringCount; i++) {
        // Each ring expands outward over time, wrapping when it exceeds max radius
        const phase = (t * 0.4 + i / ringCount) % 1.0
        const radius = phase * maxRadius

        // Opacity: peak at center, fade at edges — with a sharper inner glow
        const fadeIn = Math.min(1, phase * 4)        // quick fade in at center
        const fadeOut = 1 - Math.pow(phase, 1.5)     // gradual fade out
        const opacity = fadeIn * fadeOut * 0.7

        if (opacity < 0.01) continue

        // Color: deep red core transitioning to orange-red at outer rings
        const hue = 0 + phase * 15 // 0 (red) to 15 (red-orange)
        const sat = 100 - phase * 20 // saturated center, slightly less at edges
        const light = 30 + (1 - phase) * 30 // brighter center

        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${opacity})`
        ctx.lineWidth = 3 + (1 - phase) * 4 // thicker at center
        ctx.stroke()
      }

      // ── Central bright spot — the "pupil" ──
      const pulseScale = 1 + Math.sin(t * 2.5) * 0.15
      const coreRadius = 12 * pulseScale
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 2)
      coreGrad.addColorStop(0, 'rgba(255, 80, 20, 0.95)')
      coreGrad.addColorStop(0.3, 'rgba(200, 30, 10, 0.7)')
      coreGrad.addColorStop(0.6, 'rgba(140, 10, 5, 0.3)')
      coreGrad.addColorStop(1, 'rgba(60, 0, 0, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, coreRadius * 2, 0, Math.PI * 2)
      ctx.fillStyle = coreGrad
      ctx.fill()

      // ── Bright white-hot center pinpoint ──
      const dotGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 4 * pulseScale)
      dotGrad.addColorStop(0, 'rgba(255, 220, 180, 0.9)')
      dotGrad.addColorStop(0.5, 'rgba(255, 120, 60, 0.5)')
      dotGrad.addColorStop(1, 'rgba(200, 40, 10, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, 4 * pulseScale, 0, Math.PI * 2)
      ctx.fillStyle = dotGrad
      ctx.fill()

      // ── Subtle rotating highlight — gives the eye a living quality ──
      const highlightAngle = t * 0.7
      const hx = cx + Math.cos(highlightAngle) * 20
      const hy = cy + Math.sin(highlightAngle) * 20
      const hlGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, 35)
      hlGrad.addColorStop(0, 'rgba(255, 100, 40, 0.12)')
      hlGrad.addColorStop(1, 'rgba(255, 50, 20, 0)')
      ctx.beginPath()
      ctx.arc(hx, hy, 35, 0, Math.PI * 2)
      ctx.fillStyle = hlGrad
      ctx.fill()

      tex.needsUpdate = true
    }

    animRef.current = requestAnimationFrame(draw)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      animRef.current = 0
      tex.dispose()
    }
  }, [enabled])

  return texture
}

// ── HAL Sphere — PBR version with audio-reactive animation ──
function PbrHalSphere({ blockedInput = false, voiceReactionIntensity = 0.5, sphereStyle = 'wireframe' }: { blockedInput?: boolean; voiceReactionIntensity?: number; sphereStyle?: SphereStyleId }) {
  const theme = useThreeTheme()
  const wireRef     = useRef<THREE.Mesh>(null)
  const coreRef     = useRef<THREE.Mesh>(null)
  const equatorRef  = useRef<THREE.Mesh>(null)
  const glowRef     = useRef<THREE.Mesh>(null)
  const light1Ref   = useRef<THREE.PointLight>(null)
  const light2Ref   = useRef<THREE.PointLight>(null)
  const flashRef    = useRef(0)    // countdown timer for blocked flash
  const videoMeshRef = useRef<THREE.Mesh>(null) // P4: video sphere mesh (animated-core)
  // HAL-eye iris ring refs for counter-rotation
  const irisRing0Ref = useRef<THREE.Mesh>(null)
  const irisRing1Ref = useRef<THREE.Mesh>(null)
  const irisRing2Ref = useRef<THREE.Mesh>(null)
  const irisRing3Ref = useRef<THREE.Mesh>(null)
  const irisRingRefs = [irisRing0Ref, irisRing1Ref, irisRing2Ref, irisRing3Ref]
  const audioDataRef = useRef(new Uint8Array(128))
  // Smoothed audio levels — exponential moving average for smooth animation
  const smoothedRef = useRef({ bass: 0, mids: 0, highs: 0, volume: 0 })

  // P4: Procedural HAL eye texture — only active when sphereStyle is 'animated-core'
  const halEyeTexture = useHalEyeTexture(sphereStyle === 'animated-core')

  // ── U4: Sphere event visual feedback state ──
  // Active event overlay — layered additively on top of audio reactions
  const eventRef = useRef<{
    active: boolean
    type: SphereEventType
    color: THREE.Color
    intensity: number
    elapsed: number
    duration: number
  }>({ active: false, type: 'info', color: new THREE.Color(), intensity: 0, elapsed: 0, duration: 0 })

  // Subscribe to sphere events
  useEffect(() => {
    return subscribeSphereEvents((event) => {
      const ev = eventRef.current
      ev.active = true
      ev.type = event.type
      ev.color.copy(SPHERE_EVENT_COLORS[event.type])
      ev.intensity = event.intensity ?? 1
      ev.elapsed = 0
      ev.duration = SPHERE_EVENT_DURATIONS[event.type]
    })
  }, [])

  // Derive a darkened version of sphere color for the wireframe base
  const sphereDark = useMemo(() => {
    const c = theme.sphere.clone()
    const hsl = { h: 0, s: 0, l: 0 }
    c.getHSL(hsl)
    c.setHSL(hsl.h, hsl.s, hsl.l * 0.2)
    return '#' + c.getHexString()
  }, [theme.sphere])

  const sphereVeryDark = useMemo(() => {
    const c = theme.sphere.clone()
    const hsl = { h: 0, s: 0, l: 0 }
    c.getHSL(hsl)
    c.setHSL(hsl.h, hsl.s, hsl.l * 0.08)
    return '#' + c.getHexString()
  }, [theme.sphere])

  // Base glow intensity from theme
  const baseGlowIntensity = theme.style?.sphereGlowIntensity ?? 3

  // Trigger flash when blockedInput goes true
  useEffect(() => {
    if (blockedInput) flashRef.current = 0.5
  }, [blockedInput])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime

    // Sample audio / demo data
    const raw = readAudioData(audioDataRef.current, t)

    // Smooth with EMA: fast attack (0.3), slow release (0.05)
    const smoothFactor = raw.isActive ? 0.25 : 0.04
    const s = smoothedRef.current
    s.bass   += (raw.bass   - s.bass)   * smoothFactor
    s.mids   += (raw.mids   - s.mids)   * smoothFactor
    s.highs  += (raw.highs  - s.highs)  * smoothFactor
    s.volume += (raw.volume - s.volume) * smoothFactor

    // Apply voice reaction intensity multiplier (0 = no reaction, 1 = default, 5 = exaggerated)
    const vri = voiceReactionIntensity
    const { bass: rawBass, mids: rawMids, highs: rawHighs, volume: rawVolume } = s
    const bass = rawBass * vri
    const mids = rawMids * vri
    const highs = rawHighs * vri
    const volume = rawVolume * vri
    const isActive = raw.isActive && vri > 0

    // ── Wireframe globe — scale with bass, speed with volume ──
    if (wireRef.current) {
      const idleRotSpeed = 0.15
      const activeRotBoost = isActive ? volume * 0.4 : 0
      wireRef.current.rotation.y += delta * (idleRotSpeed + activeRotBoost)

      // Bass-driven scale pulse: 1.0 idle, up to 1.12 at peak bass
      const idlePulse = 1.0 + Math.sin(t * 1.3) * 0.012
      const bassScale = isActive ? idlePulse + bass * 0.12 : idlePulse
      wireRef.current.scale.setScalar(bassScale)

      // Reset emissive to theme color each frame (U4: prevents event color drift)
      const wireMat = wireRef.current.material as THREE.MeshStandardMaterial
      wireMat.emissive.set(theme.sphereHex)
      // Brighten wireframe emissive when speaking
      if (isActive) {
        wireMat.emissiveIntensity = 0.6 + volume * 1.2
      } else {
        wireMat.emissiveIntensity = 0.6
      }
    }

    // ── Bright core — scale + glow with mids ──
    if (coreRef.current) {
      const mat = coreRef.current.material as THREE.MeshStandardMaterial

      // Blocked input flash takes priority
      if (flashRef.current > 0) {
        flashRef.current -= delta
        const intensity = Math.max(0, flashRef.current / 0.5)
        mat.emissive.setRGB(1, intensity * 0.2, intensity * 0.2)
        mat.emissiveIntensity = baseGlowIntensity + intensity * 8
        coreRef.current.scale.setScalar(0.38 + Math.sin(t * 2) * 0.03)
      } else {
        // Idle gentle pulse + audio-reactive mids boost
        const idleScale = 0.38 + Math.sin(t * 2) * 0.03
        const audioScale = isActive ? idleScale + mids * 0.18 : idleScale
        coreRef.current.scale.setScalar(audioScale)

        // Reset emissive to theme color, boost intensity with mids
        mat.emissive.set(theme.sphereGlowHex)
        mat.emissiveIntensity = isActive
          ? baseGlowIntensity + mids * 6
          : baseGlowIntensity
      }
    }

    // ── Equatorial band — rotate faster with volume, glow with mids ──
    if (equatorRef.current) {
      const idleSpeed = 0.3
      const audioSpeed = isActive ? volume * 2.5 : 0
      equatorRef.current.rotation.z += delta * (idleSpeed + audioSpeed)

      // Reset emissive to theme color each frame (U4: prevents event color drift)
      const eqMat = equatorRef.current.material as THREE.MeshStandardMaterial
      eqMat.emissive.set(theme.sphereGlowHex)
      if (isActive) {
        eqMat.emissiveIntensity = 2 + mids * 4
      } else {
        eqMat.emissiveIntensity = 2
      }
    }

    // ── Atmospheric glow — expand subtly with overall volume ──
    if (glowRef.current) {
      const idleScale = 1.0 + Math.sin(t * 0.7) * 0.02
      const audioExpand = isActive ? volume * 0.15 : 0
      glowRef.current.scale.setScalar(idleScale + audioExpand)
    }

    // ── Point lights — flicker with high frequencies ──
    if (light1Ref.current) {
      light1Ref.current.color.set(theme.sphereHex) // Reset to theme each frame (U4: prevents event color drift)
      const idleIntensity = 3
      const highFlicker = isActive ? highs * 4 + Math.sin(t * 17) * highs * 1.5 : 0
      light1Ref.current.intensity = idleIntensity + highFlicker
    }
    if (light2Ref.current) {
      light2Ref.current.color.set(theme.sphereGlowHex) // Reset to theme each frame (U4)
      const idleIntensity = 1.5
      const midGlow = isActive ? mids * 3 : 0
      light2Ref.current.intensity = idleIntensity + midGlow
    }

    // ── HAL-eye iris ring counter-rotation ──
    if (sphereStyle === 'hal-eye') {
      for (let i = 0; i < irisRingRefs.length; i++) {
        const ref = irisRingRefs[i]
        if (ref.current) {
          const dir = i % 2 === 0 ? 1 : -1
          const speed = 0.3 + i * 0.15
          const audioBoost = isActive ? volume * 1.5 : 0
          ref.current.rotation.z += delta * dir * (speed + audioBoost)
        }
      }
    }

    // ── U4: Sphere event overlay — additive color/glow on top of audio ──
    const ev = eventRef.current
    if (ev.active) {
      ev.elapsed += delta
      if (ev.elapsed >= ev.duration) {
        ev.active = false
      } else {
        const progress = ev.elapsed / ev.duration // 0→1
        // Envelope: fast attack (first 15%), sustain (15-50%), smooth decay (50-100%)
        let envelope: number
        if (progress < 0.15) {
          envelope = progress / 0.15 // ramp up
        } else if (progress < 0.5) {
          envelope = 1.0 // sustain
        } else {
          envelope = 1.0 - ((progress - 0.5) / 0.5) // decay
        }
        envelope *= ev.intensity
        // Clamp to avoid negative from float precision
        if (envelope < 0) envelope = 0

        // Event-specific animation modifiers
        let pulseModifier = 1.0
        if (ev.type === 'error') {
          // Rapid flash: 8Hz strobe
          pulseModifier = 0.5 + 0.5 * Math.abs(Math.sin(ev.elapsed * 8 * Math.PI))
        } else if (ev.type === 'push') {
          // Blue ripple: slow wave
          pulseModifier = 0.7 + 0.3 * Math.sin(ev.elapsed * 4)
        } else if (ev.type === 'success') {
          // Green pulse: smooth throb
          pulseModifier = 0.8 + 0.2 * Math.sin(ev.elapsed * 6)
        }

        const strength = envelope * pulseModifier

        // Overlay on core — blend event color into emissive, boost intensity
        if (coreRef.current) {
          const mat = coreRef.current.material as THREE.MeshStandardMaterial
          // Lerp emissive color toward event color by strength (additive blend)
          mat.emissive.lerp(ev.color, strength * 0.7)
          mat.emissiveIntensity += strength * 6
          // Scale pulse: slight expansion during event
          const currentScale = coreRef.current.scale.x
          coreRef.current.scale.setScalar(currentScale + strength * 0.08)
        }

        // Overlay on wireframe — tint wireframe emissive
        if (wireRef.current) {
          const mat = wireRef.current.material as THREE.MeshStandardMaterial
          mat.emissive.lerp(ev.color, strength * 0.4)
          mat.emissiveIntensity += strength * 1.5
        }

        // Overlay on equatorial band
        if (equatorRef.current) {
          const mat = equatorRef.current.material as THREE.MeshStandardMaterial
          mat.emissive.lerp(ev.color, strength * 0.5)
          mat.emissiveIntensity += strength * 3
        }

        // Atmospheric glow expansion
        if (glowRef.current) {
          const currentScale = glowRef.current.scale.x
          glowRef.current.scale.setScalar(currentScale + strength * 0.2)
        }

        // Boost point lights with event color
        if (light1Ref.current) {
          light1Ref.current.color.lerp(ev.color, strength * 0.5)
          light1Ref.current.intensity += strength * 5
        }
        if (light2Ref.current) {
          light2Ref.current.color.lerp(ev.color, strength * 0.5)
          light2Ref.current.intensity += strength * 3
        }
      }
    }
  })

  return (
    <group position={[0, 1.3, 0]}>

      {/* ════════ WIREFRAME style — default sci-fi globe ════════ */}
      {sphereStyle === 'wireframe' && (
        <>
          {/* Wireframe globe */}
          <mesh ref={wireRef}>
            <sphereGeometry args={[1.3, 36, 24]} />
            <meshStandardMaterial
              color={sphereDark}
              emissive={theme.sphereHex}
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
              color={sphereVeryDark}
              emissive={theme.sphereHex}
              emissiveIntensity={0.1}
              transparent
              opacity={0.15}
              metalness={0.5}
              roughness={0.8}
            />
          </mesh>

          {/* Bright core — audio-reactive via coreRef */}
          <mesh ref={coreRef} scale={0.38}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial
              color={theme.sphereHex}
              emissive={theme.sphereGlowHex}
              emissiveIntensity={baseGlowIntensity}
              toneMapped={false}
            />
          </mesh>

          {/* Equatorial band — rotation speed driven by volume */}
          <mesh ref={equatorRef} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.3, 0.02, 8, 128]} />
            <meshStandardMaterial emissive={theme.sphereGlowHex} emissiveIntensity={2} toneMapped={false} metalness={1} roughness={0} />
          </mesh>

          {/* Latitude rings for globe detail */}
          {[0.4, 0.8, -0.4, -0.8].map((y, i) => (
            <mesh key={`lat-${i}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[Math.sqrt(1.3 * 1.3 - y * y), 0.006, 6, 64]} />
              <meshStandardMaterial emissive={theme.sphereHex} emissiveIntensity={0.5} toneMapped={false} metalness={1} roughness={0} />
            </mesh>
          ))}
        </>
      )}

      {/* ════════ HAL-EYE style — 3D HAL 9000 eye with iris rings ════════ */}
      {sphereStyle === 'hal-eye' && (
        <>
          {/* Black bezel — torus ring around the lens housing */}
          <mesh rotation={[0, 0, 0]}>
            <torusGeometry args={[1.35, 0.12, 24, 64]} />
            <meshStandardMaterial color="#0a0a0a" metalness={0.95} roughness={0.15} />
          </mesh>

          {/* Glass lens — semi-transparent with physical material properties */}
          <mesh>
            <sphereGeometry args={[1.3, 48, 48]} />
            <meshPhysicalMaterial
              color="#1a0000"
              transmission={0.3}
              ior={1.5}
              clearcoat={1}
              clearcoatRoughness={0.05}
              metalness={0.1}
              roughness={0.05}
              transparent
              opacity={0.6}
              envMapIntensity={0.5}
              depthWrite={false}
            />
          </mesh>

          {/* 4 concentric iris rings — dark red to bright red, counter-rotating */}
          {[
            { radius: 0.35, tube: 0.06, color: '#660000', emissive: '#880000', intensity: 1.5 },
            { radius: 0.55, tube: 0.05, color: '#880000', emissive: '#aa2200', intensity: 2.0 },
            { radius: 0.78, tube: 0.04, color: '#aa1100', emissive: '#cc3300', intensity: 2.5 },
            { radius: 1.02, tube: 0.035, color: '#cc2200', emissive: '#ff4400', intensity: 3.0 },
          ].map((ring, i) => (
            <mesh key={`iris-${i}`} ref={irisRingRefs[i]}>
              <torusGeometry args={[ring.radius, ring.tube, 12, 64]} />
              <meshStandardMaterial
                color={ring.color}
                emissive={ring.emissive}
                emissiveIntensity={ring.intensity}
                metalness={0.8}
                roughness={0.2}
                toneMapped={false}
              />
            </mesh>
          ))}

          {/* Glowing center core — bright red emissive pupil */}
          <mesh ref={coreRef} scale={0.25}>
            <sphereGeometry args={[1, 24, 24]} />
            <meshStandardMaterial
              color="#ff2200"
              emissive="#ff4400"
              emissiveIntensity={6}
              toneMapped={false}
            />
          </mesh>

          {/* Bloom halo disc — large flat disc behind the eye for bloom glow */}
          <mesh position={[0, 0, -0.1]} rotation={[0, 0, 0]}>
            <circleGeometry args={[1.6, 48]} />
            <meshBasicMaterial
              color="#ff2200"
              transparent
              opacity={0.04}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>

          {/* Equatorial band — shared with wireframe for audio reactivity */}
          <mesh ref={equatorRef} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.35, 0.015, 8, 128]} />
            <meshStandardMaterial emissive="#ff4400" emissiveIntensity={1.5} toneMapped={false} metalness={1} roughness={0} />
          </mesh>

          {/* Wireframe ref (invisible but needed for audio reactivity on refs) */}
          <mesh ref={wireRef} visible={false}>
            <sphereGeometry args={[1.3, 8, 8]} />
            <meshStandardMaterial wireframe transparent opacity={0} />
          </mesh>
        </>
      )}

      {/* ════════ ANIMATED-CORE style — canvas texture eye + semi-transparent wireframe shell ════════ */}
      {sphereStyle === 'animated-core' && (
        <>
          {/* Semi-transparent wireframe shell */}
          <mesh ref={wireRef}>
            <sphereGeometry args={[1.3, 36, 24]} />
            <meshStandardMaterial
              color={sphereDark}
              emissive={theme.sphereHex}
              emissiveIntensity={0.4}
              wireframe
              transparent
              opacity={0.35}
              metalness={0.9}
              roughness={0.2}
              toneMapped={false}
            />
          </mesh>

          {/* P4: Procedural HAL eye canvas texture mapped onto inner sphere */}
          {halEyeTexture && (
            <mesh ref={videoMeshRef} scale={0.6}>
              <sphereGeometry args={[1, 32, 32]} />
              <meshStandardMaterial
                map={halEyeTexture}
                emissiveMap={halEyeTexture}
                emissive="#ff4400"
                emissiveIntensity={1.5}
                transparent
                opacity={0.85}
                toneMapped={false}
                depthWrite={false}
                metalness={0.2}
                roughness={0.6}
                side={THREE.FrontSide}
              />
            </mesh>
          )}

          {/* Bright core — audio-reactive via coreRef */}
          <mesh ref={coreRef} scale={0.38}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial
              color={theme.sphereHex}
              emissive={theme.sphereGlowHex}
              emissiveIntensity={baseGlowIntensity}
              toneMapped={false}
            />
          </mesh>

          {/* Equatorial band — rotation speed driven by volume */}
          <mesh ref={equatorRef} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.3, 0.02, 8, 128]} />
            <meshStandardMaterial emissive={theme.sphereGlowHex} emissiveIntensity={2} toneMapped={false} metalness={1} roughness={0} />
          </mesh>
        </>
      )}

      {/* ════════ SHARED across all styles ════════ */}

      {/* Atmospheric glow — expands with overall volume */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[2, 16, 16]} />
        <meshBasicMaterial color={theme.sphereHex} transparent opacity={0.008} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Lights from sphere — audio-reactive intensity */}
      <pointLight ref={light1Ref} color={theme.sphereHex} intensity={3} distance={8} decay={2} />
      <pointLight ref={light2Ref} color={theme.sphereGlowHex} intensity={1.5} distance={5} decay={2} position={[0, 1, 0]} />
    </group>
  )
}

// ── Sonar Pulse Ring — HAL heartbeat indicator ──
// cycleOffset: phase shift in seconds; baseCycle: idle cycle length in seconds
function PulseRing({ cycleOffset = 0, baseCycle = 3 }: { cycleOffset?: number; baseCycle?: number }) {
  const theme = useThreeTheme()
  const ringRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    if (!ringRef.current || !matRef.current) return
    // When audio is active, shorten cycle to ~1s for rapid heartbeat effect
    const w = window as any
    const isSpeaking = !!(w.__halSpeaking) || !!(w.__haloAudioDemo)
    const cycle = isSpeaking ? Math.max(baseCycle * 0.35, 1.0) : baseCycle
    const t = ((state.clock.elapsedTime + cycleOffset) % cycle) / cycle
    const scale = 1 + t * 2
    ringRef.current.scale.set(scale, scale, 1)
    // Speaking rings are brighter and faster-fading
    const peakOpacity = isSpeaking ? 0.9 : 0.6
    matRef.current.opacity = peakOpacity * (1 - t) * (1 - t)
  })

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
      <ringGeometry args={[0.8, 1.0, 64]} />
      <meshBasicMaterial
        ref={matRef}
        color={theme.accentHex}
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
// When speaking, a third ring fires to create a rapid triple-heartbeat
function SonarPulse() {
  const theme = useThreeTheme()
  const ring2Ref = useRef<THREE.Mesh>(null)
  const mat2Ref = useRef<THREE.MeshBasicMaterial>(null)
  const ring3Ref = useRef<THREE.Mesh>(null)
  const mat3Ref = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    // Ring 2 — staggered by half cycle
    if (ring2Ref.current && mat2Ref.current) {
      const w = window as any
      const isSpeaking = !!(w.__halSpeaking) || !!(w.__haloAudioDemo)
      const cycle = isSpeaking ? 1.05 : 3
      const t = ((state.clock.elapsedTime + cycle * 0.5) % cycle) / cycle
      const scale = 1 + t * 2
      ring2Ref.current.scale.set(scale, scale, 1)
      const peakOpacity = isSpeaking ? 0.9 : 0.6
      mat2Ref.current.opacity = peakOpacity * (1 - t) * (1 - t)
    }

    // Ring 3 — only visible when speaking (offset at 2/3 cycle)
    if (ring3Ref.current && mat3Ref.current) {
      const w = window as any
      const isSpeaking = !!(w.__halSpeaking) || !!(w.__haloAudioDemo)
      if (isSpeaking) {
        const cycle = 1.05
        const t = ((state.clock.elapsedTime + cycle * 0.33) % cycle) / cycle
        const scale = 1 + t * 2
        ring3Ref.current.scale.set(scale, scale, 1)
        mat3Ref.current.opacity = 0.7 * (1 - t) * (1 - t)
      } else {
        mat3Ref.current.opacity = 0
      }
    }
  })

  return (
    <group>
      <PulseRing cycleOffset={0} baseCycle={3} />
      {/* Second staggered ring */}
      <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.8, 1.0, 64]} />
        <meshBasicMaterial
          ref={mat2Ref}
          color={theme.accentHex}
          transparent
          opacity={0.6}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* Third ring — speaking only, creates rapid triple-heartbeat */}
      <mesh ref={ring3Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.8, 1.0, 64]} />
        <meshBasicMaterial
          ref={mat3Ref}
          color={theme.accentHex}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

// ── Post Processing ──
class PostFXErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch() { /* EffectComposer alpha crash — swallow and retry */ }
  componentDidUpdate(_: any, prevState: { hasError: boolean }) {
    if (this.state.hasError && !prevState.hasError) {
      setTimeout(() => this.setState({ hasError: false }), 500)
    }
  }
  render() { return this.state.hasError ? null : this.props.children }
}

function PostFXInner() {
  const theme = useThreeTheme()
  const { gl } = useThree()
  const chromaticVal = theme.style?.chromaticOffset ?? 0.0006
  const vignetteVal = theme.style?.vignetteStrength ?? 0.6
  const offset = useMemo(() => new Vector2(chromaticVal, chromaticVal), [chromaticVal])

  // Derive a stable key from the gl context id so EffectComposer remounts
  // if the underlying WebGL context is replaced (e.g., after Canvas key remount).
  const glKey = useMemo(() => {
    try { return (gl?.getContext?.() as any)?.getParameter?.(0x1F02) ?? 0 } catch { return 0 }
  }, [gl])

  if (!gl?.domElement || !gl?.getContext?.()) return null
  return (
    <EffectComposer key={glKey}>
      {/* Bloom disabled — causes visible line streaks on camera movement from all bright emissive elements.
           Re-enable when P14 (graphics quality presets) is implemented with scale-aware line widths.
      <Bloom luminanceThreshold={theme.bloom.threshold} luminanceSmoothing={0.8} intensity={theme.bloom.intensity} radius={Math.min(theme.bloom.radius, 0.5)} width={512} height={512} /> */}
      {/* ChromaticAberration disabled — binary search confirmed it causes horizontal lines on bright edges */}
      <Vignette darkness={vignetteVal} offset={0.3} />
    </EffectComposer>
  )
}

function PostFX({ enabled = true }: { enabled?: boolean }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { if (enabled) setReady(true) }, [enabled])
  if (!ready) return null
  return (
    <PostFXErrorBoundary>
      <PostFXInner />
    </PostFXErrorBoundary>
  )
}

// ── Scene Lighting ──
function SceneLights() {
  const theme = useThreeTheme()
  // Derive a dim spot light color from accent
  const spotColor = useMemo(() => {
    const c = theme.accent.clone()
    const hsl = { h: 0, s: 0, l: 0 }
    c.getHSL(hsl)
    c.setHSL(hsl.h, hsl.s * 0.6, hsl.l * 0.3)
    return '#' + c.getHexString()
  }, [theme.accent])

  return (
    <>
      <ambientLight intensity={0.008} color={theme.backgroundHex} />
      {/* Overhead spot lights illuminating the screens — 4 lights (45° apart) cover full ring */}
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2
        const r = 7
        return (
          <spotLight
            key={i}
            position={[Math.cos(a) * r, 6, Math.sin(a) * r]}
            target-position={[Math.cos(a) * r, 0, Math.sin(a) * r]}
            angle={0.6}
            penumbra={0.9}
            intensity={0.9}
            color={spotColor}
            distance={14}
          />
        )
      })}
    </>
  )
}

// ── Scene Background ──
function SceneBackground() {
  const theme = useThreeTheme()
  return <color attach="background" args={[theme.backgroundHex]} />
}

// ── AutoRotate Manager — pauses rotation on user interaction, resumes after 3s ──
// Also pauses during active search (U7) so search results stay in view.
function AutoRotateManager({ searchActive = false }: { searchActive?: boolean }) {
  const { controls } = useThree()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interactingRef = useRef(false)

  // Pause/resume auto-rotate when search state changes (U7)
  useEffect(() => {
    if (!controls) return
    const orbitControls = controls as any
    if (searchActive) {
      orbitControls.autoRotate = false
    } else if (!interactingRef.current) {
      orbitControls.autoRotate = true
    }
  }, [searchActive, controls])

  useEffect(() => {
    if (!controls) return
    const orbitControls = controls as any

    const onStart = () => {
      interactingRef.current = true
      orbitControls.autoRotate = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }

    const onEnd = () => {
      interactingRef.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      // Don't resume auto-rotate while search is active (U7)
      if (searchActive) return
      timeoutRef.current = setTimeout(() => {
        orbitControls.autoRotate = true
      }, 3000)
    }

    orbitControls.addEventListener('start', onStart)
    orbitControls.addEventListener('end', onEnd)

    return () => {
      orbitControls.removeEventListener('start', onStart)
      orbitControls.removeEventListener('end', onEnd)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [controls, searchActive])

  return null
}

// ── Camera Driver — pushes settings changes into the actual Three.js camera + OrbitControls ──
function CameraDriver({ distance, angle }: { distance: number; angle: number }) {
  const { camera, controls } = useThree()
  const prevDist = useRef(distance)
  const prevAngle = useRef(angle)

  useEffect(() => {
    // Only drive camera when settings changed (not from orbit sync)
    if (Math.abs(distance - prevDist.current) > 0.3 || Math.abs(angle - prevAngle.current) > 0.5) {
      const angleRad = (angle * Math.PI) / 180
      const y = Math.sin(angleRad) * distance
      const z = Math.cos(angleRad) * distance
      camera.position.set(0, y, z)
      camera.lookAt(0, 0, 0)
      if (controls && 'update' in controls) (controls as any).update()
      prevDist.current = distance
      prevAngle.current = angle
    }
  }, [distance, angle, camera, controls])

  return null
}

// ── Camera Sync — reads orbit/zoom and reports back to settings sliders ──
function CameraSync({ onCameraMove }: { onCameraMove: (distance: number, angle: number) => void }) {
  const { camera } = useThree()
  const lastReportRef = useRef({ distance: 0, angle: 0, time: 0 })

  useFrame(() => {
    const now = performance.now()
    const last = lastReportRef.current
    // Throttle: max 2 updates/second (500ms)
    if (now - last.time < 500) return

    const distance = camera.position.length()
    const angle = Math.asin(camera.position.y / distance) * (180 / Math.PI)

    // Only report if values changed significantly (distance ±0.5, angle ±1°)
    if (Math.abs(distance - last.distance) < 0.5 && Math.abs(angle - last.angle) < 1) return

    lastReportRef.current = { distance, angle, time: now }
    onCameraMove(distance, angle)
  })

  return null
}

// ── Scene Ready Gate — waits for texture + N frames before signaling ready ──
function SceneReadyGate({ textureReady, onReady }: { textureReady: boolean; onReady: () => void }) {
  const frameCount = useRef(0)
  const signaled = useRef(false)
  useFrame(() => {
    if (signaled.current) return
    frameCount.current++
    if (textureReady && frameCount.current >= 4) {
      signaled.current = true
      onReady()
    }
  })
  return null
}

// ── Scene Phase Manager — staged reveal (0→1→2→3) after scene ready ──
function ScenePhaseManager({ sceneReady, onPhaseChange }: { sceneReady: boolean; onPhaseChange: (p: number) => void }) {
  const phaseRef = useRef(0)
  const timerRef = useRef(0)
  useFrame((_, delta) => {
    if (!sceneReady || phaseRef.current >= 3) return
    timerRef.current += delta
    if (phaseRef.current === 0) { phaseRef.current = 1; onPhaseChange(1) }
    if (phaseRef.current === 1 && timerRef.current > 0.2) { phaseRef.current = 2; onPhaseChange(2) }
    if (phaseRef.current === 2 && timerRef.current > 0.5) { phaseRef.current = 3; onPhaseChange(3) }
  })
  return null
}

// ── P5b: Group Trails — curved particle energy trails between grouped projects ──
// Particles flow along CatmullRom splines connecting projects in the same group.
// Single InstancedMesh with small emissive spheres (max 50 particles total).
const _trailColor = new THREE.Color()
const _trailDummy = new THREE.Object3D()
const MAX_TRAIL_PARTICLES = 50

interface TrailCurve {
  curve: THREE.CatmullRomCurve3
  color: THREE.Color
}

interface TrailParticle {
  curveIdx: number  // index into curves array
  t: number         // 0→1 progress along curve
  speed: number     // units per second (in t-space)
  phase: number     // lifecycle phase offset for staggering
}

function GroupTrails({ projects, groups, assignments, screenPositions, searchActive }: {
  projects: ProjectInfo[]
  groups: ProjectGroup[]
  assignments: Record<string, string>
  screenPositions: { position: [number, number, number]; rotation: [number, number, number] }[]
  searchActive: boolean
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const opacityRef = useRef(0)

  // Build curved splines between group members (pairwise, not all-to-all for large groups)
  const { curves, particleCount } = useMemo(() => {
    const result: TrailCurve[] = []
    if (groups.length < 2 || screenPositions.length === 0) {
      return { curves: result, particleCount: 0 }
    }

    // Map group id → member screen positions
    const groupMembers = new Map<string, number[]>()
    projects.forEach((p, i) => {
      const gId = assignments[p.path]
      if (!gId) return
      if (!groups.some((g) => g.id === gId)) return
      const arr = groupMembers.get(gId) || []
      arr.push(i)
      groupMembers.set(gId, arr)
    })

    // Build pairwise curves for groups with 2+ members
    // For groups with many members, connect sequential pairs (ring topology) to avoid O(n^2) curves
    for (const [gId, members] of groupMembers) {
      if (members.length < 2) continue
      const group = groups.find((g) => g.id === gId)
      if (!group) continue

      const color = new THREE.Color(group.color)

      // Ring topology: connect member[0]→[1], [1]→[2], ... [n-1]→[0]
      for (let j = 0; j < members.length; j++) {
        const idxA = members[j]
        const idxB = members[(j + 1) % members.length]
        const spA = screenPositions[idxA]
        const spB = screenPositions[idxB]
        if (!spA || !spB) continue

        const pA = new THREE.Vector3(spA.position[0], spA.position[1], spA.position[2])
        const pB = new THREE.Vector3(spB.position[0], spB.position[1], spB.position[2])

        // Midpoint elevated by 2 units for a nice arc
        const mid = new THREE.Vector3().lerpVectors(pA, pB, 0.5)
        mid.y += 2.0

        // 4-point CatmullRom: slightly inside start/end + elevated mid for smooth arc
        const qA = new THREE.Vector3().lerpVectors(pA, mid, 0.15)
        const qB = new THREE.Vector3().lerpVectors(pB, mid, 0.15)

        const curve = new THREE.CatmullRomCurve3([pA, qA, mid, qB, pB], false, 'catmullrom', 0.5)
        result.push({ curve, color })
      }
    }

    if (result.length === 0) return { curves: result, particleCount: 0 }

    // Distribute particles across curves, max total = MAX_TRAIL_PARTICLES
    // Each curve gets at least 2 particles, proportionally distributed
    const perCurve = Math.max(2, Math.floor(MAX_TRAIL_PARTICLES / result.length))
    const total = Math.min(MAX_TRAIL_PARTICLES, perCurve * result.length)
    return { curves: result, particleCount: total }
  }, [projects, groups, assignments, screenPositions])

  // Initialize particle state
  const particles = useMemo(() => {
    if (particleCount === 0 || curves.length === 0) return []
    const perCurve = Math.floor(particleCount / curves.length)
    const remainder = particleCount - perCurve * curves.length
    const result: TrailParticle[] = []

    for (let c = 0; c < curves.length; c++) {
      const n = perCurve + (c < remainder ? 1 : 0)
      for (let j = 0; j < n; j++) {
        result.push({
          curveIdx: c,
          t: Math.random(), // staggered start positions
          speed: 0.12 + Math.random() * 0.10, // 0.12-0.22 t/s → traversal in ~5-8s
          phase: Math.random() * Math.PI * 2,
        })
      }
    }
    return result
  }, [particleCount, curves.length])

  // Sphere geometry + material (created once)
  const geo = useMemo(() => new THREE.SphereGeometry(0.035, 4, 3), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  }), [])

  // Animate particles along curves
  useFrame((_, delta) => {
    if (!meshRef.current || particles.length === 0 || curves.length === 0) return

    // Fade opacity based on search state
    const targetOpacity = searchActive ? 0.02 : 0.6
    opacityRef.current += (targetOpacity - opacityRef.current) * Math.min(1, delta * 3)
    mat.opacity = opacityRef.current

    const mesh = meshRef.current

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      const trail = curves[p.curveIdx]
      if (!trail) continue

      // Advance along curve
      p.t += p.speed * delta
      if (p.t >= 1) {
        p.t -= 1 // wrap around for continuous flow
      }

      // Lifecycle opacity: fade in at start, fade out at end
      // Smooth triangle: ramp 0→1 over first 15%, hold, ramp 1→0 over last 15%
      let lifeFade: number
      if (p.t < 0.15) {
        lifeFade = p.t / 0.15
      } else if (p.t > 0.85) {
        lifeFade = (1 - p.t) / 0.15
      } else {
        lifeFade = 1
      }

      // Get position on curve
      const point = trail.curve.getPointAt(Math.min(p.t, 1))

      // Scale by lifecycle fade (smaller when fading in/out)
      const scale = 0.6 + lifeFade * 0.4
      _trailDummy.position.copy(point)
      _trailDummy.scale.setScalar(scale)
      _trailDummy.updateMatrix()
      mesh.setMatrixAt(i, _trailDummy.matrix)

      // Per-instance color with lifecycle brightness
      _trailColor.copy(trail.color)
      // Brighten slightly for glow effect
      _trailColor.multiplyScalar(0.8 + lifeFade * 0.6)
      mesh.setColorAt(i, _trailColor)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  if (particleCount === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geo, mat, particleCount]}
      frustumCulled={false}
    />
  )
}

// ── External session matching helper (T3) ──
type ExternalSession = { pid: number; projectPath: string; projectName: string }

function matchExternalSession(
  projectPath: string,
  externalSessions: ExternalSession[],
): ExternalSession | undefined {
  if (externalSessions.length === 0) return undefined
  const norm = projectPath.replace(/\\/g, '/').toLowerCase()
  return externalSessions.find((s) => {
    const ePath = s.projectPath.replace(/\\/g, '/').toLowerCase()
    return ePath === norm || norm.includes(ePath) || ePath.includes(norm)
  }) || externalSessions.find((s) => {
    const eName = s.projectName.toLowerCase()
    const pName = projectPath.split(/[/\\]/).pop()?.toLowerCase() || ''
    return eName === pName
  })
}

// ── Main PBR Scene ──
interface Props {
  projects: ProjectInfo[]
  searchQuery?: string // When non-empty, matching panels animate closer to camera; non-matching dim
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
  themeId?: string
  onCameraMove?: (distance: number, angle: number) => void
  blockedInput?: boolean
  onProjectContextMenu?: (x: number, y: number, projectPath: string, projectName: string, rulesOutdated?: boolean) => void
  isFavorite?: (path: string) => boolean
  screenOpacity?: number
  particleDensity?: number
  renderQuality?: number
  showPerf?: boolean
  onSceneReady?: () => void
  shipVfxEnabled?: boolean
  sphereStyle?: SphereStyleId
  voiceReactionIntensity?: number
  activityFeedback?: boolean
  // Session absorption (T3)
  externalSessions?: ExternalSession[]
  absorbingPid?: number | null
  onAbsorb?: (extSession: ExternalSession, project: ProjectInfo) => void
  // IDE (U19)
  getIdeLabel?: (projectPath: string) => string | undefined
  onOpenIde?: (projectPath: string) => void
  onOpenIdeMenu?: (projectPath: string, e: React.MouseEvent) => void
  onOpenExternalTerminal?: (projectPath: string) => void
  // U11: Embedded browser
  onOpenBrowser?: (projectPath: string, projectName: string) => void
  // M2: Cinematic demo mode
  cinematicActive?: boolean
  onCinematicComplete?: () => void
  // M2c: Intro fly-in animation
  introAnimation?: boolean
  // U18: Merge conflict 3D graph
  mergeStates?: Record<string, import('../../types/merge').MergeState>
  commitGraphs?: Record<string, import('../../types/merge').CommitNode[]>
  // U18 Phase 3: Conflict viewer interaction
  selectedConflictFile?: string | null
  onSelectConflictFile?: (projectPath: string, filePath: string) => void
  // U18 Phase 5: Resolved files tracking for MergeGraph VFX
  resolvedFilesMap?: Record<string, Set<string>>
}

// ── Inner scene wrapper — manages phase state inside R3F context (useFrame) ──
interface PbrSceneInnerProps {
  projects: ProjectInfo[]
  searchQuery: string
  isFullySetup: (p: ProjectInfo) => boolean
  onOpenTerminal?: (path: string, name: string, resume: boolean) => void
  halOnline?: boolean
  layoutId: string
  terminalCount: number
  vfxFrequency: number
  groups: ProjectGroup[]
  assignments: Record<string, string>
  camera: CameraSettings
  onCameraMove?: (distance: number, angle: number) => void
  blockedInput: boolean
  onProjectContextMenu?: (x: number, y: number, projectPath: string, projectName: string, rulesOutdated?: boolean) => void
  isFavorite?: (path: string) => boolean
  screenOpacity: number
  particleDensity: number
  showPerf: boolean
  onSceneReady?: () => void
  floorRadius: number
  platformRadius: number
  ringPlatformRadius: number
  maxCamDistance: number
  shipVfxEnabled: boolean
  sphereStyle: SphereStyleId
  voiceReactionIntensity: number
  activityFeedback: boolean
  // Session absorption (T3)
  externalSessions: ExternalSession[]
  absorbingPid: number | null
  onAbsorb?: (extSession: ExternalSession, project: ProjectInfo) => void
  // IDE (U19)
  getIdeLabel?: (projectPath: string) => string | undefined
  onOpenIde?: (projectPath: string) => void
  onOpenIdeMenu?: (projectPath: string, e: React.MouseEvent) => void
  onOpenExternalTerminal?: (projectPath: string) => void
  // U11: Embedded browser
  onOpenBrowser?: (projectPath: string, projectName: string) => void
  // M2: Cinematic demo mode
  cinematicActive: boolean
  onCinematicComplete?: () => void
  // M2c: Intro fly-in animation
  introAnimation: boolean
  onIntroComplete?: () => void
  // U18: Merge conflict 3D graph
  mergeStates: Record<string, import('../../types/merge').MergeState>
  commitGraphs: Record<string, import('../../types/merge').CommitNode[]>
  // U18 Phase 3: Conflict viewer interaction
  selectedConflictFile: string | null
  onSelectConflictFile?: (projectPath: string, filePath: string) => void
  // U18 Phase 5: Resolved files tracking for MergeGraph VFX
  resolvedFilesMap: Record<string, Set<string>>
}

function PbrSceneInner({
  projects, searchQuery, isFullySetup, onOpenTerminal, halOnline, layoutId, terminalCount, vfxFrequency,
  groups, assignments, camera, onCameraMove, blockedInput, onProjectContextMenu, isFavorite,
  screenOpacity, particleDensity, showPerf, onSceneReady,
  floorRadius, platformRadius, ringPlatformRadius, maxCamDistance, shipVfxEnabled, sphereStyle, voiceReactionIntensity, activityFeedback,
  externalSessions, absorbingPid, onAbsorb,
  getIdeLabel, onOpenIde, onOpenIdeMenu, onOpenExternalTerminal,
  onOpenBrowser,
  cinematicActive, onCinematicComplete,
  introAnimation, onIntroComplete,
  mergeStates, commitGraphs,
  selectedConflictFile, onSelectConflictFile,
  resolvedFilesMap,
}: PbrSceneInnerProps) {
  // PERF6: hoveredId moved to module-level ref in ScreenPanel.tsx — zero parent re-renders on hover
  const flybyRef = useRef<SpaceshipFlybyHandle>(null)
  const prevTermCountRef = useRef(terminalCount)

  // M2+: Cinematic merge simulation — fake merge state for the demo sequence
  const [cinematicMerge, setCinematicMerge] = useState<import('../../types/merge').MergeState | null>(null)
  const [cinematicMergeResolved, setCinematicMergeResolved] = useState<Set<string> | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      const phase = (e as CustomEvent).detail?.phase as string
      if (phase === 'start') {
        setCinematicMerge({
          inMerge: true,
          mergeType: 'merge',
          conflictFiles: [
            { path: 'src/components/App.tsx', status: 'UU', chunks: [] },
            { path: 'src/hooks/useAuth.ts', status: 'UU', chunks: [] },
            { path: 'src/styles/theme.css', status: 'UU', chunks: [] },
          ],
          ourBranch: 'main',
          theirBranch: 'feature/holographic-ui',
        })
        setCinematicMergeResolved(null)
      } else if (phase === 'resolve') {
        setCinematicMergeResolved(new Set([
          'src/components/App.tsx',
          'src/hooks/useAuth.ts',
          'src/styles/theme.css',
        ]))
      } else if (phase === 'clear') {
        setCinematicMerge(null)
        setCinematicMergeResolved(null)
      }
    }
    window.addEventListener('halo-cinematic-merge', handler)
    return () => window.removeEventListener('halo-cinematic-merge', handler)
  }, [])

  // Merge states — overlay cinematic merge on top of real merge states
  const effectiveMergeStates = useMemo(() => {
    if (!cinematicMerge) return mergeStates
    return { ...mergeStates, '__cinematic__': cinematicMerge }
  }, [mergeStates, cinematicMerge])

  const effectiveResolvedFilesMap = useMemo(() => {
    if (!cinematicMergeResolved) return resolvedFilesMap
    return { ...resolvedFilesMap, '__cinematic__': cinematicMergeResolved }
  }, [resolvedFilesMap, cinematicMergeResolved])

  // U20: Listen for terminal-activity IPC events — writes to global map for ScreenPanel to read
  useEffect(() => {
    if (!activityFeedback || !window.api?.onTerminalActivity) return
    const unsub = window.api.onTerminalActivity((info) => {
      terminalActivityMap.set(info.projectPath, info.activityLevel)
      // Compute max activity across all sessions for sphere drive
      let maxLevel = 0
      for (const level of terminalActivityMap.values()) {
        if (level > maxLevel) maxLevel = level
      }
      setTerminalActivityMax(maxLevel)
      // Dispatch sphere event for high activity bursts (>60) — brief info pulse
      if (info.activityLevel > 60) {
        dispatchSphereEvent({ type: 'info', intensity: Math.min(1, info.activityLevel / 100) * 0.3 })
      }
    })
    return () => {
      unsub()
      terminalActivityMap.clear()
      setTerminalActivityMax(0)
    }
  }, [activityFeedback])

  // Scene loading phase state
  const [textureLoaded, setTextureLoaded] = useState(false)
  const [scenePhase, setScenePhase] = useState(0)
  const [sceneReady, setSceneReady] = useState(false)
  const fadeRef = useRef({ particles: 0, hud: 0, screens: 0 })

  // M2c: Intro fly-in animation — activates when scene first becomes ready
  // Intro: DISABLED — looping bug needs investigation. Re-enable when fixed.
  const introActive = false
  // const [introActive, setIntroActive] = useState(false)
  // useEffect(() => {
  //   if (sceneReady && introAnimation && !cinematicActive && !sessionStorage.getItem('hal-o-intro-done')) {
  //     sessionStorage.setItem('hal-o-intro-done', '1')
  //     setIntroActive(true)
  //   }
  // }, [sceneReady, introAnimation, cinematicActive])

  // Interpolate fade values each frame based on current scene phase
  useFrame((_, delta) => {
    const f = fadeRef.current
    f.particles += ((scenePhase >= 3 ? 1 : 0) - f.particles) * Math.min(1, delta * 2.5)
    f.hud += ((scenePhase >= 2 ? 0.14 : 0) - f.hud) * Math.min(1, delta * 3)
    f.screens += ((scenePhase >= 2 ? screenOpacity : 0) - f.screens) * Math.min(1, delta * 3)
  })

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
    const raw = groupFn
      ? groupFn(projects.length, groupIndices, groups.length)
      : (LAYOUT_3D_FNS[layoutId] || LAYOUT_3D_FNS['default'])(projects.length)

    // Safety clamp: layouts3d.ts already uses MIN_PANEL_Y = 1.0, but this
    // guards against any future layout that might produce a Y below the floor.
    return raw.map((sp) => ({
      ...sp,
      position: [sp.position[0], Math.max(1.0, sp.position[1]), sp.position[2]] as [number, number, number],
    }))
  }, [projects.length, layoutId, groupIndices, groups.length])

  // Compute stack info for group-aware layouts (hide overflow, show stack indicators)
  const stackInfo = useMemo(() => {
    const isGroupLayout = !!GROUP_LAYOUT_3D_FNS[layoutId]
    if (!isGroupLayout || groups.length === 0) return null
    return computeStackInfo(groupIndices, groups.length, screenPositions, 6)
  }, [layoutId, groupIndices, groups.length, screenPositions])

  // Build group index -> group name map for stack indicator labels
  const groupNameMap = useMemo(() => {
    const m = new Map<number, string>()
    groups.forEach((g, i) => m.set(i, g.name))
    return m
  }, [groups])

  // ── Search-aware positioning (U7) ──
  // When search is active, matching panels animate to a tight arc in front of the camera.
  // Non-matching panels stay in place but get dimmed.
  const searchActive = searchQuery.length > 0
  const searchLower = searchQuery.toLowerCase()

  const searchMatchIndices = useMemo(() => {
    if (!searchActive) return new Set<number>()
    const matches = new Set<number>()
    projects.forEach((p, i) => {
      if (
        p.name.toLowerCase().includes(searchLower) ||
        p.path.toLowerCase().includes(searchLower) ||
        p.stack.toLowerCase().includes(searchLower)
      ) {
        matches.add(i)
      }
    })
    return matches
  }, [projects, searchLower, searchActive])

  // Compute search-result positions: a tight arc in front of camera, facing center
  const searchPositions = useMemo(() => {
    if (!searchActive) return null
    const matchCount = searchMatchIndices.size
    if (matchCount === 0) return new Map<number, { position: [number, number, number]; rotation: [number, number, number] }>()

    // Place matching panels in a compact arc at z+ (camera side), facing the origin.
    // Camera is at positive-Z looking toward origin, so panels at angle=PI/2 are closest.
    const searchRadius = Math.max(5, Math.min(8, matchCount * 0.8))
    const arcSpan = Math.min(Math.PI * 0.8, matchCount * 0.35) // narrower arc for fewer results
    const centerAngle = Math.PI / 2 // center of arc faces the camera
    const startAngle = centerAngle - arcSpan / 2
    const yBase = 2.5 // slightly elevated for better visibility

    const result = new Map<number, { position: [number, number, number]; rotation: [number, number, number] }>()
    const sortedMatches = Array.from(searchMatchIndices).sort((a, b) => a - b)
    sortedMatches.forEach((idx, rank) => {
      const t = matchCount === 1 ? 0.5 : rank / (matchCount - 1)
      const angle = startAngle + t * arcSpan
      const x = Math.cos(angle) * searchRadius
      const z = Math.sin(angle) * searchRadius
      // Face toward center
      const rotY = -angle + Math.PI / 2
      result.set(idx, {
        position: [x, yBase, z],
        rotation: [0, rotY, 0],
      })
    })
    return result
  }, [searchActive, searchMatchIndices])

  // Trigger spaceship flyby + U4 sphere brightness surge when a new terminal opens
  useEffect(() => {
    if (terminalCount > prevTermCountRef.current) {
      if (shipVfxEnabled) flybyRef.current?.trigger()
      // U4: brief brightness surge on new terminal
      dispatchSphereEvent({ type: 'info', intensity: 0.8 })
    }
    prevTermCountRef.current = terminalCount
  }, [terminalCount, shipVfxEnabled])

  // Periodic VFX spawns (demo mode frequency slider)
  useEffect(() => {
    if (!vfxFrequency || vfxFrequency <= 0) return
    const interval = setInterval(() => {
      if (shipVfxEnabled) flybyRef.current?.trigger()
    }, vfxFrequency * 1000)
    return () => clearInterval(interval)
  }, [vfxFrequency, shipVfxEnabled])

  // A11: "Ship it!" flyby — triggered when git push is detected in any terminal
  useEffect(() => {
    if (!window.api.onShipItFlyby) return
    const unsub = window.api.onShipItFlyby((info) => {
      console.log(`[PbrScene] A11: Ship it! flyby for "${info.projectName}" (ship #${info.shipIndex})`)
      flybyRef.current?.trigger()
      // U4: blue ripple on git push — complements the ship flyby
      dispatchSphereEvent({ type: 'push', intensity: 1.0 })
    })
    return unsub
  }, [])

  return (
    <>
      {showPerf && <Perf position="bottom-left" deepAnalyze />}
      <PerfStatsExporter />
      <SceneBackground />

      <SceneLights />
      {/* No starfield in PBR — pure dark cinematic */}
      <ReflectiveFloor radius={floorRadius} />
      <FloorEdgeMist radius={floorRadius} />
      <GridOverlay radius={floorRadius} />
      <TexturedPlatform radius={platformRadius} onLoad={() => setTextureLoaded(true)} />
      <PbrRingPlatform radius={ringPlatformRadius} />
      <PbrHalSphere blockedInput={blockedInput} voiceReactionIntensity={voiceReactionIntensity} sphereStyle={sphereStyle} />

      {/* Ambient data particles — faded in at phase 3 */}
      <DataParticles projectCount={projects.length} hideDist={camera.particleHideDist} densityLevel={particleDensity} fadeMultiplier={fadeRef.current.particles} />

      {/* Scrolling HUD text strips — faded in at phase 2 */}
      <HudScrollText opacity={fadeRef.current.hud} />

      {/* Spaceship flyby — triggered on new terminal open */}
      <SpaceshipFlyby ref={flybyRef} enabled={shipVfxEnabled} />

      {/* Sonar pulse — HAL heartbeat */}
      {halOnline && <SonarPulse />}

      {/* U18: 3D Merge Conflict Graphs — render for each project currently in merge (+ cinematic overlay) */}
      {Object.entries(effectiveMergeStates).map(([projectPath, mergeState]) => {
        if (!mergeState.inMerge) return null
        const graph = commitGraphs[projectPath] || []
        const resolvedFiles = effectiveResolvedFilesMap[projectPath]
        // Phase 5: Determine if all conflict files in this project are resolved
        const allFilesResolved = resolvedFiles != null && mergeState.conflictFiles.length > 0 &&
          mergeState.conflictFiles.every(f => resolvedFiles.has(f.path))
        return (
          <MergeGraph
            key={`merge-${projectPath}`}
            mergeState={mergeState}
            commitGraph={graph}
            selectedFile={selectedConflictFile}
            onSelectFile={onSelectConflictFile ? (filePath) => onSelectConflictFile(projectPath, filePath) : undefined}
            resolvedFiles={resolvedFiles}
            allResolved={allFilesResolved}
          />
        )
      })}

      {/* B22 PERF: Single useFrame that detects camera movement + user interaction.
          ScreenPanel useFrame callbacks then skip work when camera is static or throttle
          during active orbit/zoom, eliminating 100x per-panel vector math per frame. */}
      <ScreenPanelUpdater />

      {/* P5b: Curved particle energy trails between grouped projects */}
      {/* GroupTrails disabled — purple arcs visible and distracting. Needs design rethink.
      <GroupTrails
        projects={projects}
        groups={groups}
        assignments={assignments}
        screenPositions={screenPositions}
        searchActive={searchActive}
      /> */}

      {/* Screens — skip stacked (hidden) projects when stack info is active */}
      {projects.map((project, i) => {
        const sp = screenPositions[i]
        if (!sp) return null
        // If stack info exists and this project is not in the visible set, skip it
        if (stackInfo && !stackInfo.visibleIndices.has(i)) return null
        const extSession = matchExternalSession(project.path, externalSessions)
        // Search-aware positioning (U7): matching panels get a searchTarget, non-matching get dimmed
        const isMatch = searchActive ? searchMatchIndices.has(i) : false
        const searchTargetPos = searchActive && isMatch && searchPositions ? searchPositions.get(i) : undefined
        const isDimmed = searchActive && !isMatch
        return (
          <ScreenPanel
            key={project.path}
            position={sp.position}
            rotation={sp.rotation}
            projectName={project.name}
            projectPath={project.path}
            stack={project.stack}
            ready={isFullySetup(project)}
            onResume={() => onOpenTerminal?.(project.path, project.name, true)}
            onNewSession={() => onOpenTerminal?.(project.path, project.name, false)}
            onFiles={() => window.api.openFolder(project.path)}
            runCmd={project.runCmd}
            onRunApp={project.runCmd ? () => window.api.runApp(project.path, project.runCmd) : undefined}
            groupColor={projectGroupColors[i]}
            healthStatus={(project as any).configLevel === 'bare' ? 'neutral' : !isFullySetup(project) ? 'warning' : 'ok'}
            rulesOutdated={(project as any).rulesOutdated === true}
            isFavorite={isFavorite ? isFavorite(project.path) : false}
            demoStats={project.demoStats}
            screenOpacity={fadeRef.current.screens}
            isExternal={!!extSession}
            isAbsorbing={extSession ? absorbingPid === extSession.pid : false}
            onAbsorb={extSession && onAbsorb ? () => onAbsorb(extSession, project) : undefined}
            onContextMenu={onProjectContextMenu ? (e: React.MouseEvent) => {
              e.preventDefault()
              onProjectContextMenu(e.clientX, e.clientY, project.path, project.name, (project as any).rulesOutdated)
            } : undefined}
            ideLabel={getIdeLabel ? getIdeLabel(project.path) : undefined}
            onOpenIde={onOpenIde ? () => onOpenIde(project.path) : undefined}
            onOpenIdeMenu={onOpenIdeMenu ? (e: React.MouseEvent) => onOpenIdeMenu(project.path, e) : undefined}
            onOpenTerminal={onOpenExternalTerminal ? () => onOpenExternalTerminal(project.path) : undefined}
            onOpenBrowser={onOpenBrowser ? () => onOpenBrowser(project.path, project.name) : undefined}
            searchTarget={searchTargetPos}
            searchDimmed={isDimmed}
            inMerge={!!mergeStates[project.path]?.inMerge}
          />
        )
      })}

      {/* Stack indicator panels — shown when groups overflow */}
      {stackInfo?.stacks.map((stack) => (
        <StackIndicatorPanel
          key={`stack-${stack.groupIndex}`}
          position={stack.position}
          rotation={stack.rotation}
          count={stack.hiddenCount}
          groupColor={groups[stack.groupIndex]?.color}
          groupName={groupNameMap.get(stack.groupIndex)}
        />
      ))}

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={true}
        minDistance={6}
        maxDistance={maxCamDistance}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2 - 0.03}
        autoRotate
        autoRotateSpeed={0.12}
        target={[0, 0.3, 0]}
      />
      <AutoRotateManager searchActive={searchActive} />

      <CameraDriver distance={camera.cameraDistance} angle={camera.cameraAngle} />
      {onCameraMove && <CameraSync onCameraMove={onCameraMove} />}

      {/* Scene ready gate + phase manager */}
      <SceneReadyGate textureReady={textureLoaded} onReady={() => { setSceneReady(true); onSceneReady?.() }} />
      <ScenePhaseManager sceneReady={sceneReady} onPhaseChange={setScenePhase} />

      {/* M2: Cinematic demo mode — scripted camera sequence */}
      <CinematicSequence
        active={cinematicActive}
        onComplete={onCinematicComplete}
        flybyRef={flybyRef}
        loop={true}
      />

      {/* M2c: Intro fly-in animation — plays once on app start, unmount when done */}
      {introActive && (
        <IntroSequence
          active={true}
          onComplete={() => { setIntroActive(false); onIntroComplete?.() }}
          finalTarget={[0, 0.3, 0]}
        />
      )}

      <PostFX enabled={scenePhase >= 3} />
    </>
  )
}

// ── InvalidateExporter — wires R3F invalidate() to a ref accessible outside Canvas ──
// B29: Also performs burst-invalidation via useFrame during focus recovery window.
// This replaces the old setTimeout-based burst (B24) which fired too early before React re-rendered.
function InvalidateExporter({ invalidateRef }: { invalidateRef: React.MutableRefObject<(() => void) | null> }) {
  const { invalidate } = useThree()
  const burstRef = useRef(false)
  useEffect(() => {
    invalidateRef.current = invalidate
    // Start/stop burst invalidation when recovery state changes
    const unsub = onRecoveryChange((recovering) => { burstRef.current = recovering })
    // If already recovering on mount, start burst
    if (isFocusRecovering()) burstRef.current = true
    return () => { invalidateRef.current = null; unsub() }
  }, [invalidate, invalidateRef])
  // During recovery: invalidate every frame to keep the render loop fully warm
  useFrame(() => {
    if (burstRef.current) invalidate()
  })
  return null
}

export function PbrHoloScene({ projects, searchQuery = '', listening, isFullySetup, onOpenTerminal, halOnline, layoutId = 'default', terminalCount = 0, vfxFrequency = 0, groups = [], assignments = {}, camera = DEFAULT_CAMERA, themeId = 'tactical', onCameraMove, blockedInput = false, onProjectContextMenu, isFavorite, screenOpacity = 1, particleDensity = 8, renderQuality, showPerf = false, onSceneReady, shipVfxEnabled = true, sphereStyle = 'wireframe', voiceReactionIntensity = 0.5, activityFeedback = true, externalSessions = [], absorbingPid = null, onAbsorb, getIdeLabel, onOpenIde, onOpenIdeMenu, onOpenExternalTerminal, onOpenBrowser, cinematicActive = false, onCinematicComplete, introAnimation = true, mergeStates = {}, commitGraphs = {}, selectedConflictFile, onSelectConflictFile, resolvedFilesMap = {} }: Props) {
  // Key-based Canvas remount: when themeId changes we force a full Canvas unmount/remount
  // so EffectComposer gets a fresh WebGL context and never touches stale render targets.
  // This is the root-cause fix for the "Cannot read properties of null (reading 'alpha')" crash.
  const [canvasKey, setCanvasKey] = useState(0)
  const prevThemeRef = useRef(themeId)
  useEffect(() => {
    if (themeId !== prevThemeRef.current) {
      prevThemeRef.current = themeId
      setCanvasKey((k) => k + 1)
    }
  }, [themeId])

  // Read --primary CSS var to bridge Tier 1 color palette → Tier 2 3D style
  const [accentHex, setAccentHex] = useState(() => {
    if (typeof document === 'undefined') return '#84cc16'
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#84cc16'
  })

  // Observe style attribute changes on <html> to detect palette switches
  useEffect(() => {
    const root = document.documentElement
    const readAccent = () => {
      const v = getComputedStyle(root).getPropertyValue('--primary').trim()
      if (v) setAccentHex(v)
    }
    readAccent()
    const observer = new MutationObserver(readAccent)
    observer.observe(root, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [])

  // Scale camera max distance with screen ring radius so users can always zoom out to see the full ring
  const screenRadius = Math.max(8, projects.length * 0.55)
  const floorRadius = Math.max(20, screenRadius * 1.8)
  const platformRadius = Math.max(12, screenRadius * 1.2)
  const ringPlatformRadius = Math.max(8.5, screenRadius * 1.0)
  const maxCamDistance = Math.max(40, screenRadius * 2.5)

  // Compute camera position from settings
  const angleRad = (camera.cameraAngle * Math.PI) / 180
  const camY = Math.sin(angleRad) * camera.cameraDistance
  const camZ = Math.cos(angleRad) * camera.cameraDistance

  // ── Blur throttle: switch to demand frameloop when window loses focus ──
  // On blur: frameloop→demand + 5fps invalidate timer. On focus: frameloop→always.
  // B29: Burst invalidation is now handled by InvalidateExporter's useFrame loop
  // (driven by useFocusRecovery), replacing the old B24 setTimeout burst.
  // The frameloop switch stays "demand" during recovery — InvalidateExporter's useFrame
  // calls invalidate() every frame in demand mode, which is equivalent to "always" but
  // avoids the React state update overhead during the critical recovery window.
  const [frameloop, setFrameloop] = useState<'always' | 'demand'>('always')
  const blurTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const invalidateRef = useRef<(() => void) | null>(null)
  const frameloopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const startThrottle = () => {
      if (frameloopTimerRef.current) { clearTimeout(frameloopTimerRef.current); frameloopTimerRef.current = null }
      setFrameloop('demand')
      if (!blurTimerRef.current) {
        blurTimerRef.current = setInterval(() => { invalidateRef.current?.() }, 200)
      }
    }
    const stopThrottle = () => {
      if (blurTimerRef.current) { clearInterval(blurTimerRef.current); blurTimerRef.current = null }
      // B29: Don't switch to "always" immediately — keep "demand" while the
      // InvalidateExporter useFrame burst handles frame production.
      // Defer the frameloop→always switch by 1.5s so the React state update
      // doesn't cause a re-render storm during the recovery window.
      if (frameloopTimerRef.current) clearTimeout(frameloopTimerRef.current)
      frameloopTimerRef.current = setTimeout(() => {
        setFrameloop('always')
        frameloopTimerRef.current = null
      }, 1500)
      // Kick-start an immediate invalidation so the very first frame renders instantly
      invalidateRef.current?.()
    }
    const off = window.api.onWindowFocusChange?.((focused) => {
      if (focused) stopThrottle(); else startThrottle()
    })
    const onVisible = () => {
      if (document.hidden) startThrottle(); else stopThrottle()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (blurTimerRef.current) { clearInterval(blurTimerRef.current); blurTimerRef.current = null }
      if (frameloopTimerRef.current) { clearTimeout(frameloopTimerRef.current); frameloopTimerRef.current = null }
      off?.()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <Canvas
      key={canvasKey}
      style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}
      camera={{ position: [0, camY, camZ], fov: 48, near: 0.1, far: 1000 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop={frameloop}
      dpr={typeof window !== 'undefined' && localStorage.getItem('hal-o-dpr-override') ? Number(localStorage.getItem('hal-o-dpr-override')) : (renderQuality ?? Math.min(window.devicePixelRatio, 2))}
    >
      <InvalidateExporter invalidateRef={invalidateRef} />
      <ThreeThemeProvider styleId={themeId} accentHex={accentHex}>
        <PbrSceneInner
          projects={projects}
          searchQuery={searchQuery}
          isFullySetup={isFullySetup}
          onOpenTerminal={onOpenTerminal}
          halOnline={halOnline}
          layoutId={layoutId}
          terminalCount={terminalCount}
          vfxFrequency={vfxFrequency}
          groups={groups}
          assignments={assignments}
          camera={camera}
          onCameraMove={onCameraMove}
          blockedInput={blockedInput}
          onProjectContextMenu={onProjectContextMenu}
          isFavorite={isFavorite}
          screenOpacity={screenOpacity}
          particleDensity={particleDensity}
          showPerf={showPerf}
          onSceneReady={onSceneReady}
          floorRadius={floorRadius}
          platformRadius={platformRadius}
          ringPlatformRadius={ringPlatformRadius}
          maxCamDistance={maxCamDistance}
          shipVfxEnabled={shipVfxEnabled}
          sphereStyle={sphereStyle}
          voiceReactionIntensity={voiceReactionIntensity}
          activityFeedback={activityFeedback}
          externalSessions={externalSessions}
          absorbingPid={absorbingPid}
          onAbsorb={onAbsorb}
          getIdeLabel={getIdeLabel}
          onOpenIde={onOpenIde}
          onOpenIdeMenu={onOpenIdeMenu}
          onOpenExternalTerminal={onOpenExternalTerminal}
          onOpenBrowser={onOpenBrowser}
          cinematicActive={cinematicActive}
          onCinematicComplete={onCinematicComplete}
          introAnimation={introAnimation}
          mergeStates={mergeStates}
          commitGraphs={commitGraphs}
          selectedConflictFile={selectedConflictFile ?? null}
          onSelectConflictFile={onSelectConflictFile}
          resolvedFilesMap={resolvedFilesMap}
        />
      </ThreeThemeProvider>
    </Canvas>
  )
}
