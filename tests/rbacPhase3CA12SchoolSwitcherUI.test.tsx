// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Header } from '../src/components/layout/Header';
import { storageService } from '../src/services/storageService';
import { MASTER_SCHOOLS_KEY } from '../src/services/migrationScope014MultiSchool';
import { User, School } from '../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('PHASE 3C-A12.1 — SCHOOL SWITCHER UI COMPONENT TESTS (Header.tsx)', () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;
  const originalFetch = global.fetch;

  const mockSchools: School[] = [
    {
      schoolId: 'SCH-BADR',
      schoolCode: 'BADR',
      schoolName: 'مدرسة إبدأ الوطنية للعلوم التقنية - بدر',
      status: 'Active',
    },
    {
      schoolId: 'SCH-DAMIETTA',
      schoolCode: 'DAMIETTA',
      schoolName: 'مدرسة إبدأ الوطنية للعلوم التقنية - دمياط',
      status: 'Active',
    },
    {
      schoolId: 'SCH-OTHER',
      schoolCode: 'OTHER',
      schoolName: 'مدرسة أخرى غير مصرح بها',
      status: 'Active',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Default mock fetch to prevent happy-dom aborted network requests
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', schools: mockSchools }),
    });

    // Seed master schools into localStorage cache
    localStorage.setItem(MASTER_SCHOOLS_KEY, JSON.stringify(mockSchools));

    storageService.setCurrentUser(null);
    storageService.saveSettings({
      ...storageService.getSettings(),
      googleAppsScriptUrl: 'https://script.google.com/macros/s/AKfycbyFakeEndpoint/exec',
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
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test A: SystemAdmin with GLOBAL scope & multiple allowed schools sees switcher
  // -------------------------------------------------------------------------
  it('Test A: SystemAdmin with GLOBAL scope renders #header-school-switcher', async () => {
    const sysAdminUser: User = {
      id: 'usr-sysadmin',
      username: 'systemadmin',
      fullName: 'مدير النظام الشامل',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      schoolId: '',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
      sessionToken: 'token-sysadmin-1',
    };
    storageService.setCurrentUser(sysAdminUser);

    await act(async () => {
      root.render(<Header currentUser={sysAdminUser} />);
    });

    const switcher = container?.querySelector('#header-school-switcher');
    expect(switcher).not.toBeNull();
    expect(switcher?.tagName.toLowerCase()).toBe('select');
  });

  // -------------------------------------------------------------------------
  // Test B: SchoolAdmin does NOT see #header-school-switcher
  // -------------------------------------------------------------------------
  it('Test B: SchoolAdmin does NOT render #header-school-switcher', async () => {
    const schoolAdminUser: User = {
      id: 'usr-admin-badr',
      username: 'admin_badr',
      fullName: 'مدير مدرسة بدر',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'token-admin-1',
    };
    storageService.setCurrentUser(schoolAdminUser);

    await act(async () => {
      root.render(<Header currentUser={schoolAdminUser} />);
    });

    const switcher = container?.querySelector('#header-school-switcher');
    expect(switcher).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test C: Teacher does NOT see #header-school-switcher
  // -------------------------------------------------------------------------
  it('Test C: Teacher does NOT render #header-school-switcher', async () => {
    const teacherUser: User = {
      id: 'usr-teacher-badr',
      username: 'teacher_badr',
      fullName: 'معلم مدرسة بدر',
      role: 'Teacher',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'token-teacher-1',
    };
    storageService.setCurrentUser(teacherUser);

    await act(async () => {
      root.render(<Header currentUser={teacherUser} />);
    });

    const switcher = container?.querySelector('#header-school-switcher');
    expect(switcher).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test D: Dropdown strictly filters out schools outside allowedSchoolIds
  // -------------------------------------------------------------------------
  it('Test D: Dropdown only includes allowedSchoolIds (SCH-OTHER is excluded)', async () => {
    const sysAdminUser: User = {
      id: 'usr-sysadmin',
      username: 'systemadmin',
      fullName: 'مدير النظام الشامل',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      schoolId: '',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
      sessionToken: 'token-sysadmin-1',
    };
    storageService.setCurrentUser(sysAdminUser);

    await act(async () => {
      root.render(<Header currentUser={sysAdminUser} />);
    });

    const switcher = container?.querySelector('#header-school-switcher') as HTMLSelectElement | null;
    expect(switcher).not.toBeNull();

    const options = Array.from(switcher?.querySelectorAll('option') || []).map(o => o.value);
    expect(options).toContain('SCH-BADR');
    expect(options).toContain('SCH-DAMIETTA');
    expect(options).not.toContain('SCH-OTHER');
  });

  // -------------------------------------------------------------------------
  // Test E: Dropdown change: authoritative context does NOT change before backend success,
  // and updates Header after backend success
  // -------------------------------------------------------------------------
  it('Test E: School context remains unchanged before backend success and updates after success', async () => {
    const sysAdminUser: User = {
      id: 'usr-sysadmin',
      username: 'systemadmin',
      fullName: 'مدير النظام الشامل',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      schoolId: '',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
      sessionToken: 'token-sysadmin-1',
    };
    storageService.setCurrentUser(sysAdminUser);

    let resolveBackend: (val: any) => void = () => {};
    const backendResponsePromise = new Promise(resolve => {
      resolveBackend = resolve;
    });

    global.fetch = vi.fn().mockImplementation(async () => backendResponsePromise);

    await act(async () => {
      root.render(<Header currentUser={sysAdminUser} />);
    });

    const switcher = container?.querySelector('#header-school-switcher') as HTMLSelectElement;
    expect(switcher).not.toBeNull();
    expect(switcher.value).toBe('SCH-BADR');

    // Trigger change on dropdown
    await act(async () => {
      switcher.value = 'SCH-DAMIETTA';
      switcher.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 1. Before backend success: authoritative school context is STILL SCH-BADR
    expect(storageService.getActiveSchoolId()).toBe('SCH-BADR');
    expect(storageService.getCurrentUser()?.activeSchoolId).toBe('SCH-BADR');

    // 2. Now resolve backend with success
    await act(async () => {
      resolveBackend({
        ok: true,
        json: async () => ({
          status: 'success',
          user: {
            id: 'usr-sysadmin',
            role: 'SystemAdmin',
            accessScope: 'GLOBAL',
            activeSchoolId: 'SCH-DAMIETTA',
            allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
          },
          school: {
            schoolId: 'SCH-DAMIETTA',
            schoolCode: 'DAMIETTA',
            schoolName: 'مدرسة إبدأ الوطنية للعلوم التقنية - دمياط',
            status: 'Active',
          },
        }),
      });
    });

    // 3. After backend success: authoritative school context is DAMIETTA
    expect(storageService.getActiveSchoolId()).toBe('SCH-DAMIETTA');
    expect(storageService.getCurrentUser()?.activeSchoolId).toBe('SCH-DAMIETTA');
    expect(switcher.value).toBe('SCH-DAMIETTA');
  });

  // -------------------------------------------------------------------------
  // Test F: Backend switch failure: current school context remains intact
  // -------------------------------------------------------------------------
  it('Test F: Backend switch failure leaves current school context intact', async () => {
    const sysAdminUser: User = {
      id: 'usr-sysadmin',
      username: 'systemadmin',
      fullName: 'مدير النظام الشامل',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      schoolId: '',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
      sessionToken: 'token-sysadmin-1',
    };
    storageService.setCurrentUser(sysAdminUser);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'error',
        code: 'ACCESS_DENIED_SCHOOL_SCOPE',
        message: 'المدرسة المطلوبة خارج نطاق المدارس المصرح لك بالوصول إليها',
      }),
    });

    await act(async () => {
      root.render(<Header currentUser={sysAdminUser} />);
    });

    const switcher = container?.querySelector('#header-school-switcher') as HTMLSelectElement;
    expect(switcher).not.toBeNull();
    expect(switcher.value).toBe('SCH-BADR');

    // Trigger switch to DAMIETTA
    await act(async () => {
      switcher.value = 'SCH-DAMIETTA';
      switcher.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // School context MUST remain intact (Fail-Closed)
    expect(storageService.getActiveSchoolId()).toBe('SCH-BADR');
    expect(storageService.getCurrentUser()?.activeSchoolId).toBe('SCH-BADR');

    // Error message must be rendered to user in UI
    expect(container?.textContent).toContain('المدرسة المطلوبة خارج نطاق المدارس المصرح لك بالوصول إليها');
  });
});
