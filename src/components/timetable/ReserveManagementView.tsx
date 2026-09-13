import React, { useState, useEffect } from 'react';
import {
  Clock,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Award,
  Sparkles,
  Calendar,
  Users,
  Search,
  Plus,
  RefreshCw,
  Printer,
  FileSpreadsheet,
} from 'lucide-react';
import {
  ReserveCandidateRecommendation,
  ReserveSubstitutionAssignment,
  Employee,
  ScheduleItem,
} from '../../types';
import { timetableService } from '../../services/timetableService';
import { storageService } from '../../services/storageService';
import * as XLSX from 'xlsx';

export const ReserveManagementView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'assign' | 'active' | 'fairness'>('assign');
  const [teachers, setTeachers] = useState<Employee[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [substitutions, setSubstitutions] = useState<ReserveSubstitutionAssignment[]>([]);

  // Form State for New Assignment
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedPeriod, setSelectedPeriod] = useState<number>(1);
  const [selectedAbsentTeacherId, setSelectedAbsentTeacherId] = useState<string>('');
  const [selectedClassroom, setSelectedClassroom] = useState<string>('1/1');
  const [selectedSubject, setSelectedSubject] = useState<string>('العلوم التقنية التخصصية');
  const [absenceReason, setAbsenceReason] = useState<string>('غياب بعذر');

  // Candidate Engine Results
  const [candidates, setCandidates] = useState<ReserveCandidateRecommendation[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = () => {
    const staff = timetableService.getTeachingStaff();
    setTeachers(staff);
    const schedule = storageService.getSchedule();
    setScheduleItems(schedule);
    const subs = timetableService.getReserveSubstitutions();
    setSubstitutions(subs);

    if (!selectedAbsentTeacherId && staff.length > 0) {
      setSelectedAbsentTeacherId(staff[0].id);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When date, period, absent teacher, or classroom change, calculate candidates
  useEffect(() => {
    if (!selectedAbsentTeacherId) return;

    // Convert date to day name
    const d = new Date(selectedDate);
    const dayIndex = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayName = dayMap[dayIndex] || 'الأحد';

    const results = timetableService.getRankedReserveCandidates({
      date: selectedDate,
      dayOfWeek: dayName,
      periodNumber: selectedPeriod,
      absentTeacherId: selectedAbsentTeacherId,
      subjectName: selectedSubject,
      classroomId: selectedClassroom,
    });

    setCandidates(results);
    if (results.length > 0 && !selectedCandidateId) {
      const top = results.find(c => c.isEligible);
      if (top) setSelectedCandidateId(top.teacherId);
    }
  }, [selectedDate, selectedPeriod, selectedAbsentTeacherId, selectedClassroom, selectedSubject]);

  const handleConfirmAssignment = () => {
    if (!selectedCandidateId || !selectedAbsentTeacherId) return;
    setIsAssigning(true);

    const d = new Date(selectedDate);
    const dayMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayName = dayMap[d.getDay()] || 'الأحد';

    const sub: ReserveSubstitutionAssignment = {
      id: `SUB-${Date.now()}`,
      date: selectedDate,
      dayOfWeek: dayName,
      periodNumber: selectedPeriod,
      classroomId: selectedClassroom,
      classroomName: `فصل ${selectedClassroom}`,
      gradeName: selectedClassroom.startsWith('1') ? 'الصف الأول الثانوي' : 'الصف الثاني الثانوي',
      subjectName: selectedSubject,
      originalTeacherId: selectedAbsentTeacherId,
      originalTeacherCode: teachers.find(t => t.id === selectedAbsentTeacherId)?.teacherCode,
      originalTeacherName: teachers.find(t => t.id === selectedAbsentTeacherId)?.name || '',
      substituteTeacherId: selectedCandidateId,
      substituteTeacherCode: teachers.find(t => t.id === selectedCandidateId)?.teacherCode,
      substituteTeacherName: teachers.find(t => t.id === selectedCandidateId)?.name || '',
      reason: absenceReason,
      status: 'SCHEDULED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    timetableService.saveReserveSubstitution(sub);
    setSuccessMessage(`تم إسناد حصة الاحتياطي بنجاح للأستاذ/ة ${sub.substituteTeacherName}`);
    setIsAssigning(false);
    loadData();

    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  const handleCancelSubstitution = (subId: string) => {
    if (confirm('هل أنت متأكد من إلغاء حصة الاحتياطي هذه؟')) {
      timetableService.cancelReserveSubstitution(subId);
      loadData();
    }
  };

  const fairnessReport = timetableService.getReserveFairnessReport();

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-6 h-6 text-indigo-600" />
            حصص الاحتياطي ومحرك ترشيح البدلاء الذكي
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            نظام عادل خماسي القواعد لترشيح المعلم البديل، منع تجاوز النصاب القانوني (30 حصة)، وتوزيع عادل
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            onClick={() => setActiveTab('assign')}
            className={`px-3.5 py-2 rounded-lg transition ${
              activeTab === 'assign' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            إسناد بديل جديد
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3.5 py-2 rounded-lg transition ${
              activeTab === 'active' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            الحصص المسندة ({substitutions.filter(s => s.status !== 'CANCELLED').length})
          </button>
          <button
            onClick={() => setActiveTab('fairness')}
            className={`px-3.5 py-2 rounded-lg transition ${
              activeTab === 'fairness' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            تقرير عدالة التوزيع
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex items-center gap-3 text-emerald-800 text-sm font-bold">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      {/* TAB 1: ASSIGN NEW RESERVE */}
      {activeTab === 'assign' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Left / 4 cols */}
          <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-800 border-b pb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              بيانات الحصة الشاغرة (المعلم الغائب)
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ اليوم</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الحصة الشاغرة</label>
              <select
                value={selectedPeriod}
                onChange={e => setSelectedPeriod(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(p => (
                  <option key={p} value={p}>
                    الحصة {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المعلم الغائب / الأصلي</label>
              <select
                value={selectedAbsentTeacherId}
                onChange={e => setSelectedAbsentTeacherId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
              >
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.teacherCode || 'T-???'})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الفصل</label>
                <select
                  value={selectedClassroom}
                  onChange={e => setSelectedClassroom(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                >
                  <option value="1/1">فصل 1/1</option>
                  <option value="1/2">فصل 1/2</option>
                  <option value="2/1">فصل 2/1</option>
                  <option value="2/2">فصل 2/2</option>
                  <option value="3/1">فصل 3/1</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">سبب الغياب</label>
                <input
                  type="text"
                  value={absenceReason}
                  onChange={e => setAbsenceReason(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المادة</label>
              <input
                type="text"
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
              />
            </div>
          </div>

          {/* Candidates Right / 8 cols */}
          <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  ترشيحات المحرك الذكي للمعلمين البدلاء (مرتبة بالأفضلية والعدالة)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  1. نفس التخصص والمادة • 2. الطاقة المتبقية • 3. الاحتياطي هذا الأسبوع • 4. الرصيد التراكمي العادل
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {candidates.filter(c => c.isEligible).length} مرشح مؤهل
              </span>
            </div>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {candidates.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  اختر المعلم الغائب ورقم الحصة لبدء حساب ترشيحات البدلاء
                </div>
              ) : (
                candidates.map((cand, idx) => {
                  const isSelected = selectedCandidateId === cand.teacherId;
                  return (
                    <div
                      key={cand.teacherId}
                      onClick={() => cand.isEligible && setSelectedCandidateId(cand.teacherId)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        !cand.isEligible
                          ? 'bg-slate-50/60 border-slate-200 opacity-60 cursor-not-allowed'
                          : isSelected
                          ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                            idx === 0 && cand.isEligible
                              ? 'bg-amber-100 text-amber-800'
                              : cand.isEligible
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">{cand.teacherName}</span>
                            <span className="font-mono text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                              {cand.teacherCode}
                            </span>
                            {cand.teachesSameSubject && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                                <Award className="w-3 h-3 text-emerald-600" />
                                نفس المادة
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1 mt-1">
                            <span>
                              الطاقة المتبقية: <strong className="text-slate-800">{cand.remainingCapacity}</strong>
                            </span>
                            <span>
                              احتياطي الأسبوع: <strong className="text-amber-700">{cand.reserveCountThisWeek}</strong>
                            </span>
                            <span>
                              الرصيد التراكمي: <strong className="text-purple-700">{cand.cumulativeReserveCount}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:self-center">
                        {!cand.isEligible ? (
                          <div className="text-[11px] text-rose-600 font-bold bg-rose-50 px-2.5 py-1 rounded-lg">
                            {cand.conflictReason || 'غير مؤهل'}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setSelectedCandidateId(cand.teacherId);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {isSelected ? 'محدد كبديل' : 'اختيار البديل'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {selectedCandidateId && (
                  <span>
                    المعلم المختار:{' '}
                    <strong className="text-indigo-700">
                      {teachers.find(t => t.id === selectedCandidateId)?.name}
                    </strong>
                  </span>
                )}
              </div>
              <button
                disabled={!selectedCandidateId || isAssigning}
                onClick={handleConfirmAssignment}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                إسناد الحصة رسمياً وتسجيلها
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVE SUBSTITUTIONS */}
      {activeTab === 'active' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800">سجل حصص الاحتياطي والبدلاء المعتمدة</h3>
            <span className="text-xs text-slate-500 font-mono">
              إجمالي السجلات: {substitutions.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                <tr>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">اليوم</th>
                  <th className="p-3 text-center">الحصة</th>
                  <th className="p-3">الفصل</th>
                  <th className="p-3">المعلم الأصلي الغائب</th>
                  <th className="p-3">المعلم البديل</th>
                  <th className="p-3">السبب</th>
                  <th className="p-3 text-center">الحالة</th>
                  <th className="p-3 text-center">إلغاء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {substitutions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-slate-400">
                      لا توجد حصص احتياطي مسندة حتى الآن
                    </td>
                  </tr>
                ) : (
                  substitutions.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-mono">{s.date}</td>
                      <td className="p-3 font-semibold">{s.dayOfWeek}</td>
                      <td className="p-3 text-center font-bold text-indigo-700">الحصة {s.periodNumber}</td>
                      <td className="p-3 text-slate-700">{s.classroomName}</td>
                      <td className="p-3 text-slate-600">
                        {s.originalTeacherName} ({s.originalTeacherCode})
                      </td>
                      <td className="p-3 font-bold text-slate-900">
                        {s.substituteTeacherName} ({s.substituteTeacherCode})
                      </td>
                      <td className="p-3 text-slate-500">{s.reason || '—'}</td>
                      <td className="p-3 text-center">
                        {s.status === 'SCHEDULED' && (
                          <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">
                            مجدولة
                          </span>
                        )}
                        {s.status === 'COMPLETED' && (
                          <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                            تمت
                          </span>
                        )}
                        {s.status === 'CANCELLED' && (
                          <span className="inline-block px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold">
                            ملغاة
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {s.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleCancelSubstitution(s.id)}
                            className="text-rose-600 hover:text-rose-800 font-bold text-[11px]"
                          >
                            إلغاء الحصة
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: FAIRNESS REPORT */}
      {activeTab === 'fairness' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-600" />
                تقرير عدالة وتوزيع حصص الاحتياطي التراكمي
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                متابعة الحصص البديلة لضمان التكافؤ بين المعلمين وعدم تكليف نفس المعلم أكثر من غيره
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                <tr>
                  <th className="p-3">كود المعلم</th>
                  <th className="p-3">اسم المعلم</th>
                  <th className="p-3 text-center">احتياطي هذا الأسبوع</th>
                  <th className="p-3 text-center">احتياطي الشهر الحالي</th>
                  <th className="p-3 text-center">احتياطي الفصل الدراسي</th>
                  <th className="p-3 text-center">الرصيد التراكمي السنوي</th>
                  <th className="p-3 text-center">مؤشر العدالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {fairnessReport.map(r => (
                  <tr key={r.teacherId} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-indigo-700">{r.teacherCode}</td>
                    <td className="p-3 font-bold text-slate-900">{r.teacherName}</td>
                    <td className="p-3 text-center font-bold text-slate-700">{r.weeklyCount}</td>
                    <td className="p-3 text-center font-bold text-slate-700">{r.monthlyCount}</td>
                    <td className="p-3 text-center font-bold text-indigo-700">{r.termCount}</td>
                    <td className="p-3 text-center font-bold text-purple-700">{r.annualCount}</td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          r.fairnessIndicator === 'ABOVE_AVERAGE'
                            ? 'bg-amber-100 text-amber-800'
                            : r.fairnessIndicator === 'BELOW_AVERAGE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {r.fairnessIndicator === 'ABOVE_AVERAGE'
                          ? 'أعلى من المتوسط'
                          : r.fairnessIndicator === 'BELOW_AVERAGE'
                          ? 'أقل من المتوسط'
                          : 'متوسط متوازن'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
