import { describe, it, expect, beforeEach } from 'vitest';
import {
  authorize,
  ACTION_PERMISSION_MAP,
  executeSchoolScopedAction,
  saveUserSecure,
  clearSecurityAuditLogs,
  CANONICAL_BACKEND_VERSION,
  getIsolatedSchoolStore,
  resetMasterUsersStore,
} from '../src/services/backendAuthService';
import { hasEffectivePermission } from '../src/utils/permissions';
import { ServerSession } from '../src/types';
import fs from 'fs';
import path from 'path';

describe('RBAC Phase 2E: Self Data Enforcement & Backend Deployment Readiness', () => {
  beforeEach(() => {
    clearSecurityAuditLogs();
    resetMasterUsersStore();
    const badrStore = getIsolatedSchoolStore('SCH-BADR');
    if (badrStore) {
      badrStore.leaves = [
        { id: 'LEV-OWN-1', employeeId: 'EMP-AE1', schoolId: 'SCH-BADR', status: 'Pending' },
        { id: 'LEV-OTHER-1', employeeId: 'EMP-OTHER-99', schoolId: 'SCH-BADR', status: 'Pending' },
      ];
      badrStore.permissions = [
        { id: 'PERM-OWN-1', employeeId: 'EMP-AE1', schoolId: 'SCH-BADR', status: 'Pending' },
        { id: 'PERM-OTHER-1', employeeId: 'EMP-OTHER-99', schoolId: 'SCH-BADR', status: 'Pending' },
      ];
    }
  });

  const adminEmployeeSession: ServerSession = {
    sessionToken: 'ADMIN_EMP_TOKEN_2E',
    userId: 'usr-admin-emp-1',
    employeeId: 'EMP-AE1',
    username: 'adminemp1',
    role: 'AdministrativeEmployee',
    accessScope: 'SELF',
    schoolId: 'SCH-BADR',
    allowedSchoolIds: ['SCH-BADR'],
    activeSchoolId: 'SCH-BADR',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    isActive: true,
    status: 'Active',
  };

  const teacherSession: ServerSession = {
    sessionToken: 'TEACHER_TOKEN_2E',
    userId: 'usr-teacher-1',
    employeeId: 'EMP-T1',
    username: 'teacher1',
    role: 'Teacher',
    accessScope: 'SELF',
    schoolId: 'SCH-BADR',
    allowedSchoolIds: ['SCH-BADR'],
    activeSchoolId: 'SCH-BADR',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    isActive: true,
    status: 'Active',
  };

  const schoolAdminSession: ServerSession = {
    sessionToken: 'SCH_ADMIN_TOKEN_2E',
    userId: 'usr-admin-badr-2e',
    username: 'admin_badr',
    role: 'SchoolAdmin',
    accessScope: 'SCHOOL',
    schoolId: 'SCH-BADR',
    allowedSchoolIds: ['SCH-BADR'],
    activeSchoolId: 'SCH-BADR',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    isActive: true,
    status: 'Active',
  };

  // 1. AdministrativeEmployee isolation
  it('1. AdministrativeEmployee is strictly denied general leaves.view and leaves.create', () => {
    expect(hasEffectivePermission(adminEmployeeSession, 'leaves.view')).toBe(false);
    expect(hasEffectivePermission(adminEmployeeSession, 'leaves.create')).toBe(false);
    expect(hasEffectivePermission(adminEmployeeSession, 'leaves.own.view')).toBe(true);
    expect(hasEffectivePermission(adminEmployeeSession, 'leaves.own.create')).toBe(true);
  });

  // 2. Teacher isolation
  it('2. Teacher is strictly denied general leaves.view and leaves.create but granted own permissions', () => {
    expect(hasEffectivePermission(teacherSession, 'leaves.view')).toBe(false);
    expect(hasEffectivePermission(teacherSession, 'leaves.create')).toBe(false);
    expect(hasEffectivePermission(teacherSession, 'leaves.own.view')).toBe(true);
    expect(hasEffectivePermission(teacherSession, 'leaves.own.create')).toBe(true);
  });

  // 3. getLeaves for SELF returns ONLY own employeeId records
  it('3. getLeaves for SELF returns exclusively own employee records and isolates other school leaves', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'getLeaves', {});
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data.length).toBe(1);
    expect(res.data[0].id).toBe('LEV-OWN-1');
    expect(res.data[0].employeeId).toBe('EMP-AE1');
  });

  // 4. getLeaves for SELF ignores/rejects attempts to query other employees via payload
  it('4. getLeaves for SELF ignores forged employeeId in payload and returns only authenticated employee leaves', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'getLeaves', { employeeId: 'EMP-OTHER-99' });
    expect(res.success).toBe(true);
    expect(res.data.length).toBe(1);
    expect(res.data[0].employeeId).toBe('EMP-AE1');
  });

  // 5. getPermissions for SELF returns ONLY own employeeId records
  it('5. getPermissions for SELF returns exclusively own permissions', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'getPermissions', {});
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data.length).toBe(1);
    expect(res.data[0].id).toBe('PERM-OWN-1');
    expect(res.data[0].employeeId).toBe('EMP-AE1');
  });

  // 6. saveLeave for SELF forces session employeeId and creates leave record successfully
  it('6. saveLeave for SELF enforces session employeeId on create', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'saveLeave', {
      id: 'LEV-NEW-1',
      type: 'Annual',
      reason: 'سفر',
    });
    expect(res.success).toBe(true);
    const badrStore = getIsolatedSchoolStore('SCH-BADR');
    const saved = badrStore?.leaves.find(l => l.id === 'LEV-NEW-1');
    expect(saved).toBeDefined();
    expect(saved?.employeeId).toBe('EMP-AE1');
    expect(saved?.schoolId).toBe('SCH-BADR');
  });

  // 7. saveLeave for SELF rejects forged payload.employeeId with SELF_SCOPE_VIOLATION
  it('7. saveLeave for SELF rejects forged payload.employeeId with SELF_SCOPE_VIOLATION', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'saveLeave', {
      id: 'LEV-ATTACK-1',
      employeeId: 'EMP-FORGED-VICTIM',
      type: 'Sick',
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe('SELF_SCOPE_VIOLATION');
  });

  // 8. saveLeave edit existing leave owned by SELF succeeds
  it('8. saveLeave editing existing leave owned by self succeeds', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'saveLeave', {
      id: 'LEV-OWN-1',
      reason: 'تحديث سبب الإجازة الشخصية',
    });
    expect(res.success).toBe(true);
    const badrStore = getIsolatedSchoolStore('SCH-BADR');
    const updated = badrStore?.leaves.find(l => l.id === 'LEV-OWN-1');
    expect(updated?.reason).toBe('تحديث سبب الإجازة الشخصية');
    expect(updated?.employeeId).toBe('EMP-AE1');
  });

  // 9. saveLeave edit existing leave owned by another employee is rejected with SELF_SCOPE_VIOLATION
  it('9. saveLeave editing existing leave of another employee is rejected with SELF_SCOPE_VIOLATION', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'saveLeave', {
      id: 'LEV-OTHER-1',
      reason: 'محاولة تعديل إجازة زميل',
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe('SELF_SCOPE_VIOLATION');
  });

  // 10. saveLeave for SELF user attempting to set status to Approved is rejected with ROLE_PERMISSION_DENIED
  it('10. saveLeave for SELF user attempting to set approval status is rejected with ROLE_PERMISSION_DENIED', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'saveLeave', {
      id: 'LEV-OWN-1',
      status: 'Approved',
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe('ROLE_PERMISSION_DENIED');
  });

  // 11. savePermission for SELF forces session employeeId and saves successfully
  it('11. savePermission for SELF enforces session employeeId and saves successfully', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'savePermission', {
      id: 'PERM-NEW-1',
      hours: 2,
      reason: 'ظرف عائلي',
    });
    expect(res.success).toBe(true);
    const badrStore = getIsolatedSchoolStore('SCH-BADR');
    const saved = badrStore?.permissions?.find(p => p.id === 'PERM-NEW-1');
    expect(saved).toBeDefined();
    expect(saved?.employeeId).toBe('EMP-AE1');
    expect(saved?.schoolId).toBe('SCH-BADR');
  });

  // 12. savePermission for SELF rejects forged payload.employeeId with SELF_SCOPE_VIOLATION
  it('12. savePermission for SELF rejects forged payload.employeeId with SELF_SCOPE_VIOLATION', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'savePermission', {
      id: 'PERM-FORGED-1',
      employeeId: 'EMP-VICTIM-99',
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe('SELF_SCOPE_VIOLATION');
  });

  // 13. savePermission edit existing permission owned by another employee is rejected with SELF_SCOPE_VIOLATION
  it('13. savePermission editing existing permission of another employee is rejected with SELF_SCOPE_VIOLATION', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'savePermission', {
      id: 'PERM-OTHER-1',
      reason: 'تعديل إذن شخص آخر',
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe('SELF_SCOPE_VIOLATION');
  });

  // 14. deleteLeave is blocked for SELF scope with ROLE_PERMISSION_DENIED
  it('14. deleteLeave is strictly blocked for SELF scope accounts', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'deleteLeave', { id: 'LEV-OWN-1' });
    expect(res.success).toBe(false);
    expect(['ROLE_PERMISSION_DENIED', 'SELF_SCOPE_VIOLATION']).toContain(res.code);
  });

  // 15. deletePermission is blocked for SELF scope with ROLE_PERMISSION_DENIED
  it('15. deletePermission is strictly blocked for SELF scope accounts', () => {
    const res = executeSchoolScopedAction(adminEmployeeSession, 'deletePermission', { id: 'PERM-OWN-1' });
    expect(res.success).toBe(false);
    expect(['ROLE_PERMISSION_DENIED', 'SELF_SCOPE_VIOLATION']).toContain(res.code);
  });

  // 16. Dynamic Pre-Authorization saveUser: user with only users.edit can edit existing user, but cannot create
  it('16. saveUser dynamic pre-authorization permits users.edit on existing user but denies creating new user', () => {
    // Custom session with ONLY users.edit (no users.create)
    const editorOnlySession: ServerSession = {
      ...schoolAdminSession,
      sessionToken: 'EDITOR_ONLY_TOKEN',
      role: 'SchoolAdmin',
      customPermissions: {
        'users.edit': true,
        'users.create': false,
      },
    };

    // Attempt to edit existing user usr-admin-badr -> allowed
    const authEdit = authorize(editorOnlySession, 'saveUser', {
      resourceId: 'usr-admin-badr',
      targetUserId: 'usr-admin-badr',
    });
    expect(authEdit.allowed).toBe(true);

    // Attempt to create new user usr-new-brand -> rejected because it dynamically resolves to users.create
    const authCreate = authorize(editorOnlySession, 'saveUser', {
      resourceId: 'usr-brand-new-999',
      targetUserId: 'usr-brand-new-999',
    });
    expect(authCreate.allowed).toBe(false);
    expect(authCreate.code).toBe('ROLE_PERMISSION_DENIED');
  });

  // 17. Dynamic Pre-Authorization saveUser: user with only users.create can create new user, but cannot edit existing
  it('17. saveUser dynamic pre-authorization permits users.create on new user but denies editing existing user', () => {
    const creatorOnlySession: ServerSession = {
      ...schoolAdminSession,
      sessionToken: 'CREATOR_ONLY_TOKEN',
      role: 'SchoolAdmin',
      customPermissions: {
        'users.create': true,
        'users.edit': false,
      },
    };

    // Creating new user -> allowed
    const authCreate = authorize(creatorOnlySession, 'saveUser', {
      resourceId: 'usr-brand-new-1000',
      targetUserId: 'usr-brand-new-1000',
    });
    expect(authCreate.allowed).toBe(true);

    // Editing existing user -> rejected because it dynamically resolves to users.edit
    const authEdit = authorize(creatorOnlySession, 'saveUser', {
      resourceId: 'usr-admin-badr',
      targetUserId: 'usr-admin-badr',
    });
    expect(authEdit.allowed).toBe(false);
    expect(authEdit.code).toBe('ROLE_PERMISSION_DENIED');
  });

  // 18. SchoolAdmin privilege escalation blocked and backend version is 5.2.0-AUTH-MULTISCHOOL
  it('18. SchoolAdmin privilege escalation is blocked and backend version is 5.2.0-AUTH-MULTISCHOOL', () => {
    // 18a: SchoolAdmin cannot escalate to SystemAdmin
    const escalationRes = saveUserSecure(schoolAdminSession, {
      id: 'usr-attempt-sysadmin',
      username: 'evil_sysadmin',
      fullName: 'مستخدم محظور',
      role: 'SystemAdmin',
      schoolId: 'SCH-BADR',
    });
    expect(escalationRes.success).toBe(false);
    expect(escalationRes.code).toBe('ROLE_ESCALATION_DENIED');

    // 18b: SchoolAdmin cannot modify existing SystemAdmin
    const sysAdminEditRes = saveUserSecure(schoolAdminSession, {
      id: 'usr-sysadmin-1',
      username: 'sysadmin',
      fullName: 'تعديل غير مصرح',
      role: 'SchoolAdmin',
      schoolId: 'SCH-BADR',
    });
    expect(sysAdminEditRes.success).toBe(false);
    expect(sysAdminEditRes.code).toBe('FORBIDDEN');

    // 18c: Verify canonical backend version matches 5.2.0-AUTH-MULTISCHOOL
    expect(CANONICAL_BACKEND_VERSION).toBe('5.2.0-AUTH-MULTISCHOOL');

    // 18d: Verify Code.gs code contains CANONICAL_BACKEND_VERSION = '5.2.0-AUTH-MULTISCHOOL'
    const codeGsPath = path.resolve(__dirname, '../google-apps-script/Code.gs');
    const codeGsContent = fs.readFileSync(codeGsPath, 'utf8');
    expect(codeGsContent).toContain("var CANONICAL_BACKEND_VERSION = '5.2.0-AUTH-MULTISCHOOL';");
  });
});
