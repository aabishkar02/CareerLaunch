import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        fontFamily: 'var(--font-sans, sans-serif)',
      }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 13, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text3, #999)', marginBottom: 12 }}>
            Something went wrong
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12, color: 'var(--text1, #111)' }}>
            An unexpected error occurred
          </h1>
          <p style={{ color: 'var(--text2, #555)', marginBottom: 28, lineHeight: 1.6 }}>
            The page crashed. Try refreshing — if the problem persists, contact support.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: 'var(--accent, #1B3A6B)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Reload page
          </button>
          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              marginTop: 24,
              textAlign: 'left',
              background: '#fee',
              padding: 16,
              borderRadius: 6,
              fontSize: 11,
              overflowX: 'auto',
              color: '#900',
            }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      </div>
    )
  }
}
