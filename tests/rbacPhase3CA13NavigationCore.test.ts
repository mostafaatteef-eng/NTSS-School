import { describe, it, expect, beforeEach } from 'vitest';
import {
  canAccessTab,
  resolveDefaultRouteForCurrentUser,
  requiresSchoolContext,
  isSystemAdmin,
  isSchoolAdmin,
  isLegacyAdmin,
  isAdministrativeRole,
  normalizeTab,
} from '../src/utils/navigation';
import { User } from '../src/types';
import { ACTIVE_SCHOOL_KEY } from '../src/services/migrationScope014MultiSchool';

describe('PHASE 3C-A13.1 — CANONICAL NAVIGATION CORE', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // -------------------------------------------------------------
  // 1. DEFAULT ROUTES RESOLUTION
  // -------------------------------------------------------------
  describe('1. Default Routes Resolution', () => {
    it('SystemAdmin resolves explicitly to dashboard', () => {
      const user: User = { id: 'u-sys', username: 'sysadmin', fullName: 'مدير النظام الشامل', role: 'SystemAdmin' };
      expect(resolveDefaultRouteForCurrentUser(user)).toBe('dashboard');
    });

    it('SchoolAdmin resolves explicitly to dashboard', () => {
      const user: User = { id: 'u-sch', username: 'schadmin', fullName: 'مدير المدرسة', role: 'SchoolAdmin' };
      expect(resolveDefaultRouteForCurrentUser(user)).toBe('dashboard');
    });

    it('Legacy Admin resolves to dashboard without regression', () => {
      const user: User = { id: 'u-adm', username: 'admin', fullName: 'مدير عام', role: 'Admin' };
      expect(resolveDefaultRouteForCurrentUser(user)).toBe('dashboard');
    });

    it('Staff roles resolve to their designated landing tabs', () => {
      expect(resolveDefaultRouteForCurrentUser({ id: 'u1', username: 'sa', fullName: 'SA', role: 'StudentAffairs' })).toBe('students');
      expect(resolveDefaultRouteForCurrentUser({ id: 'u2', username: 'ta', fullName: 'TA', role: 'TeacherAffairs' })).toBe('employees');
      expect(resolveDefaultRouteForCurrentUser({ id: 'u3', username: 'hr', fullName: 'HR', role: 'HR' })).toBe('employees');
      expect(resolveDefaultRouteForCurrentUser({ id: 'u4', username: 'qo', fullName: 'QO', role: 'QualityOfficer' })).toBe('quality');
      expect(resolveDefaultRouteForCurrentUser({ id: 'u5', username: 'so', fullName: 'SO', role: 'SocialSpecialist' })).toBe('behavior');
      expect(resolveDefaultRouteForCurrentUser({ id: 'u6', username: 'to', fullName: 'TO', role: 'TrainingOfficer' })).toBe('employees');
      expect(resolveDefaultRouteForCurrentUser({ id: 'u7', username: 'ae', fullName: 'AE', role: 'AdministrativeEmployee' })).toBe('dashboard');
      expect(resolveDefaultRouteForCurrentUser({ id: 'u8', username: 'tc', fullName: 'TC', role: 'Teacher' })).toBe('teacher_portal');
    });
  });

  // -------------------------------------------------------------
  // 2. ADMIN ROLE HELPERS
  // -------------------------------------------------------------
  describe('2. Admin Role Helpers', () => {
    it('correctly identifies SystemAdmin, SchoolAdmin, and Legacy Admin', () => {
      const sysAdmin: User = { id: 'u1', username: 'sys', fullName: 'Sys', role: 'SystemAdmin' };
      const schoolAdmin: User = { id: 'u2', username: 'sch', fullName: 'Sch', role: 'SchoolAdmin' };
      const legacyAdmin: User = { id: 'u3', username: 'adm', fullName: 'Adm', role: 'Admin' };
      const teacher: User = { id: 'u4', username: 'tch', fullName: 'Tch', role: 'Teacher' };

      expect(isSystemAdmin(sysAdmin)).toBe(true);
      expect(isSystemAdmin(schoolAdmin)).toBe(false);
      expect(isSystemAdmin(legacyAdmin)).toBe(false);

      expect(isSchoolAdmin(schoolAdmin)).toBe(true);
      expect(isSchoolAdmin(sysAdmin)).toBe(false);
      expect(isSchoolAdmin(legacyAdmin)).toBe(false);

      expect(isLegacyAdmin(legacyAdmin)).toBe(true);
      expect(isLegacyAdmin(sysAdmin)).toBe(false);
      expect(isLegacyAdmin(schoolAdmin)).toBe(false);

      expect(isAdministrativeRole(sysAdmin)).toBe(true);
      expect(isAdministrativeRole(schoolAdmin)).toBe(true);
      expect(isAdministrativeRole(legacyAdmin)).toBe(true);
      expect(isAdministrativeRole(teacher)).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 3. SCHOOL CONTEXT HELPER
  // -------------------------------------------------------------
  describe('3. School Context Helper (requiresSchoolContext)', () => {
    it('accurately distinguishes school-scoped tabs from global/system tabs', () => {
      // School-scoped data tabs
      expect(requiresSchoolContext('students')).toBe(true);
      expect(requiresSchoolContext('employees')).toBe(true);
      expect(requiresSchoolContext('student_attendance')).toBe(true);
      expect(requiresSchoolContext('daily_attendance')).toBe(true);
      expect(requiresSchoolContext('reports')).toBe(true);
      expect(requiresSchoolContext('quality')).toBe(true);
      expect(requiresSchoolContext('timetable')).toBe(true);
      expect(requiresSchoolContext('behavior')).toBe(true);

      // Global or system-wide tabs
      expect(requiresSchoolContext('dashboard')).toBe(false);
      expect(requiresSchoolContext('users')).toBe(false);
      expect(requiresSchoolContext('settings')).toBe(false);
      expect(requiresSchoolContext('audit')).toBe(false);
      expect(requiresSchoolContext('master_data')).toBe(false);
      expect(requiresSchoolContext('operations')).toBe(false);
      expect(requiresSchoolContext('system_health')).toBe(false);
      expect(requiresSchoolContext('backup')).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 4. SYSTEM ADMIN ROUTE ACCESS & ACTIVE SCHOOL GUARD
  // -------------------------------------------------------------
  describe('4. SystemAdmin Route Access & Active School Guard', () => {
    it('SystemAdmin dashboard = ALLOWED (even without activeSchoolId)', () => {
      const user: User = {
        id: 'u-sys',
        username: 'sysadmin',
        fullName: 'مدير النظام الشامل',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: '',
      };
      expect(canAccessTab(user, 'dashboard')).toBe(true);
    });

    it('SystemAdmin students with activeSchoolId = ALLOWED', () => {
      const user: User = {
        id: 'u-sys',
        username: 'sysadmin',
        fullName: 'مدير النظام الشامل',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: 'SCH-BADR',
      };
      expect(canAccessTab(user, 'students')).toBe(true);
    });

    it('SystemAdmin students without activeSchoolId = BLOCKED (Fail-Closed)', () => {
      const user: User = {
        id: 'u-sys',
        username: 'sysadmin',
        fullName: 'مدير النظام الشامل',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: '',
      };
      expect(canAccessTab(user, 'students')).toBe(false);
    });

    it('SystemAdmin users = ALLOWED (global user management)', () => {
      const user: User = {
        id: 'u-sys',
        username: 'sysadmin',
        fullName: 'مدير النظام الشامل',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: '',
      };
      expect(canAccessTab(user, 'users')).toBe(true);
    });

    it('SystemAdmin settings = ALLOWED (global settings management)', () => {
      const user: User = {
        id: 'u-sys',
        username: 'sysadmin',
        fullName: 'مدير النظام الشامل',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: '',
      };
      expect(canAccessTab(user, 'settings')).toBe(true);
    });

    it('SystemAdmin without activeSchoolId does NOT fallback to BADR or localStorage', () => {
      // Seed client localStorage with SCH-BADR
      localStorage.setItem(ACTIVE_SCHOOL_KEY, 'SCH-BADR');

      const userWithoutActiveSchool: User = {
        id: 'u-sys',
        username: 'sysadmin',
        fullName: 'مدير النظام الشامل',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: '', // Authoritative context is empty
      };

      // Must remain blocked (no localStorage authority!)
      expect(canAccessTab(userWithoutActiveSchool, 'students')).toBe(false);
      expect(canAccessTab(userWithoutActiveSchool, 'employees')).toBe(false);
      expect(canAccessTab(userWithoutActiveSchool, 'reports')).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 5. SCHOOL ADMIN ROUTE ACCESS & PERMISSIONS
  // -------------------------------------------------------------
  describe('5. SchoolAdmin Route Access & Permissions', () => {
    it('SchoolAdmin dashboard = ALLOWED', () => {
      const user: User = {
        id: 'u-sch',
        username: 'schadmin',
        fullName: 'مدير مدرسة بدر',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
      };
      expect(canAccessTab(user, 'dashboard')).toBe(true);
    });

    it('SchoolAdmin students = ALLOWED', () => {
      const user: User = {
        id: 'u-sch',
        username: 'schadmin',
        fullName: 'مدير مدرسة بدر',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
      };
      expect(canAccessTab(user, 'students')).toBe(true);
    });

    it('SchoolAdmin employees = ALLOWED', () => {
      const user: User = {
        id: 'u-sch',
        username: 'schadmin',
        fullName: 'مدير مدرسة بدر',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
      };
      expect(canAccessTab(user, 'employees')).toBe(true);
    });

    it('SchoolAdmin users is governed strictly by permissions', () => {
      // 1. Default SchoolAdmin has users.manage permission
      const defaultSchoolAdmin: User = {
        id: 'u-sch-1',
        username: 'schadmin1',
        fullName: 'مدير مدرسة بدر',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
      };
      expect(canAccessTab(defaultSchoolAdmin, 'users')).toBe(true);

      // 2. SchoolAdmin with restricted permissions (lacking users.manage)
      const restrictedSchoolAdmin: User = {
        id: 'u-sch-2',
        username: 'schadmin2',
        fullName: 'مدير مدرسة مقيد',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
        permissions: ['students.view', 'employees.view'], // explicit whitelist without users.manage
      };
      expect(canAccessTab(restrictedSchoolAdmin, 'users')).toBe(false);
    });

    it('SchoolAdmin without schoolId is BLOCKED from school-scoped routes (Fail-Closed)', () => {
      const unboundSchoolAdmin: User = {
        id: 'u-sch-unbound',
        username: 'schadmin_unbound',
        fullName: 'مدير مدرسة غير مربوط',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: '',
      };
      expect(canAccessTab(unboundSchoolAdmin, 'students')).toBe(false);
      expect(canAccessTab(unboundSchoolAdmin, 'employees')).toBe(false);
      // Dashboard remains accessible
      expect(canAccessTab(unboundSchoolAdmin, 'dashboard')).toBe(true);
    });

    it('SchoolAdmin CANNOT access master_data (schools.manage is false)', () => {
      const schoolAdmin: User = {
        id: 'u-sch',
        username: 'schadmin',
        fullName: 'مدير مدرسة بدر',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
      };
      expect(canAccessTab(schoolAdmin, 'master_data')).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 6. OPERATIONAL ROLES REGRESSION PREVENTION
  // -------------------------------------------------------------
  describe('6. Operational Roles Non-Regression Tests', () => {
    it('Teacher = no regression (isolated to teacher_portal and my_requests, no dashboard)', () => {
      const teacher: User = { id: 'u-tch', username: 'teacher1', fullName: 'معلم أول', role: 'Teacher', schoolId: 'SCH-BADR' };
      expect(canAccessTab(teacher, 'dashboard')).toBe(false);
      expect(canAccessTab(teacher, 'teacher_portal')).toBe(true);
      expect(canAccessTab(teacher, 'my_requests')).toBe(true);
      expect(canAccessTab(teacher, 'students')).toBe(false);
      expect(canAccessTab(teacher, 'employees')).toBe(false);
      expect(canAccessTab(teacher, 'settings')).toBe(false);
      expect(canAccessTab(teacher, 'users')).toBe(false);
      expect(canAccessTab(teacher, 'audit')).toBe(false);
    });

    it('StudentAffairs = no regression', () => {
      const stuAffairs: User = { id: 'u-sa', username: 'stu_affairs', fullName: 'شؤون طلاب', role: 'StudentAffairs', schoolId: 'SCH-BADR' };
      expect(canAccessTab(stuAffairs, 'dashboard')).toBe(true);
      expect(canAccessTab(stuAffairs, 'students')).toBe(true);
      expect(canAccessTab(stuAffairs, 'student_attendance')).toBe(true);
      expect(canAccessTab(stuAffairs, 'behavior')).toBe(true);
      expect(canAccessTab(stuAffairs, 'reports')).toBe(true);
      expect(canAccessTab(stuAffairs, 'employees')).toBe(false);
      expect(canAccessTab(stuAffairs, 'users')).toBe(false);
      expect(canAccessTab(stuAffairs, 'settings')).toBe(false);
    });

    it('TeacherAffairs = no regression', () => {
      const tchAffairs: User = { id: 'u-ta', username: 'tch_affairs', fullName: 'شؤون عاملين', role: 'TeacherAffairs', schoolId: 'SCH-BADR' };
      expect(canAccessTab(tchAffairs, 'dashboard')).toBe(true);
      expect(canAccessTab(tchAffairs, 'employees')).toBe(true);
      expect(canAccessTab(tchAffairs, 'daily_attendance')).toBe(true);
      expect(canAccessTab(tchAffairs, 'leaves')).toBe(true);
      expect(canAccessTab(tchAffairs, 'reports')).toBe(true);
      expect(canAccessTab(tchAffairs, 'students')).toBe(false);
      expect(canAccessTab(tchAffairs, 'users')).toBe(false);
      expect(canAccessTab(tchAffairs, 'settings')).toBe(false);
    });

    it('QualityOfficer = no regression', () => {
      const quality: User = { id: 'u-qo', username: 'quality_officer', fullName: 'مسؤول الجودة', role: 'QualityOfficer', schoolId: 'SCH-BADR' };
      expect(canAccessTab(quality, 'dashboard')).toBe(true);
      expect(canAccessTab(quality, 'quality')).toBe(true);
      expect(canAccessTab(quality, 'students')).toBe(true);
      expect(canAccessTab(quality, 'employees')).toBe(true);
      expect(canAccessTab(quality, 'student_attendance')).toBe(true);
      expect(canAccessTab(quality, 'daily_attendance')).toBe(true);
      expect(canAccessTab(quality, 'reports')).toBe(true);
      expect(canAccessTab(quality, 'audit')).toBe(true);
      expect(canAccessTab(quality, 'users')).toBe(false);
      expect(canAccessTab(quality, 'settings')).toBe(false);
    });

    it('Legacy Admin has backward-compatible universal operational access', () => {
      const legacyAdmin: User = { id: 'u-adm', username: 'admin', fullName: 'مدير عام', role: 'Admin' };
      expect(canAccessTab(legacyAdmin, 'dashboard')).toBe(true);
      expect(canAccessTab(legacyAdmin, 'students')).toBe(true);
      expect(canAccessTab(legacyAdmin, 'employees')).toBe(true);
      expect(canAccessTab(legacyAdmin, 'users')).toBe(true);
      expect(canAccessTab(legacyAdmin, 'settings')).toBe(true);
      expect(canAccessTab(legacyAdmin, 'audit')).toBe(true);
      expect(canAccessTab(legacyAdmin, 'master_data')).toBe(true);
      expect(canAccessTab(legacyAdmin, 'quality')).toBe(true);
    });
  });
});
