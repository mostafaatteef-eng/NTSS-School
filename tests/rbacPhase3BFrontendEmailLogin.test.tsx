// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LoginView } from '../src/components/auth/LoginView';
import { storageService } from '../src/services/storageService';
import { CANONICAL_BACKEND_VERSION, CANONICAL_BACKEND_SOURCE } from '../src/services/googleSheetsAppScript';
import { User } from '../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('PHASE 3B — FRONTEND EMAIL LOGIN + REMOVE LOGIN SCHOOL AUTHORITY', () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    storageService.setCurrentUser(null);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root.unmount();
      });
    }
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // Mock compatible backend health response helper
  const mockCompatibleHealthAndLogin = (loginResult: any) => {
    const fetchSpy = vi.fn().mockImplementation(async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes('action=health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            serviceAvailable: true,
            canonicalSource: CANONICAL_BACKEND_SOURCE,
            version: CANONICAL_BACKEND_VERSION,
            systemMode: 'PRODUCTION',
          }),
        };
      }
      if (opts && opts.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => loginResult,
        };
      }
      return { ok: false, status: 404 };
    });
    global.fetch = fetchSpy as any;
    return fetchSpy;
  };

  // --- UI Component Tests ---
  it('1. LoginView does NOT contain a School selector or text "اختر مدرستك"', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<LoginView onLoginSuccess={() => {}} />);
    });

    const schoolSelect = container.querySelector('#select-school');
    expect(schoolSelect).toBeNull();

    const anySelect = container.querySelector('select');
    expect(anySelect).toBeNull();

    expect(container.textContent).not.toContain('اختر مدرستك');
    expect(container.textContent).not.toContain('1. المدرسة');
  });

  it('2. LoginView does NOT contain username input or label', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<LoginView onLoginSuccess={() => {}} />);
    });

    const usernameInput = container.querySelector('#input-username');
    expect(usernameInput).toBeNull();
    expect(container.textContent).not.toContain('اسم المستخدم');
  });

  it('3. LoginView contains email input with type="email" and autocomplete="email"', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<LoginView onLoginSuccess={() => {}} />);
    });

    const emailInput = container.querySelector('#input-email') as HTMLInputElement | null;
    expect(emailInput).not.toBeNull();
    expect(emailInput?.type).toBe('email');
    expect(emailInput?.getAttribute('autocomplete')).toBe('email');
    expect(emailInput?.placeholder).toBe('name@school.edu.eg');
    expect(container.textContent).toContain('البريد الإلكتروني');
  });

  // --- Storage Service Tests ---
  it('4. storageService.login signature accepts email and password without schoolId parameter', async () => {
    const fetchSpy = mockCompatibleHealthAndLogin({
      status: 'success',
      sessionToken: 'BE_TOKEN_TEST_123',
      user: {
        id: 'U-ADMIN-1',
        fullName: 'أحمد مدير',
        role: 'SchoolAdmin',
        schoolId: 'SCH-BADR',
      },
    });

    const res = await storageService.login('admin@school.edu.eg', 'SecretPassword123!');
    expect(res.success).toBe(true);
    expect(res.user?.sessionToken).toBe('BE_TOKEN_TEST_123');
  });

  it('5. Login request body sends email + password only', async () => {
    const fetchSpy = mockCompatibleHealthAndLogin({
      status: 'success',
      sessionToken: 'BE_TOKEN_TEST_123',
      user: {
        id: 'U-ADMIN-1',
        fullName: 'أحمد مدير',
        role: 'SchoolAdmin',
        schoolId: 'SCH-BADR',
      },
    });

    await storageService.login('Admin.User@School.EDU.EG ', 'SecretPassword123!');

    expect(fetchSpy).toHaveBeenCalledTimes(2); // health check + POST login
    const loginCall = fetchSpy.mock.calls.find((c: any) => c[1]?.method === 'POST');
    expect(loginCall).toBeDefined();

    const body = JSON.parse(loginCall[1].body);
    expect(body).toEqual({
      action: 'login',
      email: 'admin.user@school.edu.eg',
      password: 'SecretPassword123!',
    });
  });

  it('6 & 7. Login request body does NOT contain username, schoolId, or activeSchoolId', async () => {
    const fetchSpy = mockCompatibleHealthAndLogin({
      status: 'success',
      sessionToken: 'BE_TOKEN_TEST_123',
      user: { id: 'U-1', role: 'SchoolAdmin' },
    });

    await storageService.login('test@school.edu.eg', 'pwd123');
    const loginCall = fetchSpy.mock.calls.find((c: any) => c[1]?.method === 'POST');
    const body = JSON.parse(loginCall[1].body);

    expect(body.username).toBeUndefined();
    expect(body.schoolId).toBeUndefined();
    expect(body.activeSchoolId).toBeUndefined();
  });

  it('8 & 9. Strict session token: ONLY result.sessionToken accepted, token aliases rejected', async () => {
    // Return alias result.token instead of result.sessionToken
    mockCompatibleHealthAndLogin({
      status: 'success',
      token: 'UNSAFE_ALIAS_TOKEN',
      user: { id: 'U-1', role: 'SchoolAdmin' },
    });

    const res = await storageService.login('user@school.edu.eg', 'pwd123');
    expect(res.success).toBe(false);
    expect(res.code).toBe('LOGIN_SESSION_TOKEN_MISSING');
    expect(storageService.getCurrentUser()).toBeNull();
  });

  it('10. No DEFAULT_PRIMARY_SCHOOL fallback inside login when schoolId is undefined', async () => {
    mockCompatibleHealthAndLogin({
      status: 'success',
      sessionToken: 'BE_TOKEN_GLOBAL_1',
      accessScope: 'GLOBAL',
      user: {
        id: 'U-SYS-1',
        role: 'SystemAdmin',
        schoolId: '',
        activeSchoolId: '',
        allowedSchoolIds: ['SCH-1', 'SCH-2'],
      },
    });

    const res = await storageService.login('sysadmin@ntss.edu.eg', 'pwd123');
    expect(res.success).toBe(true);
    expect(res.user?.schoolId).toBe('');
    expect(res.user?.schoolId).not.toBe('school-default');
  });

  it('11. SystemAdmin multi-school does NOT automatically select an active school locally', async () => {
    storageService.setActiveSchoolId('INITIAL_SCHOOL_ID');

    mockCompatibleHealthAndLogin({
      status: 'success',
      sessionToken: 'BE_TOKEN_GLOBAL_MULTI',
      accessScope: 'GLOBAL',
      allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'],
      activeSchoolId: '',
      user: {
        id: 'U-SYS-MULTI',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'],
        activeSchoolId: '',
        schoolId: '',
      },
    });

    const res = await storageService.login('sysadmin.multi@gov.eg', 'pwd123');
    expect(res.success).toBe(true);
    expect(res.user?.activeSchoolId).toBe('');
    // Ensure activeSchoolId was NOT set to DEFAULT_PRIMARY_SCHOOL
    expect(res.user?.activeSchoolId).not.toBe('school-default');
  });

  it('12. SchoolAdmin uses server-returned schoolId and sets active school cache', async () => {
    mockCompatibleHealthAndLogin({
      status: 'success',
      sessionToken: 'BE_TOKEN_SA_1',
      schoolId: 'SCH-ALNOOR',
      activeSchoolId: 'SCH-ALNOOR',
      accessScope: 'SCHOOL',
      user: {
        id: 'U-SA-1',
        role: 'SchoolAdmin',
        schoolId: 'SCH-ALNOOR',
        activeSchoolId: 'SCH-ALNOOR',
        accessScope: 'SCHOOL',
      },
    });

    const res = await storageService.login('admin.alnoor@ntss.edu.eg', 'pwd123');
    expect(res.success).toBe(true);
    expect(res.user?.schoolId).toBe('SCH-ALNOOR');
    expect(storageService.getActiveSchoolId()).toBe('SCH-ALNOOR');
  });

  it('13. validateSessionWithBackend request does NOT send client school authority', async () => {
    const testUser: User = {
      id: 'USR-VAL-1',
      email: 'admin@badr.edu.eg',
      fullName: 'مدير المدرسة',
      role: 'SchoolAdmin',
      schoolId: 'SCH-BADR',
      sessionToken: 'VALID_AUTH_TOKEN_TEST_77',
    };
    storageService.setCurrentUser(testUser);

    const fetchSpy = vi.fn().mockImplementation(async (url: any, opts: any) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', valid: true }),
      };
    });
    global.fetch = fetchSpy as any;

    const isValid = await storageService.validateSessionWithBackend(testUser);
    expect(isValid).toBe(true);

    const valCall = fetchSpy.mock.calls[0];
    const body = JSON.parse(valCall[1].body);

    expect(body.action).toBe('validateSession');
    expect(body.sessionToken).toBe('VALID_AUTH_TOKEN_TEST_77');
    expect(body.schoolId).toBeUndefined(); // MUST NOT send client school authority
  });

  it('14. Local Teacher precheck removed: Staff login proceeds to backend even if username matches a teacher', async () => {
    // Seed local teacher accounts
    localStorage.setItem('ntss_teachers', JSON.stringify([
      { id: 'T-1', username: 'teacher1', email: 'teacher1@school.edu.eg', name: 'أستاذ علي' },
    ]));

    const fetchSpy = mockCompatibleHealthAndLogin({
      status: 'error',
      code: 'ACCOUNT_ROLE_NOT_ALLOWED',
      message: 'حساب معلم: غير مصرح بالدخول إلى نظام ERP الإداري.',
    });

    // Login with teacher1 email - must call backend, not return early from local cache
    const res = await storageService.login('teacher1@school.edu.eg', 'pwd123');
    expect(res.success).toBe(false);
    expect(res.code).toBe('ACCOUNT_ROLE_NOT_ALLOWED');
    // Backend health and login POST were actually invoked
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('15. Backend error codes and messages propagate cleanly without masking', async () => {
    const errorCodes = [
      'INVALID_EMAIL',
      'INVALID_CREDENTIALS',
      'DUPLICATE_ACCOUNT_EMAIL',
      'ACCOUNT_EMAIL_SETUP_REQUIRED',
      'ACCOUNT_NEEDS_SETUP',
      'SCHOOL_CONTEXT_REQUIRED',
      'SELF_IDENTITY_REQUIRED',
      'NEEDS_ADMIN_REVIEW',
      'ACCOUNT_ROLE_NOT_ALLOWED',
    ];

    for (const code of errorCodes) {
      mockCompatibleHealthAndLogin({
        status: 'error',
        code: code,
        message: `Custom Backend Error: ${code}`,
      });

      const res = await storageService.login('test@school.edu.eg', 'pwd123');
      expect(res.success).toBe(false);
      expect(res.code).toBe(code);
      expect(res.message).toBe(`Custom Backend Error: ${code}`);
    }
  });
});
