import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ──

interface ToastEntry {
  id: number
  summary: string
  suggestion: string
  detail: string
  timestamp: number
}

// ── Helpers ──

let nextId = 1

function summarizeError(error: unknown): { summary: string; suggestion: string; detail: string } {
  const raw = error instanceof Error ? error : new Error(String(error))
  const msg = raw.message || 'Unknown error'

  // Build full detail for the copy button
  const detail = [
    `Error: ${msg}`,
    raw.stack ? `\nStack:\n${raw.stack}` : '',
    `\nTimestamp: ${new Date().toISOString()}`,
    `\nURL: ${window.location.href}`,
  ].join('')

  // Human-readable summary (first line, truncated)
  const summary = msg.length > 120 ? msg.slice(0, 117) + '...' : msg

  // Suggest action based on common patterns
  let suggestion = 'Try reloading the app (Ctrl+Shift+R).'
  const lower = msg.toLowerCase()
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('econnrefused') || lower.includes('failed to fetch')) {
    suggestion = 'Check your network connection and try again.'
  } else if (lower.includes('permission') || lower.includes('eperm') || lower.includes('eacces')) {
    suggestion = 'Check file/folder permissions and try again.'
  } else if (lower.includes('memory') || lower.includes('heap') || lower.includes('oom')) {
    suggestion = 'The app may be running low on memory. Close other tabs or restart.'
  } else if (lower.includes('webgl') || lower.includes('context lost') || lower.includes('gpu')) {
    suggestion = 'GPU context was lost. The 3D view will try to recover automatically.'
  } else if (lower.includes('enoent') || lower.includes('not found') || lower.includes('no such file')) {
    suggestion = 'A required file was not found. Check your project paths.'
  } else if (lower.includes('timeout') || lower.includes('timed out')) {
    suggestion = 'The operation timed out. Try again or check if the process is still running.'
  }

  return { summary, suggestion, detail }
}

// ── Singleton push function (exposed for external use if needed) ──

type PushFn = (summary: string, suggestion: string, detail: string) => void
let pushToast: PushFn | null = null

/** Show a toast from anywhere (module-level singleton). */
export function showToast(summary: string, suggestion = '', detail = '') {
  pushToast?.(summary, suggestion, detail)
}

// ── Auto-dismiss duration ──
const DISMISS_MS = 8000

// ── Component ──

export function ErrorToastContainer() {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((summary: string, suggestion: string, detail: string) => {
    const id = nextId++
    const entry: ToastEntry = { id, summary, suggestion, detail, timestamp: Date.now() }
    setToasts((prev) => {
      // Cap at 5 visible toasts — drop oldest if needed
      const next = [...prev, entry]
      return next.length > 5 ? next.slice(-5) : next
    })
    // Auto-dismiss
    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, DISMISS_MS)
    timersRef.current.set(id, timer)
  }, [])

  // Register the singleton push function
  useEffect(() => {
    pushToast = push
    return () => { pushToast = null }
  }, [push])

  // Global error listeners
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Don't toast benign/noisy errors
      if (event.message?.includes('ResizeObserver')) return
      // xterm.js internal timing race — renderService not ready yet (harmless)
      if (event.message?.includes("reading 'dimensions'")) return
      const { summary, suggestion, detail } = summarizeError(event.error || event.message)
      push(summary, suggestion, detail)
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      const { summary, suggestion, detail } = summarizeError(event.reason)
      push(summary, suggestion, detail)
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [push])

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="error-toast-container" role="alert" aria-live="assertive">
      {toasts.map((toast) => (
        <ErrorToast key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  )
}

// ── Individual toast ──

function ErrorToast({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  const [copied, setCopied] = useState(false)
  const [exiting, setExiting] = useState(false)

  const handleCopy = useCallback(() => {
    try {
      // Use Electron clipboard (works in all security contexts)
      if (window.api?.copyToClipboard) {
        window.api.copyToClipboard(toast.detail)
      } else {
        // Fallback: selection + execCommand
        const ta = document.createElement('textarea')
        ta.value = toast.detail
        ta.style.cssText = 'position:fixed;opacity:0;left:-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* silently fail */ }
  }, [toast.detail])

  const handleDismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 200)
  }, [onDismiss, toast.id])

  return (
    <div className={`error-toast ${exiting ? 'error-toast-exit' : ''}`}>
      <div className="error-toast-accent" />
      <div className="error-toast-body">
        <div className="error-toast-header">
          <span className="error-toast-icon">!</span>
          <span className="error-toast-title">ERROR</span>
          <button
            className="error-toast-close"
            onClick={handleDismiss}
            title="Dismiss"
            aria-label="Dismiss error"
          >
            x
          </button>
        </div>
        <div className="error-toast-summary">{toast.summary}</div>
        <div className="error-toast-suggestion">{toast.suggestion}</div>
        <div className="error-toast-actions">
          <button className="error-toast-copy" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy Error'}
          </button>
        </div>
      </div>
      <div className="error-toast-timer" />
    </div>
  )
}
