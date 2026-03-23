import { createContext, useContext, useMemo } from 'react'
import * as THREE from 'three'
import type { ReactNode } from 'react'
import { getThemeDef, type ThreeThemeDef } from '../data/three-themes'

/**
 * Palette of THREE.Color objects derived from the active 3D theme.
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
  // Bloom settings
  bloom: { threshold: number; intensity: number; radius: number }
  // Theme definition reference
  def: ThreeThemeDef
}

/** Read a CSS custom property from the document root, with a fallback. */
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return val || fallback
}

/** Build the full palette from a theme definition. */
function buildPalette(themeId: string): ThreeThemePalette {
  const def = getThemeDef(themeId)
  const success = cssVar('--success', '#4ade80')
  const warning = cssVar('--warning', '#fbbf24')
  const error = cssVar('--error', '#f87171')

  return {
    accent: new THREE.Color(def.accent),
    accentDim: new THREE.Color(def.accentDim),
    sphere: new THREE.Color(def.sphere),
    sphereGlow: new THREE.Color(def.sphereGlow),
    background: new THREE.Color(def.background),
    gridLine: new THREE.Color(def.gridLine),
    screenEdge: new THREE.Color(def.screenEdge),
    screenFace: new THREE.Color(def.screenFace),
    particleA: new THREE.Color(def.particleA),
    particleB: new THREE.Color(def.particleB),
    success: new THREE.Color(success),
    warning: new THREE.Color(warning),
    error: new THREE.Color(error),
    accentHex: def.accent,
    screenEdgeHex: def.screenEdge,
    particleAHex: def.particleA,
    particleBHex: def.particleB,
    sphereHex: def.sphere,
    sphereGlowHex: def.sphereGlow,
    backgroundHex: def.background,
    gridLineHex: def.gridLine,
    screenFaceHex: def.screenFace,
    bloom: def.bloom,
    def,
  }
}

const ThreeThemeContext = createContext<ThreeThemePalette | null>(null)

interface ProviderProps {
  themeId: string
  children: ReactNode
}

/**
 * Wrap this around your `<Canvas>` components so that any R3F component
 * inside can call `useThreeTheme()` to get the current colour palette.
 *
 * The palette is recomputed when the themeId changes.
 */
export function ThreeThemeProvider({ themeId, children }: ProviderProps) {
  const palette = useMemo(() => buildPalette(themeId), [themeId])

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
