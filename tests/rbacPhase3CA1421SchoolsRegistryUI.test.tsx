// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../src/components/layout/Sidebar';
import { SchoolsManagementView } from '../src/components/schools/SchoolsManagementView';
import { canAccessTab } from '../src/utils/navigation';
import { schoolAdminService } from '../src/services/schoolAdminService';
import { storageService } from '../src/services/storageService';
import { School, User } from '../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('PHASE 3C-A14.2.1 — SYSTEMADMIN SCHOOLS REGISTRY READ-ONLY UI', () => {
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
    sessionToken: 'tok-sysadmin-ui-test',
  };

  const sysAdminNoSchoolUser: User = {
    id: 'usr-sysadmin-noschool',
    username: 'sysadmin_global',
    fullName: 'مدير النظام بدون مدرسة نشطة',
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
    sessionToken: 'tok-schooladmin-badr',
  };

  const teacherUser: User = {
    id: 'usr-teacher-1',
    username: 'teacher_1',
    fullName: 'معلم أول',
    role: 'Teacher',
    accessScope: 'SCHOOL',
    schoolId: 'SCH-BADR',
    activeSchoolId: 'SCH-BADR',
    sessionToken: 'tok-teacher',
  };

  const schoolDirectorUser: User = {
    id: 'usr-director-1',
    username: 'director_1',
    fullName: 'ناظر المدرسة',
    role: 'SchoolDirector',
    accessScope: 'SCHOOL',
    schoolId: 'SCH-BADR',
    activeSchoolId: 'SCH-BADR',
    sessionToken: 'tok-director',
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
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
  // 1. ROUTE & PERMISSION GUARDS
  // -------------------------------------------------------------
  describe('1. Route and Permission Access Guards', () => {
    it('SystemAdmin is ALLOWED access to schools tab', () => {
      expect(canAccessTab(sysAdminUser, 'schools')).toBe(true);
      expect(canAccessTab(sysAdminUser, '#/schools')).toBe(true);
    });

    it('SystemAdmin without activeSchoolId is ALLOWED (Global Route, not school-scoped)', () => {
      expect(canAccessTab(sysAdminNoSchoolUser, 'schools')).toBe(true);
      expect(canAccessTab(sysAdminNoSchoolUser, '#/schools')).toBe(true);
    });

    it('SchoolAdmin is BLOCKED from schools tab (schools.manage = false)', () => {
      expect(canAccessTab(schoolAdminUser, 'schools')).toBe(false);
      expect(canAccessTab(schoolAdminUser, '#/schools')).toBe(false);
    });

    it('Teacher is BLOCKED from schools tab', () => {
      expect(canAccessTab(teacherUser, 'schools')).toBe(false);
      expect(canAccessTab(teacherUser, '#/schools')).toBe(false);
    });

    it('SchoolDirector is BLOCKED from schools tab', () => {
      expect(canAccessTab(schoolDirectorUser, 'schools')).toBe(false);
      expect(canAccessTab(schoolDirectorUser, '#/schools')).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 2. SIDEBAR INTEGRATION
  // -------------------------------------------------------------
  describe('2. Sidebar Navigation Item Integration', () => {
    it('SystemAdmin sees "إدارة المدارس" in Sidebar with Building2 icon', () => {
      act(() => {
        root.render(<Sidebar activeTab="dashboard" currentUser={sysAdminUser} />);
      });

      const schoolItem = container?.querySelector('#sidebar-item-schools');
      expect(schoolItem).not.toBeNull();
      expect(schoolItem?.textContent).toContain('إدارة المدارس');
    });

    it('SystemAdmin without activeSchoolId also sees "إدارة المدارس"', () => {
      act(() => {
        root.render(<Sidebar activeTab="dashboard" currentUser={sysAdminNoSchoolUser} />);
      });

      const schoolItem = container?.querySelector('#sidebar-item-schools');
      expect(schoolItem).not.toBeNull();
      expect(schoolItem?.textContent).toContain('إدارة المدارس');
    });

    it('SchoolAdmin does NOT see "إدارة المدارس" in Sidebar', () => {
      act(() => {
        root.render(<Sidebar activeTab="dashboard" currentUser={schoolAdminUser} />);
      });

      const schoolItem = container?.querySelector('#sidebar-item-schools');
      expect(schoolItem).toBeNull();
    });

    it('Teacher does NOT see "إدارة المدارس" in Sidebar', () => {
      act(() => {
        root.render(<Sidebar activeTab="teacher_portal" currentUser={teacherUser} />);
      });

      const schoolItem = container?.querySelector('#sidebar-item-schools');
      expect(schoolItem).toBeNull();
    });

    it('SchoolDirector does NOT see "إدارة المدارس" in Sidebar', () => {
      act(() => {
        root.render(<Sidebar activeTab="dashboard" currentUser={schoolDirectorUser} />);
      });

      const schoolItem = container?.querySelector('#sidebar-item-schools');
      expect(schoolItem).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 3. SCHOOLS MANAGEMENT VIEW COMPONENT
  // -------------------------------------------------------------
  describe('3. SchoolsManagementView Page Component', () => {
    const mockSchoolsData: School[] = [
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
    ];

    it('Authoritative Fetch: calls schoolAdminService.getManagedSchools on mount', async () => {
      const getSpy = vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'تم استرجاع قائمة المدارس بنجاح.',
        data: mockSchoolsData,
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy).toHaveBeenCalledWith(sysAdminUser);
    });

    it('Displays loading state while awaiting backend response', async () => {
      // Create a promise that we control
      let resolvePromise: any;
      const delayedPromise = new Promise<any>((resolve) => {
        resolvePromise = resolve;
      });

      vi.spyOn(schoolAdminService, 'getManagedSchools').mockReturnValue(delayedPromise);

      act(() => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      // Verify Loading UI is shown
      expect(container?.textContent).toContain('جارٍ تحميل سجل المدارس...');

      // Resolve and check completion
      await act(async () => {
        resolvePromise({
          success: true,
          message: 'نجاح',
          data: mockSchoolsData,
        });
      });

      expect(container?.textContent).not.toContain('جارٍ تحميل سجل المدارس...');
      expect(container?.textContent).toContain('مدرسة بدر الدولية للتكنولوجيا التطبيقية');
    });

    it('Displays all schools with their names, codes, IDs, and correct Arabic status badges', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchoolsData,
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      // Headers and titles
      expect(container?.textContent).toContain('إدارة المدارس');
      expect(container?.textContent).toContain('السجل المركزي للمدارس التابعة للنظام');

      // School 1 (Active)
      expect(container?.textContent).toContain('مدرسة بدر الدولية للتكنولوجيا التطبيقية');
      expect(container?.textContent).toContain('BADR');
      expect(container?.textContent).toContain('SCH-BADR');
      expect(container?.textContent).toContain('نشطة');

      // School 2 (Inactive)
      expect(container?.textContent).toContain('مدرسة دمياط للتكنولوجيا التطبيقية');
      expect(container?.textContent).toContain('DAMIETTA');
      expect(container?.textContent).toContain('SCH-DAMIETTA');
      expect(container?.textContent).toContain('غير نشطة');
    });

    it('Displays correct summary counts: Total, Active, Inactive', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchoolsData,
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const text = container?.textContent || '';
      expect(text).toContain('إجمالي المدارس');
      expect(text).toContain('المدارس النشطة');
      expect(text).toContain('المدارس غير النشطة');

      // Check numbers
      const cards = container?.querySelectorAll('.text-2xl.font-black');
      expect(cards?.length).toBe(3);
      expect(cards?.[0]?.textContent).toBe('2'); // Total
      expect(cards?.[1]?.textContent).toBe('1'); // Active
      expect(cards?.[2]?.textContent).toBe('1'); // Inactive
    });

    it('Displays "—" em dash for missing or empty dates', async () => {
      const schoolsWithMissingDates: School[] = [
        {
          schoolId: 'SCH-NODATE',
          schoolCode: 'NODATE',
          schoolName: 'مدرسة بدون تواريخ',
          status: 'Active',
          createdAt: undefined,
          updatedAt: '',
        },
      ];

      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: schoolsWithMissingDates,
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      expect(container?.textContent).toContain('مدرسة بدون تواريخ');
      const row = container?.querySelector('tr[data-school-id="SCH-NODATE"]');
      expect(row).not.toBeNull();
      // Em dash appears for createdAt and updatedAt
      expect(row?.textContent).toContain('—');
    });

    it('Empty State: displays "لا توجد مدارس مسجلة حتى الآن." when backend returns [] without fake defaults', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: [],
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      expect(container?.textContent).toContain('لا توجد مدارس مسجلة حتى الآن.');
      // Ensure zero fake default rows exist
      expect(container?.textContent).not.toContain('مدرسة بدر الدولية');
      expect(container?.textContent).not.toContain('مدرسة دمياط');
    });

    it('Error State: displays clear error message and "إعادة المحاولة" button on failure', async () => {
      const getSpy = vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: false,
        code: 'NETWORK_ERROR',
        message: 'تعذر الاتصال بالخادم الرئيسي لإدارة المدارس.',
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      expect(container?.textContent).toContain('تعذر الاتصال بالخادم الرئيسي لإدارة المدارس.');
      const allButtonsBefore = Array.from(container?.querySelectorAll('button') || []);
      const retryBtn = allButtonsBefore.find(b => b.textContent?.includes('إعادة المحاولة'));
      expect(retryBtn).toBeDefined();

      // Click retry button
      getSpy.mockResolvedValueOnce({
        success: true,
        message: 'نجاح',
        data: mockSchoolsData,
      });

      const allButtons = Array.from(container?.querySelectorAll('button') || []);
      const retryElement = allButtons.find(b => b.textContent?.includes('إعادة المحاولة'));
      expect(retryElement).toBeDefined();

      await act(async () => {
        retryElement?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(getSpy).toHaveBeenCalledTimes(2);
      expect(container?.textContent).toContain('مدرسة بدر الدولية للتكنولوجيا التطبيقية');
    });

    it('Refresh Button: clicking "تحديث" triggers getManagedSchools again', async () => {
      const getSpy = vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchoolsData,
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      expect(getSpy).toHaveBeenCalledTimes(1);

      const allButtons = Array.from(container?.querySelectorAll('button') || []);
      const refreshBtn = allButtons.find(b => b.textContent?.includes('تحديث'));
      expect(refreshBtn).toBeDefined();

      await act(async () => {
        refreshBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    it('SystemAdmin without activeSchoolId opens page successfully and does not alter activeSchoolId', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: mockSchoolsData,
      });

      storageService.setCurrentUser(sysAdminNoSchoolUser);

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminNoSchoolUser} />);
      });

      expect(container?.textContent).toContain('إدارة المدارس');
      expect(container?.textContent).toContain('مدرسة بدر الدولية للتكنولوجيا التطبيقية');

      // User state must NOT be modified
      const current = storageService.getCurrentUser();
      expect(current?.activeSchoolId).toBe('');
    });
  });

  // -------------------------------------------------------------
  // 4. SECURITY & READ-ONLY INVARIANTS
  // -------------------------------------------------------------
  describe('4. Security & Read-Only Invariants', () => {
    it('DOM strictly contains NO spreadsheetId or SHEET_ID', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: [
          {
            schoolId: 'SCH-BADR',
            schoolCode: 'BADR',
            schoolName: 'مدرسة بدر',
            status: 'Active',
            createdAt: '2026-09-01T08:00:00.000Z',
            updatedAt: '2026-09-20T10:00:00.000Z',
          },
        ],
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const html = container?.innerHTML || '';
      expect(html.includes('spreadsheetId')).toBe(false);
      expect(html.includes('SPREADSHEET_ID')).toBe(false);
      expect(html.includes('SHEET_ID')).toBe(false);
    });

    it('Strictly Read-Only: NO Create, Edit, Delete, Bind, or Status Toggle buttons in DOM', async () => {
      vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
        success: true,
        message: 'نجاح',
        data: [
          {
            schoolId: 'SCH-BADR',
            schoolCode: 'BADR',
            schoolName: 'مدرسة بدر',
            status: 'Active',
          },
          {
            schoolId: 'SCH-DAMIETTA',
            schoolCode: 'DAMIETTA',
            schoolName: 'مدرسة دمياط',
            status: 'Inactive',
          },
        ],
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const text = container?.textContent || '';
      // Prohibited actions in Read-Only stage
      expect(text).not.toContain('إضافة مدرسة');
      expect(text).not.toContain('إنشاء مدرسة');
      expect(text).not.toContain('تعديل');
      expect(text).not.toContain('حذف');
      expect(text).not.toContain('ربط جدول');
      expect(text).not.toContain('ربط Spreadsheet');

      // Check all buttons: only 'تحديث' exists
      const buttons = container?.querySelectorAll('button') || [];
      expect(buttons.length).toBe(1);
      expect(buttons[0].textContent).toContain('تحديث');
    });
  });
});
