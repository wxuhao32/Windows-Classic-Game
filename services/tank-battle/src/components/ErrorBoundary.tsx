import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-black flex items-center justify-center">
          <div className="text-white text-center" style={{ fontFamily: '"Press Start 2P", monospace' }}>
            <h1 className="text-red-500 mb-4" style={{ fontSize: 16 }}>ERROR</h1>
            <p style={{ fontSize: 10 }}>Something went wrong.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 border-2 border-white/40"
              style={{ fontSize: 10 }}
            >
              RELOAD
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
