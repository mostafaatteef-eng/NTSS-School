import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCheck,
  Clock,
  Download,
  Filter,
  GraduationCap,
  Save,
  UserCheck,
  UserX,
  Users,
  Loader2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, StudentAttendanceRecord, StudentAttendanceStatus } from '../../types';
import { storageService } from '../../services/storageService';
import {
  formatEgyptianDate,
  getCairoCurrentDate,
  getEgyptianDayName,
} from '../../utils/egyptianTime';

export const StudentAttendanceView: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(() => getCairoCurrentDate());
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [selectedClassroom, setSelectedClassroom] = useState<string>('ALL');

  const [students] = useState<Student[]>(() => storageService.getStudents());
  const [attendanceRecords, setAttendanceRecords] = useState<StudentAttendanceRecord[]>(() =>
    storageService.getStudentAttendance()
  );

  const [tempRecords, setTempRecords] = useState<Record<string, { status: StudentAttendanceStatus; notes?: string; lateMinutes?: number }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const settings = storageService.getSettings();
  const stages = settings.stages || [];

  // Available grades
  const gradesList = useMemo(() => {
    const fromStages = stages.flatMap(s => s.grades || []).map(g => g.name);
    const fromStudents = Array.from(new Set(students.map(s => s.grade).filter(Boolean)));
    const combined = Array.from(new Set([...fromStages, ...fromStudents]));
    return combined.sort();
  }, [stages, students]);

  // Available classrooms filtered by grade
  const classroomsList = useMemo(() => {
    const matching = selectedGrade === 'ALL'
      ? students
      : students.filter(s => s.grade === selectedGrade);
    const classes = Array.from(new Set(matching.map(s => s.classroom).filter(Boolean)));
    return classes.sort();
  }, [students, selectedGrade]);

  // Target students filtered by Grade and Classroom
  const targetStudents = useMemo(() => {
    return students.filter(s => {
      if (s.status && s.status !== 'نشط' && s.status !== 'Active') return false;
      const matchGrade = selectedGrade === 'ALL' || s.grade === selectedGrade;
      const matchClassroom = selectedClassroom === 'ALL' || s.classroom === selectedClassroom;
      return matchGrade && matchClassroom;
    });
  }, [students, selectedGrade, selectedClassroom]);

  // Day Name in Arabic
  const currentDayName = useMemo(() => {
    return getEgyptianDayName(selectedDate);
  }, [selectedDate]);

  // Student Record Helper: Default is ALWAYS 'حاضر'
  const getRecordForStudent = (studentId: string): { status: StudentAttendanceStatus; notes?: string; lateMinutes?: number } => {
    if (tempRecords[studentId]) {
      return tempRecords[studentId];
    }
    const saved = attendanceRecords.find(a => a.studentId === studentId && a.date === selectedDate);
    if (saved && saved.status) {
      // Normalize saved status
      let st: StudentAttendanceStatus = saved.status;
      if (st === 'غائب بعذر' || st === 'عذر' || st === 'مأذونية') st = 'مأذون';
      else if (st === 'غائب بدون عذر') st = 'غائب';
      return {
        status: st,
        notes: saved.notes || saved.absenceReason || '',
        lateMinutes: saved.lateMinutes || 0,
      };
    }

    // Default status: 'حاضر'
    return {
      status: 'حاضر',
      notes: '',
      lateMinutes: 0,
    };
  };

  const updateStudentStatus = (studentId: string, status: StudentAttendanceStatus) => {
    const current = getRecordForStudent(studentId);
    setTempRecords(prev => ({
      ...prev,
      [studentId]: {
        ...current,
        status,
        lateMinutes: status === 'متأخر' ? (current.lateMinutes || 15) : 0,
      },
    }));
  };

  const updateStudentNotes = (studentId: string, notes: string) => {
    const current = getRecordForStudent(studentId);
    setTempRecords(prev => ({
      ...prev,
      [studentId]: {
        ...current,
        notes,
      },
    }));
  };

  // Button "تحديد الكل حاضر"
  const handleMarkAllPresent = () => {
    const newTemp: Record<string, { status: StudentAttendanceStatus; notes?: string; lateMinutes?: number }> = { ...tempRecords };
    targetStudents.forEach(s => {
      newTemp[s.id] = {
        status: 'حاضر',
        notes: '',
        lateMinutes: 0,
      };
    });
    setTempRecords(newTemp);
  };

  // Button "حفظ حضور الفصل" -> Batch save to backend
  const handleSaveClassAttendance = async () => {
    if (targetStudents.length === 0) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const recordsToSave: StudentAttendanceRecord[] = targetStudents.map(student => {
        const rec = getRecordForStudent(student.id);
        return {
          id: `STATT_${selectedDate.replace(/-/g, '')}_${student.id}`,
          studentId: student.id,
          studentName: student.name,
          stage: student.stage || 'المرحلة الدراسية',
          grade: student.grade || selectedGrade,
          classroom: student.classroom || selectedClassroom,
          date: selectedDate,
          dayName: currentDayName,
          status: rec.status,
          lateMinutes: rec.status === 'متأخر' ? (rec.lateMinutes || 15) : 0,
          notes: rec.notes || '',
          recordedBy: storageService.getCurrentUser()?.fullName || 'مشرف الحضور',
          recordedAt: new Date().toISOString(),
        };
      });

      const res = await storageService.saveDailyStudentAttendanceBatchToBackend({
        date: selectedDate,
        gradeId: selectedGrade !== 'ALL' ? selectedGrade : undefined,
        classroomId: selectedClassroom !== 'ALL' ? selectedClassroom : undefined,
        records: recordsToSave,
      });

      setAttendanceRecords(storageService.getStudentAttendance());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setSaveError(err?.message || 'حدث خطأ أثناء حفظ حضور الفصل');
    } finally {
      setIsSaving(false);
    }
  };

  // Summary counts
  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    targetStudents.forEach(s => {
      const rec = getRecordForStudent(s.id);
      if (rec.status === 'حاضر') present++;
      else if (rec.status === 'غائب') absent++;
      else if (rec.status === 'متأخر') late++;
      else if (rec.status === 'مأذون') excused++;
      else present++; // default
    });

    return { total: targetStudents.length, present, absent, late, excused };
  }, [targetStudents, tempRecords, attendanceRecords, selectedDate]);

  // Export Daily Attendance to Excel
  const exportDailyAttendanceExcel = () => {
    const data = targetStudents.map((s, idx) => {
      const rec = getRecordForStudent(s.id);
      return {
        'م': idx + 1,
        'اسم الطالب': s.name,
        'الصف الدراسي': s.grade || selectedGrade,
        'الفصل': s.classroom || selectedClassroom,
        'التاريخ': selectedDate,
        'اليوم': currentDayName,
        'حالة الحضور': rec.status,
        'ملاحظات': rec.notes || '—',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `حضور_${selectedDate}`);
    XLSX.writeFile(wb, `كشف_حضور_الطلاب_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <span>رصد حضور وغياب الطلاب اليومي</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            تسجيل الحضور اليومي للطلاب وحفظ حضور الفصل دفعة واحدة إلى الخادم
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            id="export-student-attendance-excel"
            onClick={exportDailyAttendanceExcel}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl border border-slate-300 transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>تصدير Excel</span>
          </button>

          {/* Single Save Button: حفظ حضور الفصل */}
          <button
            id="save-class-attendance-button"
            onClick={handleSaveClassAttendance}
            disabled={isSaving || targetStudents.length === 0}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#008e8b] hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs rounded-2xl shadow-md transition-colors"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري الحفظ...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>حفظ حضور الفصل</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>تم حفظ حضور الفصل بنجاح ومزامنة البيانات دفعة واحدة مع الخادم!</span>
        </div>
      )}
      {saveError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-bold flex items-center gap-2">
          <UserX className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Filter Controls: Date, Grade, Classroom & Quick Bulk Action */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* اختيار التاريخ */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#008e8b]" />
              <span>اختيار التاريخ</span>
            </label>
            <input
              id="student-attendance-date-picker"
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setTempRecords({});
              }}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
            />
            <span className="text-[11px] text-[#008e8b] font-bold mt-1 block">
              يوم {currentDayName} ({formatEgyptianDate(selectedDate)})
            </span>
          </div>

          {/* الصف */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-[#008e8b]" />
              <span>الصف</span>
            </label>
            <select
              id="student-attendance-grade-select"
              value={selectedGrade}
              onChange={(e) => {
                setSelectedGrade(e.target.value);
                setSelectedClassroom('ALL');
                setTempRecords({});
              }}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="ALL">جميع الصفوف</option>
              {gradesList.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* الفصل */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#008e8b]" />
              <span>الفصل</span>
            </label>
            <select
              id="student-attendance-classroom-select"
              value={selectedClassroom}
              onChange={(e) => {
                setSelectedClassroom(e.target.value);
                setTempRecords({});
              }}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-hidden focus:border-[#008e8b]"
            >
              <option value="ALL">جميع الفصول</option>
              {classroomsList.map(c => (
                <option key={c} value={c}>فصل {c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Button: تحديد الكل حاضر */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              id="mark-all-students-present-btn"
              type="button"
              onClick={handleMarkAllPresent}
              className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold rounded-xl text-xs transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <CheckCheck className="w-4 h-4 text-emerald-700" />
              <span>تحديد الكل حاضر</span>
            </button>
            <span className="text-xs text-slate-500 font-medium">
              (الافتراضي لجميع الطلاب هو حاضر تلقائياً)
            </span>
          </div>

          <div className="text-xs text-slate-600 font-bold">
            عدد الطلاب بالقائمة: <span className="font-mono text-slate-800">{targetStudents.length}</span> طالب
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs text-center">
          <div className="text-xl font-bold text-slate-800 font-mono">{summary.total}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-0.5">إجمالي الطلاب</div>
        </div>
        <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 shadow-xs text-center">
          <div className="text-xl font-bold text-emerald-700 font-mono">{summary.present}</div>
          <div className="text-[11px] text-emerald-800 font-semibold mt-0.5">حاضر</div>
        </div>
        <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200 shadow-xs text-center">
          <div className="text-xl font-bold text-rose-700 font-mono">{summary.absent}</div>
          <div className="text-[11px] text-rose-800 font-semibold mt-0.5">غائب</div>
        </div>
        <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 shadow-xs text-center">
          <div className="text-xl font-bold text-amber-700 font-mono">{summary.late}</div>
          <div className="text-[11px] text-amber-800 font-semibold mt-0.5">متأخر</div>
        </div>
        <div className="bg-sky-50 p-3.5 rounded-2xl border border-sky-200 shadow-xs text-center">
          <div className="text-xl font-bold text-sky-700 font-mono">{summary.excused}</div>
          <div className="text-[11px] text-sky-800 font-semibold mt-0.5">مأذون</div>
        </div>
      </div>

      {/* Table of Students Attendance */}
      <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5 w-12 text-center">#</th>
                <th className="p-3.5">اسم الطالب</th>
                <th className="p-3.5">الصف / الفصل</th>
                <th className="p-3.5 text-center">حالة الحضور</th>
                <th className="p-3.5">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {targetStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">لا يوجد طلاب مسجلين في هذا الصف / الفصل</p>
                    <p className="text-xs text-slate-400 mt-1">يرجى تغيير خيارات الفلترة أعلاه</p>
                  </td>
                </tr>
              ) : (
                targetStudents.map((student, idx) => {
                  const rec = getRecordForStudent(student.id);

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 text-slate-400 font-mono text-center">{idx + 1}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 text-sm">{student.name}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="text-slate-700 font-medium">{student.grade || selectedGrade}</span>
                        <span className="block font-bold text-[#008e8b] text-[11px]">فصل {student.classroom || selectedClassroom}</span>
                      </td>

                      {/* 4 Buttons: حاضر، غائب، متأخر، مأذون */}
                      <td className="p-3.5 text-center">
                        <div className="inline-flex bg-slate-100 p-1 rounded-2xl border border-slate-200 gap-1">
                          {/* حاضر */}
                          <button
                            type="button"
                            onClick={() => updateStudentStatus(student.id, 'حاضر')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                              rec.status === 'حاضر'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/50'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>حاضر</span>
                          </button>

                          {/* غائب */}
                          <button
                            type="button"
                            onClick={() => updateStudentStatus(student.id, 'غائب')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                              rec.status === 'غائب'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50/50'
                            }`}
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>غائب</span>
                          </button>

                          {/* متأخر */}
                          <button
                            type="button"
                            onClick={() => updateStudentStatus(student.id, 'متأخر')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                              rec.status === 'متأخر'
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'text-slate-600 hover:text-amber-700 hover:bg-amber-50/50'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>متأخر</span>
                          </button>

                          {/* مأذون */}
                          <button
                            type="button"
                            onClick={() => updateStudentStatus(student.id, 'مأذون')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                              rec.status === 'مأذون'
                                ? 'bg-sky-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-sky-700 hover:bg-sky-50/50'
                            }`}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>مأذون</span>
                          </button>
                        </div>
                      </td>

                      {/* Notes / Details */}
                      <td className="p-3.5">
                        <input
                          type="text"
                          placeholder="ملاحظات (اختياري)..."
                          value={rec.notes || ''}
                          onChange={(e) => updateStudentNotes(student.id, e.target.value)}
                          className="w-full max-w-xs text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#008e8b]"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
