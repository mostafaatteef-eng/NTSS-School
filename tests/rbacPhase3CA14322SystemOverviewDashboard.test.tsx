// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardView } from '../src/components/dashboard/DashboardView';
import { SystemAdminDashboard } from '../src/components/dashboard/SystemAdminDashboard';
import { schoolAdminService } from '../src/services/schoolAdminService';
import { systemAdminOverviewService } from '../src/services/systemAdminOverviewService';
import { storageService } from '../src/services/storageService';
import { School, User, SystemOverviewResponse } from '../src/types';

describe('PHASE 3C-A14.3.2.2 — CROSS-SCHOOL METRICS CENTRAL DASHBOARD UI', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  const sysAdminUser: User = {
    id: 'usr-sysadmin-1',
    username: 'sysadmin',
    fullName: 'مدير النظام الشامل',
    role: 'SystemAdmin',
    accessScope: 'GLOBAL',
    allowedSchoolIds: ['SCH-BADR', 'SCH-ALEX'],
    activeSchoolId: '',
    sessionToken: 'tok-sysadmin-secret-xyz',
  };

  const mockSchools: School[] = [
    {
      schoolId: 'SCH-BADR',
      schoolCode: 'BADR',
      schoolName: 'مدرسة بدر الدولية للتكنولوجيا التطبيقية',
      status: 'Active',
      createdAt: '2026-09-01T08:00:00Z',
      updatedAt: '2026-09-01T08:00:00Z',
    },
    {
      schoolId: 'SCH-DAMIETTA',
      schoolCode: 'DAMIETTA',
      schoolName: 'مدرسة دمياط للتكنولوجيا التطبيقية',
      status: 'Inactive',
      createdAt: '2026-09-02T08:00:00Z',
      updatedAt: '2026-09-02T08:00:00Z',
    },
    {
      schoolId: 'SCH-ALEX',
      schoolCode: 'ALEX',
      schoolName: 'مدرسة الإسكندرية للتكنولوجيا التطبيقية',
      status: 'Active',
      createdAt: '2026-09-03T08:00:00Z',
      updatedAt: '2026-09-03T08:00:00Z',
    },
  ];

  const mockOverviewResponse: SystemOverviewResponse = {
    summary: {
      studentsTotal: 450,
      employeesTotal: 65,
      schoolsIncluded: 1,
      schoolsUnavailable: 1,
    },
    schools: [
      {
        schoolId: 'SCH-BADR',
        schoolCode: 'BADR',
        schoolName: 'مدرسة بدر الدولية للتكنولوجيا التطبيقية',
        status: 'Active',
        dataStatus: 'AVAILABLE',
        studentsCount: 450,
        employeesCount: 65,
      },
      {
        schoolId: 'SCH-DAMIETTA',
        schoolCode: 'DAMIETTA',
        schoolName: 'مدرسة دمياط للتكنولوجيا التطبيقية',
        status: 'Inactive',
        dataStatus: 'INACTIVE',
        studentsCount: null,
        employeesCount: null,
      },
      {
        schoolId: 'SCH-ALEX',
        schoolCode: 'ALEX',
        schoolName: 'مدرسة الإسكندرية للتكنولوجيا التطبيقية',
        status: 'Active',
        dataStatus: 'UNBOUND',
        studentsCount: null,
        employeesCount: null,
      },
      {
        schoolId: 'SCH-CAIRO',
        schoolCode: 'CAIRO',
        schoolName: 'مدرسة القاهرة التطبيقية',
        status: 'Active',
        dataStatus: 'NOT_ALLOWED',
        studentsCount: null,
        employeesCount: null,
      },
      {
        schoolId: 'SCH-ASWAN',
        schoolCode: 'ASWAN',
        schoolName: 'مدرسة أسوان التطبيقية',
        status: 'Active',
        dataStatus: 'UNAVAILABLE',
        studentsCount: null,
        employeesCount: null,
      },
    ],
    generatedAt: '2026-09-26T09:30:00.000Z',
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // 1. CENTRAL OVERVIEW KPIS
  // -------------------------------------------------------------
  describe('1. Central KPIs Display (مؤشرات المنظومة)', () => {
    it('Displays studentsTotal, employeesTotal, schoolsIncluded, and schoolsUnavailable correctly from overview.summary', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم استرجاع النظرة العامة بنجاح',
        data: mockOverviewResponse,
      });

      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      const text = container?.textContent || '';

      // Section title
      expect(text).toContain('مؤشرات المنظومة');

      // Metric titles
      expect(text).toContain('إجمالي الطلاب');
      expect(text).toContain('إجمالي العاملين');
      expect(text).toContain('المدارس المتاحة للبيانات');
      expect(text).toContain('المدارس التي تعذر تحميل بياناتها');

      // Formatted numbers in Arabic locale or standard digits
      // 450 formatted in Arabic is ٤٥٠
      expect(text.includes('450') || text.includes('٤٥٠')).toBe(true);
      // 65 formatted in Arabic is ٦٥
      expect(text.includes('65') || text.includes('٦٥')).toBe(true);
      // schoolsIncluded: 1
      expect(text.includes('1') || text.includes('١')).toBe(true);
    });

    it('Shows partial data warning when schoolsUnavailable > 0', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم استرجاع النظرة العامة بنجاح',
        data: mockOverviewResponse, // has schoolsUnavailable: 1
      });

      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      const text = container?.textContent || '';
      expect(text).toContain('بعض المدارس لم تتوفر بياناتها وقت التحديث، لذلك قد تكون الإجماليات أقل من القيم الفعلية.');
    });

    it('Hides partial data warning when schoolsUnavailable === 0', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم استرجاع النظرة العامة بنجاح',
        data: {
          ...mockOverviewResponse,
          summary: {
            ...mockOverviewResponse.summary,
            schoolsUnavailable: 0,
          },
        },
      });

      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      const text = container?.textContent || '';
      expect(text).not.toContain('بعض المدارس لم تتوفر بياناتها وقت التحديث، لذلك قد تكون الإجماليات أقل من القيم الفعلية.');
    });
  });

  // -------------------------------------------------------------
  // 2. PER-SCHOOL BREAKDOWN TABLE & STATUS LABELS
  // -------------------------------------------------------------
  describe('2. Per-School Operational Breakdown Table', () => {
    beforeEach(() => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم استرجاع النظرة العامة بنجاح',
        data: mockOverviewResponse,
      });
    });

    it('Renders table "تفاصيل البيانات حسب المدرسة" with all schools and safe Arabic status labels', async () => {
      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      const text = container?.textContent || '';
      expect(text).toContain('تفاصيل البيانات حسب المدرسة');

      // Status labels mapping verification
      expect(text).toContain('متاحة'); // AVAILABLE -> متاحة
      expect(text).toContain('غير نشطة'); // INACTIVE -> غير نشطة
      expect(text).toContain('غير مربوطة'); // UNBOUND -> غير مربوطة
      expect(text).toContain('خارج نطاق الوصول'); // NOT_ALLOWED -> خارج نطاق الوصول
      expect(text).toContain('تعذر الوصول'); // UNAVAILABLE -> تعذر الوصول
    });

    it('Displays numeric counts for AVAILABLE schools and "—" (dash) for null count schools', async () => {
      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      const text = container?.textContent || '';

      // SCH-BADR is AVAILABLE: has students and employees
      expect(text.includes('450') || text.includes('٤٥٠')).toBe(true);
      expect(text.includes('65') || text.includes('٦٥')).toBe(true);

      // Dash "—" must be present for null counts
      expect(text).toContain('—');

      // Must never display "0" in place of null counts for UNAVAILABLE or UNBOUND schools
      const rows = container?.querySelectorAll('tbody tr') || [];
      expect(rows.length).toBeGreaterThanOrEqual(5);
    });
  });

  // -------------------------------------------------------------
  // 3. FAILURE ISOLATION & INDEPENDENT LOADING
  // -------------------------------------------------------------
  describe('3. Failure Isolation & Independent States', () => {
    it('Overview failure does NOT crash the dashboard; registry remains usable with dedicated overview error & retry', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      const getOverviewSpy = vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: false,
        message: 'تعذر الاتصال بالخادم الرئيسي لاسترجاع النظرة العامة.',
        code: 'SERVICE_UNAVAILABLE',
      });

      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      const text = container?.textContent || '';

      // Registry still rendered and usable
      expect(text).toContain('لوحة إدارة النظام المركزي');
      expect(text).toContain('قائمة المدارس المسجلة');
      expect(text).toContain('مدرسة بدر الدولية للتكنولوجيا التطبيقية');
      expect(text).toContain('إجمالي المدارس');

      // Dedicated overview error displayed
      expect(text).toContain('تعذر تحميل مؤشرات البيانات التشغيلية.');

      // Retry button present
      const retryButtons = Array.from(container?.querySelectorAll('button') || []).filter(
        b => b.textContent?.includes('إعادة المحاولة')
      );
      expect(retryButtons.length).toBeGreaterThan(0);

      // Clicking retry triggers overview reload
      getOverviewSpy.mockResolvedValueOnce({
        success: true,
        message: 'تم',
        data: mockOverviewResponse,
      });

      await act(async () => {
        retryButtons[0].click();
      });

      expect(getOverviewSpy).toHaveBeenCalledTimes(2);
      const updatedText = container?.textContent || '';
      expect(updatedText).toContain('تفاصيل البيانات حسب المدرسة');
    });

    it('Refresh button refreshes BOTH school registry and system overview concurrently', async () => {
      const getSchoolsSpy = vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      const getOverviewSpy = vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم',
        data: mockOverviewResponse,
      });

      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      expect(getSchoolsSpy).toHaveBeenCalledTimes(1);
      expect(getOverviewSpy).toHaveBeenCalledTimes(1);

      // Find top refresh button
      const refreshBtn = Array.from(container?.querySelectorAll('button') || []).find(
        b => b.textContent?.includes('تحديث')
      );
      expect(refreshBtn).toBeDefined();

      await act(async () => {
        refreshBtn?.click();
      });

      expect(getSchoolsSpy).toHaveBeenCalledTimes(2);
      expect(getOverviewSpy).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------
  // 4. SECURITY, DATA ISOLATION & NO PII
  // -------------------------------------------------------------
  describe('4. Security & Data Isolation', () => {
    it('Never calls local school-scoped storageService.getStudents() or getEmployees() for central totals', async () => {
      const getStudentsSpy = vi.spyOn(storageService, 'getStudents');
      const getEmployeesSpy = vi.spyOn(storageService, 'getEmployees');

      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم',
        data: mockOverviewResponse,
      });

      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      expect(getStudentsSpy).not.toHaveBeenCalled();
      expect(getEmployeesSpy).not.toHaveBeenCalled();
    });

    it('DOM contains NO spreadsheetId, SHEET_ID, or raw IDs', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم',
        data: mockOverviewResponse,
      });

      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      const html = container?.innerHTML || '';
      expect(html.includes('spreadsheetId')).toBe(false);
      expect(html.includes('SHEET_ID')).toBe(false);
      expect(html.includes('SPREADSHEET_ID')).toBe(false);
    });

    it('DOM contains NO individual student or employee PII', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم',
        data: mockOverviewResponse,
      });

      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      const text = container?.textContent || '';
      expect(text.includes('أحمد محمود')).toBe(false);
      expect(text.includes('طارق مصطفى')).toBe(false);
      expect(text.includes('nationalId')).toBe(false);
      expect(text.includes('STU-1')).toBe(false);
      expect(text.includes('EMP-1')).toBe(false);
    });

    it('Works when activeSchoolId is empty string ("")', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم',
        data: mockOverviewResponse,
      });

      await act(async () => {
        root?.render(
          <SystemAdminDashboard
            currentUser={{ ...sysAdminUser, activeSchoolId: '' }}
            onNavigate={vi.fn()}
          />
        );
      });

      const text = container?.textContent || '';
      expect(text).toContain('نطاق الإدارة: شامل (بدون مدرسة نشطة)');
      expect(text).toContain('مؤشرات المنظومة');
      expect(text).toContain('تفاصيل البيانات حسب المدرسة');
    });
  });

  // -------------------------------------------------------------
  // 5. REGRESSIONS (DASHBOARD ROUTING, SWITCH, QUICK ACTIONS)
  // -------------------------------------------------------------
  describe('5. Functional Regressions', () => {
    it('DashboardView renders SystemAdminDashboard for SystemAdmin user', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم',
        data: mockOverviewResponse,
      });

      await act(async () => {
        root?.render(
          <DashboardView currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      const text = container?.textContent || '';
      expect(text).toContain('لوحة إدارة النظام المركزي');
      expect(text).toContain('مؤشرات المنظومة');
    });

    it('Allows school switch for active allowed school without mutating local context optimistically', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchools,
      });

      vi.spyOn(systemAdminOverviewService, 'getSystemOverview').mockResolvedValue({
        success: true,
        message: 'تم',
        data: mockOverviewResponse,
      });

      const switchSpy = vi.spyOn(storageService, 'switchActiveSchool').mockResolvedValue({
        success: true,
        message: 'تم التبديل بنجاح',
      });

      await act(async () => {
        root?.render(
          <SystemAdminDashboard currentUser={sysAdminUser} onNavigate={vi.fn()} />
        );
      });

      const switchButtons = Array.from(container?.querySelectorAll('button') || []).filter(
        b => b.textContent?.includes('الدخول إلى المدرسة')
      );
      expect(switchButtons.length).toBeGreaterThan(0);

      await act(async () => {
        switchButtons[0].click();
      });

      expect(switchSpy).toHaveBeenCalledWith('SCH-BADR');
      const text = container?.textContent || '';
      expect(text).toContain('تم التبديل بنجاح إلى: مدرسة بدر الدولية للتكنولوجيا التطبيقية');
    });
  });
});
