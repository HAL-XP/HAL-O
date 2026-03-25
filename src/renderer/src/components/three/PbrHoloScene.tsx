import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import { OrbitControls, Environment, MeshReflectorMaterial, Float, useTexture, Html } from '@react-three/drei'
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { Starfield } from './Starfield'
import { ScreenPanel, ScreenPanelUpdater, onFocusRecovery, triggerSectorEntry } from './ScreenPanel'
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

// ── Photo Mode API — window globals for staging marketing screenshots ──
// Usage from DevTools or Playwright page.evaluate():
//   window.__haloPhotoMode.triggerFlyby()    — spawn spaceship
//   window.__haloPhotoMode.setActivity(80)   — fake terminal activity on all projects
//   window.__haloPhotoMode.sphereEvent(type, intensity) — trigger sphere glow
//   window.__haloPhotoMode.pauseAutoRotate() — freeze rotation for framing
//   window.__haloPhotoMode.resumeAutoRotate()
//   window.__haloPhotoMode.setAudioDemo(true) — fake audio for sphere pulse
//   window.__haloPhotoMode.setCamera(x,y,z)  — snap camera (OrbitControls disabled until resumeAutoRotate)
//   window.__haloPhotoMode.animateCamera(keyframes) — smooth camera animation inside useFrame
//   window.__haloPhotoMode.stopAnimation()   — abort in-progress animation
//   window.__haloPhotoMode.testAudioSignal('square') — synthetic audio: 1s on / 1s off loop
//   window.__haloPhotoMode.testAudioSignal('ramp')   — synthetic audio: ramp 0→max over 3s then stop
//   window.__haloPhotoMode.testAudioSignal('stop')   — stop any running test signal
//
// ── Debug overlay ──
//   window.__haloDebugAudio = true   — show per-frame HUD above sphere
//                                      (VOL | SMOOTH | WIRE scale | CORE scale | EMIT | F#)
//   window.__haloDebugAudio = false  — hide it
// Combine with testAudioSignal to verify 1:1 scale tracking with no lag.
let _photoModeFlybyRef: { current: { trigger: () => void } | null } = { current: null }

// Module-level camera animation state — read inside useFrame by PhotoModeAnimator.
// Using module-level (not React state) so page.evaluate() calls take effect
// immediately without triggering re-renders or losing state across frames.
export interface PhotoAnimKeyframe { t: number; pos: [number, number, number]; lookAt?: [number, number, number] }
let _photoAnimKeyframes: PhotoAnimKeyframe[] | null = null
let _photoAnimStart = 0

// Pending snap-camera request — consumed by PhotoModeAnimator on the next frame
let _photoSnapPending: [number, number, number] | null = null

;(window as any).__haloPhotoMode = {
  triggerFlyby: () => _photoModeFlybyRef.current?.trigger(),
  setActivity: (level: number) => {
    // Set fake activity on all projects in the terminalActivityMap
    const map = terminalActivityMap as Map<string, number>
    for (const key of map.keys()) map.set(key, level)
    // Also set a default for projects not yet in map
    setTerminalActivityMax(level)
  },
  sphereEvent: (type: string = 'info', intensity: number = 1.0) => {
    dispatchSphereEvent({ type: type as any, intensity })
  },
  pauseAutoRotate: () => {
    const w = window as any
    if (w.__haloOrbitControls) w.__haloOrbitControls.autoRotate = false
  },
  resumeAutoRotate: () => {
    const w = window as any
    if (w.__haloOrbitControls) {
      w.__haloOrbitControls.autoRotate = true
      w.__haloOrbitControls.enabled = true
    }
  },
  setAudioDemo: (on: boolean) => {
    ;(window as any).__haloAudioDemo = on
  },
  // ── Audio test signal generator ──
  // Creates a synthetic AudioNode chain connected to the global AnalyserNode so the
  // sphere reacts to a known signal pattern without needing real TTS audio.
  //
  // Usage:
  //   window.__haloPhotoMode.testAudioSignal('square')  — 1s full-blast, 1s silence, repeating
  //   window.__haloPhotoMode.testAudioSignal('ramp')    — 0→max over 3s then stops
  //   window.__haloPhotoMode.testAudioSignal('stop')    — disconnect & stop any running signal
  testAudioSignal: (() => {
    // Keep a reference to the running gain+osc so we can stop it later.
    let _testGain: GainNode | null = null
    let _testOsc: OscillatorNode | null = null
    let _testInterval: ReturnType<typeof setInterval> | null = null

    return (pattern: 'square' | 'ramp' | 'stop' = 'square') => {
      // Tear down any previous test signal
      try { _testOsc?.stop() } catch (_) {}
      _testOsc = null
      if (_testGain) { try { _testGain.disconnect() } catch (_) {} _testGain = null }
      if (_testInterval) { clearInterval(_testInterval); _testInterval = null }
      ;(window as any).__halSpeaking = false

      if (pattern === 'stop') return

      const analyser: AnalyserNode | null = (window as any).__haloAudioAnalyser ?? (window as any).__halAudioAnalyser ?? null
      if (!analyser) { console.warn('[testAudioSignal] No AnalyserNode available — call after app is loaded'); return }

      const ctx = analyser.context as AudioContext
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})

      // Build: Oscillator (440 Hz sine) → GainNode → AnalyserNode
      // The gain envelope IS the "volume" — 0=silence, 1=full.
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 440

      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(analyser)

      osc.start()
      _testOsc = osc
      _testGain = gain
      ;(window as any).__halSpeaking = true

      if (pattern === 'square') {
        // 1s on, 1s off — toggle GainNode value
        let on = true
        gain.gain.value = 1
        _testInterval = setInterval(() => {
          on = !on
          gain.gain.value = on ? 1 : 0
        }, 1000)
        console.log('[testAudioSignal] square wave: 1s on / 1s off. Stop with testAudioSignal("stop")')

      } else if (pattern === 'ramp') {
        // Ramp gain 0→1 over 3s, then stop
        gain.gain.setValueAtTime(0, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 3)
        setTimeout(() => {
          try { osc.stop() } catch (_) {}
          ;(window as any).__halSpeaking = false
          console.log('[testAudioSignal] ramp finished')
        }, 3100)
        console.log('[testAudioSignal] ramp: 0→1 over 3s')
      }
    }
  })(),
  // Snap camera to [x, y, z] — processed inside useFrame so OrbitControls cannot
  // overwrite it. OrbitControls is disabled until resumeAutoRotate() is called.
  setCamera: (x: number, y: number, z: number) => {
    _photoAnimKeyframes = null   // cancel any running animation
    _photoSnapPending = [x, y, z]
  },
  // Animate camera through keyframes: [{ t: ms, pos: [x,y,z] }, ...]
  // The animation runs inside useFrame — immune to OrbitControls overwrite.
  // OrbitControls is re-enabled automatically when the animation completes.
  animateCamera: (keyframes: PhotoAnimKeyframe[]) => {
    if (!keyframes || keyframes.length === 0) return
    _photoSnapPending = null
    _photoAnimKeyframes = keyframes
    _photoAnimStart = performance.now()
  },
  // Abort a running animateCamera() and re-enable OrbitControls
  stopAnimation: () => {
    _photoAnimKeyframes = null
    _photoSnapPending = null
    const w = window as any
    if (w.__haloOrbitControls) {
      w.__haloOrbitControls.enabled = true
    }
  },
  // Preset camera angles (processed inside useFrame via setCamera)
  closeUp: () => (window as any).__haloPhotoMode?.setCamera(0, 6, 10),
  wideShot: () => (window as any).__haloPhotoMode?.setCamera(0, 12, 22),
  heroAngle: () => (window as any).__haloPhotoMode?.setCamera(5, 8, 14),
  topDown: () => (window as any).__haloPhotoMode?.setCamera(0, 20, 1),
}

