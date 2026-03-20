export interface ColorTheme {
  id: string
  name: string
  // Dark mode colors
  dark: {
    bgBase: string
    bgSurface: string
    bgSurfaceHover: string
    bgInput: string
    primary: string
    primaryHover: string
    primaryDim: string
  }
  // Light mode colors
  light: {
    bgBase: string
    bgSurface: string
    bgSurfaceHover: string
    bgInput: string
    primary: string
    primaryHover: string
    primaryDim: string
  }
}

// Sorted by hue: red → orange → yellow → green → cyan → blue → purple → pink → neutral
export const COLOR_THEMES: ColorTheme[] = [
  // ── Reds ──
  {
    id: 'ruby', name: 'Ruby',
    dark: { bgBase: '#140a0a', bgSurface: '#281414', bgSurfaceHover: '#3a1e1e', bgInput: '#1e0f0f', primary: '#ef4444', primaryHover: '#f87171', primaryDim: '#dc2626' },
    light: { bgBase: '#fef2f2', bgSurface: '#ffffff', bgSurfaceHover: '#fde8e8', bgInput: '#fcdede', primary: '#dc2626', primaryHover: '#b91c1c', primaryDim: '#f87171' },
  },
  {
    id: 'coral', name: 'Coral',
    dark: { bgBase: '#14100e', bgSurface: '#281e1a', bgSurfaceHover: '#3a2c26', bgInput: '#1e1814', primary: '#fb7185', primaryHover: '#fda4af', primaryDim: '#f43f5e' },
    light: { bgBase: '#fff1f2', bgSurface: '#ffffff', bgSurfaceHover: '#ffe4e6', bgInput: '#fecdd3', primary: '#f43f5e', primaryHover: '#e11d48', primaryDim: '#fda4af' },
  },
  {
    id: 'wine', name: 'Wine',
    dark: { bgBase: '#120a0c', bgSurface: '#241418', bgSurfaceHover: '#361e24', bgInput: '#1a0f12', primary: '#c0506a', primaryHover: '#d87088', primaryDim: '#a03050' },
    light: { bgBase: '#fdf2f4', bgSurface: '#ffffff', bgSurfaceHover: '#fbe4e8', bgInput: '#f8d4dc', primary: '#a03050', primaryHover: '#882440', primaryDim: '#d87088' },
  },
  // ── Oranges ──
  {
    id: 'volcano', name: 'Volcano',
    dark: { bgBase: '#140a06', bgSurface: '#28140c', bgSurfaceHover: '#3c1e14', bgInput: '#1e100a', primary: '#ff6b35', primaryHover: '#ff8c5a', primaryDim: '#e04d1a' },
    light: { bgBase: '#fff6f0', bgSurface: '#ffffff', bgSurfaceHover: '#ffe8da', bgInput: '#ffdcc8', primary: '#e04d1a', primaryHover: '#c43d10', primaryDim: '#ff8c5a' },
  },
  {
    id: 'sunset', name: 'Sunset',
    dark: { bgBase: '#14100a', bgSurface: '#261c12', bgSurfaceHover: '#38291b', bgInput: '#1c1610', primary: '#f97316', primaryHover: '#fb923c', primaryDim: '#ea580c' },
    light: { bgBase: '#fff8f0', bgSurface: '#ffffff', bgSurfaceHover: '#fff0e0', bgInput: '#fee8d0', primary: '#ea580c', primaryHover: '#dc4e08', primaryDim: '#fb923c' },
  },
  {
    id: 'peach', name: 'Peach',
    dark: { bgBase: '#141010', bgSurface: '#28201c', bgSurfaceHover: '#3a2e28', bgInput: '#1e1814', primary: '#fba07a', primaryHover: '#fcbb9a', primaryDim: '#f07848' },
    light: { bgBase: '#fff8f4', bgSurface: '#ffffff', bgSurfaceHover: '#ffede4', bgInput: '#ffe2d4', primary: '#e86030', primaryHover: '#d04820', primaryDim: '#fcbb9a' },
  },
  {
    id: 'copper', name: 'Copper',
    dark: { bgBase: '#12100c', bgSurface: '#241e18', bgSurfaceHover: '#362c22', bgInput: '#1a1612', primary: '#c2956a', primaryHover: '#d4aa82', primaryDim: '#a07850' },
    light: { bgBase: '#faf6f1', bgSurface: '#ffffff', bgSurfaceHover: '#f3ece3', bgInput: '#ebe2d6', primary: '#a07850', primaryHover: '#8a6440', primaryDim: '#d4aa82' },
  },
  // ── Yellows ──
  {
    id: 'amber', name: 'Amber',
    dark: { bgBase: '#14120a', bgSurface: '#262210', bgSurfaceHover: '#38321a', bgInput: '#1c1a0e', primary: '#f59e0b', primaryHover: '#fbbf24', primaryDim: '#d97706' },
    light: { bgBase: '#fffbeb', bgSurface: '#ffffff', bgSurfaceHover: '#fef3c7', bgInput: '#fde68a', primary: '#d97706', primaryHover: '#b45309', primaryDim: '#fbbf24' },
  },
  {
    id: 'gold', name: 'Gold',
    dark: { bgBase: '#141208', bgSurface: '#28240e', bgSurfaceHover: '#3a3418', bgInput: '#1e1c0c', primary: '#eab308', primaryHover: '#facc15', primaryDim: '#ca8a04' },
    light: { bgBase: '#fefce8', bgSurface: '#ffffff', bgSurfaceHover: '#fef9c3', bgInput: '#fef08a', primary: '#ca8a04', primaryHover: '#a16207', primaryDim: '#facc15' },
  },
  // ── Yellow-Greens ──
  {
    id: 'lime', name: 'Lime',
    dark: { bgBase: '#0e120a', bgSurface: '#1c2414', bgSurfaceHover: '#2a361e', bgInput: '#141c0f', primary: '#84cc16', primaryHover: '#a3e635', primaryDim: '#65a30d' },
    light: { bgBase: '#f7fee7', bgSurface: '#ffffff', bgSurfaceHover: '#ecfccb', bgInput: '#d9f99d', primary: '#65a30d', primaryHover: '#4d7c0f', primaryDim: '#a3e635' },
  },
  {
    id: 'neon', name: 'Neon',
    dark: { bgBase: '#080c08', bgSurface: '#101a10', bgSurfaceHover: '#1a2a1a', bgInput: '#0c140c', primary: '#39ff14', primaryHover: '#66ff44', primaryDim: '#22cc00' },
    light: { bgBase: '#f2fff0', bgSurface: '#ffffff', bgSurfaceHover: '#e0ffe0', bgInput: '#d0f8d0', primary: '#22cc00', primaryHover: '#1a9e00', primaryDim: '#66ff44' },
  },
  {
    id: 'matrix', name: 'Matrix',
    dark: { bgBase: '#000a00', bgSurface: '#001400', bgSurfaceHover: '#002000', bgInput: '#001000', primary: '#00ff41', primaryHover: '#40ff70', primaryDim: '#00cc33' },
    light: { bgBase: '#f0fff2', bgSurface: '#ffffff', bgSurfaceHover: '#d8ffe0', bgInput: '#c8f8d0', primary: '#008822', primaryHover: '#006818', primaryDim: '#40ff70' },
  },
  // ── Greens ──
  {
    id: 'forest', name: 'Forest',
    dark: { bgBase: '#080e08', bgSurface: '#121e14', bgSurfaceHover: '#1c2e1e', bgInput: '#0e180f', primary: '#4ade80', primaryHover: '#86efac', primaryDim: '#22c55e' },
    light: { bgBase: '#f0faf2', bgSurface: '#ffffff', bgSurfaceHover: '#dcfce7', bgInput: '#d0f5dc', primary: '#16a34a', primaryHover: '#15803d', primaryDim: '#86efac' },
  },
  {
    id: 'emerald', name: 'Emerald',
    dark: { bgBase: '#0a1210', bgSurface: '#142520', bgSurfaceHover: '#1e3630', bgInput: '#0f1c18', primary: '#10b981', primaryHover: '#34d399', primaryDim: '#059669' },
    light: { bgBase: '#f0fdf4', bgSurface: '#ffffff', bgSurfaceHover: '#e6f7ed', bgInput: '#dcfce7', primary: '#059669', primaryHover: '#047857', primaryDim: '#34d399' },
  },
  {
    id: 'mint', name: 'Mint',
    dark: { bgBase: '#0a1412', bgSurface: '#142824', bgSurfaceHover: '#1e3c34', bgInput: '#0f1e1a', primary: '#34d399', primaryHover: '#6ee7b7', primaryDim: '#10b981' },
    light: { bgBase: '#ecfdf5', bgSurface: '#ffffff', bgSurfaceHover: '#d1fae5', bgInput: '#c4f5dc', primary: '#10b981', primaryHover: '#059669', primaryDim: '#6ee7b7' },
  },
  {
    id: 'teal', name: 'Teal',
    dark: { bgBase: '#0a1212', bgSurface: '#142424', bgSurfaceHover: '#1e3636', bgInput: '#0f1c1c', primary: '#14b8a6', primaryHover: '#2dd4bf', primaryDim: '#0d9488' },
    light: { bgBase: '#f0fdfa', bgSurface: '#ffffff', bgSurfaceHover: '#ccfbf1', bgInput: '#c0f5ec', primary: '#0d9488', primaryHover: '#0f766e', primaryDim: '#2dd4bf' },
  },
  // ── Cyans ──
  {
    id: 'cyan', name: 'Cyan',
    dark: { bgBase: '#0a1214', bgSurface: '#122228', bgSurfaceHover: '#1a3038', bgInput: '#0e1a1e', primary: '#06b6d4', primaryHover: '#22d3ee', primaryDim: '#0891b2' },
    light: { bgBase: '#ecfeff', bgSurface: '#ffffff', bgSurfaceHover: '#d8f8fc', bgInput: '#cffafe', primary: '#0891b2', primaryHover: '#0e7490', primaryDim: '#22d3ee' },
  },
  {
    id: 'arctic', name: 'Arctic',
    dark: { bgBase: '#080c12', bgSurface: '#101820', bgSurfaceHover: '#182430', bgInput: '#0c1218', primary: '#7dcfff', primaryHover: '#a8e0ff', primaryDim: '#3aadea' },
    light: { bgBase: '#f0f8ff', bgSurface: '#ffffff', bgSurfaceHover: '#dff0ff', bgInput: '#d0e8fa', primary: '#1a8fd0', primaryHover: '#1578b0', primaryDim: '#a8e0ff' },
  },
  // ── Blues ──
  {
    id: 'sky', name: 'Sky',
    dark: { bgBase: '#0a1018', bgSurface: '#141e2e', bgSurfaceHover: '#1e2e42', bgInput: '#0e1824', primary: '#0ea5e9', primaryHover: '#38bdf8', primaryDim: '#0284c7' },
    light: { bgBase: '#f0f9ff', bgSurface: '#ffffff', bgSurfaceHover: '#e0f2fe', bgInput: '#d0eafa', primary: '#0284c7', primaryHover: '#0369a1', primaryDim: '#38bdf8' },
  },
  {
    id: 'aurora', name: 'Aurora',
    dark: { bgBase: '#0a0e14', bgSurface: '#141e28', bgSurfaceHover: '#1e2e3a', bgInput: '#0f1820', primary: '#7dd3fc', primaryHover: '#bae6fd', primaryDim: '#38bdf8' },
    light: { bgBase: '#f0f9ff', bgSurface: '#ffffff', bgSurfaceHover: '#e0f2fe', bgInput: '#d4ecfa', primary: '#0284c7', primaryHover: '#0369a1', primaryDim: '#7dd3fc' },
  },
  {
    id: 'ocean', name: 'Ocean',
    dark: { bgBase: '#0b1120', bgSurface: '#151d30', bgSurfaceHover: '#1e2a42', bgInput: '#101828', primary: '#3b82f6', primaryHover: '#60a5fa', primaryDim: '#2563eb' },
    light: { bgBase: '#f0f5ff', bgSurface: '#ffffff', bgSurfaceHover: '#e8f0fe', bgInput: '#e0eafc', primary: '#2563eb', primaryHover: '#1d4fd8', primaryDim: '#60a5fa' },
  },
  // ── Indigos ──
  {
    id: 'indigo', name: 'Indigo',
    dark: { bgBase: '#0e0f1a', bgSurface: '#1a1c30', bgSurfaceHover: '#262842', bgInput: '#131528', primary: '#6366f1', primaryHover: '#818cf8', primaryDim: '#4f46e5' },
    light: { bgBase: '#eef2ff', bgSurface: '#ffffff', bgSurfaceHover: '#e0e7ff', bgInput: '#d4dcfa', primary: '#4f46e5', primaryHover: '#4338ca', primaryDim: '#818cf8' },
  },
  {
    id: 'midnight', name: 'Midnight',
    dark: { bgBase: '#06080e', bgSurface: '#0e1220', bgSurfaceHover: '#161e32', bgInput: '#0a0e18', primary: '#a5b4fc', primaryHover: '#c7d2fe', primaryDim: '#6366f1' },
    light: { bgBase: '#eef0ff', bgSurface: '#ffffff', bgSurfaceHover: '#e0e4ff', bgInput: '#d4d8fc', primary: '#4f46e5', primaryHover: '#4338ca', primaryDim: '#c7d2fe' },
  },
  // ── Purples ──
  {
    id: 'amethyst', name: 'Amethyst',
    dark: { bgBase: '#0f1117', bgSurface: '#1a1d2e', bgSurfaceHover: '#252940', bgInput: '#141722', primary: '#8b7cf7', primaryHover: '#a097f7', primaryDim: '#5b4fc7' },
    light: { bgBase: '#f5f5f7', bgSurface: '#ffffff', bgSurfaceHover: '#f0f0f2', bgInput: '#eeeef0', primary: '#7c6cf5', primaryHover: '#6b5ce0', primaryDim: '#9d90f7' },
  },
  {
    id: 'lavender', name: 'Lavender',
    dark: { bgBase: '#100e16', bgSurface: '#201c2c', bgSurfaceHover: '#2e2a3e', bgInput: '#181422', primary: '#b4a0f0', primaryHover: '#cdbef5', primaryDim: '#9580e0' },
    light: { bgBase: '#f8f5ff', bgSurface: '#ffffff', bgSurfaceHover: '#f0eaff', bgInput: '#e8e0fc', primary: '#8b6fd0', primaryHover: '#7558c0', primaryDim: '#cdbef5' },
  },
  // ── Pinks / Magentas ──
  {
    id: 'fuchsia', name: 'Fuchsia',
    dark: { bgBase: '#120a14', bgSurface: '#241428', bgSurfaceHover: '#361e3a', bgInput: '#1a0f1e', primary: '#d946ef', primaryHover: '#e879f9', primaryDim: '#c026d3' },
    light: { bgBase: '#fdf4ff', bgSurface: '#ffffff', bgSurfaceHover: '#fae8ff', bgInput: '#f5d0fe', primary: '#c026d3', primaryHover: '#a21caf', primaryDim: '#e879f9' },
  },
  {
    id: 'synthwave', name: 'Synthwave',
    dark: { bgBase: '#0e0616', bgSurface: '#1a0c2a', bgSurfaceHover: '#28143e', bgInput: '#140a20', primary: '#ff2dce', primaryHover: '#ff6be0', primaryDim: '#cc00a8' },
    light: { bgBase: '#fff0fc', bgSurface: '#ffffff', bgSurfaceHover: '#ffe0f8', bgInput: '#ffd0f4', primary: '#cc00a8', primaryHover: '#a80090', primaryDim: '#ff6be0' },
  },
  {
    id: 'rose', name: 'Rose',
    dark: { bgBase: '#140a10', bgSurface: '#281420', bgSurfaceHover: '#3a1e30', bgInput: '#1e0f18', primary: '#ec4899', primaryHover: '#f472b6', primaryDim: '#db2777' },
    light: { bgBase: '#fdf2f8', bgSurface: '#ffffff', bgSurfaceHover: '#fce7f3', bgInput: '#fbcfe8', primary: '#db2777', primaryHover: '#be185d', primaryDim: '#f472b6' },
  },
  {
    id: 'cherry', name: 'Cherry Blossom',
    dark: { bgBase: '#140c10', bgSurface: '#281820', bgSurfaceHover: '#3a2430', bgInput: '#1e1218', primary: '#f9a8d4', primaryHover: '#fbcfe8', primaryDim: '#ec4899' },
    light: { bgBase: '#fff5f9', bgSurface: '#ffffff', bgSurfaceHover: '#ffe4ee', bgInput: '#ffd6e7', primary: '#db2777', primaryHover: '#be185d', primaryDim: '#f9a8d4' },
  },
  // ── Neutral ──
  {
    id: 'slate', name: 'Slate',
    dark: { bgBase: '#0f1115', bgSurface: '#1a1e25', bgSurfaceHover: '#252a33', bgInput: '#14181e', primary: '#64748b', primaryHover: '#94a3b8', primaryDim: '#475569' },
    light: { bgBase: '#f8fafc', bgSurface: '#ffffff', bgSurfaceHover: '#f1f5f9', bgInput: '#e8edf2', primary: '#475569', primaryHover: '#334155', primaryDim: '#94a3b8' },
  },
]

export function getThemeById(id: string): ColorTheme | undefined {
  return COLOR_THEMES.find((t) => t.id === id)
}
