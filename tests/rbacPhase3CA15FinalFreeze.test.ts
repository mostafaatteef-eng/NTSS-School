import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteUserSecure,
  getUsersListSecure,
  resetMasterUsersStore,
  resetUserPasswordSecure,
  revokeUserSessionsSecure,
  sanitizeUserDTO,
  saveUserSecure,
  setMasterSchoolRegistry,
  toggleUserStatusSecure,
  BackendUserRecord,
} from '../src/services/backendAuthService';
import { ServerSession } from '../src/types';

describe('PHASE 3C-A15 FINAL — User authority freeze hardening', () => {
  const narrowSystemAdmin: ServerSession = {
    userId: 'usr-narrow-admin',
    username: 'narrow_admin',
    email: 'narrow@ntss.edu.eg',
    role: 'SystemAdmin',
    accessScope: 'GLOBAL',
    schoolId: '',
    activeSchoolId: '',
    allowedSchoolIds: ['SCH-BADR'],
    sessionToken: 'token-narrow',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  const fullSystemAdmin: ServerSession = {
    userId: 'usr-full-admin',
    username: 'full_admin',
    email: 'full@ntss.edu.eg',
    role: 'SystemAdmin',
    accessScope: 'GLOBAL',
    schoolId: '',
    activeSchoolId: '',
    allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'],
    sessionToken: 'token-full',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  beforeEach(() => {
    resetMasterUsersStore();
    setMasterSchoolRegistry([
      { schoolId: 'SCH-BADR', schoolCode: 'BADR', schoolName: 'مدرسة بدر', status: 'Active', spreadsheetId: 'ss-badr' },
      { schoolId: 'SCH-ALNOOR', schoolCode: 'NOOR', schoolName: 'مدرسة النور', status: 'Active', spreadsheetId: 'ss-noor' },
    ]);
  });

  it('marks an unknown persisted role for review with zero school/global authority', () => {
    const dirty: BackendUserRecord = {
      id: 'usr-legacy-unknown',
      username: 'legacy_unknown',
      email: 'legacy@example.com',
      fullName: 'Legacy Unknown',
      role: 'MysterySuperRole',
      accessScope: 'GLOBAL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'],
      employeeId: 'EMP-1',
      status: 'Active',
      passwordHash: 'secret',
    };

    const dto = sanitizeUserDTO(dirty);
    expect(dto.role).toBe('NeedsAdminReview');
    expect(dto.status).toBe('NeedsAdminReview');
    expect(dto.schoolId).toBe('');
    expect(dto.allowedSchoolIds).toEqual([]);
    expect(dto.employeeId).toBeUndefined();
    expect((dto as any).passwordHash).toBeUndefined();
  });

  it('does not list a broader SystemAdmin to a narrower SystemAdmin', () => {
    const result = getUsersListSecure(narrowSystemAdmin);
    expect(result.success).toBe(true);
    expect(result.data?.some(user => user.id === 'usr-sysadmin-1')).toBe(false);
  });

  it('blocks narrow SystemAdmin destructive operations against broader SystemAdmin', () => {
    const targetId = 'usr-sysadmin-1';

    const deletion = deleteUserSecure(narrowSystemAdmin, targetId);
    const passwordReset = resetUserPasswordSecure(narrowSystemAdmin, targetId);
    const statusChange = toggleUserStatusSecure(narrowSystemAdmin, targetId, 'Suspended');
    const revoke = revokeUserSessionsSecure(narrowSystemAdmin, targetId);

    for (const result of [deletion, passwordReset, statusChange, revoke]) {
      expect(result.success).toBe(false);
      expect(result.code).toBe('ACCESS_DENIED_SCHOOL_SCOPE');
    }
  });

  it('allows an in-scope SystemAdmin to view the existing SystemAdmin', () => {
    const result = getUsersListSecure(fullSystemAdmin);
    expect(result.success).toBe(true);
    expect(result.data?.some(user => user.id === 'usr-sysadmin-1')).toBe(true);
  });

  it('preserves an existing SystemAdmin allowedSchoolIds when omitted from a safe edit', () => {
    const result = saveUserSecure(fullSystemAdmin, {
      id: 'usr-sysadmin-1',
      fullName: 'مدير النظام العام - محدث',
    });

    expect(result.success).toBe(true);
    expect(result.user?.allowedSchoolIds).toEqual(['SCH-BADR', 'SCH-ALNOOR']);
    expect(result.user?.accessScope).toBe('GLOBAL');
    expect(result.user?.schoolId).toBe('');
  });
});
