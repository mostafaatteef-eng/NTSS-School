import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Calendar,
  Clock,
  BookOpen,
  FileText,
  Link,
  Award,
  Lock,
  LogOut,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  ExternalLink,
  Users,
  Shield,
  Layers,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import {
  Employee,
  ScheduleItem,
  TeacherLessonResource,
  Homework,
  ExamSchedule,
  TeacherLoadCalculation,
  User,
} from '../../types';
import { timetableService } from '../../services/timetableService';
import { storageService } from '../../services/storageService';
import { MyRequestsView } from '../leaves/MyRequestsView';
import { CurriculumPlansView } from './CurriculumPlansView';

interface TeacherPortalViewProps {
  currentUser?: User | null;
  onBackToLogin?: () => void;
}

export const TeacherPortalView: React.FC<TeacherPortalViewProps> = ({ onBackToLogin }) => {
  const [activeTeacher, setActiveTeacher] = useState<Employee | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(storageService.getTeacherSessionToken());
  const [portalTab, setPortalTab] = useState<'today' | 'weekly' | 'classes' | 'curriculum' | 'homework' | 'resources' | 'exams' | 'requests'>('today');

  // Teacher Login Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [pendingTeacher, setPendingTeacher] = useState<Employee | null>(null);
  const [newTeacherPassword, setNewTeacherPassword] = useState('');
  const [confirmTeacherPassword, setConfirmTeacherPassword] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);

  // Data states
  const [weeklySchedule, setWeeklySchedule] = useState<ScheduleItem[]>([]);
  const [loadStats, setLoadStats] = useState<TeacherLoadCalculation | null>(null);
  const [homeworkList, setHomeworkList] = useState<Homework[]>([]);
  const [resources, setResources] = useState<TeacherLessonResource[]>([]);
  const [exams, setExams] = useState<ExamSchedule[]>([]);

  // Add Homework Modal
  const [isHwModalOpen, setIsHwModalOpen] = useState(false);
  const [newHwTitle, setNewHwTitle] = useState('');
  const [newHwSubject, setNewHwSubject] = useState('');
  const [newHwClassroom, setNewHwClassroom] = useState('1/1');
  const [newHwDueDate, setNewHwDueDate] = useState('');
  const [newHwDesc, setNewHwDesc] = useState('');

  // Add Resource Modal
  const [isResModalOpen, setIsResModalOpen] = useState(false);
  const [resSubject, setResSubject] = useState('');
  const [resClassroom, setResClassroom] = useState('1/1');
  const [resTopic, setResTopic] = useState('');
  const [resPrepUrl, setResPrepUrl] = useState('');
  const [resPresUrl, setResPresUrl] = useState('');
  const [resStudentUrl, setResStudentUrl] = useState('');
  const [contentSaving, setContentSaving] = useState<'homework' | 'resource' | null>(null);
  const [homeworkSaveError, setHomeworkSaveError] = useState('');
  const [resourceSaveError, setResourceSaveError] = useState('');
  const [portalNotice, setPortalNotice] = useState('');

  // Teacher portal access is session-authoritative. Stored session metadata is
  // never sufficient by itself; the token is revalidated by the backend.
  useEffect(() => {
    let cancelled = false;

    const restoreTeacherSession = async () => {
      const session = storageService.getTeacherSession();
      if (!session?.teacherSessionToken) {
        setSessionToken(null);
        setActiveTeacher(null);
        return;
      }

      const validation = await storageService.validateTeacherPortalSession();
      if (cancelled) return;

      if (!validation.success || !validation.employee) {
        setSessionToken(null);
        setActiveTeacher(null);
        if (validation.code !== 'SERVICE_UNAVAILABLE') {
          setLoginError(validation.message || 'انتهت جلسة المعلم. يرجى تسجيل الدخول مجدداً.');
        }
        return;
      }

      setSessionToken(storageService.getTeacherSessionToken());
      setPendingTeacher(validation.employee);

      if (validation.mustChangePassword) {
        setMustChangePassword(true);
        setActiveTeacher(null);
        return;
      }

      setMustChangePassword(false);
      selectTeacher(validation.employee, validation.data);
    };

    void restoreTeacherSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectTeacher = (teacher: Employee, portalData?: any) => {
    setActiveTeacher(teacher);

    if (portalData) {
      setWeeklySchedule(Array.isArray(portalData.schedule) ? portalData.schedule : []);
      setHomeworkList(Array.isArray(portalData.homework) ? portalData.homework : []);
      setResources(
        Array.isArray(portalData.resources)
          ? portalData.resources.map((resource: any) => ({
              id: String(resource.id || ''),
              teacherId: String(resource.teacherId || teacher.id),
              subjectId: String(resource.subjectId || resource.subject || ''),
              classroomId: String(resource.classroomId || resource.classroom || ''),
              gradeId: resource.gradeId ? String(resource.gradeId) : undefined,
              academicYearId: resource.academicYearId ? String(resource.academicYearId) : undefined,
              date: resource.date ? String(resource.date) : undefined,
              periodNumber: resource.periodNumber ? Number(resource.periodNumber) : undefined,
              preparationUrl: resource.preparationUrl || resource.preparationNotesUrl || undefined,
              presentationUrl: resource.presentationUrl || undefined,
              studentResourceUrl: resource.studentResourceUrl || undefined,
              teacherNotes: resource.teacherNotes || resource.topic || resource.title || '',
              visibility: resource.visibility === 'Published' ? 'Published' : 'Draft',
              createdAt: resource.createdAt || undefined,
              updatedAt: resource.updatedAt || undefined,
            }))
          : []
      );
      setExams(Array.isArray(portalData.examDuties) ? portalData.examDuties : []);
      setLoadStats(null);
      return;
    }

    // Fallback is used only after an authoritative teacher session has already
    // been validated. It is not an authentication or authorization source.
    const schedule = timetableService.getTeacherWeeklySchedule(teacher.id);
    setWeeklySchedule(schedule);
    setLoadStats(timetableService.calculateTeacherLoad(teacher.id));
    setHomeworkList(storageService.getHomeworks().filter(h => h.teacherId === teacher.id || h.teacherName === teacher.name));
    setResources(timetableService.getTeacherLessonResources({ teacherId: teacher.id }));
    setExams(timetableService.getExamSchedules().filter(
      e => e.status === 'PUBLISHED' || (e.status as any) === 'Published'
    ));
  };

  const refreshAuthoritativePortalData = async (): Promise<boolean> => {
    const validation = await storageService.validateTeacherPortalSession();
    if (!validation.success || !validation.employee) {
      if (!storageService.getTeacherSession()) {
        setSessionToken(null);
        setActiveTeacher(null);
        setPendingTeacher(null);
      }
      return false;
    }

    setPendingTeacher(validation.employee);
    setSessionToken(storageService.getTeacherSessionToken());
    selectTeacher(validation.employee, validation.data);
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser) {
      setLoginError('يرجى إدخال اسم المستخدم (Username)');
      return;
    }

    if (!cleanPass) {
      setLoginError('يرجى إدخال كلمة المرور (Password)');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await storageService.teacherLogin(cleanUser, cleanPass);
      if (!res.success || !res.teacherSessionToken) {
        setLoginError(res.message || 'بيانات الدخول غير صحيحة');
        return;
      }

      setSessionToken(res.teacherSessionToken);
      if (res.employee) {
        setPendingTeacher(res.employee);
      }

      if (res.mustChangePassword) {
        setMustChangePassword(true);
        setActiveTeacher(null);
        setPassword('');
        return;
      }

      const validation = await storageService.validateTeacherPortalSession();
      if (!validation.success || !validation.employee) {
        setSessionToken(null);
        setActiveTeacher(null);
        setLoginError(validation.message || 'تعذر التحقق من جلسة المعلم بعد تسجيل الدخول.');
        return;
      }

      setMustChangePassword(false);
      selectTeacher(validation.employee, validation.data);
    } catch {
      setLoginError('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForcedPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError(null);

    if (newTeacherPassword.length < 8) {
      setPasswordChangeError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.');
      return;
    }
    if (newTeacherPassword !== confirmTeacherPassword) {
      setPasswordChangeError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setIsSubmitting(true);
    try {
      const changed = await storageService.changeTeacherPassword(newTeacherPassword);
      if (!changed.success || !changed.teacherSessionToken) {
        setPasswordChangeError(changed.message || 'تعذر تغيير كلمة المرور.');
        return;
      }

      const validation = await storageService.validateTeacherPortalSession();
      if (!validation.success || !validation.employee) {
        setPasswordChangeError(validation.message || 'تم تغيير كلمة المرور ولكن تعذر التحقق من الجلسة الجديدة.');
        return;
      }

      setSessionToken(changed.teacherSessionToken);
      setMustChangePassword(false);
      setNewTeacherPassword('');
      setConfirmTeacherPassword('');
      setPassword('');
      setPendingTeacher(validation.employee);
      selectTeacher(validation.employee, validation.data);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    storageService.logoutTeacher();
    setSessionToken(null);
    setActiveTeacher(null);
    setPendingTeacher(null);
    setMustChangePassword(false);
    setNewTeacherPassword('');
    setConfirmTeacherPassword('');
    if (onBackToLogin) {
      onBackToLogin();
    }
  };

  // Days and periods for weekly grid
  const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
  const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

  // Today's lessons
  const dayMap = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const todayName = dayMap[new Date().getDay()] || 'الأحد';
  const todayLessons = weeklySchedule.filter(s => s.dayOfWeek === todayName || s.dayName === todayName);

  // Homework submission
  const handleSaveHomework = async () => {
    if (!activeTeacher || !newHwTitle.trim() || contentSaving) return;

    setContentSaving('homework');
    setHomeworkSaveError('');
    setPortalNotice('');

    const result = await storageService.saveTeacherHomeworkDraftAuthoritative({
      title: newHwTitle,
      description: newHwDesc,
      subject: newHwSubject || 'العلوم التقنية التخصصية',
      grade: newHwClassroom.startsWith('1')
        ? 'الصف الأول الثانوي'
        : newHwClassroom.startsWith('2')
          ? 'الصف الثاني الثانوي'
          : 'الصف الثالث الثانوي',
      classroom: newHwClassroom,
      assignedDate: new Date().toISOString().split('T')[0],
      dueDate: newHwDueDate || new Date().toISOString().split('T')[0],
    });

    if (!result.success) {
      setHomeworkSaveError(result.message || 'تعذر حفظ مسودة الواجب.');
      if (!storageService.getTeacherSession()) {
        setSessionToken(null);
        setActiveTeacher(null);
      }
      setContentSaving(null);
      return;
    }

    const refreshed = await refreshAuthoritativePortalData();
    if (!refreshed) {
      setHomeworkSaveError('تم الحفظ، لكن تعذر إعادة تحميل بيانات البوابة من الخادم.');
      setContentSaving(null);
      return;
    }

    setIsHwModalOpen(false);
    setNewHwTitle('');
    setNewHwSubject('');
    setNewHwDesc('');
    setNewHwDueDate('');
    setPortalNotice(result.message || 'تم حفظ الواجب كمسودة للمراجعة.');
    setContentSaving(null);
  };

  // Resource submission
  const handleSaveResource = async () => {
    if (!activeTeacher || !resTopic.trim() || contentSaving) return;

    setContentSaving('resource');
    setResourceSaveError('');
    setPortalNotice('');

    const result = await storageService.saveTeacherResourceDraftAuthoritative({
      title: resTopic,
      topic: resTopic,
      subject: resSubject,
      classroom: resClassroom,
      preparationNotesUrl: resPrepUrl,
      presentationUrl: resPresUrl,
      studentResourceUrl: resStudentUrl,
    });

    if (!result.success) {
      setResourceSaveError(result.message || 'تعذر حفظ مسودة المورد.');
      if (!storageService.getTeacherSession()) {
        setSessionToken(null);
        setActiveTeacher(null);
      }
      setContentSaving(null);
      return;
    }

    const refreshed = await refreshAuthoritativePortalData();
    if (!refreshed) {
      setResourceSaveError('تم الحفظ، لكن تعذر إعادة تحميل بيانات البوابة من الخادم.');
      setContentSaving(null);
      return;
    }

    setIsResModalOpen(false);
    setResTopic('');
    setResSubject('');
    setResPrepUrl('');
    setResPresUrl('');
    setResStudentUrl('');
    setPortalNotice(result.message || 'تم حفظ المورد كمسودة للمراجعة.');
    setContentSaving(null);
  };

  if (mustChangePassword && sessionToken && pendingTeacher) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-6" dir="rtl">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">تغيير كلمة المرور مطلوب</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            تم تسجيل الدخول بكلمة مرور مؤقتة. يجب تعيين كلمة مرور جديدة قبل فتح بوابة المعلم.
          </p>
        </div>

        {passwordChangeError && (
          <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs font-bold text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{passwordChangeError}</div>
          </div>
        )}

        <form onSubmit={handleForcedPasswordChange} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">كلمة المرور الجديدة</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newTeacherPassword}
              onChange={e => setNewTeacherPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">تأكيد كلمة المرور الجديدة</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmTeacherPassword}
              onChange={e => setConfirmTeacherPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSubmitting ? 'جارٍ تغيير كلمة المرور...' : 'تعيين كلمة المرور والدخول'}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600"
          >
            تسجيل الخروج
          </button>
        </form>
      </div>
    );
  }

  // LOGIN SCREEN if no teacher is authenticated
  if (!activeTeacher) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-6" dir="rtl">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">بوابة المعلم — الدخول الآمن</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            يرجى تسجيل الدخول باستخدام اسم المستخدم وكلمة المرور المسلمة لك من الإدارة المدرسية
          </p>
        </div>

        {loginError && (
          <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs font-bold text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{loginError}</div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              اسم المستخدم للمعلم (Username)
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              placeholder="أدخل اسم المستخدم (مثال: ahmed.hassan)"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              كلمة المرور (Password)
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="أدخل كلمة المرور"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <span>جاري التحقق من الحساب...</span>
            ) : (
              <span>تسجيل الدخول لبوابة المعلم</span>
            )}
          </button>
        </form>

        <div className="pt-2 text-center">
          <p className="text-[11px] text-slate-400">
            أمان الحسابات: يتم تجميد الحساب لمدة 15 دقيقة تلقائياً بعد 5 محاولات دخول خاطئة. في حال فقدان كلمة المرور، يرجى مراجعة إدارة المدرسة وشؤون المعلمين.
          </p>
        </div>

        {onBackToLogin && (
          <div className="border-t border-slate-100 pt-4 text-center">
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-xs text-slate-500 hover:text-slate-800 font-bold transition"
            >
              العودة لشاشة الدخول الرئيسية
            </button>
          </div>
        )}
      </div>
    );
  }

  // AUTHENTICATED TEACHER PORTAL
  const authoritativeTeacherSession = storageService.getTeacherSession();
  const teacherSchoolId = String(authoritativeTeacherSession?.schoolId || '').trim();
  const teacherPortalUser: User = {
    id: activeTeacher.id,
    username: authoritativeTeacherSession?.username || activeTeacher.teacherCode || activeTeacher.name,
    fullName: activeTeacher.name,
    role: 'Teacher',
    accessScope: 'SELF',
    employeeId: activeTeacher.id,
    schoolId: teacherSchoolId,
    activeSchoolId: teacherSchoolId,
    allowedSchoolIds: teacherSchoolId ? [teacherSchoolId] : [],
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Teacher Portal Independent Header & Security Guard Banner */}
      <div className="bg-indigo-900 text-white p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="font-bold">بوابة المعلم المستقلة</span>
          <span className="text-indigo-200">|</span>
          <span className="text-indigo-200 text-[11px]">
            جلسة مؤمنة بتوكن معتمد: <span className="font-mono text-emerald-300">{sessionToken ? `${sessionToken.substring(0, 16)}...` : 'نشطة'}</span>
          </span>
        </div>
        <div className="text-[11px] text-indigo-300">
          حساب المعلم معزول تماماً عن نظام ERP الإداري
        </div>
      </div>

      {portalNotice && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {portalNotice}
        </div>
      )}

      {/* Teacher Profile Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-bold text-lg shadow-sm">
            {activeTeacher.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{activeTeacher.name}</h2>
              {activeTeacher.teacherCode && (
                <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  كود المعلم: {activeTeacher.teacherCode}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeTeacher.specialization || 'معلم مواد تخصصية'} • {activeTeacher.department || 'هيئة التدريس'}
            </p>
          </div>
        </div>

        {/* Supervisor Teacher Switcher OR Load Summary */}
        <div className="flex flex-wrap items-center gap-3">
          {loadStats && (
            <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-xs flex items-center gap-3">
              <div>
                <span className="text-slate-400 block text-[10px]">نصابي الأسبوعي</span>
                <span className="font-bold text-slate-800">
                  {loadStats.totalCountedPeriods} / {loadStats.maxAllowedPeriods} حصة
                </span>
              </div>
              <div className="border-r pr-3">
                <span className="text-slate-400 block text-[10px]">احتياطي الأسبوع</span>
                <span className="font-bold text-amber-700">{loadStats.reservePeriodsThisWeek}</span>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
            title="تسجيل الخروج من بوابة المعلم"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Portal Navigation Tabs */}
      <div className="inline-flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 text-xs font-bold flex-wrap gap-1">
        <button
          onClick={() => setPortalTab('today')}
          className={`px-4 py-2 rounded-xl transition ${
            portalTab === 'today' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          حصص اليوم ({todayLessons.length})
        </button>
        <button
          onClick={() => setPortalTab('weekly')}
          className={`px-4 py-2 rounded-xl transition ${
            portalTab === 'weekly' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          جدولي الأسبوعي
        </button>
        <button
          onClick={() => setPortalTab('curriculum')}
          className={`px-4 py-2 rounded-xl transition ${
            portalTab === 'curriculum' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          خطة المنهج وتوزيع الحصص
        </button>
        <button
          onClick={() => setPortalTab('homework')}
          className={`px-4 py-2 rounded-xl transition ${
            portalTab === 'homework' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          الواجبات المنزلية ({homeworkList.length})
        </button>
        <button
          onClick={() => setPortalTab('resources')}
          className={`px-4 py-2 rounded-xl transition ${
            portalTab === 'resources' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          تحضير الدرس والمصادر ({resources.length})
        </button>
        <button
          onClick={() => setPortalTab('exams')}
          className={`px-4 py-2 rounded-xl transition ${
            portalTab === 'exams' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          جدول الامتحانات المنشور ({exams.length})
        </button>
        <button
          onClick={() => setPortalTab('requests')}
          className={`px-4 py-2 rounded-xl transition ${
            portalTab === 'requests' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          إجازاتي وأذوناتي
        </button>
      </div>

      {/* TAB 1: TODAY'S LESSONS */}
      {portalTab === 'today' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              حصص اليوم ({todayName})
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {new Date().toISOString().split('T')[0]}
            </span>
          </div>

          {todayLessons.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-400 text-xs">
              لا توجد حصص مجدولة لك اليوم. نتمنى لك يوماً سعيداً!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {todayLessons.map(lesson => (
                <div key={lesson.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
                      الحصة {lesson.periodNumber}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {lesson.startTime} - {lesson.endTime}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-slate-900">{lesson.subject}</h4>
                    <div className="text-xs text-slate-600 flex items-center gap-1.5 mt-1">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      <span>الصف: {lesson.grade} — فصل {lesson.classroom}</span>
                    </div>
                    {lesson.room && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        المقر: <strong>{lesson.room}</strong>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: WEEKLY SCHEDULE */}
      {portalTab === 'weekly' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                      const item = weeklySchedule.find(
                        s => (s.dayOfWeek === d || s.dayName === d) && s.periodNumber === p
                      );
                      return (
                        <td key={p} className="p-2 border-l border-slate-200 align-top">
                          {item ? (
                            <div className="p-2 rounded-xl bg-indigo-50/70 border border-indigo-200 text-right space-y-1">
                              <div className="font-bold text-slate-900 line-clamp-1">{item.subject}</div>
                              <div className="text-slate-600 text-[11px]">فصل {item.classroom}</div>
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
      )}

      {/* TAB: CURRICULUM PLANS & DISTRIBUTION */}
      {portalTab === 'curriculum' && (
        <div>
          <CurriculumPlansView currentUser={teacherPortalUser} />
        </div>
      )}

      {/* TAB 3: HOMEWORK */}
      {portalTab === 'homework' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              الواجبات المنزلية والمهام المكلف بها الطلاب
            </h3>
            <button
              onClick={() => { setHomeworkSaveError(''); setIsHwModalOpen(true); }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              إضافة واجب جديد
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {homeworkList.map(hw => (
              <div key={hw.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                    فصل {hw.classroom}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">تسليم: {hw.dueDate}</span>
                </div>
                <h4 className="font-bold text-sm text-slate-900">{hw.title}</h4>
                <p className="text-xs text-slate-500 line-clamp-2">{hw.description}</p>
                <div className="text-[11px] text-slate-400 pt-2 border-t">المادة: {hw.subject}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: LESSON RESOURCES */}
      {portalTab === 'resources' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Link className="w-4 h-4 text-indigo-600" />
                روابط تحضير الدرس ومصادر الطلاب
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تخزين روابط تحضير الدرس الخاصة، عروض الشرائح، وروابط المصادر المنشورة للطلاب
              </p>
            </div>
            <button
              onClick={() => { setResourceSaveError(''); setIsResModalOpen(true); }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              إضافة مصادر درس جديد
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {resources.map(res => (
              <div key={res.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-700">فصل {res.classroomId}</span>
                  <span className="text-[10px] text-slate-400">مادة تخصصية</span>
                </div>
                <h4 className="font-bold text-sm text-slate-900">{res.teacherNotes || 'تحضير درس'}</h4>

                <div className="space-y-1.5 pt-2 border-t text-xs">
                  {res.preparationUrl && (
                    <a
                      href={res.preparationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-indigo-600 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      رابط التحضير الخاص بالمعلم
                    </a>
                  )}
                  {res.presentationUrl && (
                    <a
                      href={res.presentationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-purple-600 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      عرض الدرس (Presentation / Slides)
                    </a>
                  )}
                  {res.studentResourceUrl && (
                    <a
                      href={res.studentResourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-emerald-600 hover:underline font-bold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      المصادر والملفات المنشورة للطلاب
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: PUBLISHED EXAMS */}
      {portalTab === 'exams' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <h3 className="font-bold text-sm text-slate-800">مواعيد الامتحانات والاختبارات المنشورة</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                <tr>
                  <th className="p-3">المادة</th>
                  <th className="p-3">نوع الامتحان</th>
                  <th className="p-3">الصف</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3 text-center">التوقيت</th>
                  <th className="p-3 text-center">المدة</th>
                  <th className="p-3">القاعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{e.subjectName}</td>
                    <td className="p-3">{e.examType}</td>
                    <td className="p-3 text-slate-600">{e.gradeName}</td>
                    <td className="p-3 font-mono">{e.examDate}</td>
                    <td className="p-3 text-center font-mono font-bold">{e.startTime}</td>
                    <td className="p-3 text-center">{e.durationMinutes} دقيقة</td>
                    <td className="p-3 text-slate-600">{e.roomName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: MY REQUESTS (LEAVES & PERMISSIONS) */}
      {portalTab === 'requests' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <MyRequestsView
            currentUser={teacherPortalUser}
            authMode="teacher"
          />
        </div>
      )}

      {/* Add Homework Modal */}
      {isHwModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">إضافة واجب منزلي جديد</h3>
              <button onClick={() => setIsHwModalOpen(false)} className="text-slate-400 text-lg">
                ✕
              </button>
            </div>

            {homeworkSaveError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                {homeworkSaveError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">عنوان الواجب</label>
                <input
                  type="text"
                  value={newHwTitle}
                  onChange={e => setNewHwTitle(e.target.value)}
                  placeholder="مثال: حل تطبيقات الدوائر الإلكترونية ص 45"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الفصل</label>
                  <select
                    value={newHwClassroom}
                    onChange={e => setNewHwClassroom(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="1/1">فصل 1/1</option>
                    <option value="1/2">فصل 1/2</option>
                    <option value="2/1">فصل 2/1</option>
                    <option value="2/2">فصل 2/2</option>
                    <option value="3/1">فصل 3/1</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاريخ التسليم</label>
                  <input
                    type="date"
                    value={newHwDueDate}
                    onChange={e => setNewHwDueDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">تفاصيل وملاحظات الواجب</label>
                <textarea
                  value={newHwDesc}
                  onChange={e => setNewHwDesc(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <button
                onClick={() => setIsHwModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800"
              >
                إلغاء
              </button>
              <button
                onClick={() => void handleSaveHomework()}
                disabled={contentSaving !== null}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {contentSaving === 'homework' ? 'جارٍ الحفظ...' : 'حفظ كمسودة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Resource Modal */}
      {isResModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">إضافة مصادر درس ومادة تعليمية</h3>
              <button onClick={() => setIsResModalOpen(false)} className="text-slate-400 text-lg">
                ✕
              </button>
            </div>

            {resourceSaveError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                {resourceSaveError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">موضوع الدرس</label>
                <input
                  type="text"
                  value={resTopic}
                  onChange={e => setResTopic(e.target.value)}
                  placeholder="مثال: مقدمة في شبكات الحاسب وتوزيع الـ IP"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الفصل</label>
                  <select
                    value={resClassroom}
                    onChange={e => setResClassroom(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="1/1">فصل 1/1</option>
                    <option value="1/2">فصل 1/2</option>
                    <option value="2/1">فصل 2/1</option>
                    <option value="2/2">فصل 2/2</option>
                    <option value="3/1">فصل 3/1</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">المادة</label>
                  <input
                    type="text"
                    value={resSubject}
                    onChange={e => setResSubject(e.target.value)}
                    placeholder="العلوم التقنية"
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  رابط التحضير الخاص بالمعلم (خاص فقط)
                </label>
                <input
                  type="url"
                  value={resPrepUrl}
                  onChange={e => setResPrepUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  رابط العرض التقديمي (Slides)
                </label>
                <input
                  type="url"
                  value={resPresUrl}
                  onChange={e => setResPresUrl(e.target.value)}
                  placeholder="https://docs.google.com/presentation/..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 text-emerald-700">
                  رابط مصدر مقترح للطلاب (يظهر فقط بعد الاعتماد)
                </label>
                <input
                  type="url"
                  value={resStudentUrl}
                  onChange={e => setResStudentUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <button
                onClick={() => setIsResModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800"
              >
                إلغاء
              </button>
              <button
                onClick={() => void handleSaveResource()}
                disabled={contentSaving !== null}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {contentSaving === 'resource' ? 'جارٍ الحفظ...' : 'حفظ كمسودة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
