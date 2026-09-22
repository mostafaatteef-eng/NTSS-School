export type AccessScope = 'GLOBAL' | 'SCHOOL' | 'SELF';

export type StaffRole =
  | 'SystemAdmin'
  | 'SchoolAdmin'
  | 'Admin'
  | 'SchoolDirector'
  | 'StudentAffairs'
  | 'TeacherAffairs'
  | 'SocialSpecialist'
  | 'TrainingOfficer'
  | 'QualityOfficer'
  | 'Teacher'
  | 'AdministrativeEmployee';

export const CANONICAL_STAFF_ROLES: StaffRole[] = [
  'SystemAdmin',
  'SchoolAdmin',
  'Admin',
  'SchoolDirector',
  'StudentAffairs',
  'TeacherAffairs',
  'SocialSpecialist',
  'TrainingOfficer',
  'QualityOfficer',
  'Teacher',
  'AdministrativeEmployee',
];

export type UserRole = StaffRole;

export interface ServerSession {
  sessionToken: string;
  userId: string;
  email: string;
  role: UserRole;
  accessScope: AccessScope;
  schoolId: string;
  allowedSchoolIds: string[];
  activeSchoolId: string;
  expiresAt: string;
}

// Legacy and Historical Roles for Audit, Archive, and Migration
export type LegacyUserRole =
  | StaffRole
  | 'HR'
  | 'Supervisor'
  | 'BehaviorOfficer'
  | 'Employee'
  | 'Viewer'
  | 'Teacher' // Historical archive only - forbidden from login
  | 'Parent'  // Historical archive only - forbidden from login
  | 'Student'; // Historical archive only - forbidden from login

/**
 * Normalizes legacy roles to the canonical Staff roles.
 * Throws ACCOUNT_ROLE_NOT_ALLOWED for retired non-staff roles.
 */
export function normalizeStaffRole(role: string): StaffRole {
  const r = (role || '').trim();
  if (r === 'Teacher' || r === 'Parent' || r === 'Student') {
    throw new Error('ACCOUNT_ROLE_NOT_ALLOWED');
  }
  if (r === 'SystemAdmin') return 'SystemAdmin';
  if (r === 'SchoolAdmin') return 'SchoolAdmin';
  if (r === 'Admin') return 'Admin';
  if (r === 'SchoolDirector' || r === 'Supervisor') return 'SchoolDirector';
  if (r === 'StudentAffairs') return 'StudentAffairs';
  if (r === 'TeacherAffairs' || r === 'HR' || r === 'Employee') return 'TeacherAffairs';
  if (r === 'SocialSpecialist' || r === 'BehaviorOfficer') return 'SocialSpecialist';
  if (r === 'TrainingOfficer') return 'TrainingOfficer';
  if (r === 'QualityOfficer' || r === 'Viewer') return 'QualityOfficer';
  throw new Error('INVALID_OR_UNSUPPORTED_ROLE');
}

export type PermissionKey =
  | 'students.view'
  | 'students.create'
  | 'students.edit'
  | 'students.delete'
  | 'students.import'
  | 'studentAttendance.view'
  | 'studentAttendance.create'
  | 'studentAttendance.edit'
  | 'studentAttendance.delete'
  | 'studentAttendance.manage'
  | 'teacherAttendance.view'
  | 'teacherAttendance.manage'
  | 'teacherAccounts.manage'
  | 'schoolAttendance.view'
  | 'schoolAttendance.create'
  | 'schoolAttendance.edit'
  | 'schoolAttendance.approve'
  | 'schoolAttendance.lock'
  | 'schoolAttendance.overrideLocked'
  | 'classAttendance.view'
  | 'classAttendance.create'
  | 'classAttendance.edit'
  | 'classAttendance.manageOwnLessons'
  | 'teacherPortal.access'
  | 'teacherSchedule.viewOwn'
  | 'schedule.view'
  | 'schedule.manage'
  | 'schedule.publish'
  | 'schedule.cancelLesson'
  | 'schedule.exportPdf'
  | 'schedule.manageSubstitution'
  | 'schedule.viewConflicts'
  | 'lessonContent.view'
  | 'lessonContent.create'
  | 'lessonContent.edit'
  | 'lessonContent.editOwn'
  | 'lessonContent.publish'
  | 'lessonResources.manage'
  | 'homework.create'
  | 'homework.editOwn'
  | 'homework.publish'
  | 'academicYears.view'
  | 'academicYears.create'
  | 'academicYears.edit'
  | 'academicYears.close'
  | 'academicYears.reopen'
  | 'studentPromotion.view'
  | 'studentPromotion.execute'
  | 'studentPromotion.rollback'
  | 'student360.view'
  | 'student360.viewAttendance'
  | 'student360.viewBehavior'
  | 'student360.viewParentCommunication'
  | 'student360.editNotes'
  | 'teachers.view'
  | 'teachers.create'
  | 'teachers.edit'
  | 'teachers.delete'
  | 'teachers.import'
  | 'teacherAttendance.view'
  | 'teacherAttendance.create'
  | 'teacherAttendance.edit'
  | 'teacherAttendance.delete'
  | 'leaves.view'
  | 'leaves.create'
  | 'leaves.edit'
  | 'leaves.delete'
  | 'behavior.view'
  | 'behavior.create'
  | 'behavior.edit'
  | 'behavior.delete'
  | 'behaviorCases.view'
  | 'behaviorCases.create'
  | 'behaviorCases.edit'
  | 'behaviorCases.close'
  | 'behaviorTypes.manage'
  | 'behaviorPoints.manage'
  | 'positiveBehavior.create'
  | 'parentCommunication.view'
  | 'parentCommunication.create'
  | 'settings.manage'
  | 'users.manage'
  | 'audit.view'
  | 'reports.view'
  | 'quality.view'
  | 'quality.create'
  | 'quality.evaluate'
  | 'quality.manageStandards'
  | 'quality.approve'
  | 'quality.viewDashboard';

export type AttendanceStatus =
  | 'حاضر'
  | 'متأخر'
  | 'غائب'
  | 'مأذونية'
  | 'إذن عمل'
  | 'إجازة'
  | 'عطلة أسبوعية'
  | 'راحة'
  | 'نصف يوم';

export type PermissionType =
  | 'إذن خروج'
  | 'إذن تأخير'
  | 'إذن انصراف مبكر'
  | 'إذن خلال اليوم'
  | 'أخرى';

export type AbsenceReasonCategory =
  | 'بدون إذن'
  | 'بعذر مقبول'
  | 'مرضي'
  | 'لم يحضر'
  | 'ظرف طارئ'
  | 'أخرى';

export type LeaveType =
  | 'سنوية'
  | 'اعتيادية'
  | 'مرضية'
  | 'طارئة'
  | 'عارضة'
  | 'بدون راتب'
  | 'رسمية'
  | 'أمومة/أبوة'
  | 'أخرى';

export type LeaveStatus = 'معلقة' | 'مقبولة' | 'مرفوضة';

/**
 * Multi-School Architecture: Public School definition exposed to Frontend.
 * Security Note: spreadsheetId is strictly hidden from frontend and exists only in Backend Master Registry.
 */
export interface School {
  schoolId: string;
  schoolCode: string;
  schoolName: string;
  status: 'Active' | 'Inactive';
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Backend Authoritative Master Registry Record (Backend only)
 */
export interface MasterSchoolRegistryRecord extends School {
  spreadsheetId: string;
}

export interface User {
  id: string;
  schoolId?: string;
  username: string;
  loginNumber?: number | string;
  fullName: string;
  name?: string; // compatibility alias for fullName
  role: UserRole | LegacyUserRole | 'Unknown';
  employeeId?: string;
  email?: string;
  password?: string; // write-only when creating/resetting
  passwordHash?: string;
  passwordSalt?: string;
  passwordAlgorithm?: string;
  passwordIterations?: number;
  passwordChangedAt?: string;
  passwordInitialized?: boolean;
  activationTokenHash?: string;
  activationExpiresAt?: string;
  activationTokenExpiresAt?: string;
  department?: string;
  isActive?: boolean;
  status?: 'Active' | 'Inactive' | 'Suspended';
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
  avatar?: string;
  pin?: string;
  studentIds?: string[];
  sessionToken?: string;
  sessionExpiresAt?: string;
  mustChangePassword?: boolean;
  permissions?: PermissionKey[];
}

export type EmployeeType = 'Teacher' | 'Administrative';

export interface Employee {
  id: string; // EMP001, EMP002, etc.
  employeeId?: string; // alias for id
  teacherId?: string; // alias for id if teacher
  employeeNumber?: string;
  name: string;
  fullName?: string; // alias for name
  nationalId?: string;
  
  // Phase 2 Active Model
  employeeType?: EmployeeType; // 'Teacher' | 'Administrative' (معلم | إداري)
  jobTitle: string;
  specialization?: string; // e.g. رياضيات، لغة إنجليزية، ذكاء اصطناعي، شؤون طلاب، موارد بشرية، حسابات
  
  // Retired fields for backward compatibility with historical spreadsheets/archives (Do NOT use in active UI/DTO)
  /** @deprecated Retired in Phase 2 - use employeeType & specialization */
  department?: string;
  /** @deprecated Retired in Phase 2 - forbidden from active UI/DTO/Cache/Export */
  basicSalary?: number;
  /** @deprecated Retired in Phase 2 - forbidden from active UI/DTO/Cache/Export */
  allowances?: number;
  /** @deprecated Retired in Phase 2 - forbidden from active UI/DTO/Cache/Export */
  salary?: number;

