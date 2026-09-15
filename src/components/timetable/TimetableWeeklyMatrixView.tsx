import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Filter,
  Lock,
  Unlock,
  Printer,
  FileSpreadsheet,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  BookOpen,
  Users,
  Building,
  RefreshCw,
} from 'lucide-react';
import { Employee, ScheduleBreak, ScheduleItem, User } from '../../types';
import { storageService } from '../../services/storageService';
import { timetableService } from '../../services/timetableService';
import * as XLSX from 'xlsx';

interface TimetableWeeklyMatrixViewProps {
  currentUser?: User | null;
}

const DAYS_OF_WEEK = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const PERIOD_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

export const TimetableWeeklyMatrixView: React.FC<TimetableWeeklyMatrixViewProps> = ({ currentUser }) => {
  const [viewMode, setViewMode] = useState<'classroom' | 'teacher' | 'day' | 'room'>('classroom');
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [teachers, setTeachers] = useState<Employee[]>([]);
  const [breaks, setBreaks] = useState<ScheduleBreak[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string>('الصف الأول الثانوي');
  const [selectedClassroom, setSelectedClassroom] = useState<string>('1/1');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('الأحد');
  const [selectedRoom, setSelectedRoom] = useState<string>('معمل حاسب 1');
  const [cycleFilter, setCycleFilter] = useState<'ALL' | 'A' | 'B'>('ALL');

  // Edit / Add Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<ScheduleItem> | null>(null);
  const [conflictErrors, setConflictErrors] = useState<string[]>([]);
  const [conflictWarnings, setConflictWarnings] = useState<string[]>([]);

  const isAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'SchoolDirector';

  const loadData = () => {
    const items = storageService.getSchedule();
    setScheduleItems(items);
    const staff = timetableService.getTeachingStaff();
    setTeachers(staff);
    if (!selectedTeacherId && staff.length > 0) {
      setSelectedTeacherId(staff[0].id);
    }
    setBreaks(timetableService.getScheduleBreaks().filter(b => b.isActive));
  };

  useEffect(() => {
    loadData();
  }, []);

  // Distinct classrooms & rooms
  const availableClassrooms = Array.from(
    new Set(scheduleItems.map(s => s.classroom).filter(Boolean))
  );
  if (availableClassrooms.length === 0) {
    availableClassrooms.push('1/1', '1/2', '2/1', '2/2', '3/1');
  }

  const availableRooms = Array.from(
    new Set(scheduleItems.map(s => s.room || s.roomId).filter(Boolean))
  );
  if (availableRooms.length === 0) {
    availableRooms.push('معمل حاسب 1', 'معمل شبكات', 'ورشة إلكترونيات', 'قاعة 101', 'قاعة 102');
  }

  // Filter items based on current viewMode & selection
  const filteredItems = scheduleItems.filter(item => {
    if (item.isActive === false || item.isCancelled) return false;

    // Cycle filter
    if (cycleFilter !== 'ALL') {
      if (item.cycleWeek && item.cycleWeek !== 'ALL' && item.cycleWeek !== cycleFilter) {
        return false;
      }
    }

    if (viewMode === 'classroom') {
      return item.classroom === selectedClassroom;
    } else if (viewMode === 'teacher') {
      return item.teacherId === selectedTeacherId;
    } else if (viewMode === 'day') {
      return item.dayOfWeek === selectedDay || item.dayName === selectedDay;
    } else if (viewMode === 'room') {
      return (item.room || item.roomId) === selectedRoom;
    }
    return true;
  });

  const getItemAt = (day: string, periodNumber: number): ScheduleItem | undefined => {
    return filteredItems.find(
      item => (item.dayOfWeek === day || item.dayName === day) && item.periodNumber === periodNumber
    );
  };

  const handleOpenAdd = (day: string, periodNumber: number) => {
    const config = storageService.getScheduleConfig();
    const periodTime = config.periods?.find(p => p.periodNumber === periodNumber);

    setEditingItem({
      dayOfWeek: day,
      dayName: day,
      periodNumber,
      startTime: periodTime?.startTime || '08:00',
      endTime: periodTime?.endTime || '08:50',
      grade: selectedGrade,
      classroom: selectedClassroom,
      teacherId: selectedTeacherId || (teachers[0]?.id || ''),
      subject: 'العلوم التقنية التخصصية (نظري)',
      room: selectedRoom,
      cycleWeek: cycleFilter,
      isLocked: false,
    });
    setConflictErrors([]);
    setConflictWarnings([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: ScheduleItem) => {
    setEditingItem({ ...item });
    setConflictErrors([]);
    setConflictWarnings([]);
    setIsModalOpen(true);
  };

  const handleValidateAndSave = () => {
    if (!editingItem) return;

    const teacher = teachers.find(t => t.id === editingItem.teacherId);
    const itemToSave: ScheduleItem = {
      id: editingItem.id || `SCH-${Date.now()}`,
      grade: editingItem.grade || selectedGrade,
      classroom: editingItem.classroom || selectedClassroom,
      dayOfWeek: editingItem.dayOfWeek || 'الأحد',
      dayName: editingItem.dayOfWeek || 'الأحد',
      periodNumber: Number(editingItem.periodNumber) || 1,
      startTime: editingItem.startTime || '08:00',
      endTime: editingItem.endTime || '08:50',
      subject: editingItem.subject || 'مادة دراسية',
      teacherId: editingItem.teacherId || '',
      teacherName: teacher?.name || editingItem.teacherName || 'معلم',
      teacherCode: teacher?.teacherCode || editingItem.teacherCode,
      room: editingItem.room,
      cycleWeek: editingItem.cycleWeek || 'ALL',
      isLocked: Boolean(editingItem.isLocked),
      isActive: true,
      isCancelled: false,
    };

    // Run conflict validation
    const validation = timetableService.validateScheduleConflicts(itemToSave, scheduleItems, {
      ignoreSelfId: editingItem.id,
    });

    if (validation.hasConflict) {
      setConflictErrors(validation.conflicts);
      setConflictWarnings(validation.warnings);
      return;
    }

    // Save to storage
    const saveRes = storageService.saveScheduleItem(itemToSave);
    if (!saveRes.success) {
      alert(saveRes.message || 'فشل حفظ الحصة في الجدول');
      return;
    }
    setIsModalOpen(false);
    setEditingItem(null);
    loadData();
  };

  const handleToggleLock = (item: ScheduleItem) => {
    const updated = { ...item, isLocked: !item.isLocked };
    const lockRes = storageService.saveScheduleItem(updated);
    if (!lockRes.success) {
      alert(lockRes.message || 'فشل تعديل حالة إغلاق الحصة');
      return;
    }
    loadData();
  };

  const handleDeleteItem = (id: string) => {
    if (confirm('هل أنت متأكد من رغبتك في حذف هذه الحصة من الجدول؟')) {
      const delRes = storageService.deleteScheduleItem(id);
      if (!delRes.success) {
        alert(delRes.message || 'فشل حذف الحصة من الجدول');
        return;
      }
      loadData();
    }
  };

  const handleExportExcel = () => {
    const rows = filteredItems.map(item => ({
      اليوم: item.dayOfWeek,
      الحصة: item.periodNumber,
      الفصل: item.classroom,
      الصف: item.grade,
      المادة: item.subject,
      المعلم: item.teacherName,
      'كود المعلم': item.teacherCode || '',
      القاعة: item.room || '',
      'أسبوع الخطة': item.cycleWeek || 'ALL',
      مغلق: item.isLocked ? 'نعم' : 'لا',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الجدول المدرسي');
    XLSX.writeFile(wb, `الجدول_المدرسي_${viewMode}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-indigo-600" />
            الجدول المدرسي الأسبوعي
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            استعراض وتعديل الحصص الأسبوعية، كشف التعارضات، وإدارة القاعات والأنصبة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Selector */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('classroom')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'classroom' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              حسب الفصل
            </button>
            <button
              onClick={() => setViewMode('teacher')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'teacher' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              حسب المعلم
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'day' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              حسب اليوم
            </button>
            <button
              onClick={() => setViewMode('room')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'room' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              حسب القاعة
            </button>
          </div>

          {/* Week Cycle A/B filter */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setCycleFilter('ALL')}
              className={`px-2.5 py-1.5 rounded-lg ${cycleFilter === 'ALL' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
            >
              كل الأسابيع
            </button>
            <button
              onClick={() => setCycleFilter('A')}
              className={`px-2.5 py-1.5 rounded-lg ${cycleFilter === 'A' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
            >
              أسبوع أ
            </button>
            <button
              onClick={() => setCycleFilter('B')}
              className={`px-2.5 py-1.5 rounded-lg ${cycleFilter === 'B' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
            >
              أسبوع ب
            </button>
          </div>

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
            طباعة
          </button>
        </div>
      </div>

      {/* Target Selector Bar */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap items-center gap-4 text-sm">
        {viewMode === 'classroom' && (
          <>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">الصف الدراسي:</span>
              <select
                value={selectedGrade}
                onChange={e => setSelectedGrade(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500"
              >
                <option value="الصف الأول الثانوي">الصف الأول الثانوي</option>
                <option value="الصف الثاني الثانوي">الصف الثاني الثانوي</option>
                <option value="الصف الثالث الثانوي">الصف الثالث الثانوي</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">الفصل:</span>
              <select
                value={selectedClassroom}
                onChange={e => setSelectedClassroom(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500"
              >
                {availableClassrooms.map(c => (
                  <option key={c} value={c}>
                    فصل {c}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {viewMode === 'teacher' && (
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">المعلم:</span>
            <select
              value={selectedTeacherId}
              onChange={e => setSelectedTeacherId(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 min-w-[220px]"
            >
              {teachers.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.teacherCode || 'T-???'})
                </option>
              ))}
            </select>
          </div>
        )}

        {viewMode === 'day' && (
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">اليوم:</span>
            <select
              value={selectedDay}
              onChange={e => setSelectedDay(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500"
            >
              {DAYS_OF_WEEK.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {viewMode === 'room' && (
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">القاعة / المعمل:</span>
            <select
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 min-w-[180px]"
            >
              {availableRooms.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Break Banner Info */}
        <div className="mr-auto flex items-center gap-3 text-xs text-slate-500">
          {breaks.map(b => (
            <span key={b.id} className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 px-2.5 py-1 rounded-md border border-amber-200">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              {b.name}: {b.startTime} - {b.endTime}
            </span>
          ))}
        </div>
      </div>

      {/* Main Timetable Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700">
                <th className="p-3 w-28 text-right pr-4 border-l border-slate-200">اليوم / الحصة</th>
                {PERIOD_NUMBERS.map(p => (
                  <th key={p} className="p-3 border-l border-slate-200 min-w-[130px]">
                    الحصة {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {DAYS_OF_WEEK.map(day => (
                <tr key={day} className="hover:bg-slate-50/50 transition">
                  <td className="p-3 font-bold text-slate-800 bg-slate-50 text-right pr-4 border-l border-slate-200">
                    {day}
                  </td>
                  {PERIOD_NUMBERS.map(period => {
                    const item = getItemAt(day, period);
                    const isBreakAfter = period === 3; // First break after period 3

                    return (
                      <td key={period} className="p-2 border-l border-slate-200 align-top relative group">
                        {item ? (
                          <div
                            className={`p-2.5 rounded-xl border text-right text-xs transition relative ${
                              item.isLocked
                                ? 'bg-amber-50/70 border-amber-300'
                                : 'bg-indigo-50/60 border-indigo-200 hover:border-indigo-400'
                            }`}
                          >
                            <div className="font-bold text-slate-800 line-clamp-1 mb-1">{item.subject}</div>

                            {viewMode !== 'teacher' && (
                              <div className="text-slate-600 flex items-center gap-1">
                                <Users className="w-3 h-3 text-slate-400" />
                                <span className="truncate">{item.teacherName}</span>
                                {item.teacherCode && (
                                  <span className="bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded text-[10px] font-mono">
                                    {item.teacherCode}
                                  </span>
                                )}
                              </div>
                            )}

                            {viewMode !== 'classroom' && (
                              <div className="text-slate-600 flex items-center gap-1 mt-0.5">
                                <BookOpen className="w-3 h-3 text-slate-400" />
                                <span>فصل {item.classroom}</span>
                              </div>
                            )}

                            {item.room && (
                              <div className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                                <Building className="w-3 h-3 text-slate-400" />
                                <span className="truncate">{item.room}</span>
                              </div>
                            )}

                            {item.cycleWeek && item.cycleWeek !== 'ALL' && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">
                                أسبوع {item.cycleWeek}
                              </span>
                            )}

                            {/* Action overlay on hover */}
                            {isAdmin && (
                              <div className="absolute top-1 left-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-0.5 rounded shadow-sm">
                                <button
                                  onClick={() => handleToggleLock(item)}
                                  title={item.isLocked ? 'إلغاء قفل الحصة' : 'قفل الحصة لمنع التعديل'}
                                  className="text-slate-500 hover:text-amber-600 p-0.5"
                                >
                                  {item.isLocked ? <Lock className="w-3.5 h-3.5 text-amber-600" /> : <Unlock className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => handleOpenEdit(item)}
                                  title="تعديل الحصة"
                                  className="text-slate-500 hover:text-indigo-600 p-0.5"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  title="حذف الحصة"
                                  className="text-slate-500 hover:text-rose-600 p-0.5"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          isAdmin && (
                            <button
                              onClick={() => handleOpenAdd(day, period)}
                              className="w-full h-full min-h-[70px] border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 transition group/btn"
                            >
                              <Plus className="w-4 h-4 group-hover/btn:scale-110 transition" />
                              <span className="text-[10px] mt-0.5">إضافة</span>
                            </button>
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Add Modal */}
      {isModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                {editingItem.id ? 'تعديل حصة دراسية' : 'إضافة حصة دراسية جديدة'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg">
                ✕
              </button>
            </div>

            {/* Error alerts */}
            {conflictErrors.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  تعذر الحفظ لوجود تعارضات:
                </div>
                {conflictErrors.map((err, i) => (
                  <p key={i} className="text-xs text-rose-700 mr-5">
                    • {err}
                  </p>
                ))}
              </div>
            )}

            {conflictWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  تنبيهات:
                </div>
                {conflictWarnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700 mr-5">
                    • {w}
                  </p>
                ))}
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اليوم</label>
                  <select
                    value={editingItem.dayOfWeek}
                    onChange={e => setEditingItem({ ...editingItem, dayOfWeek: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  >
                    {DAYS_OF_WEEK.map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الحصة</label>
                  <select
                    value={editingItem.periodNumber}
                    onChange={e => setEditingItem({ ...editingItem, periodNumber: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  >
                    {PERIOD_NUMBERS.map(p => (
                      <option key={p} value={p}>
                        الحصة {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الصف الدراسي</label>
                  <input
                    type="text"
                    value={editingItem.grade || ''}
                    onChange={e => setEditingItem({ ...editingItem, grade: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الفصل</label>
                  <input
                    type="text"
                    value={editingItem.classroom || ''}
                    onChange={e => setEditingItem({ ...editingItem, classroom: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">المادة الدراسية</label>
                <input
                  type="text"
                  value={editingItem.subject || ''}
                  onChange={e => setEditingItem({ ...editingItem, subject: e.target.value })}
                  placeholder="مثال: العلوم التقنية التخصصية (نظري)"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">المعلم</label>
                <select
                  value={editingItem.teacherId || ''}
                  onChange={e => setEditingItem({ ...editingItem, teacherId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                >
                  <option value="">اختر المعلم...</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.teacherCode || 'T-???'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">القاعة / المعمل</label>
                  <input
                    type="text"
                    value={editingItem.room || ''}
                    onChange={e => setEditingItem({ ...editingItem, room: e.target.value })}
                    placeholder="معمل حاسب 1"
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">أسبوع الخطة (دورة أسبوعين)</label>
                  <select
                    value={editingItem.cycleWeek || 'ALL'}
                    onChange={e => setEditingItem({ ...editingItem, cycleWeek: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  >
                    <option value="ALL">أسبوعي (كل الأسابيع)</option>
                    <option value="A">أسبوع أ فقط (Week A)</option>
                    <option value="B">أسبوع ب فقط (Week B)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="lockCheckbox"
                  checked={Boolean(editingItem.isLocked)}
                  onChange={e => setEditingItem({ ...editingItem, isLocked: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <label htmlFor="lockCheckbox" className="text-xs font-medium text-slate-700">
                  قفل الحصة لمنع التعديل التلقائي أو استبدالها أثناء إعادة التوزيع
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg"
              >
                إلغاء
              </button>
              <button
                onClick={handleValidateAndSave}
                className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm"
              >
                حفظ الحصة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
