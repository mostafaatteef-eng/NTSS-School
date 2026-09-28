import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ClockAlert,
  Download,
  GraduationCap,
  HeartHandshake,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { AttendanceRecord, Employee, LeaveRecord, Student, SystemSettings, User } from '../../types';
import { storageService } from '../../services/storageService';
import { NotificationEngine } from '../../services/notificationEngine';
import { PendingActionsCard } from './PendingActionsCard';
import { SyncQueueService } from '../../services/syncQueueService';
import { formatEgyptianCurrency, formatEgyptianDate, getCairoCurrentDate, getEgyptianDayName } from '../../utils/egyptianTime';
import { PageHeader } from '../common/UiStates';
import { SectionHeader, StatCard } from '../common/UiMetrics';

interface AdminDashboardProps {
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRecord[];
  settings: SystemSettings;
  currentUser: User | null;
  onNavigate: (tab: string, filterParams?: any) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  employees,
  attendance,
  leaves,
  settings,
  currentUser,
  onNavigate,
}) => {
  const todayKey = getCairoCurrentDate();
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  // School Data
  const students = useMemo(() => storageService.getStudents(), []);
  const activeStudents = useMemo(() => students.filter(s => s.status === 'Active' || s.status === 'نشط'), [students]);
  const studentAttendance = useMemo(() => storageService.getStudentAttendance(), []);
  const todayStudentAtt = useMemo(() => studentAttendance.filter(a => a.date === selectedDate), [studentAttendance, selectedDate]);

  const studentPresentCount = todayStudentAtt.filter(a => a.status === 'حاضر').length;
  const studentLateCount = todayStudentAtt.filter(a => a.status === 'متأخر').length;
  const studentAbsentCount = todayStudentAtt.filter(a => a.status.includes('غائب')).length;
  const studentUnrecordedCount = Math.max(0, activeStudents.length - todayStudentAtt.length);
  const studentAttRate = activeStudents.length > 0 ? Math.round(((studentPresentCount + studentLateCount) / activeStudents.length) * 100) : 0;

  // HR & Staff Attendance
  const activeEmployees = useMemo(() => employees.filter(e => e.status === 'Active'), [employees]);
  const todayTeacherAtt = useMemo(() => attendance.filter(a => a.date === selectedDate), [attendance, selectedDate]);
  const teacherPresentCount = todayTeacherAtt.filter(a => a.status === 'حاضر').length;
  const teacherLateCount = todayTeacherAtt.filter(a => a.status === 'متأخر').length;
  const teacherAbsentCount = todayTeacherAtt.filter(a => a.status.includes('غائب')).length;
  const teacherLeaveCount = todayTeacherAtt.filter(a => a.status.includes('إجازة')).length;
  const teacherUnrecordedCount = Math.max(0, activeEmployees.length - todayTeacherAtt.length);
  const teacherAttRate = activeEmployees.length > 0 ? Math.round(((teacherPresentCount + teacherLateCount) / activeEmployees.length) * 100) : 0;

  // Behavior
  const violations = useMemo(() => storageService.getBehaviorViolations(), []);
  const todayViolations = violations.filter(v => v.date === selectedDate);
  const totalViolationsCount = violations.length;
  const cases = useMemo(() => storageService.getBehaviorCases(), []);
  const activeCasesCount = cases.filter(c => c.status === 'ACTIVE' || c.status === 'UNDER_FOLLOWUP').length;

  // Schedule & Lessons
  const schedule = useMemo(() => storageService.getSchedule(), []);
  const substitutions = useMemo(() => storageService.getSubstitutions(), []);
  const todaySubstitutions = substitutions.filter(s => s.date === selectedDate);
  const pendingSubstitutions = todaySubstitutions.filter(s => s.status === 'PENDING');
  const lessons = useMemo(() => storageService.getLessonContents(), []);
  const todayDayName = getEgyptianDayName(selectedDate);
  const todayPeriods = schedule.filter(s => s.dayName === todayDayName);
  const todayLessonsLogged = lessons.filter(l => l.date === selectedDate);
  const missingLessonsCount = Math.max(0, todayPeriods.length - todayLessonsLogged.length);
  const lessonCoverageRate = todayPeriods.length > 0 ? Math.round((todayLessonsLogged.length / todayPeriods.length) * 100) : 100;

  // Dynamic Pending Actions for Admin
  const adminPendingActions = useMemo(() => {
    return NotificationEngine.generatePendingActions('Admin', currentUser?.id || '001', {
      studentsCount: students.length,
      unrecordedAttendanceCount: studentUnrecordedCount,
      absentOverLimitCount: 0,
      pendingSubstitutionsCount: pendingSubstitutions.length,
      draftHomeworkCount: 0,
      pendingBehaviorFollowupsCount: activeCasesCount,
      syncFailedCount: SyncQueueService.getFailedCount(),
      missingLessonsCount,
      activeAcademicYearNeedsReview: false,
    });
  }, [students.length, studentUnrecordedCount, pendingSubstitutions.length, activeCasesCount, missingLessonsCount, currentUser?.id]);

  const userName = currentUser?.fullName?.split(' ')[0] || 'مدير النظام';

  return (
    <div className="space-y-6">
      {/* Top Welcome & Date Control */}
      <PageHeader
        title={`مرحباً، ${currentUser?.fullName || 'مدير النظام'}`}
        description="ملخص تشغيلي لما يحتاج إلى المتابعة اليوم في المدرسة."
        meta={<>الدور: مدير النظام</>}
        actions={<div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"><Calendar className="h-4 w-4 text-slate-400" /><span>{getEgyptianDayName(selectedDate)}، {formatEgyptianDate(selectedDate)}</span></div>
          <label className="sr-only" htmlFor="dashboard-date">تاريخ لوحة المتابعة</label>
          <input id="dashboard-date" type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#008e8b]/20" />
        </div>}
      />
      {/* Dynamic Pending Actions Card */}
      <PendingActionsCard
        userRole="Admin"
        actions={adminPendingActions}
        onExecuteAction={tab => onNavigate(tab)}
      />

      {/* 1. قسم شؤون الطلاب */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <GraduationCap className="w-4 h-4 text-[#008e8b]" />
            <span>شؤون الطلاب وحضور اليوم</span>
          </div>
          <button
            onClick={() => onNavigate('student_attendance')}
            className="text-xs font-bold text-[#008e8b] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>فتح شيت الحضور الكامل</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="الطلاب المقيدون" value={activeStudents.length} helper="طالب نشط بالعام الحالي" icon={<GraduationCap className="h-4 w-4" />} />
          <StatCard label="حضور اليوم" value={studentPresentCount} helper={<>نسبة الحضور: {studentAttRate}%</>} icon={<UserCheck className="h-4 w-4" />} tone="success" />
          <StatCard label="غياب وتأخير اليوم" value={studentAbsentCount} helper={<>{studentLateCount} متأخر — يحتاج متابعة</>} icon={<UserX className="h-4 w-4" />} tone="danger" />
          <StatCard label="غير مرصود بعد" value={studentUnrecordedCount} helper="بانتظار استكمال الرصد" icon={<ClockAlert className="h-4 w-4" />} tone="warning" />
        </div>
      </div>

      {/* 2. قسم شؤون المعلمين والموظفين */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <Users className="w-4 h-4 text-[#008e8b]" />
            <span>دوام المعلمين والموظفين اليوم</span>
          </div>
          <button
            onClick={() => onNavigate('daily_attendance')}
            className="text-xs font-bold text-[#008e8b] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>سجل الدوام المكتبي</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">إجمالي المعلمين</span>
              <span className="p-1.5 rounded-lg bg-teal-50 text-[#008e8b]"><Users className="w-4 h-4" /></span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">{activeEmployees.length}</div>
            <div className="text-[11px] text-slate-400 mt-1 font-semibold">معلم وموظف نشط</div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">حضور الكادر اليوم</span>
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600"><CheckCircle2 className="w-4 h-4" /></span>
            </div>
            <div className="text-2xl font-black text-emerald-600 mt-2">{teacherPresentCount}</div>
            <div className="text-[11px] text-emerald-700 mt-1 font-bold">نسبة التواجد: {teacherAttRate}%</div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">غياب وإجازات</span>
              <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600"><Clock className="w-4 h-4" /></span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-black text-rose-600">{teacherAbsentCount + teacherLeaveCount}</span>
              <span className="text-xs font-bold text-amber-600">({teacherLateCount} متأخر)</span>
            </div>
            <div className="text-[11px] text-rose-700 mt-1 font-semibold">({teacherLeaveCount}) إجازة رسمية</div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">حصص احتياطي اليوم</span>
              <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600"><Layers className="w-4 h-4" /></span>
            </div>
            <div className="text-2xl font-black text-purple-600 mt-2">{todaySubstitutions.length}</div>
            <div className="text-[11px] text-purple-700 mt-1 font-semibold">({pendingSubstitutions.length}) بانتظار التعيين</div>
          </div>
        </div>
      </div>

      {/* 3. قسم السلوك والرواتب (Admin Only) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Behavior Overview */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <Shield className="w-4 h-4 text-amber-500" />
              <span>الانضباط والحالات السلوكية</span>
            </div>
            <button
              onClick={() => onNavigate('behavior')}
              className="text-xs font-bold text-[#008e8b] hover:underline"
            >
              عرض السجل السلوكي
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/60">
              <span className="text-[11px] text-slate-500 font-bold">مخالفات مسجلة اليوم</span>
              <div className="text-xl font-black text-slate-900 mt-1">{todayViolations.length}</div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/60">
              <span className="text-[11px] text-slate-500 font-bold">حالات إرشاد نشطة</span>
              <div className="text-xl font-black text-amber-600 mt-1">{activeCasesCount}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