  hireDate?: string;
  workingHours?: number; // e.g. 8
  workStartTime?: string; // e.g. "07:30"
  workEndTime?: string; // e.g. "15:00"
  daysOff?: string[]; // e.g. ["Friday", "Saturday"] or ["الجمعة", "السبت"]
  status?: 'Active' | 'Inactive' | 'Suspended';
  phone?: string;
  email?: string;
  isTeacher?: boolean;
  isTeachingStaff?: boolean;
  teacherCode?: string;
  loginNumber?: number | string;
  teachingSubjects?: string[];
  assignedGrades?: string[];
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string; // YYYY-MM-DD
  dayName: string; // الأحد، الإثنين...
  checkIn: string; // "07:35" or ""
  checkOut: string; // "14:45" or ""
  workingHours: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeHours: number;
  status: AttendanceStatus;
  
  leaveType?: LeaveType | string;
  leaveStartDate?: string;
  leaveEndDate?: string;
  leaveDaysCount?: number;
  
  permissionType?: PermissionType | string;
  permissionFrom?: string;
  permissionTo?: string;
  permissionDurationMinutes?: number;
  
  absenceReasonCategory?: AbsenceReasonCategory | string;
  reason?: string;
  notes?: string;
  
  checkInTimestamp?: string;
  checkOutTimestamp?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface LeaveRecord {
  id: string;
  schoolId?: string;
  employeeId: string;
  employeeName?: string;
  department?: string;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  daysCount: number;
  status: LeaveStatus;
  reason?: string;
  notes?: string;
  attachment?: string;
  rejectionReason?: string;
  approvedBy?: string;
  createdAt?: string;
}

/* =========================================================================
 * 0. العام الدراسي والترم الدراسي (Academic Years & Terms Entities)
 * ========================================================================= */
export type AcademicYearStatus = 'Draft' | 'Active' | 'Closed' | 'Archived' | 'ACTIVE' | 'CLOSED';
export type TermStatus = 'Draft' | 'Active' | 'Closed' | 'ACTIVE' | 'CLOSED' | 'UPCOMING' | 'Draft';

export interface Term {
  id: string; // e.g. "TERM-2026-T1"
  academicYearId?: string; // e.g. "AY-2026-2027"
  name: string; // "الترم الأول" / "الترم الثاني"
  code?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: TermStatus;
  isCurrent?: boolean;
  order?: number;
}

export interface AcademicYear {
  id: string; // e.g. "AY-2026-2027"
  name: string; // "2026/2027"
  code?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: AcademicYearStatus;
  isActive?: boolean;
  isCurrent?: boolean;
  isDefault?: boolean;
  isLocked?: boolean;
  terms: Term[];
  createdAt?: string;
  createdBy?: string;
  closedAt?: string;
  closedBy?: string;
  closedNotes?: string;
  notes?: string;
}

/* =========================================================================
 * 1. بيانات الطلاب والفصول (Student & Classroom Management)
 * ========================================================================= */
export type StudentStatus = 'نشط' | 'موقوف' | 'منقول' | 'متخرج' | 'غير مقيد' | 'غير نشط';
export type Gender = 'ذكر' | 'أنثى';
export type StudentGender = 'ذكر' | 'أنثى' | 'Male' | 'Female' | 'غير محدد';
export type StudentReligion = 'مسلم' | 'مسيحي' | 'Muslim' | 'Christian' | 'غير محدد';
export type StudentEnrollmentState = 'مستجد' | 'باقي' | 'New' | 'Remaining' | 'غير محدد';

export function normalizeStudentGender(val?: any): 'ذكر' | 'أنثى' | 'غير محدد' {
  if (!val) return 'غير محدد';
  const s = String(val).trim().toLowerCase();
  if (s === 'ذكر' || s === 'male' || s === 'm') return 'ذكر';
  if (s === 'أنثى' || s === 'انثى' || s === 'female' || s === 'f') return 'أنثى';
  return 'غير محدد';
}

export function normalizeStudentReligion(val?: any): 'مسلم' | 'مسيحي' | 'غير محدد' {
  if (!val) return 'غير محدد';
  const s = String(val).trim().toLowerCase();
  if (s === 'مسلم' || s === 'muslim') return 'مسلم';
  if (s === 'مسيحي' || s === 'christian') return 'مسيحي';
  return 'غير محدد';
}

export function normalizeStudentEnrollmentState(val?: any): 'مستجد' | 'باقي' | 'غير محدد' {
  if (!val) return 'غير محدد';
  const s = String(val).trim().toLowerCase();
  if (s === 'مستجد' || s === 'new') return 'مستجد';
  if (s === 'باقي' || s === 'remaining') return 'باقي';
  return 'غير محدد';
}

export type EnrollmentStatus = 
  | 'نشط' 
  | 'مرقى' 
  | 'معيد' 
  | 'منقول' 
  | 'متخرج' 
  | 'موقوف' 
  | 'غير مستمر';

export interface StudentEnrollment {
  id: string; // "ENR-STU001-2026-2027"
  studentId: string; // "STU-000001" (Internal Fixed ID)
  studentCode?: string;
  studentName?: string;
  academicYearId: string; // "AY-2026-2027"
  academicYearName: string; // "2026/2027"
  termId?: string;
  gradeId?: string;
  grade: string; // "الصف الأول الثانوي"
  classroomId?: string;
  classroom: string; // "1/1"
  section?: string;
  stage?: string;
  enrollmentStatus?: EnrollmentStatus;
  status?: string;
  promotionStatus?: 'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'TRANSFERRED_OUT' | string;
  promotionNotes?: string;
  enrollmentDate: string;
  exitDate?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export type TransferType = 
  | 'نقل فصل' 
  | 'ترقية' 
  | 'إعادة صف' 
  | 'تحويل مدرسة' 
  | 'عودة' 
  | 'تغيير إداري';

export interface StudentTransferHistory {
  id: string; // "TRF-2026-0001"
  studentId: string;
  studentCode?: string;
  studentName?: string;
  academicYearId: string;
  fromGrade: string;
  fromClassroom: string;
  toGrade: string;
  toClassroom: string;
  transferType: TransferType;
  reason: string;
  transferDate: string;
  performedBy?: string;
  approvedBy?: string;
  notes?: string;
  createdAt: string;
}

export interface PromotionRule {
  id: string;
  sourceGrade?: string;
  fromGrade?: string;
  targetGrade?: string;
  toGrade?: string;
  ruleType?: 'AUTOMATIC_ALL' | 'MANUAL_SELECTION' | 'CONDITION_BASED' | string;
  isGraduation?: boolean;
  defaultAction?: 'ترقية للصف التالي' | 'إعادة نفس الصف' | 'تخرج' | 'نقل' | 'موقوف' | string;
  minAttendancePercentage?: number;
  minBehaviorScore?: number;
  isActive: boolean;
}

export interface Classroom {
  id: string; // CLS001
  classroomNumber: string; // "1", "2", "3", "4"
  displayName?: string; // "الصف الأول الثانوي - فصل 1"
  gradeId: string; // "G_SEC_1"
  gradeName: string; // "الصف الأول الثانوي"
  stageId?: string;
  stageName?: string;
  capacity?: number;
  status: 'Active' | 'Inactive';
  academicYear: string; // "2025/2026"
}

export interface Student {
  id: string; // Fixed immutable internal reference (e.g. STU-000001)
  studentId?: string; // Explicit alias for fixed ID
  studentCode: string; // Current school code (e.g. 2026-00154)
  schoolStudentCode?: string;
  name: string; // اسم الطالب رباعي
  nationalId?: string; // الرقم القومي
  gender: Gender | StudentGender;
  religion?: StudentReligion;
  studentStatus?: StudentEnrollmentState;
  birthDate?: string; // YYYY-MM-DD
  stage?: string; // المرحلة (ثانوي / إعدادي / ابتدائي)
  stageId?: string;
  grade: string; // الصف الدراسي (الصف الأول الثانوي...)
  gradeId?: string;
  gradeName?: string;
  classroom: string; // رقم الفصل أو اسم الفصل (1 أو فصل 1 أو 1/1)
  classroomId?: string;
  classroomNumber?: string;
  section?: string;
  academicYear?: string; // العام الدراسي (2025/2026)
  academicYearId?: string;
  status: StudentStatus;
  enrollmentDate?: string; // تاريخ الالتحاق
  phone?: string;
  
  // بيانات ولي الأمر
  parentId?: string; // معرف حساب ولي الأمر إن وجد
  parentName?: string;
  relationship?: string; // أب، أم، وصي
  parentPhone?: string;
  parentEmail?: string;
  address?: string;
  
