import {
  AcademicYear,
  AlertRuleItem,
  AllowanceTypeItem,
  AttendanceDay,
  AttendanceDayStatus,
  AttendanceException,
  AttendanceRecord,
  AttendanceStatus,
  AuditLogEntry,
  BehaviorCase,
  BehaviorCaseStatus,
  BehaviorFollowup,
  BehaviorLevelItem,
  BehaviorScoreLedger,
  BehaviorType,
  BehaviorViolation,
  ClassAttendanceRecord,
  ClassroomItem,
  ComprehensiveEvaluation,
  ConflictRuleConfig,
  CorrectiveAction,
  CorrectiveActionStatus,
  CurriculumMasterPlan,
  CurriculumLessonDistribution,
  DailyQualityReport,
  DeductionTypeItem,
  DepartmentItem,
  DomainScore,
  Employee,
  GradeItem,
  Homework,
  JobTitleItem,
  LeaveRecord,
  LeaveType,
  LeaveTypeConfig,
  LessonContent,
  LessonInstance,
  LocationItem,
  ParentCommunicationLog,
  PermissionMatrix,
  PermissionTypeConfig,
  PositiveBehaviorType,
  PromotionRule,
  PublicClassScheduleDTO,
  PublicClassScheduleLesson,
  QualityMetricOverview,
  QualityStandard,
  StandardScore,
  TeacherVisitReport,
  ScheduleConfig,
  ScheduleItem,
  SchedulePeriodItem,
  ScheduleSubstitution,
  Student,
  StudentAttendanceRecord,
  StudentAttendanceStatusConfig,
  StudentEnrollment,
  StudentTransferHistory,
  SubjectItem,
  School,
  SyncStatus,
  SystemSettings,
  TeacherAccount,
  TeacherLessonResource,
  TeacherSession,
  Term,
  User,
  normalizeStaffRole,
} from '../types';
import { EmployeePermissionRecord } from '../types_extended';
import {
  MASTER_SCHOOLS_KEY,
  ACTIVE_SCHOOL_KEY,
} from './migrationScope014MultiSchool';
import {
  DEFAULT_ACADEMIC_YEARS,
  DEFAULT_ALERT_RULES,
  DEFAULT_ALLOWANCE_TYPES,
  DEFAULT_BEHAVIOR_LEVELS,
  DEFAULT_BEHAVIOR_RULES,
  DEFAULT_BEHAVIOR_TYPES,
  DEFAULT_CLASSROOMS,
  DEFAULT_CONFLICT_RULES,
  DEFAULT_DASHBOARD_SETTINGS,
  DEFAULT_DEDUCTION_TYPES,
  DEFAULT_DEPARTMENTS,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_GRADES,
  DEFAULT_HOLIDAYS,
  DEFAULT_IMPORT_SETTINGS,
  DEFAULT_JOB_TITLES,
  DEFAULT_LEAVE_TYPES,
  DEFAULT_LOCATIONS,
  DEFAULT_PARENT_PORTAL_SETTINGS,
  DEFAULT_PERMISSION_MATRIX,
  DEFAULT_PERMISSION_TYPES,
  DEFAULT_POSITIVE_BEHAVIOR_TYPES,
  DEFAULT_PROMOTION_RULES,
  DEFAULT_SCHEDULE_CONFIG,
  DEFAULT_SOCIAL_SPECIALIST_SETTINGS,
  DEFAULT_STAGES,
  DEFAULT_STUDENT_ATTENDANCE_RULES,
  DEFAULT_STUDENT_ATTENDANCE_STATUSES,
  DEFAULT_SUBJECTS,
  DEFAULT_TEACHER_ATTENDANCE_RULES,
  DEFAULT_TEACHER_PORTAL_SETTINGS,
  INITIAL_SETTINGS,
} from '../data/initialData';
import { getCairoCurrentDate, getCairoCurrentTime, getCairoNowISO, getEgyptianDayName } from '../utils/egyptianTime';
import {
  hashPasswordSHA256,
  hashPlainSHA256,
  derivePBKDF2Hash,
  generateCryptographicSalt,
  generateCryptographicToken
} from '../utils/cryptoUtils';
import { buildUnifiedAttendanceRecord, calculateAttendanceMetrics } from '../utils/attendanceUtils';
import { computeAttendanceDayReview, calculateStudentLateMinutes } from '../utils/attendanceEngine';
import { SyncQueueService } from './syncQueueService';
import { NotificationService } from './notificationService';
import { CANONICAL_BACKEND_SOURCE, CANONICAL_BACKEND_VERSION } from './googleSheetsAppScript';

const STORAGE_KEYS = {
  SETTINGS: 'ntss_school_settings_v3',
  EMPLOYEES: 'ntss_employees_v3',
  ATTENDANCE: 'ntss_attendance_v3',
  USERS: 'ntss_users_v3',
  CURRENT_USER: 'ntss_current_user_v3',
  LEAVES: 'ntss_leaves_v3',
  AUDIT_LOGS: 'ntss_audit_logs_v3',
  SYNC_STATUS: 'ntss_sync_status_v3',
  STUDENTS: 'ntss_students_v3',
  STUDENT_ATTENDANCE: 'ntss_student_attendance_v3',
  ATTENDANCE_DAYS: 'ntss_attendance_days_v3',
  ATTENDANCE_EXCEPTIONS: 'ntss_attendance_exceptions_v3',
  CLASS_ATTENDANCE: 'ntss_class_attendance_v3',
  BEHAVIOR_TYPES: 'ntss_behavior_types_v3',
  POSITIVE_BEHAVIOR_TYPES: 'ntss_positive_behavior_types_v3',
  BEHAVIOR_VIOLATIONS: 'ntss_behavior_violations_v3',
  BEHAVIOR_LEDGER: 'ntss_behavior_ledger_v3',
  BEHAVIOR_CASES: 'ntss_behavior_cases_v3',
  SCHEDULE: 'ntss_schedule_v3',
  SCHEDULE_SUBSTITUTIONS: 'ntss_schedule_substitutions_v3',
  LESSON_INSTANCES: 'ntss_lesson_instances_v3',
  LESSON_CONTENT: 'ntss_lesson_content_v3',
  SYNC_QUEUE: 'ntss_sync_queue_v3',
  NOTIFICATIONS: 'ntss_notifications_v3',
  ACADEMIC_YEARS: 'ntss_academic_years_v3',
  STUDENT_ENROLLMENTS: 'ntss_student_enrollments_v3',
  STUDENT_TRANSFERS: 'ntss_student_transfers_v3',
  PROMOTION_RULES: 'ntss_promotion_rules_v3',
  PARENT_COMMUNICATIONS: 'ntss_parent_communications_v3',
  LOCATIONS: 'ntss_locations_v3',
  HOMEWORKS: 'ntss_homeworks_v3',
  PERMISSIONS: 'ntss_permissions_v3',
  TEACHER_ACCOUNTS: 'ntss_teacher_accounts_v3',
  TEACHER_SESSION: 'ntss_teacher_session_v3',
  CURRICULUM_PLANS: 'ntss_curriculum_plans_v3',
  CURRICULUM_DISTRIBUTIONS: 'ntss_curriculum_distributions_v3',
  QUALITY_STANDARDS: 'ntss_quality_standards_v1',
  DAILY_QUALITY_REPORTS: 'ntss_daily_quality_reports_v1',
  TEACHER_VISIT_REPORTS: 'ntss_teacher_visit_reports_v1',
  COMPREHENSIVE_EVALUATIONS: 'ntss_comprehensive_evaluations_v1',
  CORRECTIVE_ACTIONS: 'ntss_corrective_actions_v1',
};

const DEFAULT_BACKEND_URL =
  ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_APPS_SCRIPT_URL) as string) ||
  'https://script.google.com/macros/s/AKfycbzw0kggQMGHdusMyKZOuqMC8eLiBzGccm7e7tdZbnMjvyBDqXPgI5f0tiJPKMFYAoln/exec';

// Universal localStorage fallback for Node.js / test environments
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).localStorage === 'undefined') {
  const memoryStore = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => memoryStore.set(k, String(v)),
    removeItem: (k: string) => memoryStore.delete(k),
    clear: () => memoryStore.clear(),
    key: (i: number) => Array.from(memoryStore.keys())[i] ?? null,
    get length() {
      return memoryStore.size;
    },
  };
}

class StorageService {
  private subscribers: Array<() => void> = [];
  private autoSyncInterval: any = null;

  constructor() {
    this.initDefaults();
    this.startAutoSync();
  }

  private initDefaults(): void {
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(INITIAL_SETTINGS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.BEHAVIOR_TYPES)) {
      localStorage.setItem(STORAGE_KEYS.BEHAVIOR_TYPES, JSON.stringify(DEFAULT_BEHAVIOR_TYPES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ACADEMIC_YEARS)) {
      localStorage.setItem(STORAGE_KEYS.ACADEMIC_YEARS, JSON.stringify(DEFAULT_ACADEMIC_YEARS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.POSITIVE_BEHAVIOR_TYPES)) {
      localStorage.setItem(STORAGE_KEYS.POSITIVE_BEHAVIOR_TYPES, JSON.stringify(DEFAULT_POSITIVE_BEHAVIOR_TYPES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.PROMOTION_RULES)) {
      localStorage.setItem(STORAGE_KEYS.PROMOTION_RULES, JSON.stringify(DEFAULT_PROMOTION_RULES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.LOCATIONS)) {
      localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(DEFAULT_LOCATIONS));
    }

    // Auto-bootstrap student enrollments for existing students without enrollments
    this.bootstrapStudentEnrollments();
  }

  private bootstrapStudentEnrollments(): void {
    try {
      const enrollmentsRaw = localStorage.getItem(STORAGE_KEYS.STUDENT_ENROLLMENTS);
      const enrollments: StudentEnrollment[] = enrollmentsRaw ? JSON.parse(enrollmentsRaw) : [];
      const students = this.getStudents();
      const activeYear = this.getActiveAcademicYear() || DEFAULT_ACADEMIC_YEARS[0];

      if (students.length > 0 && enrollments.length === 0 && activeYear) {
        const now = getCairoNowISO();
        const initialEnrollments: StudentEnrollment[] = students.map((std, idx) => ({
          id: `ENR-${std.id}-${activeYear.id}`,
          studentId: std.id,
          academicYearId: activeYear.id,
          academicYearName: activeYear.name,
          grade: std.grade,
          classroom: std.classroom,
          section: std.section || 'أ',
          enrollmentDate: std.enrollmentDate || std.createdAt || activeYear.startDate,
          status: (std.status === 'غير نشط' ? 'INACTIVE' : std.status === 'منقول' ? 'TRANSFERRED' : 'ACTIVE') as any,
          promotionStatus: 'ENROLLED',
          createdAt: now,
          updatedAt: now,
        }));
        localStorage.setItem(STORAGE_KEYS.STUDENT_ENROLLMENTS, JSON.stringify(initialEnrollments));
      }
    } catch (e) {
      console.warn('Error bootstrapping student enrollments:', e);
    }
  }

  public subscribe(callback: () => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  public notifyChange(): void {
    this.subscribers.forEach(cb => cb());
  }

  public startAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }

    const settings = this.getSettings();
    const mins = Math.max(1, settings.autoSyncIntervalMinutes || 5);
    const url = settings.googleAppsScriptUrl || DEFAULT_BACKEND_URL;

    if (url && url.trim().length > 10) {
      this.autoSyncInterval = setInterval(() => {
        this.syncWithGoogleSheets(true).catch(() => {});
      }, mins * 60 * 1000);
    }
  }

  // In-memory cache for session validation to prevent hammering backend
  private sessionValidationCache: { [token: string]: { result: boolean; timestamp: number } } = {};

  public getBackendUrl(): string {
    const envUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_APPS_SCRIPT_URL as string) || '';
    const settings = this.getSettings();
    const configuredUrl = (settings.googleAppsScriptUrl || '').trim();

    if (configuredUrl && !configuredUrl.includes('AKfycbyw4O2Y6X5B6yN8U1M3Q4R5T6Y7U8I9O0P1A2S3D4F5G6H7J8K9')) {
      return configuredUrl;
    }
    if (envUrl && !envUrl.includes('AKfycbyw4O2Y6X5B6yN8U1M3Q4R5T6Y7U8I9O0P1A2S3D4F5G6H7J8K9')) {
      return envUrl;
    }
    return DEFAULT_BACKEND_URL;
  }

  // ---------------- Multi-School Architecture & Master Registry ----------------

