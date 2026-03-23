/**
 * Re-export the Three.js theme hook and types from the context module.
 *
 * Consumers can import from either location:
 *   import { useThreeTheme } from '../hooks/useThreeTheme'
 *   import { useThreeTheme } from '../contexts/ThreeThemeContext'
 */
export { useThreeTheme, ThreeThemeProvider } from '../contexts/ThreeThemeContext'
export type { ThreeThemePalette } from '../contexts/ThreeThemeContext'
