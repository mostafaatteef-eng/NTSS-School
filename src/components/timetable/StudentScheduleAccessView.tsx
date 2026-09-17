import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Clock,
  GraduationCap,
  MapPin,
  Printer,
  RefreshCw,
  School,
  Search,
  BookOpen,
  Users
} from 'lucide-react';
import { PublicClassScheduleDTO, PublicClassScheduleLesson, SystemSettings } from '../../types';
import { storageService } from '../../services/storageService';

export const StudentScheduleAccessView: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings>(storageService.getSettings());
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedClassroom, setSelectedClassroom] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [scheduleData, setScheduleData] = useState<PublicClassScheduleDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const activeGrades = (settings.grades || []).filter(g => g.isActive !== false);
  const availableClassrooms = (settings.classrooms || []).filter(c => {
    if (c.isActive === false) return false;
    if (!selectedGrade) return true;
    return c.gradeId === selectedGrade || c.gradeName === selectedGrade;
  });

  useEffect(() => {
    if (activeGrades.length > 0 && !selectedGrade) {
      setSelectedGrade(activeGrades[0].name || activeGrades[0].id);
    }
  }, [activeGrades, selectedGrade]);

  useEffect(() => {
    if (availableClassrooms.length > 0 && !selectedClassroom) {
      setSelectedClassroom(availableClassrooms[0].displayName || availableClassrooms[0].id);
    }
  }, [availableClassrooms, selectedClassroom]);

  useEffect(() => {
    if (selectedGrade && selectedClassroom) {
      fetchClassSchedule();
    }
  }, [selectedGrade, selectedClassroom]);

  const fetchClassSchedule = async () => {
    if (!selectedGrade || !selectedClassroom) return;
    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await storageService.getPublicClassSchedule(selectedGrade, selectedClassroom);
      if (res.success && res.data) {
        setScheduleData(res.data);
      } else {
        setScheduleData({
          gradeName: selectedGrade,
          classroomName: selectedClassroom,
          schedule: [],
        });
        setErrorMessage(res.message || 'لا يوجد جدول منشور لهذا الفصل حالياً');
      }
    } catch {
      setErrorMessage('حدث خطأ أثناء تحميل جدول الفصل');
    } finally {
      setIsLoading(false);
    }
  };

  const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

  const lessonsGrid: Record<string, Record<number, PublicClassScheduleLesson>> = {};
  (scheduleData?.schedule || []).forEach(lesson => {
    const d = lesson.dayOfWeek;
    const p = lesson.periodNumber;
    if (!lessonsGrid[d]) lessonsGrid[d] = {};
    lessonsGrid[d][p] = lesson;
  });

  return (
    <div dir="rtl" className="space-y-6">
      {/* Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-teal-50 text-[#008e8b] rounded-xl">
              <School className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-slate-900">جدول الحصص الأسبوعي للفصول</h2>
            <span className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">
              عام (بدون تسجيل دخول • بدون كود طالب • بدون بيانات شخصية)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            عرض جدول الفصل الدراسي المنشور رسمياً للطلاب وأولياء الأمور مباشرة.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer print:hidden"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة الجدول</span>
        </button>
      </div>

      {/* Classroom Selection Filter */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              الصف الدراسي
            </label>
            <select
              value={selectedGrade}
              onChange={e => {
                setSelectedGrade(e.target.value);
                setSelectedClassroom('');
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#008e8b]"
            >
              {activeGrades.map(g => (
                <option key={g.id} value={g.name || g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              الفصل
            </label>
            <select
              value={selectedClassroom}
              onChange={e => setSelectedClassroom(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#008e8b]"
            >
              {availableClassrooms.map(c => (
                <option key={c.id} value={c.displayName || c.id}>
                  {c.displayName || c.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={fetchClassSchedule}
              disabled={isLoading}
              className="w-full py-2 px-4 bg-[#008e8b] hover:bg-[#007573] text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>تحديث الجدول</span>
            </button>
          </div>
        </div>
      </div>

      {/* Schedule Grid Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/75 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <CalendarDays className="w-4 h-4 text-[#008e8b]" />
            <span>جدول الحصص الرسمي: {selectedGrade} - فصل ({selectedClassroom})</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {scheduleData?.schedule?.length || 0} حصة معتمدة
          </span>
        </div>

        {errorMessage && (
          <div className="p-4 bg-amber-50 text-amber-800 text-xs font-medium border-b border-amber-200">
            {errorMessage}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs text-right">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-3 w-28 text-center border-l border-slate-200">اليوم / الحصة</th>
                {PERIODS.map(p => (
                  <th key={p} className="p-3 text-center border-l border-slate-200 last:border-none">
                    الحصة {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {DAYS.map(day => (
                <tr key={day} className="hover:bg-slate-50/50 transition">
                  <td className="p-3 font-bold text-slate-800 text-center bg-slate-50/80 border-l border-slate-200">
                    {day}
                  </td>
                  {PERIODS.map(period => {
                    const lesson = lessonsGrid[day]?.[period];
                    if (!lesson) {
                      return (
                        <td
                          key={period}
                          className="p-3 text-center text-slate-300 font-mono border-l border-slate-200 last:border-none"
                        >
                          -
                        </td>
                      );
                    }

                    return (
                      <td
                        key={period}
                        className="p-2.5 text-center border-l border-slate-200 last:border-none bg-teal-50/30"
                      >
                        <div className="font-bold text-slate-900 text-xs leading-tight">
                          {lesson.subjectName}
                        </div>
                        <div className="text-[10px] text-[#008e8b] font-medium mt-0.5">
                          {lesson.teacherDisplayName}
                        </div>
                        {lesson.roomName && (
                          <div className="text-[9px] text-slate-400 mt-0.5 font-mono">
                            {lesson.roomName}
                          </div>
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
    </div>
  );
};
