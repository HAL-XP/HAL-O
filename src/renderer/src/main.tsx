import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { I18nContext, createT } from './i18n'
import { LANGUAGES } from './i18n/types'
import type { LanguageCode } from './i18n/types'
import './App.css'

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('claudeborn-theme')
    return saved ? saved === 'dark' : true
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('claudeborn-theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <button className="toolbar-toggle" onClick={() => setDark(!dark)} title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? '\u2600' : '\u263E'}
    </button>
  )
}

function SoundToggle() {
  const [muted, setMuted] = useState(() => {
    return localStorage.getItem('claudeborn-muted') === '1'
  })

  useEffect(() => {
    window.__claudebornMuted = muted
    localStorage.setItem('claudeborn-muted', muted ? '1' : '0')
  }, [muted])

  return (
    <button className="toolbar-toggle" onClick={() => setMuted(!muted)} title={muted ? 'Unmute sounds' : 'Mute sounds'}>
      {muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
    </button>
  )
}

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
            <button
              key={l.code}
              className={`lang-option ${l.code === lang ? 'active' : ''}`}
              onClick={() => { setLang(l.code); setOpen(false) }}
            >
              <span className="lang-code">{l.shortLabel}</span>
              <span className="lang-name">{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Root() {
  const [lang, setLang] = useState<LanguageCode>(() => {
    return (localStorage.getItem('claudeborn-lang') as LanguageCode) || 'en'
  })

  useEffect(() => {
    localStorage.setItem('claudeborn-lang', lang)
  }, [lang])

  const t = createT(lang)

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      <div className="toolbar-toggles">
        <LanguageToggle lang={lang} setLang={setLang} />
        <SoundToggle />
        <ThemeToggle />
      </div>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nContext.Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
