import { createContext, useContext, useMemo } from 'react'
import * as THREE from 'three'
import type { ReactNode } from 'react'

/**
 * Palette of THREE.Color objects derived from CSS custom properties.
 * Used by Three.js / R3F components to stay in sync with the app theme.
 */
export interface ThreeThemePalette {
  accent: THREE.Color      // --primary (#84cc16)
  accentDim: THREE.Color   // derived, 50% intensity version of accent
  sphere: THREE.Color      // red/orange for HAL core
  sphereGlow: THREE.Color  // brighter sphere emissive
  background: THREE.Color  // --bg-base
  gridLine: THREE.Color    // subtle grid color
  screenEdge: THREE.Color  // --primary for screen frame edges
  screenFace: THREE.Color  // dark panel face
  success: THREE.Color     // --success
  warning: THREE.Color     // --warning
  error: THREE.Color       // --error
  cyan: THREE.Color        // accent blue (#00d4ff)
}

/** Read a CSS custom property from the document root, with a fallback. */
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return val || fallback
}

/** Build the full palette by reading CSS vars + deriving extra colours. */
function buildPalette(): ThreeThemePalette {
  const primary = cssVar('--primary', '#84cc16')
  const bgBase = cssVar('--bg-base', '#0f1117')
  const success = cssVar('--success', '#4ade80')
  const warning = cssVar('--warning', '#fbbf24')
  const error = cssVar('--error', '#f87171')

  const accent = new THREE.Color(primary)

  // accentDim: same hue/saturation but halved lightness
  const accentDim = accent.clone()
  const hsl = { h: 0, s: 0, l: 0 }
  accentDim.getHSL(hsl)
  accentDim.setHSL(hsl.h, hsl.s, hsl.l * 0.5)

  return {
    accent,
    accentDim,
    sphere: new THREE.Color('#ff2200'),
    sphereGlow: new THREE.Color('#ff4400'),
    background: new THREE.Color(bgBase),
    gridLine: new THREE.Color('#004466'),
    screenEdge: new THREE.Color(primary),
    screenFace: new THREE.Color('#040608'),
    success: new THREE.Color(success),
    warning: new THREE.Color(warning),
    error: new THREE.Color(error),
    cyan: new THREE.Color('#00d4ff'),
  }
}

const ThreeThemeContext = createContext<ThreeThemePalette | null>(null)

interface ProviderProps {
  children: ReactNode
}

/**
 * Wrap this around your `<Canvas>` components so that any R3F component
 * inside can call `useThreeTheme()` to get the current colour palette.
 *
 * The palette is computed once on mount (CSS vars are read from the DOM).
 */
export function ThreeThemeProvider({ children }: ProviderProps) {
  const palette = useMemo(() => buildPalette(), [])

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
