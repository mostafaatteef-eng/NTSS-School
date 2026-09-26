// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const sysAdminNoSchool: User = {
  ...sysAdmin,
  activeSchoolId: '',
};

const schoolAdmin: User = {
  id: 'sa-1',
  username: 'school',
  fullName: 'School Admin',
  role: 'SchoolAdmin',
  accessScope: 'SCHOOL',
  schoolId: 'SCH-BADR',
  allowedSchoolIds: ['SCH-BADR'],
  sessionToken: 'school-token',
};

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

function ok(body: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

function fail(status: number, body: any) {
  return Promise.resolve({ ok: false, status, json: async () => body } as Response);
}

describe('PHASE 3C-A16.1 — Authoritative teacher account admin service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/macros/s/test/exec');
    vi.spyOn(storageService, 'getCurrentUser').mockReturnValue(sysAdmin);
    vi.spyOn(storageService, 'setCurrentUser').mockImplementation(() => {});
  });

  it('requires active school context for GLOBAL SystemAdmin and makes no network request without it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await teacherAccountAdminService.getBundle(sysAdminNoSchool);
    expect(res.success).toBe(false);
    expect(res.code).toBe('SCHOOL_CONTEXT_REQUIRED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a GLOBAL active school outside allowedSchoolIds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await teacherAccountAdminService.getBundle({ ...sysAdmin, activeSchoolId: 'SCH-DAMIETTA' });
    expect(res.success).toBe(false);
    expect(res.code).toBe('ACCESS_DENIED_SCHOOL_SCOPE');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('loads teacher accounts and employees authoritatively without local teacher/employee caches', async () => {
    const localAccounts = vi.spyOn(storageService, 'getTeacherAccounts');
    const localEmployees = vi.spyOn(storageService, 'getEmployees');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      if (body.action === 'getTeacherAccounts') {
        return ok({
          status: 'success',
          data: [{
            id: 'TAC_EMP1',
            employeeId: 'EMP1',
            teacherCode: 'T001',
            username: 'teacher.one',
            status: 'Active',
            failedLoginAttempts: 2,
            passwordHash: 'SECRET',
            passwordSalt: 'SECRET',
          }],
        });
      }
      return ok({
        status: 'success',
        data: [{
          id: 'EMP1',
          name: 'أحمد علي',
          teacherCode: 'T001',
          jobTitle: 'معلم',
          employeeType: 'Teacher',
          specialization: 'الذكاء الاصطناعي',
          status: 'Active',
          nationalId: 'SECRET-NATIONAL-ID',
          phone: 'SECRET-PHONE',
          email: 'secret@example.com',
          salary: 99999,
        }],
      });
    });

    const res = await teacherAccountAdminService.getBundle(sysAdmin);
    expect(res.success).toBe(true);
    expect(localAccounts).not.toHaveBeenCalled();
    expect(localEmployees).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const bodies = fetchSpy.mock.calls.map(call => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies.map(body => body.action).sort()).toEqual(['getEmployees', 'getTeacherAccounts']);
    expect(bodies.every(body => body.sessionToken === 'sys-token')).toBe(true);
    expect(bodies.every(body => body.schoolId === undefined)).toBe(true);

    expect(res.data?.effectiveSchoolId).toBe('SCH-BADR');
    expect(res.data?.accounts[0].teacherName).toBe('أحمد علي');
    expect(res.data?.accounts[0].department).toBe('الذكاء الاصطناعي');
    expect((res.data?.accounts[0] as any).passwordHash).toBeUndefined();
    expect((res.data?.teachingStaff[0] as any).nationalId).toBeUndefined();
    expect((res.data?.teachingStaff[0] as any).phone).toBeUndefined();
    expect((res.data?.teachingStaff[0] as any).email).toBeUndefined();
    expect((res.data?.teachingStaff[0] as any).salary).toBeUndefined();
  });

  it('allows SchoolAdmin and TeacherAffairs through canonical permissions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      return ok({ status: 'success', data: body.action === 'getEmployees' ? [] : [] });
    });

    expect((await teacherAccountAdminService.getBundle(schoolAdmin)).success).toBe(true);
    expect((await teacherAccountAdminService.getBundle(teacherAffairs)).success).toBe(true);
  });

  it('blocks Teacher SELF scope before network', async () => {
    const teacher: User = {
      id: 't-1',
      fullName: 'Teacher',
      role: 'Teacher',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'teacher-token',
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await teacherAccountAdminService.getBundle(teacher);
    expect(res.success).toBe(false);
    expect(res.code).toBe('ROLE_PERMISSION_DENIED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('createAccount sends only target data plus session token and never writes localStorage', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      ok({
        status: 'success',
        message: 'created',
        data: {
          id: 'TAC_EMP1',
          employeeId: 'EMP1',
          teacherCode: 'T001',
          username: 't001',
          status: 'Active',
        },
      })
    );

    const res = await teacherAccountAdminService.createAccount('EMP1', 'T001', 'Strong#Pass9', sysAdmin);
    expect(res.success).toBe(true);
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.action).toBe('createTeacherAccount');
    expect(body.sessionToken).toBe('sys-token');
    expect(body.data).toEqual({
      employeeId: 'EMP1',
      username: 't001',
      temporaryPassword: 'Strong#Pass9',
    });
    expect(body.schoolId).toBeUndefined();
    expect(body.data.schoolId).toBeUndefined();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('maps reset and status mutations to backend and never returns false success on failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => ok({ status: 'success', message: 'reset' }))
      .mockImplementationOnce(() => ok({ status: 'success', message: 'status' }))
      .mockImplementationOnce(() => fail(403, { status: 'error', code: 'ROLE_PERMISSION_DENIED', message: 'denied' }));

    expect((await teacherAccountAdminService.resetPassword('EMP1', 'Strong#Pass9', schoolAdmin)).success).toBe(true);
    expect((await teacherAccountAdminService.setStatus('EMP1', 'Suspended', schoolAdmin)).success).toBe(true);
    expect((await teacherAccountAdminService.setStatus('EMP1', 'Active', schoolAdmin)).success).toBe(false);

    const bodies = fetchSpy.mock.calls.map(call => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies.map(body => body.action)).toEqual([
      'resetTeacherPassword',
      'setTeacherAccountStatus',
      'setTeacherAccountStatus',
    ]);
  });

  it('clears staff session on session lifecycle failure but preserves it on ordinary permission failure', async () => {
    const clearSpy = vi.spyOn(storageService, 'setCurrentUser');
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => fail(401, { status: 'error', code: 'SESSION_EXPIRED', message: 'expired' }))
      .mockImplementationOnce(() => fail(403, { status: 'error', code: 'ROLE_PERMISSION_DENIED', message: 'forbidden' }));

    await teacherAccountAdminService.setStatus('EMP1', 'Suspended', sysAdmin);
    expect(clearSpy).toHaveBeenCalledWith(null);

    clearSpy.mockClear();
    await teacherAccountAdminService.setStatus('EMP1', 'Suspended', sysAdmin);
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
