// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userAdminService } from '../src/services/userAdminService';
import { storageService } from '../src/services/storageService';
import { User } from '../src/types';

const systemAdmin: User = {
  id: 'sys-1',
  username: 'sys',
  email: 'sys@example.com',
  fullName: 'System Admin',
  role: 'SystemAdmin',
  accessScope: 'GLOBAL',
  allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
  activeSchoolId: '',
  sessionToken: 'session-token',
  status: 'Active',
};

const schoolAdmin: User = {
  id: 'school-1',
  username: 'school',
  email: 'school@example.com',
  fullName: 'School Admin',
  role: 'SchoolAdmin',
  accessScope: 'SCHOOL',
  schoolId: 'SCH-BADR',
  allowedSchoolIds: ['SCH-BADR'],
  sessionToken: 'school-session',
  status: 'Active',
};

function okJson(body: any) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

function errorJson(status: number, body: any) {
  return Promise.resolve({
    ok: false,
    status,
    json: async () => body,
  } as Response);
}

describe('PHASE 3C-A15.2 — Authoritative User Admin Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/macros/s/test/exec');
    vi.spyOn(storageService, 'getCurrentUser').mockReturnValue(systemAdmin);
    vi.spyOn(storageService, 'setCurrentUser').mockImplementation(() => {});
  });

  it('getUsers calls adminGetUsers and never reads legacy local user cache', async () => {
    const localSpy = vi.spyOn(storageService, 'getUsers');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      okJson({
        status: 'success',
        data: [
          {
            id: 'u1',
            username: 'user',
            email: 'USER@EXAMPLE.COM',
            fullName: 'User One',
            role: 'SchoolDirector',
            accessScope: 'SCHOOL',
            schoolId: 'sch-badr',
            allowedSchoolIds: ['SCH-BADR'],
            status: 'Active',
            passwordHash: 'SECRET',
            passwordSalt: 'SECRET',
            sessionToken: 'SECRET',
            activationToken: 'SECRET',
          },
        ],
      })
    );

    const res = await userAdminService.getUsers(systemAdmin);

    expect(res.success).toBe(true);
    expect(localSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('adminGetUsers');
    expect(request.sessionToken).toBe('session-token');
    expect(request.schoolId).toBeUndefined();
    expect(request.userRole).toBeUndefined();

    const user = res.data?.[0] as any;
    expect(user.email).toBe('user@example.com');
    expect(user.schoolId).toBe('SCH-BADR');
    expect(user.passwordHash).toBeUndefined();
    expect(user.passwordSalt).toBeUndefined();
    expect(user.sessionToken).toBeUndefined();
    expect(user.activationToken).toBeUndefined();
  });

  it('allows SchoolAdmin UX requests through canonical permission model', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      okJson({ status: 'success', data: [] })
    );
    const res = await userAdminService.getUsers(schoolAdmin);
    expect(res.success).toBe(true);
  });

  it('blocks unauthorized role before network', async () => {
    const teacher: User = {
      id: 't1',
      fullName: 'Teacher',
      role: 'Teacher',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'teacher-token',
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await userAdminService.getUsers(teacher);
    expect(res.success).toBe(false);
    expect(res.code).toBe('ROLE_PERMISSION_DENIED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires explicit valid email and never generates email from username', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const missing = await userAdminService.createUser({
      email: '',
      username: 'new.user',
      fullName: 'New User',
      role: 'SchoolDirector',
      password: 'Password123',
      schoolId: 'SCH-BADR',
    }, systemAdmin);
    expect(missing.code).toBe('EMAIL_REQUIRED');

    const invalid = await userAdminService.createUser({
      email: 'not-an-email',
      username: 'new.user',
      fullName: 'New User',
      role: 'SchoolDirector',
      password: 'Password123',
      schoolId: 'SCH-BADR',
    }, systemAdmin);
    expect(invalid.code).toBe('INVALID_EMAIL');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('create sends password only in backend request and never sends accessScope authority', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      okJson({
        status: 'success',
        user: {
          id: 'u2',
          username: 'new.user',
          email: 'new@example.com',
          fullName: 'New User',
          role: 'SchoolDirector',
          accessScope: 'SCHOOL',
          schoolId: 'SCH-BADR',
          allowedSchoolIds: ['SCH-BADR'],
          status: 'Active',
        },
      })
    );

    const res = await userAdminService.createUser({
      email: 'NEW@EXAMPLE.COM',
      username: 'New.User',
      fullName: 'New User',
      role: 'SchoolDirector',
      password: 'Password123',
      schoolId: 'SCH-BADR',
    }, systemAdmin);

    expect(res.success).toBe(true);
    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.data.email).toBe('new@example.com');
    expect(request.data.password).toBe('Password123');
    expect(request.data.accessScope).toBeUndefined();
    expect((res.data as any)?.password).toBeUndefined();
  });

  it('maps mutations to authoritative backend actions without local optimistic writes', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      okJson({ status: 'success', message: 'ok', user: { id: 'u1', fullName: 'A', role: 'SchoolDirector' } })
    );

    await userAdminService.updateUser({ id: 'u1', fullName: 'A' }, systemAdmin);
    await userAdminService.deleteUser('u1', systemAdmin);
    await userAdminService.resetPassword('u1', 'Password123', systemAdmin);
    await userAdminService.setStatus('u1', 'Suspended', systemAdmin);
    await userAdminService.revokeSessions('u1', systemAdmin);

    const actions = fetchSpy.mock.calls.map(call =>
      JSON.parse(String((call[1] as RequestInit).body)).action
    );
    expect(actions).toEqual([
      'saveUser',
      'deleteUser',
      'resetUserPassword',
      'toggleUserStatus',
      'revokeUserSessions',
    ]);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('never reports success when backend mutation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      errorJson(403, { status: 'error', code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'denied' })
    );

    expect((await userAdminService.deleteUser('u1', systemAdmin)).success).toBe(false);
    expect((await userAdminService.setStatus('u1', 'Suspended', systemAdmin)).success).toBe(false);
    expect((await userAdminService.revokeSessions('u1', systemAdmin)).success).toBe(false);
  });

  it('clears current session only for authentication lifecycle errors', async () => {
    const clearSpy = vi.spyOn(storageService, 'setCurrentUser');

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() =>
      errorJson(401, { status: 'error', code: 'SESSION_EXPIRED', message: 'expired' })
    );
    await userAdminService.getUsers(systemAdmin);
    expect(clearSpy).toHaveBeenCalledWith(null);

    clearSpy.mockClear();
    vi.mocked(globalThis.fetch).mockImplementationOnce(() =>
      errorJson(403, { status: 'error', code: 'ROLE_PERMISSION_DENIED', message: 'forbidden' })
    );
    await userAdminService.getUsers(systemAdmin);
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
