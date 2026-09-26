// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardView } from '../src/components/dashboard/DashboardView';
import { SystemAdminDashboard } from '../src/components/dashboard/SystemAdminDashboard';
import { getDashboardForUser } from '../src/utils/permissions';
import { schoolAdminService } from '../src/services/schoolAdminService';
import { storageService } from '../src/services/storageService';
import { School, User } from '../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('PHASE 3C-A14.3.1 — SYSTEMADMIN CENTRAL DASHBOARD SHELL', () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;

  const sysAdminUser: User = {
    id: 'usr-sysadmin-1',
    username: 'sysadmin',
    fullName: 'مدير النظام الشامل',
    role: 'SystemAdmin',
    accessScope: 'GLOBAL',
    allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
    activeSchoolId: 'SCH-BADR',
    sessionToken: 'tok-sysadmin-test',
  };

  const sysAdminNoActiveSchoolUser: User = {
    id: 'usr-sysadmin-global',
    username: 'sysadmin_global',
    fullName: 'مدير النظام العام',
    role: 'SystemAdmin',
    accessScope: 'GLOBAL',
    allowedSchoolIds: ['SCH-BADR'],
    activeSchoolId: '', // Explicitly no active school context
    sessionToken: 'tok-sysadmin-noschool',
  };

  const schoolAdminUser: User = {
    id: 'usr-schooladmin-badr',
    username: 'admin_badr',
    fullName: 'مدير مدرسة بدر',
    role: 'SchoolAdmin',
    accessScope: 'SCHOOL',
    schoolId: 'SCH-BADR',
    activeSchoolId: 'SCH-BADR',
    sessionToken: 'tok-schooladmin-test',
  };

  const mockSchools: School[] = [
    {
      schoolId: 'SCH-BADR',
      schoolCode: 'BADR',
      schoolName: 'مدرسة بدر الدولية للتكنولوجيا التطبيقية',
      status: 'Active',
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-20T10:00:00.000Z',
    },
    {
      schoolId: 'SCH-DAMIETTA',
      schoolCode: 'DAMIETTA',
      schoolName: 'مدرسة دمياط للتكنولوجيا التطبيقية',
      status: 'Inactive',
      createdAt: '2026-09-05T09:00:00.000Z',
      updatedAt: '2026-09-25T11:00:00.000Z',
    },
    {
      schoolId: 'SCH-CAIRO',
      schoolCode: 'CAIRO',
      schoolName: 'مدرسة القاهرة التطبيقية',
      status: 'Active',
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-25T11:00:00.000Z',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();

    vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
      success: true,
      message: 'تم استرجاع قائمة المدارس بنجاح.',
      data: [...mockSchools],
    });
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
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // 1. DASHBOARD ROUTING
  // -------------------------------------------------------------
  describe('1. Dashboard Routing Engine', () => {
    it('getDashboardForUser maps SystemAdmin explicitly to SystemAdminDashboard', () => {
      expect(getDashboardForUser(sysAdminUser)).toBe('SystemAdminDashboard');
      expect(getDashboardForUser(sysAdminNoActiveSchoolUser)).toBe('SystemAdminDashboard');
    });

    it('getDashboardForUser maps SchoolAdmin explicitly to AdminDashboard', () => {
      expect(getDashboardForUser(schoolAdminUser)).toBe('AdminDashboard');
    });

    it('DashboardView renders SystemAdminDashboard for SystemAdmin and AdminDashboard for SchoolAdmin', async () => {
      // 1. SystemAdmin
      await act(async () => {
        root.render(
          <DashboardView
            employees={[]}
            attendance={[]}
            leaves={[]}
            settings={{} as any}
            currentUser={sysAdminUser}
          />
        );
      });
      expect(container?.textContent).toContain('لوحة إدارة النظام المركزي');

      // 2. SchoolAdmin
      await act(async () => {
        root.render(
          <DashboardView
            employees={[]}
            attendance={[]}
            leaves={[]}
            settings={{} as any}
            currentUser={schoolAdminUser}
          />
        );
      });
      expect(container?.textContent).not.toContain('لوحة إدارة النظام المركزي');
    });
  });

  // -------------------------------------------------------------
  // 2. CENTRAL DASHBOARD SHELL & METRICS
  // -------------------------------------------------------------
  describe('2. Central Dashboard Shell & Metrics', () => {
    it('Renders Central Dashboard for SystemAdmin with activeSchoolId = "" (No forced school selection)', async () => {
      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminNoActiveSchoolUser} />);
      });

      expect(container?.textContent).toContain('لوحة إدارة النظام المركزي');
      expect(container?.textContent).toContain('نظرة عامة على المدارس وإدارة منظومة NTSS');
      expect(container?.textContent).toContain('نطاق الإدارة: شامل (بدون مدرسة نشطة)');
    });

    it('Requests authoritative schools via schoolAdminService.getManagedSchools', async () => {
      const getSpy = vi.spyOn(schoolAdminService, 'getManagedSchools');

      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy).toHaveBeenCalledWith(sysAdminUser);
    });

    it('Displays correct central metrics: total, active, and inactive schools count', async () => {
      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      expect(container?.textContent).toContain('إجمالي المدارس');
      expect(container?.textContent).toContain('المدارس النشطة');
      expect(container?.textContent).toContain('المدارس غير النشطة');

      // 3 total, 2 active (BADR, CAIRO), 1 inactive (DAMIETTA)
      expect(container?.textContent).toContain('3');
      expect(container?.textContent).toContain('2');
      expect(container?.textContent).toContain('1');
    });

    it('Displays all schools with names, codes, and correct Arabic status badges', async () => {
      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      expect(container?.textContent).toContain('مدرسة بدر الدولية للتكنولوجيا التطبيقية');
      expect(container?.textContent).toContain('مدرسة دمياط للتكنولوجيا التطبيقية');
      expect(container?.textContent).toContain('مدرسة القاهرة التطبيقية');
      expect(container?.textContent).toContain('BADR');
      expect(container?.textContent).toContain('DAMIETTA');
      expect(container?.textContent).toContain('CAIRO');

      expect(container?.textContent).toContain('نشطة');
      expect(container?.textContent).toContain('غير نشطة');
    });

    it('Highlights currently active operating school context when present', async () => {
      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      // BADR is activeSchoolId for sysAdminUser
      const badrRow = container?.querySelector('tr[data-school-id="SCH-BADR"]');
      expect(badrRow?.textContent).toContain('المدرسة الحالية');

      // Header indicates current school
      expect(container?.textContent).toContain('المدرسة الحالية:');
    });
  });

  // -------------------------------------------------------------
  // 3. OPERATIONAL SCHOOL SWITCHING FROM CENTRAL DASHBOARD
  // -------------------------------------------------------------
  describe('3. Operational School Switching', () => {
    it('Allowed active school provides "الدخول إلى المدرسة" action button', async () => {
      // sysAdminUser has allowedSchoolIds = ['SCH-BADR', 'SCH-DAMIETTA']
      // CAIRO is Active but NOT in allowedSchoolIds
      // DAMIETTA is Inactive and IN allowedSchoolIds
      // Let's test with allowed active school: CAIRO added to allowedSchoolIds
      const userWithCairo: User = {
        ...sysAdminUser,
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR', 'SCH-CAIRO'],
      };

      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={userWithCairo} />);
      });

      const cairoRow = container?.querySelector('tr[data-school-id="SCH-CAIRO"]');
      expect(cairoRow?.textContent).toContain('الدخول إلى المدرسة');
    });

    it('Inactive school does NOT provide an operational switch action', async () => {
      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      const damiettaRow = container?.querySelector('tr[data-school-id="SCH-DAMIETTA"]');
      expect(damiettaRow?.textContent).not.toContain('الدخول إلى المدرسة');
      expect(damiettaRow?.textContent).toContain('غير متاحة للدخول (معطلة)');
    });

    it('School outside allowedSchoolIds does NOT provide operational switch action', async () => {
      // sysAdminUser allowedSchoolIds = ['SCH-BADR', 'SCH-DAMIETTA'] (CAIRO is NOT allowed)
      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      const cairoRow = container?.querySelector('tr[data-school-id="SCH-CAIRO"]');
      expect(cairoRow?.textContent).not.toContain('الدخول إلى المدرسة');
      expect(cairoRow?.textContent).toContain('غير مصرح بالتبديل');
    });

    it('Successful switch updates current school indicator without session replacement', async () => {
      const userWithCairo: User = {
        ...sysAdminUser,
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR', 'SCH-CAIRO'],
      };

      const switchSpy = vi.spyOn(storageService, 'switchActiveSchool').mockResolvedValue({
        success: true,
        message: 'تم تبديل سياق المدرسة بنجاح.',
        user: { ...userWithCairo, activeSchoolId: 'SCH-CAIRO' },
        school: mockSchools[2],
      });

      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={userWithCairo} />);
      });

      const cairoRow = container?.querySelector('tr[data-school-id="SCH-CAIRO"]');
      const switchBtn = cairoRow?.querySelector('button');
      expect(switchBtn?.textContent).toContain('الدخول إلى المدرسة');

      await act(async () => {
        switchBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(switchSpy).toHaveBeenCalledWith('SCH-CAIRO');
      expect(container?.textContent).toContain('تم التبديل بنجاح إلى: مدرسة القاهرة التطبيقية');

      // Now CAIRO row displays current school indicator
      const updatedCairoRow = container?.querySelector('tr[data-school-id="SCH-CAIRO"]');
      expect(updatedCairoRow?.textContent).toContain('المدرسة الحالية');
    });

    it('Failed switch preserves old school context and shows safe error', async () => {
      const userWithCairo: User = {
        ...sysAdminUser,
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR', 'SCH-CAIRO'],
      };

      vi.spyOn(storageService, 'switchActiveSchool').mockResolvedValue({
        success: false,
        code: 'NETWORK_ERROR',
        message: 'فشل الاتصال بالخادم الرئيسي أثناء التبديل.',
      });

      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={userWithCairo} />);
      });

      const cairoRow = container?.querySelector('tr[data-school-id="SCH-CAIRO"]');
      const switchBtn = cairoRow?.querySelector('button');

      await act(async () => {
        switchBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container?.textContent).toContain('فشل الاتصال بالخادم الرئيسي أثناء التبديل.');

      // BADR remains the active school
      const badrRow = container?.querySelector('tr[data-school-id="SCH-BADR"]');
      expect(badrRow?.textContent).toContain('المدرسة الحالية');
    });
  });

  // -------------------------------------------------------------
  // 4. QUICK ACTIONS NAVIGATION
  // -------------------------------------------------------------
  describe('4. Quick Actions Navigation', () => {
    it('Quick action "إدارة المدارس" navigates to "schools"', async () => {
      const navSpy = vi.fn();

      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} onNavigate={navSpy} />);
      });

      const schoolsActionBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('إدارة المدارس')
      );
      expect(schoolsActionBtn).toBeDefined();

      await act(async () => {
        schoolsActionBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(navSpy).toHaveBeenCalledWith('schools');
    });

    it('Quick action "إدارة المستخدمين" navigates to "users"', async () => {
      const navSpy = vi.fn();

      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} onNavigate={navSpy} />);
      });

      const usersActionBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('إدارة المستخدمين')
      );
      expect(usersActionBtn).toBeDefined();

      await act(async () => {
        usersActionBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(navSpy).toHaveBeenCalledWith('users');
    });

    it('Quick action "سجل العمليات" navigates to "audit"', async () => {
      const navSpy = vi.fn();

      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} onNavigate={navSpy} />);
      });

      const auditActionBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('سجل العمليات')
      );
      expect(auditActionBtn).toBeDefined();

      await act(async () => {
        auditActionBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(navSpy).toHaveBeenCalledWith('audit');
    });
  });

  // -------------------------------------------------------------
  // 5. STATES: LOADING, ERROR, RETRY, EMPTY, REFRESH
  // -------------------------------------------------------------
  describe('5. Component States', () => {
    it('Displays loading state while awaiting backend schools', async () => {
      let resolvePromise: any;
      const delayed = new Promise<any>(res => {
        resolvePromise = res;
      });

      vi.spyOn(schoolAdminService, 'getManagedSchools').mockReturnValue(delayed);

      act(() => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      expect(container?.textContent).toContain('جارٍ تحميل بيانات المنظومة المركزية...');

      await act(async () => {
        resolvePromise({
          success: true,
          message: 'نجاح',
          data: mockSchools,
        });
      });

      expect(container?.textContent).not.toContain('جارٍ تحميل بيانات المنظومة المركزية...');
      expect(container?.textContent).toContain('مدرسة بدر الدولية للتكنولوجيا التطبيقية');
    });

    it('Displays error state with retry button upon failure', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم الرئيسي.',
      });

      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      expect(container?.textContent).toContain('تعذر الاتصال بالخادم الرئيسي.');

      // Test Retry button
      const retryBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('إعادة المحاولة')
      );
      expect(retryBtn).toBeDefined();

      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      await act(async () => {
        retryBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container?.textContent).not.toContain('تعذر الاتصال بالخادم الرئيسي.');
      expect(container?.textContent).toContain('مدرسة بدر الدولية للتكنولوجيا التطبيقية');
    });

    it('Displays empty state when backend returns empty school registry', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: [],
      });

      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      expect(container?.textContent).toContain('لا توجد مدارس مسجلة حتى الآن.');
    });

    it('Refresh button re-fetches authoritative school registry', async () => {
      const getSpy = vi.spyOn(schoolAdminService, 'getManagedSchools');

      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      expect(getSpy).toHaveBeenCalledTimes(1);

      const refreshBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('تحديث')
      );

      await act(async () => {
        refreshBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(getSpy).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------
  // 6. SECURITY & DATA ISOLATION
  // -------------------------------------------------------------
  describe('6. Security & Data Isolation Invariants', () => {
    it('Strictly purges spreadsheetId and SHEET_ID from DOM', async () => {
      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      const html = container?.innerHTML || '';
      expect(html.includes('spreadsheetId')).toBe(false);
      expect(html.includes('SPREADSHEET_ID')).toBe(false);
      expect(html.includes('SHEET_ID')).toBe(false);
    });

    it('Does NOT display school-scoped metrics (employees, attendance, leaves) as central metrics', async () => {
      await act(async () => {
        root.render(<SystemAdminDashboard currentUser={sysAdminUser} />);
      });

      const text = container?.textContent || '';
      // Ensure central dashboard only displays school counts, not local employee/student counts
      expect(text).not.toContain('إجمالي الطلاب');
      expect(text).not.toContain('إجمالي الموظفين');
      expect(text).not.toContain('حضور اليوم');
      expect(text).not.toContain('نسبة الحضور');
    });
  });
});
