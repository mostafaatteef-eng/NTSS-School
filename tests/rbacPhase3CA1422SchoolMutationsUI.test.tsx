// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SchoolsManagementView } from '../src/components/schools/SchoolsManagementView';
import { schoolAdminService } from '../src/services/schoolAdminService';
import { storageService } from '../src/services/storageService';
import { School, User } from '../src/types';
import { ACTIVE_SCHOOL_KEY } from '../src/services/migrationScope014MultiSchool';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('PHASE 3C-A14.2.2 — SCHOOL CREATE / EDIT / STATUS UI', () => {
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

  const teacherUser: User = {
    id: 'usr-teacher-1',
    username: 'teacher_1',
    fullName: 'معلم أول',
    role: 'Teacher',
    accessScope: 'SCHOOL',
    schoolId: 'SCH-BADR',
    activeSchoolId: 'SCH-BADR',
    sessionToken: 'tok-teacher-test',
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
  ];

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

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
  // 1. BUTTON SECURITY & VISIBILITY BY ROLE
  // -------------------------------------------------------------
  describe('1. Button Security & Role Visibility', () => {
    it('SystemAdmin with GLOBAL and schools.manage sees "إضافة مدرسة" and row actions (تعديل, تعطيل/تفعيل)', async () => {
      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const text = container?.textContent || '';
      expect(text).toContain('إضافة مدرسة');
      expect(text).toContain('تعديل');
      expect(text).toContain('تعطيل');
      expect(text).toContain('تفعيل');

      // Table headers have Actions column
      expect(text).toContain('الإجراءات');
    });

    it('SchoolAdmin does NOT see "إضافة مدرسة" or row actions (تعديل, تعطيل, تفعيل)', async () => {
      await act(async () => {
        root.render(<SchoolsManagementView currentUser={schoolAdminUser} />);
      });

      const text = container?.textContent || '';
      expect(text).not.toContain('إضافة مدرسة');
      expect(text).not.toContain('تعديل');
      expect(text).not.toContain('تعطيل');
      expect(text).not.toContain('تفعيل');
      expect(text).not.toContain('الإجراءات');

      // Only "تحديث" button is in DOM
      const buttons = container?.querySelectorAll('button') || [];
      expect(buttons.length).toBe(1);
      expect(buttons[0].textContent).toContain('تحديث');
    });

    it('Teacher does NOT see "إضافة مدرسة" or row actions', async () => {
      await act(async () => {
        root.render(<SchoolsManagementView currentUser={teacherUser} />);
      });

      const text = container?.textContent || '';
      expect(text).not.toContain('إضافة مدرسة');
      expect(text).not.toContain('تعديل');
      expect(text).not.toContain('تعطيل');
      expect(text).not.toContain('تفعيل');
      expect(text).not.toContain('الإجراءات');
    });
  });

  // -------------------------------------------------------------
  // 2. CREATE SCHOOL WORKFLOW
  // -------------------------------------------------------------
  describe('2. Create School Workflow', () => {
    it('Opens create modal when clicking "إضافة مدرسة"', async () => {
      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const addBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('إضافة مدرسة')
      );
      expect(addBtn).toBeDefined();

      await act(async () => {
        addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container?.textContent).toContain('إضافة مدرسة جديدة');
      expect(container?.textContent).toContain('اسم المدرسة');
      expect(container?.textContent).toContain('رمز المدرسة');
      expect(container?.textContent).toContain('معرف المدرسة');
      expect(container?.textContent).toContain('حفظ وإنشاء');
    });

    it('Enforces required validation: empty schoolName or schoolCode shows validation error', async () => {
      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      // Open create modal
      const addBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('إضافة مدرسة')
      );
      await act(async () => {
        addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Submit empty form
      const submitBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('حفظ وإنشاء')
      );
      await act(async () => {
        submitBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container?.textContent).toContain('يرجى إدخال اسم المدرسة.');
    });

    it('Calls schoolAdminService.createSchool and refreshes authoritative registry on success', async () => {
      const createSpy = vi.spyOn(schoolAdminService, 'createSchool').mockResolvedValue({
        success: true,
        message: 'تم تسجيل المدرسة بنجاح.',
        data: {
          schoolId: 'SCH-ALEX',
          schoolCode: 'ALEX',
          schoolName: 'مدرسة الإسكندرية للتكنولوجيا',
          status: 'Inactive',
        },
      });

      const getSpy = vi.spyOn(schoolAdminService, 'getManagedSchools');

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      // Open modal
      const addBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('إضافة مدرسة')
      );
      await act(async () => {
        addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Fill form inputs
      const inputs = container?.querySelectorAll('input') || [];
      const nameInput = inputs[0] as HTMLInputElement;
      const codeInput = inputs[1] as HTMLInputElement;

      await act(async () => {
        setInputValue(nameInput, 'مدرسة الإسكندرية للتكنولوجيا');
        setInputValue(codeInput, 'ALEX');
      });

      // Submit form
      const submitBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('حفظ وإنشاء')
      );

      // Setup getManagedSchools mock to return 3 schools upon refresh
      getSpy.mockResolvedValueOnce({
        success: true,
        message: 'نجاح',
        data: [
          ...mockSchools,
          {
            schoolId: 'SCH-ALEX',
            schoolCode: 'ALEX',
            schoolName: 'مدرسة الإسكندرية للتكنولوجيا',
            status: 'Inactive',
          },
        ],
      });

      await act(async () => {
        submitBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolName: 'مدرسة الإسكندرية للتكنولوجيا',
          schoolCode: 'ALEX',
        }),
        sysAdminUser
      );

      // Modal closed
      expect(container?.textContent).not.toContain('إضافة مدرسة جديدة');
      // Feedback displayed
      expect(container?.textContent).toContain('تم تسجيل المدرسة بنجاح.');
      // Newly created school appears Inactive
      expect(container?.textContent).toContain('مدرسة الإسكندرية للتكنولوجيا');
    });

    it('Safely displays backend error if createSchool fails', async () => {
      vi.spyOn(schoolAdminService, 'createSchool').mockResolvedValue({
        success: false,
        code: 'SCHOOL_EXISTS',
        message: 'المدرسة مسجلة مسبقاً بنفس المعرف أو الرمز.',
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const addBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('إضافة مدرسة')
      );
      await act(async () => {
        addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const inputs = container?.querySelectorAll('input') || [];
      await act(async () => {
        setInputValue(inputs[0] as HTMLInputElement, 'مدرسة بدر المكررة');
        setInputValue(inputs[1] as HTMLInputElement, 'BADR');
      });

      const submitBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('حفظ وإنشاء')
      );
      await act(async () => {
        submitBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container?.textContent).toContain('المدرسة مسجلة مسبقاً بنفس المعرف أو الرمز.');
      // Modal stays open for user to fix
      expect(container?.textContent).toContain('إضافة مدرسة جديدة');
    });
  });

  // -------------------------------------------------------------
  // 3. EDIT SCHOOL WORKFLOW
  // -------------------------------------------------------------
  describe('3. Edit School Workflow', () => {
    it('Opens edit modal with existing school data and schoolId strictly read-only', async () => {
      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const editButtons = Array.from(container?.querySelectorAll('button') || []).filter(b =>
        b.textContent?.includes('تعديل')
      );
      expect(editButtons.length).toBe(2);

      // Click edit on first school (SCH-BADR)
      await act(async () => {
        editButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container?.textContent).toContain('تعديل بيانات المدرسة');
      expect(container?.textContent).toContain('SCH-BADR');

      // Find the schoolId input and verify it is readOnly and disabled
      const schoolIdInput = container?.querySelector('input[value="SCH-BADR"]') as HTMLInputElement;
      expect(schoolIdInput).toBeDefined();
      expect(schoolIdInput?.readOnly || schoolIdInput?.disabled).toBe(true);
    });

    it('Calls schoolAdminService.updateSchool on submit and refreshes registry on success', async () => {
      const updateSpy = vi.spyOn(schoolAdminService, 'updateSchool').mockResolvedValue({
        success: true,
        message: 'تم تحديث بيانات المدرسة بنجاح.',
        data: {
          schoolId: 'SCH-BADR',
          schoolCode: 'BADR-NEW',
          schoolName: 'مدرسة بدر المحدثة',
          status: 'Active',
        },
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const editBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('تعديل')
      );
      await act(async () => {
        editBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Change name and code
      const nameInput = container?.querySelector('input[value="مدرسة بدر الدولية للتكنولوجيا التطبيقية"]') as HTMLInputElement;
      const codeInput = container?.querySelector('input[value="BADR"]') as HTMLInputElement;

      await act(async () => {
        setInputValue(nameInput, 'مدرسة بدر المحدثة');
        setInputValue(codeInput, 'BADR-NEW');
      });

      const saveBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('حفظ التعديلات')
      );

      await act(async () => {
        saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(updateSpy).toHaveBeenCalledWith(
        'SCH-BADR',
        expect.objectContaining({
          schoolName: 'مدرسة بدر المحدثة',
          schoolCode: 'BADR-NEW',
        }),
        sysAdminUser
      );

      // Modal closed and success feedback displayed
      expect(container?.textContent).not.toContain('تعديل بيانات المدرسة');
      expect(container?.textContent).toContain('تم تحديث بيانات المدرسة بنجاح.');
    });
  });

  // -------------------------------------------------------------
  // 4. ACTIVATE & DEACTIVATE WORKFLOWS
  // -------------------------------------------------------------
  describe('4. Status Toggle: Activate & Deactivate', () => {
    it('Activate calls updateSchool(status=Active) for Inactive school', async () => {
      const updateSpy = vi.spyOn(schoolAdminService, 'updateSchool').mockResolvedValue({
        success: true,
        message: 'تم تفعيل المدرسة بنجاح.',
        data: {
          schoolId: 'SCH-DAMIETTA',
          schoolCode: 'DAMIETTA',
          schoolName: 'مدرسة دمياط للتكنولوجيا التطبيقية',
          status: 'Active',
        },
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const activateBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('تفعيل')
      );
      expect(activateBtn).toBeDefined();

      await act(async () => {
        activateBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(updateSpy).toHaveBeenCalledWith(
        'SCH-DAMIETTA',
        { status: 'Active' },
        sysAdminUser
      );
    });

    it('Backend binding failure leaves school Inactive and shows safe Arabic message without exposing spreadsheetId', async () => {
      vi.spyOn(schoolAdminService, 'updateSchool').mockResolvedValue({
        success: false,
        code: 'SCHOOL_SPREADSHEET_NOT_BOUND',
        message: 'Cannot activate unbound school',
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const activateBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('تفعيل')
      );
      await act(async () => {
        activateBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Safe message shown
      expect(container?.textContent).toContain('لا يمكن تفعيل المدرسة قبل استكمال ربطها بجدول البيانات المعتمد من الخادم.');
      // Must not expose spreadsheet internals
      const html = container?.innerHTML || '';
      expect(html.includes('spreadsheetId')).toBe(false);
      expect(html.includes('SHEET_ID')).toBe(false);
    });

    it('Deactivate requires confirmation dialog before mutating status', async () => {
      const updateSpy = vi.spyOn(schoolAdminService, 'updateSchool');

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const deactivateBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('تعطيل')
      );
      expect(deactivateBtn).toBeDefined();

      // Click deactivate button
      await act(async () => {
        deactivateBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Confirmation modal is open
      expect(container?.textContent).toContain('هل تريد تعطيل هذه المدرسة؟');
      expect(container?.textContent).toContain('سيؤدي تعطيل المدرسة');
      expect(container?.textContent).toContain('تأكيد التعطيل');
      expect(container?.textContent).toContain('إلغاء');

      // Before confirming, updateSchool was NOT called yet
      expect(updateSpy).not.toHaveBeenCalled();

      // Click Cancel
      const cancelBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.trim() === 'إلغاء'
      );
      await act(async () => {
        cancelBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Confirmation dialog closed without mutation
      expect(container?.textContent).not.toContain('هل تريد تعطيل هذه المدرسة؟');
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('Confirmed deactivation calls updateSchool(status=Inactive) and refreshes registry', async () => {
      const updateSpy = vi.spyOn(schoolAdminService, 'updateSchool').mockResolvedValue({
        success: true,
        message: 'تم تعطيل المدرسة بنجاح.',
        data: {
          schoolId: 'SCH-BADR',
          schoolCode: 'BADR',
          schoolName: 'مدرسة بدر الدولية للتكنولوجيا التطبيقية',
          status: 'Inactive',
        },
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const deactivateBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('تعطيل')
      );
      await act(async () => {
        deactivateBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Confirm deactivation
      const confirmBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('تأكيد التعطيل')
      );
      await act(async () => {
        confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(updateSpy).toHaveBeenCalledWith(
        'SCH-BADR',
        { status: 'Inactive' },
        sysAdminUser
      );

      expect(container?.textContent).toContain('تم تعطيل مدرسة بدر الدولية للتكنولوجيا التطبيقية بنجاح.');
    });

    it('Current Active School Edge Case: deactivating current operating school clears active context without inventing fallbacks', async () => {
      // Set currentUser in storageService with activeSchoolId = SCH-BADR
      storageService.setCurrentUser({ ...sysAdminUser, activeSchoolId: 'SCH-BADR' });
      localStorage.setItem(ACTIVE_SCHOOL_KEY, 'SCH-BADR');

      vi.spyOn(schoolAdminService, 'updateSchool').mockResolvedValue({
        success: true,
        message: 'تم تعطيل المدرسة بنجاح.',
        data: {
          schoolId: 'SCH-BADR',
          schoolCode: 'BADR',
          schoolName: 'مدرسة بدر الدولية للتكنولوجيا التطبيقية',
          status: 'Inactive',
        },
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={storageService.getCurrentUser()} />);
      });

      const deactivateBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('تعطيل')
      );
      await act(async () => {
        deactivateBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const confirmBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('تأكيد التعطيل')
      );
      await act(async () => {
        confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Verify activeSchoolId is cleared to '' and NOT set to fake fallback
      const updatedUser = storageService.getCurrentUser();
      expect(updatedUser?.activeSchoolId).toBe('');
      expect(localStorage.getItem(ACTIVE_SCHOOL_KEY)).toBeNull();
    });

    it('No optimistic UI update: failure keeps previous state intact', async () => {
      vi.spyOn(schoolAdminService, 'updateSchool').mockResolvedValue({
        success: false,
        code: 'NETWORK_ERROR',
        message: 'فشل الاتصال بالخادم الرئيسي.',
      });

      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const activateBtn = Array.from(container?.querySelectorAll('button') || []).find(b =>
        b.textContent?.includes('تفعيل')
      );
      await act(async () => {
        activateBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Error banner shown
      expect(container?.textContent).toContain('فشل الاتصال بالخادم الرئيسي.');
      // Damietta remains Inactive
      const damiettaRow = container?.querySelector('tr[data-school-id="SCH-DAMIETTA"]');
      expect(damiettaRow?.textContent).toContain('غير نشطة');
    });
  });

  // -------------------------------------------------------------
  // 5. SECURITY & ZERO LEAKS
  // -------------------------------------------------------------
  describe('5. Security, Zero Leaks & Prohibited Actions', () => {
    it('No Delete action exists anywhere in DOM', async () => {
      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const text = container?.textContent || '';
      expect(text).not.toContain('حذف');
      expect(text).not.toContain('مسح');
      expect(text).not.toContain('Delete');
      expect(text).not.toContain('Remove');
      expect(text).not.toContain('Archive');
    });

    it('No spreadsheet binding UI exists in DOM', async () => {
      await act(async () => {
        root.render(<SchoolsManagementView currentUser={sysAdminUser} />);
      });

      const text = container?.textContent || '';
      expect(text).not.toContain('ربط جدول');
      expect(text).not.toContain('ربط Spreadsheet');
      expect(text).not.toContain('Spreadsheet ID');
      expect(text).not.toContain('Sheet ID');

      const html = container?.innerHTML || '';
      expect(html.includes('spreadsheetId')).toBe(false);
      expect(html.includes('SPREADSHEET_ID')).toBe(false);
      expect(html.includes('SHEET_ID')).toBe(false);
    });
  });
});
