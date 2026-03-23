import { createContext, useContext, useMemo } from 'react'
import * as THREE from 'three'
import type { ReactNode } from 'react'
import { getStyleDef, type ThreeStyleDef } from '../data/three-styles'

// Re-export for backward compat — consumers importing ThreeThemeDef still get a valid type
export type { ThreeStyleDef as ThreeThemeDef } from '../data/three-styles'

/**
 * Palette of THREE.Color objects derived from the active 3D style + accent color.
 * Used by Three.js / R3F components to stay in sync with the visual style.
 */
export interface ThreeThemePalette {
  accent: THREE.Color      // screen edges, UI elements
  accentDim: THREE.Color   // dimmer version
  sphere: THREE.Color      // HAL sphere core
  sphereGlow: THREE.Color  // sphere outer glow
  background: THREE.Color  // scene background
  gridLine: THREE.Color    // subtle grid color
  screenEdge: THREE.Color  // screen panel edges
  screenFace: THREE.Color  // screen panel face
  particleA: THREE.Color   // primary particle color
  particleB: THREE.Color   // secondary particle color
  success: THREE.Color     // --success
  warning: THREE.Color     // --warning
  error: THREE.Color       // --error
  // Raw hex strings for use in HTML/CSS contexts (e.g. Html overlays inside R3F)
  accentHex: string
  screenEdgeHex: string
  particleAHex: string
  particleBHex: string
  sphereHex: string
  sphereGlowHex: string
  backgroundHex: string
  gridLineHex: string
  screenFaceHex: string
  // Bloom settings (from style definition)
  bloom: { threshold: number; intensity: number; radius: number }
  // Style definition reference
  style: ThreeStyleDef
  // Legacy alias — consumers that used palette.def still work
  def: ThreeStyleDef & { accent: string; accentDim: string; screenEdge: string }
}

/** Read a CSS custom property from the document root, with a fallback. */
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return val || fallback
}

/** Clamp a number to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Format a THREE.Color as a hex string. */
function toHex(c: THREE.Color): string {
  return '#' + c.getHexString()
}

/**
 * Derive the full 3D scene palette from:
 *   - styleId: the mood/atmosphere style (tactical, neon, etc.)
 *   - accentHex: the CSS --primary color from the Tier 1 color palette
 */
