import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/**
 * Last line of defence: if a page throws while rendering, show a calm message instead of a blank
 * screen. Only the error type is logged, never the data being shown (it may include payment labels).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error('SubSave render error:', error.name);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md rounded-2xl border border-paper-line bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This page hit an unexpected problem. Your saved data is safe. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          Reload SubSave
        </button>
      </div>
    );
  }
}
