import { User, PermissionKey } from '../types';
import { storageService } from '../services/storageService';
import { hasEffectivePermission } from './permissions';

/**
 * Normalizes any tab identifier, stripping URL hash, leading slashes, and parameters
 */
export function normalizeTab(rawTab?: string | null): string {
  if (!rawTab) return 'dashboard';
  let cleaned = rawTab.trim().replace(/^#+/, '').replace(/^\/+/, '');
  if (cleaned.includes('?')) {
    cleaned = cleaned.split('?')[0];
  }
  return cleaned || 'dashboard';
}

/**
 * Helper: Identifies if a user has the SystemAdmin role
 */
export function isSystemAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'SystemAdmin';
}

/**
 * Helper: Identifies if a user has the SchoolAdmin role
 */
export function isSchoolAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'SchoolAdmin';
}

/**
 * Helper: Identifies if a user has the Legacy Admin role
 */
export function isLegacyAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'Admin';
}

/**
 * Helper: Identifies if a user has the SchoolDirector role
 */
export function isSchoolDirector(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'SchoolDirector';
}

/**
 * Helper: Identifies if a user belongs to an administrative or staff role
 */
export function isAdministrativeRole(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = user.role;
  return (
    role === 'SystemAdmin' ||
    role === 'SchoolAdmin' ||
    role === 'Admin' ||
    role === 'SchoolDirector' ||
    role === 'StudentAffairs' ||
    role === 'TeacherAffairs' ||
    role === 'QualityOfficer' ||
    role === 'TrainingOfficer' ||
    role === 'SocialSpecialist' ||
    role === 'AdministrativeEmployee' ||
    role === 'HR' ||
    role === 'Supervisor' ||
    role === 'BehaviorOfficer'
  );
}

/**
 * Complete list of tabs that operate directly on school-scoped data.
 * Accessing these requires a concrete school context:
 * - SystemAdmin requires authoritative user.activeSchoolId
 * - SchoolAdmin requires authoritative user.schoolId
 */
export const SCHOOL_SCOPED_TABS: readonly string[] = [
  'students',
  'student_attendance',
  'employees',
  'daily_attendance',
  'monthly_matrix',
  'annual_summary',
  'leaves',
  'behavior',
  'timetable',
  'timetable_weekly',
  'timetable_load',
  'timetable_reserve',
  'timetable_supervision',
  'timetable_coverage',
  'timetable_reports',
  'timetable_exams',
  'timetable_import',
  'timetable_settings',
  'timetable_supervision_locations',
  'reports',
  'quality',
  'import_center',
  'student_schedule_access',
  'parent_portal',
  'parent_day_view',
  'teacher_portal',
];

/**
 * Identifies if a specific route/tab requires a bound or active school context.
 */
export function requiresSchoolContext(rawTab?: string | null): boolean {
  const tab = normalizeTab(rawTab);
  return SCHOOL_SCOPED_TABS.includes(tab);
}

/**
 * Canonical mapping between navigation tabs and canonical permission keys in src/utils/permissions.ts.
 */
export const TAB_PERMISSION_MAP: Record<string, PermissionKey | PermissionKey[]> = {
  students: 'students.view',
  student_attendance: 'studentAttendance.view',
  employees: ['employees.view', 'teachers.view'],
  daily_attendance: ['teacherAttendance.view', 'attendance.staff.view'],
  monthly_matrix: ['teacherAttendance.view', 'attendance.staff.view'],
  annual_summary: ['teacherAttendance.view', 'attendance.staff.view'],
  leaves: ['leaves.view', 'leaves.manage.view', 'leaves.own.view'],
  behavior: 'behavior.view',
  timetable: ['timetable.view', 'schedule.view'],
  timetable_weekly: ['timetable.view', 'schedule.view'],
  timetable_load: ['timetable.view', 'schedule.view'],
  timetable_reserve: ['timetable.view', 'schedule.view'],
  timetable_supervision: ['timetable.view', 'schedule.view'],
  timetable_coverage: ['timetable.view', 'schedule.view'],
  timetable_reports: ['timetable.view', 'schedule.view'],
  timetable_exams: ['timetable.view', 'schedule.view'],
  timetable_import: 'timetable.import',
  timetable_settings: 'timetable.manage',
  timetable_supervision_locations: 'timetable.manage',
  reports: 'reports.view',
  quality: 'quality.view',
  users: 'users.manage',
  settings: 'settings.manage',
  audit: 'audit.view',
  operations: 'settings.manage',
  master_data: 'schools.manage',
  schools: 'schools.manage',
  system_health: 'audit.view',
  backup: 'settings.manage',
  import_center: ['students.import', 'employees.import'],
  my_requests: ['leaves.own.create', 'leaves.own.view'],
  student_schedule_access: ['schedule.view', 'timetable.view'],
};

/**
 * Evaluates whether a user's permissions allow access to a specific tab.
 * Leverages the canonical hasEffectivePermission engine in src/utils/permissions.ts.
 */
export function hasTabPermission(user: User, tab: string): boolean {
  if (tab === 'dashboard') return true;
  if (tab === 'my_requests') {
    return hasEffectivePermission(user, 'leaves.own.create') || hasEffectivePermission(user, 'leaves.own.view');
  }

  const required = TAB_PERMISSION_MAP[tab];
  if (!required) return false;

  const requiredKeys = Array.isArray(required) ? required : [required];

  // If explicit user permissions array is present, it acts as an explicit capability filter
  if (Array.isArray(user.permissions)) {
    const hasExplicit = requiredKeys.some(perm => user.permissions!.includes(perm));
    if (!hasExplicit) {
      return false;
    }
  }

  // If explicit customPermissions map is present, respect explicit false denies
  if ((user as any).customPermissions && typeof (user as any).customPermissions === 'object') {
    const isExplicitlyDenied = requiredKeys.every(perm => (user as any).customPermissions[perm] === false);
    if (isExplicitlyDenied) {
      return false;
    }
  }

  if (Array.isArray(required)) {
    return required.some(perm => hasEffectivePermission(user, perm));
  }
  return hasEffectivePermission(user, required);
}