function buildPalette(styleId: string, accentHex: string): ThreeThemePalette {
  const style = getStyleDef(styleId)
  const success = cssVar('--success', '#4ade80')
  const warning = cssVar('--warning', '#fbbf24')
  const error = cssVar('--error', '#f87171')

  // Parse accent color and extract HSL
  const accent = new THREE.Color(accentHex)
  const accentHSL = { h: 0, s: 0, l: 0 }
  accent.getHSL(accentHSL)

  // ── Accent variants ──
  const accentDim = new THREE.Color()
  accentDim.setHSL(accentHSL.h, accentHSL.s * 0.7, accentHSL.l * 0.35)

  // ── Sphere color ──
  // sphereColorShift: 0 = always warm red, 1 = fully follows accent hue
  const sphereBase = new THREE.Color()
  const warmRedH = 0.0   // red hue
  const warmRedS = 0.9
  const warmRedL = 0.45
  const shift = style.sphereColorShift
  sphereBase.setHSL(
    warmRedH * (1 - shift) + accentHSL.h * shift,
    warmRedS * (1 - shift) + accentHSL.s * shift,
    warmRedL * (1 - shift) + clamp(accentHSL.l, 0.3, 0.5) * shift,
  )

  const sphereGlow = new THREE.Color()
  const sHSL = { h: 0, s: 0, l: 0 }
  sphereBase.getHSL(sHSL)
  sphereGlow.setHSL(sHSL.h, sHSL.s * 0.9, clamp(sHSL.l * 1.3, 0, 0.6))

  // ── Background ──
  // Derived from accent hue but extremely dark
  const bg = new THREE.Color()
  bg.setHSL(accentHSL.h, accentHSL.s * 0.3, style.backgroundDarkness)

  // ── Grid lines ──
  const gridLine = new THREE.Color()
  gridLine.setHSL(accentHSL.h, accentHSL.s * 0.5, 0.08 * style.gridOpacity + 0.03)

  // ── Screen edge ──  Same as accent — the style controls glow intensity via edgeGlowBase
  const screenEdge = accent.clone()

  // ── Screen face ──
  // Very dark surface tinted with accent hue
  const screenFace = new THREE.Color()
  screenFace.setHSL(accentHSL.h, accentHSL.s * 0.2, 0.025)

  // ── Particles ──
  // particleA = accent, particleB = hue-shifted complement
  const particleA = accent.clone()
  const particleB = new THREE.Color()
  particleB.setHSL(
    (accentHSL.h + 0.15) % 1.0,
    clamp(accentHSL.s * 0.8, 0.3, 0.9),
    clamp(accentHSL.l * 1.1, 0.3, 0.65),
  )

  // Build hex strings
  const accentHexStr = toHex(accent)
  const screenEdgeHex = toHex(screenEdge)
  const particleAHex = toHex(particleA)
  const particleBHex = toHex(particleB)
  const sphereHex = toHex(sphereBase)
  const sphereGlowHex = toHex(sphereGlow)
  const backgroundHex = toHex(bg)
  const gridLineHex = toHex(gridLine)
  const screenFaceHex = toHex(screenFace)

  // Build legacy-compatible "def" object so consumers using palette.def.accent etc. still work
  const legacyDef = {
    ...style,
    accent: accentHexStr,
    accentDim: toHex(accentDim),
    screenEdge: screenEdgeHex,
  }

  return {
    accent,
    accentDim,
    sphere: sphereBase,
    sphereGlow,
    background: bg,
    gridLine,
    screenEdge,
    screenFace,
    particleA,
    particleB,
    success: new THREE.Color(success),
    warning: new THREE.Color(warning),
    error: new THREE.Color(error),
    accentHex: accentHexStr,
    screenEdgeHex,
    particleAHex,
    particleBHex,
    sphereHex,
    sphereGlowHex,
    backgroundHex,
    gridLineHex,
    screenFaceHex,
    bloom: style.bloom,
    style,
    def: legacyDef,
  }
}

const ThreeThemeContext = createContext<ThreeThemePalette | null>(null)

interface ProviderProps {
  /** Style ID (mood): tactical, holographic, neon, minimal, ember, arctic */
  styleId: string
  /** Accent hex from the Tier 1 color palette (--primary CSS var) */
  accentHex: string
  children: ReactNode
}

/** Legacy alias kept for backward compat */
interface LegacyProviderProps {
  themeId: string
  children: ReactNode
}

/**
 * Wrap this around your `<Canvas>` components so that any R3F component
 * inside can call `useThreeTheme()` to get the current colour palette.
 *
 * Accepts either:
 *   - { styleId, accentHex } — new 3-tier API
 *   - { themeId } — legacy API (reads --primary from CSS)
 */
export function ThreeThemeProvider(props: ProviderProps | LegacyProviderProps) {
  const { children } = props

  // Determine styleId and accentHex based on which props are provided
  const styleId = 'styleId' in props ? props.styleId : (props as LegacyProviderProps).themeId
  const accentHex = 'accentHex' in props ? props.accentHex : '#84cc16'

  const palette = useMemo(() => buildPalette(styleId, accentHex), [styleId, accentHex])

  return (
    <ThreeThemeContext.Provider value={palette}>
      {children}
    </ThreeThemeContext.Provider>
  )
}

/**
 * Consume the Three.js theme palette.
 * Must be called inside a `<ThreeThemeProvider>`.
 */
export function useThreeTheme(): ThreeThemePalette {
  const ctx = useContext(ThreeThemeContext)
  if (!ctx) {
    throw new Error('useThreeTheme() must be used inside <ThreeThemeProvider>')
  }
  return ctx
}
