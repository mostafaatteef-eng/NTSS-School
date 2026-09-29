import React, { type ErrorInfo, type ReactNode } from 'react';

interface ModuleErrorBoundaryProps {
  children: ReactNode;
  moduleName: string;
  onReset?: () => void;
}

interface ModuleErrorBoundaryState {
  hasError: boolean;
  errorId: string | null;
}

const makeErrorId = () =>
  `module-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class ModuleErrorBoundary extends React.Component<
  ModuleErrorBoundaryProps,
  ModuleErrorBoundaryState
> {
  state: ModuleErrorBoundaryState = { hasError: false, errorId: null };

  static getDerivedStateFromError(): ModuleErrorBoundaryState {
    return { hasError: true, errorId: makeErrorId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[NTSS] Module render error', {
      module: this.props.moduleName,
      errorId: this.state.errorId,
      error,
      componentStack: info.componentStack,
    });
  }

  private reset = () => {
    this.setState({ hasError: false, errorId: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section
        dir="rtl"
        role="alert"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
      >
        <h2 className="font-bold">تعذر عرض {this.props.moduleName}</h2>
        <p className="mt-2 text-sm">
          حدث خطأ داخل هذه الوحدة فقط، وباقي النظام ما زال متاحًا. أعد المحاولة لإعادة تحميل الوحدة.
        </p>
        {this.state.errorId && (
          <p className="mt-2 text-xs opacity-70">
            رقم المرجع: <span dir="ltr">{this.state.errorId}</span>
          </p>
        )}
        <button
          type="button"
          onClick={this.reset}
          className="mt-4 rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white"
        >
          إعادة المحاولة
        </button>
      </section>
    );
  }
}