import { terminalActivityMap, terminalActivityMax, setTerminalActivityMax } from './terminalActivity'
import { isFocusRecovering, onRecoveryChange } from '../../hooks/useFocusRecovery'
import { isTerminalFocused } from '../TerminalPanel'

// B31: Lightweight scene throttle — checked by useFrame callbacks to skip heavy work.
// No React state changes, no re-renders, just a mutable flag.
let _sceneThrottled = false
export function isSceneThrottled(): boolean { return _sceneThrottled }

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { _sceneThrottled = document.hidden })
  // Poll terminal focus
  setInterval(() => { _sceneThrottled = document.hidden || isTerminalFocused() }, 500)
}
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

// ── Reflective Floor Platform — shader-injected analytical alpha edge ──
// Option C: uses useEffect to chain onto MeshReflectorMaterial's existing onBeforeCompile,
// preserving reflections while injecting a smoothstep radial fade into the fragment shader.
//
// The geometry is oversized (radius * 1.2) — the shader fade hits zero at 82% of floorRadius,
// so the polygon boundary at 120% is always fully transparent at any camera angle.
function ReflectiveFloor({ radius = 16 }: { radius?: number }) {
  const theme = useThreeTheme()
  const meshRef = useRef<THREE.Mesh>(null)
  // Oversized geometry: disc extends 20% beyond visible floor radius.
  // The shader fade hits zero at 82% of floorRadius, so the polygon edge
  // at 120% is always in the fully-transparent zone — invisible at any angle.
  const geoRadius = radius * 1.2

  // Derive a dark floor color from the screen face
  const floorColor = useMemo(() => {
    return theme.screenFaceHex
  }, [theme.screenFaceHex])

  // Chain our radial alpha patch onto the existing onBeforeCompile of MeshReflectorMaterial.
  // We do this via useEffect after mount so we don't replace the built-in reflection shader.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const mat = mesh.material as THREE.MeshStandardMaterial & { needsUpdate: boolean }
    const original = mat.onBeforeCompile.bind(mat)

    mat.onBeforeCompile = (shader, renderer) => {
      // Run the existing drei reflector patches first (reflection uniforms + shader mods)
      original(shader, renderer)

      // Now inject our analytical radial alpha on top
      shader.uniforms.uFloorRadius = { value: radius }

      // Inject vFloorWorldDist varying into vertex shader.
      // We compute world XZ distance using the raw position attribute and modelMatrix
      // — no dependency on USE_WORLDPOS define. The floor mesh is flat so raw position
      // equals transformed position; modelMatrix.m30/m32 hold the mesh translation.
      //
      // MeshReflectorMaterial's onBeforeCompile already ran and replaced
      // #include <project_vertex> with "#include <project_vertex>\n  my_vUv = ..."
      // so the token "#include <project_vertex>" still exists and our replace() matches it.
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying float vFloorWorldDist;`
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
// Compute XZ world distance — works without USE_WORLDPOS define
vec4 _floorWorldPos = modelMatrix * vec4(position, 1.0);
vFloorWorldDist = length(_floorWorldPos.xz);`
        )

      // Inject varying + uniform declaration into fragment shader, then override alpha
      // after all other lighting/reflection ops via dithering_fragment replacement
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying float vFloorWorldDist;
uniform float uFloorRadius;`
        )
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
// Analytical radial fade — mathematically perfect circle edge at any resolution.
// Fully opaque from center to 70% of radius, hard zero at 82%.
// Geometry extends to 120% of floorRadius so the polygon boundary is always
// in the fully-transparent zone — invisible at any camera angle on 4K displays.
float _radialT = vFloorWorldDist / uFloorRadius;
float _radialAlpha = 1.0 - smoothstep(0.70, 0.82, _radialT);
gl_FragColor.a *= _radialAlpha;`
        )
    }

    // Trigger shader recompilation
    mat.needsUpdate = true
  }, [radius]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <circleGeometry args={[geoRadius, 128]} />
      <MeshReflectorMaterial
        mirror={0.15}
        resolution={768}
        mixBlur={8}
        mixStrength={0.35}
        roughness={0.92}
        metalness={0.3}
        color={floorColor}
        blur={[300, 300]}
        transparent
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
    // Geometry is 20% larger than uRadius so the polygon edge sits at 120% radius —
    // the shader's edge fade hits zero at uRadius (100%), making the polygon
    // boundary always fully transparent regardless of camera angle.
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <circleGeometry args={[radius * 1.2, 128]} />
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
            vec2 fw = fwidth(vWorldPos.xz / gs);
            vec2 g = abs(fract(vWorldPos.xz / gs - 0.5) - 0.5) / fw;
            float line = 1.0 - min(min(g.x, g.y), 1.0);
            // B27 fix: fade out when grid cells become smaller than ~3 pixels
            // (prevents sub-pixel aliasing at grazing camera angles)
            float cellScreenSize = 1.0 / max(fw.x, fw.y);
            float distanceFade = smoothstep(2.0, 5.0, cellScreenSize);
            line *= distanceFade;
            // Analytical radial edge fade — zero at uRadius, geometry extends to
            // 1.2 * uRadius so polygon boundary is always in the zero-alpha zone.
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

    // Fade out at edges — tightened so alpha hits zero at dist=0.95 (not 1.0)
    // giving a 5% UV-space buffer before the polygon boundary at dist=1.0.
    float edgeFade = smoothstep(0.95, 0.82, dist);
    // Fade out at center
    float innerFade = smoothstep(0.15, 0.25, dist);

    // Color gradient: inner (warm) → outer (cyan)
    float t = smoothstep(0.2, 0.9, dist);
    vec3 baseColor = mix(uInnerColor, uOuterColor, t);

    // B27v5: Restore original density (80 rings, 72 ticks) now that the root
    // cause (group rotation) is fixed. Keep fwidth anti-aliasing for sub-pixel
    // cases but remove the aggressive density-fade that was hiding the detail.
    float fwDist = fwidth(dist);
    float fwAngle = fwidth(angle);

    // === Concentric rings — the signature look ===
    float ringDensity = 80.0;
    float ringDist = fract(dist * ringDensity);
    float ringWidth = 0.03 + 0.02 * sin(dist * 20.0);
    float ringHalfW = max(ringWidth, fwDist * ringDensity * 1.5);
    float ringLine = smoothstep(0.5 - ringHalfW, 0.5, ringDist) - smoothstep(0.5, 0.5 + ringHalfW, ringDist);

    // Major rings (every 8th ring is brighter)
    float majorRing = fract(dist * ringDensity / 8.0);
    float majorHalfW = max(0.05, fwDist * ringDensity / 8.0 * 1.5);
    float majorLine = smoothstep(0.5 - majorHalfW, 0.5, majorRing) - smoothstep(0.5, 0.5 + majorHalfW, majorRing);
    ringLine = max(ringLine * 0.5, majorLine);

    // === Tick marks — radial lines at regular angles ===
    float tickCount = 72.0;
    float tickAngle = fract(angle / (2.0 * 3.14159265) * tickCount);
    float tickHalfW = max(0.02, fwAngle / (2.0 * 3.14159265) * tickCount * 1.5);
    float tick = smoothstep(0.5 - tickHalfW, 0.5, tickAngle) - smoothstep(0.5, 0.5 + tickHalfW, tickAngle);
    float tickBand = step(0.3, dist) * step(dist, 0.85);
    // Major ticks every 8th
    float majorTickAngle = fract(angle / (2.0 * 3.14159265) * (tickCount / 8.0));
    float majorTickHalfW = max(0.04, fwAngle / (2.0 * 3.14159265) * tickCount / 8.0 * 1.5);
    float majorTick = smoothstep(0.5 - majorTickHalfW, 0.5, majorTickAngle) - smoothstep(0.5, 0.5 + majorTickHalfW, majorTickAngle);
    tick = max(tick * 0.3, majorTick * 0.6) * tickBand;

    // === Marker dots at intersections ===
    float dotW = max(0.008, fwDist * 2.0);
    float dotRing = ring(dist, 0.5, dotW) + ring(dist, 0.7, dotW) + ring(dist, 0.35, dotW * 0.75);
    float dotAngle = fract(angle / (2.0 * 3.14159265) * 36.0);
    float dot = smoothstep(0.03, 0.0, abs(dotAngle - 0.5)) * dotRing;

    // === Pulse wave expanding from center ===
    float pulse = smoothstep(0.3, 0.0, abs(dist - fract(uTime * 0.15))) * 0.25;

    // === Combine — full intensity for neon HUD look ===
    // B27v5: removed the 0.25 luminance clamp (was a workaround for motion streaks
    // caused by group rotation, which is now fixed in B27v4)
    float intensity = (ringLine * 0.7 + tick * 0.4 + dot * 0.8 + pulse * 0.5) * innerFade * edgeFade;
    vec3 color = baseColor * intensity;
    float alpha = clamp(intensity * 2.5, 0.0, 1.0) * edgeFade;

    gl_FragColor = vec4(color, alpha);
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
    // 128 segments is sufficient since the shader's edgeFade hits zero at dist=0.95
    // — the polygon boundary at dist=1.0 is always in the fully-transparent zone.
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
  useFrame((state) => {
    // B27v4: DON'T rotate the group — rotating the mesh breaks the ring shader
    // because vDist = length(wp.xy) shifts with the modelMatrix rotation,
    // causing circles to distort into horizontal lines at certain angles.
    // The dots rotate via the pulse wave in the shader instead.
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
              // B27v4: use LOCAL position for distance — immune to group rotation
              vDist = length(position.xy);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform float uTime;
            uniform vec3 uInnerColor;
            uniform vec3 uOuterColor;
            varying vec2 vUv;
            varying float vDist;

            // B27 fix: screen-space anti-aliased ring with density fade
            float aaRing(float dist, float center, float baseWidth, float intensity) {
              float fw = fwidth(dist);
              float halfW = max(baseWidth, fw * 1.5);
              // Fade out when line would be less than ~3 pixels wide
              float fade = smoothstep(baseWidth * 0.3, baseWidth * 2.0, 1.0 / max(fw, 0.001));
              return smoothstep(halfW, 0.0, abs(dist - center)) * intensity * fade;
            }

            void main() {
              // Concentric ring lines at specific radii (anti-aliased via fwidth)
              float line = 0.0;

              // Inner rings
              line += aaRing(vDist, 1.5, 0.04, 0.8);
              line += aaRing(vDist, 1.9, 0.03, 0.5);
              line += aaRing(vDist, 2.3, 0.05, 0.6);
              line += aaRing(vDist, 2.7, 0.03, 0.4);

              // Transition rings
              line += aaRing(vDist, 3.2, 0.04, 0.7);
              line += aaRing(vDist, 3.6, 0.06, 0.3);
              line += aaRing(vDist, 4.0, 0.03, 0.9);
              line += aaRing(vDist, 4.4, 0.05, 0.4);
              line += aaRing(vDist, 4.8, 0.03, 0.6);

              // Outer rings
              line += aaRing(vDist, 5.3, 0.06, 0.3);
              line += aaRing(vDist, 5.7, 0.03, 0.8);
              line += aaRing(vDist, 6.1, 0.04, 0.4);
              line += aaRing(vDist, 6.5, 0.04, 0.7);
              line += aaRing(vDist, 6.9, 0.06, 0.3);
              line += aaRing(vDist, 7.3, 0.03, 0.6);

              // Color: inner near center, outer at edges
              float t = smoothstep(1.5, 5.0, vDist);
              vec3 lineColor = mix(uInnerColor, uOuterColor, t);

              // Pulse wave expanding from center
              float pulse = smoothstep(0.3, 0.0, abs(vDist - mod(uTime * 2.0, 9.0))) * 0.3;
              line += pulse;

              // Analytical outer edge fade — hits zero at vDist=8.0, well before
              // the ringGeometry outer boundary at vDist=radius (default 8.5).
              // Polygon edge of ringGeometry is always in the fully-transparent zone.
              float outerFade = smoothstep(8.0, 7.5, vDist);

              vec3 color = lineColor * line * 0.8;
              float alpha = line * 0.8 * outerFade;

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
  // Raw (unsmoothed) audio data — used for 1:1 scale mapping so scale tracks volume instantly
  const rawAudioRef = useRef({ volume: 0, bass: 0, mids: 0, highs: 0 })
  // Debug frame counter
  const debugFrameRef = useRef(0)
  // Debug overlay DOM ref — updated imperatively in useFrame (zero React re-renders)
  const debugDomRef = useRef<HTMLDivElement>(null)
  // UX10: Colorshift — smoothed hue for lerp-based transitions
  const colorshiftHueRef = useRef(0.5) // start at cyan (180°/360 = 0.5)
  // UX10: Colorshift — reusable Color objects to avoid per-frame allocations
  const colorshiftColorRef = useRef(new THREE.Color())
  const colorshiftGlowRef = useRef(new THREE.Color())

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
    debugFrameRef.current++

    // Sample audio / demo data
    const raw = readAudioData(audioDataRef.current, t)

    // ── Raw (unsmoothed) values — used for 1:1 scale so sphere size tracks audio instantly ──
    // Scale must NOT go through EMA: any smoothing introduces lag that breaks 1:1 sync.
    const r = rawAudioRef.current
    r.volume = raw.volume
    r.bass   = raw.bass
    r.mids   = raw.mids
    r.highs  = raw.highs

    // Raw FFT sum for debug overlay (0-255 domain, average across all bins)
    const rawFFTAvg = raw.isActive
      ? audioDataRef.current.reduce((sum, v) => sum + v, 0) / audioDataRef.current.length
      : 0

    // Smooth with EMA: used for color, emissive, rotation speed, and glow — NOT for scale.
    // fast attack (0.6 = reaches ~88% of peak in 3 frames at 60fps),
    // slow release (0.05 = gradual tail-off).
    const smoothFactor = raw.isActive ? 0.6 : 0.04
    const s = smoothedRef.current
    s.bass   += (raw.bass   - s.bass)   * smoothFactor
    s.mids   += (raw.mids   - s.mids)   * smoothFactor
    s.highs  += (raw.highs  - s.highs)  * smoothFactor
    s.volume += (raw.volume - s.volume) * smoothFactor

    // Apply voice reaction intensity multiplier (0 = no reaction, 1 = default, 5 = exaggerated)
    const vri = voiceReactionIntensity
    // Smoothed values — used for emissive/color/rotation (aesthetic smoothing is fine there)
    const bass   = s.bass   * vri
    const mids   = s.mids   * vri
    const highs  = s.highs  * vri
    const volume = s.volume * vri
    const isActive = raw.isActive && vri > 0

    // ── 1:1 scale mapping — direct raw volume, no smoothing ──
    // baseScale=1.0 (idle), scaleRange=0.3 (max scale=1.3 at full volume).
    // voiceReactionIntensity scales the range so the slider affects all sphere motion.
    const rawScaleVolume = raw.isActive ? raw.volume * vri : 0
    // Wireframe scale: 0.3 range (half of 0.6), with minimal smoothing for natural feel
    // Smoothed via simple lerp: 80% new + 20% previous = fast but not jittery
    const _targetScale = 1.0 + rawScaleVolume * 0.3
    const _prevScale = (wireRef.current?.scale.x ?? 1.0)
    const sphereScaleDirect = _prevScale + (_targetScale - _prevScale) * 0.8

    // ── Wireframe globe — scale 1:1 with volume, rotation speed with smoothed volume ──
    if (wireRef.current) {
      const idleRotSpeed = 0.15
      const activeRotBoost = isActive ? volume * 0.4 : 0
      wireRef.current.rotation.y += delta * (idleRotSpeed + activeRotBoost)

      // 1:1 scale: idle micro-breathe stays (Math.sin gives ±1.2% life at rest),
      // audio overrides with direct raw volume when active.
      const idlePulse = 1.0 + Math.sin(t * 1.3) * 0.012
      const wireScale = isActive ? sphereScaleDirect : idlePulse
      wireRef.current.scale.setScalar(wireScale)

      // Reset emissive to theme color each frame (U4: prevents event color drift)
      const wireMat = wireRef.current.material as THREE.MeshStandardMaterial
      wireMat.emissive.set(theme.sphereHex)
      // Brighten wireframe emissive when speaking (EMA-smoothed volume for aesthetics)
      if (isActive) {
        wireMat.emissiveIntensity = 0.6 + volume * 1.2
      } else {
        wireMat.emissiveIntensity = 0.6
      }
    }

    // ── Bright core — scale 1:1 with volume, emissive with smoothed mids ──
    if (coreRef.current) {
      const mat = coreRef.current.material as THREE.MeshStandardMaterial

      // Blocked input flash takes priority over audio scale
      if (flashRef.current > 0) {
        flashRef.current -= delta
        const intensity = Math.max(0, flashRef.current / 0.5)
        mat.emissive.setRGB(1, intensity * 0.2, intensity * 0.2)
        mat.emissiveIntensity = baseGlowIntensity + intensity * 8
        coreRef.current.scale.setScalar(0.38 + Math.sin(t * 2) * 0.03)
      } else {
        // Idle gentle pulse + 1:1 audio-reactive scale
        // Core has a smaller base (0.38) so we add the direct volume offset on top.
        const idleScale = 0.38 + Math.sin(t * 2) * 0.03
        const coreScaleDirect = isActive ? idleScale + rawScaleVolume * 0.18 : idleScale
        coreRef.current.scale.setScalar(coreScaleDirect)

        // Emissive: EMA-smoothed mids (aesthetic — OK to lag slightly here)
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

    // ── Atmospheric glow — expand 1:1 with raw volume (matches wireframe scale response) ──
    if (glowRef.current) {
      const idleScale = 1.0 + Math.sin(t * 0.7) * 0.02
      // Use raw volume for glow expansion so it tracks audio without lag
      const audioExpand = isActive ? rawScaleVolume * 0.15 : 0
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

    // ── UX10: Pulse style — scale breathing tied to terminal activity + audio ──
    if (sphereStyle === 'pulse') {
      // Combined intensity: terminal activity OR audio volume (whichever is higher)
      const combinedIntensity = Math.max(terminalActivityMax / 100, volume * vri / 5)
      // Frequency: 0.5 Hz idle → 4.0 Hz at peak intensity
      const freq = 0.5 + combinedIntensity * 3.5
      // Amplitude: 0.02 idle → 0.18 at peak intensity
      const amplitude = 0.02 + combinedIntensity * 0.16
      // Organic Perlin-like noise modulation (spec formula: sin(t*freq + sin(t*1.3)*0.5))
      const noisePhase = Math.sin(t * 1.3) * 0.5
      const pulseWave = Math.sin(t * freq * Math.PI * 2 + noisePhase)
      // Pulse equation: base 1.0 + modulated breathing
      const pulseScale = 1.0 + pulseWave * amplitude

      // Apply multiplicatively to wireRef (existing audio scale is already set above)
      if (wireRef.current) {
        const currentScale = wireRef.current.scale.x
        wireRef.current.scale.setScalar(currentScale * pulseScale)
      }
      // Apply multiplicatively to coreRef (existing audio scale is already set above)
      if (coreRef.current) {
        const currentScale = coreRef.current.scale.x
        coreRef.current.scale.setScalar(currentScale * pulseScale)
      }
      // Apply multiplicatively to glowRef (atmospheric glow breathes with sphere)
      if (glowRef.current) {
        const currentScale = glowRef.current.scale.x
        glowRef.current.scale.setScalar(currentScale * pulseScale)
      }
      // Also pulse the equatorial band emissive intensity with the breathing
      if (equatorRef.current) {
        const eqMat = equatorRef.current.material as THREE.MeshStandardMaterial
        eqMat.emissiveIntensity += Math.abs(pulseWave) * amplitude * 8
      }
    }

    // ── UX10: Colorshift style — hue rotation based on terminal activity + audio ──
    if (sphereStyle === 'colorshift') {
      // Combined intensity: terminal activity OR audio volume (whichever is higher)
      const combinedActivity = Math.max(terminalActivityMax, volume * vri * 20) // 0-100 scale
      const activity = Math.min(combinedActivity, 100)
      // Map activity 0-100 to target hue (spec breakpoints):
      //   0-30  → 180° (cyan)   = 0.5
      //  30-60  → 120° (green)  = 0.333
      //  60-85  →  30° (orange) = 0.083
      //  85-100 →   0° (red)    = 0.0
      let targetHue: number
      if (activity <= 30) {
        // 0→30 maps to 0.5 (cyan) → 0.333 (green)
        targetHue = 0.5 - (activity / 30) * (0.5 - 0.333)
      } else if (activity <= 60) {
        // 30→60 maps to 0.333 (green) → 0.083 (orange)
        targetHue = 0.333 - ((activity - 30) / 30) * (0.333 - 0.083)
      } else if (activity <= 85) {
        // 60→85 maps to 0.083 (orange) → 0.0 (red)
        targetHue = 0.083 - ((activity - 60) / 25) * 0.083
      } else {
        // 85→100: hold at red (0.0)
        targetHue = 0.0
      }
      // Smooth transition: lerp current hue toward target hue each frame
      const lerpSpeed = 2.0 * delta // ~2 units/sec convergence
      const currentHue = colorshiftHueRef.current
      colorshiftHueRef.current += (targetHue - currentHue) * Math.min(lerpSpeed, 1.0)
      const hue = colorshiftHueRef.current

      // Dynamic saturation: 0.7 (idle) → 1.0 (peak activity)
      const saturation = 0.7 + (activity / 100) * 0.3
      // Dynamic lightness: 0.45 (idle) → 0.6 (peak activity)
      const lightness = 0.45 + (activity / 100) * 0.15

      // Build the shifted colors — reuse refs to avoid per-frame allocations
      const shiftedColor = colorshiftColorRef.current.setHSL(hue, saturation, lightness)
      const shiftedGlow = colorshiftGlowRef.current.setHSL(hue, Math.min(saturation + 0.1, 1.0), lightness + 0.1)

      // Apply to wireframe emissive
      if (wireRef.current) {
        const mat = wireRef.current.material as THREE.MeshStandardMaterial
        mat.emissive.copy(shiftedColor)
      }
      // Apply to core emissive
      if (coreRef.current) {
        const mat = coreRef.current.material as THREE.MeshStandardMaterial
        mat.emissive.copy(shiftedGlow)
      }
      // Apply to equatorial band emissive
      if (equatorRef.current) {
        const mat = equatorRef.current.material as THREE.MeshStandardMaterial
        mat.emissive.copy(shiftedGlow)
      }
      // Apply to point lights
      if (light1Ref.current) {
        light1Ref.current.color.copy(shiftedColor)
      }
      if (light2Ref.current) {
        light2Ref.current.color.copy(shiftedGlow)
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

    // ── Debug overlay — imperatively update DOM so there are zero React re-renders ──
    // Enable with: window.__haloDebugAudio = true   Disable: window.__haloDebugAudio = false
    if (debugDomRef.current) {
      const debugEnabled = !!(window as any).__haloDebugAudio
      debugDomRef.current.style.display = debugEnabled ? 'block' : 'none'
      if (debugEnabled) {
        const wireScale = wireRef.current?.scale.x ?? 0
        const coreScale = coreRef.current?.scale.x ?? 0
        const emissive = (wireRef.current?.material as THREE.MeshStandardMaterial | undefined)?.emissiveIntensity ?? 0
        debugDomRef.current.textContent =
          `VOL: ${rawFFTAvg.toFixed(0).padStart(3)} | SMOOTH: ${(s.volume * 255).toFixed(0).padStart(3)} | ` +
          `WIRE: ${wireScale.toFixed(3)} | CORE: ${coreScale.toFixed(3)} | EMIT: ${emissive.toFixed(2)} | F#${debugFrameRef.current}`
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

      {/* ════════ PULSE style — wireframe base with activity-driven breathing ════════ */}
      {sphereStyle === 'pulse' && (
        <>
          {/* Wireframe globe — same as wireframe style, scale driven by useFrame pulse logic */}
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

          {/* Bright core — audio-reactive + pulse breathing via coreRef */}
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

      {/* ════════ COLORSHIFT style — wireframe base with hue rotation from activity ════════ */}
      {sphereStyle === 'colorshift' && (
        <>
          {/* Wireframe globe — emissive color driven by useFrame colorshift logic */}
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

          {/* Bright core — emissive color shifts with activity */}
          <mesh ref={coreRef} scale={0.38}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial
              color={theme.sphereHex}
              emissive={theme.sphereGlowHex}
              emissiveIntensity={baseGlowIntensity}
              toneMapped={false}
            />
          </mesh>

          {/* Equatorial band — emissive color shifts with activity */}
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

      {/* ════════ SHARED across all styles ════════ */}

      {/* Atmospheric glow — expands with overall volume */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[2, 16, 16]} />
        <meshBasicMaterial color={theme.sphereHex} transparent opacity={0.008} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Lights from sphere — audio-reactive intensity */}
      <pointLight ref={light1Ref} color={theme.sphereHex} intensity={3} distance={8} decay={2} />
      <pointLight ref={light2Ref} color={theme.sphereGlowHex} intensity={1.5} distance={5} decay={2} position={[0, 1, 0]} />

      {/* ── Debug audio overlay — enabled via window.__haloDebugAudio = true ──
          Renders a monospace HUD above the sphere showing real-time audio metrics.
          Updated imperatively every frame (debugDomRef.current.textContent) — zero React re-renders.
          Usage:
            window.__haloDebugAudio = true   — enable
            window.__haloDebugAudio = false  — disable
          Metrics displayed:
            VOL    — raw FFT average (0-255 domain)
            SMOOTH — EMA-smoothed volume (also 0-255 domain for easy comparison)
            WIRE   — wireframe sphere scale (should track VOL 1:1 when audio is active)
            CORE   — core sphere scale
            EMIT   — wireframe emissive intensity
            F#     — frame counter (for verifying per-frame update)
      */}
      <Html
        position={[0, 2.6, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div
          ref={debugDomRef}
          style={{
            display: (window as any).__haloDebugAudio ? 'block' : 'none',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#00ffcc',
            background: 'rgba(0,0,0,0.75)',
            padding: '4px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
            border: '1px solid rgba(0,255,200,0.3)',
            textShadow: '0 0 6px #00ffcc',
          }}
        >
          VOL: 0 | SMOOTH: 0 | WIRE: 1.000 | CORE: 0.380 | EMIT: 0.60 | F#0
        </div>
      </Html>

      {/* TODO: Ground rings (PulseRing) should reflect HAL session connection status.
               When HAL-O terminal is connected (getHalSessionId() returns a session):
                 - rings pulse faster and brighter (ONLINE)
               When disconnected:
                 - rings pulse slowly in dim amber (AWAITING CONNECTION)
               Implementation note: pass a `halConnected` boolean prop from the parent
               (ProjectHub reads useTerminalSessions) down into PbrHalSphere → PulseRing.
      */}
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

function PostFXInner({ bloomEnabled = true, chromaticAberrationEnabled = false }: { bloomEnabled?: boolean; chromaticAberrationEnabled?: boolean }) {
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
      {bloomEnabled && <Bloom luminanceThreshold={theme.bloom.threshold} luminanceSmoothing={0.8} intensity={theme.bloom.intensity} radius={Math.min(theme.bloom.radius, 0.5)} width={512} height={512} />}
      {chromaticAberrationEnabled && <ChromaticAberration offset={offset} blendFunction={BlendFunction.NORMAL} />}
      <Vignette darkness={vignetteVal} offset={0.3} />
    </EffectComposer>
  )
}

function PostFX({ enabled = true, bloomEnabled = true, chromaticAberrationEnabled = false }: { enabled?: boolean; bloomEnabled?: boolean; chromaticAberrationEnabled?: boolean }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { if (enabled) setReady(true) }, [enabled])
  if (!ready) return null
  return (
    <PostFXErrorBoundary>
      <PostFXInner bloomEnabled={bloomEnabled} chromaticAberrationEnabled={chromaticAberrationEnabled} />
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

// ── AutoRotate Manager — pauses rotation on user interaction, resumes after delay ──
// B31b: AutoRotateManager extracted to shared component (used by both PBR + Holo renderers)
import { AutoRotateManager } from './AutoRotateManager'
// UX16 Phase 2: Smooth camera easing to selected card
import { CameraEaser } from './CameraEaser'

// ── PhotoModeAnimator — drives camera animation / snap inside useFrame ──
// This component lives inside the R3F Canvas so it can use useFrame and useThree.
// It reads the module-level _photoAnimKeyframes / _photoSnapPending flags set by
// window.__haloPhotoMode.animateCamera() / setCamera() and applies them to the
// camera BEFORE OrbitControls.update() can overwrite them.
function PhotoModeAnimator() {
  const { camera, controls } = useThree()

  useFrame(() => {
    const oc = controls as any

    // ── Snap camera (setCamera) ──
    if (_photoSnapPending) {
      const [x, y, z] = _photoSnapPending
      _photoSnapPending = null
      // Disable OrbitControls so it cannot overwrite on this frame or subsequent frames
      if (oc) {
        oc.enabled = false
        oc.autoRotate = false
      }
      camera.position.set(x, y, z)
      camera.lookAt(0, 0.3, 0)
      return
    }

    // ── Keyframe animation (animateCamera) ──
    if (!_photoAnimKeyframes || _photoAnimKeyframes.length === 0) return

    const elapsed = performance.now() - _photoAnimStart
    const keyframes = _photoAnimKeyframes
    const lastKf = keyframes[keyframes.length - 1]

    // Disable OrbitControls for the duration of the animation
    if (oc) {
      oc.enabled = false
      oc.autoRotate = false
    }

    // Clamp elapsed to the animation duration
    const t = Math.min(elapsed, lastKf.t)

    // Find the surrounding keyframe segment
    let segStart = keyframes[0]
    let segEnd = keyframes[keyframes.length - 1]
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (t >= keyframes[i].t && t <= keyframes[i + 1].t) {
        segStart = keyframes[i]
        segEnd = keyframes[i + 1]
        break
      }
    }

    // Compute local t within the segment [0, 1]
    const segDuration = segEnd.t - segStart.t
    const localT = segDuration > 0 ? (t - segStart.t) / segDuration : 1

    // Smooth-step easing (ease-in-out cubic)
    const smooth = localT * localT * (3 - 2 * localT)

    const x = segStart.pos[0] + (segEnd.pos[0] - segStart.pos[0]) * smooth
    const y = segStart.pos[1] + (segEnd.pos[1] - segStart.pos[1]) * smooth
    const z = segStart.pos[2] + (segEnd.pos[2] - segStart.pos[2]) * smooth

    camera.position.set(x, y, z)

    // Interpolate lookAt target if keyframes have lookAt fields, else default to origin
    const DEFAULT_LOOK: [number, number, number] = [0, 0.3, 0]
    const laStart = segStart.lookAt ?? DEFAULT_LOOK
    const laEnd = segEnd.lookAt ?? DEFAULT_LOOK
    const lx = laStart[0] + (laEnd[0] - laStart[0]) * smooth
    const ly = laStart[1] + (laEnd[1] - laStart[1]) * smooth
    const lz = laStart[2] + (laEnd[2] - laStart[2]) * smooth
    camera.lookAt(lx, ly, lz)

    // Animation complete — clear keyframes and re-enable OrbitControls
    if (elapsed >= lastKf.t) {
      _photoAnimKeyframes = null
      if (oc) {
        oc.enabled = true
      }
    }
  })

  return null
}

// ── Stable orbit target (avoid new array ref each render) ──
const ORBIT_TARGET: [number, number, number] = [0, 0.3, 0]

// ── B34 fix: flag to break the CameraSync → CameraDriver feedback loop ──
// When CameraSync reports orbit position back to settings, CameraDriver must ignore
// the resulting prop change — otherwise it snaps camera.position.x to 0 (losing azimuth).
let _cameraFromOrbit = false

// ── Camera Driver — pushes settings changes into the actual Three.js camera + OrbitControls ──
function CameraDriver({ distance, angle }: { distance: number; angle: number }) {
  const { camera, controls } = useThree()
  const prevDist = useRef(distance)
  const prevAngle = useRef(angle)

  useEffect(() => {
    // B34: Skip if this change came from orbit sync (user dragging)
    if (_cameraFromOrbit) {
      _cameraFromOrbit = false
      prevDist.current = distance
      prevAngle.current = angle
      return
    }
    // Only drive camera when settings changed significantly (slider drag)
    if (Math.abs(distance - prevDist.current) > 0.3 || Math.abs(angle - prevAngle.current) > 0.5) {
      const angleRad = (angle * Math.PI) / 180
      const y = Math.sin(angleRad) * distance
      const z = Math.cos(angleRad) * distance
      camera.position.set(0, y, z)
      camera.lookAt(0, 0.3, 0)
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
    _cameraFromOrbit = true  // B34: tell CameraDriver to ignore the resulting prop change
    onCameraMove(distance, angle)
  })

  return null
}

// ── Scene Ready Gate — waits for texture + N frames before signaling ready ──
// PERF8: SceneReadyGate no longer waits for texture — the platform texture is deferred to phase 2.
// It just needs a few rendered frames to confirm the WebGL context is stable.
function SceneReadyGate({ onReady }: { textureReady?: boolean; onReady: () => void }) {
  const frameCount = useRef(0)
  const signaled = useRef(false)
  useFrame(() => {
    if (signaled.current) return
    frameCount.current++
    if (frameCount.current >= 4) {
      signaled.current = true
      onReady()
    }
  })
  return null
}

// ── PERF8: Scene Phase Manager — progressive boot (0→1→2→3) after scene ready ──
// Phase 0 (immediate): Sphere + lights + background + camera — scene feels alive instantly
// Phase 1 (+500ms):    Screen panels + merge graphs — content appears
// Phase 2 (+1.0s):     Floor, particles, HUD text — environment fills in
// Phase 3 (+2.0s):     PostFX, spaceship VFX, cinematic — heavy GPU work last
function ScenePhaseManager({ sceneReady, onPhaseChange }: { sceneReady: boolean; onPhaseChange: (p: number) => void }) {
  const phaseRef = useRef(0)
  const timerRef = useRef(0)
  useFrame((_, delta) => {
    if (!sceneReady || phaseRef.current >= 3) return
    timerRef.current += delta
    if (phaseRef.current === 0) { phaseRef.current = 1; onPhaseChange(1) }
    if (phaseRef.current === 1 && timerRef.current > 0.5) { phaseRef.current = 2; onPhaseChange(2) }
    if (phaseRef.current === 2 && timerRef.current > 1.0) { phaseRef.current = 3; onPhaseChange(3) }
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
  // P14: Graphics quality presets
  graphicsPreset?: 'light' | 'medium' | 'high'
  bloomEnabled?: boolean
  chromaticAberrationEnabled?: boolean
  floorLinesEnabled?: boolean
  groupTrailsEnabled?: boolean
  // UX9: Auto-rotate settings
  autoRotateEnabled?: boolean
  autoRotateSpeed?: number
  // Tactical Sectors — transition animation
  sectorTransitioning?: boolean
  sectorDirection?: number
  sectorHue?: string
  sectorHudText?: string
  // Demo mode
  demo?: any // DemoSettings
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
  // P14: Graphics quality presets
  graphicsPreset: 'light' | 'medium' | 'high'
  bloomEnabled: boolean
  chromaticAberrationEnabled: boolean
  floorLinesEnabled: boolean
  groupTrailsEnabled: boolean
  // UX9: Auto-rotate settings
  autoRotateEnabled: boolean
  autoRotateSpeed: number
  // Tactical Sectors
  sectorTransitioning: boolean
  sectorDirection: number
  sectorHue: string
  sectorHudText: string
  // Demo mode
  demo?: any // DemoSettings
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
  graphicsPreset, bloomEnabled, chromaticAberrationEnabled, floorLinesEnabled, groupTrailsEnabled,
  autoRotateEnabled, autoRotateSpeed,
  sectorTransitioning, sectorDirection, sectorHue, sectorHudText,
  demo,
}: PbrSceneInnerProps) {
  // PERF6: hoveredId moved to module-level ref in ScreenPanel.tsx — zero parent re-renders on hover
  const flybyRef = useRef<SpaceshipFlybyHandle>(null)
  // Wire photo mode API to flyby ref
  useEffect(() => {
    _photoModeFlybyRef.current = flybyRef.current
  }, [])
  // Expose orbit controls + camera to photo mode
  const { controls: orbitCtl, camera: threeCamera } = useThree()
  useEffect(() => {
    if (orbitCtl) (window as any).__haloOrbitControls = orbitCtl
    if (threeCamera) (window as any).__haloCamera = threeCamera
  }, [orbitCtl, threeCamera])
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

  // ── Tactical Sectors: transition animation state ──
  // Track sector transition for staggered card stream-in/out animation.
  // sectorAnimPhase: 0 = idle, 1 = streaming out, 2 = streaming in
  const sectorAnimRef = useRef({ phase: 0, elapsed: 0, totalCards: 0 })
  const prevSectorTransitioning = useRef(false)

  useEffect(() => {
    if (sectorTransitioning && !prevSectorTransitioning.current) {
      // Start stream-out phase
      sectorAnimRef.current = { phase: 1, elapsed: 0, totalCards: projects.length }
      // Trigger staggered entry animation on all ScreenPanels
      triggerSectorEntry()
    }
    prevSectorTransitioning.current = sectorTransitioning
  }, [sectorTransitioning, projects.length])

  // Advance sector animation phases via useFrame
  useFrame((_, delta) => {
    const anim = sectorAnimRef.current
    if (anim.phase === 0) return
    anim.elapsed += delta
    if (anim.phase === 1 && anim.elapsed > 0.3) {
      // Switch to stream-in phase
      anim.phase = 2
      anim.elapsed = 0
    }
    if (anim.phase === 2 && anim.elapsed > 0.35) {
      // Done
      anim.phase = 0
      anim.elapsed = 0
    }
  })

  // Scene loading phase state
  const [textureLoaded, setTextureLoaded] = useState(false)
  const [scenePhase, setScenePhase] = useState(0)
  const [sceneReady, setSceneReady] = useState(false)
  const fadeRef = useRef({ particles: 0, hud: 0, screens: 0 })

  // UX7: Track which project cards have mounted their Html (front-facing cards loaded)
  const mountedCardsRef = useRef<Set<string>>(new Set())
  const cardMountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [cardsReady, setCardsReady] = useState(false)

  // UX7: Reset mounted cards when projects list changes
  useEffect(() => {
    mountedCardsRef.current.clear()
    setCardsReady(false)
    if (cardMountTimeoutRef.current) {
      clearTimeout(cardMountTimeoutRef.current)
      cardMountTimeoutRef.current = null
    }
    if (projects.length === 0) {
      setCardsReady(true)
    }
  }, [projects.length])

  // UX7: Callback fired when a ScreenPanel's Html is mounted
  const onCardHtmlMounted = useCallback((projectPath: string) => {
    mountedCardsRef.current.add(projectPath)
    // Check if all visible (front-facing) cards are mounted
    // If no projects exist, skip the gate (cardsReady = true immediately)
    if (projects.length === 0) {
      setCardsReady(true)
      return
    }
    // Consider cards ready when at least 80% of projects have mounted
    const readyThreshold = Math.ceil(projects.length * 0.8)
    if (mountedCardsRef.current.size >= readyThreshold) {
      setCardsReady(true)
      if (cardMountTimeoutRef.current) {
        clearTimeout(cardMountTimeoutRef.current)
        cardMountTimeoutRef.current = null
      }
    }
  }, [projects.length])

  // UX7: 5s safety timeout — if cards haven't loaded after 5s, start intro anyway
  useEffect(() => {
    if (cardsReady || !sceneReady) return
    if (cardMountTimeoutRef.current) return
    cardMountTimeoutRef.current = setTimeout(() => {
      console.warn('[HAL-O] Card mount safety timeout — starting intro after 5s')
      setCardsReady(true)
    }, 5000)
    return () => {
      if (cardMountTimeoutRef.current) {
        clearTimeout(cardMountTimeoutRef.current)
        cardMountTimeoutRef.current = null
      }
    }
  }, [cardsReady, sceneReady])

  // M2c: Intro fly-in animation — activates when scene first becomes ready.
  // B28 fix: sessionStorage guard checked synchronously at mount + in effect.
  // Canvas remount resets React state but sessionStorage survives, preventing replay.
  // UX7: Also wait for cards to be ready (all front-facing cards have mounted Html)
  const introPlayedRef = useRef(sessionStorage.getItem('hal-o-intro-done') === '1')
  const [introActive, setIntroActive] = useState(false)
  useEffect(() => {
    if (introPlayedRef.current) return // already played this session (survives remount)
    if (sceneReady && cardsReady && introAnimation && !cinematicActive) {
      introPlayedRef.current = true
      sessionStorage.setItem('hal-o-intro-done', '1')
      setIntroActive(true)
    }
  }, [sceneReady, cardsReady, introAnimation, cinematicActive])

  // PERF8: Interpolate fade values — targets match progressive mount phases
  useFrame((_, delta) => {
    const f = fadeRef.current
    f.particles += ((scenePhase >= 2 ? 1 : 0) - f.particles) * Math.min(1, delta * 2.5)
    f.hud += ((scenePhase >= 2 ? 0.14 : 0) - f.hud) * Math.min(1, delta * 3)
    f.screens += ((scenePhase >= 1 ? screenOpacity : 0) - f.screens) * Math.min(1, delta * 3)
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
      if (document.hidden) return // B29: skip VFX spawns when tab is hidden
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

  // ── PERF8: Progressive boot — gate component MOUNTING on scenePhase ──
  // Phase 0 (immediate): Sphere + lights + background + camera controls
  // Phase 1 (+500ms):    Screen panels, merge graphs, stack indicators
  // Phase 2 (+1.0s):     Floor decorations, particles, HUD text, sonar pulse
  // Phase 3 (+2.0s):     PostFX, spaceship VFX, cinematic features
  // This defers GPU work (geometry upload, shader compilation, texture decode)
  // so the app feels interactive sooner — terminals and menus are usable immediately.

  return (
    <>
      {showPerf && <Perf position="bottom-left" deepAnalyze />}
      <PerfStatsExporter />
      <SceneBackground />

      {/* ── Phase 0: Sphere + lights (immediate) ── */}
      <SceneLights />
      <PbrHalSphere blockedInput={blockedInput} voiceReactionIntensity={voiceReactionIntensity} sphereStyle={sphereStyle} />

      {/* ── Phase 1: Screen panels + merge graphs (+500ms) ── */}
      {scenePhase >= 1 && (
        <>
          {/* B22 PERF: Single useFrame that detects camera movement + user interaction.
              ScreenPanel useFrame callbacks then skip work when camera is static or throttle
              during active orbit/zoom, eliminating 100x per-panel vector math per frame. */}
          <ScreenPanelUpdater />

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
                onResume={() => { if (demo?.enabled) return; onOpenTerminal?.(project.path, project.name, true) }}
                onNewSession={() => { if (demo?.enabled) return; onOpenTerminal?.(project.path, project.name, false) }}
                onFiles={() => { if (demo?.enabled) return; window.api.openFolder(project.path) }}
                runCmd={project.runCmd}
                onRunApp={project.runCmd ? () => { if (demo?.enabled) return; window.api.runApp(project.path, project.runCmd) } : undefined}
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
                onHtmlMounted={onCardHtmlMounted}
                sectorEntryDelay={sectorTransitioning ? i * 20 : -1}
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
        </>
      )}

      {/* ── Phase 2: Floor, particles, HUD (+1.0s) ── */}
      {scenePhase >= 2 && (
        <>
          <ReflectiveFloor radius={floorRadius} />
          <FloorEdgeMist radius={floorRadius} />
          {/* B27v3: ALL floor line components gated — TexturedPlatform was always-on and causing horizontal bars */}
          {floorLinesEnabled && <TexturedPlatform radius={platformRadius} onLoad={() => setTextureLoaded(true)} />}
          {floorLinesEnabled && <GridOverlay radius={floorRadius} />}
          {floorLinesEnabled && <PbrRingPlatform radius={ringPlatformRadius} />}

          {/* Ambient data particles — faded in at phase 3 */}
          <DataParticles projectCount={projects.length} hideDist={camera.particleHideDist} densityLevel={particleDensity} fadeMultiplier={fadeRef.current.particles} />

          {/* Scrolling HUD text strips */}
          <HudScrollText opacity={fadeRef.current.hud} />

          {/* Sonar pulse — HAL heartbeat */}
          {halOnline && <SonarPulse />}
        </>
      )}

      {/* ── Phase 3: PostFX, spaceship VFX, cinematic (+2.0s) ── */}
      {scenePhase >= 3 && (
        <>
          {/* Spaceship flyby — triggered on new terminal open */}
          <SpaceshipFlyby ref={flybyRef} enabled={shipVfxEnabled} />

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
        </>
      )}

      {/* P5b: Curved particle energy trails between grouped projects — toggle via Settings > Graphics */}
      {groupTrailsEnabled && (
        <GroupTrails
          projects={projects}
          groups={groups}
          assignments={assignments}
          screenPositions={screenPositions}
          searchActive={searchActive}
        />
      )}

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={true}
        minDistance={6}
        maxDistance={maxCamDistance}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2 - 0.03}
        enableDamping
        dampingFactor={0.12}
        target={ORBIT_TARGET}
      />
      <AutoRotateManager searchActive={searchActive} enabled={autoRotateEnabled} speed={autoRotateSpeed} />
      {/* UX16 Phase 2: Smooth camera orbit to keyboard-selected card */}
      <CameraEaser />
      {/* Photo Mode: drives animateCamera() / setCamera() inside useFrame, immune to OrbitControls overwrite */}
      <PhotoModeAnimator />

      <CameraDriver distance={camera.cameraDistance} angle={camera.cameraAngle} />
      {onCameraMove && <CameraSync onCameraMove={onCameraMove} />}

      {/* Scene ready gate + phase manager */}
      <SceneReadyGate textureReady={textureLoaded} onReady={() => { setSceneReady(true); onSceneReady?.() }} />
      <ScenePhaseManager sceneReady={sceneReady} onPhaseChange={setScenePhase} />

      <PostFX enabled={scenePhase >= 3} bloomEnabled={bloomEnabled} chromaticAberrationEnabled={chromaticAberrationEnabled} />
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
    // B38: Also reset ScreenPanel pointer-events on focus recovery
    const unsub = onRecoveryChange((recovering) => {
      burstRef.current = recovering
      if (recovering) onFocusRecovery()
    })
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

export function PbrHoloScene({ projects, searchQuery = '', listening, isFullySetup, onOpenTerminal, halOnline, layoutId = 'default', terminalCount = 0, vfxFrequency = 0, groups = [], assignments = {}, camera = DEFAULT_CAMERA, themeId = 'tactical', onCameraMove, blockedInput = false, onProjectContextMenu, isFavorite, screenOpacity = 1, particleDensity = 8, renderQuality, showPerf = false, onSceneReady, shipVfxEnabled = true, sphereStyle = 'wireframe', voiceReactionIntensity = 0.5, activityFeedback = true, externalSessions = [], absorbingPid = null, onAbsorb, getIdeLabel, onOpenIde, onOpenIdeMenu, onOpenExternalTerminal, onOpenBrowser, cinematicActive = false, onCinematicComplete, introAnimation = true, mergeStates = {}, commitGraphs = {}, selectedConflictFile, onSelectConflictFile, resolvedFilesMap = {}, graphicsPreset = 'medium', bloomEnabled = true, chromaticAberrationEnabled = false, floorLinesEnabled = false, groupTrailsEnabled = false, autoRotateEnabled = true, autoRotateSpeed = 0.12, sectorTransitioning = false, sectorDirection = 0, sectorHue = '#00f5ff', sectorHudText = '', demo }: Props) {
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

  // UX3: Scale radius based on panel count so panels never overlap
  // Arc per panel must be >= PANEL_W (2.8) + gap (0.6)
  const PANEL_W = 2.8
  const panelGap = 0.6
  const screenRadius = projects.length <= 1 ? 8 : Math.max(8, ((PANEL_W + panelGap) * projects.length) / (2 * Math.PI))
  const platformRadius = Math.max(12, screenRadius * 1.2)
  const ringPlatformRadius = Math.max(8.5, screenRadius * 1.0)
  // UX11: Floor disc matches ring platform radius + 20% buffer. Alpha fade handles the edge.
  const floorRadius = Math.max(12, ringPlatformRadius * 1.2)
  const maxCamDistance = Math.max(40, screenRadius * 2.5)

  // Compute camera position from settings
  const angleRad = (camera.cameraAngle * Math.PI) / 180
  const camY = Math.sin(angleRad) * camera.cameraDistance
  const camZ = Math.cos(angleRad) * camera.cameraDistance

  // ── Frame production control ──
  // Keep frameloop='always' permanently to avoid React re-renders from state changes.
  // Instead, use a module-level flag to skip expensive work in useFrame callbacks
  // when the window is hidden or terminal is focused.
  const invalidateRef = useRef<(() => void) | null>(null)

  return (
    <Canvas
      key={canvasKey}
      style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}
      camera={{ position: [0, camY, camZ], fov: 48, near: 0.1, far: 1000 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      frameloop="always"
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
          graphicsPreset={graphicsPreset}
          bloomEnabled={bloomEnabled}
          chromaticAberrationEnabled={chromaticAberrationEnabled}
          floorLinesEnabled={floorLinesEnabled}
          groupTrailsEnabled={groupTrailsEnabled}
          autoRotateEnabled={autoRotateEnabled}
          autoRotateSpeed={autoRotateSpeed}
          sectorTransitioning={sectorTransitioning}
          sectorDirection={sectorDirection}
          sectorHue={sectorHue}
          sectorHudText={sectorHudText}
          demo={demo}
        />
      </ThreeThemeProvider>
    </Canvas>
  )
}
