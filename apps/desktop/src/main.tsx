import { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: Error) {
    return { error: err?.message || 'UI error' };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#1c140f',
            color: '#fff',
            padding: 32,
            fontFamily: 'system-ui',
          }}
        >
          <h1 style={{ color: '#f97316' }}>UI error after process</h1>
          <p style={{ opacity: 0.7, marginTop: 8 }}>{this.state.error}</p>
          <p style={{ opacity: 0.5, marginTop: 16, fontSize: 14 }}>
            Your file was still saved. Check the console for the component stack.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 24,
              padding: '12px 20px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(to right, #f97316, #c084fc)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Recover UI
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);