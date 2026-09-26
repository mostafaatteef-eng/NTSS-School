// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherAccountsManager } from '../src/components/users/TeacherAccountsManager';
import { teacherAccountAdminService } from '../src/services/teacherAccountAdminService';
import { storageService } from '../src/services/storageService';
import { User } from '../src/types';

const sysAdmin: User = {
  id: 'sys-1',
  username: 'sys',
  fullName: 'System Admin',
  role: 'SystemAdmin',
  accessScope: 'GLOBAL',
  allowedSchoolIds: ['SCH-BADR'],
  activeSchoolId: 'SCH-BADR',
  sessionToken: 'sys-token',
};

const sysAdminNoSchool: User = { ...sysAdmin, activeSchoolId: '' };

const teacherAffairs: User = {
  id: 'ta-1',
  username: 'ta',
  fullName: 'Teacher Affairs',
  role: 'TeacherAffairs',
  accessScope: 'SCHOOL',
  schoolId: 'SCH-BADR',
  allowedSchoolIds: ['SCH-BADR'],
  sessionToken: 'ta-token',
};

const bundle = {
  effectiveSchoolId: 'SCH-BADR',
  accounts: [{
    id: 'TAC_EMP1',
    schoolId: 'SCH-BADR',
    employeeId: 'EMP1',
    teacherCode: 'T001',
    teacherName: 'أحمد علي',
    department: 'الذكاء الاصطناعي',
    username: 't001',
    status: 'Active' as const,
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: '2026-09-01',
  }],
  teachingStaff: [
    {
      id: 'EMP1',
      name: 'أحمد علي',
      teacherCode: 'T001',
      jobTitle: 'معلم',
      specialization: 'الذكاء الاصطناعي',
      employeeType: 'Teacher' as const,
      status: 'Active' as const,
      isTeacher: true,
      isTeachingStaff: true,
    },
    {
      id: 'EMP2',
      name: 'سارة محمد',
      teacherCode: 'T002',
      jobTitle: 'معلم',
      specialization: 'اللغة الإنجليزية',
      employeeType: 'Teacher' as const,
      status: 'Active' as const,
      isTeacher: true,
      isTeachingStaff: true,
    },
  ],
};

describe('PHASE 3C-A16.1 — Authoritative TeacherAccountsManager UI', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
    vi.spyOn(teacherAccountAdminService, 'getBundle').mockResolvedValue({
      success: true,
      message: 'ok',
      data: bundle,
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function render(user: User) {
    await act(async () => {
      root.render(<TeacherAccountsManager currentUser={user} />);
      await Promise.resolve();
    });
  }

  function clickText(text: string) {
    const button = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes(text));
    if (!button) throw new Error('button not found: ' + text);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  it('loads authoritative bundle and does not read legacy local teacher or employee caches', async () => {
    const localAccounts = vi.spyOn(storageService, 'getTeacherAccounts');
    const localEmployees = vi.spyOn(storageService, 'getEmployees');

    await render(sysAdmin);

    expect(teacherAccountAdminService.getBundle).toHaveBeenCalledWith(sysAdmin);
    expect(localAccounts).not.toHaveBeenCalled();
    expect(localEmployees).not.toHaveBeenCalled();
    expect(container.textContent || '').toContain('أحمد علي');
    expect(container.textContent || '').toContain('SCH-BADR');
  });

  it('TeacherAffairs receives management UI through canonical permission instead of legacy role string checks', async () => {
    await render(teacherAffairs);
    expect(container.textContent || '').toContain('إنشاء حساب معلم');
    expect(container.textContent || '').not.toContain('لا تملك صلاحية إدارة حسابات المعلمين');
  });

  it('SystemAdmin without active school fails closed and cannot create an account', async () => {
    vi.mocked(teacherAccountAdminService.getBundle).mockResolvedValueOnce({
      success: false,
      code: 'SCHOOL_CONTEXT_REQUIRED',
      message: 'اختر مدرسة نشطة أولاً لإدارة حسابات المعلمين.',
    });

    await render(sysAdminNoSchool);
    expect(container.textContent || '').toContain('اختر مدرسة نشطة أولاً');
    const add = container.querySelector('#btn-add-teacher-account') as HTMLButtonElement | null;
    expect(add?.disabled).toBe(true);
  });

  it('create modal lists only teaching staff without an existing teacher account', async () => {
    await render(sysAdmin);
    await act(async () => clickText('إنشاء حساب معلم'));

    const options = Array.from(container.querySelectorAll('option')).map(option => option.textContent || '');
    expect(options.some(text => text.includes('سارة محمد'))).toBe(true);
    expect(options.some(text => text.includes('أحمد علي'))).toBe(false);
  });

  it('does not optimistically add an account when backend creation fails', async () => {
    vi.spyOn(teacherAccountAdminService, 'createAccount').mockResolvedValue({
      success: false,
      code: 'USERNAME_TAKEN',
      message: 'اسم المستخدم مسجل بالفعل',
    });

    await render(sysAdmin);
    await act(async () => clickText('إنشاء حساب معلم'));

    const select = container.querySelector('form select') as HTMLSelectElement;
    const username = container.querySelector('form input[dir="ltr"]') as HTMLInputElement;
    const password = container.querySelector('form input[type="password"]') as HTMLInputElement;

    await act(async () => {
      select.value = 'EMP2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      username.value = 'teacher2';
      username.dispatchEvent(new Event('input', { bubbles: true }));
      password.value = 'Strong#Pass9';
      password.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent || '').toContain('اسم المستخدم مسجل بالفعل');
    expect(container.textContent || '').toContain('إجمالي الحسابات');
    expect(container.textContent || '').toContain('١');
  });

  it('status failure keeps current rendered status and does not refresh authoritative bundle', async () => {
    vi.spyOn(teacherAccountAdminService, 'setStatus').mockResolvedValue({
      success: false,
      code: 'ROLE_PERMISSION_DENIED',
      message: 'denied',
    });
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn(() => true),
    });

    await render(sysAdmin);
    const initialCalls = vi.mocked(teacherAccountAdminService.getBundle).mock.calls.length;
    const statusButton = container.querySelector('button[title="تغيير حالة الحساب"]') as HTMLButtonElement;

    await act(async () => {
      statusButton.click();
      await Promise.resolve();
    });

    expect(vi.mocked(teacherAccountAdminService.getBundle).mock.calls.length).toBe(initialCalls);
    expect(container.textContent || '').toContain('denied');
    expect(container.textContent || '').toContain('نشط');
  });

  it('successful status mutation reloads the authoritative bundle', async () => {
    vi.spyOn(teacherAccountAdminService, 'setStatus').mockResolvedValue({
      success: true,
      message: 'ok',
    });
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: vi.fn(() => true),
    });

    await render(sysAdmin);
    const initialCalls = vi.mocked(teacherAccountAdminService.getBundle).mock.calls.length;
    const statusButton = container.querySelector('button[title="تغيير حالة الحساب"]') as HTMLButtonElement;

    await act(async () => {
      statusButton.click();
      await Promise.resolve();
    });

    expect(vi.mocked(teacherAccountAdminService.getBundle).mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('does not expose legacy PIN/setup controls or secret field names in the DOM', async () => {
    await render(sysAdmin);
    const text = container.textContent || '';
    expect(text).not.toContain('PIN');
    expect(text).not.toContain('Needs Setup');
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('passwordSalt');
    expect(text).not.toContain('spreadsheetId');
  });
});
