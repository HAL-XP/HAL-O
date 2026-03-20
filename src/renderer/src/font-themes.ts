export interface FontTheme {
  id: string
  name: string
  preview: string      // short text to show in dropdown
  fontFamily: string   // CSS font-family value
  mono?: boolean       // true = monospace/terminal style
}

export const FONT_THEMES: FontTheme[] = [
  {
    id: 'system',
    name: 'System',
    preview: 'Aa',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  {
    id: 'modern',
    name: 'Modern',
    preview: 'Aa',
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  {
    id: 'humanist',
    name: 'Humanist',
    preview: 'Aa',
    fontFamily: "Calibri, 'Gill Sans', 'Trebuchet MS', sans-serif",
  },
  {
    id: 'classic',
    name: 'Classic',
    preview: 'Aa',
    fontFamily: "Georgia, 'Times New Roman', 'Liberation Serif', serif",
  },
  {
    id: 'elegant',
    name: 'Elegant',
    preview: 'Aa',
    fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
  },
  {
    id: 'newspaper',
    name: 'Newspaper',
    preview: 'Aa',
    fontFamily: "Cambria, 'Hoefler Text', 'Liberation Serif', serif",
  },
  {
    id: 'compact',
    name: 'Compact',
    preview: 'Aa',
    fontFamily: "'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', sans-serif",
  },
  {
    id: 'terminal',
    name: 'Terminal',
    preview: '>_',
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
    mono: true,
  },
  {
    id: 'retro',
    name: 'Retro Mono',
    preview: '>_',
    fontFamily: "'Courier New', 'Lucida Console', Monaco, monospace",
    mono: true,
  },
  {
    id: 'tech',
    name: 'Tech Mono',
    preview: '>_',
    fontFamily: "'SF Mono', 'Inconsolata', 'Fira Mono', 'Source Code Pro', monospace",
    mono: true,
  },
]

export function getFontById(id: string): FontTheme | undefined {
  return FONT_THEMES.find((f) => f.id === id)
}
