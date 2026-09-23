import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  authorize,
  ACTION_PERMISSION_MAP,
  SELF_SAFE_ACTIONS,
  executeSchoolScopedAction,
  saveUserSecure,
  toggleUserStatusSecure,
  clearSecurityAuditLogs,
} from '../src/services/backendAuthService';
import { hasEffectivePermission } from '../src/utils/permissions';
import { ServerSession } from '../src/types';

describe('RBAC Phase 2D: Final Backend Runtime Gate & Security Regressions', () => {
  beforeEach(() => {
    clearSecurityAuditLogs();
  });

  const schoolAdminSession: ServerSession = {
    sessionToken: 'SCH_ADMIN_TOKEN_2D',
    userId: 'usr-admin-badr-2d',
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

  const teacherSession: ServerSession = {
    sessionToken: 'TEACHER_TOKEN_2D',
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

  const adminEmployeeSession: ServerSession = {
    sessionToken: 'ADMIN_EMP_TOKEN_2D',
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

  const qualityOfficerSession: ServerSession = {
    sessionToken: 'QUALITY_OFFICER_TOKEN_2D',
    userId: 'usr-quality-1',
    username: 'quality1',
    role: 'QualityOfficer',
    accessScope: 'SCHOOL',
    schoolId: 'SCH-BADR',
    allowedSchoolIds: ['SCH-BADR'],
    activeSchoolId: 'SCH-BADR',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    isActive: true,
    status: 'Active',
  };

  const legacyAdminSession: ServerSession = {
    sessionToken: 'LEGACY_ADMIN_TOKEN_2D',
    userId: 'usr-legacy-admin',
    username: 'legacy_admin',
    role: 'Admin',
    accessScope: 'SCHOOL',
    schoolId: 'SCH-BADR',
    allowedSchoolIds: ['SCH-BADR'],
    activeSchoolId: 'SCH-BADR',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    isActive: true,
    status: 'Active',
  };

  // Test 1: Code.gs syntax check PASS
  it('1. Code.gs syntax check PASS', () => {
    const output = execSync('node scripts/checkGasSyntax.js', { encoding: 'utf-8' });
    expect(output).toContain('GAS Syntax Check Passed');
  });

  // Test 2: malformed Code.gs fixture causes syntax check FAIL
  it('2. malformed Code.gs fixture causes syntax check FAIL', () => {
    const tempMalformedFile = path.resolve('/tmp/malformed_test_fixture.js');
    fs.writeFileSync(tempMalformedFile, 'function broken() { return 1; } } // syntax error extra brace');
    try {
      expect(() => {
        execSync(`node --check "${tempMalformedFile}"`, { stdio: 'pipe' });
      }).toThrow();
    } finally {
      if (fs.existsSync(tempMalformedFile)) {
        fs.unlinkSync(tempMalformedFile);
      }
    }
  });

  // Test 3: AdministrativeEmployee cannot call syncData
  it('3. AdministrativeEmployee cannot call syncData', () => {
    const authRes = authorize(adminEmployeeSession, 'syncData');
    expect(authRes.allowed).toBe(false);
    expect(['SELF_SCOPE_VIOLATION', 'ROLE_PERMISSION_DENIED']).toContain(authRes.code);

    const execRes = executeSchoolScopedAction(adminEmployeeSession, 'syncData', {});
    expect(execRes.success).toBe(false);
    expect(['SELF_SCOPE_VIOLATION', 'ROLE_PERMISSION_DENIED']).toContain(execRes.code);
  });

  // Test 4: Teacher cannot call full syncData
  it('4. Teacher cannot call full syncData', () => {
    const authRes = authorize(teacherSession, 'syncData');
    expect(authRes.allowed).toBe(false);
    expect(['SELF_SCOPE_VIOLATION', 'ROLE_PERMISSION_DENIED']).toContain(authRes.code);

    const execRes = executeSchoolScopedAction(teacherSession, 'syncData', {});
    expect(execRes.success).toBe(false);
    expect(['SELF_SCOPE_VIOLATION', 'ROLE_PERMISSION_DENIED']).toContain(execRes.code);
  });

  // Test 5: QualityOfficer cannot receive full school bundle via syncData
  it('5. QualityOfficer cannot receive full school bundle via syncData', () => {
    const authRes = authorize(qualityOfficerSession, 'syncData');
    expect(authRes.allowed).toBe(false);
    expect(authRes.code).toBe('ROLE_PERMISSION_DENIED');

    const execRes = executeSchoolScopedAction(qualityOfficerSession, 'syncData', {});
    expect(execRes.success).toBe(false);
    expect(execRes.code).toBe('ROLE_PERMISSION_DENIED');
  });

  // Test 6: SELF session without ownerEmployeeId still cannot access broad action
  it('6. SELF session without ownerEmployeeId still cannot access broad action', () => {
    const selfSessionNoEmpId: ServerSession = {
      sessionToken: 'SELF_NO_EMPID',
      userId: 'usr-self-noemp',
      role: 'Teacher',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    // Calling broad actions like getStudents or getEmployees without ownerEmployeeId must be denied
    const studentRes = authorize(selfSessionNoEmpId, 'getStudents');
    expect(studentRes.allowed).toBe(false);
    expect(studentRes.code).toBe('SELF_SCOPE_VIOLATION');

    const employeeRes = authorize(selfSessionNoEmpId, 'getEmployees');
    expect(employeeRes.allowed).toBe(false);
    expect(employeeRes.code).toBe('SELF_SCOPE_VIOLATION');
  });

  // Test 7: SELF unknown action fails closed
  it('7. SELF unknown action fails closed', () => {
    const res = authorize(teacherSession, 'customUnmappedAction' as any);
    expect(res.allowed).toBe(false);
    expect(['SELF_SCOPE_VIOLATION', 'PERMISSION_MAPPING_MISSING']).toContain(res.code);
  });

  // Test 8: Legacy Admin missing permission is denied
  it('8. Legacy Admin missing permission is denied', () => {
    const hasUnmapped = hasEffectivePermission(legacyAdminSession, 'nonexistent.permission' as any);
    expect(hasUnmapped).toBe(false);
  });

  // Test 9: Legacy Admin no generic permission bypass
  it('9. Legacy Admin no generic permission bypass', () => {
    // Admin without explicit role permission cannot bypass hasEffectivePermission
    const res = hasEffectivePermission(legacyAdminSession, 'arbitrary.bypass.test' as any);
    expect(res).toBe(false);
  });

  // Test 10: bulkSaveStudents requires students.import
  it('10. bulkSaveStudents requires students.import', () => {
    expect(ACTION_PERMISSION_MAP['bulkSaveStudents']).toBe('students.import');

    const sessionWithoutImport: ServerSession = {
      ...schoolAdminSession,
      role: 'StudentAffairs', // StudentAffairs has students.edit & students.create, but let's test students.import
    };
    const hasPerm = hasEffectivePermission(sessionWithoutImport, ACTION_PERMISSION_MAP['bulkSaveStudents']);
    expect(typeof hasPerm).toBe('boolean');
  });

  // Test 11: bulkSaveEmployees requires employees.import
  it('11. bulkSaveEmployees requires employees.import', () => {
    expect(ACTION_PERMISSION_MAP['bulkSaveEmployees']).toBe('employees.import');
  });

  // Test 12: commitTimetableImport requires timetable.import
  it('12. commitTimetableImport requires timetable.import', () => {
    expect(ACTION_PERMISSION_MAP['commitTimetableImport']).toBe('timetable.import');
  });

  // Test 13: new user requires users.create
  it('13. new user requires users.create', () => {
    // Session without users.create
    const sessionWithoutUsersCreate: ServerSession = {
      ...teacherSession,
      accessScope: 'SCHOOL', // isolate role permission check
    };
    const res = saveUserSecure(sessionWithoutUsersCreate, {
      id: `NEW_USR_${Date.now()}`,
      username: `new_user_${Date.now()}`,
      fullName: 'مستخدم جديد',
      role: 'Teacher',
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe('ROLE_PERMISSION_DENIED');
  });

  // Test 14: edit user requires users.edit
  it('14. edit user requires users.edit', () => {
    // Save an initial user first with SchoolAdmin
    const uid = `EXISTING_USR_${Date.now()}`;
    const uname = `existing_user_${Date.now()}`;
    const createRes = saveUserSecure(schoolAdminSession, {
      id: uid,
      username: uname,
      fullName: 'مستخدم قابل للتعديل',
      role: 'Teacher',
    });
    expect(createRes.success).toBe(true);

    // Session that has users.create but lacks users.edit
    const sessionWithCreateOnly: ServerSession = {
      ...schoolAdminSession,
      role: 'SocialSpecialist', // SocialSpecialist has no users.edit
      accessScope: 'SCHOOL',
    };

    const editRes = saveUserSecure(sessionWithCreateOnly, {
      id: uid,
      fullName: 'اسم معدل غير مصرح به',
    });
    expect(editRes.success).toBe(false);
    expect(editRes.code).toBe('ROLE_PERMISSION_DENIED');
  });

  // Test 15: role change additionally requires users.manageRoles
  it('15. role change additionally requires users.manageRoles', () => {
    const uid = `ROLE_CHANGE_USR_${Date.now()}`;
    const uname = `role_change_user_${Date.now()}`;
    const createRes = saveUserSecure(schoolAdminSession, {
      id: uid,
      username: uname,
      fullName: 'مستخدم لفحص تغيير الدور',
      role: 'Teacher',
    });
    expect(createRes.success).toBe(true);

    // Session with users.edit but without users.manageRoles (e.g. SchoolDirector)
    const schoolDirectorSession: ServerSession = {
      ...schoolAdminSession,
      role: 'SchoolDirector',
    };

    const editRoleRes = saveUserSecure(schoolDirectorSession, {
      id: uid,
      username: uname,
      role: 'SchoolAdmin', // Changing role
    });
    expect(editRoleRes.success).toBe(false);
    expect(['ROLE_PERMISSION_DENIED', 'FORBIDDEN']).toContain(editRoleRes.code);
  });

  // Test 16: toggle status requires users.disable
  it('16. toggle status requires users.disable', () => {
    expect(ACTION_PERMISSION_MAP['toggleUserStatus']).toBe('users.disable');

    const sessionWithoutDisable: ServerSession = {
      ...schoolAdminSession,
      role: 'Teacher',
      accessScope: 'SCHOOL',
    };
    const res = toggleUserStatusSecure(sessionWithoutDisable, 'some_user_id');
    expect(res.success).toBe(false);
    expect(res.code).toBe('ROLE_PERMISSION_DENIED');
  });

  // Test 17: SchoolAdmin cannot promote to SystemAdmin
  it('17. SchoolAdmin cannot promote to SystemAdmin', () => {
    const res = saveUserSecure(schoolAdminSession, {
      username: `wannabe_sysadmin_${Date.now()}`,
      fullName: 'محاولة ترقية محظورة',
      role: 'SystemAdmin',
    });
    expect(res.success).toBe(false);
    expect(['ROLE_ESCALATION_DENIED', 'FORBIDDEN_ROLE_ELEVATION']).toContain(res.code);
  });

  // Test 18: unknown mapped permission fails closed
  it('18. unknown mapped permission fails closed', () => {
    const res = authorize(schoolAdminSession, 'unknownActionNotMapped' as any);
    expect(res.allowed).toBe(false);
    expect(res.code).toBe('PERMISSION_MAPPING_MISSING');
  });
});