  initialBehaviorScore?: number; // درجة السلوك الافتراضية
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/* =========================================================================
 * 2. حضور وغياب الطلاب (School Attendance & Class Attendance Separation)
 * ========================================================================= */
export type AttendanceDayStatus = 'Open' | 'UnderReview' | 'Approved' | 'Locked';

export interface AttendanceDay {
  id: string; // "DAY-2026-10-13" or "DAY-2026-10-13-AY1"
  date: string; // YYYY-MM-DD
  academicYearId: string;
  academicYearName?: string;
  termId?: string;
  termName?: string;
  dayName: string;
  status: AttendanceDayStatus;
  totalStudentsCount: number;
  recordedCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount?: number;
  unrecordedCount: number;
  openedAt?: string;
  openedBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  approvedBy?: string;
  approvedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
  lockNotes?: string;
  version?: number;
}

export type StudentAttendanceStatus =
  | 'حاضر'
  | 'متأخر'
  | 'غائب'
  | 'غائب بعذر'
  | 'غائب بدون عذر'
  | 'مأذون'
  | 'مريض'
  | 'نشاط / رحلة'
  | 'موقوف'
  | 'هروب'
  | 'لم يسجل'
  | 'عطلة'
  | string;

export interface StudentAttendanceRecord {
  id: string;
  studentId: string;
  studentCode?: string;
  studentName: string;
  enrollmentId?: string;
  academicYearId?: string;
  academicYearName?: string;
  termId?: string;
  termName?: string;
  stage: string;
  grade: string;
  gradeId?: string;
  classroom: string;
  classroomId?: string;
  date: string; // YYYY-MM-DD
  dayName: string;
  status: StudentAttendanceStatus;
  statusId?: string;
  checkInTime?: string; // HH:mm
  checkOutTime?: string; // HH:mm
  lateMinutes?: number;
  excused?: boolean;
  isExcused?: boolean;
  absenceReason?: string;
  absenceReasonId?: string;
  absenceReasonText?: string;
  absenceCategory?: string;
  notes?: string;
  source?: 'Manual' | 'Fingerprint' | 'Barcode' | 'TeacherApp' | 'AutoSystem';
  recordedBy?: string;
  recordedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  version?: number;
  isArchived?: boolean;
}

export type StudentSchoolAttendance = StudentAttendanceRecord;
export type SchoolAttendanceRecord = StudentAttendanceRecord;

export interface ClassAttendanceRecord {
  id: string; // "ATT-CLS-STU001-2026-10-13-P3"
  studentId: string;
  studentCode?: string;
  studentName?: string;
  enrollmentId?: string;
  scheduleItemId: string;
  lessonInstanceId?: string;
  academicYearId?: string;
  termId?: string;
  date: string; // YYYY-MM-DD
  periodId?: number;
  periodNumber?: number;
  subjectId?: string;
  subject: string;
  teacherId?: string;
  teacherName: string;
  grade: string;
  classroom: string;
  classroomId?: string;
  subjectName?: string;
  status: 'حاضر' | 'غائب' | 'متأخر' | 'مأذون' | 'خرج أثناء الحصة' | string;
  statusId?: string;
  lateMinutes?: number;
  notes?: string;
  mismatchFlag?: 'NONE' | 'SCHOOL_PRESENT_CLASS_ABSENT' | 'SCHOOL_ABSENT_CLASS_PRESENT';
  recordedBy?: string;
  recordedAt?: string;
  takenBy?: string;
  takenAt?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
}

export type ClassAttendance = ClassAttendanceRecord;

export interface AttendanceException {
  id: string;
  date: string;
  academicYearId?: string;
  studentId: string;
  studentName: string;
  studentCode?: string;
  grade: string;
  classroom: string;
  type:
    | 'MISMATCH_PRESENT_ABSENT'
    | 'MISMATCH_ABSENT_PRESENT'
    | 'UNRECORDED_SCHOOL'
    | 'REPEAT_UNEXCUSED_ABSENCE'
    | 'EXCESSIVE_LATENESS'
    | 'SCHOOL_ABSENT_CLASS_PRESENT'
    | 'SCHOOL_PRESENT_CLASS_ABSENT'
    | 'CLASS_TRUANCY';
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  description: string;
  periodNumber?: number;
  subject?: string;
  teacherName?: string;
  schoolStatus?: string;
  classStatus?: string;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

/* =========================================================================
 * 2.5 التواصل مع ولي الأمر (Parent Communication Log)
 * ========================================================================= */
export type CommunicationType = 
  | 'مكالمة هاتفية' 
  | 'مقابلة شخصية' 
  | 'رسالة SMS' 
  | 'WhatsApp' 
  | 'بريد إلكتروني' 
  | 'اجتماع رسمي' 
  | 'أخرى';

export interface ParentCommunicationLog {
  id: string;
  studentId: string;
  studentName?: string;
  parentId?: string;
  parentName: string;
  communicationType: CommunicationType;
  type?: string;
  date: string;
  time?: string;
  subject?: string;
  reason: string;
  details: string;
  result: string;
  nextAction?: string;
  followUpDate?: string;
  recordedBy?: string;
  performedBy?: string;
  performedByName?: string;
  createdAt: string;
  updatedAt?: string;
}

/* =========================================================================
 * 3. السلوك، الحالات والمخالفات المدرسية (Behavior Cases & Positive Points)
 * ========================================================================= */
export type BehaviorCaseStatus = 
  | 'New' 
  | 'Under Review' 
  | 'Parent Contact Required' 
  | 'Parent Contacted' 
  | 'Action Required' 
  | 'Monitoring' 
  | 'Resolved' 
  | 'Closed'
  | 'CLOSED'
  | string;

export interface BehaviorCase {
  id: string; // "CASE-B102"
  caseCode: string; // "B-102"
  caseNumber?: string;
  studentId: string;
  studentName: string;
  academicYearId?: string;
  termId?: string;
  grade: string;
  classroom: string;
  openedDate: string;
  openedBy?: string;
  status: BehaviorCaseStatus;
  severity: string;
  assignedTo: string;
  assignedToName: string;
  specialistName?: string;
  parentContacted?: boolean;
  summary: string;
  resolution?: string;
  resolutionSummary?: string;
  violationIds: string[];
  closedDate?: string;
  closedAt?: string;
  closedBy?: string;
  followups?: BehaviorFollowup[];
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BehaviorFollowup {
  id: string;
  caseId: string;
  date: string;
  time?: string;
  actionType: string;
  summary?: string;
  notes: string;
  performedBy: string;
  performedByName?: string;
  nextAction?: string;
  followUpDate?: string;
  status?: string;
  createdAt: string;
}

export interface PositiveBehaviorType {
  id: string;
  name: string;
  category: string;
  points: number; // +5, +10
  description?: string;
  icon?: string;
  isActive: boolean;
  sortOrder?: number;
}

export interface BehaviorScoreLedger {
  id: string;
  studentId: string;
  studentName?: string;
  type: 'credit' | 'debit' | 'POSITIVE' | 'RESTORE' | 'VIOLATION' | 'ADJUSTMENT' | string;
  sourceType: 'positive_behavior' | 'violation' | 'adjustment' | 'annual_reset' | string;
  sourceId?: string;
  points: number;
  pointsAwarded?: number;
  grade?: string;
  classroom?: string;
  balanceAfter?: number;
  academicYearId?: string;
  date: string;
  reason: string;
  createdBy?: string;
  recordedBy?: string;
  createdAt?: string;
}

/* =========================================================================
 * 3. السلوك والمخالفات المدرسية (Behavior & Violations)
 * ========================================================================= */
export type SeverityLevel =
  | 'بسيطة'
  | 'متوسطة'
  | 'شديدة'
  | 'خطيرة جداً'
  | 'الدرجة الأولى'
  | 'الدرجة الثانية'
  | 'الدرجة الثالثة'
  | 'الدرجة الرابعة'
  | string;

export interface BehaviorType {
  id: string; // BEH001
  name: string; // اسم المخالفة
  category: string; // سلوكية، أكاديمية، انضباط مدرسي
  description?: string;
  severity: SeverityLevel;
  points?: number; // عدد النقاط
  weight: number; // خصم نقاط السلوك (مثلاً 2، 5، 10)
  defaultAction?: string; // إجراء افتراضي (تنبيه شفوي، إنذار كتابي، استدعاء ولي أمر)
  notifyParent: boolean;
  requiresAdminReview: boolean;
  isActive: boolean;
  sortOrder?: number;
}

export interface BehaviorViolation {
  id: string;
  studentId: string;
  studentCode?: string;
  studentName: string;
  grade: string;
  classroom: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  behaviorTypeId?: string;
  violationTypeId?: string;
  violationName: string;
  severity?: SeverityLevel;
  degree?: string; // alias for severity
  pointsDeducted: number;
  recordedBy: string; // المعلم / المشرف
  subject?: string; // المادة أو الحصة إن وجدت
  description?: string;
  notes?: string;
  witnesses?: string; // الشهود
  actionTaken: string; // الإجراء المتخذ
  parentNotified: boolean;
  status: 'مسجلة' | 'قيد المراجعة' | 'معتمدة' | 'ملغاة' | 'قائمة' | string;
  createdAt: string;
}

export interface BehaviorScoreRule {
  initialScore: number; // 100
  minScore: number; // 0
  maxScore: number; // 100
  excellentThreshold: number; // 90
  goodThreshold: number; // 75
  warningThreshold: number; // 60
  dangerThreshold: number; // < 60
}

/* =========================================================================
 * 4. الجدول الدراسي والمحتوى التعليمي (Schedule & Lesson Content Engine)
 * ========================================================================= */
export interface TeacherProfile {
  id: string; // TP-EMP001
  employeeId: string;
  userId?: string;
  teacherCode?: string;
  specialization?: string;
  assignedGradeIds?: string[];
  assignedSubjectIds?: string[];
  maxWeeklyPeriods?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface TeacherSubject {
  id: string;
  teacherId: string;
  subjectId: string;
  academicYearId: string;
  gradeId?: string;
  isActive: boolean;
  createdAt?: string;
}

export type ScheduleItemStatus = 'Draft' | 'UnderReview' | 'Approved' | 'Published';

export interface ScheduleItem {
  id: string;
  academicYear?: string;
  academicYearId?: string;
  term?: string; // الترم الأول / الترم الثاني
  termId?: string;
  stage?: string;
  stageId?: string;
  grade: string;
  gradeId?: string;
  classroom: string;
  classroomId?: string;
  dayName?: string; // الأحد، الإثنين...
  dayOfWeek?: string; // 'الأحد' | 'الإثنين' | 'الثلاثاء' | 'الأربعاء' | 'الخميس' | string
  periodNumber: number; // رقم الحصة (1, 2, 3...)
  periodId?: number | string;
  startTime?: string; // "08:00"
  endTime?: string; // "08:45"
  subject: string; // الرياضيات، اللغة العربية...
  subjectId?: string;
  teacherId?: string; // Teacher / Employee ID
  employeeId?: string; // Registered Employee ID
  teacherName?: string;
  teacherCode?: string;
  loginNumber?: number | string;
  roomNumber?: string;
  room?: string;
  roomId?: string;
  locationId?: string;
  cycleWeek?: 'ALL' | 'A' | 'B';
  isLocked?: boolean;
  isSubstituted?: boolean;
  substituteTeacherName?: string;
  isCancelled?: boolean;
  validFrom?: string; // YYYY-MM-DD
  validTo?: string; // YYYY-MM-DD
  status?: ScheduleItemStatus;
  isActive?: boolean;
  notes?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  version?: number;
}

export type ClassPeriodSchedule = ScheduleItem;

export interface PublicClassScheduleLesson {
  dayOfWeek: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectName: string;
  teacherDisplayName: string;
  roomName: string;
}

export interface PublicClassScheduleDTO {
  gradeName: string;
  classroomName: string;
  schedule: PublicClassScheduleLesson[];
  lessons?: PublicClassScheduleLesson[];
}

export type SubstitutionStatus = 'Suggested' | 'Assigned' | 'Completed' | 'Cancelled';

export interface ScheduleSubstitution {
  id: string; // "SUB-2026-10-13-SCH01"
  academicYearId?: string;
  termId?: string;
  date: string; // YYYY-MM-DD
  scheduleItemId?: string;
  lessonInstanceId?: string;
  periodNumber: number;
  dayOfWeek: string;
  originalTeacherId: string;
  originalTeacherCode?: string;
  originalTeacherName: string;
  substituteTeacherId: string;
  substituteTeacherCode?: string;
  substituteTeacherName: string;
  subjectId?: string;
  subject?: string;
  subjectName?: string;
  gradeId?: string;
  grade?: string;
  gradeName?: string;
  classroomId?: string;
  classroom?: string;
  classroomName?: string;
  reasonId?: string;
  reason: string;
  reasonText?: string;
  notes?: string;
  status: SubstitutionStatus | string;
  assignedBy?: string;
  createdBy?: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  updatedAt?: string;
}

// ============================================================
// SCHOOL TIMETABLE / TEACHER LOAD / RESERVE / SUPERVISION
// ============================================================

export interface TeacherLoadPolicy {
  weeklyMinutesLimit: number; // 1500 (25h * 60)
  defaultPeriodMinutes: number; // 50
  weeklyPeriodLimit: number; // 30 (computed: floor(weeklyMinutesLimit / defaultPeriodMinutes))
  weekStartsOn: number; // 0 = Sunday
  reserveCountsTowardLoad: boolean; // true
  supervisionCountsTowardLoad: boolean; // false
  reserveResetMode: 'WEEKLY_QUERY';
  allowOverloadWithWarning: boolean; // true
}

export function computeWeeklyPeriodLimit(policy: { weeklyMinutesLimit: number; defaultPeriodMinutes: number }): number {
  if (!policy.defaultPeriodMinutes || policy.defaultPeriodMinutes <= 0) return 30;
  return Math.floor(policy.weeklyMinutesLimit / policy.defaultPeriodMinutes);
}

export const DEFAULT_TEACHER_LOAD_POLICY: TeacherLoadPolicy = {
  weeklyMinutesLimit: 1500,
  defaultPeriodMinutes: 50,
  weeklyPeriodLimit: 30,
  weekStartsOn: 0,
  reserveCountsTowardLoad: true,
  supervisionCountsTowardLoad: false,
  reserveResetMode: 'WEEKLY_QUERY',
  allowOverloadWithWarning: true,
};

export interface TeacherTeachingAssignment {
  id: string;
  teacherId: string;
  teacherCode?: string;
  teacherName?: string;
  subjectId: string;
  subjectName?: string;
  gradeId: string;
  gradeName?: string;
  classroomId: string;
  classroomName?: string;
  academicYearId: string;
  termId?: string;
  requiredPeriodsPerWeek: number;
  validFrom?: string;
  validTo?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CurriculumWeeklyRequirement {
  id: string;
  curriculumVersionId: string;
  academicYearId: string;
  gradeId: string;
  gradeName?: string;
  subjectId: string;
  subjectName?: string;
  requiredPeriodsPerWeek: number;
  cycleLengthWeeks?: number; // e.g. 2 for bi-weekly subjects
  requiredPeriodsPerCycle?: number; // e.g. 1 per 2 weeks
  isActive: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface ScheduleBreak {
  id: string;
  name: string;
  startTime: string; // e.g. "10:20"
  endTime: string; // e.g. "10:40"
  sortOrder: number;
  isActive: boolean;
}

export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'PREFERRED';

export interface TeacherAvailability {
  id?: string;
  teacherId: string;
  dayOfWeek: string; // e.g. "الأحد"
  periodNumber: number;
  availabilityStatus: AvailabilityStatus;
  notes?: string;
}

export interface SupervisionLocation {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

export type SupervisionType =
  | 'MORNING_ASSEMBLY'
  | 'BREAK'
  | 'DISMISSAL'
  | 'BUS'
  | 'HALLWAY'
  | 'EXAM'
  | 'GENERAL';

export type SupervisionMode = 'FULL_DAY' | 'TIME_SLOT';

export interface SupervisionAssignment {
  id: string;
  schoolId?: string;
  supervisionMode?: SupervisionMode; // 'FULL_DAY' | 'TIME_SLOT'
  teacherId: string;
  teacherCode?: string;
  teacherName?: string;
  academicYear?: string;
  date: string; // YYYY-MM-DD
  dayOfWeek?: string;
  periodNumber?: number;
  shift?: string;
  timeSlot?: string;
  startTime?: string;
  endTime?: string;
  locationId: string;
  locationName?: string;
  supervisionType?: SupervisionType;
  notes?: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  assignedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TeacherLessonResource {
  id: string;
  teacherId: string;
  subjectId: string;
  classroomId: string;
  gradeId?: string;
  academicYearId?: string;
  date?: string;
  periodNumber?: number;
  preparationUrl?: string; // Private: Teacher / Admin only
  presentationUrl?: string; // Student-visible if published
  studentResourceUrl?: string; // Student-visible if published
  teacherNotes?: string;
  visibility: 'Draft' | 'Published';
  createdAt?: string;
  updatedAt?: string;
}

export type ExamScheduleStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'CANCELLED' | 'Draft' | 'Approved' | 'Published' | 'Cancelled';

export interface TeacherAuthResult {
  success: boolean;
  teacherSessionToken?: string;
  expiresAt?: string;
  message?: string;
  code?: string;
  token?: string;
  employee?: Employee;
  teacher?: {
    teacherId: string;
    employeeId: string;
    teacherCode: string;
    teacherName: string;
    department?: string;
    teachingSubjects?: string[];
    weeklyPeriodLimit?: number;
  };
}

export interface ExamSchedule {
  id: string;
  academicYearId: string;
  academicYear?: string;
  termId?: string;
  term?: string;
  examType: 'MIDTERM' | 'FINAL' | 'MONTHLY_QUIZ' | 'PRACTICAL' | 'ORAL' | string;
  subjectId: string;
  subjectName?: string;
  gradeId: string;
  gradeName?: string;
  classroomId?: string;
  classroomName?: string;
  date: string; // YYYY-MM-DD
  examDate?: string;
  startTime: string; // "09:00"
  durationMinutes: number; // e.g. 90
  roomId?: string;
  roomName?: string;
  chiefInvigilatorId?: string;
  chiefInvigilatorName?: string;
  instructions?: string;
  createdBy?: string;
  status: ExamScheduleStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudentAccessToken {
  id: string;
  studentId: string;
  studentCode: string;
  token?: string; // Raw random token, returned ONCE upon generation for link/QR
  tokenHash?: string; // Cryptographic SHA-256 hash stored on server
  expiresAt?: string;
  revokedAt?: string;
  isActive: boolean;
  createdAt: string;
  lastAccessedAt?: string;
}

export interface SafeStudentProfile {
  id: string;
  studentCode: string;
  fullName: string;
  grade: string;
  classroom: string;
}

export interface TeacherSession {
  token?: string; // compatibility alias
  teacherId?: string; // compatibility alias
  teacherSessionToken: string;
  employeeId: string;
  teacherCode: string;
  teacherName: string;
  username: string;
  schoolId: string;
  department?: string;
  expiresAt: string;
  createdAt: string;
}

export interface TeacherPortalAccess {
  employeeId: string;
  teacherCode: string;
  teacherName: string;
  isActivated: boolean;
  lastLogin?: string;
}

export interface TeacherAccount {
  id: string;
  schoolId?: string;
  employeeId: string;
  teacherCode: string;
  teacherName: string;
  department?: string;
  username: string; // Case-insensitive unique
  usernameNormalized?: string;
  passwordHash?: string;
  passwordSalt?: string;
  passwordAlgorithm?: string;
  passwordIterations?: number;
  status: 'Active' | 'Suspended' | 'Disabled' | 'Inactive' | 'PasswordResetRequired' | 'Needs Setup';
  accountStatus?: 'Active' | 'Suspended' | 'Disabled' | 'Inactive' | 'PasswordResetRequired' | 'Needs Setup';
  isActive: boolean;
  mustChangePassword?: boolean;
  legacyPinRetired?: boolean;
  failedLoginAttempts: number;
  lockedUntil?: string | null;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt?: string;
  migrationVersion?: string;
  migratedAt?: string;
}

export interface TeacherLoadCalculation {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  department?: string;
  assignedPeriods: number; // Required by TeacherTeachingAssignments
  scheduledBasePeriods: number; // In active schedule
  reservePeriodsThisWeek: number; // Substitutions this week (Sunday -> Saturday)
  countedWeeklyPeriods: number; // scheduledBasePeriods + (reserveCountsTowardLoad ? reservePeriodsThisWeek : 0)
  remainingCapacity: number; // weeklyPeriodLimit - countedWeeklyPeriods
  supervisionCount: number; // Supervision shifts this week
  historicalReserveCount: number; // All-time reserve records
  countedWeeklyMinutes?: number; // countedWeeklyPeriods * defaultPeriodMinutes
  weeklyMinutesLimit?: number; // 1500 minutes
  defaultPeriodMinutes?: number; // 50 minutes
  weeklyPeriodLimit?: number; // 30 periods
  loadStatus: 'AVAILABLE' | 'NEAR_LIMIT' | 'FULL' | 'OVERLOAD';
  isOverloaded: boolean;
}

export interface CurriculumSubjectCoverage {
  subjectId: string;
  subjectName: string;
  requiredPeriods: number;
  scheduledPeriods: number;
  difference: number; // scheduled - required
  isBiWeekly?: boolean;
  cycleLengthWeeks?: number;
  status: 'COMPLETE' | 'DEFICIT' | 'SURPLUS';
}

export interface ClassroomCoverageReport {
  gradeId: string;
  gradeName: string;
  classroomId: string;
  classroomName: string;
  totalRequiredPeriods: number; // e.g. 39
  totalScheduledPeriods: number;
  difference: number;
  status: 'COMPLETE' | 'DEFICIT' | 'SURPLUS';
  subjectBreakdowns: CurriculumSubjectCoverage[];
}

export interface ReserveCandidate {
  teacher: Employee;
  teacherId?: string;
  teacherCode: string;
  basePeriods: number;
  reserveThisWeek: number;
  totalCounted: number;
  periodLimit: number;
  remainingCapacity: number;
  teachesSameSubject: boolean;
  historicalReserveCount: number;
  rankScore: number;
  status: 'ELIGIBLE' | 'NEAR_LIMIT' | 'NOT_ELIGIBLE';
  isEligible?: boolean;
  ineligibilityReason?: string;
}

export type ReserveSubstitutionAssignment = ScheduleSubstitution;
export type ReserveCandidateRecommendation = ReserveCandidate;

export interface TimetableImportRow {
  rowNumber: number;
  dayOfWeek: string;
  periodNumber: number;
  gradeName: string;
  classroomName: string;
  subjectName: string;
  teacherCode: string;
  teacherName?: string;
  roomName?: string;
  cycleWeek?: 'ALL' | 'A' | 'B';
  isValid: boolean;
  errors: string[];
  warnings: string[];
  resolvedTeacherId?: string;
  resolvedSubjectId?: string;
  resolvedGradeId?: string;
  resolvedClassroomId?: string;
  resolvedRoomId?: string;
}

export interface TimetableImportSummary {
  batchId: string;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  unknownTeacherCodes: string[];
  unknownSubjects: string[];
  unknownClassrooms: string[];
  conflictsFound: number;
  loadWarningsFound: number;
  rows: TimetableImportRow[];
}

export type LessonDeliveryStatus = 
  | 'Scheduled' 
  | 'InProgress'
  | 'Delivered' 
  | 'PartiallyDelivered'
  | 'Partially Delivered' 
  | 'Cancelled' 
  | 'Substituted' 
  | 'NotRecorded'
  | 'Not Recorded';

export interface LessonInstance {
  id: string;
  scheduleItemId: string;
  academicYearId?: string;
  academicYear?: string;
  termId?: string;
  term?: string;
  date: string; // YYYY-MM-DD
  periodNumber: number;
  periodId?: number | string;
  gradeId?: string;
  grade: string;
  classroomId?: string;
  classroom: string;
  subjectId?: string;
  subject: string;
  plannedTeacherId: string;
  plannedTeacherName?: string;
  actualTeacherId: string;
  actualTeacherName?: string;
  teacherId?: string; // compatibility
  teacherName?: string; // compatibility
  substitutionId?: string;
  deliveryStatus: LessonDeliveryStatus;
  status?: LessonDeliveryStatus;
  cancelReason?: string;
  partialReason?: string;
  startedAt?: string;
  completedAt?: string;
  recordedBy?: string;
  recordedAt?: string;
  lessonTitle?: string;
  lessonDescription?: string;
  bookPages?: string;
  homework?: string;
  links?: LessonLink[];
  createdAt?: string;
  updatedAt?: string;
}

export type ScheduleConflictType = 
  | 'TEACHER_DOUBLE_BOOKING' 
  | 'CLASSROOM_DOUBLE_BOOKING' 
  | 'ROOM_DOUBLE_BOOKING' 
  | 'MAX_SUBJECT_EXCEEDED'
  | 'SUBSTITUTE_TEACHER_CONFLICT';

export interface ScheduleConflict {
  type: ScheduleConflictType;
  severity: 'BLOCK' | 'WARNING';
  message: string;
  conflictingItemIds: string[];
  dayName: string;
  periodNumber: number;
}

export interface ScheduleConflictResult {
  hasConflicts: boolean;
  hasBlockingConflicts: boolean;
  hasWarnings: boolean;
  conflicts: ScheduleConflict[];
  messages: string[];
}

export interface LocationItem {
  id: string;
  name: string; // الفصل، المعمل، الملعب، الفناء، الممر، البوابة، الحافلة
  code?: string;
  type?: 'classroom' | 'lab' | 'sports' | 'outdoor' | 'bus' | 'other' | 'معمل' | 'ملعب' | 'مسرح' | 'مكتبة' | string;
  capacity?: number;
  isActive: boolean;
}

export interface ConflictRuleConfig {
  blockTeacherDoubleBooking?: boolean;
  preventTeacherDoubleBooking?: boolean;
  blockClassroomDoubleBooking?: boolean;
  preventRoomDoubleBooking?: boolean;
  preventStudentGroupDoubleBooking?: boolean;
  blockRoomDoubleBooking?: boolean;
  warnMaxDailySubjectLimit?: boolean;
  maxDailySubjectLimit?: number;
  maxTeacherDailyPeriods?: number;
  maxConsecutiveTeacherPeriods?: number;
  warnOnSubjectRepetitionPerDay?: boolean;
  warnOnHeavySubjectsInEndPeriods?: boolean;
  warnDuplicateSubjectPerDay?: boolean;
  maxSubjectPeriodsPerDay?: number;
}

export interface LessonLink {
  id: string;
  title: string;
  url: string;
  type: 'drive' | 'youtube' | 'pdf' | 'presentation' | 'assignment' | 'teams' | 'other';
}

export type LessonResourceType = 
  | 'PDF' 
  | 'Google Drive' 
  | 'YouTube' 
  | 'Presentation' 
  | 'Website' 
  | 'Assignment' 
  | 'Other';

export interface LessonResource {
  id: string;
  lessonContentId?: string;
  lessonInstanceId?: string;
  homeworkId?: string;
  title: string;
  resourceType: LessonResourceType | string;
  url: string;
  description?: string;
  displayOrder?: number;
  isVisibleToParent: boolean;
  isVisibleToStudent: boolean;
  createdAt: string;
}

export type LessonContentStatus = 'Draft' | 'Published' | 'Archived';

export interface LessonContent {
  id: string;
  lessonInstanceId?: string;
  scheduleItemId?: string;
  scheduleId?: string;
  academicYearId?: string;
  termId?: string;
  date: string; // YYYY-MM-DD
  periodNumber: number;
  teacherId: string;
  teacherName: string;
  subjectId?: string;
  subject: string;
  gradeId?: string;
  grade: string;
  classroomId?: string;
  classroom: string;
  title?: string;
  lessonTitle?: string; // alias
  lessonUnit?: string;
  lessonChapter?: string;
  summary?: string;
  summaryCovered?: string; // alias
  lessonDescription?: string;
  bookPages?: string;
  bookPageFrom?: number;
  bookPageTo?: number;
  learningObjectives?: string;
  notes?: string;
  internalNotes?: string;
  parentVisibleSummary?: string;
  isVisibleToParent?: boolean;
  hasHomework?: boolean;
  homework?: string;
  homeworkTitle?: string;
  homeworkDescription?: string;
  homeworkDueDate?: string;
  homeworkDueDays?: number;
  homeworkId?: string;
  status?: LessonContentStatus;
  resources?: LessonResource[];
  links?: LessonLink[];
  deliveryStatus?: LessonDeliveryStatus;
  publishedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
  version?: number;
}

export type HomeworkStatus = 'Draft' | 'Published' | 'Archived';
export type HomeworkSubmissionStatus = 'Assigned' | 'Submitted' | 'Graded' | 'Late' | 'Missing';

export interface Homework {
  id: string;
  lessonContentId?: string;
  lessonInstanceId?: string;
  scheduleItemId?: string;
  academicYearId?: string;
  termId?: string;
  teacherId: string;
  teacherName: string;
  subjectId?: string;
  subject: string;
  gradeId?: string;
  grade: string;
  classroomId?: string;
  classroom: string;
  targetStudentId?: string;
  title: string;
  description: string;
  instructions?: string;
  assignedDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  dueTime?: string; // "23:59"
  maxScore?: number;
  bookPages?: string;
  questions?: string;
  link?: string;
  links?: LessonLink[];
  attachmentUrl?: string;
  resources?: LessonResource[];
  status?: HomeworkStatus;
  isVisibleToParent?: boolean;
  isVisibleToStudent?: boolean;
  isArchived?: boolean;
  createdBy?: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

/* =========================================================================
 * 5. المرتبات والاستحقاقات (Payroll System)
 * ========================================================================= */
export type PayrollStatus = 'Draft' | 'UnderReview' | 'Approved' | 'Paid' | 'Locked';

export interface PayrollItem {
  id: string;
  employeeId: string;
  type: 'allowance' | 'incentive' | 'overtime' | 'deduction' | 'absence' | 'late' | 'loan' | 'other';
  title: string;
  amount: number;
  notes?: string;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  month: number; // 1 - 12
  year: number; // 2026
  
  // الاستحقاقات
  basicSalary: number;
  allowances: number;
  incentives: number;
  bonuses?: number;
  overtimeHours: number;
  overtimeAmount: number;
  totalGross: number; // إجمالي المستحقات
  grossSalary?: number; // alias for totalGross
  
  // الاستقطاعات
  absentDaysCount: number;
  absenceDeductions: number;
  absenceDeduction?: number;
  totalLateMinutes: number;
  lateDeductions: number;
  lateDeduction?: number;
  loanDeductions: number;
  otherDeductions: number;
  totalDeductions: number; // إجمالي الاستقطاعات
  
  // الصافي
  netSalary: number;
  
  status: PayrollStatus;
  approvedBy?: string;
  paidDate?: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PayrollRule {
  workDaysPerMonth: number; // 26 أو 30 يوم
  calculationMethod: 'calendar_days' | 'work_days' | 'fixed_30';
  absenceDeductionMultiplier: number; // 1 = يوم، 1.5 = يوم ونصف
  lateMinuteDeductionRate: number; // معامل خصم الدقيقة
  lateGraceMinutes: number; // 15 دقيقة سماح
  overtimeRate: number; // 1.5
  maxOvertimeHoursPerMonth: number; // 40 ساعة
  enableSocialInsuranceDeduction: boolean;
  socialInsuranceRate: number; // %
}

/* =========================================================================
 * 6. الإعدادات المدرسية والنظام (Central Settings)
 * ========================================================================= */
export interface DepartmentItem {
  id: string;
  name: string;
  managerName?: string;
  description?: string;
  isActive: boolean;
}

export interface JobTitleItem {
  id: string;
  title: string;
  departmentId: string;
  departmentName?: string;
  isTeachingStaff: boolean;
  description?: string;
  isActive: boolean;
}

export interface GradeItem {
  id: string;
  name: string;
  shortName: string;
  order: number;
  isActive: boolean;
  academicStage: string;
  stageId?: string;
}

export interface ClassroomItem {
  id: string;
  gradeId: string;
  gradeName?: string;
  classroomNumber: string;
  displayName: string;
  capacity: number;
  academicYear: string;
  isActive: boolean;
}

export interface SubjectItem {
  id: string;
  name: string;
  shortName: string;
  color?: string;
  assignedGrades: string[]; // grade IDs or Grade Names
  weeklyPeriods?: number;
  isActive: boolean;
}

export interface SchedulePeriodItem {
  periodNumber: number;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isBreak?: boolean;
}

export interface ScheduleBreakItem {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleConfig {
  studyDays: string[]; // ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"]
  periodCount: number; // 7 or 8
  dayStartTime: string; // "08:00"
  dayEndTime: string; // "14:30"
  defaultPeriodDurationMinutes: number; // 50
  periods: SchedulePeriodItem[];
  breakTimes: ScheduleBreakItem[];
  breaks?: ScheduleBreak[];
  nonStudyDays: string[]; // ["الجمعة", "السبت"]
  periodTimes?: Array<{ startTime: string; endTime: string }>;
  teacherLoadPolicy?: TeacherLoadPolicy;
  weekStartsOn?: number; // 0 = Sunday
}

export interface StudentAttendanceStatusConfig {
  id: string;
  name: string;
  shortCode: string; // e.g. "ح", "ت", "غ", "ع", "م", "هـ"
  color: string;
  textColor?: string;
  badgeBg?: string;
  countsAsPresent: boolean;
  countsAsAbsent: boolean;
  isExcused?: boolean;
  requiresReason: boolean;
  requiresTime: boolean;
  displayOrder?: number;
  scope?: 'School' | 'Class' | 'Both';
  isActive: boolean;
}

export interface AbsenceReasonItem {
  id: string;
  name: string;
  category: 'مرضي' | 'عائلي' | 'طارئ' | 'إذن مسبق' | 'أخرى';
  isExcused: boolean;
  requiresDocument?: boolean;
  isActive: boolean;
}

export interface StudentAttendanceRules {
  startTime: string; // "07:30" or "08:00"
  gracePeriodMinutes: number; // 15
  lateThresholdMinutes: number; // 30
  lateCalculationMode?: 'from_start' | 'after_grace'; // from_start (e.g. 08:16 -> 16m) or after_grace (08:16 -> 1m)
  allowManualTime?: boolean;
  allowRetroactiveEntry?: boolean;
  maxRetroactiveDays?: number;
  allowFutureEntry?: boolean;
  autoSuggestStatus?: boolean;
  requireAbsenceReason?: boolean;
  missingRecordOnApproval?: 'block' | 'convertToAbsent' | 'allowNotRecorded';
  allowTeacherTakeAttendance: boolean;
  allowTeacherEditAttendance: boolean;
  requireStudentAffairsApproval: boolean;
  allowPastDaysEdit: boolean;
  maxPastDaysEditLimit: number; // 3 days
  absenceWarningThresholdDays: number; // 5 days
  lateWarningThresholdCount: number; // 3 times
}

export interface TeacherAttendanceRules {
  workStartTime: string; // "07:30"
  workEndTime: string; // "14:30"
  gracePeriodMinutes: number; // 15
  standardDailyHours: number; // 7
  workDays: string[];
  weekendDays: string[];
  lateDeductionMultiplier: number; // 1.0
  earlyLeaveDeductionMultiplier: number; // 1.0
  overtimeRate: number; // 1.5
  allowRetroactiveAttendance: boolean;
  maxRetroactiveDays: number; // 2
}

export interface BehaviorLevelItem {
  id: string;
  name: string;
  minPercentage: number;
  maxPercentage: number;
  color: string;
  badgeColor?: string;
  description?: string;
  actionRequired?: string;
}

export interface AlertRuleItem {
  id: string;
  title: string;
  category: 'student_absence' | 'student_late' | 'behavior_points' | 'teacher_lesson_delay' | 'teacher_late' | 'payroll_closing';
  thresholdValue: number;
  unitText: string;
  targetRoles: (UserRole | LegacyUserRole)[];
  isActive: boolean;
  messageTemplate: string;
}

export interface LeaveTypeConfig {
  id: string;
  name: string;
  isPaid: boolean;
  deductFromBalance: boolean;
  defaultAnnualQuota: number;
  requiresApproval: boolean;
  color?: string;
  isActive: boolean;
}

export interface PermissionTypeConfig {
  id: string;
  name: string;
  maxHoursPerMonth: number;
  isPaid: boolean;
  requiresApproval: boolean;
  isActive: boolean;
}

export interface AllowanceTypeItem {
  id: string;
  name: string;
  defaultAmount: number;
  isTaxable: boolean;
  isActive: boolean;
}

export interface DeductionTypeItem {
  id: string;
  name: string;
  defaultAmount: number;
  isPercentage: boolean;
  isActive: boolean;
}

export interface ParentPortalSettings {
  showAttendance: boolean;
  showCheckInTime: boolean;
  showCheckOutTime: boolean;
  showLateMinutes: boolean;
  showAttendanceRate: boolean;
  showAbsenceReason: boolean;
  showClassAttendance: boolean;
  showBehavior: boolean;
  showBehaviorPoints: boolean;
  showBehaviorScore: boolean;
  showPositiveBehavior: boolean;
  showBehaviorCaseStatus: boolean;
  showViolationDescription: boolean;
  showTeacherName: boolean;
  showSubstituteTeacherName: boolean;
  showLessonContent: boolean;
  showHomework: boolean;
  showLearningLinks: boolean;
  showWeeklySchedule: boolean;
  homeworkUpcomingDays: number;
  enableNotifications: boolean;
  notifyOnAbsence: boolean;
  notifyOnLate: boolean;
  notifyOnHomework: boolean;
  notifyOnBehaviorViolation: boolean;
  notifyOnPositiveBehavior: boolean;
  notifyOnScheduleSubstitution: boolean;
}

export interface TeacherPortalSettings {
  allowTakeAttendance: boolean;
  allowEditAttendance: boolean;
  editTimeLimitHours: number;
  allowRecordViolation: boolean;
  allowViewBehaviorHistory: boolean;
  allowAddLessonAfterPeriod: boolean;
  allowEditPastLessons: boolean;
}

export interface SocialSpecialistSettings {
  canCreateViolation: boolean;
  canEditViolation: boolean;
  canDeleteViolation: boolean;
  canAdjustPoints: boolean;
  canManageViolationCatalog: boolean;
  canViewStudentAttendance: boolean;
  canAddFollowUpNotes: boolean;
}

export interface ImportSettings {
  requireStudentId: boolean;
  requireNationalId: boolean;
  requireParentPhone: boolean;
  duplicateDetectionMethod: 'studentCode' | 'nationalId' | 'nameAndGrade';
  autoUpdateExisting: boolean;
}

export interface ExportSettings {
  showLogo: boolean;
  schoolTitle: string;
  subHeader: string;
  footerText: string;
  paperSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  showPrintDate: boolean;
  showPrintedBy: boolean;
  tableFormat: 'compact' | 'standard' | 'relaxed';
  schedulePdf: {
    orientation: 'portrait' | 'landscape';
    showTeacherName: boolean;
    showTimes: boolean;
    showRoomNumber: boolean;
    showAcademicYear: boolean;
  };
}

export interface DashboardSettings {
  roleWidgets: Record<
    string,
    {
      showAttendanceSummary: boolean;
      showLateList: boolean;
      showBehaviorSummary: boolean;
      showSchedule: boolean;
      showRecentLessons: boolean;
      showPayrollSummary: boolean;
      showQuickActions: boolean;
    }
  >;
}

export interface AcademicStage {
  id: string;
  name: string; // ابتدائي، إعدادي، ثانوي
  grades: {
    id: string;
    name: string; // الصف الأول...
    classrooms: string[]; // [1/1, 1/2, 1/3]
  }[];
}

export interface SchoolHoliday {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  affectsAbsenceCalculation: boolean;
  notes?: string;
}

export interface PermissionMatrix {
  canViewStudents: boolean;
  canEditStudents: boolean;
  canImportStudents: boolean;
  canTakeStudentAttendance: boolean;
  canEditStudentAttendance: boolean;
  canCreateViolation: boolean;
  canApproveViolation: boolean;
  canViewPayroll: boolean;
  canProcessPayroll: boolean;
  canApprovePayroll: boolean;
  canManageSchedule: boolean;
  canAddLessonContent: boolean;
  canViewParentPortal: boolean;
  canManageSettings: boolean;
  canViewAuditLogs: boolean;
}

export interface FeeCategoryItem {
  id: string;
  name: string;
  defaultAmount: number;
  gradeIds?: string[];
  isMandatory: boolean;
  frequency?: 'Annual' | 'Semester' | 'Monthly' | 'OneTime';
  dueDate?: string;
  description?: string;
  isActive: boolean;
  isRecurring?: boolean;
  allowInstallments?: boolean;
  isRefundable?: boolean;
}

export interface PaymentInstallmentPlan {
  id: string;
  name: string;
  installmentsCount: number;
  distributionPercentages: number[];
  dueMonths: string[];
  latePenaltyPercentage: number;
  discountEarlyPaymentPercentage: number;
  isActive: boolean;
}

export interface PaymentMethodConfig {
  id: string;
  name: string;
  type?: string;
  accountNumber?: string;
  bankName?: string;
  serviceFeePercentage?: number;
  requiresReferenceNumber?: boolean;
  requiresTransactionNumber?: boolean;
  isActive: boolean;
}

export type PayrollRulesConfig = PayrollRule;
export type PeriodSlot = SchedulePeriodItem;
export type ScheduleBreakTime = ScheduleBreakItem;

export interface SystemSettings {
  // المدرسة والهوية
  schoolName: string;
  shortSchoolName?: string;
  companyName?: string; // Compatibility
  schoolAddress?: string;
  schoolPhone?: string;
  schoolPhones?: string[];
  schoolEmail?: string;
  schoolWebsite?: string;
  schoolLogo?: string;
  logoUrl?: string;
  schoolCode?: string;
  currentSemester?: string;
  currentAcademicYear: string; // "2025/2026"
  currentTerm: string; // "الترم الأول"
  academicYearStartDate?: string;
  academicYearEndDate?: string;
  country: string; // "مصر"
  currency: string; // "ج.م"
  currencyLabel?: string;
  timeZone: string; // "Africa/Cairo"
  defaultLanguage: string; // "العربية"
  dateFormat?: string; // "YYYY-MM-DD"
  
  // الحضور المصري
  officialStartTime: string; // "07:30"
  officialEndTime: string; // "14:30"
  gracePeriodMinutes: number; // 15
  standardDailyHours: number; // 7
  weekendDays: string[]; // ["الجمعة", "السبت"]
  lateCalculationMode?: 'from_start' | 'after_grace'; // Mode A (default): from official start; Mode B: after grace period
  
  // الإجازات
  annualLeaveAllowance: number;
  sickLeaveAllowance: number;
  emergencyLeaveAllowance: number;
  
  // الهيكل المدرسي والقوائم الديناميكية
  stages: AcademicStage[];
  grades: GradeItem[];
  classrooms: ClassroomItem[];
  subjects: SubjectItem[];
  departments: DepartmentItem[];
  jobTitles: JobTitleItem[];
  holidays: SchoolHoliday[];
  academicYears?: AcademicYear[];
  promotionRules?: PromotionRule[];
  positiveBehaviorTypes?: PositiveBehaviorType[];
  locations?: LocationItem[];
  conflictRules?: ConflictRuleConfig;
  attendanceLockPolicy?: {
    allowAutoAbsentOnApproval: boolean;
    allowTeacherEditAfterLockWithPermission: boolean;
    maxDaysRetroactiveApproval: number;
  };
  
  // الحضور والسلوك
  scheduleConfig?: ScheduleConfig;
  studentAttendanceStatuses: StudentAttendanceStatusConfig[];
  studentAttendanceRules: StudentAttendanceRules;
  teacherAttendanceRules: TeacherAttendanceRules;
  behaviorScoreRules: BehaviorScoreRule;
  behaviorLevels: BehaviorLevelItem[];
  alertRules: AlertRuleItem[];
  
  // الإجازات والأذونات
  leaveTypes: LeaveTypeConfig[];
  permissionTypes: PermissionTypeConfig[];
  
  // المرتبات والرسوم والأقساط (Legacy / Optional)
  payrollRules?: PayrollRule;
  allowanceTypes?: AllowanceTypeItem[];
  deductionTypes?: DeductionTypeItem[];
  feeCategories?: FeeCategoryItem[];
  installmentPlans?: PaymentInstallmentPlan[];
  paymentMethods?: PaymentMethodConfig[];
  
  // بوابات المستخدمين (Legacy / Optional)
  parentPortalSettings?: ParentPortalSettings;
  teacherPortalSettings?: TeacherPortalSettings;
  socialSpecialistSettings?: SocialSpecialistSettings;
  
  // الاستيراد والتصدير
  importSettings: ImportSettings;
  exportSettings: ExportSettings;
  dashboardSettings?: DashboardSettings;
  
  // الصلاحيات لكل دور
  rolePermissions?: Record<UserRole, PermissionMatrix>;
  
  // الربط السحابي
  googleSheetsUrl?: string;
  googleAppsScriptUrl?: string;
  googleSheetWebAppUrl?: string;
  spreadsheetId?: string;
  autoCalculateStatus: boolean;
  autoSyncIntervalMinutes: number;
  enableAuditLog: boolean;
  
  // الإصدار والمزامنة
  configVersion: string;
  lastConfigUpdate: string;

  // إعدادات النطاق الجديد - نظام الإدارة المدرسية وفريق العمل فقط (Staff-Only ERP Feature Flags)
  studentAccountsEnabled?: boolean; // false
  parentAccountsEnabled?: boolean; // false
  teacherAccountsEnabled?: boolean; // false
  schoolScheduleEnabled?: boolean; // false
  samatSchedulingEnabled?: boolean; // false
  samatSessionAttendanceEnabled?: boolean; // false

  // إعدادات منظومة سمات لبناء الشخصية (SAMAT Phase 1)
  samatSettings?: {
    enabled: boolean;
    pilotMode: boolean;
    defaultAcademicYearId?: string;
    allowParentView: boolean;
    allowStudentView: boolean;
    requireEvidenceForOfficialAssessment: boolean;
    confidentialMentoringEnabled: boolean;
    configVersion: string;
    lastUpdated: string;
  };
}

/* =========================================================================
 * 7. سجلات المراقبة وحالات المزامنة (Audit Logs & Sync)
 * ========================================================================= */
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  username?: string;
  userRole?: UserRole;
  performedBy?: string;
  action: string;
  entity?:
    | 'ATTENDANCE'
    | 'EMPLOYEE'
    | 'STUDENT'
    | 'STUDENT_ATTENDANCE'
    | 'CLASS_ATTENDANCE'
    | 'ATTENDANCE_DAY'
    | 'BEHAVIOR'
    | 'SCHEDULE'
    | 'LESSON'
    | 'PAYROLL'
    | 'LEAVE'
    | 'USER'
    | 'TEACHER_ACCOUNT'
    | 'SETTINGS'
    | 'AUTH'
    | 'IMPORT'
    | 'SYNC'
    | 'SAMAT_PROGRAM'
    | 'SAMAT_ROLE_ASSIGNMENT'
    | 'SAMAT_MIGRATION'
    | 'SAMAT_SECURITY'
    | 'SAMAT_ASSESSMENT'
    | 'QUALITY';
  targetEntity?: string;
  targetId?: string;
  details: string;
  oldValue?: string;
  newValue?: string;
}

export type AuditLog = AuditLogEntry;

export interface MonthSummaryItem {
  employeeId: string;
  employeeName: string;
  department: string;
  totalDays: number;
  presentDays: number;
  lateDays: number;
  totalLateMinutes: number;
  absentDays: number;
  leaveDays: number;
  weekendDays: number;
  totalWorkingHours: number;
  totalOvertimeHours: number;
  attendanceRate: number;
}

export interface AnnualSummaryItem {
  employeeId: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  hireDate: string;
  totalWorkDaysExpected: number;
  totalPresent: number;
  totalLateCount: number;
  totalLateMinutes: number;
  totalAbsent: number;
  totalLeaves: number;
  annualLeavesUsed: number;
  sickLeavesUsed: number;
  totalHoursWorked: number;
  attendanceRate: number;
}

export interface SyncStatus {
  lastSyncTime: string | null;
  status: 'idle' | 'syncing' | 'success' | 'error' | 'session_expired';
  errorMessage?: string;
  syncedRecordsCount?: number;
  connectedToGoogleSheets: boolean;
  hasPendingChanges?: boolean;
}

export type SyncState = SyncStatus;

// Re-export extended modern entities
export * from './types_extended';
export * from './types_quality';

export type TeacherAccountSafeDTO = Omit<TeacherAccount, 'passwordHash' | 'passwordSalt' | 'passwordAlgorithm' | 'passwordIterations'>;

export interface SaveDailyStudentAttendanceBatchRequest {
  action: 'saveDailyStudentAttendanceBatch';
  sessionToken?: string;
  date: string;
  gradeId?: string;
  classroomId?: string;
  records: Array<{
    id?: string;
    studentId: string;
    studentName: string;
    grade?: string;
    classroom?: string;
    date: string;
    dayName?: string;
    status: StudentAttendanceStatus;
    checkInTime?: string;
    lateMinutes?: number;
    notes?: string;
    absenceReason?: string;
  }>;
}

export interface SaveDailyStaffAttendanceBatchRequest {
  action: 'saveDailyStaffAttendanceBatch' | 'saveDailyTeacherAttendanceBatch';
  sessionToken?: string;
  date: string;
  records: Array<{
    id?: string;
    employeeId: string;
    employeeName: string;
    department?: string;
    date: string;
    dayName?: string;
    status: AttendanceStatus;
    checkIn?: string;
    checkOut?: string;
    lateMinutes?: number;
    notes?: string;
    leaveType?: string;
    permissionType?: string;
  }>;
}

// ============================================================================
// CURRICULUM PLANS & DISTRIBUTION TYPES (PHASE 4)
// ============================================================================

export type CurriculumPlanStatus = 'Draft' | 'Approved' | 'Archived';
export type CurriculumDistributionStatus = 'Planned' | 'Delivered' | 'Deferred' | 'Cancelled';

export interface CurriculumPlanItem {
  id: string;
  planId: string;
  week: number;
  unit: string;
  lessonTitle: string;
  objectives?: string;
  resources?: string;
  assessment?: string;
  estimatedPeriods: number;
  notes?: string;
  order: number;
}

export interface CurriculumPlanFileMeta {
  fileId: string; // opaque Google Drive reference ID
  fileName: string;
  mimeType: string;
  fileSize?: number;
  uploadedAt: string;
  version: number;
}

export interface CurriculumMasterPlan {
  id: string;
  schoolId: string;
  academicYear: string;
  term: string; // 'الفصل الدراسي الأول' | 'الفصل الدراسي الثاني'
  grade: string;
  gradeId?: string;
  subject: string;
  subjectId?: string;
  version: number;
  status: CurriculumPlanStatus;
  uploadedBy: string; // userId or employeeId
  uploadedByName?: string;
  uploadedAt: string;
  updatedAt: string;
  fileMeta?: CurriculumPlanFileMeta;
  items: CurriculumPlanItem[];
}

export interface CurriculumLessonDistribution {
  id: string;
  schoolId: string;
  planId: string;
  planItemId: string;
  scheduleItemId?: string; // Links to ScheduleItem
  teacherId: string;
  teacherName?: string;
  grade: string;
  classroom: string;
  subject: string;
  dayOfWeek: string;
  periodNumber: number;
  targetDate?: string; // YYYY-MM-DD
  status: CurriculumDistributionStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurriculumProgressSummary {
  totalItems: number;
  plannedCount: number;
  deliveredCount: number;
  deferredCount: number;
  cancelledCount: number;
  unassignedCount: number;
  completionRate: number;
}

// ============================================================================
// QUALITY ASSURANCE & ETQAN STANDARDS TYPES (PHASE 5)
// ============================================================================

export type QualityApplicableTo = 'DAILY_REPORT' | 'TEACHER_VISIT' | 'COMPREHENSIVE_EVALUATION';

export interface QualityStandard {
  id: string;
  schoolId: string;
  code: string;
  domain: string;
  standard: string;
  indicator: string;
  description: string;
  weight: number; // e.g., 1 to 100
  evaluationScale: number; // e.g., 4 (1-4) or 5 (1-5) or 100
  evidenceRequired: boolean;
  applicableTo: QualityApplicableTo[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CorrectiveActionStatus =
  | 'Open'
  | 'In Progress'
  | 'Closed'
  | 'Overdue'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'OVERDUE';
export type CorrectiveActionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CorrectiveAction {
  id: string;
  schoolId: string;
  sourceType: 'DAILY_REPORT' | 'TEACHER_VISIT' | 'COMPREHENSIVE_EVALUATION' | 'GENERAL';
  sourceId: string;
  standardId?: string;
  standardCode?: string;
  title?: string;
  description: string;
  ownerEmployeeId: string;
  ownerName?: string;
  assignedToName?: string;
  dueDate: string; // YYYY-MM-DD
  priority?: CorrectiveActionPriority;
  status: CorrectiveActionStatus;
  closedAt?: string;
  resolvedAt?: string;
  closureEvidence?: string;
  resolutionNotes?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IndicatorEvaluation {
  standardId: string;
  indicatorCode?: string;
  indicatorText?: string;
  score: number; // Raw score on the standard's evaluationScale
  weight?: number;
  evidence?: string;
  comment?: string;
}

export interface StandardScore {
  standardId: string;
  standardCode: string;
  score: number;
  maxScore: number;
  weight: number;
  notes?: string;
}

export interface DomainScore {
  domain: string;
  earnedScore: number;
  totalScore: number;
  weight: number;
  percentage: number;
}

export type QualityReportStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'RequiresRevision'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REQUIRES_REVISION';
export type EvaluationScope = 'SCHOOL_WIDE' | 'DEPARTMENT' | 'GRADE_LEVEL';
export type VisitType = 'DIAGNOSTIC' | 'DEVELOPMENTAL' | 'EVALUATIVE' | 'FOLLOW_UP';

export interface DailyQualityReport {
  id: string;
  schoolId: string;
  date: string; // YYYY-MM-DD
  reportDate?: string;
  evaluatorId: string;
  evaluatorName: string;
  evaluatorRole?: string;
  domain?: string;
  evaluations: IndicatorEvaluation[];
  standardScores?: StandardScore[];
  totalScore?: number;
  earnedScore?: number;
  percentage?: number;
  observations?: string;
  strengths: string[];
  improvementAreas: string[];
  positiveObservations?: string[];
  recommendations?: string[];
  executiveSummary?: string;
  generalNotes?: string;
  correctiveActionsSummary?: string;
  correctiveActionOwnerId?: string;
  correctiveActionDueDate?: string;
  correctiveActionCreatedId?: string;
  evidenceNotes?: string;
  status: QualityReportStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherVisitReport {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName?: string;
  date?: string; // YYYY-MM-DD
  visitDate?: string;
  period?: number;
  periodNumber?: number;
  visitType?: VisitType;
  classroom: string;
  subject: string;
  grade?: string;
  lessonTopic?: string;
  visitorId?: string;
  visitorName?: string;
  visitorRole?: string;
  evaluatorId?: string;
  evaluatorName?: string;
  evaluations: IndicatorEvaluation[];
  standardScores?: StandardScore[];
  totalScore?: number;
  earnedScore?: number;
  percentage?: number;
  strengths: string[];
  weaknesses?: string[];
  improvementAreas: string[];
  recommendations?: string[];
  teacherFeedback?: string;
  correctiveActionNotes?: string;
  followUpDate?: string;
  overallScore?: number; // Calculated weighted percentage
  status: QualityReportStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComprehensiveEvaluation {
  id: string;
  schoolId: string;
  title?: string;
  academicYear?: string;
  term?: string;
  evaluationDate?: string;
  scope?: EvaluationScope;
  targetType: 'SCHOOL' | 'DEPARTMENT' | 'TEACHER' | 'GENERAL';
  targetId?: string;
  targetName?: string;
  targetEntityName?: string;
  periodLabel: string; // e.g. "الفصل الدراسي الأول 2026/2027"
  startDate?: string;
  endDate?: string;
  evaluatorId?: string;
  evaluatorName?: string;
  leadEvaluatorId?: string;
  leadEvaluatorName?: string;
  committeeMembers?: string[];
  evaluations: IndicatorEvaluation[];
  standardScores?: StandardScore[];
  domainScores?: DomainScore[];
  rawScoreTotal?: number;
  weightedScore?: number; // 0 - 100% computed strictly using standard weights & scales
  totalScore?: number;
  earnedScore?: number;
  percentage?: number;
  strengths: string[];
  improvementAreas: string[];
  areasForImprovement?: string[];
  strategicRecommendations?: string[];
  status: QualityReportStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualityMetricOverview {
  overallQualityScore: number;
  totalDailyReports: number;
  averageDailyScore: number;
  totalTeacherVisits: number;
  averageTeacherVisitScore: number;
  totalComprehensiveEvaluations: number;
  averageComprehensiveScore: number;
  totalActionsCount: number;
  resolvedActionsCount: number;
  actionsResolutionRate: number;
  domainAverages: {
    domain: string;
    averagePercentage: number;
    count: number;
  }[];
}

