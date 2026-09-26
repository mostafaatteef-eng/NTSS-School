import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock,
  Download,
  GraduationCap,
  MapPin,
  Printer,
  RefreshCw,
  School,
  Search,
} from 'lucide-react';
import {
  PublicClassScheduleDTO,
  PublicSchoolOption,
  PublicScheduleClassroomOption,
  PublicScheduleGradeOption,
} from '../../types';
import { storageService } from '../../services/storageService';
import { NTSSLogo } from '../common/NTSSLogo';

interface PublicStudentScheduleViewProps {
  onBackToLogin?: () => void;
}

export const PublicStudentScheduleView: React.FC<PublicStudentScheduleViewProps> = ({ onBackToLogin }) => {
  const [schools, setSchools] = useState<PublicSchoolOption[]>([]);
  const [grades, setGrades] = useState<PublicScheduleGradeOption[]>([]);
  const [classrooms, setClassrooms] = useState<PublicScheduleClassroomOption[]>([]);

  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState('');

  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasQueried, setHasQueried] = useState(false);
  const [scheduleData, setScheduleData] = useState<PublicClassScheduleDTO | null>(null);

  const selectedSchool = useMemo(
    () => schools.find(s => s.schoolId === selectedSchoolId),
    [schools, selectedSchoolId]
  );

  const selectedGrade = useMemo(
    () => grades.find(g => g.id === selectedGradeId),
    [grades, selectedGradeId]
  );

  const availableClassrooms = useMemo(() => {
    if (!selectedGrade) return [];
    return classrooms.filter(classroom => {
      const gradeIdMatch = classroom.gradeId && classroom.gradeId === selectedGrade.id;
      const gradeNameMatch = classroom.gradeName && classroom.gradeName === selectedGrade.name;
      return gradeIdMatch || gradeNameMatch;
    });
  }, [classrooms, selectedGrade]);

  const selectedClassroom = useMemo(
    () => availableClassrooms.find(c => c.id === selectedClassroomId),
    [availableClassrooms, selectedClassroomId]
  );

  const loadSchools = async () => {
    setSchoolsLoading(true);
    setErrorMessage('');

    const result = await storageService.getPublicSchools();
    setSchoolsLoading(false);

    if (!result.success) {
      setSchools([]);
      setErrorMessage(result.message || 'تعذر تحميل المدارس المتاحة.');
      return;
    }

    setSchools(result.schools || []);
  };

  useEffect(() => {
    void loadSchools();
  }, []);

  const handleSchoolChange = async (schoolId: string) => {
    setSelectedSchoolId(schoolId);
    setSelectedGradeId('');
    setSelectedClassroomId('');
    setScheduleData(null);
    setHasQueried(false);
    setGrades([]);
    setClassrooms([]);
    setErrorMessage('');

    if (!schoolId) return;

    setOptionsLoading(true);
    const result = await storageService.getPublicScheduleOptions(schoolId);
    setOptionsLoading(false);

    if (!result.success) {
      setErrorMessage(result.message || 'تعذر تحميل الصفوف والفصول لهذه المدرسة.');
      return;
    }

    setGrades(result.grades || []);
    setClassrooms(result.classrooms || []);
  };

  const handleGradeChange = (gradeId: string) => {
    setSelectedGradeId(gradeId);
    setSelectedClassroomId('');
    setScheduleData(null);
    setHasQueried(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setHasQueried(false);
    setScheduleData(null);

    if (!selectedSchoolId || !selectedGrade || !selectedClassroom) {
      setErrorMessage('يرجى اختيار المدرسة ثم الصف ثم الفصل.');
      return;
    }

    setScheduleLoading(true);
    const result = await storageService.getPublicClassSchedule(
      selectedGrade.name,
      selectedClassroom.name,
      selectedSchoolId
    );
    setScheduleLoading(false);
    setHasQueried(true);

    if (!result.success || !result.data) {
      setErrorMessage(result.message || 'تعذر تحميل الجدول الدراسي.');
      return;
    }

    setScheduleData({
      ...result.data,
      schoolId: selectedSchoolId,
      schoolName: selectedSchool?.schoolName,
    });
  };

  const days = useMemo(() => {
    const preferred = ['الأحد', 'الإثنين', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الاربعاء', 'الخميس'];
    const found = Array.from(new Set((scheduleData?.schedule || []).map(item => item.dayOfWeek).filter(Boolean)));
    return preferred.filter(day => found.includes(day)).concat(found.filter(day => !preferred.includes(day)));
  }, [scheduleData]);

  const periods = useMemo(() => {
    return Array.from(new Set((scheduleData?.schedule || []).map(item => Number(item.periodNumber) || 0)))
      .filter(Boolean)
      .sort((a, b) => a - b);
  }, [scheduleData]);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <NTSSLogo variant="full" size="md" />
          {onBackToLogin && (
            <button
              type="button"
              onClick={onBackToLogin}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
            >
              <ArrowRight className="h-4 w-4" />
              العودة للبوابة الرئيسية
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
              <CalendarDays className="h-4 w-4" />
              بوابة الطلاب العامة
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              الجدول الدراسي المنشور
            </h1>
            <p className="max-w-xl text-sm leading-7 text-slate-500">
              اختر المدرسة أولًا، ثم الصف والفصل. لا تحتاج إلى حساب أو كلمة مرور لعرض الجدول الدراسي المنشور.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {errorMessage && (
              <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700">1. المدرسة</label>
                <select
                  id="select-public-school"
                  value={selectedSchoolId}
                  disabled={schoolsLoading}
                  onChange={e => void handleSchoolChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold outline-none transition focus:border-[#008e8b] focus:bg-white focus:ring-2 focus:ring-[#008e8b]/15"
                >
                  <option value="">{schoolsLoading ? 'جارٍ تحميل المدارس...' : '-- اختر المدرسة --'}</option>
                  {schools.map(school => (
                    <option key={school.schoolId} value={school.schoolId}>
                      {school.schoolName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700">2. الصف</label>
                <select
                  id="select-public-grade"
                  value={selectedGradeId}
                  disabled={!selectedSchoolId || optionsLoading}
                  onChange={e => handleGradeChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold outline-none transition focus:border-[#008e8b] focus:bg-white focus:ring-2 focus:ring-[#008e8b]/15 disabled:opacity-50"
                >
                  <option value="">{optionsLoading ? 'جارٍ تحميل الصفوف...' : '-- اختر الصف --'}</option>
                  {grades.map(grade => (
                    <option key={grade.id} value={grade.id}>
                      {grade.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-700">3. الفصل</label>
                <select
                  id="select-public-classroom"
                  value={selectedClassroomId}
                  disabled={!selectedGradeId || optionsLoading}
                  onChange={e => {
                    setSelectedClassroomId(e.target.value);
                    setScheduleData(null);
                    setHasQueried(false);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold outline-none transition focus:border-[#008e8b] focus:bg-white focus:ring-2 focus:ring-[#008e8b]/15 disabled:opacity-50"
                >
                  <option value="">-- اختر الفصل --</option>
                  {availableClassrooms.map(classroom => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={scheduleLoading || !selectedSchoolId || !selectedGradeId || !selectedClassroomId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#008e8b] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#007775] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {scheduleLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      جارٍ تحميل الجدول...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      عرض الجدول
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </section>

        {scheduleData && (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#008e8b]/10 text-[#008e8b]">
                  <School className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">{scheduleData.schoolName || selectedSchool?.schoolName}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {selectedGrade?.name} — {selectedClassroom?.name}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  طباعة
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  حفظ PDF
                </button>
              </div>
            </div>

            {scheduleData.schedule.length > 0 ? (
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border-b border-l border-slate-200 p-3 text-right font-black text-slate-700">اليوم</th>
                        {periods.map(period => (
                          <th key={period} className="min-w-[150px] border-b border-l border-slate-200 p-3 text-center font-black text-slate-700">
                            الحصة {period}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {days.map(day => (
                        <tr key={day}>
                          <td className="border-b border-l border-slate-100 bg-slate-50/60 p-3 font-black text-slate-800">{day}</td>
                          {periods.map(period => {
                            const lesson = scheduleData.schedule.find(
                              item => item.dayOfWeek === day && Number(item.periodNumber) === period
                            );
                            return (
                              <td key={period} className="border-b border-l border-slate-100 p-3 align-top">
                                {lesson ? (
                                  <div className="space-y-2">
                                    <div className="font-black text-slate-900">{lesson.subjectName || '—'}</div>
                                    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                                      <GraduationCap className="h-3 w-3 shrink-0" />
                                      {lesson.teacherDisplayName || 'معلم المادة'}
                                    </div>
                                    {lesson.roomName && (
                                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {lesson.roomName}
                                      </div>
                                    )}
                                    {(lesson.startTime || lesson.endTime) && (
                                      <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                                        <Clock className="h-3 w-3 shrink-0" />
                                        {lesson.startTime} - {lesson.endTime}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="py-5 text-center text-slate-300">—</div>
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
            ) : (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-10 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-amber-600" />
                <h3 className="mt-3 text-sm font-black text-slate-900">لا يوجد جدول منشور لهذا الفصل حاليًا</h3>
                <p className="mt-1 text-xs leading-6 text-slate-500">يرجى المراجعة لاحقًا بعد اعتماد ونشر الجدول من إدارة المدرسة.</p>
              </div>
            )}
          </section>
        )}

        {hasQueried && !scheduleData && !scheduleLoading && !errorMessage && (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">
            لا توجد بيانات متاحة للعرض.
          </div>
        )}

        <section className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-100/70 p-4 text-[11px] leading-6 text-slate-500 print:hidden">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div>
            <span className="font-black text-slate-700">الخصوصية:</span>{' '}
            تعرض هذه البوابة الجداول الدراسية المنشورة فقط. لا تعرض بيانات طلاب شخصية أو حضورًا أو درجات أو أرقامًا قومية.
          </div>
        </section>
      </main>
    </div>
  );
};
