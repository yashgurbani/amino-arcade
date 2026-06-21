import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class BootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Amino Arcade render failed', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#08060f',
        color: '#f3f0ff',
        fontFamily: 'JetBrains Mono, Consolas, monospace'
      }}>
        <section style={{
          maxWidth: 720,
          border: '1px solid #ff4fd8',
          borderRadius: 12,
          background: '#13102a',
          padding: 24,
          boxShadow: '0 24px 80px rgba(0,0,0,.45)'
        }}>
          <h1 style={{ margin: '0 0 10px', fontSize: 20 }}>AMINO ARCADE failed to render</h1>
          <p style={{ margin: '0 0 14px', color: '#cabbf0', lineHeight: 1.5 }}>
            The app caught a startup error instead of leaving a blank screen.
          </p>
          <pre style={{
            whiteSpace: 'pre-wrap',
            margin: 0,
            color: '#ffb347',
            fontSize: 12,
            lineHeight: 1.5
          }}>{this.state.error?.message || String(this.state.error)}</pre>
        </section>
      </main>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>
  </StrictMode>,
)
