import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Calendar,
  Clock,
  BookOpen,
  FileText,
  ExternalLink,
  Award,
  QrCode,
  CheckCircle2,
  Copy,
  Printer,
  Search,
} from 'lucide-react';
import { Student, StudentAccessToken, ScheduleItem, Homework, ExamSchedule, TeacherLessonResource } from '../../types';
import { timetableService } from '../../services/timetableService';
import { storageService } from '../../services/storageService';

export const StudentScheduleAccessView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [activeToken, setActiveToken] = useState<StudentAccessToken | null>(null);
  const [manualToken, setManualToken] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Student Timetable Data
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [homeworkList, setHomeworkList] = useState<Homework[]>([]);
  const [exams, setExams] = useState<ExamSchedule[]>([]);
  const [resources, setResources] = useState<TeacherLessonResource[]>([]);

  useEffect(() => {
    const allStudents = storageService.getStudents();
    setStudents(allStudents);
    if (allStudents.length > 0) {
      loadStudentSchedule(allStudents[0]);
    }
  }, []);

  const loadStudentSchedule = (student: Student) => {
    setSelectedStudentId(student.id);

    // Get or create secure access token
    const token = timetableService.getOrCreateStudentToken(student);
    setActiveToken(token);

    // Load student's classroom schedule
    const classroom = student.classroom || '1/1';
    const schedule = storageService.getSchedule().filter(s => s.classroom === classroom && s.isActive !== false);
    setScheduleItems(schedule);

    // Homework for this classroom
    const hw = storageService.getHomeworks().filter(h => h.classroom === classroom && h.status !== 'Draft');
    setHomeworkList(hw);

    // Published Exams for this classroom/grade
    const ex = timetableService.getExamSchedules().filter(
      e => e.status === 'Published' && (e.classroomName === classroom || !e.classroomName)
    );
    setExams(ex);

    // Published Resources for this classroom
    const res = timetableService.getTeacherLessonResources().filter(
      r => r.classroomId === classroom && r.visibility === 'Published'
    );
    setResources(res);
  };

  const handleVerifyManualToken = async () => {
    if (!manualToken.trim()) return;
    const res = await timetableService.getStudentPublicPortalData(manualToken.trim());
    if (res.success && res.student) {
      setActiveToken({
        id: `SAT-${Date.now()}`,
        studentId: res.student.id,
        studentCode: res.student.studentCode,
        token: manualToken.trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      setSelectedStudentId(res.student.id);
      setScheduleItems(res.schedule || []);
      setHomeworkList(res.homeworks || []);
      setExams(res.exams || []);
      setResources(res.resources || []);
    } else {
      alert(res.message || 'رمز الوصول غير صحيح أو منتهي الصلاحية');
    }
  };

  const handleIssueNewToken = async () => {
    if (!selectedStudentId) return;
    const res = await timetableService.issueStudentAccessTokenAuthoritative(selectedStudentId);
    if (res.success && res.token) {
      const student = students.find(s => s.id === selectedStudentId);
      if (student) loadStudentSchedule(student);
      alert('تم إصدار وتشفير رمز وصول جديد للطالب بنجاح');
    } else {
      alert(res.message || 'فشل إصدار الرمز');
    }
  };

  const handleRevokeToken = async () => {
    if (!activeToken) return;
    if (window.confirm('هل أنت متأكد من إلغاء تنشيط رمز وصول هذا الطالب؟ لن يتمكن من فتح البوابة بهذا الرمز مجدداً.')) {
      const res = await timetableService.revokeStudentAccessToken(activeToken.token);
      if (res.success) {
        setActiveToken(null);
        alert('تم إيقاف صلاحية رمز الوصول بنجاح');
      }
    }
  };

  const handleCopyAccessLink = () => {
    if (!activeToken) return;
    const url = `${window.location.origin}/#student-schedule?token=${activeToken.token}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

  const currentStudent = students.find(s => s.id === selectedStudentId);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-600" />
            وصول الطلاب للجدول والواجبات المدرسية (للقراءة فقط)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            وصول آمن بالرمز المشفر أو QR للطلاب لمتابعة حصص الفصل، الواجبات، ومواعيد الامتحانات دون كشف أي بيانات شخصية
          </p>
        </div>

        {activeToken && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAccessLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedLink ? 'تم نسخ الرابط!' : 'نسخ رابط الطالب'}
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              <Printer className="w-3.5 h-3.5" />
              طباعة الجدول
            </button>
          </div>
        )}
      </div>

      {/* Student Selector / Token Box */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Quick Student Selector for Staff */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            اختيار الطالب لتوليد رابط ورمز الوصول:
          </label>
          <select
            value={selectedStudentId}
            onChange={e => {
              const st = students.find(s => s.id === e.target.value);
              if (st) loadStudentSchedule(st);
            }}
            className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
          >
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} — فصل {s.classroom || '1/1'} ({s.academicNumber || s.nationalId || s.id})
              </option>
            ))}
          </select>
        </div>

        {/* Right: Manual Token verification */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            أو إدخال رمز وصول الطالب المباشر (Token):
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="مثال: STK-XXXX-YYYY"
              value={manualToken}
              onChange={e => setManualToken(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-2 text-xs font-mono"
            />
            <button
              onClick={handleVerifyManualToken}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold whitespace-nowrap"
            >
              تحقق
            </button>
          </div>
        </div>
      </div>

      {/* Active Student Card */}
      {currentStudent && activeToken && (
        <div className="bg-indigo-50/70 border border-indigo-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold">
              {currentStudent.name.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">{currentStudent.name}</div>
              <div className="text-xs text-slate-500">
                الصف: {currentStudent.grade} • الفصل: <strong>{currentStudent.classroom}</strong>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-center text-xs">
            <span className="font-mono text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 font-bold flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-indigo-600" />
              رمز الوصول: {activeToken.token}
            </span>
            <button
              onClick={handleIssueNewToken}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 rounded-lg font-bold transition cursor-pointer"
              title="إصدار وتشفير رمز وصول جديد في الخادم"
            >
              إصدار رمز جديد
            </button>
            <button
              onClick={handleRevokeToken}
              className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg font-bold transition cursor-pointer"
              title="إلغاء تنشيط الرمز الحالي"
            >
              إلغاء التنشيط
            </button>
          </div>
        </div>
      )}

      {/* Weekly Schedule Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            جدول حصص فصل ({currentStudent?.classroom || '1/1'}) الأسبوعي
          </h3>
          <span className="text-xs text-slate-500">
            {scheduleItems.length} حصة مجدولة
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b">
              <tr>
                <th className="p-3 w-28 text-right pr-4">اليوم / الحصة</th>
                {PERIODS.map(p => (
                  <th key={p} className="p-3 border-l border-slate-200 min-w-[120px]">
                    الحصة {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DAYS.map(d => (
                <tr key={d} className="hover:bg-slate-50/60">
                  <td className="p-3 font-bold text-slate-900 bg-slate-50 text-right pr-4 border-l border-slate-200">
                    {d}
                  </td>
                  {PERIODS.map(p => {
                    const item = scheduleItems.find(
                      s => (s.dayOfWeek === d || s.dayName === d) && s.periodNumber === p
                    );
                    return (
                      <td key={p} className="p-2 border-l border-slate-200 align-top">
                        {item ? (
                          <div className="p-2 rounded-xl bg-indigo-50/70 border border-indigo-200 text-right space-y-1">
                            <div className="font-bold text-slate-900 line-clamp-1">{item.subject}</div>
                            <div className="text-slate-600 text-[11px]">{item.teacherName}</div>
                            {item.room && <div className="text-slate-400 text-[10px]">{item.room}</div>}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-[11px]">—</span>
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

      {/* Grid: Published Homework & Exams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Homework */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            الواجبات المنزلية المطلوبة
          </h3>

          {homeworkList.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              لا توجد واجبات منزلية مطلوبة حالياً لهذا الفصل
            </div>
          ) : (
            <div className="space-y-2">
              {homeworkList.map(hw => (
                <div key={hw.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 space-y-1 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-900">{hw.title}</span>
                    <span className="text-rose-600 font-mono text-[11px]">تسليم: {hw.dueDate}</span>
                  </div>
                  <p className="text-slate-500">{hw.description}</p>
                  <div className="text-[10px] text-slate-400 pt-1 border-t">المادة: {hw.subject}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Exams */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
            <Award className="w-4 h-4 text-indigo-600" />
            مواعيد الامتحانات والاختبارات القادمة
          </h3>

          {exams.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              لا توجد امتحانات معلنة حالياً لهذا الفصل
            </div>
          ) : (
            <div className="space-y-2">
              {exams.map(e => (
                <div key={e.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 space-y-1 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-900">{e.subjectName}</span>
                    <span className="text-indigo-600 font-mono">{e.examDate}</span>
                  </div>
                  <div className="text-slate-500 flex items-center gap-2 text-[11px]">
                    <span>التوقيت: {e.startTime}</span>
                    <span>المدة: {e.durationMinutes} دقيقة</span>
                    <span>المقر: {e.roomName}</span>
                  </div>
                  {e.instructions && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 p-1.5 rounded mt-1">
                      {e.instructions}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Published Teacher Resources */}
      {resources.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            المصادر والروابط التعليمية المنشورة من المعلمين
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {resources.map(r => (
              <div key={r.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 space-y-1.5">
                <div className="font-bold text-slate-900">{r.lessonTopic}</div>
                <div className="text-slate-500 text-[11px]">{r.subjectName}</div>
                {r.studentResourceUrl && (
                  <a
                    href={r.studentResourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-bold text-[11px] pt-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    تحميل / فتح المصدر التعليمي
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
