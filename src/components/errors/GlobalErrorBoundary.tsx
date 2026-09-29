import React, { type ErrorInfo, type ReactNode } from 'react';

interface GlobalErrorBoundaryProps {
  children: ReactNode;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  requestId: string | null;
}

const createRequestId = () =>
  `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class GlobalErrorBoundary extends React.Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  declare props: Readonly<GlobalErrorBoundaryProps>;
  declare setState: (state: Partial<GlobalErrorBoundaryState>) => void;

  state: GlobalErrorBoundaryState = {
    hasError: false,
    requestId: null,
  };

  static getDerivedStateFromError(): GlobalErrorBoundaryState {
    return {
      hasError: true,
      requestId: createRequestId(),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the technical details in developer tooling without exposing them in the UI.
    console.error('[NTSS] Unhandled React render error', {
      requestId: this.state.requestId,
      error,
      componentStack: info.componentStack,
    });
  }

  private retry = () => {
    this.setState({ hasError: false, requestId: null });
  };

  private returnToDashboard = () => {
    try {
      sessionStorage.removeItem('ntss_active_tab');
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }
    window.location.hash = '#/dashboard';
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        dir="rtl"
        className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-900"
        role="alert"
      >
        <section className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h1 className="text-xl font-bold mb-2">تعذر عرض هذه الصفحة</h1>
          <p className="text-sm text-slate-600 mb-5">
            حدث خطأ غير متوقع أثناء عرض الشاشة. يمكنك إعادة المحاولة أو العودة إلى لوحة التحكم.
          </p>
          {this.state.requestId && (
            <p className="text-xs text-slate-500 mb-5">
              رقم المرجع: <span dir="ltr">{this.state.requestId}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.retry}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={this.returnToDashboard}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
            >
              العودة إلى لوحة التحكم
            </button>
          </div>
        </section>
      </main>
    );
  }
}