import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ChromaCanvas crashed:', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-screen w-screen bg-[#0f0f11] text-zinc-200 flex items-center justify-center p-8">
        <div className="max-w-lg w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
          <div className="text-4xl">🎬💥</div>
          <h1 className="text-xl font-bold text-white">Something went wrong</h1>
          <p className="text-sm text-zinc-400">
            ChromaCanvas hit an unexpected error. Your project autosaves to this browser, so
            reloading should pick up where you left off.
          </p>
          <pre className="text-left text-[11px] text-red-400/80 bg-black/60 border border-zinc-800 rounded-lg p-3 overflow-auto max-h-32">
            {this.state.error.message}
          </pre>
          <button
            className="px-5 py-2.5 bg-white text-black text-sm font-bold rounded-lg hover:bg-zinc-200"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}
