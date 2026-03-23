import { Component, ReactNode } from 'react'

// ── Reusable fallback UI (can be used standalone or via ErrorBoundary) ──

interface FallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="error-fallback">
      <h2 className="error-fallback-title">Something went wrong</h2>
      <pre className="error-fallback-pre">{error.message}</pre>
      <button className="error-fallback-btn" onClick={resetErrorBoundary}>
        Try Again
      </button>
    </div>
  )
}

// ── Class-based ErrorBoundary (no external dependency) ──

interface Props {
  children: ReactNode
  /** Optional fallback override — receives error + reset fn */
  fallback?: (props: FallbackProps) => ReactNode
  /** Called when the boundary catches an error (for logging) */
  onError?: (error: Error, info: { componentStack: string }) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
    this.resetErrorBoundary = this.resetErrorBoundary.bind(this)
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.props.onError?.(error, info)
    console.error('[ErrorBoundary] Caught error:', error, info)
  }

  resetErrorBoundary() {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const error = this.state.error
      const reset = this.resetErrorBoundary

      if (this.props.fallback) {
        return this.props.fallback({ error, resetErrorBoundary: reset })
      }

      return <ErrorFallback error={error} resetErrorBoundary={reset} />
    }

    return this.props.children
  }
}
