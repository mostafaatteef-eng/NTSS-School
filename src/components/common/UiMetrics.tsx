import React from 'react';

export const StatCard: React.FC<{
  label:string;
  value:React.ReactNode;
  helper?:React.ReactNode;
  icon?:React.ReactNode;
  tone?:'neutral'|'success'|'warning'|'danger'|'info';
}> = ({label,value,helper,icon,tone='neutral'}) => {
  const tones={neutral:'text-slate-950',success:'text-emerald-700',warning:'text-amber-700',danger:'text-rose-700',info:'text-[#007b78]'};
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-slate-500">{label}</span>{icon && <span className="text-slate-400">{icon}</span>}</div>
    <div className={`mt-2 text-2xl font-black tabular-nums ${tones[tone]}`}>{value}</div>
    {helper && <div className="mt-1 text-[11px] font-medium leading-5 text-slate-500">{helper}</div>}
  </div>;
};

export const SectionHeader: React.FC<{title:string;icon?:React.ReactNode;action?:React.ReactNode;description?:string}> = ({title,icon,action,description}) => <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
  <div><div className="flex items-center gap-2 text-sm font-bold text-slate-900">{icon}{title}</div>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div>
  {action}
</div>;
