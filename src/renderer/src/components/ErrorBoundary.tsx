import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: `${error.message}\n\n${error.stack}` }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 32,
          color: '#e2e4f0',
          fontFamily: 'system-ui',
          maxWidth: 700,
          margin: '0 auto',
        }}>
          <h2 style={{ color: '#f87171', marginBottom: 16 }}>Something went wrong</h2>
          <pre style={{
            background: '#1a1d2e',
            padding: 16,
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            border: '1px solid #2a2d42',
          }}>{this.state.error}</pre>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: '' })
              window.location.reload()
            }}
            style={{
              marginTop: 16,
              padding: '10px 24px',
              background: '#8b7cf7',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
