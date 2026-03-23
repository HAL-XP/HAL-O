/**
 * 6 visual themes for the holographic 3D renderers.
 * Each theme defines a complete color palette + bloom settings.
 * "tactical" is the default and matches the original hardcoded look.
 */

export interface ThreeThemeDef {
  id: string
  label: string
  accent: string        // screen edges, UI elements
  accentDim: string     // dimmer version
  sphere: string        // HAL sphere core
  sphereGlow: string    // sphere outer glow
  background: string    // scene background
  gridLine: string      // grid overlay
  screenEdge: string    // screen panel edges
  screenFace: string    // screen panel face
  particleA: string     // primary particle color
  particleB: string     // secondary particle color
  bloom: { threshold: number; intensity: number; radius: number }
}

export const THREE_THEMES: ThreeThemeDef[] = [
  {
    id: 'tactical',
    label: 'TACTICAL',
    accent: '#00d4ff',
    accentDim: '#004466',
    sphere: '#ff2200',
    sphereGlow: '#ff4400',
    background: '#010104',
    gridLine: '#004466',
    screenEdge: '#00d4ff',
    screenFace: '#050810',
    particleA: '#00d4ff',
    particleB: '#84cc16',
    bloom: { threshold: 0.3, intensity: 1.8, radius: 0.7 },
  },
  {
    id: 'holographic',
    label: 'HOLOGRAPHIC',
    accent: '#22e8ff',
    accentDim: '#0088aa',
    sphere: '#ff3311',
    sphereGlow: '#ff5522',
    background: '#010108',
    gridLine: '#006688',
    screenEdge: '#22e8ff',
    screenFace: '#030610',
    particleA: '#22e8ff',
    particleB: '#00ffcc',
    bloom: { threshold: 0.2, intensity: 2.4, radius: 0.85 },
  },
  {
    id: 'neon',
    label: 'NEON',
    accent: '#ff00ff',
    accentDim: '#660066',
    sphere: '#ff00ff',
    sphereGlow: '#ff44ff',
    background: '#06000a',
    gridLine: '#330044',
    screenEdge: '#ff00ff',
    screenFace: '#0a0412',
    particleA: '#ff00ff',
    particleB: '#8b5cf6',
    bloom: { threshold: 0.25, intensity: 2.2, radius: 0.8 },
  },
  {
    id: 'minimal',
    label: 'MINIMAL',
    accent: '#cccccc',
    accentDim: '#444444',
    sphere: '#888888',
    sphereGlow: '#aaaaaa',
    background: '#080808',
    gridLine: '#1a1a1a',
    screenEdge: '#999999',
    screenFace: '#0c0c0c',
    particleA: '#bbbbbb',
    particleB: '#666666',
    bloom: { threshold: 0.6, intensity: 0.6, radius: 0.4 },
  },
  {
    id: 'ember',
    label: 'EMBER',
    accent: '#ff4400',
    accentDim: '#662200',
    sphere: '#ff4400',
    sphereGlow: '#ff6600',
    background: '#060200',
    gridLine: '#331100',
    screenEdge: '#ff4400',
    screenFace: '#0a0604',
    particleA: '#ff4400',
    particleB: '#fb923c',
    bloom: { threshold: 0.25, intensity: 2.0, radius: 0.75 },
  },
  {
    id: 'arctic',
    label: 'ARCTIC',
    accent: '#93c5fd',
    accentDim: '#2a4a6d',
    sphere: '#bfdbfe',
    sphereGlow: '#dbeafe',
    background: '#020408',
    gridLine: '#1a2a3d',
    screenEdge: '#93c5fd',
    screenFace: '#060a10',
    particleA: '#93c5fd',
    particleB: '#e0f2fe',
    bloom: { threshold: 0.3, intensity: 1.6, radius: 0.65 },
  },
]

export const THREE_THEME_MAP = new Map(THREE_THEMES.map((t) => [t.id, t]))

export function getThemeDef(id: string): ThreeThemeDef {
  return THREE_THEME_MAP.get(id) || THREE_THEMES[0]
}
