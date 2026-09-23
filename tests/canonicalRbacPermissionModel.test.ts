import { describe, it, expect } from 'vitest';
import {
  CANONICAL_STAFF_ROLES,
  CanonicalStaffRole,
  StaffRole,
  User,
  normalizeStaffRole,
} from '../src/types';
import {
  ROLE_DISPLAY_NAMES,
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
} from '../src/utils/permissions';
import { ROLE_LABELS } from '../src/utils/localization';
import { DEFAULT_PERMISSION_MATRIX } from '../src/data/initialData';

describe('RBAC Phase 1 - Canonical Role & Permission Model', () => {
  const EXPECTED_CANONICAL_ROLES: CanonicalStaffRole[] = [
    'SystemAdmin',
    'SchoolAdmin',
    'SchoolDirector',
    'StudentAffairs',
    'TeacherAffairs',
    'QualityOfficer',
    'TrainingOfficer',
    'SocialSpecialist',
    'Teacher',
    'AdministrativeEmployee',
  ];

  const EXPECTED_ARABIC_LABELS: Record<CanonicalStaffRole, string> = {
    SystemAdmin: 'مدير النظام المركزي',
    SchoolAdmin: 'مدير إدارة المدرسة',
    SchoolDirector: 'مدير المدرسة',
    StudentAffairs: 'شؤون الطلاب',
    TeacherAffairs: 'شؤون المعلمين والعاملين',
    QualityOfficer: 'مسؤول الجودة',
    TrainingOfficer: 'مسؤول التدريب والتوجيه المهني',
    SocialSpecialist: 'الأخصائي الاجتماعي',
    Teacher: 'معلم',
    AdministrativeEmployee: 'موظف إداري',
  };

  it('all canonical roles exist and contain exactly the 10 canonical roles', () => {
    expect(CANONICAL_STAFF_ROLES).toHaveLength(10);
    EXPECTED_CANONICAL_ROLES.forEach((role) => {
      expect(CANONICAL_STAFF_ROLES).toContain(role);
    });
    // Legacy 'Admin' must NOT be in canonical staff roles
    expect(CANONICAL_STAFF_ROLES).not.toContain('Admin');
  });

  it('all canonical roles have correct Arabic labels in ROLE_LABELS', () => {
    EXPECTED_CANONICAL_ROLES.forEach((role) => {
      expect(ROLE_LABELS[role]).toBe(EXPECTED_ARABIC_LABELS[role]);
    });
  });

  it('all canonical roles have correct Arabic labels in ROLE_DISPLAY_NAMES', () => {
    EXPECTED_CANONICAL_ROLES.forEach((role) => {
      expect(ROLE_DISPLAY_NAMES[role]).toBe(EXPECTED_ARABIC_LABELS[role]);
    });
  });

  it('permission matrix contains every canonical role', () => {
    EXPECTED_CANONICAL_ROLES.forEach((role) => {
      expect(DEFAULT_ROLE_PERMISSIONS[role]).toBeDefined();
      expect(typeof DEFAULT_ROLE_PERMISSIONS[role]).toBe('object');
      expect(DEFAULT_PERMISSION_MATRIX[role]).toBeDefined();
      expect(typeof DEFAULT_PERMISSION_MATRIX[role]).toBe('object');
    });
  });

  it('no canonical role is missing from role dictionaries', () => {
    EXPECTED_CANONICAL_ROLES.forEach((role) => {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_DISPLAY_NAMES[role]).toBeTruthy();
      expect(DEFAULT_ROLE_PERMISSIONS[role]).toBeTruthy();
      expect(DEFAULT_PERMISSION_MATRIX[role]).toBeTruthy();
    });
  });

  it('SystemAdmin can manage schools and system', () => {
    const sysAdmin: User = {
      id: 'sys-admin-1',
      username: 'sysadmin',
      fullName: 'مدير النظام المركزي',
      role: 'SystemAdmin',
    };

    expect(hasPermission(sysAdmin, 'schools.manage')).toBe(true);
    expect(hasPermission(sysAdmin, 'schools.view')).toBe(true);
    expect(hasPermission(sysAdmin, 'users.manage')).toBe(true);
    expect(hasPermission(sysAdmin, 'users.manageRoles')).toBe(true);
    expect(hasPermission(sysAdmin, 'settings.manage')).toBe(true);
    expect(hasPermission(sysAdmin, 'reports.view')).toBe(true);
  });

  it('SchoolAdmin cannot manage schools globally', () => {
    const schoolAdmin: User = {
      id: 'school-admin-1',
      username: 'schadmin',
      fullName: 'مدير إدارة المدرسة',
      role: 'SchoolAdmin',
    };

    expect(hasPermission(schoolAdmin, 'schools.manage')).toBe(false);
    expect(hasPermission(schoolAdmin, 'schools.view')).toBe(true);
    expect(hasPermission(schoolAdmin, 'users.manage')).toBe(true);
    expect(hasPermission(schoolAdmin, 'users.manageRoles')).toBe(true);
    expect(hasPermission(schoolAdmin, 'students.view')).toBe(true);
    expect(hasPermission(schoolAdmin, 'students.create')).toBe(true);
  });

  it('Teacher cannot manage users or schools', () => {
    const teacher: User = {
      id: 'teacher-1',
      username: 'teacher1',
      fullName: 'معلم تجريبي',
      role: 'Teacher',
    };

    expect(hasPermission(teacher, 'users.manage')).toBe(false);
    expect(hasPermission(teacher, 'users.manageRoles')).toBe(false);
    expect(hasPermission(teacher, 'users.view')).toBe(false);
    expect(hasPermission(teacher, 'users.create')).toBe(false);
    expect(hasPermission(teacher, 'users.edit')).toBe(false);
    expect(hasPermission(teacher, 'users.disable')).toBe(false);
    expect(hasPermission(teacher, 'users.resetPassword')).toBe(false);
    expect(hasPermission(teacher, 'schools.manage')).toBe(false);

    // Self-scope permissions
    expect(hasPermission(teacher, 'teacherPortal.access')).toBe(true);
    expect(hasPermission(teacher, 'teacherSchedule.viewOwn')).toBe(true);
    expect(hasPermission(teacher, 'leaves.own.view')).toBe(true);
    expect(hasPermission(teacher, 'leaves.own.create')).toBe(true);
  });

  it('AdministrativeEmployee cannot manage users or schools', () => {
    const adminEmp: User = {
      id: 'admin-emp-1',
      username: 'adminemp1',
      fullName: 'موظف إداري تجريبي',
      role: 'AdministrativeEmployee',
    };

    expect(hasPermission(adminEmp, 'users.manage')).toBe(false);
    expect(hasPermission(adminEmp, 'users.manageRoles')).toBe(false);
    expect(hasPermission(adminEmp, 'users.view')).toBe(false);
    expect(hasPermission(adminEmp, 'users.create')).toBe(false);
    expect(hasPermission(adminEmp, 'users.edit')).toBe(false);
    expect(hasPermission(adminEmp, 'users.disable')).toBe(false);
    expect(hasPermission(adminEmp, 'users.resetPassword')).toBe(false);
    expect(hasPermission(adminEmp, 'schools.manage')).toBe(false);

    // Self-scope permissions
    expect(hasPermission(adminEmp, 'leaves.own.view')).toBe(true);
    expect(hasPermission(adminEmp, 'leaves.own.create')).toBe(true);
  });

  it('QualityOfficer cannot manage users', () => {
    const qualityOfficer: User = {
      id: 'quality-officer-1',
      username: 'qualityofficer',
      fullName: 'مسؤول الجودة تجريبي',
      role: 'QualityOfficer',
    };

    expect(hasPermission(qualityOfficer, 'users.manage')).toBe(false);
    expect(hasPermission(qualityOfficer, 'users.manageRoles')).toBe(false);
    expect(hasPermission(qualityOfficer, 'users.create')).toBe(false);
    expect(hasPermission(qualityOfficer, 'users.edit')).toBe(false);
    expect(hasPermission(qualityOfficer, 'users.disable')).toBe(false);
    expect(hasPermission(qualityOfficer, 'users.resetPassword')).toBe(false);
    expect(hasPermission(qualityOfficer, 'schools.manage')).toBe(false);

    // Quality duties
    expect(hasPermission(qualityOfficer, 'quality.view')).toBe(true);
    expect(hasPermission(qualityOfficer, 'quality.evaluate')).toBe(true);
    expect(hasPermission(qualityOfficer, 'quality.manageStandards')).toBe(true);
    expect(hasPermission(qualityOfficer, 'reports.view')).toBe(true);
  });

  it('SchoolDirector cannot manage roles by default', () => {
    const schoolDirector: User = {
      id: 'director-1',
      username: 'director',
      fullName: 'مدير المدرسة تجريبي',
      role: 'SchoolDirector',
    };

    expect(hasPermission(schoolDirector, 'users.manageRoles')).toBe(false);
    expect(hasPermission(schoolDirector, 'schools.manage')).toBe(false);
    expect(hasPermission(schoolDirector, 'students.view')).toBe(true);
    expect(hasPermission(schoolDirector, 'schedule.manage')).toBe(true);
    expect(hasPermission(schoolDirector, 'reports.view')).toBe(true);
  });

  it('Legacy roles remain preserved for backward compatibility', () => {
    const legacyAdmin: User = {
      id: 'legacy-admin',
      username: 'admin',
      fullName: 'مدير النظام السابق',
      role: 'Admin',
    };

    // Legacy Admin maintains full bypass
    expect(hasPermission(legacyAdmin, 'schools.manage')).toBe(true);
    expect(hasPermission(legacyAdmin, 'users.manageRoles')).toBe(true);

    // Legacy normalizations
    expect(normalizeStaffRole('Admin')).toBe('Admin');
    expect(normalizeStaffRole('Supervisor')).toBe('SchoolDirector');
    expect(normalizeStaffRole('HR')).toBe('TeacherAffairs');
    expect(normalizeStaffRole('Employee')).toBe('TeacherAffairs');
    expect(normalizeStaffRole('Viewer')).toBe('QualityOfficer');
    expect(normalizeStaffRole('BehaviorOfficer')).toBe('SocialSpecialist');
    expect(normalizeStaffRole('Teacher')).toBe('Teacher');
    expect(normalizeStaffRole('AdministrativeEmployee')).toBe('AdministrativeEmployee');
  });
});
