// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { storageService } from '../src/services/storageService';
import { MASTER_SCHOOLS_KEY } from '../src/services/migrationScope014MultiSchool';
import { User, School } from '../src/types';
import { canAccessTab, resolveDefaultRouteForCurrentUser } from '../src/utils/navigation';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('PHASE 3C-A13.3 — APP ROUTE GUARD + DIRECT URL + FINAL REGRESSION', () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;
  const originalFetch = global.fetch;

  const mockSchools: School[] = [
    {
      schoolId: 'SCH-BADR',
      schoolCode: 'BADR',
      schoolName: 'مدرسة بدر الوطنية للتكنولوجيا التطبيقية',
      status: 'Active',
    },
    {
      schoolId: 'SCH-DAMIETTA',
      schoolCode: 'DAMIETTA',
      schoolName: 'مدرسة دمياط الوطنية للتكنولوجيا التطبيقية',
      status: 'Active',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    window.location.hash = '';

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Seed master schools cache
    localStorage.setItem(MASTER_SCHOOLS_KEY, JSON.stringify(mockSchools));

    // Mock fetch for backend calls
    global.fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
      const urlStr = String(url);
      if (opts && opts.body) {
        try {
          const body = JSON.parse(opts.body);
          if (body.action === 'switchActiveSchool') {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                status: 'success',
                user: {
                  activeSchoolId: body.data.targetSchoolId,
                },
                school: mockSchools.find(s => s.schoolId === body.data.targetSchoolId),
              }),
            };
          }
        } catch {}
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      };
    });

    // Mock backend session validation to always succeed for authenticated test user
    vi.spyOn(storageService, 'validateSessionWithBackend').mockResolvedValue(true);
    storageService.saveSettings({
      ...storageService.getSettings(),
      googleAppsScriptUrl: 'https://script.google.com/macros/s/AKfycbCanonicalUrl/exec',
      teacherAccountsEnabled: true,
    });
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    window.location.hash = '';
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const renderApp = async () => {
    await act(async () => {
      root.render(<App />);
    });
  };

  // -------------------------------------------------------------
  // 1. SYSTEM ADMIN DIRECT HASH / URL ACCESS
  // -------------------------------------------------------------
  describe('1. SystemAdmin Direct Hash Access', () => {
    const sysAdminUser: User = {
      id: 'u-sysadmin-1',
      username: 'sysadmin',
      fullName: 'مدير النظام الشامل',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
      sessionToken: 'tok-sysadmin-session-9999',
      status: 'Active',
      isActive: true,
    };

    it('SystemAdmin direct hash access to #/users is ALLOWED', async () => {
      storageService.setCurrentUser(sysAdminUser);
      window.location.hash = '#/users';

      await renderApp();

      // Users view or users management tab is active
      expect(container?.querySelector('#sidebar-item-users')).not.toBeNull();
      expect(container?.querySelector('#forbidden-route-banner')).toBeNull();
      expect(window.location.hash).toBe('#/users');
    });

    it('SystemAdmin direct hash access to #/settings is ALLOWED', async () => {
      storageService.setCurrentUser(sysAdminUser);
      window.location.hash = '#/settings';

      await renderApp();

      expect(container?.querySelector('#sidebar-item-settings')).not.toBeNull();
      expect(container?.querySelector('#forbidden-route-banner')).toBeNull();
      expect(window.location.hash).toBe('#/settings');
    });

    it('SystemAdmin direct hash access to #/operations is ALLOWED', async () => {
      storageService.setCurrentUser(sysAdminUser);
      window.location.hash = '#/operations';

      await renderApp();

      expect(container?.querySelector('#sidebar-item-operations')).not.toBeNull();
      expect(container?.querySelector('#forbidden-route-banner')).toBeNull();
      expect(window.location.hash).toBe('#/operations');
    });

    it('SystemAdmin direct hash access to #/students with activeSchoolId is ALLOWED', async () => {
      storageService.setCurrentUser(sysAdminUser);
      window.location.hash = '#/students';

      await renderApp();

      expect(container?.querySelector('#sidebar-item-students')).not.toBeNull();
      expect(container?.querySelector('#forbidden-route-banner')).toBeNull();
      expect(window.location.hash).toBe('#/students');
    });
  });

  // -------------------------------------------------------------
  // 2. SCHOOL ADMIN DIRECT HASH / URL ACCESS
  // -------------------------------------------------------------
  describe('2. SchoolAdmin Direct Hash Access', () => {
    const schoolAdminUser: User = {
      id: 'u-schadmin-1',
      username: 'schadmin',
      fullName: 'مدير مدرسة بدر',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'tok-schadmin-session-8888',
      status: 'Active',
      isActive: true,
    };

    it('SchoolAdmin direct hash access to #/students is ALLOWED for their school', async () => {
      storageService.setCurrentUser(schoolAdminUser);
      window.location.hash = '#/students';

      await renderApp();

      expect(container?.querySelector('#sidebar-item-students')).not.toBeNull();
      expect(container?.querySelector('#forbidden-route-banner')).toBeNull();
      expect(window.location.hash).toBe('#/students');
    });

    it('SchoolAdmin direct hash access to #/users is ALLOWED according to permissions', async () => {
      storageService.setCurrentUser(schoolAdminUser);
      window.location.hash = '#/users';

      await renderApp();

      expect(container?.querySelector('#sidebar-item-users')).not.toBeNull();
      expect(container?.querySelector('#forbidden-route-banner')).toBeNull();
      expect(window.location.hash).toBe('#/users');
    });

    it('SchoolAdmin direct hash access to #/settings is ALLOWED', async () => {
      storageService.setCurrentUser(schoolAdminUser);
      window.location.hash = '#/settings';

      await renderApp();

      expect(container?.querySelector('#sidebar-item-settings')).not.toBeNull();
      expect(container?.querySelector('#forbidden-route-banner')).toBeNull();
      expect(window.location.hash).toBe('#/settings');
    });

    it('SchoolAdmin direct hash access to #/operations is ALLOWED', async () => {
      storageService.setCurrentUser(schoolAdminUser);
      window.location.hash = '#/operations';

      await renderApp();

      expect(container?.querySelector('#sidebar-item-operations')).not.toBeNull();
      expect(container?.querySelector('#forbidden-route-banner')).toBeNull();
      expect(window.location.hash).toBe('#/operations');
    });

    it('SchoolAdmin direct hash access to #/master_data is BLOCKED (no global school management) and redirected', async () => {
      storageService.setCurrentUser(schoolAdminUser);
      window.location.hash = '#/master_data';

      await renderApp();

      // Master data is blocked: must not render master_data, redirects to safe default route (#/dashboard)
      expect(container?.querySelector('#sidebar-item-master_data')).toBeNull();
      expect(window.location.hash).toBe('#/dashboard');
    });
  });

  // -------------------------------------------------------------
  // 3. UNAUTHORIZED ROLES & SAFE REDIRECT
  // -------------------------------------------------------------
  describe('3. Unauthorized Roles Direct Hash Access & Safe Fallback', () => {
    const teacherUser: User = {
      id: 'u-teacher-1',
      username: 'teacher1',
      fullName: 'أستاذ أحمد معلم',
      role: 'Teacher',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      sessionToken: 'tok-teacher-session-7777',
      status: 'Active',
      isActive: true,
    };

    it('Teacher direct access to #/users is BLOCKED and redirected to #/teacher_portal', async () => {
      storageService.setCurrentUser(teacherUser);
      window.location.hash = '#/users';

      await renderApp();

      // Users view must not render; redirect to safe default route
      expect(window.location.hash).toBe('#/teacher_portal');
      expect(container?.querySelector('#sidebar-item-users')).toBeNull();
    });

    it('Teacher direct access to #/settings is BLOCKED and redirected to #/teacher_portal', async () => {
      storageService.setCurrentUser(teacherUser);
      window.location.hash = '#/settings';

      await renderApp();

      expect(window.location.hash).toBe('#/teacher_portal');
      expect(container?.querySelector('#sidebar-item-settings')).toBeNull();
    });

    it('Teacher direct access to #/operations is BLOCKED and redirected to #/teacher_portal', async () => {
      storageService.setCurrentUser(teacherUser);
      window.location.hash = '#/operations';

      await renderApp();

      expect(window.location.hash).toBe('#/teacher_portal');
      expect(container?.querySelector('#sidebar-item-operations')).toBeNull();
    });

    it('Teacher direct access to #/students is BLOCKED and redirected to #/teacher_portal', async () => {
      storageService.setCurrentUser(teacherUser);
      window.location.hash = '#/students';

      await renderApp();

      expect(window.location.hash).toBe('#/teacher_portal');
      expect(container?.querySelector('#sidebar-item-students')).toBeNull();
    });

    it('StudentAffairs direct access to #/settings is BLOCKED and redirected to #/students', async () => {
      const studentAffairsUser: User = {
        id: 'u-sa-1',
        username: 'sa_user',
        fullName: 'أخصائي شئون طلاب',
        role: 'StudentAffairs',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
        sessionToken: 'tok-sa-session-6666',
        status: 'Active',
        isActive: true,
      };

      storageService.setCurrentUser(studentAffairsUser);
      window.location.hash = '#/settings';

      await renderApp();

      expect(window.location.hash).toBe('#/students');
      expect(container?.querySelector('#sidebar-item-settings')).toBeNull();
    });

    it('hashchange event while running redirects unauthorized hash to safe route', async () => {
      storageService.setCurrentUser(teacherUser);
      window.location.hash = '#/teacher_portal';

      await renderApp();

      // User or attacker manually edits hash to #/operations
      await act(async () => {
        window.location.hash = '#/operations';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });

      // App guard intercepts and forces fallback
      expect(window.location.hash).toBe('#/teacher_portal');
    });
  });

  // -------------------------------------------------------------
  // 4. SYSTEM ADMIN WITHOUT ACTIVE SCHOOL (FAIL-CLOSED)
  // -------------------------------------------------------------
  describe('4. SystemAdmin Without Active School (Fail-Closed)', () => {
    const sysAdminNoSchool: User = {
      id: 'u-sysadmin-noschool',
      username: 'sysadmin2',
      fullName: 'مدير نظام بدون مدرسة نشطة',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      activeSchoolId: '', // NO active school
      allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
      sessionToken: 'tok-sysadmin-no-school-5555',
      status: 'Active',
      isActive: true,
    };

    it('entering #/students without activeSchoolId fails closed and redirects to #/dashboard', async () => {
      storageService.setCurrentUser(sysAdminNoSchool);
      window.location.hash = '#/students';

      await renderApp();

      // Must fail-closed: redirected to safe central dashboard
      expect(window.location.hash).toBe('#/dashboard');
      // No automatic selection of first school
      const current = storageService.getCurrentUser();
      expect(current?.activeSchoolId).toBe('');
      // Central dashboard is accessible
      expect(canAccessTab(sysAdminNoSchool, 'dashboard')).toBe(true);
    });

    it('canAccessTab explicitly returns false for school-scoped tabs when activeSchoolId is empty', () => {
      expect(canAccessTab(sysAdminNoSchool, 'students')).toBe(false);
      expect(canAccessTab(sysAdminNoSchool, 'employees')).toBe(false);
      expect(canAccessTab(sysAdminNoSchool, 'daily_attendance')).toBe(false);
      expect(canAccessTab(sysAdminNoSchool, 'timetable')).toBe(false);

      // But central/global tabs remain available
      expect(canAccessTab(sysAdminNoSchool, 'dashboard')).toBe(true);
      expect(canAccessTab(sysAdminNoSchool, 'users')).toBe(true);
      expect(canAccessTab(sysAdminNoSchool, 'settings')).toBe(true);
      expect(canAccessTab(sysAdminNoSchool, 'operations')).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 5. SCHOOL SWITCH REGRESSION (ROUTE PERSISTENCE)
  // -------------------------------------------------------------
  describe('5. School Switch Regression (Route Persistence on Switch)', () => {
    it('SystemAdmin on #/students switches BADR -> DAMIETTA: route stays valid, no logout, same session token', async () => {
      const sysAdminSwitching: User = {
        id: 'u-sysadmin-switch',
        username: 'sysadmin_switch',
        fullName: 'مدير نظام تجربة التبديل',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
        sessionToken: 'tok-authoritative-switch-token-1234',
        status: 'Active',
        isActive: true,
      };

      storageService.setCurrentUser(sysAdminSwitching);
      window.location.hash = '#/students';

      await renderApp();

      // Initially on students
      expect(container?.querySelector('#sidebar-item-students')).not.toBeNull();
      expect(window.location.hash).toBe('#/students');

      // Execute authoritative school switch to DAMIETTA
      let switchResult: any;
      await act(async () => {
        switchResult = await storageService.switchActiveSchool('SCH-DAMIETTA');
      });

      expect(switchResult.success).toBe(true);

      // Verify invariant properties:
      const updatedUser = storageService.getCurrentUser();
      expect(updatedUser?.activeSchoolId).toBe('SCH-DAMIETTA');
      expect(updatedUser?.sessionToken).toBe('tok-authoritative-switch-token-1234'); // Same session token
      expect(storageService.isAuthenticated(updatedUser)).toBe(true); // No logout

      // Route stays valid on #/students without unwanted navigation reset
      expect(window.location.hash).toBe('#/students');
      expect(container?.querySelector('#forbidden-route-banner')).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 6. A12 REGRESSION (AUTHORITATIVE SWITCHING & SCOPE CHECKS)
  // -------------------------------------------------------------
  describe('6. Phase 3C-A12 Regression Checks', () => {
    it('rejects school switch if target school is not in allowedSchoolIds', async () => {
      const restrictedSysAdmin: User = {
        id: 'u-restricted-sys',
        username: 'sys_restricted',
        fullName: 'مدير مقيد',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR'], // DAMIETTA not allowed
        sessionToken: 'tok-restricted-session-token',
        status: 'Active',
        isActive: true,
      };
      storageService.setCurrentUser(restrictedSysAdmin);

      const res = await storageService.switchActiveSchool('SCH-DAMIETTA');
      expect(res.success).toBe(false);
      expect(res.code).toBe('ACCESS_DENIED_SCHOOL_SCOPE');

      // Active school remains BADR
      expect(storageService.getCurrentUser()?.activeSchoolId).toBe('SCH-BADR');
    });

    it('rejects school switch if caller is not SystemAdmin with GLOBAL scope', async () => {
      const schoolAdminUser: User = {
        id: 'u-schadmin-no-switch',
        username: 'schadmin',
        fullName: 'مدير مدرسة',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
        sessionToken: 'tok-schadmin-token-1234',
        status: 'Active',
        isActive: true,
      };
      storageService.setCurrentUser(schoolAdminUser);

      const res = await storageService.switchActiveSchool('SCH-DAMIETTA');
      expect(res.success).toBe(false);
      expect(res.code).toBe('SCHOOL_SWITCH_NOT_ALLOWED');
    });
  });

  // -------------------------------------------------------------
  // 7. A11 REGRESSION (MANUAL PROVISIONING & NO DEFAULT ADMIN)
  // -------------------------------------------------------------
  describe('7. Phase 3C-A11 Regression Checks', () => {
    it('no public provisioning or self-registration exists in storageService', () => {
      expect((storageService as any).publicRegister).toBeUndefined();
      expect((storageService as any).createDefaultAdmin).toBeUndefined();
      expect((storageService as any).selfProvisionSchool).toBeUndefined();
    });

    it('resolving default route for null user safely returns dashboard without error', () => {
      expect(resolveDefaultRouteForCurrentUser(null)).toBe('dashboard');
    });

    it('canAccessTab for null user safely returns false for any tab', () => {
      expect(canAccessTab(null, 'dashboard')).toBe(false);
      expect(canAccessTab(null, 'students')).toBe(false);
      expect(canAccessTab(null, 'users')).toBe(false);
    });
  });
});
