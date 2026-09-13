import React, { useState, useEffect } from 'react';
import {
  Shield,
  Calendar,
  Building,
  Users,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Printer,
  FileSpreadsheet,
  Clock,
} from 'lucide-react';
import {
  SupervisionAssignment,
  SupervisionLocation,
  Employee,
  ScheduleBreak,
} from '../../types';
import { timetableService } from '../../services/timetableService';
import { storageService } from '../../services/storageService';
import * as XLSX from 'xlsx';

export const SupervisionView: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [locations, setLocations] = useState<SupervisionLocation[]>([]);
  const [assignments, setAssignments] = useState<SupervisionAssignment[]>([]);
  const [teachers, setTeachers] = useState<Employee[]>([]);
  const [breaks, setBreaks] = useState<ScheduleBreak[]>([]);

  // Assign Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedShift, setSelectedShift] = useState<'MORNING' | 'BREAK_1' | 'BREAK_2' | 'DISMISSAL'>('BREAK_1');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = () => {
    const locs = timetableService.getSupervisionLocations();
    setLocations(locs);
    if (!selectedLocationId && locs.length > 0) {
      setSelectedLocationId(locs[0].id);
    }
    const staff = timetableService.getTeachingStaff();
    setTeachers(staff);
    if (!selectedTeacherId && staff.length > 0) {
      setSelectedTeacherId(staff[0].id);
    }
    const allAssignments = timetableService.getSupervisionAssignments();
    setAssignments(allAssignments);
    setBreaks(timetableService.getScheduleBreaks());
  };

  useEffect(() => {
    loadData();
  }, []);

  const d = new Date(selectedDate);
  const dayMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dayName = dayMap[d.getDay()] || 'الأحد';

  const dailyAssignments = assignments.filter(a => a.date === selectedDate);

  const SHIFT_NAMES: Record<string, { label: string; time: string }> = {
    MORNING: { label: 'طابور الصباح والاستقبال', time: '07:30 - 08:00' },
    BREAK_1: { label: 'الفسحة الأولى', time: '10:20 - 10:40' },
    BREAK_2: { label: 'الفسحة الثانية', time: '12:20 - 12:35' },
    DISMISSAL: { label: 'انصراف الطلاب والباصات', time: '14:30 - 15:00' },
  };

  const handleOpenAssignModal = (locationId?: string, shift?: any) => {
    if (locationId) setSelectedLocationId(locationId);
    if (shift) setSelectedShift(shift);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleSaveAssignment = () => {
    const teacher = teachers.find(t => t.id === selectedTeacherId);
    const loc = locations.find(l => l.id === selectedLocationId);
    if (!teacher || !loc) return;

    // Validate conflicts
    const shiftInfo = SHIFT_NAMES[selectedShift];
    const validation = timetableService.validateSupervisionConflict({
      teacherId: teacher.id,
      date: selectedDate,
      dayOfWeek: dayName,
      timeSlot: shiftInfo.time,
    });

    if (validation.hasConflict) {
      setErrorMessage(validation.reason || 'تعذر الإسناد لوجود تعارض في الموعد');
      return;
    }

    const assignment: SupervisionAssignment = {
      id: `SUP-${Date.now()}`,
      academicYear: '2024/2025',
      date: selectedDate,
      dayOfWeek: dayName,
      locationId: loc.id,
      locationName: loc.name,
      teacherId: teacher.id,
      teacherCode: teacher.teacherCode,
      teacherName: teacher.name,
      shift: selectedShift,
      timeSlot: shiftInfo.time,
      status: 'Scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    timetableService.saveSupervisionAssignment(assignment);
    setIsModalOpen(false);
    loadData();
  };

  const handleDeleteAssignment = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا التكليف بالإشراف؟')) {
      timetableService.deleteSupervisionAssignment(id);
      loadData();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const rows = dailyAssignments.map(a => ({
      التاريخ: a.date,
      اليوم: a.dayOfWeek,
      'الفترة / النوبة': SHIFT_NAMES[a.shift]?.label || a.shift,
      التوقيت: a.timeSlot,
      الموقع: a.locationName,
      'كود المعلم': a.teacherCode || '',
      'اسم المشرف': a.teacherName,
      الحالة: a.status,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'كشف الإشراف اليومي');
    XLSX.writeFile(wb, `كشف_الإشراف_اليومي_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            جدول الإشراف اليومي ونوبات المتابعة المدرسية
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            توزيع المعلمين على البوابات، الفناء، المعامل، والفسح مع منع تعارض أوقات الحصص والإشراف
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            تصدير Excel
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition"
          >
            <Printer className="w-4 h-4" />
            طباعة كشف اليوم
          </button>
        </div>
      </div>

      {/* Date Bar & New Assignment CTA */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-700">تاريخ الإشراف:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
            يوم {dayName}
          </span>
        </div>

        <button
          onClick={() => handleOpenAssignModal()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          إسناد مشرف لموقع جديد
        </button>
      </div>

      {/* Grid: Shifts and Locations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['MORNING', 'BREAK_1', 'BREAK_2', 'DISMISSAL'] as const).map(shift => {
          const shiftMeta = SHIFT_NAMES[shift];
          const shiftAssignments = dailyAssignments.filter(a => a.shift === shift);

          return (
            <div key={shift} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    {shiftMeta.label}
                  </h3>
                  <span className="text-[11px] font-mono text-slate-500">{shiftMeta.time}</span>
                </div>
                <span className="text-xs font-bold bg-white text-indigo-700 px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs">
                  {shiftAssignments.length} مشرفين
                </span>
              </div>

              <div className="p-4 divide-y divide-slate-100 flex-1">
                {shiftAssignments.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    لم يتم تكليف أي مشرفين لهذه النوبة اليوم
                  </div>
                ) : (
                  shiftAssignments.map(item => (
                    <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                          <span>{item.teacherName}</span>
                          <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                            {item.teacherCode}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3 text-slate-400" />
                          <span>الموقع: {item.locationName}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteAssignment(item.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Assign Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-600" />
                تكليف معلم بالإشراف
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg">
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex items-center gap-2 text-rose-800 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                {errorMessage}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">المعلم المشرف</label>
                <select
                  value={selectedTeacherId}
                  onChange={e => setSelectedTeacherId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                >
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.teacherCode || 'T-???'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">نوبة الإشراف</label>
                <select
                  value={selectedShift}
                  onChange={e => setSelectedShift(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                >
                  <option value="MORNING">طابور الصباح والاستقبال (07:30 - 08:00)</option>
                  <option value="BREAK_1">الفسحة الأولى (10:20 - 10:40)</option>
                  <option value="BREAK_2">الفسحة الثانية (12:20 - 12:35)</option>
                  <option value="DISMISSAL">انصراف الطلاب والباصات (14:30 - 15:00)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">موقع الإشراف</label>
                <select
                  value={selectedLocationId}
                  onChange={e => setSelectedLocationId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                >
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveAssignment}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm"
              >
                حفظ التكليف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
