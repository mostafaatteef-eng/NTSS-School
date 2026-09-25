// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../src/components/layout/Sidebar';
import { canAccessTab } from '../src/utils/navigation';
import { User } from '../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('PHASE 3C-A13.2 — SIDEBAR CANONICAL RBAC ALIGNMENT', () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      container = null;
    }
  });

  const renderSidebar = (user: User | null, activeTab = 'dashboard') => {
    act(() => {
      root.render(
        <Sidebar
          activeTab={activeTab}
          setActiveTab={() => {}}
          currentUser={user}
        />
      );
    });
  };

  // -------------------------------------------------------------
  // 1. SYSTEM ADMIN SIDEBAR
  // -------------------------------------------------------------
  describe('1. SystemAdmin Canonical Sidebar', () => {
    it('SystemAdmin sees users, settings, and operations', () => {
      const sysAdmin: User = {
        id: 'u-sysadmin',
        username: 'sysadmin',
        fullName: 'مدير النظام المركزي',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: 'SCH-BADR',
      };

      renderSidebar(sysAdmin);

      expect(container?.querySelector('#sidebar-item-users')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-settings')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-operations')).not.toBeNull();
    });

    it('SystemAdmin sees full canonical admin suite (audit, master_data, backup, system_health)', () => {
      const sysAdmin: User = {
        id: 'u-sysadmin',
        username: 'sysadmin',
        fullName: 'مدير النظام المركزي',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: 'SCH-BADR',
      };

      renderSidebar(sysAdmin);

      expect(container?.querySelector('#sidebar-item-audit')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-master_data')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-backup')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-system_health')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-import_center')).not.toBeNull();
    });

    it('SystemAdmin without activeSchoolId: sees global admin items, but school-scoped items fail-closed', () => {
      const sysAdminNoSchool: User = {
        id: 'u-sysadmin',
        username: 'sysadmin',
        fullName: 'مدير النظام المركزي',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: '', // No active school context
      };

      renderSidebar(sysAdminNoSchool);

      // Global administrative tools remain accessible
      expect(container?.querySelector('#sidebar-item-dashboard')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-users')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-settings')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-operations')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-master_data')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-audit')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-backup')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-system_health')).not.toBeNull();

      // School-scoped items MUST be absent (Fail-Closed)
      expect(container?.querySelector('#sidebar-item-students')).toBeNull();
      expect(container?.querySelector('#sidebar-item-employees')).toBeNull();
      expect(container?.querySelector('#sidebar-item-student_attendance')).toBeNull();
      expect(container?.querySelector('#sidebar-item-daily_attendance')).toBeNull();
      expect(container?.querySelector('#sidebar-item-timetable_weekly')).toBeNull();
      expect(container?.querySelector('#sidebar-item-quality')).toBeNull();
      expect(container?.querySelector('#sidebar-item-import_center')).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 2. SCHOOL ADMIN SIDEBAR
  // -------------------------------------------------------------
  describe('2. SchoolAdmin Canonical Sidebar', () => {
    it('SchoolAdmin sees allowed school-admin items', () => {
      const schoolAdmin: User = {
        id: 'u-schadmin',
        username: 'schadmin',
        fullName: 'مدير إدارة المدرسة',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
      };

      renderSidebar(schoolAdmin);

      // Core operational and school administration items
      expect(container?.querySelector('#sidebar-item-dashboard')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-students')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-employees')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-timetable_weekly')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-quality')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-reports')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-import_center')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-users')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-settings')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-operations')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-audit')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-backup')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-system_health')).not.toBeNull();
    });

    it('SchoolAdmin does NOT see global schools management (schools.manage = false)', () => {
      const schoolAdmin: User = {
        id: 'u-schadmin',
        username: 'schadmin',
        fullName: 'مدير إدارة المدرسة',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
      };

      renderSidebar(schoolAdmin);

      // Global School Management is strictly absent
      expect(container?.querySelector('#sidebar-item-master_data')).toBeNull();
    });

    it('SchoolAdmin with restricted permissions respects capability filters', () => {
      // SchoolAdmin with users.manage explicitly excluded
      const restrictedAdmin: User = {
        id: 'u-schadmin-restricted',
        username: 'schadmin_restricted',
        fullName: 'مدير مدرسة بدون إدارة مستخدمين',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
        permissions: ['students.view', 'employees.view', 'settings.manage'],
      };

      renderSidebar(restrictedAdmin);

      expect(container?.querySelector('#sidebar-item-students')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-employees')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-settings')).not.toBeNull();
      // users.manage was excluded, so users tab MUST be absent
      expect(container?.querySelector('#sidebar-item-users')).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 3. TEACHER ISOLATION & NON-REGRESSION
  // -------------------------------------------------------------
  describe('3. Teacher Isolation & Non-Regression', () => {
    it('Teacher does NOT see users', () => {
      const teacher: User = {
        id: 'u-teacher',
        username: 'teacher1',
        fullName: 'معلم أول أ',
        role: 'Teacher',
        schoolId: 'SCH-BADR',
      };

      renderSidebar(teacher, 'teacher_portal');

      expect(container?.querySelector('#sidebar-item-users')).toBeNull();
    });

    it('Teacher does NOT see settings', () => {
      const teacher: User = {
        id: 'u-teacher',
        username: 'teacher1',
        fullName: 'معلم أول أ',
        role: 'Teacher',
        schoolId: 'SCH-BADR',
      };

      renderSidebar(teacher, 'teacher_portal');

      expect(container?.querySelector('#sidebar-item-settings')).toBeNull();
    });

    it('Teacher does NOT see operations', () => {
      const teacher: User = {
        id: 'u-teacher',
        username: 'teacher1',
        fullName: 'معلم أول أ',
        role: 'Teacher',
        schoolId: 'SCH-BADR',
      };

      renderSidebar(teacher, 'teacher_portal');

      expect(container?.querySelector('#sidebar-item-operations')).toBeNull();
    });

    it('Teacher only sees teacher portal and personal self-service requests', () => {
      const teacher: User = {
        id: 'u-teacher',
        username: 'teacher1',
        fullName: 'معلم أول أ',
        role: 'Teacher',
        schoolId: 'SCH-BADR',
      };

      renderSidebar(teacher, 'teacher_portal');

      expect(container?.querySelector('#sidebar-item-teacher_portal')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-my_requests')).not.toBeNull();

      // All other ERP tabs are forbidden
      expect(container?.querySelector('#sidebar-item-dashboard')).toBeNull();
      expect(container?.querySelector('#sidebar-item-students')).toBeNull();
      expect(container?.querySelector('#sidebar-item-employees')).toBeNull();
      expect(container?.querySelector('#sidebar-item-audit')).toBeNull();
      expect(container?.querySelector('#sidebar-item-master_data')).toBeNull();
      expect(container?.querySelector('#sidebar-item-backup')).toBeNull();
      expect(container?.querySelector('#sidebar-item-system_health')).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 4. OPERATIONAL STAFF ROLES NON-REGRESSION
  // -------------------------------------------------------------
  describe('4. Operational Staff Roles Non-Regression', () => {
    it('StudentAffairs sees student affairs items but no admin system items', () => {
      const stuAffairs: User = {
        id: 'u-sa',
        username: 'stu_affairs',
        fullName: 'مسؤول شؤون طلاب',
        role: 'StudentAffairs',
        schoolId: 'SCH-BADR',
      };

      renderSidebar(stuAffairs, 'students');

      expect(container?.querySelector('#sidebar-item-dashboard')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-students')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-student_attendance')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-behavior')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-reports')).not.toBeNull();

      // Forbidden
      expect(container?.querySelector('#sidebar-item-employees')).toBeNull();
      expect(container?.querySelector('#sidebar-item-users')).toBeNull();
      expect(container?.querySelector('#sidebar-item-settings')).toBeNull();
      expect(container?.querySelector('#sidebar-item-operations')).toBeNull();
      expect(container?.querySelector('#sidebar-item-master_data')).toBeNull();
    });

    it('TeacherAffairs sees staff affairs items but no admin system items', () => {
      const tchAffairs: User = {
        id: 'u-ta',
        username: 'tch_affairs',
        fullName: 'مسؤول شؤون عاملين',
        role: 'TeacherAffairs',
        schoolId: 'SCH-BADR',
      };

      renderSidebar(tchAffairs, 'employees');

      expect(container?.querySelector('#sidebar-item-dashboard')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-employees')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-daily_attendance')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-monthly_matrix')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-leaves')).not.toBeNull();

      // Forbidden
      expect(container?.querySelector('#sidebar-item-students')).toBeNull();
      expect(container?.querySelector('#sidebar-item-users')).toBeNull();
      expect(container?.querySelector('#sidebar-item-settings')).toBeNull();
      expect(container?.querySelector('#sidebar-item-operations')).toBeNull();
      expect(container?.querySelector('#sidebar-item-master_data')).toBeNull();
    });

    it('QualityOfficer sees quality modules but no admin system items', () => {
      const quality: User = {
        id: 'u-qo',
        username: 'quality_officer',
        fullName: 'مسؤول الجودة',
        role: 'QualityOfficer',
        schoolId: 'SCH-BADR',
      };

      renderSidebar(quality, 'quality');

      expect(container?.querySelector('#sidebar-item-quality')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-reports')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-audit')).not.toBeNull();

      // Forbidden
      expect(container?.querySelector('#sidebar-item-users')).toBeNull();
      expect(container?.querySelector('#sidebar-item-settings')).toBeNull();
      expect(container?.querySelector('#sidebar-item-operations')).toBeNull();
      expect(container?.querySelector('#sidebar-item-master_data')).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 5. LEGACY ADMIN COMPATIBILITY & DIVERSIFIED GATE
  // -------------------------------------------------------------
  describe('5. Legacy Admin Compatibility & Non-Exclusive Admin Gate', () => {
    it('Legacy Admin (role: Admin) retains backward-compatible full access', () => {
      const legacyAdmin: User = {
        id: 'u-legacy-admin',
        username: 'admin',
        fullName: 'مدير النظام القديم',
        role: 'Admin',
      };

      renderSidebar(legacyAdmin);

      expect(container?.querySelector('#sidebar-item-dashboard')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-students')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-employees')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-users')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-settings')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-operations')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-master_data')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-audit')).not.toBeNull();
    });

    it('Legacy Admin check is NOT the sole gate (SystemAdmin and SchoolAdmin access admin items without role: Admin)', () => {
      const sysAdmin: User = {
        id: 'u-sys',
        username: 'sysadmin',
        fullName: 'مدير النظام المركزي',
        role: 'SystemAdmin',
        activeSchoolId: 'SCH-BADR',
      };

      const schoolAdmin: User = {
        id: 'u-sch',
        username: 'schadmin',
        fullName: 'مدير إدارة المدرسة',
        role: 'SchoolAdmin',
        schoolId: 'SCH-BADR',
      };

      // Ensure neither user has role === 'Admin'
      expect(sysAdmin.role).not.toBe('Admin');
      expect(schoolAdmin.role).not.toBe('Admin');

      // Both can access admin items in the Sidebar
      renderSidebar(sysAdmin);
      expect(container?.querySelector('#sidebar-item-users')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-settings')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-operations')).not.toBeNull();

      renderSidebar(schoolAdmin);
      expect(container?.querySelector('#sidebar-item-users')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-settings')).not.toBeNull();
      expect(container?.querySelector('#sidebar-item-operations')).not.toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 6. SIDEBAR / ROUTE CONSISTENCY
  // -------------------------------------------------------------
  describe('6. Sidebar / Route Consistency', () => {
    it('every rendered item in Sidebar is permitted by canAccessTab', () => {
      const testUsers: User[] = [
        { id: '1', username: 'sys', fullName: 'Sys', role: 'SystemAdmin', activeSchoolId: 'SCH-BADR' },
        { id: '2', username: 'sys_nosch', fullName: 'Sys NoSch', role: 'SystemAdmin', activeSchoolId: '' },
        { id: '3', username: 'sch', fullName: 'Sch', role: 'SchoolAdmin', schoolId: 'SCH-BADR' },
        { id: '4', username: 'tch', fullName: 'Tch', role: 'Teacher', schoolId: 'SCH-BADR' },
        { id: '5', username: 'sa', fullName: 'SA', role: 'StudentAffairs', schoolId: 'SCH-BADR' },
        { id: '6', username: 'adm', fullName: 'Adm', role: 'Admin' },
      ];

      for (const user of testUsers) {
        renderSidebar(user);
        const renderedButtons = container?.querySelectorAll('button[id^="sidebar-item-"]') || [];

        renderedButtons.forEach(btn => {
          const tabId = btn.id.replace('sidebar-item-', '');
          const canAccess = canAccessTab(user, tabId);
          expect(
            canAccess,
            `User role ${user.role} rendered tab "${tabId}" in sidebar, but canAccessTab blocked it`
          ).toBe(true);
        });
      }
    });
  });
});
