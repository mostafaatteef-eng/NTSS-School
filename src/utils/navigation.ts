import { User } from '../types';
import { storageService } from '../services/storageService';

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
 * Resolves the primary landing route for any user based strictly on their role.
 * Guaranteed to point to a valid, accessible route for that role.
 */
export function resolveDefaultRouteForCurrentUser(user: User | null): string {
  if (!user) return 'dashboard';

  const role = (user.role || '').trim();

  switch (role) {
    case 'Admin':
    case 'SchoolDirector':
      return 'dashboard';
    case 'StudentAffairs':
      return 'students';
    case 'TeacherAffairs':
    case 'HR':
      return 'employees';
    case 'SocialSpecialist':
    case 'BehaviorOfficer':
      return 'behavior';
    case 'TrainingOfficer':
      return 'employees';
    case 'QualityOfficer':
      return 'dashboard';
    case 'Supervisor':
      return 'dashboard';
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
 * Strict Route Guard validation ensuring users never access forbidden tabs
 */
export function canAccessTab(user: User | null, rawTab: string): boolean {
  if (!user) return false;

  const tab = normalizeTab(rawTab);

  // SAMAT and Payroll modules are completely retired and decommissioned from the system
  if (tab === 'samat' || tab === 'payroll') {
    return false;
  }

  // Teacher is strictly forbidden from accessing any administrative ERP module
  if ((user.role as string) === 'Teacher') {
    return tab === 'teacher_portal';
  }

  // Dashboard is universally accessible to all authenticated administrative roles
  if (tab === 'dashboard') {
    return true;
  }

  const settings = storageService.getSettings();

  // Hide Teacher Portal and Parent Portals if their accounts/features are disabled
  if (tab === 'teacher_portal' && !settings.teacherAccountsEnabled && (user.role as string) !== 'Teacher') {
    return false;
  }
  if ((tab === 'parent_portal' || tab === 'parent_day_view') && !settings.parentAccountsEnabled && (user.role as string) !== 'Parent') {
    return false;
  }

  const role = (user.role || '').trim();

  // 1. Admin and School Director have access to all operational views
  if (role === 'Admin' || role === 'SchoolDirector') {
    // 2. Strict Admin-Only Modules (Forbidden to School Director & all other roles)
    const adminOnlyTabs = [
      'users',
      'settings',
      'operations',
      'audit',
      'master_data',
      'backup',
      'import_center',
      'system_health',
      'timetable_import',
      'timetable_settings',
      'timetable_supervision_locations',
    ];
    if (role !== 'Admin' && adminOnlyTabs.includes(tab)) {
      return false;
    }
    return true;
  }

  // Strict Admin-Only Modules check for all other non-admin roles
  const adminOnlyTabs = [
    'users',
    'settings',
    'operations',
    'audit',
    'master_data',
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

  // 3. Parent Role Isolation
  if (role === 'Parent') {
    return (
      tab === 'dashboard' ||
      tab === 'parent_day_view' ||
      tab === 'parent_portal' ||
      tab === 'student_schedule_access'
    );
  }

  // 4. Teacher Role Isolation
  if (role === 'Teacher') {
    return (
      tab === 'dashboard' ||
      tab === 'teacher_portal' ||
      tab === 'timetable' ||
      tab === 'timetable_weekly' ||
      tab === 'timetable_exams'
    );
  }

  // 5. Student Affairs Role Isolation
  if (role === 'StudentAffairs') {
    const allowed = [
      'dashboard',
      'students',
      'student_attendance',
      'behavior',
      'reports',
      'timetable',
      'timetable_weekly',
      'timetable_exams',
      'student_schedule_access',
    ];
    return allowed.includes(tab);
  }

  // 6. Teacher Affairs / HR Role Isolation
  if (role === 'TeacherAffairs' || role === 'HR') {
    const allowed = [
      'dashboard',
      'employees',
      'daily_attendance',
      'monthly_matrix',
      'annual_summary',
      'leaves',
      'reports',
      'timetable',
      'timetable_weekly',
      'timetable_load',
      'timetable_reserve',
      'timetable_supervision',
      'timetable_coverage',
      'timetable_reports',
      'timetable_exams',
    ];
    return allowed.includes(tab);
  }

  // 7. Social Specialist Role Isolation
  if (role === 'SocialSpecialist' || role === 'BehaviorOfficer') {
    const allowed = [
      'dashboard',
      'behavior',
      'students',
      'student_attendance',
      'reports',
      'timetable',
      'timetable_weekly',
    ];
    return allowed.includes(tab);
  }

  // 8. Training Officer
  if (role === 'TrainingOfficer') {
    const allowed = [
      'dashboard',
      'employees',
      'daily_attendance',
      'monthly_matrix',
      'leaves',
      'reports',
      'timetable',
      'timetable_weekly',
      'timetable_load',
    ];
    return allowed.includes(tab);
  }

  // 9. Quality Officer
  if (role === 'QualityOfficer') {
    const allowed = [
      'dashboard',
      'students',
      'student_attendance',
      'behavior',
      'employees',
      'daily_attendance',
      'monthly_matrix',
      'annual_summary',
      'leaves',
      'reports',
      'audit',
      'system_health',
      'timetable',
      'timetable_weekly',
      'timetable_coverage',
      'timetable_load',
      'timetable_reports',
    ];
    return allowed.includes(tab);
  }

  // 10. Supervisor (Legacy alias)
  if (role === 'Supervisor') {
    const allowed = [
      'dashboard',
      'students',
      'student_attendance',
      'behavior',
      'employees',
      'daily_attendance',
      'monthly_matrix',
      'reports',
      'timetable',
      'timetable_weekly',
      'timetable_coverage',
      'timetable_load',
      'timetable_reserve',
      'timetable_supervision',
      'timetable_exams',
      'timetable_reports',
    ];
    return allowed.includes(tab);
  }

  // 11. Viewer (Legacy alias)
  if (role === 'Viewer') {
    const allowed = ['dashboard', 'reports', 'timetable', 'timetable_weekly'];
    return allowed.includes(tab);
  }

  return false;
}
