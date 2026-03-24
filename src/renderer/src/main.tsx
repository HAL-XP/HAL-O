import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ErrorToastContainer } from './components/ErrorToast'
import { I18nContext, createT } from './i18n'
import { LANGUAGES } from './i18n/types'
import type { LanguageCode } from './i18n/types'
import { COLOR_THEMES, getThemeById } from './color-themes'
import { FONT_THEMES, getFontById } from './font-themes'
import './App.css'

// ── One-time migration from Claudeborn → HAL-O localStorage keys ──

;(function migrateLocalStorage() {
  if (localStorage.getItem('hal-o-migrated')) return
  const keys = ['muted','lang','theme','color','font','hub-font','term-font',
    'voice-out','renderer','layout','split','setup-done','pane-layout']
  for (const k of keys) {
    const old = localStorage.getItem('claudeborn-' + k)
    if (old !== null && localStorage.getItem('hal-o-' + k) === null) {
      localStorage.setItem('hal-o-' + k, old)
    }
  }
  localStorage.setItem('hal-o-migrated', '1')
})()

// ── Apply color theme CSS variables ──

function applyColorTheme(themeId: string, isDark: boolean) {
  const theme = getThemeById(themeId) || COLOR_THEMES[0]
  const colors = isDark ? theme.dark : theme.light
  const root = document.documentElement
  root.style.setProperty('--bg-base', colors.bgBase)
  root.style.setProperty('--bg-surface', colors.bgSurface)
  root.style.setProperty('--bg-surface-hover', colors.bgSurfaceHover)
  root.style.setProperty('--bg-input', colors.bgInput)
  root.style.setProperty('--primary', colors.primary)
  root.style.setProperty('--primary-hover', colors.primaryHover)
  root.style.setProperty('--primary-dim', colors.primaryDim)
}

function applyFont(fontId: string) {
  const font = getFontById(fontId) || FONT_THEMES[0]
  document.documentElement.style.setProperty('--font-main', font.fontFamily)
}

// ── Toolbar components ──

function LanguageToggle({ lang, setLang }: { lang: LanguageCode; setLang: (l: LanguageCode) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = LANGUAGES.find((l) => l.code === lang)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="toolbar-toggle" onClick={() => setOpen(!open)} title={`Language: ${current?.label}`}>
        {current?.shortLabel || 'EN'}
      </button>
      {open && (
        <div className="lang-dropdown">
          {LANGUAGES.map((l) => (
            <button key={l.code} className={`lang-option ${l.code === lang ? 'active' : ''}`}
              onClick={() => { setLang(l.code); setOpen(false) }}>
              <span className="lang-code">{l.shortLabel}</span>
              <span className="lang-name">{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SoundToggle() {
  const [muted, setMuted] = useState(() => localStorage.getItem('hal-o-muted') === '1')

  useEffect(() => {
    window.__halOMuted = muted
    localStorage.setItem('hal-o-muted', muted ? '1' : '0')
  }, [muted])

  return (
    <button className="toolbar-toggle" onClick={() => setMuted(!muted)} title={muted ? 'Unmute' : 'Mute'}>
      {muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
    </button>
  )
}


function FontToggle({ fontId, setFontId }: { fontId: string; setFontId: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="toolbar-toggle" onClick={() => setOpen(!open)} title="Font">
        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>A</span>
      </button>
      {open && (
        <div className="font-dropdown">
          {FONT_THEMES.map((f) => (
            <button key={f.id} className={`font-option ${f.id === fontId ? 'active' : ''}`}
              onClick={() => { setFontId(f.id); setOpen(false) }}
              style={{ fontFamily: f.fontFamily }}>
              <span className="font-preview">{f.preview}</span>
              <span className="font-name">{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ColorThemeToggle({ themeId, setThemeId }: { themeId: string; setThemeId: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = getThemeById(themeId) || COLOR_THEMES[0]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="toolbar-toggle" onClick={() => setOpen(!open)} title={`Color: ${current.name}`}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: current.dark.primary, display: 'block', border: '2px solid var(--border)' }} />
      </button>
      {open && (
        <div className="color-dropdown">
          {COLOR_THEMES.map((t) => (
            <button key={t.id} className={`color-option ${t.id === themeId ? 'active' : ''}`}
              onClick={() => { setThemeId(t.id); setOpen(false) }}>
              <span className="color-swatch" style={{ background: t.dark.primary }} />
              <span className="color-name">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DarkLightToggle({ dark, setDark }: { dark: boolean; setDark: (d: boolean) => void }) {
  return (
    <button className="toolbar-toggle" onClick={() => setDark(!dark)} title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? '\u2600' : '\u263E'}
    </button>
  )
}

// ── Root ──

function Root() {
  const [lang, setLang] = useState<LanguageCode>(() =>
    (localStorage.getItem('hal-o-lang') as LanguageCode) || 'en')
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('hal-o-theme')
    return saved ? saved === 'dark' : true
  })
  const [colorTheme, setColorTheme] = useState(() =>
    localStorage.getItem('hal-o-color') || 'lime')
  const [fontTheme, setFontTheme] = useState(() =>
    localStorage.getItem('hal-o-font') || 'terminal')

  useEffect(() => { localStorage.setItem('hal-o-lang', lang) }, [lang])
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('hal-o-theme', dark ? 'dark' : 'light')
    applyColorTheme(colorTheme, dark)
  }, [dark, colorTheme])
  useEffect(() => {
    localStorage.setItem('hal-o-font', fontTheme)
    applyFont(fontTheme)
  }, [fontTheme])

  const t = createT(lang)

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      <div className="toolbar-toggles">
        {/* Left group: Language + Sound */}
        <LanguageToggle lang={lang} setLang={setLang} />
        <SoundToggle />
        {/* Separator */}
        <div className="toolbar-separator" />
        {/* Right group: Appearance (Font Family, Color, Dark/Light) */}
        <FontToggle fontId={fontTheme} setFontId={setFontTheme} />
        <ColorThemeToggle themeId={colorTheme} setThemeId={setColorTheme} />
        <DarkLightToggle dark={dark} setDark={setDark} />
      </div>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <ErrorToastContainer />
    </I18nContext.Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
