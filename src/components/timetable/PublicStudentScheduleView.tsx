import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  Clock,
  Download,
  GraduationCap,
  MapPin,
  Printer,
  RefreshCw,
  School,
  Search,
  UserCheck,
  AlertCircle,
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { PublicClassScheduleDTO, PublicClassScheduleLesson, SystemSettings } from '../../types';
import { storageService } from '../../services/storageService';
import { NTSSLogo } from '../common/NTSSLogo';

interface PublicStudentScheduleViewProps {
  onBackToLogin?: () => void;
}

export const PublicStudentScheduleView: React.FC<PublicStudentScheduleViewProps> = ({ onBackToLogin }) => {
  const [settings, setSettings] = useState<SystemSettings>(storageService.getSettings());
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedClassroom, setSelectedClassroom] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [scheduleData, setScheduleData] = useState<PublicClassScheduleDTO | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [hasQueried, setHasQueried] = useState<boolean>(false);

  // Load available grades and classrooms from settings
  const activeGrades = (settings.grades || []).filter(g => g.isActive !== false);
  const availableClassrooms = (settings.classrooms || []).filter(c => {
    if (c.isActive === false) return false;
    if (!selectedGrade) return true;
    return c.gradeId === selectedGrade || c.gradeName === selectedGrade;
  });

  // Default selection on load
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

  const handleFetchSchedule = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedGrade || !selectedClassroom) {
      setErrorMessage('يرجى اختيار الصف الدراسي والفصل');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);
    setHasQueried(true);

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
        setErrorMessage(res.message || 'تعذر تحميل الجدول الدراسي');
      }
    } catch (err: any) {
      setErrorMessage('حدث خطأ أثناء تحميل جدول الفصل، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

  // Group lessons by Day and Period for the grid view
  const lessonsGrid: Record<string, Record<number, PublicClassScheduleLesson>> = {};
  (scheduleData?.schedule || []).forEach(lesson => {
    const d = lesson.dayOfWeek;
    const p = lesson.periodNumber;
    if (!lessonsGrid[d]) lessonsGrid[d] = {};
    lessonsGrid[d][p] = lesson;
  });

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16 selection:bg-[#008e8b]/20 selection:text-[#008e8b]">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <NTSSLogo className="w-10 h-10 object-contain" />
            <div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span>بوابة جدول الطلاب والفصول</span>
                <span className="text-[10px] font-medium bg-teal-50 text-[#008e8b] border border-teal-200 px-2 py-0.2 rounded-full">
                  النسخة العامة (بدون تسجيل دخول)
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                مدرسة التكنولوجيا التطبيقية للمفاعلات النووية بالضبعة (NTSS)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {scheduleData && scheduleData.schedule.length > 0 && (
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                title="طباعة الجدول"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span className="hidden sm:inline">طباعة الجدول</span>
              </button>
            )}

            {onBackToLogin && (
              <button
                type="button"
                onClick={onBackToLogin}
                className="px-3.5 py-1.5 bg-[#008e8b] hover:bg-[#007775] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-xs"
              >
                <ArrowRight className="w-4 h-4" />
                <span>دخول الإدارة / المعلمين</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero / Filter Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm print:border-none print:shadow-none print:p-0">
          <div className="max-w-3xl">
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-[#008e8b]" />
              استعلام الجدول المدرسي للعام الدراسي 2026 / 2027
            </h1>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              اختر الصف الدراسي والفصل لعرض الجدول الأسبوعي المعتمد والموزع على الحصص الدراسية.
              هذه الخدمة متاحة للطلاب وأولياء الأمور دون الحاجة لأي حساب أو كلمة مرور.
            </p>
          </div>

          <form onSubmit={handleFetchSchedule} className="mt-6 grid grid-cols-1 sm:grid-cols-12 gap-3.5 print:hidden">
            <div className="sm:col-span-5">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">الصف الدراسي</label>
              <select
                value={selectedGrade}
                onChange={e => {
                  setSelectedGrade(e.target.value);
                  setSelectedClassroom('');
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-[#008e8b] focus:ring-2 focus:ring-[#008e8b]/20 transition"
              >
                <option value="">-- اختر الصف الدراسي --</option>
                {activeGrades.map(g => (
                  <option key={g.id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-5">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">الفصل الدراسي</label>
              <select
                value={selectedClassroom}
                onChange={e => setSelectedClassroom(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-[#008e8b] focus:ring-2 focus:ring-[#008e8b]/20 transition"
              >
                <option value="">-- اختر الفصل الدراسي --</option>
                {availableClassrooms.map(c => (
                  <option key={c.id} value={c.displayName || c.classroomNumber}>
                    {c.displayName || `فصل ${c.classroomNumber}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 flex items-end">
              <button
                type="submit"
                disabled={isLoading || !selectedGrade || !selectedClassroom}
                className="w-full py-2.5 bg-[#008e8b] hover:bg-[#007775] disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جارٍ الجلب...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>عرض الجدول</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Print Only Header */}
        <div className="hidden print:block text-center border-b pb-4 mb-4">
          <div className="text-base font-bold text-slate-900">مدرسة التكنولوجيا التطبيقية للمفاعلات النووية بالضبعة</div>
          <div className="text-xs text-slate-600">الجدول الدراسي الأسبوعي المعتمد</div>
          <div className="text-sm font-bold text-[#008e8b] mt-1">
            {scheduleData?.gradeName} — {scheduleData?.classroomName}
          </div>
        </div>

        {/* Schedule Display */}
        {hasQueried && !isLoading && (
          <div>
            {scheduleData && scheduleData.schedule && scheduleData.schedule.length > 0 ? (
              <div className="space-y-4">
                {/* Information Ribbon */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 px-5 py-3 rounded-2xl print:border-none">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">الجدول المعتمد لـ:</span>
                    <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                      {scheduleData.gradeName}
                    </span>
                    <span className="text-xs font-bold text-[#008e8b] bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg">
                      {scheduleData.classroomName}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>معتمد ومنشور رسمياً ({scheduleData.schedule.length} حصة أسبوعية)</span>
                  </div>
                </div>

                {/* Weekly Grid (Desktop / Print) */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden print:border-slate-300">
                  <div className="overflow-x-auto">
                    <table className="w-full text-center text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                          <th className="p-3.5 text-right w-28 border-l border-slate-200">اليوم</th>
                          {PERIODS.map(p => (
                            <th key={p} className="p-3 border-l border-slate-200 last:border-l-0 min-w-[110px]">
                              <div className="text-[11px] text-slate-400 font-normal">الحصة</div>
                              <div className="text-sm font-black text-slate-800">{p}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {DAYS.map(day => (
                          <tr key={day} className="hover:bg-slate-50/50 transition">
                            <td className="p-3.5 font-bold text-slate-900 bg-slate-50/70 border-l border-slate-200 text-right">
                              {day}
                            </td>
                            {PERIODS.map(period => {
                              const lesson = lessonsGrid[day]?.[period];
                              return (
                                <td
                                  key={period}
                                  className={`p-2.5 border-l border-slate-200 last:border-l-0 align-top ${
                                    lesson ? 'bg-teal-50/30' : 'bg-white'
                                  }`}
                                >
                                  {lesson ? (
                                    <div className="bg-white p-2 rounded-xl border border-teal-100 shadow-2xs text-right space-y-1">
                                      <div className="font-bold text-slate-900 text-xs line-clamp-1">
                                        {lesson.subjectName}
                                      </div>
                                      <div className="text-[11px] text-slate-600 flex items-center gap-1">
                                        <UserCheck className="w-3 h-3 text-[#008e8b] shrink-0" />
                                        <span className="truncate">{lesson.teacherDisplayName}</span>
                                      </div>
                                      {lesson.roomName && (
                                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                          <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                          <span className="truncate">{lesson.roomName}</span>
                                        </div>
                                      )}
                                      {(lesson.startTime || lesson.endTime) && (
                                        <div className="text-[9px] text-slate-400 font-mono flex items-center gap-1">
                                          <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                          <span>
                                            {lesson.startTime} - {lesson.endTime}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="h-full flex items-center justify-center text-slate-300 font-mono text-[11px] py-4">
                                      —
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
            ) : (
              /* Unpublished / Empty State */
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4 shadow-sm">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    الجدول الدراسي لهذا الفصل قيد الإعداد أو لم يُنشر بعد
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
                    لم يتم اعتماد جدول الحصص رسميًا لفصل ({selectedClassroom}) في ({selectedGrade}).
                    يرجى مراجعة إدارة شؤون المعلمين أو معاودة الزيارة لاحقًا.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Security and Privacy Notice */}
        <div className="bg-slate-100/80 border border-slate-200 rounded-2xl p-4 text-[11px] text-slate-500 leading-relaxed print:hidden flex items-start gap-2.5">
          <BookOpen className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-700">تنبيه أمني ومعايير الخصوصية:</span>
            {' '}هذه البوابة العامة توفر جداول الحصص المدرسية فقط. لا تتضمن البوابة أي بيانات شخصية، أو أرقام قومية، أو سجلات غياب ودرجات للطلاب، وتخضع لسياسات الأمان المعتمدة في مدرسة الضبعة لتكنولوجيا الطاقة النووية.
          </div>
        </div>
      </main>
    </div>
  );
};
