/**
 * Tier 2: 3D Style (Mood) definitions.
 *
 * Each style defines atmosphere / material properties WITHOUT hardcoding colors.
 * Colors are derived at runtime from the active Tier 1 color palette (--primary CSS var).
 *
 * Style IDs intentionally match the old three-themes IDs for migration compatibility.
 */

export interface ThreeStyleDef {
  id: string
  label: string
  bloom: { threshold: number; intensity: number; radius: number }
  backgroundDarkness: number      // 0.01-0.05 — how dark the scene bg is
  gridOpacity: number             // 0-1 — grid line visibility
  edgeGlowBase: number            // 0.3-0.9 — base opacity of screen edge glow strips
  particleBrightness: number      // 0.5-1.5 — multiplied into particle alpha
  sphereColorShift: number        // 0=always warm red, 1=follows accent hue
  sphereGlowIntensity: number     // emissive intensity of sphere core
  chromaticOffset: number         // chromatic aberration strength
  vignetteStrength: number        // vignette darkness (0-1)
  surfaceMetalness: number        // screen panel metalness
  surfaceRoughness: number        // screen panel roughness
}

export const THREE_STYLES: ThreeStyleDef[] = [
  {
    id: 'tactical',
    label: 'TACTICAL',
    bloom: { threshold: 0.3, intensity: 1.8, radius: 0.7 },
    backgroundDarkness: 0.02,
    gridOpacity: 0.5,
    edgeGlowBase: 0.5,
    particleBrightness: 1.0,
    sphereColorShift: 0,       // sphere stays warm red
    sphereGlowIntensity: 3,
    chromaticOffset: 0.0006,
    vignetteStrength: 0.6,
    surfaceMetalness: 0.3,
    surfaceRoughness: 0.9,
  },
  {
    id: 'holographic',
    label: 'HOLOGRAPHIC',
    bloom: { threshold: 0.2, intensity: 2.4, radius: 0.85 },
    backgroundDarkness: 0.03,
    gridOpacity: 0.7,
    edgeGlowBase: 0.6,
    particleBrightness: 1.2,
    sphereColorShift: 0,
    sphereGlowIntensity: 3.5,
    chromaticOffset: 0.001,
    vignetteStrength: 0.5,
    surfaceMetalness: 0.4,
    surfaceRoughness: 0.85,
  },
  {
    id: 'neon',
    label: 'NEON',
    bloom: { threshold: 0.25, intensity: 2.2, radius: 0.8 },
    backgroundDarkness: 0.04,
    gridOpacity: 0.6,
    edgeGlowBase: 0.7,
    particleBrightness: 1.3,
    sphereColorShift: 1,       // sphere follows accent
    sphereGlowIntensity: 3.5,
    chromaticOffset: 0.001,
    vignetteStrength: 0.5,
    surfaceMetalness: 0.35,
    surfaceRoughness: 0.88,
  },
  {
    id: 'minimal',
    label: 'MINIMAL',
    bloom: { threshold: 0.6, intensity: 0.6, radius: 0.4 },
    backgroundDarkness: 0.03,
    gridOpacity: 0.2,
    edgeGlowBase: 0.3,
    particleBrightness: 0.5,
    sphereColorShift: 0.3,
    sphereGlowIntensity: 1.5,
    chromaticOffset: 0.0003,
    vignetteStrength: 0.3,
    surfaceMetalness: 0.2,
    surfaceRoughness: 0.95,
  },
  {
    id: 'amethyst',
    label: 'AMETHYST',
    bloom: { threshold: 0.25, intensity: 2.1, radius: 0.8 },
    backgroundDarkness: 0.025,
    gridOpacity: 0.5,
    edgeGlowBase: 0.6,
    particleBrightness: 1.15,
    sphereColorShift: 0.9,     // sphere follows accent (purple hue)
    sphereGlowIntensity: 3.2,
    chromaticOffset: 0.0009,
    vignetteStrength: 0.55,
    surfaceMetalness: 0.35,
    surfaceRoughness: 0.87,
  },
  {
    id: 'ember',
    label: 'EMBER',
    bloom: { threshold: 0.25, intensity: 2.0, radius: 0.75 },
    backgroundDarkness: 0.03,
    gridOpacity: 0.5,
    edgeGlowBase: 0.6,
    particleBrightness: 1.1,
    sphereColorShift: 0.8,     // sphere mostly follows accent (warm hue)
    sphereGlowIntensity: 3.2,
    chromaticOffset: 0.0008,
    vignetteStrength: 0.55,
    surfaceMetalness: 0.35,
    surfaceRoughness: 0.88,
  },
  {
    id: 'arctic',
    label: 'ARCTIC',
    bloom: { threshold: 0.3, intensity: 1.6, radius: 0.65 },
    backgroundDarkness: 0.02,
    gridOpacity: 0.4,
    edgeGlowBase: 0.45,
    particleBrightness: 0.9,
    sphereColorShift: 0.5,     // sphere partially follows accent
    sphereGlowIntensity: 2.5,
    chromaticOffset: 0.0005,
    vignetteStrength: 0.45,
    surfaceMetalness: 0.25,
    surfaceRoughness: 0.92,
  },
]

export const THREE_STYLE_MAP = new Map(THREE_STYLES.map((s) => [s.id, s]))

export function getStyleDef(id: string): ThreeStyleDef {
  return THREE_STYLE_MAP.get(id) || THREE_STYLES[0]
}
