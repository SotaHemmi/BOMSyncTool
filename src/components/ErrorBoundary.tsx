import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          margin: '20px',
          border: '2px solid #d95d5d',
          borderRadius: '8px',
          backgroundColor: '#ffe6e6'
        }}>
          <h2 style={{ color: '#d95d5d' }}>エラーが発生しました</h2>
          <p>アプリケーションでエラーが発生しました。ページをリロードしてください。</p>
          {this.state.error && (
            <details style={{ marginTop: '10px' }}>
              <summary>エラー詳細</summary>
              <pre style={{
                padding: '10px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px'
              }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '15px',
              padding: '8px 16px',
              backgroundColor: '#3f8fc0',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ページをリロード
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
