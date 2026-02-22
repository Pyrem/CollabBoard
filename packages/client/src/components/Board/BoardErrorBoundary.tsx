import { Component } from 'react';

interface Props {
  children: React.ReactNode;
  /** Fallback description shown below the heading. */
  message?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class BoardErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[BoardErrorBoundary]', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.heading}>Something went wrong</h2>
          <p style={styles.message}>
            {this.props.message ??
              'The board encountered a rendering error. Your data is safe — it\u2019s synced via the server.'}
          </p>
          {this.state.error && (
            <pre style={styles.detail}>{this.state.error.message}</pre>
          )}
          <div style={styles.actions}>
            <button onClick={this.handleReset} style={styles.secondaryBtn}>
              Try again
            </button>
            <button onClick={this.handleReload} style={styles.primaryBtn}>
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#f5f5f5',
  },
  card: {
    maxWidth: 460,
    padding: '32px 36px',
    backgroundColor: '#fff',
    borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    textAlign: 'center' as const,
  },
  heading: {
    margin: '0 0 8px',
    fontSize: 20,
    fontWeight: 700,
    color: '#1a1a1a',
  },
  message: {
    margin: '0 0 16px',
    fontSize: 14,
    lineHeight: 1.5,
    color: '#555',
  },
  detail: {
    margin: '0 0 20px',
    padding: '10px 14px',
    fontSize: 12,
    color: '#b71c1c',
    backgroundColor: '#fdecea',
    borderRadius: 6,
    overflowX: 'auto' as const,
    textAlign: 'left' as const,
  },
  actions: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
  },
  primaryBtn: {
    padding: '8px 20px',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    backgroundColor: '#1976d2',
    color: '#fff',
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '8px 20px',
    fontSize: 14,
    fontWeight: 600,
    border: '1px solid #ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    color: '#333',
    cursor: 'pointer',
  },
};
