import { useState, useRef, useCallback, useEffect } from 'react'

export interface BrowserTab {
  id: string
  url: string
  title: string
  projectPath?: string
  projectName?: string
}

interface Props {
  tabs: BrowserTab[]
  onClose: (id: string) => void
  onCloseAll: () => void
}

const FALLBACK_TITLE = 'New Tab'

// Generate unique ID for browser tabs
let _browserTabCounter = 0
export function makeBrowserTabId(): string {
  return `browser-${Date.now()}-${++_browserTabCounter}`
}

export function BrowserPanel({ tabs, onClose, onCloseAll }: Props) {
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const webviewRefs = useRef<Map<string, Electron.WebviewTag>>(new Map())
  const [tabTitles, setTabTitles] = useState<Map<string, string>>(new Map())
  const [tabLoading, setTabLoading] = useState<Map<string, boolean>>(new Map())
  const activeTabIdRef = useRef<string | null>(null)

  // Sync active tab when tabs change
  useEffect(() => {
    if (tabs.length === 0) {
      setActiveTabId(null)
      activeTabIdRef.current = null
      return
    }
    // If active tab was removed, switch to last tab
    if (!activeTabId || !tabs.find(t => t.id === activeTabId)) {
      const newId = tabs[tabs.length - 1].id
      setActiveTabId(newId)
      activeTabIdRef.current = newId
    } else {
      activeTabIdRef.current = activeTabId
    }
  }, [tabs, activeTabId])

  // Update URL bar when switching tabs
  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTabId)
    if (tab) setUrlInput(tab.url)
  }, [activeTabId, tabs])

  const handleNavigate = useCallback((url: string) => {
    if (!activeTabId) return
    let finalUrl = url.trim()
    if (!finalUrl) return
    // Auto-add protocol if missing
    if (!/^https?:\/\//i.test(finalUrl)) {
      // Check if it looks like a domain
      if (/^[a-zA-Z0-9].*\.[a-zA-Z]{2,}/.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl
      } else {
        // Treat as search query
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`
      }
    }
    const wv = webviewRefs.current.get(activeTabId)
    if (wv) {
      wv.src = finalUrl
    }
    setUrlInput(finalUrl)
  }, [activeTabId])

  const handleGoBack = useCallback(() => {
    if (!activeTabId) return
    const wv = webviewRefs.current.get(activeTabId)
    if (wv && wv.canGoBack()) wv.goBack()
  }, [activeTabId])

  const handleGoForward = useCallback(() => {
    if (!activeTabId) return
    const wv = webviewRefs.current.get(activeTabId)
    if (wv && wv.canGoForward()) wv.goForward()
  }, [activeTabId])

  const handleReload = useCallback(() => {
    if (!activeTabId) return
    const wv = webviewRefs.current.get(activeTabId)
    if (wv) wv.reload()
  }, [activeTabId])

  // Attach webview event listeners
  const attachWebviewEvents = useCallback((id: string, wv: Electron.WebviewTag) => {
    webviewRefs.current.set(id, wv)

    const onTitleUpdate = (e: Electron.PageTitleUpdatedEvent) => {
      setTabTitles(prev => {
        const next = new Map(prev)
        next.set(id, e.title)
        return next
      })
    }

    const onStartLoading = () => {
      setTabLoading(prev => {
        const next = new Map(prev)
        next.set(id, true)
        return next
      })
    }

    const onStopLoading = () => {
      setTabLoading(prev => {
        const next = new Map(prev)
        next.set(id, false)
        return next
      })
    }

    const onNavigate = (e: Electron.DidNavigateEvent) => {
      if (id === activeTabIdRef.current) {
        setUrlInput(e.url)
      }
    }

    wv.addEventListener('page-title-updated', onTitleUpdate as any)
    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-stop-loading', onStopLoading)
    wv.addEventListener('did-navigate', onNavigate as any)
    wv.addEventListener('did-navigate-in-page', onNavigate as any)

    return () => {
      wv.removeEventListener('page-title-updated', onTitleUpdate as any)
      wv.removeEventListener('did-start-loading', onStartLoading)
      wv.removeEventListener('did-stop-loading', onStopLoading)
      wv.removeEventListener('did-navigate', onNavigate as any)
      wv.removeEventListener('did-navigate-in-page', onNavigate as any)
      webviewRefs.current.delete(id)
    }
  }, [])

  if (tabs.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0d1017',
      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: '#12151e',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        minHeight: 32,
        gap: 0,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
        }}>
          {tabs.map(tab => {
            const isActive = tab.id === activeTabId
            const title = tabTitles.get(tab.id) || tab.title || FALLBACK_TITLE
            const loading = tabLoading.get(tab.id) || false
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  fontSize: 10,
                  letterSpacing: '0.5px',
                  color: isActive ? '#e2e8f0' : '#64748b',
                  background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                  borderRight: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  maxWidth: 180,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  userSelect: 'none',
                  transition: 'background 0.15s',
                }}
              >
                {loading && (
                  <span style={{
                    width: 8,
                    height: 8,
                    border: '1.5px solid rgba(34,211,238,0.3)',
                    borderTopColor: '#22d3ee',
                    borderRadius: '50%',
                    animation: 'browserSpin 0.8s linear infinite',
                    flexShrink: 0,
                  }} />
                )}
                {tab.projectName && (
                  <span style={{
                    fontSize: 7,
                    color: '#22d3ee',
                    background: 'rgba(34,211,238,0.1)',
                    padding: '1px 4px',
                    borderRadius: 2,
                    flexShrink: 0,
                  }}>
                    {tab.projectName.slice(0, 8)}
                  </span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {title.length > 25 ? title.slice(0, 23) + '..' : title}
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); onClose(tab.id) }}
                  style={{
                    marginLeft: 'auto',
                    fontSize: 12,
                    color: '#4a5568',
                    cursor: 'pointer',
                    padding: '0 2px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  title="Close tab"
                >
                  x
                </span>
              </div>
            )
          })}
        </div>
        {tabs.length > 1 && (
          <button
            onClick={onCloseAll}
            style={{
              padding: '3px 8px',
              fontSize: 8,
              color: '#4a5568',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: '1px',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
            title="Close all browser tabs"
          >
            CLOSE ALL
          </button>
        )}
      </div>

      {/* Navigation bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        background: '#0f1219',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button
          onClick={handleGoBack}
          style={{
            padding: '2px 6px',
            fontSize: 12,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#64748b',
            cursor: 'pointer',
            borderRadius: 3,
            fontFamily: 'inherit',
          }}
          title="Back"
        >
          &larr;
        </button>
        <button
          onClick={handleGoForward}
          style={{
            padding: '2px 6px',
            fontSize: 12,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#64748b',
            cursor: 'pointer',
            borderRadius: 3,
            fontFamily: 'inherit',
          }}
          title="Forward"
        >
          &rarr;
        </button>
        <button
          onClick={handleReload}
          style={{
            padding: '2px 6px',
            fontSize: 12,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#64748b',
            cursor: 'pointer',
            borderRadius: 3,
            fontFamily: 'inherit',
          }}
          title="Reload"
        >
          &#8635;
        </button>
        <form
          onSubmit={(e) => { e.preventDefault(); handleNavigate(urlInput) }}
          style={{ flex: 1, display: 'flex' }}
        >
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            style={{
              flex: 1,
              padding: '4px 10px',
              fontSize: 11,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 3,
              color: '#c8dce8',
              outline: 'none',
              fontFamily: "'Cascadia Code', 'Fira Code', monospace",
              letterSpacing: '0.3px',
            }}
            placeholder="Enter URL or search..."
          />
        </form>
      </div>

      {/* Webview area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            style={{
              position: 'absolute',
              inset: 0,
              display: tab.id === activeTabId ? 'flex' : 'none',
            }}
          >
            <webview
              ref={(el: any) => {
                if (el && !webviewRefs.current.has(tab.id)) {
                  attachWebviewEvents(tab.id, el)
                }
              }}
              src={tab.url}
              style={{ flex: 1, border: 'none' }}
              // @ts-expect-error webview attributes
              allowpopups="true"
            />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes browserSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
