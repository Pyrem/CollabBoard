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
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="max-w-[460px] px-9 py-8 bg-white rounded-xl shadow-md text-center">
          <h2 className="mb-2 text-xl font-bold text-gray-900">Something went wrong</h2>
          <p className="mb-4 text-sm leading-relaxed text-gray-600">
            {this.props.message ??
              'The board encountered a rendering error. Your data is safe \u2014 it\u2019s synced via the server.'}
          </p>
          {this.state.error && (
            <pre className="mb-5 px-3.5 py-2.5 text-xs text-red-800 bg-red-50 rounded-md overflow-x-auto text-left">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2.5 justify-center">
            <button
              onClick={this.handleReset}
              className="px-5 py-2 text-sm font-semibold border border-gray-300 rounded-lg bg-white text-gray-700 cursor-pointer hover:bg-gray-50"
            >
              Try again
            </button>
            <button
              onClick={this.handleReload}
              className="px-5 py-2 text-sm font-semibold border-none rounded-lg bg-blue-600 text-white cursor-pointer hover:bg-blue-700"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
