import React from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';

export const PageHeader: React.FC<{title:string;description?:string;icon?:React.ReactNode;actions?:React.ReactNode;meta?:React.ReactNode}> = ({title,description,icon,actions,meta}) => (
  <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">{icon}<h1 className="text-base font-bold text-slate-950 sm:text-lg">{title}</h1></div>
        {description && <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500 sm:text-sm">{description}</p>}
        {meta && <div className="mt-2 text-[11px] font-bold text-slate-500">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </header>
);

export const LoadingState: React.FC<{label?:string;rows?:number}> = ({label='جارٍ تحميل البيانات...',rows=4}) => (
  <div className="space-y-3 p-5" role="status" aria-live="polite" aria-label={label}>
    <span className="sr-only">{label}</span>
    {Array.from({length:rows},(_,i)=><div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}
  </div>
);

export const EmptyState: React.FC<{title:string;description?:string;action?:React.ReactNode;icon?:React.ReactNode}> = ({title,description,action,icon}) => (
  <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
    <span className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-500">{icon || <Inbox className="h-6 w-6" />}</span>
    <h3 className="font-bold text-slate-900">{title}</h3>
    {description && <p className="mt-1 max-w-md text-xs leading-6 text-slate-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{message:string;onRetry?:()=>void}> = ({message,onRetry}) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
    <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{message}</span>
    {onRetry && <button type="button" onClick={onRetry} className="rounded-lg px-2 py-1 font-bold underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-rose-500">إعادة المحاولة</button>}
  </div>
);

export const InlineLoading: React.FC<{label?:string}> = ({label='جارٍ التنفيذ...'}) => <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{label}</span>;
