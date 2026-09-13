import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Save,
  Shield,
} from 'lucide-react';
import { TeacherLoadPolicy, ScheduleBreak, ScheduleConfig } from '../../types';
import { timetableService } from '../../services/timetableService';
import { storageService } from '../../services/storageService';

export const TimetableSettingsView: React.FC = () => {
  const [policy, setPolicy] = useState<TeacherLoadPolicy>(timetableService.getTeacherLoadPolicy());
  const [breaks, setBreaks] = useState<ScheduleBreak[]>(timetableService.getScheduleBreaks());
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>(storageService.getScheduleConfig());
  const [isSaved, setIsSaved] = useState(false);

  // New break state
  const [newBreakName, setNewBreakName] = useState('');
  const [newBreakStart, setNewBreakStart] = useState('10:20');
  const [newBreakEnd, setNewBreakEnd] = useState('10:40');

  useEffect(() => {
    setPolicy(timetableService.getTeacherLoadPolicy());
    setBreaks(timetableService.getScheduleBreaks());
    setScheduleConfig(storageService.getScheduleConfig());
  }, []);

  const handleSavePolicy = () => {
    timetableService.saveTeacherLoadPolicy(policy);
    timetableService.saveScheduleBreaks(breaks);
    storageService.saveScheduleConfig(scheduleConfig);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleAddBreak = () => {
    if (!newBreakName.trim()) return;
    const item: ScheduleBreak = {
      id: `BRK-${Date.now()}`,
      name: newBreakName.trim(),
      startTime: newBreakStart,
      endTime: newBreakEnd,
      sortOrder: breaks.length + 1,
      isActive: true,
    };
    setBreaks([...breaks, item]);
    setNewBreakName('');
  };

  const handleDeleteBreak = (id: string) => {
    setBreaks(breaks.filter(b => b.id !== id));
  };

  const handleUpdatePeriodTime = (index: number, field: 'startTime' | 'endTime', value: string) => {
    const updatedPeriods = [...(scheduleConfig.periods || [])];
    if (updatedPeriods[index]) {
      updatedPeriods[index] = { ...updatedPeriods[index], [field]: value };
      setScheduleConfig({ ...scheduleConfig, periods: updatedPeriods });
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-indigo-600" />
            إعدادات الجدول وسقف الأنصبة القانونية
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            ضبط معادلة ساعات العمل القانونية (25 ساعة = 1500 دقيقة)، مواعيد الحصص والفسح، وقواعد الاحتياطي
          </p>
        </div>

        <button
          onClick={handleSavePolicy}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition"
        >
          <Save className="w-4 h-4" />
          حفظ التعديلات
        </button>
      </div>

      {isSaved && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center gap-3 text-emerald-800 text-xs font-bold">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          تم حفظ إعدادات الجدول والأنصبة بنجاح وتحديث كافة الحسابات
        </div>
      )}

      {/* Grid: Policy & Breaks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: 25h / 50m = 30 periods Policy */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-3">
            <Clock className="w-4 h-4 text-indigo-600" />
            سياسة سقف نصاب المعلم القانوني
          </h3>

          <div className="bg-indigo-50/70 border border-indigo-200 p-3.5 rounded-xl text-xs text-indigo-900 space-y-1">
            <div className="font-bold">المعادلة المعتمدة بالمشروع:</div>
            <div>
              25 ساعة عمل أسبوعياً = <strong>1500 دقيقة</strong>. وبحساب زمن الحصة <strong>50 دقيقة</strong> ينتج الحد
              الأقصى الأسبوعي للنصاب وهو <strong>30 حصة أسبوعياً</strong>.
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">ساعات العمل الأسبوعية</label>
                <input
                  type="number"
                  value={policy.weeklyWorkingHours}
                  onChange={e => setPolicy({ ...policy, weeklyWorkingHours: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">زمن الحصة الأساسي (دقائق)</label>
                <input
                  type="number"
                  value={policy.periodDurationMinutes}
                  onChange={e => {
                    const dur = Number(e.target.value) || 50;
                    const maxP = Math.floor((policy.weeklyWorkingHours * 60) / dur);
                    setPolicy({ ...policy, periodDurationMinutes: dur, maxWeeklyPeriods: maxP });
                  }}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                الحد الأقصى للنصاب الأسبوعي للمعلم (حصص)
              </label>
              <input
                type="number"
                value={policy.maxWeeklyPeriods}
                onChange={e => setPolicy({ ...policy, maxWeeklyPeriods: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold text-indigo-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">أقصى احتياطي باليوم</label>
                <input
                  type="number"
                  value={policy.maxReservePerDay}
                  onChange={e => setPolicy({ ...policy, maxReservePerDay: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">أقصى احتياطي بالأسبوع</label>
                <input
                  type="number"
                  value={policy.maxReservePerWeek}
                  onChange={e => setPolicy({ ...policy, maxReservePerWeek: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policy.includeReserveInTotalLoad}
                  onChange={e => setPolicy({ ...policy, includeReserveInTotalLoad: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="font-semibold text-slate-700">
                  احتساب حصص الاحتياطي الفعلية ضمن إجمالي نصاب المعلم الأسبوعي
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policy.includeSupervisionInLoad}
                  onChange={e => setPolicy({ ...policy, includeSupervisionInLoad: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="font-semibold text-slate-700">
                  احتساب نوبات الإشراف المدرسي ضمن نصاب المعلم
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Section 2: School Breaks */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-3">
            <Clock className="w-4 h-4 text-indigo-600" />
            فترات الفسح المدرسية (ممنوع الحصص أثناءها)
          </h3>

          <div className="space-y-2.5">
            {breaks.map(b => (
              <div
                key={b.id}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900">{b.name}</div>
                  <div className="text-slate-500 font-mono mt-0.5">
                    {b.startTime} - {b.endTime}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteBreak(b.id)}
                  className="text-slate-400 hover:text-rose-600 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Add Break */}
          <div className="border-t pt-3 space-y-2 text-xs">
            <div className="font-bold text-slate-700">إضافة فترة فسحة جديدة:</div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="اسم الفسحة"
                value={newBreakName}
                onChange={e => setNewBreakName(e.target.value)}
                className="border border-slate-300 rounded-lg p-2"
              />
              <input
                type="time"
                value={newBreakStart}
                onChange={e => setNewBreakStart(e.target.value)}
                className="border border-slate-300 rounded-lg p-2"
              />
              <input
                type="time"
                value={newBreakEnd}
                onChange={e => setNewBreakEnd(e.target.value)}
                className="border border-slate-300 rounded-lg p-2"
              />
            </div>
            <button
              onClick={handleAddBreak}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition"
            >
              + إضافة الفسحة
            </button>
          </div>
        </div>
      </div>

      {/* Section 3: Periods Timing */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-3">
          <Clock className="w-4 h-4 text-indigo-600" />
          توقيتات الحصص الدراسية (الحصة 1 إلى 8)
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {(scheduleConfig.periods || []).map((p, idx) => (
            <div key={p.periodNumber} className="p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-1.5">
              <div className="font-bold text-slate-900">الحصة {p.periodNumber}</div>
              <div className="space-y-1">
                <div>
                  <span className="text-[10px] text-slate-500 block">البدء</span>
                  <input
                    type="time"
                    value={p.startTime}
                    onChange={e => handleUpdatePeriodTime(idx, 'startTime', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded p-1 text-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">الانتهاء</span>
                  <input
                    type="time"
                    value={p.endTime}
                    onChange={e => handleUpdatePeriodTime(idx, 'endTime', e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded p-1 text-xs"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
