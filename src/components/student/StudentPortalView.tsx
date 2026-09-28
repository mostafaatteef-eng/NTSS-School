import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, GraduationCap, LogOut, UserRound, XCircle } from 'lucide-react';
import { User } from '../../types';
import { storageService } from '../../services/storageService';

interface Props { currentUser: User; onLogout: () => void; }
interface PortalData {
  student: { id:string; student_code?:string; full_name:string; grade?:string; classroom?:string; section?:string; status?:string };
  attendance: Array<{ attendance_date:string; status:string }>;
  attendanceSummary: { total:number; present:number; absent:number; late:number };
}

export const StudentPortalView: React.FC<Props> = ({ currentUser, onLogout }) => {
  const [data,setData]=useState<PortalData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{ let active=true; (async()=>{
    try {
      const response=await storageService.requestCurrentStudentPortal();
      if(active) setData(response);
    } catch { if(active) setError('تعذر تحميل بيانات الطالب. حاول مرة أخرى.'); }
    finally { if(active) setLoading(false); }
  })(); return()=>{active=false}; },[]);
  if(loading) return <div dir="rtl" className="min-h-screen bg-slate-50 grid place-items-center"><div className="text-sm font-bold text-slate-600">جارٍ تحميل بياناتك...</div></div>;
  if(error||!data) return <div dir="rtl" className="min-h-screen bg-slate-50 grid place-items-center p-4"><div className="max-w-md w-full rounded-3xl bg-white border p-6 text-center"><p className="text-rose-700 font-bold">{error||'لا توجد بيانات متاحة.'}</p><button onClick={onLogout} className="mt-4 text-sm font-bold text-slate-600">تسجيل الخروج</button></div></div>;
  const s=data.student, m=data.attendanceSummary;
  const pct=m.total ? Math.round((m.present/m.total)*100) : 0;
  const cards=[
    {label:'أيام الحضور',value:m.present,icon:CheckCircle2},
    {label:'الغياب',value:m.absent,icon:XCircle},
    {label:'التأخير',value:m.late,icon:Clock3},
    {label:'نسبة الحضور',value:`${pct}%`,icon:CalendarDays},
  ];
  return <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur"><div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
      <div><div className="text-xs font-bold text-[#008e8b]">بوابة الطالب</div><div className="font-black">{s.full_name}</div></div>
      <button onClick={onLogout} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><LogOut className="h-4 w-4"/>خروج</button>
    </div></header>
    <main className="mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      <section className="rounded-3xl bg-white border p-5">
        <div className="flex gap-4 items-center"><div className="h-12 w-12 rounded-2xl bg-[#008e8b]/10 text-[#008e8b] grid place-items-center"><UserRound/></div>
          <div><h1 className="text-lg font-black">{s.full_name}</h1><p className="text-xs text-slate-500 mt-1">كود الطالب: {s.student_code||currentUser.studentCode||'—'} · {s.grade||'—'} · فصل {s.classroom||'—'}</p></div>
        </div>
      </section>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">{cards.map(({label,value,icon:Icon})=><div key={label} className="rounded-2xl bg-white border p-4"><Icon className="h-5 w-5 text-[#008e8b]"/><div className="mt-3 text-2xl font-black">{value}</div><div className="text-xs text-slate-500 mt-1">{label}</div></div>)}</section>
      <section className="rounded-3xl bg-white border overflow-hidden"><div className="p-4 border-b"><h2 className="font-black">آخر سجلات الحضور</h2></div>
        <div className="divide-y">{data.attendance.length?data.attendance.slice(0,30).map((r,i)=><div key={i} className="px-4 py-3 flex justify-between text-sm"><span>{new Date(r.attendance_date).toLocaleDateString('ar-EG')}</span><span className="font-bold">{r.status}</span></div>):<div className="p-8 text-center text-sm text-slate-400">لا توجد سجلات حضور حتى الآن.</div>}</div>
      </section>
      <section className="rounded-3xl border border-dashed p-5 text-center text-sm text-slate-500"><GraduationCap className="mx-auto mb-2 text-[#008e8b]"/>النتائج والمخالفات ستظهر هنا فقط عند توفرها ونشرها من المدرسة.</section>
    </main>
  </div>;
};
