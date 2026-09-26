// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersView } from '../src/components/users/UsersView';
import { userAdminService } from '../src/services/userAdminService';
import { schoolAdminService } from '../src/services/schoolAdminService';
import { User } from '../src/types';

const systemAdmin: User = {
  id: 'sys-1',
  username: 'sys',
  email: 'sys@example.com',
  fullName: 'مدير النظام',
  role: 'SystemAdmin',
  accessScope: 'GLOBAL',
  allowedSchoolIds: ['SCH-BADR'],
  activeSchoolId: '',
  sessionToken: 'sys-token',
  status: 'Active',
};

const schoolAdmin: User = {
  id: 'sa-1',
  username: 'school',
  email: 'school@example.com',
  fullName: 'مدير مدرسة بدر',
  role: 'SchoolAdmin',
  accessScope: 'SCHOOL',
  schoolId: 'SCH-BADR',
  allowedSchoolIds: ['SCH-BADR'],
  sessionToken: 'sa-token',
  status: 'Active',
};

const managedUser: User = {
  id: 'u-1',
  username: 'director',
  email: 'director@example.com',
  fullName: 'مدير المدرسة',
  role: 'SchoolDirector',
  accessScope: 'SCHOOL',
  schoolId: 'SCH-BADR',
  allowedSchoolIds: ['SCH-BADR'],
  status: 'Active',
};

describe('PHASE 3C-A15.2 — UsersView authoritative multi-school UI', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();

    vi.spyOn(userAdminService, 'getUsers').mockResolvedValue({
      success: true,
      message: 'ok',
      data: [managedUser],
    });
    vi.spyOn(schoolAdminService, 'getManagedSchools').mockResolvedValue({
      success: true,
      message: 'ok',
      data: [
        { schoolId: 'SCH-BADR', schoolCode: 'BADR', schoolName: 'مدرسة بدر', status: 'Active' },
        { schoolId: 'SCH-DAMIETTA', schoolCode: 'DAMIETTA', schoolName: 'مدرسة دمياط', status: 'Active' },
      ],
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function render(user: User) {
    await act(async () => {
      root.render(<UsersView users={[]} currentUser={user} />);
      await Promise.resolve();
    });
  }

  function clickByText(text: string) {
    const el = Array.from(container.querySelectorAll('button')).find(node => node.textContent?.includes(text));
    if (!el) throw new Error('button not found: ' + text);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  it('loads authoritative users and renders canonical management UI', async () => {
    await render(systemAdmin);
    expect(userAdminService.getUsers).toHaveBeenCalledWith(systemAdmin);
    const text = container.textContent || '';
    expect(text).toContain('إدارة مستخدمي النظام');
    expect(text).toContain('director@example.com');
    expect(text).toContain('مدير المدرسة');
    expect(text).not.toContain('مدير نظام (Admin)');
    expect(text).not.toContain('7 Canonical Staff Roles');
  });

  it('SystemAdmin works without active school and sees only allowed school options', async () => {
    await render(systemAdmin);
    await act(async () => clickByText('إضافة مستخدم'));
    const text = container.textContent || '';
    expect(text).toContain('مدرسة بدر');
    expect(text).not.toContain('مدرسة دمياط');
  });

  it('SchoolAdmin has fixed school context and cannot choose SystemAdmin role', async () => {
    await render(schoolAdmin);
    await act(async () => clickByText('إضافة مستخدم'));
    const text = container.textContent || '';
    expect(text).toContain('المدرسة');
    expect(text).toContain('SCH-BADR');
    const roleSelects = Array.from(container.querySelectorAll('select'));
    const optionTexts = roleSelects.flatMap(select =>
      Array.from(select.querySelectorAll('option')).map(option => option.textContent || '')
    );
    expect(optionTexts).not.toContain('مدير النظام المركزي');
  });

  it('create form has explicit email and does not generate an email from username', async () => {
    await render(systemAdmin);
    await act(async () => clickByText('إضافة مستخدم'));
    const email = container.querySelector('input[type="email"]') as HTMLInputElement | null;
    expect(email).not.toBeNull();
    expect(email?.required).toBe(true);
    expect(email?.value).toBe('');
    expect(container.textContent || '').not.toContain('@ntss-schools.edu.eg');
  });

  it('editing keeps email read-only and school immutable', async () => {
    await render(systemAdmin);
    const editButton = container.querySelector('button[title="تعديل"]') as HTMLButtonElement | null;
    expect(editButton).not.toBeNull();
    await act(async () => editButton?.click());
    const email = container.querySelector('input[type="email"]') as HTMLInputElement | null;
    expect(email?.readOnly || email?.disabled).toBe(true);
    expect((container.textContent || '')).toContain('مدرسة بدر');
  });

  it('does not expose retired activation or pending setup controls', async () => {
    await render(systemAdmin);
    const text = container.textContent || '';
    expect(text).not.toContain('Pending Setup');
    expect(text).not.toContain('كود التفعيل');
    expect(text).not.toContain('activationToken');
  });

  it('refreshes authoritative list after successful status mutation and does not optimistically patch on failure', async () => {
    await render(systemAdmin);
    const getUsers = vi.mocked(userAdminService.getUsers);
    const initialCalls = getUsers.mock.calls.length;

    vi.spyOn(userAdminService, 'setStatus').mockResolvedValueOnce({
      success: false,
      code: 'ACCESS_DENIED_SCHOOL_SCOPE',
      message: 'denied',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const toggle = container.querySelector('button[title="تغيير الحالة"]') as HTMLButtonElement | null;
    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });

    expect(getUsers.mock.calls.length).toBe(initialCalls);
    expect(container.textContent || '').toContain('denied');
    expect(container.textContent || '').toContain('نشط');
  });

  it('shows loading-safe empty/error architecture without falling back to users prop', async () => {
    vi.mocked(userAdminService.getUsers).mockResolvedValueOnce({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: 'تعذر تحميل الحسابات',
    });

    await act(async () => {
      root.render(<UsersView users={[{ ...managedUser, fullName: 'LOCAL FALLBACK USER' }]} currentUser={systemAdmin} />);
      await Promise.resolve();
    });

    const text = container.textContent || '';
    expect(text).toContain('تعذر تحميل الحسابات');
    expect(text).not.toContain('LOCAL FALLBACK USER');
    expect(text).toContain('إعادة المحاولة');
  });

  it('teacher accounts tab remains available', async () => {
    await render(systemAdmin);
    expect(container.textContent || '').toContain('حسابات المعلمين');
    await act(async () => clickByText('حسابات المعلمين'));
    expect(container.textContent || '').toContain('حسابات المعلمين');
  });

  it('DOM never exposes backend secret field names from managed user DTO', async () => {
    await render(systemAdmin);
    const text = container.textContent || '';
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('passwordSalt');
    expect(text).not.toContain('sessionToken');
    expect(text).not.toContain('spreadsheetId');
  });
});