/**
 * Resolves the primary landing route for any user based strictly on their role.
 * Explicitly maps SystemAdmin and SchoolAdmin to 'dashboard'.
 * Guaranteed to point to a valid, accessible route for that role.
 */
export function resolveDefaultRouteForCurrentUser(user: User | null): string {
  if (!user) return 'dashboard';

  const role = (user.role || '').trim();

  switch (role) {
    case 'SystemAdmin':
      return 'dashboard';
    case 'SchoolAdmin':
      return 'dashboard';
    case 'Admin':
    case 'SchoolDirector':
    case 'Supervisor':
    case 'AdministrativeEmployee':
      return 'dashboard';
    case 'StudentAffairs':
      return 'students';
    case 'TeacherAffairs':
    case 'HR':
    case 'TrainingOfficer':
      return 'employees';
    case 'SocialSpecialist':
    case 'BehaviorOfficer':
      return 'behavior';
    case 'QualityOfficer':
      return 'quality';
    case 'Viewer':
      return 'reports';
    case 'Teacher':
      return 'teacher_portal';
    case 'Parent':
      return 'dashboard';
    default:
      return 'dashboard';
  }
}

/**
 * Clears any transient navigation cache, selected entity filters, or previous session navigation memory
 */
export function clearPreviousNavigationState(): void {
  try {
    sessionStorage.removeItem('ntss_active_tab');
    sessionStorage.removeItem('ntss_selected_student');
    sessionStorage.removeItem('ntss_selected_employee');
    sessionStorage.removeItem('ntss_selected_teacher');
    sessionStorage.removeItem('ntss_parent_selected_child');
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

/**
 * Strict Route Guard validation ensuring users never access forbidden tabs.
 * Enforces:
 * 1. Role boundaries & decommissioned modules
 * 2. Authoritative school context (Fail-Closed: SystemAdmin requires activeSchoolId, SchoolAdmin requires schoolId)
 * 3. Permission-driven capabilities via src/utils/permissions.ts
 */
export function canAccessTab(user: User | null, rawTab: string): boolean {
  if (!user) return false;

  const tab = normalizeTab(rawTab);

  // 1. SAMAT and Payroll modules are completely retired and decommissioned from the system
  if (tab === 'samat' || tab === 'payroll') {
    return false;
  }

  // 2. Teacher is strictly forbidden from accessing any administrative ERP module (except personal self-service requests)
  if (user.role === 'Teacher') {
    return tab === 'teacher_portal' || tab === 'my_requests';
  }

  // 3. Parent Role Isolation
  if (user.role === 'Parent') {
    return (
      tab === 'dashboard' ||
      tab === 'parent_day_view' ||
      tab === 'parent_portal' ||
      tab === 'student_schedule_access'
    );
  }

  // 4. Feature toggle guards
  const settings = storageService.getSettings();
  if (tab === 'teacher_portal' && !settings.teacherAccountsEnabled) {
    return false;
  }
  if ((tab === 'parent_portal' || tab === 'parent_day_view') && !settings.parentAccountsEnabled) {
    return false;
  }

  // 5. Dashboard is universally accessible to all authenticated administrative roles
  if (tab === 'dashboard') {
    return true;
  }

  // 6. Personal requests
  if (tab === 'my_requests') {
    return isAdministrativeRole(user);
  }

  // 7. Authoritative School Context Guard (Fail-Closed)
  // School-scoped routes require a concrete authoritative school context.
  // Strictly no fallback to BADR or localStorage authority.
  if (requiresSchoolContext(tab)) {
    if (isSystemAdmin(user)) {
      if (!user.activeSchoolId || !user.activeSchoolId.trim()) {
        return false;
      }
    } else if (isSchoolAdmin(user)) {
      const boundSchool = (user.schoolId || user.activeSchoolId || '').trim();
      if (!boundSchool) {
        return false;
      }
    }
  }

  // 8. Legacy Admin compatibility: full access to active modules
  if (isLegacyAdmin(user)) {
    return true;
  }

  // 9. SystemAdmin and SchoolAdmin: governed strictly by authoritative permissions
  if (isSystemAdmin(user) || isSchoolAdmin(user)) {
    return hasTabPermission(user, tab);
  }

  // 10. SchoolDirector: operational modules allowed, admin-only tabs strictly forbidden
  if (isSchoolDirector(user)) {
    const adminOnlyTabs = [
      'users',
      'settings',
      'operations',
      'audit',
      'master_data',
      'schools',
      'backup',
      'import_center',
      'system_health',
      'timetable_import',
      'timetable_settings',
      'timetable_supervision_locations',
    ];
    if (adminOnlyTabs.includes(tab)) {
      return false;
    }
    return hasTabPermission(user, tab);
  }

  // 11. Operational Staff Roles (StudentAffairs, TeacherAffairs, QualityOfficer, TrainingOfficer, SocialSpecialist, AdministrativeEmployee, etc.)
  // Evaluated via canonical permission engine
  return hasTabPermission(user, tab);
}