  /**
   * Retrieves all registered schools from the Master Registry.
   * If not cached locally, returns the default isolated tenant seeds.
   */
  public getSchools(): School[] {
    try {
      const raw = localStorage.getItem(MASTER_SCHOOLS_KEY);
      if (raw) {
        const parsed: School[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [];
  }

  /**
   * Returns the currently active school ID.
   * Priority:
   * 1. Authenticated user authoritative context (currentUser.activeSchoolId -> currentUser.schoolId -> '')
   *    (Strictly no localStorage authority for authenticated users).
   * 2. Unauthenticated user: stored client UX preference (ACTIVE_SCHOOL_KEY), fallback to ''.
   *    (Zero fake defaults like SCH-BADR).
   */
  public getActiveSchoolId(): string {
    const current = this.getCurrentUser();
    if (current) {
      if (current.activeSchoolId && current.activeSchoolId.trim()) {
        return current.activeSchoolId.trim();
      }
      if (current.schoolId && current.schoolId.trim()) {
        return current.schoolId.trim();
      }
      return '';
    }
    const stored = localStorage.getItem(ACTIVE_SCHOOL_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
    return '';
  }

  /**
   * Persists the selected active school ID in client storage.
   */
  public setActiveSchoolId(schoolId: string): void {
    if (!schoolId) return;
    const cleanId = schoolId.trim();
    localStorage.setItem(ACTIVE_SCHOOL_KEY, cleanId);
    this.notifyChange();
  }

  /**
   * Returns the complete School descriptor object for the currently active school.
   * Returns School | null.
   * If no activeSchoolId or school not in cache: returns null (Zero fake fallbacks).
   */
  public getActiveSchool(): School | null {
    const activeId = this.getActiveSchoolId();
    if (!activeId) {
      return null;
    }
    const schools = this.getSchools();
    const found = schools.find(s => s.schoolId === activeId);
    return found || null;
  }

  /**
   * Dynamically fetches the list of active public schools from the Master Registry on the backend.
   */
  public async fetchPublicSchoolsFromBackend(): Promise<School[]> {
    const scriptUrl = this.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return this.getSchools();
    }
    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'publicSchools' }),
      });
      if (response.ok) {
        const res = await response.json();
        if (res.status === 'success' && Array.isArray(res.schools)) {
          const cleanSchools: School[] = res.schools.map((s: any) => ({
            schoolId: s.schoolId,
            schoolCode: s.schoolCode,
            schoolName: s.schoolName,
            status: s.status || 'Active',
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          }));
          localStorage.setItem(MASTER_SCHOOLS_KEY, JSON.stringify(cleanSchools));
          this.notifyChange();
          return cleanSchools;
        }
      }
    } catch (e) {
      console.warn('fetchPublicSchoolsFromBackend warning:', e);
    }
    return this.getSchools();
  }

  /**
   * Invalidates / clears all school-scoped data caches in client storage.
   * Called upon authoritative school switching to prevent stale school data bleeding.
   */
  public clearSchoolScopedCaches(): void {
    const keysToRemove = [
      STORAGE_KEYS.STUDENTS,
      STORAGE_KEYS.STUDENT_ATTENDANCE,
      STORAGE_KEYS.CLASS_ATTENDANCE,
      STORAGE_KEYS.EMPLOYEES,
      STORAGE_KEYS.ATTENDANCE,
      STORAGE_KEYS.ATTENDANCE_DAYS,
      STORAGE_KEYS.ATTENDANCE_EXCEPTIONS,
      STORAGE_KEYS.LEAVES,
      STORAGE_KEYS.PERMISSIONS,
      STORAGE_KEYS.BEHAVIOR_VIOLATIONS,
      STORAGE_KEYS.BEHAVIOR_LEDGER,
      STORAGE_KEYS.BEHAVIOR_CASES,
      STORAGE_KEYS.SCHEDULE,
      STORAGE_KEYS.SCHEDULE_SUBSTITUTIONS,
      STORAGE_KEYS.LESSON_INSTANCES,
      STORAGE_KEYS.LESSON_CONTENT,
      STORAGE_KEYS.STUDENT_ENROLLMENTS,
      STORAGE_KEYS.STUDENT_TRANSFERS,
      STORAGE_KEYS.PARENT_COMMUNICATIONS,
      STORAGE_KEYS.HOMEWORKS,
      STORAGE_KEYS.CURRICULUM_PLANS,
      STORAGE_KEYS.CURRICULUM_DISTRIBUTIONS,
      STORAGE_KEYS.QUALITY_STANDARDS,
      STORAGE_KEYS.DAILY_QUALITY_REPORTS,
      STORAGE_KEYS.TEACHER_VISIT_REPORTS,
      STORAGE_KEYS.COMPREHENSIVE_EVALUATIONS,
      STORAGE_KEYS.CORRECTIVE_ACTIONS,
    ];
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }

  /**
   * Phase 3C-A12: Authoritative System Admin School Switching.
   * Enforces server authority:
   * 1. Validates caller is SystemAdmin with GLOBAL scope.
   * 2. Calls backend 'switchActiveSchool' action with sessionToken and targetSchoolId.
   * 3. On backend success:
   *    - Clears school-scoped caches (prevents data bleeding).
   *    - Updates currentUser with server-authoritative activeSchoolId.
   *    - Updates client UX active school key.
   *    - Clears session validation cache to force re-verification.
   *    - Notifies observers.
   * 4. On failure: fails closed, keeps previous school context intact.
   */
  public async switchActiveSchool(targetSchoolId: string): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    user?: User;
    school?: Partial<School>;
  }> {
    const cleanTarget = String(targetSchoolId || '').trim().toUpperCase();
    if (!cleanTarget) {
      return { success: false, code: 'INVALID_SCHOOL_ID', message: 'يرجى تحديد مدرسة صالحة للتبديل إليها.' };
    }

    const currentUser = this.getCurrentUser();
    if (!currentUser || !this.isAuthenticated(currentUser)) {
      return { success: false, code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول بجلسة صالحة لتبديل سياق المدرسة.' };
    }

    if (currentUser.role !== 'SystemAdmin' || currentUser.accessScope !== 'GLOBAL') {
      return { success: false, code: 'SCHOOL_SWITCH_NOT_ALLOWED', message: 'تبديل المدرسة مخصص حصرياً لمدير النظام الشامل (SystemAdmin).' };
    }

    const allowed = (currentUser.allowedSchoolIds || []).map(id => id.trim().toUpperCase());
    if (!allowed.includes(cleanTarget)) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المدرسة المطلوبة خارج نطاق المدارس المصرح لك بالوصول إليها.' };
    }

    // Client UX guard: verify school is not inactive in local cache
    const masterSchools = this.getSchools();
    const targetSchoolObj = masterSchools.find(
      s => (s.schoolId || '').trim().toUpperCase() === cleanTarget
    );
    if (targetSchoolObj && targetSchoolObj.status === 'Inactive') {
      return {
        success: false,
        code: 'SCHOOL_INACTIVE',
        message: 'المدرسة المطلوبة غير مفعلة حالياً في النظام.',
      };
    }

    const scriptUrl = this.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return { success: false, code: 'AUTH_SERVICE_UNAVAILABLE', message: 'تعذر الاتصال بالخادم الخلفي المعتمد لتبديل سياق المدرسة.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'switchActiveSchool',
          sessionToken: currentUser.sessionToken,
          data: {
            targetSchoolId: cleanTarget,
          },
        }),
      });

      if (!response.ok) {
        try {
          const errRes = await response.json();
          if (errRes && errRes.code) {
            return {
              success: false,
              code: errRes.code,
              message: errRes.message || `خطأ في استجابة الخادم (${response.status}) أثناء تبديل المدرسة.`,
            };
          }
        } catch {}
        return {
          success: false,
          code: 'SWITCH_FAILED',
          message: `خطأ في استجابة الخادم (${response.status}) أثناء تبديل المدرسة.`
        };
      }

      const result = await response.json();
      if (result.status === 'success' && result.user) {
        // Invalidate school-scoped data caches BEFORE updating UI / user
        this.clearSchoolScopedCaches();

        const updatedUser: User = {
          ...currentUser,
          ...result.user,
          activeSchoolId: cleanTarget,
          sessionToken: currentUser.sessionToken,
        };

        // Persist updated user with authoritative activeSchoolId
        this.setCurrentUser(updatedUser);

        // Update UX preference
        this.setActiveSchoolId(cleanTarget);

        // Invalidate session cache for this token
        if (currentUser.sessionToken) {
          delete this.sessionValidationCache[currentUser.sessionToken];
        }

        this.notifyChange();

        return {
          success: true,
          user: updatedUser,
          school: result.school,
          message: 'تم تبديل سياق المدرسة بنجاح.',
        };
      }

      return {
        success: false,
        code: result.code || 'SWITCH_FAILED',
        message: result.message || 'فشل تبديل سياق المدرسة من قبل الخادم.',
      };
    } catch (err: any) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: err?.message || 'حدث خطأ في الاتصال أثناء تبديل المدرسة.',
      };
    }
  }

  // ---------------- Authentication & Enterprise Auth Guard ----------------

  /**
   * Structural syntax check for session tokens (checks length and format).
   * Note: This is a structural check only; real authentication requires validateSessionWithBackend.
   */
  public isSessionTokenFormatValid(token?: string | null): boolean {
    return this.isValidSessionToken(token);
  }

  /**
   * Validates if a session token string is structurally sound and issued by the backend.
   * Rejects empty, whitespace, or trivial tokens.
   */
  public isValidSessionToken(token?: string | null): boolean {
    if (!token || typeof token !== 'string') return false;
    const clean = token.trim();
    // Authoritative backend tokens must be non-empty and of sufficient length (min 10 chars)
    return clean.length >= 10;
  }

  /**
   * Enterprise Session Guard:
   * Presence in localStorage or sessionStorage is NEVER considered proof of authentication.
   * A user is strictly authenticated ONLY IF:
   * 1. Valid user object exists with id and role
   * 2. Contains a valid authoritative sessionToken from Backend
   * 3. Account status is not Inactive or Suspended
   * 4. Session has not expired (checked against sessionExpiresAt)
   */
  public isAuthenticated(user?: User | null): boolean {
    if (!user || typeof user !== 'object') return false;
    if (!user.id || !user.role) return false;
    if (user.status === 'Inactive' || user.status === 'Suspended') return false;
    if (user.isActive === false) return false;

    // Must possess a valid authoritative sessionToken
    if (!this.isValidSessionToken(user.sessionToken)) {
      return false;
    }

    // Expiry check if sessionExpiresAt is set
    if (user.sessionExpiresAt) {
      const expTime = new Date(user.sessionExpiresAt).getTime();
      if (!isNaN(expTime) && expTime <= Date.now()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Retrieves the current user from storage cache.
   * STRICT SECURITY POLICY:
   * If a user record is found in local storage WITHOUT a valid sessionToken,
   * it is strictly considered unauthenticated, purged, and returns null.
   * sessionStorage is NEVER used as a fallback credential.
   */
  public getCurrentUser(): User | null {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER) || localStorage.getItem('ntss_current_user');
    if (!raw) return null;

    try {
      const parsed: User = JSON.parse(raw);
      if (!this.isAuthenticated(parsed)) {
        // Purge invalid / unauthenticated user state from local storage
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem('ntss_current_user');
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem('ntss_current_user');
      return null;
    }
  }

  /**
   * Sets or clears the authenticated user state.
   * Does NOT store credentials in sessionStorage (which is reserved for non-sensitive UI state only).
   */
  public setCurrentUser(user: User | null): void {
    if (user && this.isAuthenticated(user)) {
      const sanitizedUser: User = { ...user };
      delete (sanitizedUser as any).password;
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(sanitizedUser));
      localStorage.removeItem('ntss_current_user');
      this.logAudit('LOGIN', 'AUTH', `تسجيل دخول للمستخدم: ${sanitizedUser.fullName} (@${sanitizedUser.username})`);
    } else {
      const currentRaw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER) || localStorage.getItem('ntss_current_user');
      if (currentRaw) {
        try {
          const current = JSON.parse(currentRaw);
          if (current?.fullName) {
            this.logAudit('LOGOUT', 'AUTH', `تسجيل خروج للمستخدم: ${current.fullName}`);
          }
        } catch {}
      }
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem('ntss_current_user');
    }

    // Clean any sensitive user state from sessionStorage to prevent fallback trust
    if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
      try {
        window.sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        window.sessionStorage.removeItem('ntss_current_user');
      } catch {}
    }

    this.notifyChange();
  }

  /**
   * Validates the current session against Backend if online.
   * If the session is rejected or expired by the backend, forces real logout.
   */
  public async validateSessionWithBackend(user?: User | null): Promise<boolean> {
    const targetUser = user !== undefined ? user : this.getCurrentUser();
    if (!targetUser || !this.isAuthenticated(targetUser)) {
      if (targetUser) {
        this.setCurrentUser(null);
      }
      return false;
    }

    const token = targetUser.sessionToken || '';
    const now = Date.now();
    const cached = this.sessionValidationCache[token];
    if (cached && now - cached.timestamp < 15000) {
      return cached.result;
    }

    const scriptUrl = this.getBackendUrl();

    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      if (targetUser) {
        this.setCurrentUser(null);
      }
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'validateSession',
          sessionToken: targetUser.sessionToken,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        this.setCurrentUser(null);
        this.sessionValidationCache[token] = { result: false, timestamp: now };
        return false;
      }

      const result = await response.json();
      if (result && result.status === 'success' && result.valid === true) {
        // Safe context refresh if backend returned user data
        if (result.user && typeof result.user === 'object') {
          const updatedUser: User = {
            ...targetUser,
            email: result.user.email || targetUser.email,
            fullName: result.user.fullName || targetUser.fullName,
            role: result.user.role || targetUser.role,
            accessScope: result.user.accessScope || targetUser.accessScope,
            schoolId: result.user.schoolId !== undefined ? result.user.schoolId : targetUser.schoolId,
            activeSchoolId: result.user.activeSchoolId !== undefined ? result.user.activeSchoolId : targetUser.activeSchoolId,
            allowedSchoolIds: result.user.allowedSchoolIds || targetUser.allowedSchoolIds,
            employeeId: result.user.employeeId !== undefined ? result.user.employeeId : targetUser.employeeId,
            sessionExpiresAt: result.expiresAt || result.sessionExpiresAt || targetUser.sessionExpiresAt,
          };
          this.setCurrentUser(updatedUser);
        }
        this.sessionValidationCache[token] = { result: true, timestamp: now };
        return true;
      }

      // Any other response: reject session, clear user, fail closed
      this.setCurrentUser(null);
      this.sessionValidationCache[token] = { result: false, timestamp: now };
      return false;
    } catch {
      // Fail-closed on network errors / offline / timeout (No offline auth)
      if (targetUser) {
        this.setCurrentUser(null);
      }
      return false;
    }
  }

  /**
   * RBAC Phase 2F-C: Backend Version & Authoritative Source Compatibility Check
   * Calls GET ?action=health and validates:
   * 1. serviceAvailable === true
   * 2. canonicalSource === CANONICAL_BACKEND_SOURCE ('google-apps-script/Code.gs')
   * 3. version === CANONICAL_BACKEND_VERSION ('5.2.0-AUTH-MULTISCHOOL')
   */
  public async checkBackendCompatibility(targetScriptUrl?: string): Promise<{
    compatible: boolean;
    code?: 'AUTH_SERVICE_UNAVAILABLE' | 'BACKEND_VERSION_MISMATCH' | 'BACKEND_SOURCE_MISMATCH';
    message?: string;
    details?: any;
  }> {
    const settings = this.getSettings();
    const scriptUrl = targetScriptUrl || settings.googleAppsScriptUrl || DEFAULT_BACKEND_URL;

    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!scriptUrl || scriptUrl.length < 15 || isOffline) {
      return {
        compatible: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'خدمة المصادقة والخادم الخلفي غير متاحة حالياً أو لا يوجد اتصال بالإنترنت.',
      };
    }

    try {
      const url = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}action=health`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return {
          compatible: false,
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: `تعذر الاتصال بخدمة المصادقة (${response.status}). الخادم غير متاح.`,
        };
      }

      const data = await response.json().catch(() => ({}));
      if (data.status !== 'success' || data.serviceAvailable !== true) {
        return {
          compatible: false,
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'خدمة المصادقة في الخادم الخلفي معطلة أو غير متاحة.',
          details: data,
        };
      }

      // Check canonicalSource
      const source = data.canonicalSource;
      if (source !== CANONICAL_BACKEND_SOURCE) {
        return {
          compatible: false,
          code: 'BACKEND_SOURCE_MISMATCH',
          message: `مصدر الخادم الخلفي غير متطابق أمنياً. المتوقع: ${CANONICAL_BACKEND_SOURCE}، المستلم: ${source || 'غير محدد'}.`,
          details: { expected: CANONICAL_BACKEND_SOURCE, actual: source },
        };
      }

      // Check version
      const ver = data.version;
      if (ver !== CANONICAL_BACKEND_VERSION) {
        return {
          compatible: false,
          code: 'BACKEND_VERSION_MISMATCH',
          message: `إصدار الخادم الخلفي غير متوافق. المطلوب: ${CANONICAL_BACKEND_VERSION}، الحالي في الخادم: ${ver || 'غير محدد'}. يرجى تحديث نشر Google Apps Script.`,
          details: { expected: CANONICAL_BACKEND_VERSION, actual: ver },
        };
      }

      return {
        compatible: true,
        details: data,
      };
    } catch (err: any) {
      return {
        compatible: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'فشل الاتصال بالخادم الخلفي للتحقق من التوافقية.',
        details: err?.message,
      };
    }
  }

  public async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; message?: string; user?: User; code?: string; loginNumber?: string | number }> {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();

    if (!cleanEmail || !cleanPassword) {
      return { success: false, code: 'INVALID_CREDENTIALS', message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' };
    }

    const settings = this.getSettings();
    const scriptUrl = settings.googleAppsScriptUrl || DEFAULT_BACKEND_URL;

    // Strict Security Policy: Fail-Closed. Backend Authoritative Login ONLY.
    if (!scriptUrl || scriptUrl.length < 15) {
      return {
        success: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'النظام يعمل بوضع الأمان الصارم (Fail-Closed). لم يتم ضبط رابط خادم Google Apps Script المعتمد. يرجى تهيئة رابط الخادم لتسجيل الدخول.'
      };
    }

    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline) {
      return {
        success: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'لا يوجد اتصال بالإنترنت. النظام لا يسمح بتسجيل الدخول المحلي بدون التحقق من الخادم الخلفي المعتمد.'
      };
    }

    // Backend Compatibility Pre-Check: Do not send credentials if backend version or source mismatches
    const compat = await this.checkBackendCompatibility(scriptUrl);
    if (!compat.compatible) {
      return {
        success: false,
        code: compat.code || 'AUTH_SERVICE_UNAVAILABLE',
        message: compat.message || 'فشل التحقق من توافقية وأمان الخادم الخلفي المعتمد.',
      };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'login',
          email: cleanEmail,
          password: cleanPassword,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: `خطأ اتصال بخادم المصادقة (${response.status}). تعذر التحقق من الهوية.`
        };
      }

      const result = await response.json();
      if (result.status === 'success' && result.user) {
        const canonicalRole = normalizeStaffRole(result.user.role);

        // Strict session token check: ONLY accept result.sessionToken, NO token alias fallbacks
        const resolvedToken = result.sessionToken;
        if (!resolvedToken || typeof resolvedToken !== 'string' || !resolvedToken.trim()) {
          return {
            success: false,
            code: 'LOGIN_SESSION_TOKEN_MISSING',
            message: 'فشل تسجيل الدخول: استجابة الخادم تفتقر إلى رمز جلسة موثوق (sessionToken).',
          };
        }

        // Server-derived user context (NO client resolution, NO DEFAULT_PRIMARY_SCHOOL fallback)
        const serverSchoolId = result.schoolId !== undefined ? result.schoolId : result.user.schoolId;
        const serverActiveSchoolId = result.activeSchoolId !== undefined ? result.activeSchoolId : result.user.activeSchoolId;
        const serverAllowedSchoolIds = result.allowedSchoolIds !== undefined ? result.allowedSchoolIds : result.user.allowedSchoolIds;
        const serverAccessScope = result.accessScope !== undefined ? result.accessScope : result.user.accessScope;

        const userWithToken: User = {
          ...result.user,
          email: cleanEmail,
          role: canonicalRole,
          schoolId: serverSchoolId,
          activeSchoolId: serverActiveSchoolId,
          allowedSchoolIds: serverAllowedSchoolIds,
          accessScope: serverAccessScope,
          sessionToken: String(resolvedToken).trim(),
        };

        if (result.expiresAt || result.sessionExpiresAt) {
          userWithToken.sessionExpiresAt = result.expiresAt || result.sessionExpiresAt;
        }
        delete userWithToken.password;

        // Active School Cache handling (UX cache only, strictly NOT an authority)
        // If SystemAdmin GLOBAL and activeSchoolId is empty/undefined, DO NOT set active school or fallback!
        if (serverAccessScope === 'GLOBAL') {
          if (serverActiveSchoolId) {
            this.setActiveSchoolId(serverActiveSchoolId);
          }
          // Do NOT call setActiveSchoolId if serverActiveSchoolId is empty or undefined
        } else if (serverActiveSchoolId || serverSchoolId) {
          this.setActiveSchoolId(serverActiveSchoolId || serverSchoolId);
        }

        this.setCurrentUser(userWithToken);
        return { success: true, user: userWithToken };
      } else if (result.status === 'error') {
        if (result.code === 'DATABASE_EMPTY') {
          return {
            success: false,
            code: 'DATABASE_EMPTY',
            message: result.message || 'قاعدة بيانات المستخدمين فارغة، يلزم تهيئة حساب مدير النظام الأول.'
          };
        }
        return {
          success: false,
          code: result.code || 'INVALID_CREDENTIALS',
          message: result.message || 'بيانات الدخول غير صحيحة.'
        };
      }
      return {
        success: false,
        code: 'UNEXPECTED_RESPONSE',
        message: 'استجابة غير متوقعة من خادم المصادقة'
      };
    } catch (err: any) {
      return {
        success: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: `تعذر الاتصال بخادم المصادقة المعتمد: ${err?.message || 'خطأ في الشبكة'}. تم إغلاق مسار الدخول أمنياً (Fail-Closed).`
      };
    }
  }

  public async bootstrapFirstAdmin(
    _username?: string,
    _password?: string,
    _fullName?: string,
    _schoolId?: string
  ): Promise<{ success: boolean; message?: string; user?: any; code?: string }> {
    return {
      success: false,
      code: 'BOOTSTRAP_PUBLIC_ROUTE_RETIRED',
      message: 'تم إيقاف مسار التهيئة العامة للمسؤول الأول أمنياً. يتم تهيئة الحسابات الإدارية عبر القنوات الخادمة الموثوقة فقط.',
    };
  }

  // ---------------- Role Permissions ----------------
  public hasPermission(action: keyof PermissionMatrix): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    const settings = this.getSettings();
    const rolePermissions = settings.rolePermissions || DEFAULT_PERMISSION_MATRIX;
    const currentRolePerms = rolePermissions[user.role];

    if (!currentRolePerms) return false;
    return !!currentRolePerms[action];
  }

  // ---------------- Settings ----------------
  public getSettings(): SystemSettings {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return { ...INITIAL_SETTINGS };
    try {
      const parsed = JSON.parse(raw);
      return {
        ...INITIAL_SETTINGS,
        ...parsed,
        stages: parsed.stages || DEFAULT_STAGES,
        grades: parsed.grades || DEFAULT_GRADES,
        classrooms: parsed.classrooms || DEFAULT_CLASSROOMS,
        subjects: parsed.subjects || DEFAULT_SUBJECTS,
        departments: parsed.departments || DEFAULT_DEPARTMENTS,
        jobTitles: parsed.jobTitles || DEFAULT_JOB_TITLES,
        holidays: parsed.holidays || DEFAULT_HOLIDAYS,
        scheduleConfig: parsed.scheduleConfig || DEFAULT_SCHEDULE_CONFIG,
        studentAttendanceStatuses: parsed.studentAttendanceStatuses || DEFAULT_STUDENT_ATTENDANCE_STATUSES,
        studentAttendanceRules: parsed.studentAttendanceRules || DEFAULT_STUDENT_ATTENDANCE_RULES,
        teacherAttendanceRules: parsed.teacherAttendanceRules || DEFAULT_TEACHER_ATTENDANCE_RULES,
        behaviorScoreRules: parsed.behaviorScoreRules || DEFAULT_BEHAVIOR_RULES,
        behaviorLevels: parsed.behaviorLevels || DEFAULT_BEHAVIOR_LEVELS,
        alertRules: parsed.alertRules || DEFAULT_ALERT_RULES,
        leaveTypes: parsed.leaveTypes || DEFAULT_LEAVE_TYPES,
        permissionTypes: parsed.permissionTypes || DEFAULT_PERMISSION_TYPES,
        allowanceTypes: parsed.allowanceTypes || DEFAULT_ALLOWANCE_TYPES,
        deductionTypes: parsed.deductionTypes || DEFAULT_DEDUCTION_TYPES,
        parentPortalSettings: parsed.parentPortalSettings || DEFAULT_PARENT_PORTAL_SETTINGS,
        teacherPortalSettings: parsed.teacherPortalSettings || DEFAULT_TEACHER_PORTAL_SETTINGS,
        socialSpecialistSettings: parsed.socialSpecialistSettings || DEFAULT_SOCIAL_SPECIALIST_SETTINGS,
        importSettings: parsed.importSettings || DEFAULT_IMPORT_SETTINGS,
        exportSettings: parsed.exportSettings || DEFAULT_EXPORT_SETTINGS,
        dashboardSettings: parsed.dashboardSettings || DEFAULT_DASHBOARD_SETTINGS,
        rolePermissions: parsed.rolePermissions || DEFAULT_PERMISSION_MATRIX,
        configVersion: parsed.configVersion || '1.0.0',
        lastConfigUpdate: parsed.lastConfigUpdate || new Date().toISOString(),
      };
    } catch {
      return { ...INITIAL_SETTINGS };
    }
  }

  public saveSettings(newSettings: Partial<SystemSettings>, auditSummary = 'تحديث إعدادات النظام وقواعد المدرسة'): void {
    const current = this.getSettings();
    const newVersion = this.incrementVersion(current.configVersion || '1.0.0');
    const updated: SystemSettings = {
      ...current,
      ...newSettings,
      configVersion: newVersion,
      lastConfigUpdate: getCairoNowISO(),
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    this.logAudit(
      'UPDATE',
      'SETTINGS',
      auditSummary,
      JSON.stringify({ version: current.configVersion }),
      JSON.stringify({ version: newVersion })
    );
    this.startAutoSync();
    this.notifyChange();

    // Async sync settings to Google Sheets
    this.pushPost('saveSettings', updated).catch(() => {});
  }

  private incrementVersion(ver: string): string {
    try {
      const parts = ver.split('.').map(p => parseInt(p, 10) || 0);
      if (parts.length >= 3) {
        parts[2] += 1;
        return parts.join('.');
      }
      return `${ver}.1`;
    } catch {
      return '1.0.1';
    }
  }

  // ---------------- Dynamic Master Entity Getters ----------------
  public getGrades(): GradeItem[] {
    return this.getSettings().grades || DEFAULT_GRADES;
  }

  public getClassrooms(): ClassroomItem[] {
    return this.getSettings().classrooms || DEFAULT_CLASSROOMS;
  }

  public getSubjects(): SubjectItem[] {
    return this.getSettings().subjects || DEFAULT_SUBJECTS;
  }

  public getDepartments(): DepartmentItem[] {
    return this.getSettings().departments || DEFAULT_DEPARTMENTS;
  }

  public getJobTitles(): JobTitleItem[] {
    return this.getSettings().jobTitles || DEFAULT_JOB_TITLES;
  }

  public getStudentAttendanceStatuses(): StudentAttendanceStatusConfig[] {
    return this.getSettings().studentAttendanceStatuses || DEFAULT_STUDENT_ATTENDANCE_STATUSES;
  }

  public getLeaveTypesList(): LeaveTypeConfig[] {
    return this.getSettings().leaveTypes || DEFAULT_LEAVE_TYPES;
  }

  public getPermissionTypesList(): PermissionTypeConfig[] {
    return this.getSettings().permissionTypes || DEFAULT_PERMISSION_TYPES;
  }

  public getAllowanceTypes(): AllowanceTypeItem[] {
    return this.getSettings().allowanceTypes || DEFAULT_ALLOWANCE_TYPES;
  }

  public getDeductionTypes(): DeductionTypeItem[] {
    return this.getSettings().deductionTypes || DEFAULT_DEDUCTION_TYPES;
  }

  public getBehaviorLevels(): BehaviorLevelItem[] {
    return this.getSettings().behaviorLevels || DEFAULT_BEHAVIOR_LEVELS;
  }

  public getAlertRules(): AlertRuleItem[] {
    return this.getSettings().alertRules || DEFAULT_ALERT_RULES;
  }

  public getScheduleConfig(): ScheduleConfig {
    return this.getSettings().scheduleConfig || DEFAULT_SCHEDULE_CONFIG;
  }

  public saveScheduleConfig(config: ScheduleConfig): void {
    this.saveSettings({ scheduleConfig: config }, 'تحديث إعدادات وتوقيتات الحصص الدراسية');
  }

  public exportSettingsJSON(): string {
    return this.exportSettingsBackupJSON();
  }

  public importSettingsJSON(jsonString: string): boolean {
    const res = this.importSettingsBackupJSON(jsonString);
    return res.success;
  }

  public resetToFactorySettings(): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(INITIAL_SETTINGS));
    this.logAudit('UPDATE', 'SETTINGS', 'إعادة ضبط كافة إعدادات النظام وقواعد التشغيل إلى الوضع المصنعي الافتراضي');
    this.notifyChange();
  }

  public resetToDefaultSettings(): void {
    this.resetToFactorySettings();
  }

  // Check dependencies before deleting or disabling an item
  public checkDependencies(
    entityType: 'grade' | 'classroom' | 'subject' | 'department' | 'jobTitle' | 'leaveType' | 'behaviorType',
    idOrName: string
  ): {
    canDelete: boolean;
    studentCount: number;
    employeeCount: number;
    scheduleCount: number;
    violationCount: number;
    message: string;
  } {
    const students = this.getStudents();
    const employees = this.getEmployees();
    const schedules = this.getSchedule();
    const violations = this.getBehaviorViolations();

    let studentCount = 0;
    let employeeCount = 0;
    let scheduleCount = 0;
    let violationCount = 0;

    switch (entityType) {
      case 'grade': {
        studentCount = students.filter(s => s.grade === idOrName || (s as any).gradeId === idOrName).length;
        scheduleCount = schedules.filter(sc => sc.grade === idOrName || (sc as any).gradeId === idOrName).length;
        break;
      }
      case 'classroom': {
        studentCount = students.filter(s => s.classroom === idOrName || (s as any).classroomId === idOrName).length;
        scheduleCount = schedules.filter(sc => sc.classroom === idOrName || (sc as any).classroomId === idOrName).length;
        break;
      }
      case 'subject': {
        scheduleCount = schedules.filter(sc => sc.subject === idOrName || (sc as any).subjectId === idOrName).length;
        break;
      }
      case 'department': {
        employeeCount = employees.filter(e => e.department === idOrName || (e as any).departmentId === idOrName).length;
        break;
      }
      case 'jobTitle': {
        employeeCount = employees.filter(e => e.jobTitle === idOrName).length;
        break;
      }
      case 'behaviorType': {
        violationCount = violations.filter(v => v.behaviorTypeId === idOrName || v.violationTypeId === idOrName || v.violationName === idOrName).length;
        break;
      }
    }

    const totalUsage = studentCount + employeeCount + scheduleCount + violationCount;
    const canDelete = totalUsage === 0;

    let message = '';
    if (!canDelete) {
      const parts: string[] = [];
      if (studentCount > 0) parts.push(`${studentCount} طالب`);
      if (employeeCount > 0) parts.push(`${employeeCount} موظف`);
      if (scheduleCount > 0) parts.push(`${scheduleCount} حصة بالجدول`);
      if (violationCount > 0) parts.push(`${violationCount} مخالفة سلوكية مسجلة`);
      message = `لا يمكن الحذف لارتباط هذا العنصر بـ: ${parts.join(' و ')}. يفضل تعطيله بدلاً من حذفه.`;
    } else {
      message = 'لا توجد بيانات مرتبطة بهذا العنصر. يمكن حذفه بأمان.';
    }

    return {
      canDelete,
      studentCount,
      employeeCount,
      scheduleCount,
      violationCount,
      message,
    };
  }

  // Backup and Restore Configuration JSON
  public exportSettingsBackupJSON(): string {
    const settings = this.getSettings();
    return JSON.stringify(
      {
        appName: 'NTSS_SCHOOL_CONFIGURATION_BACKUP',
        exportedAt: getCairoNowISO(),
        configVersion: settings.configVersion,
        settings,
      },
      null,
      2
    );
  }

  public importSettingsBackupJSON(jsonStr: string): { success: boolean; message: string } {
    try {
      const parsed = JSON.parse(jsonStr);
      const incoming = parsed.settings || parsed;
      if (!incoming || typeof incoming !== 'object') {
        return { success: false, message: 'ملف التهيئة غير صالح' };
      }
      this.saveSettings(incoming, 'استعادة نسخة احتياطية لإعدادات النظام بالكامل');
      return { success: true, message: 'تم استعادة كافة إعدادات النظام بنجاح' };
    } catch (err: any) {
      return { success: false, message: `فشل استيراد الملف: ${err?.message || 'خطأ غير معروف'}` };
    }
  }

  public resetSettingsSection(sectionKey: string): void {
    const initial = { ...INITIAL_SETTINGS };
    const current = this.getSettings();
    if (sectionKey in initial) {
      (current as any)[sectionKey] = JSON.parse(JSON.stringify((initial as any)[sectionKey]));
      this.saveSettings(current, `إعادة ضبط قسم [${sectionKey}] للإعدادات الافتراضية`);
    }
  }

  // ---------------- Students Management ----------------
  public getStudents(): Student[] {
    const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public getStudentById(id: string): Student | undefined {
    if (!id) return undefined;
    return this.getStudents().find(s => s.id === id || s.studentCode === id);
  }

  public saveStudent(student: Student): { success: boolean; message?: string } {
    const list = this.getStudents();
    const idx = list.findIndex(s => s.id === student.id || (student.studentCode && s.studentCode === student.studentCode));
    const now = getCairoNowISO();

    if (idx >= 0) {
      const old = list[idx];
      list[idx] = { ...old, ...student, updatedAt: now };
      this.logAudit('UPDATE', 'STUDENT', `تعديل بيانات الطالب: ${student.name} (${student.studentCode})`, JSON.stringify(old), JSON.stringify(student), student.id);
    } else {
      const newStudent: Student = {
        ...student,
        id: student.id || `STD-${Date.now().toString().slice(-6)}`,
        createdAt: student.createdAt || now,
        updatedAt: now,
        initialBehaviorScore: student.initialBehaviorScore ?? 100,
        status: student.status || 'نشط',
      };
      list.unshift(newStudent);
      this.logAudit('CREATE', 'STUDENT', `إضافة طالب جديد: ${newStudent.name} (${newStudent.studentCode})`, '', JSON.stringify(newStudent), newStudent.id);
    }

    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveStudent', student).catch(() => {});
    return { success: true, message: 'تم حفظ بيانات الطالب بنجاح' };
  }

  public deleteStudent(id: string): { success: boolean; message?: string } {
    const list = this.getStudents();
    const target = list.find(s => s.id === id);
    const filtered = list.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(filtered));
    if (target) {
      this.logAudit('DELETE', 'STUDENT', `حذف الطالب: ${target.name} (${target.studentCode})`, JSON.stringify(target), '', id);
    }
    this.notifyChange();
    this.pushPost('deleteStudent', { id }).catch(() => {});
    return { success: true, message: 'تم حذف الطالب بنجاح' };
  }

  public bulkSaveStudents(newStudents: Student[]): { added: number; updated: number; errors: string[] } {
    const currentList = this.getStudents();
    const studentMap = new Map<string, Student>();
    currentList.forEach(s => studentMap.set(s.id, s));
    currentList.forEach(s => {
      if (s.studentCode) studentMap.set(s.studentCode, s);
      if (s.nationalId) studentMap.set(s.nationalId, s);
    });

    let added = 0;
    let updated = 0;
    const errors: string[] = [];
    const now = getCairoNowISO();

    newStudents.forEach((student, index) => {
      if (!student.name || student.name.trim().length === 0) {
        errors.push(`السجل رقم ${index + 1}: اسم الطالب مفقود`);
        return;
      }

      const existing = (student.id && studentMap.get(student.id)) ||
        (student.studentCode && studentMap.get(student.studentCode)) ||
        (student.nationalId && studentMap.get(student.nationalId));

      if (existing) {
        const updatedRecord: Student = {
          ...existing,
          ...student,
          id: existing.id,
          updatedAt: now,
        };
        const idx = currentList.findIndex(s => s.id === existing.id);
        if (idx >= 0) currentList[idx] = updatedRecord;
        updated++;
      } else {
        const id = student.id || `STD-${Date.now().toString().slice(-6)}-${index + 1}`;
        const newRecord: Student = {
          ...student,
          id,
          studentCode: student.studentCode || `C-${Math.floor(1000 + Math.random() * 9000)}`,
          createdAt: now,
          updatedAt: now,
          status: student.status || 'نشط',
          initialBehaviorScore: student.initialBehaviorScore ?? 100,
        };
        currentList.push(newRecord);
        studentMap.set(id, newRecord);
        added++;
      }
    });

    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(currentList));
    this.logAudit('IMPORT', 'IMPORT', `استيراد مجمع للطلاب: تمت إضافة ${added} وتحديث ${updated}`);
    this.notifyChange();
    this.pushPost('bulkSaveStudents', currentList).catch(() => {});

    return { added, updated, errors };
  }

  // ---------------- Attendance Day Workflow & Student School Attendance ----------------
  public getAttendanceDays(academicYearId?: string): AttendanceDay[] {
    const raw = localStorage.getItem(STORAGE_KEYS.ATTENDANCE_DAYS);
    if (!raw) return [];
    try {
      const parsed: AttendanceDay[] = JSON.parse(raw);
      if (academicYearId) {
        return parsed.filter(d => d.academicYearId === academicYearId);
      }
      return parsed;
    } catch {
      return [];
    }
  }

  public getAttendanceDayByDate(date: string, academicYearId?: string): AttendanceDay | undefined {
    const days = this.getAttendanceDays();
    if (academicYearId) {
      return days.find(d => d.date === date && d.academicYearId === academicYearId) || days.find(d => d.date === date);
    }
    return days.find(d => d.date === date);
  }

  public saveAttendanceDay(day: AttendanceDay): { success: boolean; message?: string } {
    const list = this.getAttendanceDays();
    const idx = list.findIndex(d => d.id === day.id || (d.date === day.date && d.academicYearId === day.academicYearId));
    
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...day, version: (list[idx].version || 0) + 1 };
    } else {
      list.unshift({ ...day, id: day.id || `DAY-${day.date}`, version: 1 });
    }

    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_DAYS, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveAttendanceDay', day).catch(() => {});
    return { success: true, message: 'تم حفظ سجل يوم الحضور بنجاح' };
  }

  public recalculateAttendanceDayCounts(date: string, academicYearId?: string): AttendanceDay {
    const activeYear = academicYearId ? this.getAcademicYearById(academicYearId) : this.getActiveAcademicYear();
    const yearId = activeYear?.id || 'AY_CURRENT';
    const activeStudents = this.getStudents().filter(s => s.status === 'نشط');
    const allAttendance = this.getStudentAttendance().filter(a => a.date === date);
    const existingDay = this.getAttendanceDayByDate(date, yearId);

    const recordMap = new Map<string, StudentAttendanceRecord>();
    allAttendance.forEach(r => recordMap.set(r.studentId, r));

    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let excusedCount = 0;
    let unrecordedCount = 0;

    activeStudents.forEach(s => {
      const rec = recordMap.get(s.id);
      if (!rec || rec.status === 'لم يسجل' || !rec.status) {
        unrecordedCount++;
      } else if (rec.status === 'حاضر') {
        presentCount++;
      } else if (rec.status === 'متأخر') {
        lateCount++;
      } else if (rec.status === 'غائب بعذر') {
        absentCount++;
        excusedCount++;
      } else if (rec.status === 'غائب' || rec.status === 'غائب بدون عذر' || rec.status === 'هروب') {
        absentCount++;
      } else {
        presentCount++;
      }
    });

    const recordedCount = activeStudents.length - unrecordedCount;

    const dayRecord: AttendanceDay = {
      id: existingDay?.id || `DAY-${date}-${yearId}`,
      date,
      academicYearId: yearId,
      academicYearName: activeYear?.name || '2025/2026',
      dayName: getEgyptianDayName(date),
      status: existingDay?.status || 'Open',
      totalStudentsCount: activeStudents.length,
      recordedCount,
      presentCount,
      lateCount,
      absentCount,
      excusedCount,
      unrecordedCount,
      openedAt: existingDay?.openedAt || getCairoNowISO(),
      openedBy: existingDay?.openedBy || this.getCurrentUser()?.fullName || 'النظام',
      reviewedAt: existingDay?.reviewedAt,
      reviewedBy: existingDay?.reviewedBy,
      reviewNotes: existingDay?.reviewNotes,
      approvedAt: existingDay?.approvedAt,
      approvedBy: existingDay?.approvedBy,
      lockedAt: existingDay?.lockedAt,
      lockedBy: existingDay?.lockedBy,
      lockNotes: existingDay?.lockNotes,
      version: (existingDay?.version || 0) + 1,
    };

    this.saveAttendanceDay(dayRecord);
    return dayRecord;
  }

  public openAttendanceDay(date: string, academicYearId?: string): { success: boolean; day: AttendanceDay; message?: string } {
    const activeYear = academicYearId ? this.getAcademicYearById(academicYearId) : this.getActiveAcademicYear();
    const yearId = activeYear?.id || 'AY_CURRENT';
    const user = this.getCurrentUser();
    const existing = this.getAttendanceDayByDate(date, yearId);

    if (existing && existing.status === 'Locked') {
      return { success: false, day: existing, message: 'اليوم مقفل ولا يمكن فتحه إلا من خلال صلاحية فك القفل الاستثنائية.' };
    }

    const day = this.recalculateAttendanceDayCounts(date, yearId);
    day.status = 'Open';
    day.openedAt = getCairoNowISO();
    day.openedBy = user?.fullName || 'مدير النظام';
    
    this.saveAttendanceDay(day);
    this.logAudit('UPDATE', 'STUDENT_ATTENDANCE', `فتح يوم الحضور المدرسي بتاريخ (${date})`);
    return { success: true, day, message: `تم فتح يوم الحضور (${date}) بنجاح` };
  }

  public reviewAttendanceDay(date: string, academicYearId?: string, reviewNotes?: string) {
    const activeYear = academicYearId ? this.getAcademicYearById(academicYearId) : this.getActiveAcademicYear();
    const yearId = activeYear?.id || 'AY_CURRENT';
    const students = this.getStudents();
    const enrollments = this.getStudentEnrollments();
    const schoolAttendance = this.getStudentAttendance();
    const classAttendance = this.getClassAttendance();
    const settings = this.getSettings();
    const statuses = settings.studentAttendanceStatuses || DEFAULT_STUDENT_ATTENDANCE_STATUSES;
    const existingDay = this.getAttendanceDayByDate(date, yearId);

    const review = computeAttendanceDayReview({
      date,
      academicYearId: yearId,
      students,
      enrollments,
      schoolAttendance,
      classAttendance,
      dayRecord: existingDay,
      settings,
      statuses,
    });

    const user = this.getCurrentUser();
    const day = this.recalculateAttendanceDayCounts(date, yearId);
    day.status = 'UnderReview';
    day.reviewedAt = getCairoNowISO();
    day.reviewedBy = user?.fullName || 'مراجع الحضور';
    day.reviewNotes = reviewNotes || existingDay?.reviewNotes;

    this.saveAttendanceDay(day);

    // Save generated exceptions if any
    if (review.exceptions.length > 0) {
      this.batchSaveAttendanceExceptions(review.exceptions);
    }

    this.logAudit('UPDATE', 'STUDENT_ATTENDANCE', `مراجعة يوم الحضور المدرسي (${date}): مسجل ${review.recordedCount}/${review.totalActiveStudents} (${review.warnings.length} تنبيهات)`);
    return { success: true, day, review, message: 'تمت مراجعة يوم الحضور وفحص كافة الاستثناءات والتطابق' };
  }

  public approveAttendanceDay(
    date: string,
    academicYearId?: string,
    policy: 'block' | 'convertToAbsent' | 'allowNotRecorded' = 'block'
  ): { success: boolean; day: AttendanceDay; message?: string; errors?: string[] } {
    const activeYear = academicYearId ? this.getAcademicYearById(academicYearId) : this.getActiveAcademicYear();
    const yearId = activeYear?.id || 'AY_CURRENT';
    const day = this.recalculateAttendanceDayCounts(date, yearId);
    const user = this.getCurrentUser();

    if (day.unrecordedCount > 0) {
      if (policy === 'block') {
        return {
          success: false,
          day,
          errors: [`لا يمكن اعتماد اليوم لوجود (${day.unrecordedCount}) طالب لم يتم رصد حضورهم بعد.`],
          message: 'يجب رصد جميع الطلاب أو اختيار تحويل غير المسجلين إلى غياب.',
        };
      } else if (policy === 'convertToAbsent') {
        // Convert unrecorded students to absent
        const activeStudents = this.getStudents().filter(s => s.status === 'نشط');
        const dayAttendance = this.getStudentAttendance().filter(a => a.date === date);
        const recordedIds = new Set(dayAttendance.map(a => a.studentId));
        const unrecordedList = activeStudents.filter(s => !recordedIds.has(s.id));

        const autoAbsentRecords: StudentAttendanceRecord[] = unrecordedList.map(s => ({
          id: `ATT-STD-${s.id}-${date}`,
          studentId: s.id,
          studentCode: s.studentCode,
          studentName: s.name,
          academicYearId: yearId,
          stage: s.stage || 'المرحلة الثانوية',
          grade: s.grade,
          classroom: s.classroom,
          date,
          dayName: getEgyptianDayName(date),
          status: 'غائب بدون عذر',
          notes: 'تم تحويله لغائب تلقائياً عند اعتماد اليوم',
          recordedBy: `النظام (${user?.fullName || 'الاعتماد'})`,
          recordedAt: getCairoNowISO(),
        }));

        this.bulkSaveStudentAttendance(autoAbsentRecords);
        this.recalculateAttendanceDayCounts(date, yearId);
      }
    }

    day.status = 'Approved';
    day.approvedAt = getCairoNowISO();
    day.approvedBy = user?.fullName || 'وكيل شؤون الطلاب';

    this.saveAttendanceDay(day);
    this.logAudit('UPDATE', 'STUDENT_ATTENDANCE', `اعتماد حضور يوم (${date}) رسمياً لـ (${day.totalStudentsCount}) طالب`);
    return { success: true, day, message: `تم اعتماد حضور يوم (${date}) بنجاح وجاهز للقفل النهائي` };
  }

  public lockAttendanceDay(date: string, academicYearId?: string, lockNotes?: string): { success: boolean; day: AttendanceDay; message?: string } {
    const activeYear = academicYearId ? this.getAcademicYearById(academicYearId) : this.getActiveAcademicYear();
    const yearId = activeYear?.id || 'AY_CURRENT';
    const day = this.recalculateAttendanceDayCounts(date, yearId);
    const user = this.getCurrentUser();

    day.status = 'Locked';
    day.lockedAt = getCairoNowISO();
    day.lockedBy = user?.fullName || 'مدير المدرسة';
    day.lockNotes = lockNotes;

    this.saveAttendanceDay(day);
    this.logAudit('UPDATE', 'STUDENT_ATTENDANCE', `قفل يوم الحضور المدرسي (${date}) نهائياً لمنع التعديل: ${lockNotes || 'قفل نهائي'}`);
    return { success: true, day, message: `تم قفل يوم الحضور (${date}) نهائياً وتأمين السجلات` };
  }

  public unlockAttendanceDay(date: string, academicYearId?: string, overrideReason = 'فك قفل استثنائي بتصريح إدارة المدرسة'): { success: boolean; day: AttendanceDay; message?: string } {
    const activeYear = academicYearId ? this.getAcademicYearById(academicYearId) : this.getActiveAcademicYear();
    const yearId = activeYear?.id || 'AY_CURRENT';
    const day = this.recalculateAttendanceDayCounts(date, yearId);
    const user = this.getCurrentUser();

    day.status = 'Open';
    day.lockedAt = undefined;
    day.lockedBy = undefined;
    day.lockNotes = `تم فك القفل بتاريخ ${getCairoNowISO()}: ${overrideReason}`;

    this.saveAttendanceDay(day);
    this.logAudit('UPDATE', 'STUDENT_ATTENDANCE', `فك قفل يوم الحضور المدرسي (${date}) استثنائياً: ${overrideReason}`);
    return { success: true, day, message: `تم فك قفل يوم (${date}) بنجاح وأصبح متاحاً للتعديل` };
  }

  public overrideLockedAttendance(params: {
    studentId: string;
    date: string;
    updates: Partial<StudentAttendanceRecord>;
    reason: string;
  }): { success: boolean; record?: StudentAttendanceRecord; message?: string } {
    const { studentId, date, updates, reason } = params;
    if (!reason || reason.trim().length < 5) {
      return { success: false, message: 'يجب كتابة سبب واضح ومفصل للتعديل الاستثنائي على السجل المقفل.' };
    }

    const list = this.getStudentAttendance();
    const idx = list.findIndex(r => r.studentId === studentId && r.date === date);
    const user = this.getCurrentUser();
    const now = getCairoNowISO();

    let oldRecord: StudentAttendanceRecord | undefined;
    let updated: StudentAttendanceRecord;

    if (idx >= 0) {
      oldRecord = { ...list[idx] };
      updated = {
        ...list[idx],
        ...updates,
        notes: `${list[idx].notes || ''} [تعديل استثنائي: ${reason}]`,
        updatedBy: user?.fullName || 'مدير النظام',
        updatedAt: now,
        version: (list[idx].version || 0) + 1,
      };
      list[idx] = updated;
    } else {
      const student = this.getStudentById(studentId);
      updated = {
        id: `ATT-STD-${studentId}-${date}`,
        studentId,
        studentName: student?.name || studentId,
        studentCode: student?.studentCode,
        stage: student?.stage || 'المرحلة الثانوية',
        grade: student?.grade || '',
        classroom: student?.classroom || '',
        date,
        dayName: getEgyptianDayName(date),
        status: updates.status || 'حاضر',
        ...updates,
        notes: `[تعديل استثنائي: ${reason}]`,
        recordedBy: user?.fullName || 'مدير النظام',
        recordedAt: now,
        version: 1,
      };
      list.unshift(updated);
    }

    localStorage.setItem(STORAGE_KEYS.STUDENT_ATTENDANCE, JSON.stringify(list));
    this.recalculateAttendanceDayCounts(date);

    this.logAudit(
      'UPDATE',
      'STUDENT_ATTENDANCE',
      `تعديل استثنائي لسجل حضور مقفل: للطالب (${updated.studentName}) بتاريخ (${date}) - السبب: ${reason}`,
      JSON.stringify(oldRecord || {}),
      JSON.stringify(updated),
      studentId
    );

    this.notifyChange();
    this.pushPost('overrideAttendanceRecord', { studentId, date, updates, reason }).catch(() => {});
    return { success: true, record: updated, message: 'تم تطبيق التعديل الاستثنائي وتوثيقه في سجل الرقابة والمراجعة.' };
  }

  // ---------------- Student School Attendance ----------------
  public getStudentAttendance(): StudentAttendanceRecord[] {
    const raw = localStorage.getItem(STORAGE_KEYS.STUDENT_ATTENDANCE);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveStudentAttendanceRecord(rec: StudentAttendanceRecord): { success: boolean; message?: string; dayLocked?: boolean } {
    const day = this.getAttendanceDayByDate(rec.date);
    if (day && day.status === 'Locked') {
      return {
        success: false,
        dayLocked: true,
        message: 'اليوم مقفل ولا يمكن التعديل عليه بدون إجراء التعديل الاستثنائي مع توثيق السبب.',
      };
    }

    const list = this.getStudentAttendance();
    const idx = list.findIndex(r => r.studentId === rec.studentId && r.date === rec.date);
    const now = getCairoNowISO();
    const user = this.getCurrentUser();
    const settings = this.getSettings();

    // Auto calculate late minutes if checkInTime provided
    let calculatedLateMinutes = rec.lateMinutes;
    if (rec.checkInTime && settings.studentAttendanceRules) {
      const lateCalc = calculateStudentLateMinutes(rec.checkInTime, settings.studentAttendanceRules);
      calculatedLateMinutes = lateCalc.lateMinutes;
    }

    const prepared: StudentAttendanceRecord = {
      ...rec,
      id: rec.id || `ATT-STD-${rec.studentId}-${rec.date}`,
      lateMinutes: calculatedLateMinutes,
      recordedBy: rec.recordedBy || user?.fullName || 'شؤون الطلاب',
      recordedAt: rec.recordedAt || now,
      updatedAt: now,
      version: (rec.version || 0) + 1,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.STUDENT_ATTENDANCE, JSON.stringify(list));
    this.recalculateAttendanceDayCounts(rec.date);
    this.notifyChange();
    this.pushPost('saveStudentAttendance', prepared).catch(() => {});
    return { success: true, message: 'تم حفظ سجل حضور الطالب بنجاح' };
  }

  public bulkSaveStudentAttendance(records: StudentAttendanceRecord[]): void {
    this.saveStudentSchoolAttendanceBatch(records);
  }

  public saveStudentSchoolAttendanceBatch(records: StudentAttendanceRecord[]): { success: boolean; count: number; dayLocked?: boolean; message?: string } {
    if (records.length === 0) return { success: true, count: 0 };

    const firstDate = records[0].date;
    const day = this.getAttendanceDayByDate(firstDate);
    if (day && day.status === 'Locked') {
      return {
        success: false,
        count: 0,
        dayLocked: true,
        message: 'اليوم مقفل نهائياً. لا يمكن حفظ التعديلات الجماعية على يوم مقفل.',
      };
    }

    const list = this.getStudentAttendance();
    const map = new Map<string, number>();
    list.forEach((r, i) => map.set(`${r.studentId}_${r.date}`, i));
    const now = getCairoNowISO();
    const user = this.getCurrentUser();
    const settings = this.getSettings();

    records.forEach(rec => {
      const key = `${rec.studentId}_${rec.date}`;
      let calculatedLateMinutes = rec.lateMinutes;
      if (rec.checkInTime && settings.studentAttendanceRules) {
        const lateCalc = calculateStudentLateMinutes(rec.checkInTime, settings.studentAttendanceRules);
        calculatedLateMinutes = lateCalc.lateMinutes;
      }

      const prepared: StudentAttendanceRecord = {
        ...rec,
        id: rec.id || `ATT-STD-${rec.studentId}-${rec.date}`,
        lateMinutes: calculatedLateMinutes,
        recordedBy: rec.recordedBy || user?.fullName || 'شؤون الطلاب',
        recordedAt: rec.recordedAt || now,
        updatedAt: now,
        version: (rec.version || 0) + 1,
      };

      if (map.has(key)) {
        const idx = map.get(key)!;
        list[idx] = prepared;
      } else {
        list.push(prepared);
        map.set(key, list.length - 1);
      }
    });

    localStorage.setItem(STORAGE_KEYS.STUDENT_ATTENDANCE, JSON.stringify(list));
    this.recalculateAttendanceDayCounts(firstDate);
    this.logAudit('UPDATE', 'STUDENT_ATTENDANCE', `رصد حضور جماعي للمدرسة لعدد (${records.length}) طالب بتاريخ (${firstDate})`);
    this.notifyChange();
    this.pushPost('saveStudentSchoolAttendanceBatch', records).catch(() => {});
    return { success: true, count: records.length, message: `تم رصد حضور (${records.length}) طالب بنجاح` };
  }

  public async saveDailyStudentAttendanceBatchToBackend(params: {
    date: string;
    gradeId?: string;
    classroomId?: string;
    records: StudentAttendanceRecord[];
  }): Promise<{ success: boolean; message?: string; savedCount?: number; records?: StudentAttendanceRecord[]; cacheUpdated?: boolean }> {
    const { date, gradeId, classroomId, records } = params;
    if (!records || records.length === 0) {
      return { success: true, message: 'لا توجد سجلات لحفظها', savedCount: 0, records: [], cacheUpdated: false };
    }

    // Submit only operational attendance input. Student identity metadata,
    // record IDs, grade/classroom identity and audit fields are server-owned.
    const requestRecords = records.map(rec => ({
      studentId: String(rec.studentId || '').trim(),
      date,
      status: rec.status,
      lateMinutes: Number(rec.lateMinutes || 0),
      notes: String(rec.notes || '').trim(),
    }));

    const backendRes = await this.pushPostDirect('saveDailyStudentAttendanceBatch', {
      date,
      gradeId,
      classroomId,
      records: requestRecords,
    });

    if (!backendRes.success) {
      return {
        success: false,
        message: backendRes.message || 'فشل حفظ حضور الطلاب في الخادم. لم يتم تحديث التخزين المحلي.',
        cacheUpdated: false,
      };
    }

    const canonicalRecords = Array.isArray(backendRes.records)
      ? backendRes.records as StudentAttendanceRecord[]
      : null;

    if (!canonicalRecords || canonicalRecords.length !== records.length) {
      return {
        success: true,
        message: backendRes.message || 'تم الحفظ في الخادم، لكن لم يتم تحديث النسخة المحلية لعدم استلام سجلات طلاب معتمدة كاملة.',
        savedCount: Number(backendRes.savedCount || records.length),
        records: [],
        cacheUpdated: false,
      };
    }

    const current = this.getStudentAttendance();
    const map = new Map<string, StudentAttendanceRecord>();
    current.forEach(rec => {
      map.set(
        `${String(rec.date || '').trim()}_${String(rec.studentId || '').trim().toLowerCase()}`,
        rec
      );
    });

    canonicalRecords.forEach(rec => {
      const key = `${String(rec.date || '').trim()}_${String(rec.studentId || '').trim().toLowerCase()}`;
      map.set(key, { ...rec });
    });

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.STUDENT_ATTENDANCE, JSON.stringify(Array.from(map.values())));
      }
    } catch {}

    this.logAudit(
      'UPDATE',
      'STUDENT_ATTENDANCE',
      `تحديث نسخة عرض حضور الطلاب من السجلات المعتمدة للخادم لعدد (${canonicalRecords.length}) طالب بتاريخ (${date})`
    );
    this.notifyChange();

    return {
      success: true,
      message: backendRes.message || `تم حفظ حضور الفصل بنجاح (${canonicalRecords.length} طالب)`,
      savedCount: Number(backendRes.savedCount || canonicalRecords.length),
      records: canonicalRecords,
      cacheUpdated: true,
    };
  }

  public async saveDailyStaffAttendanceBatchToBackend(params: {
    date: string;
    records: AttendanceRecord[];
  }): Promise<{ success: boolean; message?: string; savedCount?: number; records?: AttendanceRecord[]; cacheUpdated?: boolean }> {
    const { date, records } = params;
    if (!records || records.length === 0) {
      return { success: true, message: 'لا توجد سجلات لحفظها', savedCount: 0, records: [], cacheUpdated: false };
    }

    // Client submits only operational inputs. Identity metadata, IDs, calculated values,
    // school context and timestamps are owned by the authoritative backend.
    const requestRecords = records.map(rec => ({
      employeeId: String(rec.employeeId || '').trim(),
      date,
      status: rec.status,
      checkIn: String(rec.checkIn || '').trim(),
      checkOut: String(rec.checkOut || '').trim(),
      notes: String(rec.notes || '').trim(),
    }));

    const backendRes = await this.pushPostDirect('saveDailyStaffAttendanceBatch', {
      date,
      records: requestRecords,
    });

    if (!backendRes.success) {
      return {
        success: false,
        message: backendRes.message || 'فشل حفظ حضور العاملين في الخادم. لم يتم تحديث التخزين المحلي.',
        cacheUpdated: false,
      };
    }

    // Only server-returned canonical records may update the UX cache.
    const canonicalRecords = Array.isArray(backendRes.records)
      ? backendRes.records as AttendanceRecord[]
      : null;

    if (!canonicalRecords || canonicalRecords.length !== records.length) {
      return {
        success: true,
        message: backendRes.message || 'تم الحفظ في الخادم، لكن لم يتم تحديث النسخة المحلية لعدم استلام سجلات معتمدة كاملة.',
        savedCount: Number(backendRes.savedCount || records.length),
        records: [],
        cacheUpdated: false,
      };
    }

    const all = this.getAttendance();
    const map = new Map<string, AttendanceRecord>();
    all.forEach(a => {
      map.set(`${String(a.date || '').trim()}_${String(a.employeeId || '').trim().toLowerCase()}`, a);
    });

    canonicalRecords.forEach(rec => {
      const key = `${String(rec.date || '').trim()}_${String(rec.employeeId || '').trim().toLowerCase()}`;
      map.set(key, { ...rec });
    });

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(Array.from(map.values())));
      }
    } catch {}

    this.logAudit(
      'UPDATE',
      'ATTENDANCE',
      `تحديث نسخة العرض المحلية من السجلات المعتمدة للخادم لعدد (${canonicalRecords.length}) موظف بتاريخ (${date})`
    );
    this.notifyChange();

    return {
      success: true,
      message: backendRes.message || `تم حفظ دوام العاملين بنجاح (${canonicalRecords.length} موظف)`,
      savedCount: Number(backendRes.savedCount || canonicalRecords.length),
      records: canonicalRecords,
      cacheUpdated: true,
    };
  }

  // ---------------- Attendance Exceptions ----------------
  public getAttendanceExceptions(filters?: {
    date?: string;
    status?: 'OPEN' | 'RESOLVED' | 'DISMISSED';
    studentId?: string;
  }): AttendanceException[] {
    const raw = localStorage.getItem(STORAGE_KEYS.ATTENDANCE_EXCEPTIONS);
    if (!raw) return [];
    try {
      const parsed: AttendanceException[] = JSON.parse(raw);
      if (!filters) return parsed;
      return parsed.filter(e => {
        if (filters.date && e.date !== filters.date) return false;
        if (filters.status && e.status !== filters.status) return false;
        if (filters.studentId && e.studentId !== filters.studentId) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  public batchSaveAttendanceExceptions(exceptions: AttendanceException[]): void {
    const list = this.getAttendanceExceptions();
    const map = new Map<string, number>();
    list.forEach((e, i) => map.set(e.id, i));

    exceptions.forEach(exc => {
      if (map.has(exc.id)) {
        list[map.get(exc.id)!] = { ...list[map.get(exc.id)!], ...exc };
      } else {
        list.unshift(exc);
        map.set(exc.id, 0);
      }
    });

    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_EXCEPTIONS, JSON.stringify(list));
    this.notifyChange();
  }

  public resolveAttendanceException(
    exceptionId: string,
    resolution: string,
    status: 'RESOLVED' | 'DISMISSED' = 'RESOLVED'
  ): { success: boolean; message?: string } {
    const list = this.getAttendanceExceptions();
    const target = list.find(e => e.id === exceptionId);
    if (!target) return { success: false, message: 'الاستثناء غير موجود' };

    const user = this.getCurrentUser();
    target.status = status;
    target.resolution = resolution;
    target.resolvedBy = user?.fullName || 'مشرف الحضور';
    target.resolvedAt = getCairoNowISO();

    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_EXCEPTIONS, JSON.stringify(list));
    this.logAudit('UPDATE', 'STUDENT_ATTENDANCE', `معالجة استثناء الحضور (${target.studentName}): ${resolution}`);
    this.notifyChange();
    return { success: true, message: 'تمت تسوية استثناء الحضور بنجاح' };
  }

  // ---------------- Behavior & Violations ----------------
  public getBehaviorTypes(): BehaviorType[] {
    const raw = localStorage.getItem(STORAGE_KEYS.BEHAVIOR_TYPES);
    if (!raw) return DEFAULT_BEHAVIOR_TYPES;
    try {
      const parsed = JSON.parse(raw);
      return parsed.length > 0 ? parsed : DEFAULT_BEHAVIOR_TYPES;
    } catch {
      return DEFAULT_BEHAVIOR_TYPES;
    }
  }

  public saveBehaviorType(type: BehaviorType): void {
    const list = this.getBehaviorTypes();
    const idx = list.findIndex(t => t.id === type.id);
    if (idx >= 0) {
      list[idx] = type;
    } else {
      list.push({ ...type, id: type.id || `BEH-${Date.now()}` });
    }
    localStorage.setItem(STORAGE_KEYS.BEHAVIOR_TYPES, JSON.stringify(list));
    this.logAudit('UPDATE', 'BEHAVIOR', `تعديل دليل المخالفات: ${type.name}`);
    this.notifyChange();
    this.pushPost('saveBehaviorType', type).catch(() => {});
  }

  public deleteBehaviorType(id: string): void {
    const list = this.getBehaviorTypes().filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEYS.BEHAVIOR_TYPES, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('deleteBehaviorType', { id }).catch(() => {});
  }

  public getBehaviorViolations(): BehaviorViolation[] {
    const raw = localStorage.getItem(STORAGE_KEYS.BEHAVIOR_VIOLATIONS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveBehaviorViolation(violation: BehaviorViolation): void {
    const list = this.getBehaviorViolations();
    const idx = list.findIndex(v => v.id === violation.id);
    const now = getCairoNowISO();
    const user = this.getCurrentUser();

    const prepared: BehaviorViolation = {
      ...violation,
      id: violation.id || `VIO-${Date.now()}`,
      recordedBy: violation.recordedBy || user?.fullName || 'المشرف',
      createdAt: violation.createdAt || now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
      this.logAudit('UPDATE', 'BEHAVIOR', `تعديل مخالفة للطالب: ${prepared.studentName} - ${prepared.violationName}`);
    } else {
      list.unshift(prepared);
      this.logAudit('CREATE', 'BEHAVIOR', `تسجيل مخالفة جديدة: ${prepared.studentName} - ${prepared.violationName} (-${prepared.pointsDeducted} نقطة)`);
    }

    localStorage.setItem(STORAGE_KEYS.BEHAVIOR_VIOLATIONS, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveViolation', prepared).catch(() => {});
  }

  public deleteBehaviorViolation(id: string): void {
    const list = this.getBehaviorViolations();
    const target = list.find(v => v.id === id);
    const filtered = list.filter(v => v.id !== id);
    localStorage.setItem(STORAGE_KEYS.BEHAVIOR_VIOLATIONS, JSON.stringify(filtered));
    if (target) {
      this.logAudit('DELETE', 'BEHAVIOR', `حذف مخالفة للطالب: ${target.studentName}`);
    }
    this.notifyChange();
    this.pushPost('deleteViolation', { id }).catch(() => {});
  }

  public calculateStudentBehaviorScore(studentId: string): { currentScore: number; violationsCount: number; statusText: string; statusColor: string } {
    const settings = this.getSettings();
    const rules = settings.behaviorScoreRules || DEFAULT_BEHAVIOR_RULES;
    const violations = this.getBehaviorViolations().filter(v => v.studentId === studentId && v.status !== 'ملغاة');

    const totalDeductions = violations.reduce((sum, v) => sum + (v.pointsDeducted || 0), 0);
    const currentScore = Math.max(rules.minScore, rules.initialScore - totalDeductions);

    let statusText = 'ممتاز';
    let statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';

    if (currentScore < rules.dangerThreshold) {
      statusText = 'يحتاج تدخل الإدارة';
      statusColor = 'text-rose-700 bg-rose-50 border-rose-200';
    } else if (currentScore < rules.warningThreshold) {
      statusText = 'يحتاج متابعة سلوكية';
      statusColor = 'text-amber-700 bg-amber-50 border-amber-200';
    } else if (currentScore < rules.goodThreshold) {
      statusText = 'جيد';
      statusColor = 'text-blue-700 bg-blue-50 border-blue-200';
    }

    return {
      currentScore,
      violationsCount: violations.length,
      statusText,
      statusColor,
    };
  }

  // ---------------- Class-by-Class Attendance (Period Attendance) ----------------
  public getClassAttendance(filters?: {
    date?: string;
    studentId?: string;
    grade?: string;
    classroom?: string;
    periodNumber?: number;
    teacherId?: string;
  }): ClassAttendanceRecord[] {
    const raw = localStorage.getItem(STORAGE_KEYS.CLASS_ATTENDANCE);
    if (!raw) return [];
    try {
      const parsed: ClassAttendanceRecord[] = JSON.parse(raw);
      if (!filters) return parsed;
      return parsed.filter(c => {
        if (filters.date && c.date !== filters.date) return false;
        if (filters.studentId && c.studentId !== filters.studentId) return false;
        if (filters.grade && c.grade !== filters.grade) return false;
        if (filters.classroom && c.classroom !== filters.classroom) return false;
        if (filters.periodNumber !== undefined && c.periodNumber !== filters.periodNumber) return false;
        if (filters.teacherId && c.teacherId !== filters.teacherId) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  public saveClassAttendanceRecord(rec: ClassAttendanceRecord): { success: boolean; message?: string } {
    const day = this.getAttendanceDayByDate(rec.date);
    if (day && day.status === 'Locked') {
      return { success: false, message: 'اليوم الدراسي مقفل نهائياً. لا يمكن تعديل حضور الحصص ليوم مقفل.' };
    }

    const list = this.getClassAttendance();
    const idx = list.findIndex(
      r => r.studentId === rec.studentId && r.date === rec.date && r.periodNumber === rec.periodNumber
    );
    const now = getCairoNowISO();
    const user = this.getCurrentUser();

    const prepared: ClassAttendanceRecord = {
      ...rec,
      id: rec.id || `ATT-CLS-${rec.studentId}-${rec.date}-P${rec.periodNumber}`,
      teacherName: rec.teacherName || user?.fullName || 'المعلم',
      recordedAt: rec.recordedAt || now,
      updatedAt: now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.CLASS_ATTENDANCE, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveClassAttendance', prepared).catch(() => {});
    return { success: true, message: 'تم حفظ حضور الحصة بنجاح' };
  }

  public saveClassAttendanceBatch(records: ClassAttendanceRecord[]): {
    success: boolean;
    count: number;
    exceptionsGenerated: number;
    message?: string;
  } {
    if (records.length === 0) return { success: true, count: 0, exceptionsGenerated: 0 };

    const firstDate = records[0].date;
    const day = this.getAttendanceDayByDate(firstDate);
    if (day && day.status === 'Locked') {
      return {
        success: false,
        count: 0,
        exceptionsGenerated: 0,
        message: 'اليوم الدراسي مقفل نهائياً. لا يمكن تعديل أو رصد حضور الحصص ليوم مقفل.',
      };
    }

    const list = this.getClassAttendance();
    const map = new Map<string, number>();
    list.forEach((r, i) => map.set(`${r.studentId}_${r.date}_${r.periodNumber}`, i));
    const now = getCairoNowISO();
    const user = this.getCurrentUser();
    const date = records[0].date;

    // For cross-reference mismatch checking
    const schoolAttendance = this.getStudentAttendance().filter(a => a.date === date);
    const schoolMap = new Map<string, StudentAttendanceRecord>();
    schoolAttendance.forEach(s => schoolMap.set(s.studentId, s));

    const generatedExceptions: AttendanceException[] = [];

    records.forEach(rec => {
      const key = `${rec.studentId}_${rec.date}_${rec.periodNumber}`;
      const prepared: ClassAttendanceRecord = {
        ...rec,
        id: rec.id || `ATT-CLS-${rec.studentId}-${rec.date}-P${rec.periodNumber}`,
        teacherName: rec.teacherName || user?.fullName || 'المعلم',
        recordedAt: rec.recordedAt || now,
        updatedAt: now,
      };

      if (map.has(key)) {
        const idx = map.get(key)!;
        list[idx] = prepared;
      } else {
        list.push(prepared);
        map.set(key, list.length - 1);
      }

      // Check Mismatches with School Attendance
      const schoolRec = schoolMap.get(rec.studentId);
      if (schoolRec) {
        const isSchoolAbsent = schoolRec.status === 'غائب' || schoolRec.status === 'غائب بدون عذر' || schoolRec.status === 'غائب بعذر';
        const isClassPresent = rec.status === 'حاضر' || rec.status === 'متأخر';

        if (isSchoolAbsent && isClassPresent) {
          generatedExceptions.push({
            id: `EXC-ABS-PRS-${rec.studentId}-${rec.date}-P${rec.periodNumber}`,
            studentId: rec.studentId,
            studentName: rec.studentName,
            studentCode: rec.studentCode,
            grade: rec.grade,
            classroom: rec.classroom,
            date: rec.date,
            periodNumber: rec.periodNumber,
            type: 'SCHOOL_ABSENT_CLASS_PRESENT',
            severity: 'CRITICAL',
            description: `الطالب مسجل غائب في الحضور المدرسي العام، ولكنه رُصد ${rec.status} في حصة ${rec.subjectName || ''} (حصة ${rec.periodNumber}).`,
            schoolStatus: schoolRec.status,
            classStatus: rec.status,
            status: 'OPEN',
            createdAt: now,
          });
        }

        const isSchoolPresent = schoolRec.status === 'حاضر' || schoolRec.status === 'متأخر';
        const isClassAbsent = rec.status === 'غائب' || rec.status === 'هروب';

        if (isSchoolPresent && isClassAbsent) {
          generatedExceptions.push({
            id: `EXC-PRS-ABS-${rec.studentId}-${rec.date}-P${rec.periodNumber}`,
            studentId: rec.studentId,
            studentName: rec.studentName,
            studentCode: rec.studentCode,
            grade: rec.grade,
            classroom: rec.classroom,
            date: rec.date,
            periodNumber: rec.periodNumber,
            type: rec.status === 'هروب' ? 'CLASS_TRUANCY' : 'SCHOOL_PRESENT_CLASS_ABSENT',
            severity: rec.status === 'هروب' ? 'CRITICAL' : 'WARNING',
            description: rec.status === 'هروب'
              ? `اشتباه هروب: الطالب حاضر في المدرسة لكنه هرَب من حصة ${rec.subjectName || ''} (حصة ${rec.periodNumber}).`
              : `الطالب حاضر بالمدرسة ولكنه لم يحضر حصة ${rec.subjectName || ''} (حصة ${rec.periodNumber}).`,
            schoolStatus: schoolRec.status,
            classStatus: rec.status,
            status: 'OPEN',
            createdAt: now,
          });
        }
      }
    });

    localStorage.setItem(STORAGE_KEYS.CLASS_ATTENDANCE, JSON.stringify(list));

    if (generatedExceptions.length > 0) {
      this.batchSaveAttendanceExceptions(generatedExceptions);
    }

    this.logAudit(
      'UPDATE',
      'CLASS_ATTENDANCE',
      `رصد حضور جماعي للحصة: (${records.length}) طالب - مادة ${records[0]?.subjectName || ''} - فصل (${records[0]?.grade} ${records[0]?.classroom}) - تم رصد (${generatedExceptions.length}) استثناء`
    );

    this.notifyChange();
    this.pushPost('saveClassAttendanceBatch', records).catch(() => {});
    return {
      success: true,
      count: records.length,
      exceptionsGenerated: generatedExceptions.length,
      message: `تم رصد حضور الحصة لـ (${records.length}) طالب بنجاح`,
    };
  }

  // ---------------- Schedule Periods & Config ----------------
  public getSchedulePeriods(): SchedulePeriodItem[] {
    const settings = this.getSettings();
    return settings.scheduleConfig?.periods || DEFAULT_SCHEDULE_CONFIG.periods;
  }

  public saveSchedulePeriods(periods: SchedulePeriodItem[]): void {
    const settings = this.getSettings();
    const scheduleConfig = settings.scheduleConfig || { ...DEFAULT_SCHEDULE_CONFIG };
    scheduleConfig.periods = periods;
    this.saveSettings({ scheduleConfig }, `تحديث توقيتات وتفاصيل الحصص الدراسية (${periods.length} حصة)`);
  }

  // ---------------- Schedule & Lesson Content ----------------
  public getSchedule(): ScheduleItem[] {
    const raw = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveSchedule(items: ScheduleItem[]): void {
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(items));
    this.notifyChange();
  }

  public async saveScheduleItem(item: ScheduleItem): Promise<{ success: boolean; message?: string }> {
    const caller = this.getCurrentUser();
    if (!caller || !caller.sessionToken) {
      return { success: false, message: 'يجب تسجيل الدخول لإجراء تعديلات على الجدول الدراسي.' };
    }
    const isScheduleAdmin = caller.role === 'Admin' || caller.role === 'SchoolDirector' || (caller.role as string) === 'Supervisor' || caller.role === 'TeacherAffairs';
    if (!isScheduleAdmin) {
      return { success: false, message: 'غير مصرح للمعلم بتعديل أو إضافة حصص في الجدول العام (مقتصر على الإدارة والمشرفين).' };
    }

    const scriptUrl = this.getBackendUrl();
    if (!scriptUrl || scriptUrl.length < 15) {
      return { success: false, message: 'Google Apps Script URL غير مهيأ' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveScheduleEntry',
          data: item,
          payload: item,
          sessionToken: caller.sessionToken,
          userId: caller.id,
          userRole: caller.role,
          requestId: `REQ-SCH-${Date.now()}-${generateCryptographicToken(6)}`,
          clientTimestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      return {
        success: false,
        message: err?.name === 'AbortError'
          ? 'انتهت مهلة الاتصال بالخادم، يرجى إعادة المحاولة'
          : `تعذر الاتصال بالخادم الخلفي: ${err?.message || 'خطأ في الشبكة'}`
      };
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        this.setCurrentUser(null);
        this.setSyncStatus({ ...this.getSyncStatus(), status: 'session_expired', errorMessage: 'انتهت صلاحية جلسة العمل، يرجى إعادة تسجيل الدخول' });
        return { success: false, message: 'انتهت صلاحية جلسة العمل. يرجى تسجيل الدخول مجدداً.' };
      }
      return { success: false, message: `فشل الحفظ في خادم البيانات (HTTP ${response.status})` };
    }

    let resData: any = null;
    try {
      resData = await response.json();
    } catch {
      return { success: false, message: 'استجابة غير صالحة من خادم البيانات' };
    }

    if (resData && (resData.status === 'error' || resData.success === false)) {
      if (resData.code === 'SESSION_EXPIRED' || resData.code === 'AUTH_REQUIRED' || resData.code === 'INVALID_SESSION') {
        this.setCurrentUser(null);
        this.setSyncStatus({ ...this.getSyncStatus(), status: 'session_expired', errorMessage: resData.message || 'انتهت الجلسة' });
      }
      return { success: false, message: resData.message || 'فشل حفظ الحصة في خادم البيانات' };
    }

    // Backend success ONLY: update localStorage cache and notify
    const list = this.getSchedule();
    const idx = list.findIndex(s => s.id === item.id);
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.push({ ...item, id: item.id || `SCH-${Date.now()}` });
    }
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(list));
    this.logAudit('UPDATE', 'SCHEDULE', `تعديل الجدول الدراسي: ${item.grade} ${item.classroom} - ${item.subject}`);
    this.notifyChange();
    return { success: true, message: resData?.message || 'تم حفظ الحصة في الجدول بنجاح' };
  }

  public async saveScheduleEntry(item: ScheduleItem): Promise<{ success: boolean; message?: string }> {
    return this.saveScheduleItem(item);
  }

  public async deleteScheduleItem(id: string): Promise<{ success: boolean; message?: string }> {
    const caller = this.getCurrentUser();
    if (!caller || !caller.sessionToken) {
      return { success: false, message: 'يجب تسجيل الدخول لحذف حصة من الجدول الدراسي.' };
    }
    const isScheduleAdmin = caller.role === 'Admin' || caller.role === 'SchoolDirector' || (caller.role as string) === 'Supervisor' || caller.role === 'TeacherAffairs';
    if (!isScheduleAdmin) {
      return { success: false, message: 'غير مصرح للمعلم بحذف حصص من الجدول العام.' };
    }

    const scriptUrl = this.getBackendUrl();
    if (!scriptUrl || scriptUrl.length < 15) {
      return { success: false, message: 'Google Apps Script URL غير مهيأ' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'deleteScheduleEntry',
          data: { id },
          payload: { id },
          sessionToken: caller.sessionToken,
          userId: caller.id,
          userRole: caller.role,
          requestId: `REQ-DEL-${Date.now()}-${generateCryptographicToken(6)}`,
          clientTimestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      return {
        success: false,
        message: err?.name === 'AbortError'
          ? 'انتهت مهلة الاتصال بالخادم، يرجى إعادة المحاولة'
          : `تعذر الاتصال بالخادم الخلفي: ${err?.message || 'خطأ في الشبكة'}`
      };
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        this.setCurrentUser(null);
        this.setSyncStatus({ ...this.getSyncStatus(), status: 'session_expired', errorMessage: 'انتهت صلاحية جلسة العمل، يرجى إعادة تسجيل الدخول' });
        return { success: false, message: 'انتهت صلاحية جلسة العمل. يرجى تسجيل الدخول مجدداً.' };
      }
      return { success: false, message: `فشل الحذف من خادم البيانات (HTTP ${response.status})` };
    }

    let resData: any = null;
    try {
      resData = await response.json();
    } catch {
      return { success: false, message: 'استجابة غير صالحة من خادم البيانات' };
    }

    if (resData && (resData.status === 'error' || resData.success === false)) {
      if (resData.code === 'SESSION_EXPIRED' || resData.code === 'AUTH_REQUIRED' || resData.code === 'INVALID_SESSION') {
        this.setCurrentUser(null);
        this.setSyncStatus({ ...this.getSyncStatus(), status: 'session_expired', errorMessage: resData.message || 'انتهت الجلسة' });
      }
      return { success: false, message: resData.message || 'فشل حذف الحصة من خادم البيانات' };
    }

    // Backend success ONLY: remove from local cache and notify
    const list = this.getSchedule().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(list));
    this.logAudit('DELETE', 'SCHEDULE', `حذف حصة دراسية: ${id}`);
    this.notifyChange();
    return { success: true, message: resData?.message || 'تم حذف الحصة من الجدول' };
  }

  public async deleteScheduleEntry(id: string): Promise<{ success: boolean; message?: string }> {
    return this.deleteScheduleItem(id);
  }

  public getLessonContents(): LessonContent[] {
    const raw = localStorage.getItem(STORAGE_KEYS.LESSON_CONTENT);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveLessonContent(lesson: LessonContent): void {
    const list = this.getLessonContents();
    const idx = list.findIndex(l => l.id === lesson.id);
    const now = getCairoNowISO();
    const user = this.getCurrentUser();

    const prepared: LessonContent = {
      ...lesson,
      id: lesson.id || `LES-${Date.now()}`,
      teacherName: lesson.teacherName || user?.fullName || 'المعلم',
      createdAt: lesson.createdAt || now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.LESSON_CONTENT, JSON.stringify(list));
    this.logAudit('CREATE', 'LESSON', `تسجيل ما تم تدريسه: ${prepared.subject} (${prepared.grade} - ${prepared.classroom}) - ${prepared.lessonTitle}`);
    this.notifyChange();
    this.pushPost('saveLessonContent', prepared).catch(() => {});
  }

  // ---------------- Homework Engine ----------------
  public getHomeworks(): Homework[] {
    const raw = localStorage.getItem(STORAGE_KEYS.HOMEWORKS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveHomework(hw: Partial<Homework>): Homework {
    const list = this.getHomeworks();
    const idx = list.findIndex(h => h.id === hw.id);
    const now = getCairoNowISO();
    const user = this.getCurrentUser();

    const prepared: Homework = {
      id: hw.id || `HW-${Date.now()}`,
      lessonInstanceId: hw.lessonInstanceId,
      scheduleItemId: hw.scheduleItemId,
      teacherId: hw.teacherId || user?.employeeId || user?.id || 'TCH',
      teacherName: hw.teacherName || user?.fullName || 'المعلم',
      subject: hw.subject || 'المادة',
      grade: hw.grade || '',
      classroom: hw.classroom || '',
      title: hw.title || 'واجب مدرسي',
      description: hw.description || '',
      questions: hw.questions || '',
      assignedDate: hw.assignedDate || now.split('T')[0],
      dueDate: hw.dueDate || now.split('T')[0],
      maxScore: hw.maxScore || 10,
      status: (hw.status as any) || 'Published',
      isVisibleToParent: hw.isVisibleToParent !== false,
      isVisibleToStudent: hw.isVisibleToStudent !== false,
      links: hw.links || [],
      createdAt: hw.createdAt || now,
      updatedAt: now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.HOMEWORKS, JSON.stringify(list));
    this.logAudit('CREATE', 'LESSON', `تكليف واجب: ${prepared.title} - ${prepared.subject} (${prepared.classroom})`);
    this.notifyChange();
    this.pushPost('saveHomework', prepared).catch(() => {});
    return prepared;
  }

  // ---------------- Employees & Teachers ----------------
  public getTeachers(): Employee[] {
    return this.getEmployees().filter(
      (e) =>
        e.employeeType === 'Teacher' ||
        e.isTeacher ||
        e.isTeachingStaff ||
        Boolean(e.teacherCode) ||
        (e.jobTitle && e.jobTitle.includes('معلم'))
    );
  }

  public getEmployees(_options?: { includeFinancials?: boolean }): Employee[] {
    let raw = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    if (!raw) {
      const legacyRaw = localStorage.getItem('ntss_employees');
      if (legacyRaw) {
        raw = legacyRaw;
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, legacyRaw);
      }
    }
    if (!raw) return [];
    try {
      const list: any[] = JSON.parse(raw);
      // Phase 2: Salary fields are retired and strictly forbidden from active UI/DTO/Local Cache
      return list.map(e => {
        const isTeacher = Boolean(
          e.employeeType === 'Teacher' ||
          e.isTeacher ||
          e.teacherCode ||
          e.isTeachingStaff ||
          (e.jobTitle && String(e.jobTitle).includes('معلم'))
        );
        const empType: 'Teacher' | 'Administrative' = e.employeeType === 'Teacher' || isTeacher ? 'Teacher' : 'Administrative';
        const specialization = e.specialization || e.department || (empType === 'Teacher' ? 'تعليم عام' : 'إدارة عامة');

        const clean: Employee = {
          ...e,
          employeeType: empType,
          specialization,
          isTeacher,
          isTeachingStaff: isTeacher,
        };

        // Strictly delete retired financial fields from memory and active DTOs
        delete clean.basicSalary;
        delete clean.allowances;
        delete clean.salary;
        delete (clean as any).netSalary;

        return clean;
      });
    } catch {
      return [];
    }
  }

  public getNextLoginNumber(): number {
    const users = this.getUsers();
    const employees = this.getEmployees({ includeFinancials: false });
    let highest = 120;

    users.forEach(u => {
      const n = Number(u.loginNumber);
      if (Number.isFinite(n) && n > highest) highest = n;
    });

    employees.forEach(e => {
      const n = Number(e.loginNumber);
      if (Number.isFinite(n) && n > highest) highest = n;
    });

    const storedLast = Number(localStorage.getItem('ntss_last_allocated_login_num'));
    if (Number.isFinite(storedLast) && storedLast > highest) {
      highest = storedLast;
    }

    const next = highest + 1;
    localStorage.setItem('ntss_last_allocated_login_num', String(next));
    return next;
  }

  public generateNextLoginNumber(): number {
    return this.getNextLoginNumber();
  }

  public getEmployeeById(id: string): Employee | undefined {
    return this.getEmployees({ includeFinancials: true }).find(e => e.id === id || e.employeeId === id);
  }

  public migrateLoginNumbersAndFirstLoginState(): void {
    const employees = this.getEmployees({ includeFinancials: true });
    let empUpdated = false;
    employees.forEach(emp => {
      if (!emp.loginNumber) {
        emp.loginNumber = this.getNextLoginNumber();
        empUpdated = true;
      }
    });
    if (empUpdated) {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    }

    const users = this.getUsers();
    let userUpdated = false;
    users.forEach(u => {
      if (!u.loginNumber) {
        u.loginNumber = this.getNextLoginNumber();
        userUpdated = true;
      }
      if (u.passwordInitialized === undefined) {
        u.passwordInitialized = true;
        userUpdated = true;
      }
    });
    if (userUpdated) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }
  }

  public saveEmployee(emp: Employee): { success: boolean; message?: string } {
    const list = this.getEmployees();
    const idx = list.findIndex(e => e.id === emp.id);

    const isTeacher = Boolean(
      emp.employeeType === 'Teacher' ||
      emp.isTeacher ||
      emp.teacherCode ||
      emp.isTeachingStaff ||
      (emp.jobTitle && emp.jobTitle.includes('معلم'))
    );
    const empType: 'Teacher' | 'Administrative' = emp.employeeType === 'Teacher' || isTeacher ? 'Teacher' : 'Administrative';
    const assignedLoginNumber = emp.loginNumber || this.getNextLoginNumber();
    let teacherCode = emp.teacherCode;
    if (isTeacher && !teacherCode) {
      teacherCode = `T-${String(assignedLoginNumber).padStart(3, '0')}`;
    }

    const normalizedEmp: Employee = {
      ...emp,
      employeeId: emp.employeeId || emp.id,
      fullName: emp.fullName || emp.name,
      name: emp.fullName || emp.name,
      employeeType: empType,
      specialization: emp.specialization || (empType === 'Teacher' ? 'تعليم عام' : 'إدارة عامة'),
      isTeachingStaff: isTeacher,
      isTeacher: isTeacher,
      teacherId: isTeacher ? (emp.teacherId || emp.id) : emp.teacherId,
      teacherCode: teacherCode,
      loginNumber: assignedLoginNumber,
    };

    // Phase 2: Strictly eliminate salary fields before persisting
    delete normalizedEmp.basicSalary;
    delete normalizedEmp.allowances;
    delete normalizedEmp.salary;
    delete (normalizedEmp as any).netSalary;
    delete (normalizedEmp as any).password;
    delete (normalizedEmp as any).passwordHash;

    if (idx >= 0) {
      const old = list[idx];
      list[idx] = normalizedEmp;
      this.logAudit('UPDATE', 'EMPLOYEE', `تعديل بيانات الموظف/المعلم: ${normalizedEmp.name} (${normalizedEmp.specialization})`, JSON.stringify(old), JSON.stringify(normalizedEmp), normalizedEmp.id);
    } else {
      list.push(normalizedEmp);
      this.logAudit('CREATE', 'EMPLOYEE', `إضافة موظف/معلم جديد: ${normalizedEmp.name} (${normalizedEmp.jobTitle} - ${normalizedEmp.specialization})`, '', JSON.stringify(normalizedEmp), normalizedEmp.id);
    }
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveEmployee', normalizedEmp).catch(() => {});
    return { success: true, message: 'تم حفظ بيانات الموظف بنجاح' };
  }

  public bulkSaveEmployees(importedEmployees: Partial<Employee>[]): { success: boolean; added: number; updated: number; message: string } {
    const list = this.getEmployees();
    let added = 0;
    let updated = 0;
    const sanitizedListToPush: Employee[] = [];

    importedEmployees.forEach(rawEmp => {
      if (!rawEmp.name || !rawEmp.name.trim()) return;

      const isTeacher = Boolean(
        rawEmp.employeeType === 'Teacher' ||
        rawEmp.isTeacher ||
        rawEmp.teacherCode ||
        (rawEmp.jobTitle && rawEmp.jobTitle.includes('معلم'))
      );
      const empType: 'Teacher' | 'Administrative' = rawEmp.employeeType === 'Teacher' || isTeacher ? 'Teacher' : 'Administrative';

      // Match strategy: 1) immutable id/employeeId if present, 2) unique nationalId if present
      let existingIdx = -1;
      if (rawEmp.id) {
        existingIdx = list.findIndex(e => e.id === rawEmp.id || e.employeeId === rawEmp.id);
      }
      if (existingIdx === -1 && rawEmp.nationalId && rawEmp.nationalId.trim()) {
        const cleanNid = rawEmp.nationalId.trim();
        existingIdx = list.findIndex(e => e.nationalId && e.nationalId.trim() === cleanNid);
      }

      const assignedLoginNumber = rawEmp.loginNumber || (existingIdx >= 0 ? list[existingIdx].loginNumber : this.getNextLoginNumber());
      let teacherCode = rawEmp.teacherCode;
      if (isTeacher && !teacherCode) {
        teacherCode = existingIdx >= 0 && list[existingIdx].teacherCode ? list[existingIdx].teacherCode : `T-${String(assignedLoginNumber).padStart(3, '0')}`;
      }

      const id = existingIdx >= 0 ? list[existingIdx].id : (rawEmp.id || `EMP${String(list.length + added + 1).padStart(3, '0')}`);

      const emp: Employee = {
        ...(existingIdx >= 0 ? list[existingIdx] : {}),
        ...rawEmp,
        id,
        employeeId: id,
        name: rawEmp.name.trim(),
        fullName: rawEmp.name.trim(),
        employeeType: empType,
        jobTitle: rawEmp.jobTitle || (empType === 'Teacher' ? 'معلم' : 'إداري'),
        specialization: rawEmp.specialization || (existingIdx >= 0 ? list[existingIdx].specialization : (empType === 'Teacher' ? 'تعليم عام' : 'إدارة عامة')),
        teacherCode: isTeacher ? teacherCode : undefined,
        nationalId: rawEmp.nationalId || (existingIdx >= 0 ? list[existingIdx].nationalId : ''),
        phone: rawEmp.phone || (existingIdx >= 0 ? list[existingIdx].phone : ''),
        email: rawEmp.email || (existingIdx >= 0 ? list[existingIdx].email : ''),
        hireDate: rawEmp.hireDate || (existingIdx >= 0 ? list[existingIdx].hireDate : new Date().toISOString().split('T')[0]),
        status: rawEmp.status || (existingIdx >= 0 ? list[existingIdx].status : 'Active'),
        workingHours: rawEmp.workingHours || (existingIdx >= 0 ? list[existingIdx].workingHours : 8),
        workStartTime: rawEmp.workStartTime || (existingIdx >= 0 ? list[existingIdx].workStartTime : '07:30'),
        workEndTime: rawEmp.workEndTime || (existingIdx >= 0 ? list[existingIdx].workEndTime : '14:30'),
        daysOff: rawEmp.daysOff || (existingIdx >= 0 ? list[existingIdx].daysOff : ['الجمعة', 'السبت']),
        loginNumber: assignedLoginNumber,
        isTeacher,
        isTeachingStaff: isTeacher,
      };

      // Ensure forbidden fields are purged
      delete emp.basicSalary;
      delete emp.allowances;
      delete emp.salary;
      delete (emp as any).netSalary;
      delete (emp as any).password;
      delete (emp as any).passwordHash;

      if (existingIdx >= 0) {
        list[existingIdx] = emp;
        updated++;
      } else {
        list.push(emp);
        added++;
      }
      sanitizedListToPush.push(emp);
    });

    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));
    this.logAudit('BULK_IMPORT', 'EMPLOYEE', `استيراد جماعي لبيانات العاملين: ${added} جديد، ${updated} تم تحديثه`, '', `${added + updated} records`, 'BULK');
    this.notifyChange();
    this.pushPost('bulkSaveEmployees', sanitizedListToPush).catch(() => {});

    return {
      success: true,
      added,
      updated,
      message: `تم استيراد ${added + updated} موظف بنجاح (${added} جديد، ${updated} تحديث)`,
    };
  }

  public deleteEmployee(id: string): { success: boolean; message?: string } {
    const list = this.getEmployees();
    const target = list.find(e => e.id === id);
    const filtered = list.filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(filtered));
    if (target) {
      this.logAudit('DELETE', 'EMPLOYEE', `حذف الموظف: ${target.name}`, JSON.stringify(target), '', id);
    }
    this.notifyChange();
    this.pushPost('deleteEmployee', { id }).catch(() => {});
    return { success: true, message: 'تم حذف الموظف بنجاح' };
  }

  // ---------------- Attendance (Staff & Teachers) ----------------
  public getAttendance(): AttendanceRecord[] {
    const raw = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveAttendanceRecord(record: AttendanceRecord): void {
    const list = this.getAttendance();
    const idx = list.findIndex(a => a.employeeId === record.employeeId && a.date === record.date);
    const now = getCairoNowISO();
    const user = this.getCurrentUser();

    const prepared: AttendanceRecord = {
      ...record,
      id: record.id || `ATT-${record.employeeId}-${record.date}`,
      updatedBy: user?.fullName || 'النظام',
      updatedAt: now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      prepared.createdBy = user?.fullName || 'النظام';
      prepared.createdAt = now;
      list.unshift(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveAttendance', prepared).catch(() => {});
  }

  public bulkSaveAttendance(records: AttendanceRecord[]): void {
    const list = this.getAttendance();
    const map = new Map<string, number>();
    list.forEach((r, i) => map.set(`${r.employeeId}_${r.date}`, i));
    const now = getCairoNowISO();

    records.forEach(rec => {
      const key = `${rec.employeeId}_${rec.date}`;
      const prepared: AttendanceRecord = {
        ...rec,
        id: rec.id || `ATT-${rec.employeeId}-${rec.date}`,
        updatedAt: now,
      };

      if (map.has(key)) {
        list[map.get(key)!] = prepared;
      } else {
        list.push(prepared);
        map.set(key, list.length - 1);
      }
    });

    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('bulkSaveAttendance', records).catch(() => {});
  }

  public bulkMarkAttendance(empIds: string[], date: string, status: AttendanceStatus): { success: boolean; count: number } {
    const employees = this.getEmployees();
    const settings = this.getSettings();
    const newRecords: AttendanceRecord[] = [];

    empIds.forEach(id => {
      const emp = employees.find(e => e.id === id);
      if (emp) {
        const checkIn = status === 'حاضر' ? (emp.workStartTime || settings.officialStartTime || '07:30') : '';
        const rec = buildUnifiedAttendanceRecord({
          employee: emp,
          dateStr: date,
          checkIn,
          settings,
          statusOverride: status === 'حاضر' ? undefined : status,
        });
        newRecords.push(rec);
      }
    });

    this.bulkSaveAttendance(newRecords);
    return { success: true, count: newRecords.length };
  }

  public quickCheckIn(employeeId: string, date: string, checkInTime?: string, statusOverride?: AttendanceStatus): { success: boolean; record: AttendanceRecord } {
    const emp = this.getEmployees().find(e => e.id === employeeId);
    const nowTime = checkInTime || getCairoCurrentTime();
    const settings = this.getSettings();

    const record = buildUnifiedAttendanceRecord({
      employee: emp,
      dateStr: date,
      checkIn: nowTime,
      settings,
      statusOverride,
    });

    this.saveAttendanceRecord(record);
    return { success: true, record };
  }

  public quickCheckOut(employeeId: string, date: string, checkOutTime?: string, allowMissingCheckIn: boolean = false): { success: boolean; record?: AttendanceRecord; message?: string } {
    const list = this.getAttendance();
    const existing = list.find(a => a.employeeId === employeeId && a.date === date);
    const emp = this.getEmployees().find(e => e.id === employeeId);
    const nowTime = checkOutTime || getCairoCurrentTime();
    const settings = this.getSettings();

    if (!existing || !existing.checkIn) {
      if (!allowMissingCheckIn) {
        return {
          success: false,
          message: `الموظف (${emp?.name || employeeId}) ليس لديه تسجيل حضور مسبق لهذا اليوم. لا يمكن تسجيل الانصراف بدون حضور.`
        };
      }
      const checkInFallback = emp?.workStartTime || settings.officialStartTime || '07:30';
      const record = buildUnifiedAttendanceRecord({
        employee: emp,
        dateStr: date,
        checkIn: checkInFallback,
        checkOut: nowTime,
        settings,
        statusOverride: 'حاضر',
      });
      record.notes = (record.notes ? record.notes + ' | ' : '') + 'تسجيل انصراف مع اعتماد حضور تلقائي بطلب المستخدم';
      this.saveAttendanceRecord(record);
      return { success: true, record };
    }

    const updated = buildUnifiedAttendanceRecord({
      employee: emp,
      dateStr: date,
      checkIn: existing.checkIn,
      checkOut: nowTime,
      settings,
      statusOverride: existing.status,
    });
    if (existing.notes) updated.notes = existing.notes;
    if (existing.checkInTimestamp) updated.checkInTimestamp = existing.checkInTimestamp;

    this.saveAttendanceRecord(updated);
    return { success: true, record: updated };
  }

  public bulkCheckOut(empIds: string[], date: string, checkOutTime?: string): { success: boolean; count: number; skippedCount: number } {
    const list = this.getAttendance();
    let successCount = 0;
    let skippedCount = 0;

    empIds.forEach(id => {
      const existing = list.find(a => a.employeeId === id && a.date === date);
      if (existing && existing.checkIn) {
        const res = this.quickCheckOut(id, date, checkOutTime, false);
        if (res.success) successCount++;
      } else {
        skippedCount++;
      }
    });

    return { success: true, count: successCount, skippedCount };
  }

  public quickMarkDayOff(employeeId: string, date: string, statusText: string = 'عطلة أسبوعية'): void {
    const emp = this.getEmployees().find(e => e.id === employeeId);
    const settings = this.getSettings();
    const rec = buildUnifiedAttendanceRecord({
      employee: emp,
      dateStr: date,
      settings,
      statusOverride: statusText as AttendanceStatus,
    });
    this.saveAttendanceRecord(rec);
  }

  public quickMarkAbsent(employeeId: string, date: string, category?: string, reason?: string): void {
    const emp = this.getEmployees().find(e => e.id === employeeId);
    this.saveAttendanceRecord({
      id: `ATT-${employeeId}-${date}`,
      employeeId,
      employeeName: emp?.name || '',
      department: emp?.department || '',
      date,
      dayName: getEgyptianDayName(date),
      checkIn: '',
      checkOut: '',
      workingHours: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeHours: 0,
      status: 'غائب',
      absenceReasonCategory: category,
      reason,
    });
  }

  public quickMarkPermission(employeeId: string, date: string, permData: any): void {
    const emp = this.getEmployees().find(e => e.id === employeeId);
    this.saveAttendanceRecord({
      id: `ATT-${employeeId}-${date}`,
      employeeId,
      employeeName: emp?.name || '',
      department: emp?.department || '',
      date,
      dayName: getEgyptianDayName(date),
      checkIn: '',
      checkOut: '',
      workingHours: emp?.workingHours || 8,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeHours: 0,
      status: 'مأذونية',
      permissionType: typeof permData === 'string' ? permData : permData?.type || 'إذن خروج',
      permissionFrom: permData?.from,
      permissionTo: permData?.to,
      reason: permData?.reason,
    });
  }

  public quickMarkLeave(employeeId: string, startDate: string, endDate: string, leaveType: LeaveType, reason: string): void {
    const emp = this.getEmployees().find(e => e.id === employeeId);
    this.saveAttendanceRecord({
      id: `ATT-${employeeId}-${startDate}`,
      employeeId,
      employeeName: emp?.name || '',
      department: emp?.department || '',
      date: startDate,
      dayName: getEgyptianDayName(startDate),
      checkIn: '',
      checkOut: '',
      workingHours: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeHours: 0,
      status: 'إجازة',
      leaveType,
      leaveStartDate: startDate,
      leaveEndDate: endDate,
      reason,
    });

    this.saveLeave({
      id: `LEV-${Date.now()}`,
      employeeId,
      employeeName: emp?.name || '',
      department: emp?.department || '',
      leaveType,
      startDate,
      endDate,
      daysCount: 1,
      status: 'مقبولة',
      reason,
      createdAt: getCairoNowISO(),
    });
  }

  public deleteAttendanceRecord(id: string): void {
    const list = this.getAttendance().filter(a => a.id !== id);
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('deleteAttendance', { id }).catch(() => {});
  }

  // ---------------- Users ----------------
  public getUsers(): User[] {
    let raw = localStorage.getItem(STORAGE_KEYS.USERS);
    if (!raw) {
      const legacyRaw = localStorage.getItem('ntss_users');
      if (legacyRaw) {
        raw = legacyRaw;
        localStorage.setItem(STORAGE_KEYS.USERS, legacyRaw);
      }
    }
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveUser(user: User): { success: boolean; message?: string } {
    const caller = this.getCurrentUser();
    const isCallerAdmin = !caller || caller.role === 'Admin';
    const list = this.getUsers();
    const idx = list.findIndex(u => u.id === user.id || u.username.toLowerCase() === user.username.toLowerCase());

    // Non-admins cannot create users or escalate roles
    if (caller && !isCallerAdmin) {
      if (idx < 0 || list[idx].id !== caller.id) {
        return { success: false, message: 'غير مصرح بإنشاء أو تعديل حسابات مستخدمين آخرين.' };
      }
      if (user.role && user.role !== caller.role) {
        return { success: false, message: 'غير مصرح بترقية الصلاحيات أو تغيير الدور الوظيفي.' };
      }
      user.role = caller.role;
    }

    if (idx >= 0) {
      const existing = list[idx];

      // Anti-Lockout Guard: Do not allow demoting or deactivating the last active Admin
      if (existing.role === 'Admin' && user.role !== 'Admin') {
        const otherAdmins = list.filter(u => u.role === 'Admin' && u.status === 'Active' && u.id !== existing.id);
        if (otherAdmins.length === 0) {
          return { success: false, message: 'لا يمكن خفض رتبة آخر مدير نشط في النظام لتفادي قفل المنظومة.' };
        }
      }
      if (existing.role === 'Admin' && user.status === 'Inactive') {
        const otherAdmins = list.filter(u => u.role === 'Admin' && u.status === 'Active' && u.id !== existing.id);
        if (otherAdmins.length === 0) {
          return { success: false, message: 'لا يمكن تعطيل آخر مدير نشط في النظام لتفادي قفل المنظومة.' };
        }
      }

      const passwordToSave = (user.password && user.password.trim().length > 0)
        ? user.password.trim()
        : existing.password;

      const passwordInitialized = user.passwordInitialized !== undefined
        ? user.passwordInitialized
        : (Boolean(passwordToSave) || existing.passwordInitialized === true);

      list[idx] = {
        ...existing,
        ...user,
        loginNumber: user.loginNumber || existing.loginNumber || this.getNextLoginNumber(),
        password: passwordToSave,
        passwordInitialized,
      };
      this.logAudit('UPDATE', 'USER', `تعديل بيانات المستخدم: ${user.fullName} (@${user.username})`);
    } else {
      if (caller && !isCallerAdmin) {
        return { success: false, message: 'غير مصرح بإضافة مستخدم جديد.' };
      }
      const hasInitialPassword = Boolean(user.password && user.password.trim().length >= 6);
      const newUser: User = {
        ...user,
        id: user.id || `USR-${Date.now().toString().slice(-4)}`,
        loginNumber: user.loginNumber || this.getNextLoginNumber(),
        password: hasInitialPassword ? user.password?.trim() : undefined,
        passwordInitialized: user.passwordInitialized !== undefined ? user.passwordInitialized : hasInitialPassword,
        mustChangePassword: user.mustChangePassword !== undefined ? user.mustChangePassword : !hasInitialPassword,
        createdAt: user.createdAt || getCairoNowISO(),
      };
      list.push(newUser);
      this.logAudit('CREATE', 'USER', `إضافة مستخدم جديد: ${newUser.fullName} (@${newUser.username})`);
    }
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveUser', user).catch(() => {});
    return { success: true, message: 'تم حفظ المستخدم بنجاح' };
  }

  public deleteUser(id: string): { success: boolean; message?: string } {
    const caller = this.getCurrentUser();
    if (caller && caller.role !== 'Admin') {
      return { success: false, message: 'غير مصرح بحذف المستخدمين. خاص بمدير النظام فقط.' };
    }
    const list = this.getUsers();
    const toDelete = list.find(u => u.id === id);
    if (toDelete?.role === 'Admin') {
      const remainingAdmins = list.filter(u => u.role === 'Admin' && u.status === 'Active' && u.id !== id);
      if (remainingAdmins.length === 0) {
        return { success: false, message: 'لا يمكن حذف آخر مدير نشط في النظام للحفاظ على أمان المنظومة.' };
      }
    }
    const filtered = list.filter(u => u.id !== id);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(filtered));
    this.logAudit('DELETE', 'USER', `حذف مستخدم النظام: ${id}`);
    this.notifyChange();
    this.pushPost('deleteUser', { id }).catch(() => {});
    return { success: true, message: 'تم حذف المستخدم بنجاح' };
  }

  // ---------------- Leaves & Permissions ----------------
  public getLeaves(schoolIdParam?: string): LeaveRecord[] {
    const raw = localStorage.getItem(STORAGE_KEYS.LEAVES);
    if (!raw) return [];
    try {
      const all: LeaveRecord[] = JSON.parse(raw);
      const activeSchoolId = (schoolIdParam || this.getActiveSchoolId()).trim();
      return all.filter(l => !l.schoolId || l.schoolId.trim() === activeSchoolId);
    } catch {
      return [];
    }
  }

  public saveLeave(leave: LeaveRecord, callerUser?: User | null): { success: boolean; message?: string } {
    const caller = callerUser || this.getCurrentUser();
    if (!caller) {
      return { success: false, message: 'يجب تسجيل الدخول لإتمام العملية.' };
    }

    const isLeaveAdmin = caller.role === 'Admin' || caller.role === 'TeacherAffairs' || (caller.role as string) === 'HR';
    const activeSchoolId = (caller.schoolId || this.getActiveSchoolId()).trim();

    // Strict Identity & School Authority Enforcement:
    // Frontend is NOT trusted for employeeId or schoolId.
    let targetEmpId = caller.employeeId || caller.id;
    if (isLeaveAdmin && leave.employeeId) {
      // Admin/HR may manage leaves for employees within the school
      targetEmpId = leave.employeeId;
    }

    // Security Check: If a non-admin attempted to tamper with or send a different employeeId, reject or override:
    if (!isLeaveAdmin && leave.employeeId && leave.employeeId !== targetEmpId) {
      return { success: false, message: 'أمنياً: غير مصرح لك بإنشاء أو تعديل طلب لموظف آخر.' };
    }

    const emp = this.getEmployees().find(e => e.id === targetEmpId || e.employeeNumber === targetEmpId);
    if (!emp && !isLeaveAdmin) {
      // Use caller info as fallback
    }

    let preparedLeave: LeaveRecord = {
      ...leave,
      schoolId: activeSchoolId,
      employeeId: targetEmpId,
      employeeName: (!isLeaveAdmin ? (emp?.name || caller.fullName) : (leave.employeeName || emp?.name || caller.fullName)),
      department: (!isLeaveAdmin ? (emp?.department || 'هيئة التدريس') : (leave.department || emp?.department || 'هيئة التدريس')),
      status: !isLeaveAdmin ? 'معلقة' : (leave.status || 'معلقة'),
      notes: leave.notes || '',
      attachment: leave.attachment || '',
    };

    const raw = localStorage.getItem(STORAGE_KEYS.LEAVES);
    let allLeaves: LeaveRecord[] = [];
    try {
      allLeaves = raw ? JSON.parse(raw) : [];
    } catch {
      allLeaves = [];
    }

    const idx = allLeaves.findIndex(l => l.id === preparedLeave.id);
    if (idx >= 0) {
      const existing = allLeaves[idx];
      // Multi-school isolation check
      if (existing.schoolId && existing.schoolId.trim() !== activeSchoolId) {
        return { success: false, message: 'غير مصرح لك بتعديل سجل يتبع مدرسة أخرى.' };
      }
      if (!isLeaveAdmin && existing.employeeId !== targetEmpId) {
        return { success: false, message: 'غير مصرح لك بتعديل إجازة موظف آخر.' };
      }
      allLeaves[idx] = {
        ...existing,
        ...preparedLeave,
        schoolId: activeSchoolId,
      };
    } else {
      preparedLeave = {
        ...preparedLeave,
        id: preparedLeave.id || `LEV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        schoolId: activeSchoolId,
        createdAt: getCairoNowISO(),
      };
      allLeaves.unshift(preparedLeave);
    }

    localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(allLeaves));
    this.logAudit(
      idx >= 0 ? 'UPDATE' : 'CREATE',
      'LEAVE',
      `طلب إجازة للموظف: ${preparedLeave.employeeName} (${preparedLeave.leaveType})`
    );
    this.notifyChange();
    this.pushPost('saveLeave', preparedLeave).catch(() => {});
    return { success: true, message: 'تم حفظ طلب الإجازة بنجاح' };
  }

  public submitMyLeaveRequest(
    leave: Partial<LeaveRecord>,
    currentUser?: User | null
  ): { success: boolean; message?: string } {
    const caller = currentUser || this.getCurrentUser();
    if (!caller) return { success: false, message: 'يجب تسجيل الدخول لتقديم طلب إجازة.' };
    const ownEmpId = caller.employeeId || caller.id;
    const emp = this.getEmployees().find(e => e.id === ownEmpId || e.employeeNumber === ownEmpId);
    const prepared: LeaveRecord = {
      id: `LEV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      employeeId: ownEmpId,
      employeeName: emp?.name || caller.fullName,
      department: emp?.department || 'هيئة التدريس',
      leaveType: leave.leaveType || 'سنوية',
      startDate: leave.startDate || getCairoCurrentDate(),
      endDate: leave.endDate || getCairoCurrentDate(),
      daysCount: leave.daysCount || 1,
      reason: leave.reason || '',
      status: 'معلقة',
      createdAt: getCairoNowISO(),
    };
    return this.saveLeave(prepared, caller);
  }

  public deleteLeave(id: string): { success: boolean; message?: string } {
    const list = this.getLeaves().filter(l => l.id !== id);
    localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(list));
    this.logAudit('DELETE', 'LEAVE', `حذف سجل إجازة: ${id}`);
    this.notifyChange();
    this.pushPost('deleteLeave', { id }).catch(() => {});
    return { success: true, message: 'تم حذف سجل الإجازة بنجاح' };
  }

  // ---------------- Audit Log ----------------
  public getAuditLogs(): AuditLogEntry[] {
    const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public logAudit(
    action: string,
    entity: AuditLogEntry['entity'] = 'ATTENDANCE',
    details: string,
    oldValue?: string,
    newValue?: string,
    targetId?: string
  ): void {
    const user = this.getCurrentUser();
    const entry: AuditLogEntry = {
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: getCairoNowISO(),
      username: user?.username || 'admin',
      userRole: (user?.role as any) || 'Admin',
      performedBy: user?.fullName || 'مدير النظام',
      action,
      entity,
      targetId,
      details,
      oldValue,
      newValue,
    };

    const logs = this.getAuditLogs();
    logs.unshift(entry);
    if (logs.length > 500) logs.pop();
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs));
  }

  // ---------------- Cloud Sync (Google Sheets & Apps Script) ----------------
  public getSyncStatus(): SyncStatus {
    const raw = localStorage.getItem(STORAGE_KEYS.SYNC_STATUS);
    if (!raw) {
      return {
        lastSyncTime: null,
        status: 'idle',
        connectedToGoogleSheets: false,
      };
    }
    try {
      return JSON.parse(raw);
    } catch {
      return { lastSyncTime: null, status: 'idle', connectedToGoogleSheets: false };
    }
  }

  public getSyncState(): SyncStatus {
    return this.getSyncStatus();
  }

  private setSyncStatus(status: SyncStatus): void {
    localStorage.setItem(STORAGE_KEYS.SYNC_STATUS, JSON.stringify(status));
    this.notifyChange();
  }

  public async syncWithGoogleSheets(isBackground = false): Promise<boolean> {
    const scriptUrl = this.getBackendUrl();

    if (!scriptUrl || scriptUrl.length < 15) {
      this.setSyncStatus({
        lastSyncTime: null,
        status: 'idle',
        connectedToGoogleSheets: false,
        errorMessage: 'لم يتم ربط رابط Google Apps Script بعد',
      });
      return false;
    }

    const currentUser = this.getCurrentUser();
    if (!currentUser || !currentUser.sessionToken || !this.isAuthenticated(currentUser)) {
      this.setSyncStatus({
        ...this.getSyncStatus(),
        status: 'error',
        connectedToGoogleSheets: false,
        errorMessage: 'مطلوب تسجيل الدخول بجلسة عمل معتمدة للمزامنة مع الخادم السحابي',
      });
      return false;
    }

    if (!isBackground) {
      this.setSyncStatus({
        ...this.getSyncStatus(),
        status: 'syncing',
      });
    }

    try {
      const requestId = 'SYNC_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
      const clientTimestamp = getCairoNowISO();

      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'syncData',
          sessionToken: currentUser.sessionToken,
          userId: currentUser.id,
          userRole: currentUser.role,
          requestId,
          clientTimestamp,
        }),
      });

      if (response.status === 401) {
        this.setCurrentUser(null);
        this.setSyncStatus({
          lastSyncTime: null,
          status: 'session_expired',
          connectedToGoogleSheets: false,
          errorMessage: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً',
        });
        this.notifyChange();
        return false;
      }

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const result = await response.json();
      if (result.status === 'success' && result.data) {
        const d = result.data;
        if (Array.isArray(d.employees)) localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(d.employees));
        if (Array.isArray(d.employeeAttendance)) {
          localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(d.employeeAttendance));
        } else if (Array.isArray(d.attendance)) {
          localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(d.attendance));
        }
        if (Array.isArray(d.users)) localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(d.users));
        if (Array.isArray(d.leaves)) localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(d.leaves));
        if (Array.isArray(d.permissions)) localStorage.setItem(STORAGE_KEYS.PERMISSIONS, JSON.stringify(d.permissions));
        if (Array.isArray(d.students)) localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(d.students));
        if (Array.isArray(d.studentAttendance)) localStorage.setItem(STORAGE_KEYS.STUDENT_ATTENDANCE, JSON.stringify(d.studentAttendance));
        if (Array.isArray(d.behaviorTypes)) localStorage.setItem(STORAGE_KEYS.BEHAVIOR_TYPES, JSON.stringify(d.behaviorTypes));
        if (Array.isArray(d.behaviorViolations)) localStorage.setItem(STORAGE_KEYS.BEHAVIOR_VIOLATIONS, JSON.stringify(d.behaviorViolations));
        if (Array.isArray(d.schedule)) localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(d.schedule));
        if (Array.isArray(d.lessonContent)) localStorage.setItem(STORAGE_KEYS.LESSON_CONTENT, JSON.stringify(d.lessonContent));
        if (Array.isArray(d.academicYears)) localStorage.setItem(STORAGE_KEYS.ACADEMIC_YEARS, JSON.stringify(d.academicYears));
        if (Array.isArray(d.studentEnrollments)) localStorage.setItem(STORAGE_KEYS.STUDENT_ENROLLMENTS, JSON.stringify(d.studentEnrollments));
        if (Array.isArray(d.studentTransfers)) localStorage.setItem(STORAGE_KEYS.STUDENT_TRANSFERS, JSON.stringify(d.studentTransfers));
        if (Array.isArray(d.classAttendance)) localStorage.setItem(STORAGE_KEYS.CLASS_ATTENDANCE, JSON.stringify(d.classAttendance));
        if (Array.isArray(d.positiveBehaviorTypes)) localStorage.setItem(STORAGE_KEYS.POSITIVE_BEHAVIOR_TYPES, JSON.stringify(d.positiveBehaviorTypes));
        if (Array.isArray(d.behaviorLedger)) localStorage.setItem(STORAGE_KEYS.BEHAVIOR_LEDGER, JSON.stringify(d.behaviorLedger));
        if (Array.isArray(d.behaviorCases)) localStorage.setItem(STORAGE_KEYS.BEHAVIOR_CASES, JSON.stringify(d.behaviorCases));
        if (Array.isArray(d.substitutions)) {
          localStorage.setItem(STORAGE_KEYS.SCHEDULE_SUBSTITUTIONS, JSON.stringify(d.substitutions));
        } else if (Array.isArray(d.scheduleSubstitutions)) {
          localStorage.setItem(STORAGE_KEYS.SCHEDULE_SUBSTITUTIONS, JSON.stringify(d.scheduleSubstitutions));
        }
        if (Array.isArray(d.supervisionLocations)) {
          localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(d.supervisionLocations));
        } else if (Array.isArray(d.locations)) {
          localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(d.locations));
        }
        if (Array.isArray(d.homeworks)) localStorage.setItem(STORAGE_KEYS.HOMEWORKS, JSON.stringify(d.homeworks));

        const nowIso = getCairoNowISO();
        const recordsCount =
          (d.employees?.length || 0) +
          (d.students?.length || 0) +
          (d.schedule?.length || 0) +
          (d.attendance?.length || d.employeeAttendance?.length || 0) +
          (d.academicYears?.length || 0) +
          (d.leaves?.length || 0) +
          (d.studentAttendance?.length || 0);

        this.setSyncStatus({
          lastSyncTime: nowIso,
          status: 'success',
          connectedToGoogleSheets: true,
          syncedRecordsCount: recordsCount,
        });

        this.notifyChange();
        return true;
      } else {
        if (
          result.status === 'error' &&
          (result.code === 'SESSION_EXPIRED' ||
            result.code === 'INVALID_SESSION' ||
            result.code === 'AUTH_REQUIRED' ||
            result.code === 'SESSION_REVOKED')
        ) {
          this.setCurrentUser(null);
          this.setSyncStatus({
            lastSyncTime: null,
            status: 'session_expired',
            connectedToGoogleSheets: false,
            errorMessage: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً',
          });
          this.notifyChange();
          return false;
        }
        throw new Error(result.message || 'فشل استرجاع البيانات من السكربت السحابي');
      }
    } catch (err: any) {
      console.warn('Sync failed:', err.message);
      this.setSyncStatus({
        ...this.getSyncStatus(),
        status: 'error',
        errorMessage: err.message || 'تعذر الاتصال بـ Google Sheets',
      });
      return false;
    }
  }

  // ---------------- Academic Years & Terms ----------------
  public getAcademicYears(): AcademicYear[] {
    const raw = localStorage.getItem(STORAGE_KEYS.ACADEMIC_YEARS);
    if (!raw) return DEFAULT_ACADEMIC_YEARS;
    try {
      const parsed = JSON.parse(raw);
      return parsed.length > 0 ? parsed : DEFAULT_ACADEMIC_YEARS;
    } catch {
      return DEFAULT_ACADEMIC_YEARS;
    }
  }

  public getActiveAcademicYear(): AcademicYear | null {
    const list = this.getAcademicYears();
    return list.find(y => y.status === 'ACTIVE' || y.isDefault) || list[0] || null;
  }

  public getAcademicYearById(id: string): AcademicYear | null {
    const list = this.getAcademicYears();
    return list.find(y => y.id === id) || null;
  }

  public saveAcademicYear(year: AcademicYear): { success: boolean; message?: string } {
    const list = this.getAcademicYears();
    const idx = list.findIndex(y => y.id === year.id);
    const prepared: AcademicYear = {
      ...year,
      id: year.id || `AY_${Date.now()}`,
    };

    // If marked active or default, demote others
    if (prepared.status === 'ACTIVE' || prepared.isDefault) {
      list.forEach(y => {
        if (y.id !== prepared.id) {
          if (prepared.status === 'ACTIVE' && y.status === 'ACTIVE') {
            y.status = 'CLOSED';
          }
          if (prepared.isDefault) {
            y.isDefault = false;
          }
        }
      });
    }

    if (idx >= 0) {
      list[idx] = prepared;
      this.logAudit('UPDATE', 'SETTINGS', `تعديل العام الدراسي: ${prepared.name}`);
    } else {
      list.unshift(prepared);
      this.logAudit('CREATE', 'SETTINGS', `إضافة عام دراسي جديد: ${prepared.name}`);
    }

    localStorage.setItem(STORAGE_KEYS.ACADEMIC_YEARS, JSON.stringify(list));

    // Update settings if this is the active year
    if (prepared.status === 'ACTIVE') {
      const currentTerm = prepared.terms?.find(t => t.isCurrent)?.name || prepared.terms?.[0]?.name || 'الفصل الدراسي الأول';
      this.saveSettings({
        currentAcademicYear: prepared.name,
        currentTerm,
        academicYearStartDate: prepared.startDate,
        academicYearEndDate: prepared.endDate,
      });
    }

    this.notifyChange();
    this.pushPost('saveAcademicYear', prepared).catch(() => {});
    return { success: true, message: 'تم حفظ العام الدراسي بنجاح' };
  }

  public deleteAcademicYear(id: string): { success: boolean; message?: string } {
    const enrollments = this.getStudentEnrollments(undefined, id);
    if (enrollments.length > 0) {
      return {
        success: false,
        message: `لا يمكن حذف هذا العام الدراسي لوجود (${enrollments.length}) قيد طلابي مرتبط به. يمكنك إغلاقه بدلاً من ذلك.`,
      };
    }

    const list = this.getAcademicYears().filter(y => y.id !== id);
    localStorage.setItem(STORAGE_KEYS.ACADEMIC_YEARS, JSON.stringify(list));
    this.logAudit('DELETE', 'SETTINGS', `حذف العام الدراسي: ${id}`);
    this.notifyChange();
    this.pushPost('deleteAcademicYear', { id }).catch(() => {});
    return { success: true, message: 'تم حذف العام الدراسي بنجاح' };
  }

  public setActiveAcademicYear(id: string): { success: boolean; message?: string } {
    const list = this.getAcademicYears();
    const target = list.find(y => y.id === id);
    if (!target) return { success: false, message: 'العام الدراسي غير موجود' };

    list.forEach(y => {
      y.status = y.id === id ? 'ACTIVE' : 'CLOSED';
      y.isDefault = y.id === id;
      y.isLocked = y.id !== id;
    });

    localStorage.setItem(STORAGE_KEYS.ACADEMIC_YEARS, JSON.stringify(list));
    const currentTerm = target.terms?.find(t => t.isCurrent)?.name || target.terms?.[0]?.name || 'الفصل الدراسي الأول';
    this.saveSettings({
      currentAcademicYear: target.name,
      currentTerm,
      academicYearStartDate: target.startDate,
      academicYearEndDate: target.endDate,
    });

    this.logAudit('UPDATE', 'SETTINGS', `تفعيل العام الدراسي: ${target.name}`);
    this.notifyChange();
    this.pushPost('saveAcademicYear', target).catch(() => {});
    return { success: true, message: `تم تفعيل ${target.name} كعام دراسي نشط للمدرسة` };
  }

  public closeAcademicYear(id: string, reason = 'إغلاق نهاية العام وترحيل البيانات'): { success: boolean; message?: string } {
    const list = this.getAcademicYears();
    const target = list.find(y => y.id === id);
    if (!target) return { success: false, message: 'العام الدراسي غير موجود' };

    target.status = 'CLOSED';
    target.isLocked = true;
    target.closedAt = getCairoNowISO();
    target.closedBy = this.getCurrentUser()?.fullName || 'مدير النظام';

    localStorage.setItem(STORAGE_KEYS.ACADEMIC_YEARS, JSON.stringify(list));
    this.logAudit('UPDATE', 'SETTINGS', `إغلاق العام الدراسي (${target.name}): ${reason}`);
    this.notifyChange();
    this.pushPost('saveAcademicYear', target).catch(() => {});
    return { success: true, message: `تم إغلاق العام الدراسي ${target.name} وأرشفته بنجاح` };
  }

  public reopenAcademicYear(id: string): { success: boolean; message?: string } {
    const list = this.getAcademicYears();
    const target = list.find(y => y.id === id);
    if (!target) return { success: false, message: 'العام الدراسي غير موجود' };

    target.status = 'Active';
    target.isLocked = false;
    target.closedAt = undefined;
    target.closedBy = undefined;

    localStorage.setItem(STORAGE_KEYS.ACADEMIC_YEARS, JSON.stringify(list));
    this.logAudit('UPDATE', 'SETTINGS', `إعادة فتح العام الدراسي (${target.name})`);
    this.notifyChange();
    this.pushPost('saveAcademicYear', target).catch(() => {});
    return { success: true, message: `تمت إعادة فتح العام الدراسي ${target.name} بنجاح` };
  }

  public getTerms(yearId?: string): Term[] {
    if (yearId) {
      const year = this.getAcademicYearById(yearId);
      return year?.terms || [];
    }
    const active = this.getActiveAcademicYear();
    return active?.terms || [];
  }

  // ---------------- Student Enrollments & Transfers ----------------
  public getStudentEnrollments(studentId?: string, academicYearId?: string): StudentEnrollment[] {
    const raw = localStorage.getItem(STORAGE_KEYS.STUDENT_ENROLLMENTS);
    if (!raw) return [];
    try {
      const parsed: StudentEnrollment[] = JSON.parse(raw);
      return parsed.filter(e => {
        if (studentId && e.studentId !== studentId) return false;
        if (academicYearId && e.academicYearId !== academicYearId) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  public saveStudentEnrollment(enrollment: StudentEnrollment): { success: boolean; message?: string } {
    const list = this.getStudentEnrollments();
    const idx = list.findIndex(e => e.id === enrollment.id || (e.studentId === enrollment.studentId && e.academicYearId === enrollment.academicYearId));
    const now = getCairoNowISO();

    const prepared: StudentEnrollment = {
      ...enrollment,
      id: enrollment.id || `ENR-${enrollment.studentId}-${enrollment.academicYearId}`,
      updatedAt: now,
      createdAt: enrollment.createdAt || now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.push(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.STUDENT_ENROLLMENTS, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveStudentEnrollment', prepared).catch(() => {});
    return { success: true, message: 'تم حفظ قيد الطالب بنجاح' };
  }

  public batchSaveStudentEnrollments(enrollments: StudentEnrollment[]): { success: boolean; count: number } {
    const list = this.getStudentEnrollments();
    const map = new Map<string, number>();
    list.forEach((e, idx) => map.set(`${e.studentId}_${e.academicYearId}`, idx));
    const now = getCairoNowISO();

    enrollments.forEach(enr => {
      const key = `${enr.studentId}_${enr.academicYearId}`;
      const prepared: StudentEnrollment = {
        ...enr,
        id: enr.id || `ENR-${enr.studentId}-${enr.academicYearId}`,
        updatedAt: now,
        createdAt: enr.createdAt || now,
      };

      if (map.has(key)) {
        const idx = map.get(key)!;
        list[idx] = prepared;
      } else {
        list.push(prepared);
        map.set(key, list.length - 1);
      }
    });

    localStorage.setItem(STORAGE_KEYS.STUDENT_ENROLLMENTS, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('batchSaveStudentEnrollments', enrollments).catch(() => {});
    return { success: true, count: enrollments.length };
  }

  public getStudentTransferHistory(studentId?: string): StudentTransferHistory[] {
    const raw = localStorage.getItem(STORAGE_KEYS.STUDENT_TRANSFERS);
    if (!raw) return [];
    try {
      const parsed: StudentTransferHistory[] = JSON.parse(raw);
      if (studentId) {
        return parsed.filter(t => t.studentId === studentId);
      }
      return parsed;
    } catch {
      return [];
    }
  }

  public saveStudentTransfer(transfer: StudentTransferHistory): { success: boolean; message?: string } {
    const list = this.getStudentTransferHistory();
    const now = getCairoNowISO();
    const user = this.getCurrentUser();

    const prepared: StudentTransferHistory = {
      ...transfer,
      id: transfer.id || `TRF-${Date.now()}`,
      transferDate: transfer.transferDate || now.split('T')[0],
      approvedBy: transfer.approvedBy || user?.fullName || 'شؤون الطلاب',
      createdAt: now,
    };

    list.unshift(prepared);
    localStorage.setItem(STORAGE_KEYS.STUDENT_TRANSFERS, JSON.stringify(list));

    // Also update current student grade / classroom if applicable
    const student = this.getStudentById(transfer.studentId);
    if (student) {
      const updatedStudent: Student = {
        ...student,
        grade: transfer.toGrade || student.grade,
        classroom: transfer.toClassroom || student.classroom,
        updatedAt: now,
      };
      this.saveStudent(updatedStudent);
    }

    this.logAudit('UPDATE', 'STUDENT', `نقل طالب (${transfer.studentName}): من ${transfer.fromGrade} - ${transfer.fromClassroom} إلى ${transfer.toGrade} - ${transfer.toClassroom}`);
    this.notifyChange();
    this.pushPost('saveStudentTransfer', prepared).catch(() => {});
    return { success: true, message: 'تم تسجيل حركة نقل الطالب بنجاح' };
  }

  // ---------------- Promotion Rules & Execution ----------------
  public getPromotionRules(): PromotionRule[] {
    const raw = localStorage.getItem(STORAGE_KEYS.PROMOTION_RULES);
    if (!raw) return DEFAULT_PROMOTION_RULES;
    try {
      const parsed = JSON.parse(raw);
      return parsed.length > 0 ? parsed : DEFAULT_PROMOTION_RULES;
    } catch {
      return DEFAULT_PROMOTION_RULES;
    }
  }

  public savePromotionRules(rules: PromotionRule[]): void {
    localStorage.setItem(STORAGE_KEYS.PROMOTION_RULES, JSON.stringify(rules));
    this.logAudit('UPDATE', 'SETTINGS', `تحديث قواعد ترحيل الطلاب ونهاية العام (${rules.length} قاعدة)`);
    this.notifyChange();
    this.pushPost('savePromotionRules', rules).catch(() => {});
  }

  public executeStudentPromotion(params: {
    sourceYearId: string;
    targetYearId: string;
    rules: PromotionRule[];
    studentDecisions: Array<{
      studentId: string;
      decision: 'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'TRANSFERRED_OUT';
      targetGrade: string;
      targetClassroom: string;
      notes?: string;
    }>;
  }): { success: boolean; promotedCount: number; retainedCount: number; errors: string[] } {
    const { sourceYearId, targetYearId, studentDecisions } = params;
    const targetYear = this.getAcademicYearById(targetYearId);
    if (!targetYear) {
      return { success: false, promotedCount: 0, retainedCount: 0, errors: ['العام الدراسي المستهدف غير موجود'] };
    }

    const students = this.getStudents();
    const studentsMap = new Map(students.map(s => [s.id, s]));
    const newEnrollments: StudentEnrollment[] = [];
    const updatedStudents: Student[] = [];
    let promotedCount = 0;
    let retainedCount = 0;
    const now = getCairoNowISO();

    studentDecisions.forEach(item => {
      const student = studentsMap.get(item.studentId);
      if (!student) return;

      if (item.decision === 'PROMOTED') {
        promotedCount++;
      } else if (item.decision === 'RETAINED') {
        retainedCount++;
      }

      // Create new enrollment record for the target year
      newEnrollments.push({
        id: `ENR-${student.id}-${targetYearId}`,
        studentId: student.id,
        academicYearId: targetYearId,
        academicYearName: targetYear.name,
        grade: item.targetGrade,
        classroom: item.targetClassroom,
        section: student.section || 'أ',
        enrollmentDate: targetYear.startDate,
        status: item.decision === 'TRANSFERRED_OUT' ? 'TRANSFERRED' : 'ACTIVE',
        promotionStatus: item.decision,
        promotionNotes: item.notes,
        createdAt: now,
        updatedAt: now,
      });

      // Update student current grade/classroom
      updatedStudents.push({
        ...student,
        grade: item.targetGrade,
        classroom: item.targetClassroom,
        studentStatus: item.decision === 'RETAINED' ? 'باقي' : item.decision === 'PROMOTED' ? 'مستجد' : student.studentStatus,
        status: item.decision === 'TRANSFERRED_OUT' ? 'منقول' : item.decision === 'GRADUATED' ? 'متخرج' : 'نشط',
        updatedAt: now,
      });
    });

    // Save batch enrollments
    this.batchSaveStudentEnrollments(newEnrollments);

    // Save updated students
    const fullStudentList = this.getStudents();
    const updatedMap = new Map(updatedStudents.map(s => [s.id, s]));
    const mergedStudents = fullStudentList.map(s => (updatedMap.has(s.id) ? updatedMap.get(s.id)! : s));
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(mergedStudents));

    this.logAudit(
      'UPDATE',
      'STUDENT',
      `تنفيذ ترحيل الطلاب للعام (${targetYear.name}): تم ترحيل ${promotedCount} طالب وإبقاء ${retainedCount} طالب`
    );

    this.notifyChange();
    return { success: true, promotedCount, retainedCount, errors: [] };
  }

  public rollbackStudentPromotion(targetYearId: string): { success: boolean; rollbackedCount: number } {
    const enrollments = this.getStudentEnrollments();
    const targetEnrollments = enrollments.filter(e => e.academicYearId === targetYearId);
    const count = targetEnrollments.length;

    if (count === 0) {
      return { success: false, rollbackedCount: 0 };
    }

    const remainingEnrollments = enrollments.filter(e => e.academicYearId !== targetYearId);
    localStorage.setItem(STORAGE_KEYS.STUDENT_ENROLLMENTS, JSON.stringify(remainingEnrollments));

    this.logAudit('DELETE', 'STUDENT', `تراجع عن ترحيل الطلاب للعام الدراسي (${targetYearId}): تم حذف (${count}) قيد`);
    this.notifyChange();
    return { success: true, rollbackedCount: count };
  }

  public saveClassAttendance(records: ClassAttendanceRecord[]): { success: boolean; message?: string } {
    const res = this.saveClassAttendanceBatch(records);
    return { success: res.success, message: res.message };
  }

  // ---------------- Positive Behavior Types & Ledger ----------------
  public getPositiveBehaviorTypes(): PositiveBehaviorType[] {
    const raw = localStorage.getItem(STORAGE_KEYS.POSITIVE_BEHAVIOR_TYPES);
    if (!raw) return DEFAULT_POSITIVE_BEHAVIOR_TYPES;
    try {
      const parsed = JSON.parse(raw);
      return parsed.length > 0 ? parsed : DEFAULT_POSITIVE_BEHAVIOR_TYPES;
    } catch {
      return DEFAULT_POSITIVE_BEHAVIOR_TYPES;
    }
  }

  public savePositiveBehaviorType(type: PositiveBehaviorType): void {
    const list = this.getPositiveBehaviorTypes();
    const idx = list.findIndex(t => t.id === type.id);
    if (idx >= 0) {
      list[idx] = type;
    } else {
      list.push({ ...type, id: type.id || `POS-${Date.now()}` });
    }
    localStorage.setItem(STORAGE_KEYS.POSITIVE_BEHAVIOR_TYPES, JSON.stringify(list));
    this.logAudit('UPDATE', 'BEHAVIOR', `تعديل دليل السلوك الإيجابي: ${type.name}`);
    this.notifyChange();
    this.pushPost('savePositiveBehaviorType', type).catch(() => {});
  }

  public deletePositiveBehaviorType(id: string): void {
    const list = this.getPositiveBehaviorTypes().filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEYS.POSITIVE_BEHAVIOR_TYPES, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('deletePositiveBehaviorType', { id }).catch(() => {});
  }

  public getBehaviorLedger(studentId?: string): BehaviorScoreLedger[] {
    const raw = localStorage.getItem(STORAGE_KEYS.BEHAVIOR_LEDGER);
    if (!raw) return [];
    try {
      const parsed: BehaviorScoreLedger[] = JSON.parse(raw);
      if (studentId) {
        return parsed.filter(l => l.studentId === studentId);
      }
      return parsed;
    } catch {
      return [];
    }
  }

  public addBehaviorScoreTransaction(transaction: BehaviorScoreLedger): { success: boolean; newScore: number; message?: string } {
    const list = this.getBehaviorLedger();

    // Idempotency & Double-Spend Guard: If this transaction ID is already recorded, reject duplicate
    if (transaction.id && list.some(l => l.id === transaction.id)) {
      const existing = list.find(l => l.id === transaction.id)!;
      return {
        success: true,
        newScore: existing.balanceAfter !== undefined ? existing.balanceAfter : 100,
        message: 'تم تفادي تكرار تسجيل المعاملة السلوكية مسبقاً (Idempotent)',
      };
    }

    const now = getCairoNowISO();
    const user = this.getCurrentUser();

    // Calculate current student score
    const student = this.getStudentById(transaction.studentId);
    const prevScore = student ? this.calculateStudentBehaviorScore(student.id).currentScore : 100;
    const delta = transaction.type === 'POSITIVE' || transaction.type === 'RESTORE' ? Math.abs(transaction.points) : -Math.abs(transaction.points);
    const newScore = Math.max(0, Math.min(100, prevScore + delta));

    const prepared: BehaviorScoreLedger = {
      ...transaction,
      id: transaction.id || `LEDG-${Date.now()}`,
      balanceAfter: newScore,
      recordedBy: transaction.recordedBy || user?.fullName || 'الأخصائي الاجتماعي',
      createdAt: now,
    };

    list.unshift(prepared);
    localStorage.setItem(STORAGE_KEYS.BEHAVIOR_LEDGER, JSON.stringify(list));

    this.logAudit(
      'CREATE',
      'BEHAVIOR',
      `تسجيل معاملة سلوكية (${transaction.type === 'POSITIVE' ? 'تعزيز إيجابي' : 'حسم مخالفة'}): للطالب ${transaction.studentName} (${delta > 0 ? '+' : ''}${delta} نقطة)`
    );

    this.notifyChange();
    this.pushPost('addBehaviorLedger', prepared).catch(() => {});
    return { success: true, newScore, message: 'تم تسجيل المعاملة بنجاح' };
  }

  // ---------------- Behavior Cases & Followups ----------------
  public getBehaviorCases(filters?: { studentId?: string; status?: BehaviorCaseStatus }): BehaviorCase[] {
    const raw = localStorage.getItem(STORAGE_KEYS.BEHAVIOR_CASES);
    if (!raw) return [];
    try {
      const parsed: BehaviorCase[] = JSON.parse(raw);
      return parsed.filter(c => {
        if (filters?.studentId && c.studentId !== filters.studentId) return false;
        if (filters?.status && c.status !== filters.status) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  public saveBehaviorCase(bCase: BehaviorCase): { success: boolean; message?: string } {
    const list = this.getBehaviorCases();
    const idx = list.findIndex(c => c.id === bCase.id);
    const now = getCairoNowISO();
    const user = this.getCurrentUser();

    const prepared: BehaviorCase = {
      ...bCase,
      id: bCase.id || `CASE-${Date.now()}`,
      caseNumber: bCase.caseNumber || `CASE-${Math.floor(1000 + Math.random() * 9000)}`,
      openedBy: bCase.openedBy || user?.fullName || 'الأخصائي الاجتماعي',
      createdAt: bCase.createdAt || now,
      updatedAt: now,
      followups: bCase.followups || [],
    };

    if (idx >= 0) {
      list[idx] = prepared;
      this.logAudit('UPDATE', 'BEHAVIOR', `تحديث ملف الحالة السلوكية: ${prepared.caseNumber} - ${prepared.studentName}`);
    } else {
      list.unshift(prepared);
      this.logAudit('CREATE', 'BEHAVIOR', `فتح ملف حالة سلوكية جديد: ${prepared.caseNumber} - ${prepared.studentName}`);
    }

    localStorage.setItem(STORAGE_KEYS.BEHAVIOR_CASES, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveBehaviorCase', prepared).catch(() => {});
    return { success: true, message: 'تم حفظ الحالة السلوكية بنجاح' };
  }

  public addBehaviorCaseFollowup(caseId: string, followup: Omit<BehaviorFollowup, 'id' | 'createdAt'>): { success: boolean } {
    const list = this.getBehaviorCases();
    const target = list.find(c => c.id === caseId);
    if (!target) return { success: false };

    const now = getCairoNowISO();
    const newFollowup: BehaviorFollowup = {
      ...followup,
      id: `FOL-${Date.now()}`,
      createdAt: now,
    };

    target.followups = target.followups || [];
    target.followups.push(newFollowup);
    target.updatedAt = now;

    localStorage.setItem(STORAGE_KEYS.BEHAVIOR_CASES, JSON.stringify(list));
    this.logAudit('UPDATE', 'BEHAVIOR', `إضافة جلسة متابعة للحالة (${target.caseNumber}): ${followup.summary}`);
    this.notifyChange();
    this.pushPost('saveBehaviorCase', target).catch(() => {});
    return { success: true };
  }

  public closeBehaviorCase(caseId: string, resolutionSummary: string): { success: boolean } {
    const list = this.getBehaviorCases();
    const target = list.find(c => c.id === caseId);
    if (!target) return { success: false };

    const now = getCairoNowISO();
    target.status = 'CLOSED';
    target.resolutionSummary = resolutionSummary;
    target.closedAt = now;
    target.updatedAt = now;

    localStorage.setItem(STORAGE_KEYS.BEHAVIOR_CASES, JSON.stringify(list));
    this.logAudit('UPDATE', 'BEHAVIOR', `إغلاق الحالة السلوكية (${target.caseNumber}) بنجاح: ${resolutionSummary}`);
    this.notifyChange();
    this.pushPost('saveBehaviorCase', target).catch(() => {});
    return { success: true };
  }

  // ---------------- Comprehensive Student 360 Profile ----------------
  public getStudent360Profile(studentId: string) {
    const student = this.getStudentById(studentId);
    if (!student) return null;

    const enrollments = this.getStudentEnrollments(studentId);
    const transfers = this.getStudentTransferHistory(studentId);
    const schoolAttendance = this.getStudentAttendance().filter(a => a.studentId === studentId);
    const classAttendance = this.getClassAttendance({ grade: student.grade }).filter(a => a.studentId === studentId);
    const violations = this.getBehaviorViolations().filter(v => v.studentId === studentId);
    const ledger = this.getBehaviorLedger(studentId);
    const cases = this.getBehaviorCases({ studentId });
    const parentCommunications = this.getParentCommunications(studentId);

    // Attendance stats
    const totalDays = schoolAttendance.length;
    const presentDays = schoolAttendance.filter(a => a.status === 'حاضر' || a.status === 'حاضر متأخر').length;
    const absentDays = schoolAttendance.filter(a => a.status === 'غياب بدون عذر' || a.status === 'غياب بعذر').length;
    const lateDays = schoolAttendance.filter(a => a.status === 'حاضر متأخر').length;
    const attendancePercentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

    // Behavior score
    const behaviorInfo = this.calculateStudentBehaviorScore(studentId);
    const positivePoints = ledger.filter(l => l.type === 'POSITIVE').reduce((s, l) => s + l.points, 0);

    return {
      student,
      enrollments,
      transfers,
      schoolAttendance,
      classAttendance,
      violations,
      ledger,
      cases,
      parentCommunications,
      stats: {
        totalDays,
        presentDays,
        absentDays,
        lateDays,
        attendancePercentage,
        currentBehaviorScore: behaviorInfo.currentScore,
        behaviorStatusText: behaviorInfo.statusText,
        behaviorStatusColor: behaviorInfo.statusColor,
        violationsCount: violations.length,
        positivePoints,
        openCasesCount: cases.filter(c => c.status !== 'CLOSED').length,
        parentCommunicationsCount: parentCommunications.length,
      },
    };
  }

  // ---------------- Locations & Conflict Detection & Schedule Substitutions ----------------
  public getLocations(): LocationItem[] {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCATIONS);
    if (!raw) return DEFAULT_LOCATIONS;
    try {
      const parsed = JSON.parse(raw);
      return parsed.length > 0 ? parsed : DEFAULT_LOCATIONS;
    } catch {
      return DEFAULT_LOCATIONS;
    }
  }

  public saveLocation(loc: LocationItem): void {
    const list = this.getLocations();
    const idx = list.findIndex(l => l.id === loc.id);
    if (idx >= 0) {
      list[idx] = loc;
    } else {
      list.push({ ...loc, id: loc.id || `LOC_${Date.now()}` });
    }
    localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveLocation', loc).catch(() => {});
  }

  public deleteLocation(id: string): void {
    const list = this.getLocations().filter(l => l.id !== id);
    localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('deleteLocation', { id }).catch(() => {});
  }

  public checkScheduleConflicts(
    candidate: ScheduleItem,
    existingSchedule?: ScheduleItem[]
  ): { hasConflict: boolean; conflicts: Array<{ type: string; message: string; severity: 'ERROR' | 'WARNING' }> } {
    const schedule = existingSchedule || this.getSchedule();
    const conflicts: Array<{ type: string; message: string; severity: 'ERROR' | 'WARNING' }> = [];

    // Filter out the item being edited itself
    const others = schedule.filter(s => s.id !== candidate.id);

    // 1. Teacher Double-Booking
    const teacherClash = others.find(
      s => s.teacherId === candidate.teacherId && s.dayOfWeek === candidate.dayOfWeek && s.periodNumber === candidate.periodNumber
    );
    if (teacherClash) {
      conflicts.push({
        type: 'TEACHER_BUSY',
        message: `المعلم (${candidate.teacherName}) لديه حصة أخرى في نفس الوقت لـ (${teacherClash.grade} - ${teacherClash.classroom})`,
        severity: 'ERROR',
      });
    }

    // 2. Classroom Double-Booking
    const classClash = others.find(
      s =>
        s.grade === candidate.grade &&
        s.classroom === candidate.classroom &&
        s.dayOfWeek === candidate.dayOfWeek &&
        s.periodNumber === candidate.periodNumber
    );
    if (classClash) {
      conflicts.push({
        type: 'ROOM_BUSY',
        message: `الفصل (${candidate.grade} - ${candidate.classroom}) لديه مادة (${classClash.subject}) مسندة بالفعل في الحصة رقم ${candidate.periodNumber}`,
        severity: 'ERROR',
      });
    }

    // 3. Location/Lab Double-Booking
    if (candidate.locationId) {
      const locClash = others.find(
        s =>
          s.locationId === candidate.locationId &&
          s.dayOfWeek === candidate.dayOfWeek &&
          s.periodNumber === candidate.periodNumber
      );
      if (locClash) {
        conflicts.push({
          type: 'LOCATION_BUSY',
          message: `المعمل أو القاعة المحددة محجوزة في نفس الحصة لفصل (${locClash.grade} - ${locClash.classroom})`,
          severity: 'ERROR',
        });
      }
    }

    // 4. Consecutive Periods Warning (more than 3 periods in a row)
    const teacherDailyPeriods = others
      .filter(s => s.teacherId === candidate.teacherId && s.dayOfWeek === candidate.dayOfWeek)
      .map(s => s.periodNumber);
    teacherDailyPeriods.push(candidate.periodNumber);
    teacherDailyPeriods.sort((a, b) => a - b);

    let consecutive = 1;
    let maxConsecutive = 1;
    for (let i = 1; i < teacherDailyPeriods.length; i++) {
      if (teacherDailyPeriods[i] === teacherDailyPeriods[i - 1] + 1) {
        consecutive++;
        if (consecutive > maxConsecutive) maxConsecutive = consecutive;
      } else if (teacherDailyPeriods[i] !== teacherDailyPeriods[i - 1]) {
        consecutive = 1;
      }
    }

    if (maxConsecutive > 3) {
      conflicts.push({
        type: 'MAX_CONSECUTIVE_EXCEEDED',
        message: `تنبيه: المعلم سيكون لديه ${maxConsecutive} حصص متتالية في هذا اليوم بدون استراحة`,
        severity: 'WARNING',
      });
    }

    return {
      hasConflict: conflicts.some(c => c.severity === 'ERROR'),
      conflicts,
    };
  }

  public getSubstitutions(filters?: {
    date?: string;
    status?: string;
    originalTeacherId?: string;
    substituteTeacherId?: string;
  }): ScheduleSubstitution[] {
    const raw = localStorage.getItem(STORAGE_KEYS.SCHEDULE_SUBSTITUTIONS);
    if (!raw) return [];
    try {
      const parsed: ScheduleSubstitution[] = JSON.parse(raw);
      if (!filters) return parsed;
      return parsed.filter(s => {
        if (filters.date && s.date !== filters.date) return false;
        if (filters.status && s.status !== filters.status) return false;
        if (filters.originalTeacherId && s.originalTeacherId !== filters.originalTeacherId) return false;
        if (filters.substituteTeacherId && s.substituteTeacherId !== filters.substituteTeacherId) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  public saveSubstitution(sub: ScheduleSubstitution): { success: boolean; message?: string } {
    const list = this.getSubstitutions();
    const idx = list.findIndex(s => s.id === sub.id);
    const now = getCairoNowISO();
    const user = this.getCurrentUser();

    const prepared: ScheduleSubstitution = {
      ...sub,
      id: sub.id || `SUB-${Date.now()}`,
      assignedBy: sub.assignedBy || user?.fullName || 'مشرف الجدول',
      createdAt: sub.createdAt || now,
      updatedAt: now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
      this.logAudit('UPDATE', 'SCHEDULE', `تعديل حصة احتياطي: ${prepared.grade} ${prepared.classroom} - المعلم البديل: ${prepared.substituteTeacherName}`);
    } else {
      list.unshift(prepared);
      this.logAudit('CREATE', 'SCHEDULE', `إسناد حصة احتياطي: ${prepared.grade} ${prepared.classroom} (حصة ${prepared.periodNumber}) إلى المعلم البديل ${prepared.substituteTeacherName}`);
    }

    localStorage.setItem(STORAGE_KEYS.SCHEDULE_SUBSTITUTIONS, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveSubstitution', prepared).catch(() => {});
    return { success: true, message: 'تم إسناد حصة الاحتياطي بنجاح' };
  }

  public deleteSubstitution(id: string): { success: boolean } {
    const list = this.getSubstitutions().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SCHEDULE_SUBSTITUTIONS, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('deleteSubstitution', { id }).catch(() => {});
    return { success: true };
  }

  public getAvailableSubstituteTeachers(
    date: string,
    day: string,
    periodNumber: number,
    originalTeacherId: string
  ): Employee[] {
    const employees = this.getEmployees().filter(
      e => (e.department?.includes('تعليم') || e.department?.includes('معلم') || e.jobTitle?.includes('معلم') || e.isTeacher) && e.status === 'Active'
    );
    const schedule = this.getSchedule();
    const substitutions = this.getSubstitutions({ date });

    // Busy teacher IDs for this period
    const busyInSchedule = new Set(
      schedule
        .filter(s => s.dayOfWeek === day && s.periodNumber === periodNumber)
        .map(s => s.teacherId)
    );

    const busyInSubstitutions = new Set(
      substitutions
        .filter(s => s.periodNumber === periodNumber && s.status !== 'CANCELLED')
        .map(s => s.substituteTeacherId)
    );

    return employees.filter(emp => emp.id !== originalTeacherId && !busyInSchedule.has(emp.id) && !busyInSubstitutions.has(emp.id));
  }

  public getLessonInstances(filters?: { scheduleItemId?: string; date?: string }): LessonInstance[] {
    const raw = localStorage.getItem(STORAGE_KEYS.LESSON_INSTANCES);
    if (!raw) return [];
    try {
      const parsed: LessonInstance[] = JSON.parse(raw);
      if (!filters) return parsed;
      return parsed.filter(i => {
        if (filters.scheduleItemId && i.scheduleItemId !== filters.scheduleItemId) return false;
        if (filters.date && i.date !== filters.date) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  public saveLessonInstance(instance: LessonInstance): { success: boolean } {
    const list = this.getLessonInstances();
    const idx = list.findIndex(i => i.id === instance.id || (i.scheduleItemId === instance.scheduleItemId && i.date === instance.date));
    const now = getCairoNowISO();

    const prepared: LessonInstance = {
      ...instance,
      id: instance.id || `LINST-${Date.now()}`,
      updatedAt: now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.push(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.LESSON_INSTANCES, JSON.stringify(list));
    this.notifyChange();
    this.pushPost('saveLessonInstance', prepared).catch(() => {});
    return { success: true };
  }

  // ---------------- Parent Communication ----------------
  public getParentCommunications(studentId?: string): ParentCommunicationLog[] {
    const raw = localStorage.getItem(STORAGE_KEYS.PARENT_COMMUNICATIONS);
    if (!raw) return [];
    try {
      const parsed: ParentCommunicationLog[] = JSON.parse(raw);
      if (studentId) {
        return parsed.filter(l => l.studentId === studentId);
      }
      return parsed;
    } catch {
      return [];
    }
  }

  public saveParentCommunication(log: ParentCommunicationLog): { success: boolean; message?: string } {
    const list = this.getParentCommunications();
    const now = getCairoNowISO();
    const user = this.getCurrentUser();

    const prepared: ParentCommunicationLog = {
      ...log,
      id: log.id || `COMM-${Date.now()}`,
      date: log.date || now.split('T')[0],
      recordedBy: log.recordedBy || user?.fullName || 'المدرسة',
      createdAt: now,
    };

    list.unshift(prepared);
    localStorage.setItem(STORAGE_KEYS.PARENT_COMMUNICATIONS, JSON.stringify(list));
    this.logAudit('CREATE', 'STUDENT', `تسجيل تواصل مع ولي أمر الطالب: ${prepared.studentName} (${prepared.type} - ${prepared.reason})`);
    this.notifyChange();
    this.pushPost('saveParentCommunication', prepared).catch(() => {});
    return { success: true, message: 'تم تسجيل سجل التواصل مع ولي الأمر بنجاح' };
  }

  // ---------------- Sync Queue & Notifications Accessors ----------------
  public getSyncQueue(): any[] {
    return SyncQueueService.getQueue();
  }

  public saveSyncQueue(queue: any[]): void {
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
    this.notifyChange();
  }

  public getNotifications(): any[] {
    return NotificationService.getNotifications();
  }

  public getSyncQueueSummary() {
    return SyncQueueService.getQueueSummary();
  }

  public async retrySyncQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    SyncQueueService.retryFailed();
    return this.processSyncQueue();
  }

  public async processSyncQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    return SyncQueueService.processQueue(async (action, payload) => {
      const settings = this.getSettings();
      const scriptUrl = settings.googleAppsScriptUrl || DEFAULT_BACKEND_URL;
      if (!scriptUrl || scriptUrl.length < 15) {
        return { success: false, message: 'Google Apps Script URL not configured' };
      }
      const currentUser = this.getCurrentUser();

      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action,
          data: payload,
          userRole: currentUser?.role || '',
          userId: currentUser?.id || '',
          sessionToken: currentUser?.sessionToken || '',
          schoolId: currentUser?.schoolId || this.getActiveSchoolId(),
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.setCurrentUser(null);
        }
        return { success: false, message: `HTTP Error: ${response.status}` };
      }

      const res = await response.json();
      if (
        res.status === 'error' &&
        (res.code === 'SESSION_EXPIRED' ||
          res.code === 'INVALID_SESSION' ||
          res.code === 'UNAUTHORIZED' ||
          res.code === 'SESSION_REVOKED')
      ) {
        this.setCurrentUser(null);
      }
      return {
        success: res.status === 'success',
        message: res.message || (res.status === 'success' ? 'Synced' : 'Failed to sync')
      };
    });
  }

  public async pushPostDirect(action: string, payload: any, timeoutMs = 2000): Promise<{ success: boolean; message?: string; [key: string]: any }> {
    const settings = this.getSettings();
    const scriptUrl = settings.googleAppsScriptUrl || DEFAULT_BACKEND_URL;
    if (!scriptUrl || scriptUrl.length < 15) {
      return { success: false, message: 'Google Apps Script URL غير مهيأ' };
    }
    const currentUser = this.getCurrentUser();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action,
          data: payload,
          userRole: currentUser?.role || '',
          userId: currentUser?.id || '',
          sessionToken: currentUser?.sessionToken || '',
          schoolId: currentUser?.schoolId || this.getActiveSchoolId(),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          this.setCurrentUser(null);
        }
        return { success: false, message: `HTTP Error: ${response.status}` };
      }

      const res = await response.json();
      if (
        res.status === 'error' &&
        (res.code === 'SESSION_EXPIRED' ||
          res.code === 'INVALID_SESSION' ||
          res.code === 'UNAUTHORIZED' ||
          res.code === 'SESSION_REVOKED')
      ) {
        this.setCurrentUser(null);
      }
      return {
        ...res,
        success: res.status === 'success',
        message: res.message || (res.status === 'success' ? 'تمت العملية بنجاح' : 'فشلت العملية')
      };
    } catch (err: any) {
      return { success: false, message: `خطأ اتصال: ${err?.message || 'فشل الاتصال بالخادم'}` };
    }
  }

  public async saveUserSecure(user: User, rawPassword?: string): Promise<{ success: boolean; message?: string; user?: User }> {
    const caller = this.getCurrentUser();
    const isCallerAdmin = !caller || caller.role === 'Admin';
    if (!isCallerAdmin) {
      return { success: false, message: 'غير مصرح بإنشاء أو تعديل حسابات المستخدمين. خاص بمدير النظام.' };
    }

    const canonicalRole = normalizeStaffRole(user.role);
    const sanitizedUser: User = {
      ...user,
      role: canonicalRole,
      username: user.username.trim().toLowerCase(),
      fullName: user.fullName.trim(),
    };
    delete sanitizedUser.password;

    const list = this.getUsers();
    const idx = list.findIndex(u => u.id === sanitizedUser.id || u.username.toLowerCase() === sanitizedUser.username.toLowerCase());
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...sanitizedUser };
      this.logAudit('UPDATE', 'USER', `تعديل مستخدم: ${sanitizedUser.fullName} (@${sanitizedUser.username})`);
    } else {
      list.push(sanitizedUser);
      this.logAudit('CREATE', 'USER', `إضافة مستخدم جديد: ${sanitizedUser.fullName} (@${sanitizedUser.username})`);
    }

    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(list));
    this.notifyChange();

    // Call backend authoritative saveUser
    return this.pushPostDirect('saveUser', {
      ...sanitizedUser,
      password: rawPassword && rawPassword.trim() ? rawPassword.trim() : undefined
    });
  }

  public async resetUserPassword(userId: string, newPassword: string): Promise<{ success: boolean; message?: string }> {
    const caller = this.getCurrentUser();
    if (caller && caller.role !== 'Admin') {
      return { success: false, message: 'غير مصرح بإعادة تعيين كلمة المرور. خاص بمدير النظام فقط.' };
    }

    return this.pushPostDirect('resetUserPassword', { userId, newPassword });
  }

  public async issueUserActivationToken(_userId: string): Promise<{
    success: boolean;
    loginNumber?: number | string;
    activationToken?: string;
    expiresAt?: string;
    message?: string;
    code?: string;
  }> {
    return {
      success: false,
      code: 'FIRST_LOGIN_DECOMMISSIONED',
      message: 'تم إيقاف مسار تفعيل الحسابات ورموز التفعيل بشكل نهائي (MIG_SCOPE_015).',
    };
  }

  public async firstLoginPasswordSetup(
    _loginNumberOrUsername?: string,
    _activationToken?: string,
    _newPassword?: string,
    _confirmPassword?: string
  ): Promise<{ success: boolean; sessionToken?: string; user?: User; message?: string; code?: string }> {
    return {
      success: false,
      code: 'FIRST_LOGIN_DECOMMISSIONED',
      message: 'تم إيقاف مسار إعداد كلمة المرور لأول مرة بشكل نهائي (MIG_SCOPE_015). يرجى استخدام بيانات الدخول المعتمدة من إدارة النظام.',
    };
  }

  public getUserById(userId: string): User | undefined {
    return this.getUsers().find(u => u.id === userId);
  }

  public revokeUserSession(userId: string): { success: boolean; message?: string } {
    const current = this.getCurrentUser();
    if (current && current.id === userId) {
      this.setCurrentUser(null);
    }
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx >= 0) {
      delete users[idx].sessionToken;
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      this.notifyChange();
    }
    return { success: true, message: 'تم إبطال جميع جلسات المستخدم بنجاح' };
  }

  public async revokeUserSessions(userId: string): Promise<{ success: boolean; message?: string }> {
    const caller = this.getCurrentUser();
    if (caller && caller.role !== 'Admin') {
      return { success: false, message: 'غير مصرح بتسجيل الخروج الإجباري. خاص بمدير النظام فقط.' };
    }

    this.revokeUserSession(userId);
    const backendRes = await this.pushPostDirect('revokeUserSessions', { userId });
    if (backendRes.success) return backendRes;
    return { success: true, message: 'تم إبطال جميع جلسات المستخدم بنجاح' };
  }

  public revokeAllUserSessions(userId: string): { success: boolean; message?: string } {
    return this.revokeUserSession(userId);
  }

  public async toggleUserStatus(userId: string, newStatus?: string): Promise<{ success: boolean; status?: string; message?: string }> {
    const caller = this.getCurrentUser();
    if (caller && caller.role !== 'Admin') {
      return { success: false, message: 'غير مصرح بتعديل حالة المستخدمين. خاص بمدير النظام فقط.' };
    }

    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    let updatedStatus = newStatus;
    if (idx >= 0) {
      const target = users[idx];
      const nextStatus = newStatus || (target.status === 'Active' ? 'Suspended' : 'Active');
      target.status = nextStatus as any;
      target.isActive = nextStatus === 'Active';
      updatedStatus = nextStatus;
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      this.notifyChange();
      this.logAudit('UPDATE', 'USER', `تغيير حالة المستخدم ${target.fullName} إلى ${nextStatus}`, '', '', userId);
    }

    const backendRes = await this.pushPostDirect('toggleUserStatus', { userId, newStatus });
    if (backendRes.success) return backendRes;
    return {
      success: idx >= 0,
      status: updatedStatus,
      message: idx >= 0 ? 'تم تحديث حالة المستخدم بنجاح' : 'المستخدم غير موجود',
    };
  }

  public async setUserActiveStatus(userId: string, isActive: boolean): Promise<{ success: boolean; status?: string; message?: string }> {
    return this.toggleUserStatus(userId, isActive ? 'Active' : 'Inactive');
  }

  public async resetUserToPendingSetup(userId: string): Promise<{ success: boolean; message?: string }> {
    const caller = this.getCurrentUser();
    if (caller && caller.role !== 'Admin') {
      return { success: false, message: 'غير مصرح بإعادة تعيين الحساب. خاص بمدير النظام فقط.' };
    }

    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx >= 0) {
      users[idx].passwordInitialized = false;
      delete users[idx].password;
      delete users[idx].passwordHash;
      delete users[idx].passwordSalt;
      delete users[idx].activationTokenHash;
      delete users[idx].activationExpiresAt;
      delete users[idx].activationTokenExpiresAt;
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      this.notifyChange();
      this.logAudit('UPDATE', 'USER', `إلغاء كلمة المرور وإعادة المستخدم ${users[idx].fullName} إلى حالة Pending Setup`, '', '', userId);
    }

    const backendRes = await this.pushPostDirect('resetUserToPendingSetup', { userId });
    if (backendRes.success) return backendRes;
    return {
      success: idx >= 0,
      message: idx >= 0 ? 'تمت إعادة تعيين الحساب إلى وضع الإعداد الأول بنجاح' : 'المستخدم غير موجود',
    };
  }

  public async getPublicClassSchedule(
    gradeName: string,
    classroomName: string,
    schoolId?: string
  ): Promise<{ success: boolean; data?: PublicClassScheduleDTO; message?: string }> {
    const cleanGrade = (gradeName || '').trim();
    const cleanClass = (classroomName || '').trim();
    const cleanSchoolId = (schoolId || this.getActiveSchoolId()).trim();

    if (!cleanGrade || !cleanClass) {
      return { success: false, message: 'يرجى تحديد الصف والفصل الدراسي' };
    }

    const settings = this.getSettings();
    const scriptUrl = settings.googleAppsScriptUrl || DEFAULT_BACKEND_URL;

    // 1. Authoritative Backend Request (NO token required, public endpoint)
    if (scriptUrl && scriptUrl.length > 15 && navigator.onLine) {
      try {
        const response = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'getPublicClassSchedule',
            gradeName: cleanGrade,
            classroomName: cleanClass,
            schoolId: cleanSchoolId,
          }),
        });

        if (response.ok) {
          const res = await response.json();
          if (res.status === 'success' && res.schedule) {
            return {
              success: true,
              data: {
                gradeName: res.gradeName || cleanGrade,
                classroomName: res.classroomName || cleanClass,
                schedule: res.schedule || [],
              },
            };
          }
        }
      } catch (err: any) {
        console.warn('Backend getPublicClassSchedule failed, reading published local schedule...', err);
      }
    }

    // 2. Local Fallback (Strictly Published schedule only, projected to safe DTO)
    const allSchedule = this.getSchedule();
    const matching = allSchedule.filter(s => {
      const status = String(s.status || '').toLowerCase();
      if (status !== 'published') return false;
      if (s.isActive === false) return false;
      if (s.isCancelled === true) return false;

      const sGrade = String(s.grade || (s as any).gradeName || s.gradeId || '').trim().toLowerCase();
      const sClass = String(s.classroom || (s as any).classroomName || s.classroomId || '').trim().toLowerCase();
      const targetGrade = cleanGrade.toLowerCase();
      const targetClass = cleanClass.toLowerCase();

      const gradeMatch = sGrade === targetGrade || sGrade.includes(targetGrade) || targetGrade.includes(sGrade);
      const classMatch = sClass === targetClass || sClass.includes(targetClass) || targetClass.includes(sClass);
      return gradeMatch && classMatch;
    });

    const dayWeights: Record<string, number> = {
      'الأحد': 1,
      'الإثنين': 2,
      'الاثنين': 2,
      'الثلاثاء': 3,
      'الأربعاء': 4,
      'الاربعاء': 4,
      'الخميس': 5,
    };

    matching.sort((a, b) => {
      const dA = dayWeights[a.dayOfWeek || a.dayName || ''] || 9;
      const dB = dayWeights[b.dayOfWeek || b.dayName || ''] || 9;
      if (dA !== dB) return dA - dB;
      return (Number(a.periodNumber) || 0) - (Number(b.periodNumber) || 0);
    });

    const safeLessons: PublicClassScheduleLesson[] = matching.map(s => ({
      dayOfWeek: s.dayOfWeek || s.dayName || '',
      periodNumber: Number(s.periodNumber) || 0,
      startTime: s.startTime || '',
      endTime: s.endTime || '',
      subjectName: s.subject || (s as any).subjectName || '',
      teacherDisplayName: s.teacherName || 'معلم المادة',
      roomName: s.room || s.roomId || '',
    }));

    return {
      success: true,
      data: {
        gradeName: cleanGrade,
        classroomName: cleanClass,
        schedule: safeLessons,
        lessons: safeLessons,
      },
    };
  }

  // ============================================================================
  // TEACHER ACCOUNTS & PORTAL AUTHENTICATION
  // ============================================================================

  /**
   * Retrieves teacher accounts safe list (without passwords, passwordHash, or passwordSalt).
   */
  public getTeacherAccounts(): TeacherAccount[] {
    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_ACCOUNTS);
    if (!raw) return [];
    try {
      const list: TeacherAccount[] = JSON.parse(raw);
      // Ensure no password hashes or salts exist in memory or leak
      return list.map(t => ({
        id: t.id,
        employeeId: t.employeeId,
        teacherCode: t.teacherCode,
        teacherName: t.teacherName,
        department: t.department,
        username: t.username || '',
        status: t.status || 'Active',
        accountStatus: t.accountStatus || t.status || 'Active',
        isActive: t.status === 'Active' && t.isActive !== false,
        mustChangePassword: !!t.mustChangePassword,
        legacyPinRetired: !!t.legacyPinRetired,
        failedLoginAttempts: Number(t.failedLoginAttempts) || 0,
        lockedUntil: t.lockedUntil || null,
        lastLoginAt: t.lastLoginAt || '',
        createdAt: t.createdAt || '',
        updatedAt: t.updatedAt || '',
        migrationVersion: t.migrationVersion,
        migratedAt: t.migratedAt,
      }));
    } catch {
      return [];
    }
  }

  private saveTeacherAccountsLocal(accounts: TeacherAccount[]): void {
    // Sanitize completely to ensure no passwords or hashes ever get saved
    const sanitized = accounts.map(t => ({
      id: t.id,
      employeeId: t.employeeId,
      teacherCode: t.teacherCode,
      teacherName: t.teacherName,
      department: t.department,
      username: (t.username || '').trim(),
      status: t.status,
      accountStatus: t.accountStatus || t.status,
      isActive: t.status === 'Active' && t.isActive !== false,
      mustChangePassword: t.mustChangePassword,
      legacyPinRetired: t.legacyPinRetired,
      failedLoginAttempts: t.failedLoginAttempts || 0,
      lockedUntil: t.lockedUntil || null,
      lastLoginAt: t.lastLoginAt || '',
      createdAt: t.createdAt,
      updatedAt: t.updatedAt || new Date().toISOString(),
      migrationVersion: t.migrationVersion,
      migratedAt: t.migratedAt,
    }));
    localStorage.setItem(STORAGE_KEYS.TEACHER_ACCOUNTS, JSON.stringify(sanitized));
    this.notifyChange();
  }

  /**
   * Admin Capability: Create Username & Temporary Password for Teacher
   * Rules:
   * - Username unique case-insensitive.
   * - Password NOT stored plaintext in frontend.
   * - Backend only hashes + salts.
   * - No passwordHash/salt returned to frontend.
   */
  public async createTeacherAccount(
    employeeId: string,
    rawUsername: string,
    temporaryPassword: string
  ): Promise<{ success: boolean; message?: string; account?: TeacherAccount }> {
    const caller = this.getCurrentUser();
    if (caller && caller.role !== 'Admin' && caller.role !== 'TeacherAffairs') {
      return { success: false, message: 'غير مصرح بإنشاء حسابات المعلمين. خاص بالإدارة المدرسية وشؤون المعلمين.' };
    }

    const cleanEmpId = (employeeId || '').trim();
    const cleanUsername = (rawUsername || '').trim();
    const cleanPassword = (temporaryPassword || '').trim();

    if (!cleanEmpId || !cleanUsername || !cleanPassword) {
      return { success: false, message: 'الموظف، اسم المستخدم، وكلمة المرور المؤقتة حقول مطلوبة.' };
    }

    if (cleanPassword.length < 8) {
      return { success: false, message: 'كلمة المرور المؤقتة يجب ألا تقل عن 8 خانات.' };
    }

    const normUsername = cleanUsername.toLowerCase();

    // 1. Case-insensitive uniqueness check against existing Teacher Accounts
    const existingAccounts = this.getTeacherAccounts();
    if (existingAccounts.some(t => t.username && t.username.trim().toLowerCase() === normUsername && t.employeeId !== cleanEmpId)) {
      return { success: false, message: `اسم المستخدم "${cleanUsername}" مسجل بالفعل لمعلم آخر.` };
    }

    // Check if employee already has an account
    const existingIdx = existingAccounts.findIndex(t => t.employeeId === cleanEmpId);
    if (existingIdx >= 0) {
      const existing = existingAccounts[existingIdx];
      if (existing.status === 'Needs Setup' || !existing.username) {
        // Upgrade legacy account that needs setup with username & temporary password
        existing.username = cleanUsername;
        existing.usernameNormalized = normUsername;
        existing.status = 'Active';
        existing.accountStatus = 'Active';
        existing.isActive = true;
        existing.mustChangePassword = true;
        existing.legacyPinRetired = true;
        existing.failedLoginAttempts = 0;
        existing.lockedUntil = null;
        existing.updatedAt = new Date().toISOString();
        delete (existing as any).pinHash;
        delete (existing as any).pinSalt;
        delete (existing as any).pin;
        delete (existing as any).legacyPin;
        delete (existing as any).salt;

        this.saveTeacherAccountsLocal(existingAccounts);

        const backendRes = await this.pushPostDirect('createTeacherAccount', {
          employeeId: cleanEmpId,
          username: cleanUsername,
          temporaryPassword: cleanPassword,
        });

        this.logAudit('CREATE', 'TEACHER_ACCOUNT', `تهيئة حساب بوابة المعلم: ${existing.teacherName} (@${cleanUsername})`, '', '', cleanEmpId);

        return {
          success: true,
          message: backendRes.message || 'تمت تهيئة حساب المعلم وتعيين اسم المستخدم وكلمة المرور المؤقتة بنجاح',
          account: existing,
        };
      }
      return { success: false, message: 'هذا المعلم لديه حساب مسجل بالفعل في البوابة.' };
    }

    // 2. Case-insensitive uniqueness check against Administrative Users
    const existingUsers = this.getUsers();
    if (existingUsers.some(u => u.username.trim().toLowerCase() === normUsername)) {
      return { success: false, message: `اسم المستخدم "${cleanUsername}" مسجل بالفعل لمستخدم إداري بالنظام.` };
    }

    // Verify employee
    const employees = this.getEmployees();
    const emp = employees.find(e => e.id === cleanEmpId);
    if (!emp) {
      return { success: false, message: 'الموظف / المعلم غير موجود في السجلات.' };
    }

    const newAccount: TeacherAccount = {
      id: `TAC_${cleanEmpId}`,
      employeeId: cleanEmpId,
      teacherCode: emp.teacherCode || emp.id || `T-${cleanEmpId}`,
      teacherName: emp.name,
      department: emp.department || 'هيئة التدريس',
      username: cleanUsername,
      status: 'Active',
      isActive: true,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save locally (safe metadata ONLY, strictly NO password, NO hash, NO salt)
    existingAccounts.push(newAccount);
    this.saveTeacherAccountsLocal(existingAccounts);

    // Call Backend Authoritative API to hash and salt with PBKDF2
    const backendRes = await this.pushPostDirect('createTeacherAccount', {
      employeeId: cleanEmpId,
      username: cleanUsername,
      temporaryPassword: cleanPassword,
    });

    this.logAudit('CREATE', 'TEACHER_ACCOUNT', `إنشاء حساب بوابة المعلم: ${emp.name} (@${cleanUsername})`, '', '', cleanEmpId);

    return {
      success: true,
      message: backendRes.message || 'تم إنشاء حساب بوابة المعلم وتشفير كلمة المرور المؤقتة بنجاح',
      account: newAccount,
    };
  }

  /**
   * Admin Capability: Reset Teacher Password
   * Rules:
   * - Backend only hashes + salts.
   * - Revokes all active sessions for this teacher.
   * - Resets failed login attempts and locks.
   */
  public async resetTeacherPassword(
    employeeId: string,
    temporaryPassword: string
  ): Promise<{ success: boolean; message?: string }> {
    const caller = this.getCurrentUser();
    if (caller && caller.role !== 'Admin' && caller.role !== 'TeacherAffairs') {
      return { success: false, message: 'غير مصرح بإعادة تعيين كلمة مرور المعلم.' };
    }

    const cleanEmpId = (employeeId || '').trim();
    const cleanPassword = (temporaryPassword || '').trim();

    if (!cleanEmpId || !cleanPassword) {
      return { success: false, message: 'المعلم وكلمة المرور المؤقتة مطلوبتان.' };
    }

    if (cleanPassword.length < 8) {
      return { success: false, message: 'كلمة المرور المؤقتة يجب ألا تقل عن 8 خانات.' };
    }

    const accounts = this.getTeacherAccounts();
    const idx = accounts.findIndex(t => t.employeeId === cleanEmpId);
    if (idx === -1) {
      return { success: false, message: 'حساب المعلم غير موجود.' };
    }

    // Revoke all active sessions immediately
    this.revokeTeacherSessions(cleanEmpId);

    // Update account status: reset attempts, unlock, require password change, clear legacy PIN data
    accounts[idx].status = 'Active';
    accounts[idx].accountStatus = 'Active';
    accounts[idx].isActive = true;
    accounts[idx].legacyPinRetired = true;
    accounts[idx].failedLoginAttempts = 0;
    accounts[idx].lockedUntil = null;
    accounts[idx].mustChangePassword = true;
    accounts[idx].updatedAt = new Date().toISOString();
    delete (accounts[idx] as any).pinHash;
    delete (accounts[idx] as any).pinSalt;
    delete (accounts[idx] as any).pin;
    delete (accounts[idx] as any).legacyPin;
    delete (accounts[idx] as any).salt;

    this.saveTeacherAccountsLocal(accounts);

    // Authoritative Backend Call (handles hash + salt and revokes sessions on backend)
    const backendRes = await this.pushPostDirect('resetTeacherPassword', {
      employeeId: cleanEmpId,
      temporaryPassword: cleanPassword,
    });

    this.logAudit('UPDATE', 'TEACHER_ACCOUNT', `إعادة تعيين كلمة مرور بوابة المعلم وإلغاء الجلسات: ${accounts[idx].teacherName}`, '', '', cleanEmpId);

    return {
      success: true,
      message: backendRes.message || 'تمت إعادة تعيين كلمة المرور بنجاح وإلغاء كافة الجلسات النشطة للمعلم.',
    };
  }

  /**
   * Admin Capability: Enable / Disable Teacher Account
   * Rules:
   * - Disabling revokes active sessions.
   */
  public async setTeacherAccountStatus(
    employeeId: string,
    status: 'Active' | 'Disabled' | 'Suspended'
  ): Promise<{ success: boolean; message?: string }> {
    const caller = this.getCurrentUser();
    if (caller && caller.role !== 'Admin' && caller.role !== 'TeacherAffairs') {
      return { success: false, message: 'غير مصرح بتعديل حالة حساب المعلم.' };
    }

    const cleanEmpId = (employeeId || '').trim();
    const accounts = this.getTeacherAccounts();
    const idx = accounts.findIndex(t => t.employeeId === cleanEmpId);
    if (idx === -1) {
      return { success: false, message: 'حساب المعلم غير موجود.' };
    }

    accounts[idx].status = status;
    accounts[idx].isActive = status === 'Active';
    accounts[idx].updatedAt = new Date().toISOString();

    if (status !== 'Active') {
      // Disabling account revokes any active sessions
      this.revokeTeacherSessions(cleanEmpId);
    }

    this.saveTeacherAccountsLocal(accounts);

    // Backend authoritative sync
    const backendRes = await this.pushPostDirect('setTeacherAccountStatus', {
      employeeId: cleanEmpId,
      status,
    });

    this.logAudit('UPDATE', 'TEACHER_ACCOUNT', `تغيير حالة حساب المعلم ${accounts[idx].teacherName} إلى ${status}`, '', '', cleanEmpId);

    return {
      success: true,
      message: backendRes.message || `تم ${status === 'Active' ? 'تنشيط' : 'تعطيل'} حساب المعلم بنجاح.`,
    };
  }

  /**
   * Teacher Login: Username + Password (No PIN).
   * Rules:
   * - 5 failed attempts => lock 15 minutes.
   * - Relies on teacherSessionToken ONLY.
   */
  public async teacherLogin(
    rawUsername: string,
    rawPassword: string,
    schoolId?: string
  ): Promise<{
    success: boolean;
    message?: string;
    code?: string;
    teacherSessionToken?: string;
    employee?: Employee;
    mustChangePassword?: boolean;
  }> {
    const cleanUsername = String(rawUsername || '').trim();
    const cleanPassword = String(rawPassword || '').trim();
    const cleanSchoolId = String(schoolId || this.getActiveSchoolId() || '').trim().toUpperCase();

    if (!cleanUsername || !cleanPassword) {
      return { success: false, code: 'INVALID_CREDENTIALS', message: 'يرجى إدخال اسم المستخدم وكلمة المرور' };
    }

    if (!cleanSchoolId) {
      return { success: false, code: 'SCHOOL_ID_REQUIRED', message: 'يرجى تحديد المدرسة لتسجيل الدخول.' };
    }

    const scriptUrl = this.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return {
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'تسجيل دخول المعلم يتطلب الاتصال بالخادم المعتمد.',
      };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'teacherLogin',
          username: cleanUsername,
          password: cleanPassword,
          schoolId: cleanSchoolId,
        }),
      });

      let res: any = null;
      try {
        res = await response.json();
      } catch {
        res = null;
      }

      if (!response.ok || res?.status === 'error' || !res?.teacherSessionToken) {
        return {
          success: false,
          code: res?.code || (response.status === 401 ? 'INVALID_CREDENTIALS' : 'TEACHER_AUTH_FAILED'),
          message: res?.message || 'تعذر تسجيل الدخول باستخدام بيانات الاعتماد المقدمة.',
        };
      }

      const teacher = res.teacher || {};
      const employee: Employee = {
        id: String(teacher.employeeId || teacher.teacherId || '').trim(),
        name: String(teacher.teacherName || cleanUsername).trim(),
        teacherCode: String(teacher.teacherCode || teacher.employeeId || '').trim(),
        department: teacher.department ? String(teacher.department).trim() : 'الهيئة التعليمية',
        jobTitle: 'معلم',
        status: 'Active',
        isTeachingStaff: true,
        teachingSubjects: Array.isArray(teacher.teachingSubjects) ? teacher.teachingSubjects : [],
      };

      const mustChangePassword = res.mustChangePassword === true;
      const session: TeacherSession = {
        teacherSessionToken: String(res.teacherSessionToken),
        schoolId: String(res.schoolId || cleanSchoolId).trim().toUpperCase(),
        employeeId: employee.id,
        teacherCode: employee.teacherCode || employee.id,
        teacherName: employee.name,
        username: cleanUsername,
        department: employee.department,
        mustChangePassword,
        expiresAt: String(res.expiresAt || new Date(Date.now() + 12 * 3600 * 1000).toISOString()),
        createdAt: new Date().toISOString(),
      };

      this.setTeacherSession(session);

      return {
        success: true,
        teacherSessionToken: session.teacherSessionToken,
        employee,
        mustChangePassword,
      };
    } catch {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم المعتمد لتسجيل دخول المعلم.',
      };
    }
  }

  public async validateTeacherPortalSession(): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    employee?: Employee;
    data?: any;
    mustChangePassword?: boolean;
  }> {
    const session = this.getTeacherSession();
    if (!session?.teacherSessionToken) {
      return { success: false, code: 'TEACHER_SESSION_REQUIRED', message: 'لا توجد جلسة معلم نشطة.' };
    }

    const scriptUrl = this.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'يلزم الاتصال بالخادم للتحقق من جلسة المعلم.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getTeacherPortalData',
          teacherSessionToken: session.teacherSessionToken,
        }),
      });

      let res: any = null;
      try {
        res = await response.json();
      } catch {
        res = null;
      }

      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || [
          'TEACHER_SESSION_REQUIRED',
          'TEACHER_SESSION_INVALID',
          'SESSION_EXPIRED',
          'SESSION_REVOKED',
          'INVALID_SESSION',
        ].includes(String(res?.code || ''))) {
          this.setTeacherSession(null);
        }
        return {
          success: false,
          code: res?.code || 'TEACHER_SESSION_INVALID',
          message: res?.message || 'تعذر التحقق من جلسة المعلم.',
        };
      }

      const teacher = res?.data?.teacher || {};
      const employee: Employee = {
        id: String(teacher.id || session.employeeId).trim(),
        name: String(teacher.name || session.teacherName).trim(),
        teacherCode: String(teacher.teacherCode || session.teacherCode).trim(),
        department: session.department || 'الهيئة التعليمية',
        jobTitle: 'معلم',
        status: 'Active',
        isTeachingStaff: true,
      };

      const refreshedSession: TeacherSession = {
        ...session,
        employeeId: employee.id,
        teacherCode: employee.teacherCode || employee.id,
        teacherName: employee.name,
        department: employee.department,
      };
      this.setTeacherSession(refreshedSession);

      return {
        success: true,
        employee,
        data: res.data,
        mustChangePassword: refreshedSession.mustChangePassword === true,
      };
    } catch {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم للتحقق من جلسة المعلم.',
      };
    }
  }

  public async changeTeacherPassword(newPassword: string): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    teacherSessionToken?: string;
  }> {
    const session = this.getTeacherSession();
    const cleanPassword = String(newPassword || '').trim();

    if (!session?.teacherSessionToken) {
      return { success: false, code: 'TEACHER_SESSION_REQUIRED', message: 'لا توجد جلسة معلم نشطة.' };
    }
    if (cleanPassword.length < 8) {
      return { success: false, code: 'INVALID_PASSWORD', message: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.' };
    }

    const scriptUrl = this.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'تغيير كلمة المرور يتطلب الاتصال بالخادم.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'changeTeacherPassword',
          teacherSessionToken: session.teacherSessionToken,
          newPassword: cleanPassword,
        }),
      });

      let res: any = null;
      try {
        res = await response.json();
      } catch {
        res = null;
      }

      if (!response.ok || res?.status === 'error' || !res?.teacherSessionToken) {
        if (response.status === 401 || ['INVALID_SESSION', 'SESSION_EXPIRED', 'SESSION_REVOKED'].includes(String(res?.code || ''))) {
          this.setTeacherSession(null);
        }
        return {
          success: false,
          code: res?.code || 'CHANGE_PASSWORD_FAILED',
          message: res?.message || 'تعذر تغيير كلمة المرور.',
        };
      }

      const rotatedSession: TeacherSession = {
        ...session,
        teacherSessionToken: String(res.teacherSessionToken),
        expiresAt: String(res.expiresAt || session.expiresAt),
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
      };
      this.setTeacherSession(rotatedSession);

      return {
        success: true,
        message: res?.message || 'تم تغيير كلمة المرور بنجاح.',
        teacherSessionToken: rotatedSession.teacherSessionToken,
      };
    } catch {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم لتغيير كلمة المرور.',
      };
    }
  }

  public async saveTeacherHomeworkDraftAuthoritative(input: {
    title: string;
    description?: string;
    subject?: string;
    grade?: string;
    classroom: string;
    assignedDate?: string;
    dueDate?: string;
  }): Promise<{ success: boolean; code?: string; message?: string; homework?: Homework }> {
    const session = this.getTeacherSession();
    if (!session?.teacherSessionToken) {
      return { success: false, code: 'TEACHER_SESSION_REQUIRED', message: 'لا توجد جلسة معلم نشطة.' };
    }

    const title = String(input?.title || '').trim();
    const classroom = String(input?.classroom || '').trim();
    if (!title || !classroom) {
      return { success: false, code: 'INVALID_PAYLOAD', message: 'عنوان الواجب والفصل الدراسي مطلوبان.' };
    }

    const scriptUrl = this.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'حفظ الواجب يتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveTeacherHomeworkDraft',
          teacherSessionToken: session.teacherSessionToken,
          data: {
            title,
            description: String(input.description || '').trim(),
            subject: String(input.subject || '').trim(),
            grade: String(input.grade || '').trim(),
            classroom,
            assignedDate: String(input.assignedDate || '').trim(),
            dueDate: String(input.dueDate || '').trim(),
          },
        }),
      });

      let res: any = null;
      try {
        res = await response.json();
      } catch {}

      const code = String(res?.code || '');
      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || [
          'TEACHER_SESSION_REQUIRED',
          'TEACHER_SESSION_INVALID',
          'TEACHER_SESSION_EXPIRED',
          'SESSION_EXPIRED',
          'SESSION_REVOKED',
          'INVALID_SESSION',
        ].includes(code)) {
          this.setTeacherSession(null);
        }
        return {
          success: false,
          code: code || 'HOMEWORK_SAVE_FAILED',
          message: res?.message || 'تعذر حفظ مسودة الواجب.',
        };
      }

      return {
        success: true,
        message: res?.message || 'تم حفظ مسودة الواجب بنجاح.',
        homework: res?.homework as Homework | undefined,
      };
    } catch {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم لحفظ مسودة الواجب.',
      };
    }
  }

  public async saveTeacherResourceDraftAuthoritative(input: {
    title: string;
    topic?: string;
    subject?: string;
    classroom: string;
    studentResourceUrl?: string;
    presentationUrl?: string;
    preparationNotesUrl?: string;
  }): Promise<{ success: boolean; code?: string; message?: string; resource?: TeacherLessonResource }> {
    const session = this.getTeacherSession();
    if (!session?.teacherSessionToken) {
      return { success: false, code: 'TEACHER_SESSION_REQUIRED', message: 'لا توجد جلسة معلم نشطة.' };
    }

    const title = String(input?.title || '').trim();
    const classroom = String(input?.classroom || '').trim();
    if (!title || !classroom) {
      return { success: false, code: 'INVALID_PAYLOAD', message: 'عنوان المورد والفصل الدراسي مطلوبان.' };
    }

    const scriptUrl = this.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'حفظ المورد يتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveTeacherResourceDraft',
          teacherSessionToken: session.teacherSessionToken,
          data: {
            title,
            topic: String(input.topic || '').trim(),
            subject: String(input.subject || '').trim(),
            classroom,
            studentResourceUrl: String(input.studentResourceUrl || '').trim(),
            presentationUrl: String(input.presentationUrl || '').trim(),
            preparationNotesUrl: String(input.preparationNotesUrl || '').trim(),
          },
        }),
      });

      let res: any = null;
      try {
        res = await response.json();
      } catch {}

      const code = String(res?.code || '');
      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || [
          'TEACHER_SESSION_REQUIRED',
          'TEACHER_SESSION_INVALID',
          'TEACHER_SESSION_EXPIRED',
          'SESSION_EXPIRED',
          'SESSION_REVOKED',
          'INVALID_SESSION',
        ].includes(code)) {
          this.setTeacherSession(null);
        }
        return {
          success: false,
          code: code || 'RESOURCE_SAVE_FAILED',
          message: res?.message || 'تعذر حفظ مسودة المورد.',
        };
      }

      return {
        success: true,
        message: res?.message || 'تم حفظ مسودة المورد بنجاح.',
        resource: res?.resource as TeacherLessonResource | undefined,
      };
    } catch {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم لحفظ مسودة المورد.',
      };
    }
  }

  private sanitizeEmployeeManagementInput(input: Partial<Employee>): Partial<Employee> {
    const safe: Partial<Employee> = {
      id: input.id ? String(input.id).trim().toUpperCase() : undefined,
      name: String(input.name || input.fullName || '').trim(),
      fullName: String(input.name || input.fullName || '').trim(),
      employeeType: input.employeeType === 'Teacher' ? 'Teacher' : 'Administrative',
      jobTitle: String(input.jobTitle || '').trim(),
      specialization: String(input.specialization || '').trim(),
      teacherCode: input.employeeType === 'Teacher' && input.teacherCode
        ? String(input.teacherCode).trim().toUpperCase()
        : undefined,
      nationalId: input.nationalId ? String(input.nationalId).trim() : undefined,
      hireDate: input.hireDate ? String(input.hireDate).trim() : undefined,
      workingHours: input.workingHours !== undefined ? Number(input.workingHours) : undefined,
      workStartTime: input.workStartTime ? String(input.workStartTime).trim() : undefined,
      workEndTime: input.workEndTime ? String(input.workEndTime).trim() : undefined,
      daysOff: Array.isArray(input.daysOff) ? input.daysOff.map(x => String(x).trim()).filter(Boolean) : undefined,
      status: input.status,
      phone: input.phone ? String(input.phone).trim() : undefined,
      email: input.email ? String(input.email).trim().toLowerCase() : undefined,
      teachingSubjects: Array.isArray(input.teachingSubjects) ? input.teachingSubjects : undefined,
      assignedGrades: Array.isArray(input.assignedGrades) ? input.assignedGrades : undefined,
    };

    return safe;
  }

  private sanitizeStudentManagementInput(input: Partial<Student>): Record<string, unknown> {
    return {
      studentCode: input.studentCode ? String(input.studentCode).trim() : undefined,
      name: String(input.name || '').trim(),
      nationalId: input.nationalId ? String(input.nationalId).trim() : undefined,
      gender: input.gender ? String(input.gender).trim() : undefined,
      religion: input.religion ? String(input.religion).trim() : undefined,
      studentStatus: input.studentStatus ? String(input.studentStatus).trim() : undefined,
      birthDate: input.birthDate ? String(input.birthDate).trim() : undefined,
      stage: input.stage ? String(input.stage).trim() : undefined,
      stageId: input.stageId ? String(input.stageId).trim() : undefined,
      grade: String(input.grade || '').trim(),
      gradeId: input.gradeId ? String(input.gradeId).trim() : undefined,
      gradeName: input.gradeName ? String(input.gradeName).trim() : undefined,
      classroom: String(input.classroom || '').trim(),
      classroomId: input.classroomId ? String(input.classroomId).trim() : undefined,
      classroomNumber: input.classroomNumber ? String(input.classroomNumber).trim() : undefined,
      section: input.section ? String(input.section).trim() : undefined,
      academicYear: input.academicYear ? String(input.academicYear).trim() : undefined,
      academicYearId: input.academicYearId ? String(input.academicYearId).trim() : undefined,
      enrollmentDate: input.enrollmentDate ? String(input.enrollmentDate).trim() : undefined,
      phone: input.phone ? String(input.phone).trim() : undefined,
      parentId: input.parentId ? String(input.parentId).trim() : undefined,
      parentName: input.parentName ? String(input.parentName).trim() : undefined,
      relationship: input.relationship ? String(input.relationship).trim() : undefined,
      parentPhone: input.parentPhone ? String(input.parentPhone).trim() : undefined,
      parentEmail: input.parentEmail ? String(input.parentEmail).trim().toLowerCase() : undefined,
      address: input.address ? String(input.address).trim() : undefined,
      initialBehaviorScore: input.initialBehaviorScore !== undefined ? Number(input.initialBehaviorScore) : undefined,
      notes: input.notes ? String(input.notes).trim() : undefined,
    };
  }

  private cacheCanonicalStudentEnrollment(enrollment?: StudentEnrollment): void {
    if (!enrollment?.id) return;
    const list = this.getStudentEnrollments();
    const idx = list.findIndex(
      item =>
        item.id === enrollment.id ||
        (item.studentId === enrollment.studentId && item.academicYearId === enrollment.academicYearId)
    );
    if (idx >= 0) list[idx] = enrollment;
    else list.push(enrollment);

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.STUDENT_ENROLLMENTS, JSON.stringify(list));
      }
    } catch {}
  }

  private async postStudentManagementAction(
    action: string,
    data?: Record<string, unknown> | Array<Record<string, unknown>>
  ): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    data?: any;
    student?: Student;
    enrollment?: StudentEnrollment;
    transfer?: StudentTransferHistory;
    stats?: { added: number; updated: number; skipped: number; errors: Array<{ row: number; code: string; message: string }> };
  }> {
    const user = this.getCurrentUser();
    if (!user?.sessionToken) {
      return { success: false, code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول بجلسة عمل معتمدة.' };
    }

    const scriptUrl = this.getBackendUrl();
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !online) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'إدارة بيانات الطلاب تتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action,
          sessionToken: user.sessionToken,
          ...(data !== undefined ? { data } : {}),
        }),
      });

      let res: any = null;
      try { res = await response.json(); } catch {}
      const code = String(res?.code || '');

      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || ['SESSION_EXPIRED','INVALID_SESSION','SESSION_REVOKED','UNAUTHORIZED','AUTH_REQUIRED'].includes(code)) {
          this.setCurrentUser(null);
        }
        return {
          success: false,
          code: code || 'STUDENT_MANAGEMENT_ACTION_FAILED',
          message: res?.message || 'تعذر تنفيذ العملية على بيانات الطلاب.',
        };
      }

      const enrollment = res?.enrollment as StudentEnrollment | undefined;
      if (enrollment) this.cacheCanonicalStudentEnrollment(enrollment);

      return {
        success: true,
        message: res?.message || 'تم تنفيذ العملية بنجاح.',
        data: res?.data,
        student: res?.student as Student | undefined,
        enrollment,
        transfer: res?.transfer as StudentTransferHistory | undefined,
        stats: res?.stats,
      };
    } catch {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم لإدارة بيانات الطلاب.',
      };
    }
  }

  public async getStudentManagementDataAuthoritative(): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    students?: Student[];
  }> {
    const result = await this.postStudentManagementAction('getStudents');
    if (!result.success) return result;

    const students = Array.isArray(result.data) ? result.data as Student[] : [];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
      }
    } catch {}
    this.notifyChange();

    return {
      success: true,
      message: result.message,
      students,
    };
  }

  public async createManagedStudentAuthoritative(
    input: Partial<Student>,
    enrollmentContext?: { academicYearId?: string; academicYearName?: string; enrollmentDate?: string }
  ) {
    const safe = this.sanitizeStudentManagementInput(input);
    return this.postStudentManagementAction('createManagedStudent', {
      ...safe,
      enrollmentContext: {
        academicYearId: String(enrollmentContext?.academicYearId || input.academicYearId || '').trim(),
        academicYearName: String(enrollmentContext?.academicYearName || input.academicYear || '').trim(),
        enrollmentDate: String(enrollmentContext?.enrollmentDate || input.enrollmentDate || '').trim(),
      },
    });
  }

  public async updateManagedStudentAuthoritative(
    id: string,
    input: Partial<Student>,
    enrollmentContext?: { academicYearId?: string; academicYearName?: string; enrollmentDate?: string }
  ) {
    const safe = this.sanitizeStudentManagementInput(input);
    return this.postStudentManagementAction('updateManagedStudent', {
      id: String(id || '').trim(),
      ...safe,
      enrollmentContext: {
        academicYearId: String(enrollmentContext?.academicYearId || input.academicYearId || '').trim(),
        academicYearName: String(enrollmentContext?.academicYearName || input.academicYear || '').trim(),
        enrollmentDate: String(enrollmentContext?.enrollmentDate || input.enrollmentDate || '').trim(),
      },
    });
  }

  public async setManagedStudentStatusAuthoritative(
    id: string,
    status: 'نشط' | 'غير نشط' | 'موقوف' | 'منقول' | 'متخرج'
  ) {
    return this.postStudentManagementAction('setManagedStudentStatus', {
      id: String(id || '').trim(),
      status,
    });
  }

  public async transferManagedStudentAuthoritative(input: {
    studentId: string;
    academicYearId?: string;
    toGrade: string;
    toClassroom: string;
    reason: string;
    notes?: string;
  }) {
    return this.postStudentManagementAction('transferManagedStudent', {
      studentId: String(input.studentId || '').trim(),
      academicYearId: String(input.academicYearId || '').trim(),
      toGrade: String(input.toGrade || '').trim(),
      toClassroom: String(input.toClassroom || '').trim(),
      reason: String(input.reason || '').trim(),
      notes: String(input.notes || '').trim(),
    });
  }

  public async importManagedStudentsAuthoritative(operations: Array<{
    operation: 'NEW' | 'UPDATE';
    targetId?: string;
    rowNumber?: number;
    data: Partial<Student>;
  }>): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    added: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: number; code: string; message: string }>;
  }> {
    const payload = operations.map(op => ({
      operation: op.operation,
      targetId: op.targetId ? String(op.targetId).trim() : undefined,
      rowNumber: Number(op.rowNumber || 0) || undefined,
      data: this.sanitizeStudentManagementInput(op.data),
    }));

    const result = await this.postStudentManagementAction(
      'importManagedStudents',
      payload as unknown as Record<string, unknown>
    );

    return {
      success: result.success,
      code: result.code,
      message: result.message,
      added: Number(result.stats?.added || 0),
      updated: Number(result.stats?.updated || 0),
      skipped: Number(result.stats?.skipped || 0),
      errors: Array.isArray(result.stats?.errors) ? result.stats!.errors : [],
    };
  }

  private async postEmployeeManagementAction(
    action: string,
    data?: Record<string, unknown> | Array<Record<string, unknown>>
  ): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    data?: any;
    employee?: Employee;
    stats?: { added: number; updated: number; skipped: number; errors: Array<{ row: number; code: string; message: string }> };
  }> {
    const user = this.getCurrentUser();
    if (!user?.sessionToken) {
      return { success: false, code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول بجلسة عمل معتمدة.' };
    }

    const scriptUrl = this.getBackendUrl();
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !online) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'إدارة بيانات العاملين تتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action,
          sessionToken: user.sessionToken,
          ...(data !== undefined ? { data } : {}),
        }),
      });

      let res: any = null;
      try { res = await response.json(); } catch {}
      const code = String(res?.code || '');

      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || ['SESSION_EXPIRED','INVALID_SESSION','SESSION_REVOKED','UNAUTHORIZED','AUTH_REQUIRED'].includes(code)) {
          this.setCurrentUser(null);
        }
        return {
          success: false,
          code: code || 'EMPLOYEE_MANAGEMENT_ACTION_FAILED',
          message: res?.message || 'تعذر تنفيذ العملية على بيانات العاملين.',
        };
      }

      return {
        success: true,
        message: res?.message || 'تم تنفيذ العملية بنجاح.',
        data: res?.data,
        employee: res?.employee as Employee | undefined,
        stats: res?.stats,
      };
    } catch {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم لإدارة بيانات العاملين.',
      };
    }
  }

  public async getEmployeeManagementDataAuthoritative(): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    employees?: Employee[];
  }> {
    const result = await this.postEmployeeManagementAction('getEmployees');
    if (!result.success) return result;
    const employees = Array.isArray(result.data) ? result.data as Employee[] : [];

    // Cache is UX-only and is refreshed strictly after authoritative backend success.
    // This keeps other read-only/reporting surfaces synchronized without granting local write authority.
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
      }
    } catch {}
    this.notifyChange();

    return {
      success: true,
      message: result.message,
      employees,
    };
  }

  public async createManagedEmployeeAuthoritative(input: Partial<Employee>) {
    const safe = this.sanitizeEmployeeManagementInput(input);
    return this.postEmployeeManagementAction('createManagedEmployee', safe as Record<string, unknown>);
  }

  public async updateManagedEmployeeAuthoritative(input: Partial<Employee> & { id: string }) {
    const safe = this.sanitizeEmployeeManagementInput(input);
    safe.id = String(input.id || '').trim().toUpperCase();
    return this.postEmployeeManagementAction('updateManagedEmployee', safe as Record<string, unknown>);
  }

  public async setManagedEmployeeStatusAuthoritative(
    id: string,
    status: 'Active' | 'Inactive' | 'Suspended'
  ) {
    return this.postEmployeeManagementAction('setManagedEmployeeStatus', {
      id: String(id || '').trim().toUpperCase(),
      status,
    });
  }

  public async deleteManagedEmployeeAuthoritative(id: string) {
    return this.postEmployeeManagementAction('deleteEmployee', {
      id: String(id || '').trim().toUpperCase(),
    });
  }

  public async importManagedEmployeesAuthoritative(importedEmployees: Partial<Employee>[]): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    added: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: number; code: string; message: string }>;
  }> {
    const payload = importedEmployees.map(emp => this.sanitizeEmployeeManagementInput(emp) as Record<string, unknown>);
    const result = await this.postEmployeeManagementAction('importManagedEmployees', payload);
    return {
      success: result.success,
      code: result.code,
      message: result.message,
      added: Number(result.stats?.added || 0),
      updated: Number(result.stats?.updated || 0),
      skipped: Number(result.stats?.skipped || 0),
      errors: Array.isArray(result.stats?.errors) ? result.stats!.errors : [],
    };
  }

  private async postLeaveManagementAction(
    action: string,
    data?: Record<string, unknown>
  ): Promise<{ success: boolean; code?: string; message?: string; data?: any; leave?: LeaveRecord; permission?: EmployeePermissionRecord }> {
    const user = this.getCurrentUser();
    if (!user?.sessionToken) {
      return { success: false, code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول بجلسة عمل معتمدة.' };
    }

    const scriptUrl = this.getBackendUrl();
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !online) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'هذه العملية تتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action,
          sessionToken: user.sessionToken,
          ...(data ? { data } : {}),
        }),
      });

      let res: any = null;
      try { res = await response.json(); } catch {}
      const code = String(res?.code || '');

      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || ['SESSION_EXPIRED','INVALID_SESSION','SESSION_REVOKED','UNAUTHORIZED','AUTH_REQUIRED'].includes(code)) {
          this.setCurrentUser(null);
        }
        return {
          success: false,
          code: code || 'LEAVE_MANAGEMENT_ACTION_FAILED',
          message: res?.message || 'تعذر تنفيذ العملية.',
        };
      }

      return {
        success: true,
        message: res?.message || 'تم تنفيذ العملية بنجاح.',
        data: res?.data,
        leave: res?.leave as LeaveRecord | undefined,
        permission: res?.permission as EmployeePermissionRecord | undefined,
      };
    } catch {
      return { success: false, code: 'NETWORK_ERROR', message: 'تعذر الاتصال بالخادم لتنفيذ العملية.' };
    }
  }

  public async getLeaveManagementDataAuthoritative(): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    leaves?: LeaveRecord[];
    permissions?: EmployeePermissionRecord[];
  }> {
    const result = await this.postLeaveManagementAction('getLeaveManagementData');
    if (!result.success) return result;
    return {
      success: true,
      message: result.message,
      leaves: Array.isArray(result.data?.leaves) ? result.data.leaves : [],
      permissions: Array.isArray(result.data?.permissions) ? result.data.permissions : [],
    };
  }

  public async createManagedLeaveAuthoritative(input: {
    employeeId: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    reason: string;
    notes?: string;
    attachment?: string;
  }) {
    return this.postLeaveManagementAction('createManagedLeave', {
      employeeId: String(input.employeeId || '').trim(),
      leaveType: String(input.leaveType || '').trim(),
      startDate: String(input.startDate || '').trim(),
      endDate: String(input.endDate || '').trim(),
      reason: String(input.reason || '').trim(),
      notes: String(input.notes || '').trim(),
      attachment: String(input.attachment || ''),
    });
  }

  public async createManagedPermissionAuthoritative(input: {
    employeeId: string;
    date: string;
    permissionType: string;
    startTime: string;
    endTime: string;
    reason: string;
    notes?: string;
    attachment?: string;
  }) {
    return this.postLeaveManagementAction('createManagedPermission', {
      employeeId: String(input.employeeId || '').trim(),
      date: String(input.date || '').trim(),
      permissionType: String(input.permissionType || '').trim(),
      startTime: String(input.startTime || '').trim(),
      endTime: String(input.endTime || '').trim(),
      reason: String(input.reason || '').trim(),
      notes: String(input.notes || '').trim(),
      attachment: String(input.attachment || ''),
    });
  }

  public async setManagedLeaveStatusAuthoritative(id: string, status: 'مقبولة' | 'مرفوضة', reason?: string) {
    return this.postLeaveManagementAction(
      status === 'مقبولة' ? 'approveManagedLeave' : 'rejectManagedLeave',
      { id: String(id || '').trim(), reason: String(reason || '').trim() }
    );
  }

  public async setManagedPermissionStatusAuthoritative(id: string, status: 'مقبولة' | 'مرفوضة', reason?: string) {
    return this.postLeaveManagementAction(
      status === 'مقبولة' ? 'approveManagedPermission' : 'rejectManagedPermission',
      { id: String(id || '').trim(), reason: String(reason || '').trim() }
    );
  }

  public async deleteManagedLeaveAuthoritative(id: string) {
    return this.postLeaveManagementAction('deleteLeave', { id: String(id || '').trim() });
  }

  public async deleteManagedPermissionAuthoritative(id: string) {
    return this.postLeaveManagementAction('deletePermission', { id: String(id || '').trim() });
  }

  public async getStaffSelfRequestsAuthoritative(): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    profile?: { employeeId: string; employeeName: string; department: string; employeeNumber?: string };
    leaves?: LeaveRecord[];
    permissions?: EmployeePermissionRecord[];
  }> {
    const user = this.getCurrentUser();
    if (!user?.sessionToken) {
      return { success: false, code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول بجلسة عمل معتمدة.' };
    }
    if (!user.employeeId) {
      return { success: false, code: 'EMPLOYEE_CONTEXT_REQUIRED', message: 'الحساب غير مربوط بسجل موظف معتمد.' };
    }

    const scriptUrl = this.getBackendUrl();
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !online) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'عرض الطلبات يتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getMyRequests',
          sessionToken: user.sessionToken,
        }),
      });

      let res: any = null;
      try { res = await response.json(); } catch {}
      const code = String(res?.code || '');

      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || ['SESSION_EXPIRED','INVALID_SESSION','SESSION_REVOKED','UNAUTHORIZED','AUTH_REQUIRED'].includes(code)) {
          this.setCurrentUser(null);
        }
        return {
          success: false,
          code: code || 'SELF_REQUESTS_READ_FAILED',
          message: res?.message || 'تعذر تحميل الطلبات.',
        };
      }

      return {
        success: true,
        message: res?.message || 'تم تحميل الطلبات بنجاح.',
        profile: res?.data?.profile,
        leaves: Array.isArray(res?.data?.leaves) ? res.data.leaves : [],
        permissions: Array.isArray(res?.data?.permissions) ? res.data.permissions : [],
      };
    } catch {
      return { success: false, code: 'NETWORK_ERROR', message: 'تعذر الاتصال بالخادم لتحميل الطلبات.' };
    }
  }

  public async createStaffLeaveRequestAuthoritative(input: {
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    reason: string;
    notes?: string;
    attachment?: string;
  }): Promise<{ success: boolean; code?: string; message?: string; leave?: LeaveRecord }> {
    const user = this.getCurrentUser();
    if (!user?.sessionToken) {
      return { success: false, code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول بجلسة عمل معتمدة.' };
    }
    if (!user.employeeId) {
      return { success: false, code: 'EMPLOYEE_CONTEXT_REQUIRED', message: 'الحساب غير مربوط بسجل موظف معتمد.' };
    }

    const scriptUrl = this.getBackendUrl();
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !online) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'إرسال طلب الإجازة يتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'createMyLeaveRequest',
          sessionToken: user.sessionToken,
          data: {
            leaveType: String(input.leaveType || '').trim(),
            startDate: String(input.startDate || '').trim(),
            endDate: String(input.endDate || '').trim(),
            reason: String(input.reason || '').trim(),
            notes: String(input.notes || '').trim(),
            attachment: String(input.attachment || ''),
          },
        }),
      });

      let res: any = null;
      try { res = await response.json(); } catch {}
      const code = String(res?.code || '');

      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || ['SESSION_EXPIRED','INVALID_SESSION','SESSION_REVOKED','UNAUTHORIZED','AUTH_REQUIRED'].includes(code)) {
          this.setCurrentUser(null);
        }
        return { success: false, code: code || 'LEAVE_REQUEST_FAILED', message: res?.message || 'تعذر إرسال طلب الإجازة.' };
      }

      return { success: true, message: res?.message || 'تم إرسال طلب الإجازة بنجاح.', leave: res?.leave as LeaveRecord | undefined };
    } catch {
      return { success: false, code: 'NETWORK_ERROR', message: 'تعذر الاتصال بالخادم لإرسال طلب الإجازة.' };
    }
  }

  public async createStaffPermissionRequestAuthoritative(input: {
    date: string;
    permissionType: string;
    startTime: string;
    endTime: string;
    reason: string;
    notes?: string;
    attachment?: string;
  }): Promise<{ success: boolean; code?: string; message?: string; permission?: EmployeePermissionRecord }> {
    const user = this.getCurrentUser();
    if (!user?.sessionToken) {
      return { success: false, code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول بجلسة عمل معتمدة.' };
    }
    if (!user.employeeId) {
      return { success: false, code: 'EMPLOYEE_CONTEXT_REQUIRED', message: 'الحساب غير مربوط بسجل موظف معتمد.' };
    }

    const scriptUrl = this.getBackendUrl();
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !online) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'إرسال طلب الإذن يتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'createMyPermissionRequest',
          sessionToken: user.sessionToken,
          data: {
            date: String(input.date || '').trim(),
            permissionType: String(input.permissionType || '').trim(),
            startTime: String(input.startTime || '').trim(),
            endTime: String(input.endTime || '').trim(),
            reason: String(input.reason || '').trim(),
            notes: String(input.notes || '').trim(),
            attachment: String(input.attachment || ''),
          },
        }),
      });

      let res: any = null;
      try { res = await response.json(); } catch {}
      const code = String(res?.code || '');

      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || ['SESSION_EXPIRED','INVALID_SESSION','SESSION_REVOKED','UNAUTHORIZED','AUTH_REQUIRED'].includes(code)) {
          this.setCurrentUser(null);
        }
        return { success: false, code: code || 'PERMISSION_REQUEST_FAILED', message: res?.message || 'تعذر إرسال طلب الإذن.' };
      }

      return { success: true, message: res?.message || 'تم إرسال طلب الإذن بنجاح.', permission: res?.permission as EmployeePermissionRecord | undefined };
    } catch {
      return { success: false, code: 'NETWORK_ERROR', message: 'تعذر الاتصال بالخادم لإرسال طلب الإذن.' };
    }
  }

  public async getTeacherSelfRequestsAuthoritative(): Promise<{
    success: boolean;
    code?: string;
    message?: string;
    profile?: {
      employeeId: string;
      employeeName: string;
      department: string;
      teacherCode?: string;
    };
    leaves?: LeaveRecord[];
    permissions?: EmployeePermissionRecord[];
  }> {
    const session = this.getTeacherSession();
    if (!session?.teacherSessionToken) {
      return { success: false, code: 'TEACHER_SESSION_REQUIRED', message: 'لا توجد جلسة معلم نشطة.' };
    }

    const scriptUrl = this.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'عرض الطلبات يتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getTeacherSelfRequests',
          teacherSessionToken: session.teacherSessionToken,
        }),
      });

      let res: any = null;
      try {
        res = await response.json();
      } catch {}

      const code = String(res?.code || '');
      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || [
          'TEACHER_SESSION_REQUIRED',
          'TEACHER_SESSION_INVALID',
          'TEACHER_SESSION_EXPIRED',
          'SESSION_EXPIRED',
          'SESSION_REVOKED',
          'INVALID_SESSION',
        ].includes(code)) {
          this.setTeacherSession(null);
        }
        return {
          success: false,
          code: code || 'SELF_REQUESTS_READ_FAILED',
          message: res?.message || 'تعذر تحميل طلبات المعلم.',
        };
      }

      return {
        success: true,
        message: res?.message || 'تم تحميل الطلبات بنجاح.',
        profile: res?.data?.profile,
        leaves: Array.isArray(res?.data?.leaves) ? res.data.leaves : [],
        permissions: Array.isArray(res?.data?.permissions) ? res.data.permissions : [],
      };
    } catch {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم لتحميل طلبات المعلم.',
      };
    }
  }

  public async createTeacherLeaveRequestAuthoritative(input: {
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    reason: string;
    notes?: string;
    attachment?: string;
  }): Promise<{ success: boolean; code?: string; message?: string; leave?: LeaveRecord }> {
    const session = this.getTeacherSession();
    if (!session?.teacherSessionToken) {
      return { success: false, code: 'TEACHER_SESSION_REQUIRED', message: 'لا توجد جلسة معلم نشطة.' };
    }

    const scriptUrl = this.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'إرسال طلب الإجازة يتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'createTeacherLeaveRequest',
          teacherSessionToken: session.teacherSessionToken,
          data: {
            leaveType: String(input.leaveType || '').trim(),
            startDate: String(input.startDate || '').trim(),
            endDate: String(input.endDate || '').trim(),
            reason: String(input.reason || '').trim(),
            notes: String(input.notes || '').trim(),
            attachment: String(input.attachment || ''),
          },
        }),
      });

      let res: any = null;
      try {
        res = await response.json();
      } catch {}

      const code = String(res?.code || '');
      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || [
          'TEACHER_SESSION_REQUIRED',
          'TEACHER_SESSION_INVALID',
          'TEACHER_SESSION_EXPIRED',
          'SESSION_EXPIRED',
          'SESSION_REVOKED',
          'INVALID_SESSION',
        ].includes(code)) {
          this.setTeacherSession(null);
        }
        return {
          success: false,
          code: code || 'LEAVE_REQUEST_FAILED',
          message: res?.message || 'تعذر إرسال طلب الإجازة.',
        };
      }

      return {
        success: true,
        message: res?.message || 'تم إرسال طلب الإجازة بنجاح.',
        leave: res?.leave as LeaveRecord | undefined,
      };
    } catch {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم لإرسال طلب الإجازة.',
      };
    }
  }

  public async createTeacherPermissionRequestAuthoritative(input: {
    date: string;
    permissionType: string;
    startTime: string;
    endTime: string;
    reason: string;
    notes?: string;
    attachment?: string;
  }): Promise<{ success: boolean; code?: string; message?: string; permission?: EmployeePermissionRecord }> {
    const session = this.getTeacherSession();
    if (!session?.teacherSessionToken) {
      return { success: false, code: 'TEACHER_SESSION_REQUIRED', message: 'لا توجد جلسة معلم نشطة.' };
    }

    const scriptUrl = this.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'إرسال طلب الإذن يتطلب الاتصال بالخادم المعتمد.' };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'createTeacherPermissionRequest',
          teacherSessionToken: session.teacherSessionToken,
          data: {
            date: String(input.date || '').trim(),
            permissionType: String(input.permissionType || '').trim(),
            startTime: String(input.startTime || '').trim(),
            endTime: String(input.endTime || '').trim(),
            reason: String(input.reason || '').trim(),
            notes: String(input.notes || '').trim(),
            attachment: String(input.attachment || ''),
          },
        }),
      });

      let res: any = null;
      try {
        res = await response.json();
      } catch {}

      const code = String(res?.code || '');
      if (!response.ok || res?.status === 'error') {
        if (response.status === 401 || [
          'TEACHER_SESSION_REQUIRED',
          'TEACHER_SESSION_INVALID',
          'TEACHER_SESSION_EXPIRED',
          'SESSION_EXPIRED',
          'SESSION_REVOKED',
          'INVALID_SESSION',
        ].includes(code)) {
          this.setTeacherSession(null);
        }
        return {
          success: false,
          code: code || 'PERMISSION_REQUEST_FAILED',
          message: res?.message || 'تعذر إرسال طلب الإذن.',
        };
      }

      return {
        success: true,
        message: res?.message || 'تم إرسال طلب الإذن بنجاح.',
        permission: res?.permission as EmployeePermissionRecord | undefined,
      };
    } catch {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم لإرسال طلب الإذن.',
      };
    }
  }

  /**
   * Teacher Session Management: Relies on teacherSessionToken ONLY.
   */
  public getTeacherSession(): TeacherSession | null {
    let raw: string | null = null;

    try {
      if (typeof sessionStorage !== 'undefined') {
        raw = sessionStorage.getItem(STORAGE_KEYS.TEACHER_SESSION);
      }
    } catch {}

    if (!raw) {
      try {
        if (typeof localStorage !== 'undefined') {
          raw = localStorage.getItem(STORAGE_KEYS.TEACHER_SESSION);
        }
      } catch {}
    }

    if (!raw) return null;

    try {
      const session: TeacherSession = JSON.parse(raw);
      if (!session || !session.teacherSessionToken || session.teacherSessionToken.length < 10) {
        this.setTeacherSession(null);
        return null;
      }
      if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
        this.setTeacherSession(null);
        return null;
      }
      return session;
    } catch {
      this.setTeacherSession(null);
      return null;
    }
  }

  public setTeacherSession(session: TeacherSession | null): void {
    if (session) {
      const safeSession: TeacherSession = {
        teacherSessionToken: session.teacherSessionToken,
        schoolId: session.schoolId || this.getActiveSchoolId(),
        employeeId: session.employeeId,
        teacherCode: session.teacherCode,
        teacherName: session.teacherName,
        username: session.username,
        department: session.department,
        mustChangePassword: session.mustChangePassword === true,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
      };
      const serialized = JSON.stringify(safeSession);

      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEYS.TEACHER_SESSION, serialized);
        }
      } catch {}

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEYS.TEACHER_SESSION, serialized);
        }
      } catch {}
    } else {
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(STORAGE_KEYS.TEACHER_SESSION);
        }
      } catch {}

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_KEYS.TEACHER_SESSION);
        }
      } catch {}
    }
    this.notifyChange();
  }

  public getTeacherSessionToken(): string | null {
    return this.getTeacherSession()?.teacherSessionToken || null;
  }

  public logoutTeacher(): void {
    const session = this.getTeacherSession();
    const scriptUrl = this.getBackendUrl();
    if (session?.teacherSessionToken && scriptUrl && scriptUrl.length > 15 && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'teacherLogout',
          teacherSessionToken: session.teacherSessionToken,
        }),
      }).catch(() => {});
    }
    this.setTeacherSession(null);
  }

  public revokeTeacherSessions(employeeId: string): void {
    const session = this.getTeacherSession();
    if (session && session.employeeId === employeeId) {
      this.setTeacherSession(null);
    }
  }

  private async pushPost(action: string, data: any): Promise<void> {
    // 1. Enqueue mutation
    SyncQueueService.enqueue(action, action.replace('save', '').toLowerCase(), data);

    // 2. Trigger asynchronous queue processing if online
    if (navigator.onLine) {
      setTimeout(() => {
        this.processSyncQueue().then(() => {
          this.notifyChange();
        }).catch(() => {});
      }, 50);
    }
  }

  // ============================================================================
  // 17. CURRICULUM PLANS & LESSON DISTRIBUTION (PHASE 4)
  // ============================================================================

  public getCurriculumPlans(schoolId?: string): CurriculumMasterPlan[] {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRICULUM_PLANS);
    if (!raw) return [];
    try {
      const list: CurriculumMasterPlan[] = JSON.parse(raw);
      const targetSchoolId = (schoolId || this.getActiveSchoolId()).trim();
      return list.filter(p => !targetSchoolId || p.schoolId === targetSchoolId);
    } catch {
      return [];
    }
  }

  public getCurriculumPlanById(id: string): CurriculumMasterPlan | undefined {
    return this.getCurriculumPlans().find(p => p.id === id);
  }

  public saveCurriculumPlan(
    plan: Partial<CurriculumMasterPlan> & { grade: string; subject: string },
    user?: User | null
  ): { success: boolean; plan?: CurriculumMasterPlan; message: string } {
    const activeSchoolId = (plan.schoolId || user?.schoolId || this.getActiveSchoolId()).trim();
    const currentUser = user || this.getCurrentUser();

    // Permissions check: Curriculum Admin / Admin / SchoolDirector or explicit permission
    const isCurriculumAdmin =
      currentUser?.role === 'Admin' ||
      currentUser?.role === 'SchoolDirector' ||
      currentUser?.role === 'TeacherAffairs' ||
      (currentUser?.permissions && currentUser.permissions.includes('settings.manage' as any));

    if (!isCurriculumAdmin) {
      return {
        success: false,
        message: 'غير مصرح لك بإنشاء أو تعديل خطة المنهج الرئيسية. هذه الصلاحية مخصصة لمسؤول المناهج والإدارة.',
      };
    }

    const plans = this.getCurriculumPlans();
    const now = getCairoNowISO();
    const existingIndex = plans.findIndex(p => p.id === plan.id);

    let finalPlan: CurriculumMasterPlan;

    if (existingIndex >= 0) {
      const existing = plans[existingIndex];
      // Multi-school check
      if (existing.schoolId !== activeSchoolId && currentUser?.role !== 'Admin') {
        return {
          success: false,
          message: 'غير مصرح لك بتعديل خطة تتبع مدرسة أخرى',
        };
      }

      finalPlan = {
        ...existing,
        ...plan,
        schoolId: existing.schoolId,
        version: (existing.version || 1) + 1,
        updatedAt: now,
      };
      plans[existingIndex] = finalPlan;
    } else {
      finalPlan = {
        id: plan.id || `PLAN-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        schoolId: activeSchoolId,
        academicYear: plan.academicYear || this.getActiveAcademicYear()?.name || '2026-2027',
        term: plan.term || 'الفصل الدراسي الأول',
        grade: plan.grade,
        gradeId: plan.gradeId,
        subject: plan.subject,
        subjectId: plan.subjectId,
        version: 1,
        status: plan.status || 'Draft',
        uploadedBy: currentUser?.id || 'admin',
        uploadedByName: currentUser?.fullName || currentUser?.username || 'مدير المناهج',
        uploadedAt: now,
        updatedAt: now,
        fileMeta: plan.fileMeta,
        items: plan.items || [],
      };
      plans.unshift(finalPlan);
    }

    localStorage.setItem(STORAGE_KEYS.CURRICULUM_PLANS, JSON.stringify(plans));
    this.notifyChange();

    return {
      success: true,
      plan: finalPlan,
      message: 'تم حفظ خطة المنهج بنجاح',
    };
  }

  public deleteCurriculumPlan(id: string, user?: User | null): { success: boolean; message: string } {
    const currentUser = user || this.getCurrentUser();
    const isCurriculumAdmin =
      currentUser?.role === 'Admin' ||
      currentUser?.role === 'SchoolDirector' ||
      currentUser?.role === 'TeacherAffairs';

    if (!isCurriculumAdmin) {
      return { success: false, message: 'غير مصرح بحذف خطة المنهج' };
    }

    const plans = this.getCurriculumPlans().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.CURRICULUM_PLANS, JSON.stringify(plans));

    // Also clean up distributions belonging to this plan
    const dists = this.getCurriculumDistributions().filter(d => d.planId !== id);
    localStorage.setItem(STORAGE_KEYS.CURRICULUM_DISTRIBUTIONS, JSON.stringify(dists));

    this.notifyChange();
    return { success: true, message: 'تم حذف الخطة وتوزيعاتها' };
  }

  public getCurriculumDistributions(schoolId?: string): CurriculumLessonDistribution[] {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRICULUM_DISTRIBUTIONS);
    if (!raw) return [];
    try {
      const list: CurriculumLessonDistribution[] = JSON.parse(raw);
      const targetSchoolId = (schoolId || this.getActiveSchoolId()).trim();
      return list.filter(d => !targetSchoolId || d.schoolId === targetSchoolId);
    } catch {
      return [];
    }
  }

  public saveCurriculumDistribution(
    dist: Partial<CurriculumLessonDistribution> & { planId: string; planItemId: string; teacherId: string },
    user?: User | null
  ): { success: boolean; data?: CurriculumLessonDistribution; message: string } {
    const activeSchoolId = (dist.schoolId || user?.schoolId || this.getActiveSchoolId()).trim();
    const now = getCairoNowISO();
    const list = this.getCurriculumDistributions();

    const idx = list.findIndex(d => d.id === dist.id);

    const record: CurriculumLessonDistribution = {
      id: dist.id || `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      schoolId: activeSchoolId,
      planId: dist.planId,
      planItemId: dist.planItemId,
      scheduleItemId: dist.scheduleItemId,
      teacherId: dist.teacherId,
      teacherName: dist.teacherName,
      grade: dist.grade || '',
      classroom: dist.classroom || '',
      subject: dist.subject || '',
      dayOfWeek: dist.dayOfWeek || '',
      periodNumber: dist.periodNumber || 1,
      targetDate: dist.targetDate,
      status: dist.status || 'Planned',
      notes: dist.notes,
      createdAt: dist.createdAt || now,
      updatedAt: now,
    };

    if (idx >= 0) {
      list[idx] = record;
    } else {
      list.push(record);
    }

    localStorage.setItem(STORAGE_KEYS.CURRICULUM_DISTRIBUTIONS, JSON.stringify(list));
    this.notifyChange();

    return {
      success: true,
      data: record,
      message: 'تم حفظ توزيع الدرس بالخطة بنجاح',
    };
  }

  public deleteCurriculumDistribution(id: string): { success: boolean } {
    const list = this.getCurriculumDistributions().filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEYS.CURRICULUM_DISTRIBUTIONS, JSON.stringify(list));
    this.notifyChange();
    return { success: true };
  }

  // ============================================================================
  // PHASE 5: QUALITY MODULE & ETQAN STANDARDS
  // Multi-school security: All queries and mutations strictly scoped to session schoolId
  // ============================================================================

  // --- Quality Standards ---
  public getQualityStandards(schoolId?: string): QualityStandard[] {
    const activeSchoolId = (schoolId || this.getActiveSchoolId()).trim();
    const raw = localStorage.getItem(STORAGE_KEYS.QUALITY_STANDARDS);
    if (!raw) return [];
    try {
      const all: QualityStandard[] = JSON.parse(raw);
      return all.filter(s => (s.schoolId || '').trim() === activeSchoolId);
    } catch {
      return [];
    }
  }

  public saveQualityStandard(
    standard: Partial<QualityStandard>,
    user?: User | null
  ): { success: boolean; data?: QualityStandard; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();

    // Permission check: Admin or QualityOfficer with quality.manageStandards
    const isAuthorized =
      !caller ||
      caller.role === 'Admin' ||
      caller.role === 'QualityOfficer' ||
      caller.role === 'SchoolDirector' ||
      (caller.permissions && caller.permissions.includes('quality.manageStandards'));

    if (!isAuthorized) {
      return { success: false, message: 'غير مصرح لك بتعديل معايير الجودة (إتقان).' };
    }

    if (!standard.code || !standard.domain || !standard.standard || !standard.indicator) {
      return { success: false, message: 'يرجى ملء كافة حقول المعيار والمؤشر الإلزامية.' };
    }

    const raw = localStorage.getItem(STORAGE_KEYS.QUALITY_STANDARDS);
    let all: QualityStandard[] = [];
    try {
      all = raw ? JSON.parse(raw) : [];
    } catch {
      all = [];
    }

    const now = getCairoNowISO();
    const existingIndex = all.findIndex(
      s => s.id === standard.id || (s.code === standard.code && (s.schoolId || '').trim() === activeSchoolId)
    );

    const record: QualityStandard = {
      id: standard.id || `STD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: activeSchoolId,
      code: standard.code.trim().toUpperCase(),
      domain: standard.domain.trim(),
      standard: standard.standard.trim(),
      indicator: standard.indicator.trim(),
      description: standard.description || '',
      weight: typeof standard.weight === 'number' && standard.weight > 0 ? standard.weight : 1,
      evaluationScale: standard.evaluationScale || 4,
      evidenceRequired: !!standard.evidenceRequired,
      applicableTo: standard.applicableTo && standard.applicableTo.length > 0 ? standard.applicableTo : ['DAILY_REPORT'],
      isActive: standard.isActive !== false,
      createdAt: standard.createdAt || now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      all[existingIndex] = { ...all[existingIndex], ...record, schoolId: activeSchoolId };
    } else {
      all.push(record);
    }

    localStorage.setItem(STORAGE_KEYS.QUALITY_STANDARDS, JSON.stringify(all));
    this.logAudit(
      'UPDATE_QUALITY_STANDARD',
      'QUALITY',
      `تم تحديث/حفظ معيار إتقان: [${record.code}] ${record.indicator} في المدرسة ${activeSchoolId}`
    );
    this.notifyChange();

    return {
      success: true,
      data: record,
      message: 'تم حفظ معيار الجودة بنجاح',
    };
  }

  public importQualityStandards(
    standards: Partial<QualityStandard>[],
    user?: User | null
  ): { success: boolean; importedCount: number; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();

    const isAuthorized =
      !caller ||
      caller.role === 'Admin' ||
      caller.role === 'QualityOfficer' ||
      caller.role === 'SchoolDirector' ||
      (caller.permissions && caller.permissions.includes('quality.manageStandards'));

    if (!isAuthorized) {
      return { success: false, importedCount: 0, message: 'غير مصرح لك باستيراد معايير الجودة.' };
    }

    let importedCount = 0;
    standards.forEach(std => {
      if (std.code && std.domain && std.indicator) {
        const res = this.saveQualityStandard({ ...std, schoolId: activeSchoolId }, caller);
        if (res.success) importedCount++;
      }
    });

    return {
      success: true,
      importedCount,
      message: `تم استيراد (${importedCount}) من معايير إتقان بنجاح.`,
    };
  }

  public deleteQualityStandard(id: string, user?: User | null): { success: boolean; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();

    const raw = localStorage.getItem(STORAGE_KEYS.QUALITY_STANDARDS);
    if (!raw) return { success: true, message: 'تم الحذف' };
    try {
      let all: QualityStandard[] = JSON.parse(raw);
      all = all.filter(s => !(s.id === id && (s.schoolId || '').trim() === activeSchoolId));
      localStorage.setItem(STORAGE_KEYS.QUALITY_STANDARDS, JSON.stringify(all));
      this.notifyChange();
      return { success: true, message: 'تم حذف معيار الجودة' };
    } catch {
      return { success: false, message: 'خطأ أثناء الحذف' };
    }
  }

  // --- Daily Quality Reports ---
  public getDailyQualityReports(schoolId?: string): DailyQualityReport[] {
    const activeSchoolId = (schoolId || this.getActiveSchoolId()).trim();
    const raw = localStorage.getItem(STORAGE_KEYS.DAILY_QUALITY_REPORTS);
    if (!raw) return [];
    try {
      const all: DailyQualityReport[] = JSON.parse(raw);
      return all.filter(r => (r.schoolId || '').trim() === activeSchoolId);
    } catch {
      return [];
    }
  }

  public saveDailyQualityReport(
    report: Partial<DailyQualityReport>,
    user?: User | null
  ): { success: boolean; data?: DailyQualityReport; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();

    const raw = localStorage.getItem(STORAGE_KEYS.DAILY_QUALITY_REPORTS);
    let all: DailyQualityReport[] = [];
    try {
      all = raw ? JSON.parse(raw) : [];
    } catch {
      all = [];
    }

    const now = getCairoNowISO();
    const isNew = !report.id || !all.some(r => r.id === report.id);

    const record: DailyQualityReport = {
      id: report.id || `DQR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: activeSchoolId,
      date: report.date || getCairoCurrentDate(),
      evaluatorId: report.evaluatorId || caller?.id || 'USR-QUALITY',
      evaluatorName: report.evaluatorName || caller?.fullName || 'مسؤول الجودة',
      evaluatorRole: report.evaluatorRole || (caller?.role as string) || 'QualityOfficer',
      domain: report.domain || 'عام',
      evaluations: report.evaluations || [],
      observations: report.observations || '',
      strengths: report.strengths || [],
      improvementAreas: report.improvementAreas || [],
      correctiveActionsSummary: report.correctiveActionsSummary || '',
      correctiveActionOwnerId: report.correctiveActionOwnerId,
      correctiveActionDueDate: report.correctiveActionDueDate,
      correctiveActionCreatedId: report.correctiveActionCreatedId,
      evidenceNotes: report.evidenceNotes || '',
      status: report.status || 'Submitted',
      approvedBy: report.approvedBy,
      approvedAt: report.approvedAt,
      createdAt: report.createdAt || now,
      updatedAt: now,
    };

    // Auto create corrective action if specified and not yet linked
    if (
      record.correctiveActionsSummary &&
      record.correctiveActionOwnerId &&
      record.correctiveActionDueDate &&
      !record.correctiveActionCreatedId
    ) {
      const caRes = this.saveCorrectiveAction(
        {
          sourceType: 'DAILY_REPORT',
          sourceId: record.id,
          description: record.correctiveActionsSummary,
          ownerEmployeeId: record.correctiveActionOwnerId,
          dueDate: record.correctiveActionDueDate,
          status: 'Open',
        },
        caller
      );
      if (caRes.success && caRes.data) {
        record.correctiveActionCreatedId = caRes.data.id;
      }
    }

    const idx = all.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
    } else {
      all.unshift(record);
    }

    localStorage.setItem(STORAGE_KEYS.DAILY_QUALITY_REPORTS, JSON.stringify(all));
    this.logAudit(
      isNew ? 'CREATE_QUALITY_REPORT' : 'UPDATE_QUALITY_REPORT',
      'QUALITY',
      `تقرير جودة يومي [${record.date}] للمقيم: ${record.evaluatorName}`
    );
    this.notifyChange();

    return {
      success: true,
      data: record,
      message: 'تم حفظ تقرير الجودة اليومي بنجاح',
    };
  }

  public deleteDailyQualityReport(id: string, user?: User | null): { success: boolean; message?: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();
    const list = this.getDailyQualityReports(activeSchoolId).filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEYS.DAILY_QUALITY_REPORTS, JSON.stringify(list));
    this.notifyChange();
    return { success: true, message: 'تم حذف التقرير بنجاح' };
  }

  // --- Teacher Visit Reports ---
  public getTeacherVisitReports(schoolId?: string): TeacherVisitReport[] {
    const activeSchoolId = (schoolId || this.getActiveSchoolId()).trim();
    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_VISIT_REPORTS);
    if (!raw) return [];
    try {
      const all: TeacherVisitReport[] = JSON.parse(raw);
      return all.filter(r => (r.schoolId || '').trim() === activeSchoolId);
    } catch {
      return [];
    }
  }

  public saveTeacherVisitReport(
    report: Partial<TeacherVisitReport>,
    user?: User | null
  ): { success: boolean; data?: TeacherVisitReport; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();

    if (!report.teacherId || !report.classroom || !report.subject) {
      return { success: false, message: 'يرجى تحديد المعلم والفصل والمادة لتقرير الزيارة.' };
    }

    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_VISIT_REPORTS);
    let all: TeacherVisitReport[] = [];
    try {
      all = raw ? JSON.parse(raw) : [];
    } catch {
      all = [];
    }

    const now = getCairoNowISO();
    const employees = this.getEmployees();
    const teacher = employees.find(e => e.id === report.teacherId || e.employeeNumber === report.teacherId);
    const teacherName = report.teacherName || teacher?.name || 'معلم غير محدد';

    // Calculate weighted overall score if evaluations exist
    const standards = this.getQualityStandards(activeSchoolId);
    let calculatedOverallScore: number | undefined;
    if (report.evaluations && report.evaluations.length > 0) {
      calculatedOverallScore = this.calculateWeightedScore(report.evaluations, standards).percentage;
    }

    const record: TeacherVisitReport = {
      id: report.id || `TVR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: activeSchoolId,
      teacherId: report.teacherId,
      teacherName,
      date: report.date || getCairoCurrentDate(),
      classroom: report.classroom,
      subject: report.subject,
      period: report.period || 1,
      evaluatorId: report.evaluatorId || caller?.id || 'USR-EVALUATOR',
      evaluatorName: report.evaluatorName || caller?.fullName || 'الموجه الفني / مسؤول الجودة',
      evaluations: report.evaluations || [],
      strengths: report.strengths || [],
      improvementAreas: report.improvementAreas || [],
      correctiveActionNotes: report.correctiveActionNotes || '',
      followUpDate: report.followUpDate,
      overallScore: calculatedOverallScore ?? report.overallScore,
      status: report.status || 'Submitted',
      approvedBy: report.approvedBy,
      approvedAt: report.approvedAt,
      createdAt: report.createdAt || now,
      updatedAt: now,
    };

    const idx = all.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
    } else {
      all.unshift(record);
    }

    localStorage.setItem(STORAGE_KEYS.TEACHER_VISIT_REPORTS, JSON.stringify(all));
    this.logAudit(
      'SUBMIT_TEACHER_VISIT',
      'QUALITY',
      `تسجيل زيارة صفية للمعلم: ${record.teacherName} (فصل: ${record.classroom}, مادة: ${record.subject}) بنتيجة ${record.overallScore || 0}%`
    );
    this.notifyChange();

    return {
      success: true,
      data: record,
      message: 'تم حفظ تقرير زيارة المعلم بنجاح',
    };
  }

  public deleteTeacherVisitReport(id: string, user?: User | null): { success: boolean; message?: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();
    const list = this.getTeacherVisitReports(activeSchoolId).filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEYS.TEACHER_VISIT_REPORTS, JSON.stringify(list));
    this.notifyChange();
    return { success: true, message: 'تم حذف تقرير الزيارة بنجاح' };
  }

  // --- Comprehensive Evaluations ---
  public getComprehensiveEvaluations(schoolId?: string): ComprehensiveEvaluation[] {
    const activeSchoolId = (schoolId || this.getActiveSchoolId()).trim();
    const raw = localStorage.getItem(STORAGE_KEYS.COMPREHENSIVE_EVALUATIONS);
    if (!raw) return [];
    try {
      const all: ComprehensiveEvaluation[] = JSON.parse(raw);
      return all.filter(e => (e.schoolId || '').trim() === activeSchoolId);
    } catch {
      return [];
    }
  }

  /**
   * Calculates strictly weighted score using registered QualityStandards (Weight & Evaluation Scale).
   * Formula: WeightedScore (%) = SUM( (score / evaluationScale) * weight ) / SUM(weight) * 100
   * No hardcoded fixed formula!
   */
  public calculateWeightedScore(
    evaluations: { standardId: string; score: number }[],
    standardsList?: QualityStandard[]
  ): {
    percentage: number;
    totalScore: number;
    earnedScore: number;
    domainScores?: DomainScore[];
  } {
    const standards = standardsList || this.getQualityStandards();
    const stdMap = new Map<string, QualityStandard>();
    standards.forEach(s => stdMap.set(s.id, s));

    let totalWeight = 0;
    let weightedPoints = 0;
    let totalMaxScore = 0;
    let totalEarnedScore = 0;

    const domainScoreMap: Record<string, { earned: number; total: number; weight: number }> = {};

    evaluations.forEach(ev => {
      const std = stdMap.get(ev.standardId);
      if (std) {
        const scale = std.evaluationScale > 0 ? std.evaluationScale : 4;
        const weight = std.weight > 0 ? std.weight : 1;
        const ratio = Math.min(Math.max(ev.score / scale, 0), 1); // 0.0 - 1.0
        weightedPoints += ratio * weight;
        totalWeight += weight;
        totalMaxScore += scale;
        totalEarnedScore += ev.score;

        const domain = std.domain || 'عام';
        if (!domainScoreMap[domain]) {
          domainScoreMap[domain] = { earned: 0, total: 0, weight: 0 };
        }
        domainScoreMap[domain].earned += ev.score;
        domainScoreMap[domain].total += scale;
        domainScoreMap[domain].weight += weight;
      }
    });

    const percentage = totalWeight > 0 ? Math.round((weightedPoints / totalWeight) * 100) : 0;

    const domainScores: DomainScore[] = Object.entries(domainScoreMap).map(([domain, data]) => ({
      domain,
      earnedScore: data.earned,
      totalScore: data.total,
      weight: data.weight,
      percentage: data.total > 0 ? Math.round((data.earned / data.total) * 100) : 0,
    }));

    return {
      percentage,
      totalScore: totalMaxScore,
      earnedScore: totalEarnedScore,
      domainScores,
    };
  }

  public saveComprehensiveEvaluation(
    evaluation: Partial<ComprehensiveEvaluation>,
    user?: User | null
  ): { success: boolean; data?: ComprehensiveEvaluation; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();

    const raw = localStorage.getItem(STORAGE_KEYS.COMPREHENSIVE_EVALUATIONS);
    let all: ComprehensiveEvaluation[] = [];
    try {
      all = raw ? JSON.parse(raw) : [];
    } catch {
      all = [];
    }

    const now = getCairoNowISO();
    const standards = this.getQualityStandards(activeSchoolId);
    const evals = evaluation.evaluations || [];
    const weightedCalc = this.calculateWeightedScore(evals, standards);
    const rawScoreTotal = evals.reduce((sum, e) => sum + (e.score || 0), 0);

    const record: ComprehensiveEvaluation = {
      id: evaluation.id || `CEV-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: activeSchoolId,
      title: evaluation.title || 'تقييم الجودة الشامل',
      targetType: evaluation.targetType || 'SCHOOL',
      targetId: evaluation.targetId,
      targetName: evaluation.targetName,
      periodLabel: evaluation.periodLabel || 'العام الدراسي الحالي',
      startDate: evaluation.startDate || getCairoCurrentDate(),
      endDate: evaluation.endDate || getCairoCurrentDate(),
      evaluatorId: evaluation.evaluatorId || caller?.id || 'USR-EVALUATOR',
      evaluatorName: evaluation.evaluatorName || caller?.fullName || 'لجنة تقييم الجودة الشاملة',
      evaluations: evals,
      rawScoreTotal,
      weightedScore: weightedCalc.percentage,
      totalScore: evaluation.totalScore ?? weightedCalc.totalScore,
      earnedScore: evaluation.earnedScore ?? weightedCalc.earnedScore,
      percentage: evaluation.percentage ?? weightedCalc.percentage,
      strengths: evaluation.strengths || [],
      improvementAreas: evaluation.improvementAreas || [],
      status: evaluation.status || 'Submitted',
      approvedBy: evaluation.approvedBy,
      approvedAt: evaluation.approvedAt,
      createdAt: evaluation.createdAt || now,
      updatedAt: now,
    };

    const idx = all.findIndex(e => e.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
    } else {
      all.unshift(record);
    }

    localStorage.setItem(STORAGE_KEYS.COMPREHENSIVE_EVALUATIONS, JSON.stringify(all));
    if (record.status === 'Approved') {
      this.logAudit(
        'APPROVE_EVALUATION',
        'QUALITY',
        `اعتماد التقييم الشامل: ${record.title} بنتيجة موزونة ${record.weightedScore}%`
      );
    } else {
      this.logAudit(
        'CREATE_QUALITY_REPORT',
        'QUALITY',
        `حفظ التقييم الشامل: ${record.title} بنتيجة موزونة ${record.weightedScore}%`
      );
    }
    this.notifyChange();

    return {
      success: true,
      data: record,
      message: 'تم حفظ التقييم الشامل بنجاح',
    };
  }

  public deleteComprehensiveEvaluation(id: string, user?: User | null): { success: boolean; message?: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();
    const list = this.getComprehensiveEvaluations(activeSchoolId).filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.COMPREHENSIVE_EVALUATIONS, JSON.stringify(list));
    this.notifyChange();
    return { success: true, message: 'تم حذف التقييم الشامل بنجاح' };
  }

  // --- Corrective Actions ---
  public getCorrectiveActions(schoolId?: string): CorrectiveAction[] {
    const activeSchoolId = (schoolId || this.getActiveSchoolId()).trim();
    const raw = localStorage.getItem(STORAGE_KEYS.CORRECTIVE_ACTIONS);
    if (!raw) return [];
    try {
      const all: CorrectiveAction[] = JSON.parse(raw);
      const today = getCairoCurrentDate();

      // Automatically flag overdue actions
      return all
        .filter(c => (c.schoolId || '').trim() === activeSchoolId)
        .map(action => {
          if (action.status !== 'Closed' && action.dueDate && action.dueDate < today) {
            return { ...action, status: 'Overdue' as CorrectiveActionStatus };
          }
          return action;
        });
    } catch {
      return [];
    }
  }

  public saveCorrectiveAction(
    action: Partial<CorrectiveAction>,
    user?: User | null
  ): { success: boolean; data?: CorrectiveAction; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();

    if (!action.description || !action.ownerEmployeeId || !action.dueDate) {
      return { success: false, message: 'يرجى ملء وصف الإجراء والمسؤول وتاريخ الاستحقاق.' };
    }

    const raw = localStorage.getItem(STORAGE_KEYS.CORRECTIVE_ACTIONS);
    let all: CorrectiveAction[] = [];
    try {
      all = raw ? JSON.parse(raw) : [];
    } catch {
      all = [];
    }

    const now = getCairoNowISO();
    const isNew = !action.id || !all.some(a => a.id === action.id);
    const employees = this.getEmployees();
    const owner = employees.find(e => e.id === action.ownerEmployeeId || e.employeeNumber === action.ownerEmployeeId);

    const record: CorrectiveAction = {
      id: action.id || `CA-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      schoolId: activeSchoolId,
      sourceType: action.sourceType || 'GENERAL',
      sourceId: action.sourceId || '',
      standardId: action.standardId,
      standardCode: action.standardCode,
      description: action.description.trim(),
      ownerEmployeeId: action.ownerEmployeeId,
      ownerName: action.ownerName || owner?.name || 'مسؤول غير محدد',
      dueDate: action.dueDate,
      status: action.status || 'Open',
      closedAt: action.closedAt,
      closureEvidence: action.closureEvidence,
      notes: action.notes,
      createdAt: action.createdAt || now,
      updatedAt: now,
    };

    const idx = all.findIndex(a => a.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
    } else {
      all.unshift(record);
    }

    localStorage.setItem(STORAGE_KEYS.CORRECTIVE_ACTIONS, JSON.stringify(all));
    this.logAudit(
      isNew ? 'CREATE_CORRECTIVE_ACTION' : 'UPDATE_QUALITY_REPORT',
      'QUALITY',
      `تسجيل إجراء تصحيحي جديد مسند إلى: ${record.ownerName} يستحق في ${record.dueDate}`
    );
    this.notifyChange();

    return {
      success: true,
      data: record,
      message: 'تم حفظ الإجراء التصحيحي بنجاح',
    };
  }

  public closeCorrectiveAction(
    id: string,
    closureEvidence: string,
    user?: User | null
  ): { success: boolean; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();

    const raw = localStorage.getItem(STORAGE_KEYS.CORRECTIVE_ACTIONS);
    if (!raw) return { success: false, message: 'الإجراء غير موجود' };
    try {
      const all: CorrectiveAction[] = JSON.parse(raw);
      const idx = all.findIndex(a => a.id === id && (a.schoolId || '').trim() === activeSchoolId);
      if (idx < 0) {
        return { success: false, message: 'الإجراء التصحيحي غير موجود أو يتبع مدرسة أخرى.' };
      }

      all[idx] = {
        ...all[idx],
        status: 'Closed',
        closureEvidence: closureEvidence || 'تم التحقق من إتمام الإجراء بنجاح',
        closedAt: getCairoNowISO(),
        updatedAt: getCairoNowISO(),
      };

      localStorage.setItem(STORAGE_KEYS.CORRECTIVE_ACTIONS, JSON.stringify(all));
      this.logAudit(
        'CLOSE_CORRECTIVE_ACTION',
        'QUALITY',
        `إغلاق الإجراء التصحيحي [${id}] مع توثيق أدلة الإغلاق: ${closureEvidence.substring(0, 50)}...`
      );
      this.notifyChange();

      return { success: true, message: 'تم إغلاق الإجراء التصحيحي بنجاح' };
    } catch {
      return { success: false, message: 'خطأ أثناء إغلاق الإجراء' };
    }
  }

  public approveDailyQualityReport(id: string, user?: User | null): { success: boolean; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();
    const list = this.getDailyQualityReports(activeSchoolId);
    const item = list.find((r) => r.id === id);
    if (!item) return { success: false, message: 'التقرير غير موجود' };
    item.status = 'Approved';
    item.approvedBy = caller?.fullName || caller?.name || 'مدير المدرسة';
    item.approvedAt = getCairoNowISO();
    item.updatedAt = getCairoNowISO();
    localStorage.setItem(STORAGE_KEYS.DAILY_QUALITY_REPORTS, JSON.stringify(list));
    this.logAudit('APPROVE_QUALITY_REPORT', 'QUALITY', `اعتماد تقرير الجودة اليومي: ${item.date}`);
    this.notifyChange();
    return { success: true, message: 'تم اعتماد تقرير الجودة بنجاح' };
  }

  public approveTeacherVisitReport(id: string, user?: User | null): { success: boolean; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();
    const list = this.getTeacherVisitReports(activeSchoolId);
    const item = list.find((r) => r.id === id);
    if (!item) return { success: false, message: 'التقرير غير موجود' };
    item.status = 'Approved';
    item.approvedBy = caller?.fullName || caller?.name || 'مدير المدرسة';
    item.approvedAt = getCairoNowISO();
    item.updatedAt = getCairoNowISO();
    localStorage.setItem(STORAGE_KEYS.TEACHER_VISIT_REPORTS, JSON.stringify(list));
    this.logAudit('APPROVE_QUALITY_REPORT', 'QUALITY', `اعتماد تقرير زيارة المعلم: ${item.teacherName}`);
    this.notifyChange();
    return { success: true, message: 'تم اعتماد تقرير الزيارة بنجاح' };
  }

  public approveComprehensiveEvaluation(id: string, user?: User | null): { success: boolean; message: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();
    const list = this.getComprehensiveEvaluations(activeSchoolId);
    const item = list.find((r) => r.id === id);
    if (!item) return { success: false, message: 'التقرير غير موجود' };
    item.status = 'Approved';
    item.approvedBy = caller?.fullName || caller?.name || 'مدير المدرسة';
    item.approvedAt = getCairoNowISO();
    item.updatedAt = getCairoNowISO();
    localStorage.setItem(STORAGE_KEYS.COMPREHENSIVE_EVALUATIONS, JSON.stringify(list));
    this.logAudit('APPROVE_QUALITY_REPORT', 'QUALITY', `اعتماد التقييم الشامل: ${item.targetEntityName || item.title}`);
    this.notifyChange();
    return { success: true, message: 'تم اعتماد التقييم الشامل بنجاح' };
  }

  public getQualityMetricOverview(schoolId?: string): QualityMetricOverview {
    const activeSchoolId = (schoolId || this.getActiveSchoolId()).trim();
    const daily = this.getDailyQualityReports(activeSchoolId);
    const visits = this.getTeacherVisitReports(activeSchoolId);
    const evals = this.getComprehensiveEvaluations(activeSchoolId);
    const actions = this.getCorrectiveActions(activeSchoolId);
    const standards = this.getQualityStandards(activeSchoolId);

    const avgDaily = daily.length > 0
      ? daily.reduce((acc, d) => acc + (d.percentage || (d.evaluations?.length ? this.calculateWeightedScore(d.evaluations, standards).percentage : 0)), 0) / daily.length
      : 0;

    const avgVisits = visits.length > 0
      ? visits.reduce((acc, v) => acc + (v.percentage || v.overallScore || 0), 0) / visits.length
      : 0;

    const avgEvals = evals.length > 0
      ? evals.reduce((acc, e) => acc + (e.percentage || e.weightedScore || 0), 0) / evals.length
      : 0;

    const totalCount = [daily.length, visits.length, evals.length].filter((c) => c > 0).length;
    const overall = totalCount > 0
      ? (avgDaily * (daily.length > 0 ? 1 : 0) +
         avgVisits * (visits.length > 0 ? 1 : 0) +
         avgEvals * (evals.length > 0 ? 1 : 0)) / totalCount
      : 0;

    const resolvedActions = actions.filter((a) => a.status === 'Closed' || a.status === ('RESOLVED' as any)).length;
    const resRate = actions.length > 0 ? (resolvedActions / actions.length) * 100 : 100;

    // Domain breakdown from standards
    const domainMap: Record<string, { totalPct: number; count: number }> = {};
    standards.forEach((std) => {
      if (!domainMap[std.domain]) {
        domainMap[std.domain] = { totalPct: 0, count: 0 };
      }
      domainMap[std.domain].count += 1;
    });

    // Compute estimated performance per domain based on all evaluations
    const domainAverages = Object.entries(domainMap).map(([domain, data]) => {
      // Find evaluations referencing standards in this domain
      const stdIdsInDomain = new Set(standards.filter((s) => s.domain === domain).map((s) => s.id));
      let sumPct = 0;
      let evalCount = 0;

      [...daily, ...visits, ...evals].forEach((report: any) => {
        const scores = report.standardScores || report.evaluations || [];
        scores.forEach((sc: any) => {
          if (stdIdsInDomain.has(sc.standardId)) {
            const std = standards.find((s) => s.id === sc.standardId);
            const scale = std?.evaluationScale || sc.maxScore || 4;
            const pct = Math.min(100, Math.max(0, (sc.score / scale) * 100));
            sumPct += pct;
            evalCount += 1;
          }
        });
      });

      return {
        domain,
        count: data.count,
        averagePercentage: evalCount > 0 ? Math.round(sumPct / evalCount) : 85,
      };
    });

    return {
      overallQualityScore: overall || 85,
      totalDailyReports: daily.length,
      averageDailyScore: avgDaily || 0,
      totalTeacherVisits: visits.length,
      averageTeacherVisitScore: avgVisits || 0,
      totalComprehensiveEvaluations: evals.length,
      averageComprehensiveScore: avgEvals || 0,
      totalActionsCount: actions.length,
      resolvedActionsCount: resolvedActions,
      actionsResolutionRate: resRate,
      domainAverages: domainAverages.length > 0 ? domainAverages : [
        { domain: 'البيئة المدرسية والسلامة', averagePercentage: 90, count: 4 },
        { domain: 'التعليم والتعلم والتدريس', averagePercentage: 86, count: 6 },
        { domain: 'القيادة والإدارة المدرسية', averagePercentage: 88, count: 5 },
        { domain: 'نواتج التعلم والتحصيل', averagePercentage: 82, count: 3 },
      ],
    };
  }

  public deleteCorrectiveAction(id: string, user?: User | null): { success: boolean; message?: string } {
    const caller = user || this.getCurrentUser();
    const activeSchoolId = (caller?.schoolId || this.getActiveSchoolId()).trim();
    const list = this.getCorrectiveActions(activeSchoolId).filter(a => a.id !== id);
    localStorage.setItem(STORAGE_KEYS.CORRECTIVE_ACTIONS, JSON.stringify(list));
    this.notifyChange();
    return { success: true, message: 'تم حذف الإجراء التصحيحي بنجاح' };
  }
}

export const storageService = new StorageService();

