import { describe, it, expect, beforeEach } from 'vitest';
import {
  authorize,
  createAuthoritativeSession,
  getSchoolSpreadsheet,
  getSecurityAuditLogs,
  clearSecurityAuditLogs,
  resolveSchoolContext,
  sanitizeSchoolDTO,
} from '../src/services/backendAuthService';
import { hasEffectivePermission } from '../src/utils/permissions';
import { MasterSchoolRegistryRecord, ServerSession } from '../src/types';

describe('RBAC Phase 2: Backend Authorization Engine & Multi-School Isolation', () => {
  beforeEach(() => {
    clearSecurityAuditLogs();
  });

  // Test 1: SystemAdmin can access allowed school A
  it('1. SystemAdmin can access allowed school A', () => {
    const sysAdminSession: ServerSession = {
      sessionToken: 'SYS_ADMIN_TOKEN_1',
      userId: 'usr-sysadmin-1',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const result = authorize(sysAdminSession, 'students.view', { schoolId: 'SCH-BADR' });
    expect(result.allowed).toBe(true);
    expect(result.effectiveSchoolId).toBe('SCH-BADR');
  });

  // Test 2: SystemAdmin can access allowed school B
  it('2. SystemAdmin can access allowed school B', () => {
    const sysAdminSession: ServerSession = {
      sessionToken: 'SYS_ADMIN_TOKEN_2',
      userId: 'usr-sysadmin-1',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const result = authorize(sysAdminSession, 'students.view', { schoolId: 'SCH-ALNOOR' });
    expect(result.allowed).toBe(true);
    expect(result.effectiveSchoolId).toBe('SCH-ALNOOR');
  });

  // Test 3: SystemAdmin cannot access school outside allowedSchoolIds
  it('3. SystemAdmin cannot access school outside allowedSchoolIds', () => {
    const sysAdminSession: ServerSession = {
      sessionToken: 'SYS_ADMIN_TOKEN_3',
      userId: 'usr-sysadmin-1',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'], // Only BADR and ALNOOR
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const result = authorize(sysAdminSession, 'students.view', { schoolId: 'SCH-OUTSIDE' });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('ACCESS_DENIED_SCHOOL_SCOPE');
  });

  // Test 4: SchoolAdmin A can access school A
  it('4. SchoolAdmin A can access A', () => {
    const schoolAdminA: ServerSession = {
      sessionToken: 'SCH_ADMIN_A_TOKEN',
      userId: 'usr-admin-badr',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const result = authorize(schoolAdminA, 'students.view', { schoolId: 'SCH-BADR' });
    expect(result.allowed).toBe(true);
    expect(result.effectiveSchoolId).toBe('SCH-BADR');
  });

  // Test 5: SchoolAdmin A cannot access school B
  it('5. SchoolAdmin A cannot access B', () => {
    const schoolAdminA: ServerSession = {
      sessionToken: 'SCH_ADMIN_A_TOKEN',
      userId: 'usr-admin-badr',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const result = authorize(schoolAdminA, 'students.view', { schoolId: 'SCH-ALNOOR' });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('SCHOOL_CONTEXT_MISMATCH');
  });

  // Test 6: Payload schoolId cannot override SchoolAdmin session
  it('6. payload schoolId cannot override SchoolAdmin session', () => {
    const schoolAdminA: ServerSession = {
      sessionToken: 'SCH_ADMIN_A_TOKEN',
      userId: 'usr-admin-badr',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    // Client maliciously attempts to send schoolId = 'SCH-ALNOOR' in payload
    const result = authorize(schoolAdminA, 'students.create', { schoolId: 'SCH-ALNOOR' });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('SCHOOL_CONTEXT_MISMATCH');
  });

  // Test 7: Resource from school B is rejected even if ID is known
  it('7. resource from school B is rejected even if ID is known', () => {
    const schoolAdminA: ServerSession = {
      sessionToken: 'SCH_ADMIN_A_TOKEN',
      userId: 'usr-admin-badr',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    // Resource belongs to School B (SCH-ALNOOR) with known ID 'STU-9999'
    const result = authorize(schoolAdminA, 'students.delete', {
      schoolId: 'SCH-ALNOOR',
      resourceId: 'STU-9999',
    });
    expect(result.allowed).toBe(false);
    expect(['SCHOOL_CONTEXT_MISMATCH', 'CROSS_SCHOOL_ACCESS_DENIED']).toContain(result.code);
  });

  // Test 8: Teacher can access own resource
  it('8. Teacher can access own resource', () => {
    const teacherSession: ServerSession = {
      sessionToken: 'TEACHER_TOKEN_1',
      userId: 'usr-teacher-10',
      employeeId: 'EMP-10',
      role: 'Teacher',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const result = authorize(teacherSession, 'leaves.own.view', {
      schoolId: 'SCH-BADR',
      ownerEmployeeId: 'EMP-10',
      resourceId: 'LEV-555',
    });
    expect(result.allowed).toBe(true);
    expect(result.effectiveSchoolId).toBe('SCH-BADR');
  });

  // Test 9: Teacher cannot access another employee resource
  it('9. Teacher cannot access another employee resource', () => {
    const teacherSession: ServerSession = {
      sessionToken: 'TEACHER_TOKEN_1',
      userId: 'usr-teacher-10',
      employeeId: 'EMP-10',
      role: 'Teacher',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    // Attempting to access leave of EMP-99 (different employee)
    const result = authorize(teacherSession, 'leaves.own.view', {
      schoolId: 'SCH-BADR',
      ownerEmployeeId: 'EMP-99',
      resourceId: 'LEV-777',
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('SELF_SCOPE_VIOLATION');
  });

  // Test 10: AdministrativeEmployee can access own leave request
  it('10. AdministrativeEmployee can access own leave request', () => {
    const adminEmpSession: ServerSession = {
      sessionToken: 'ADMIN_EMP_TOKEN',
      userId: 'usr-adminemp-20',
      employeeId: 'EMP-20',
      role: 'AdministrativeEmployee',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const result = authorize(adminEmpSession, 'leaves.own.view', {
      schoolId: 'SCH-BADR',
      ownerEmployeeId: 'EMP-20',
      resourceId: 'LEV-888',
    });
    expect(result.allowed).toBe(true);
  });

  // Test 11: AdministrativeEmployee cannot access all staff
  it('11. AdministrativeEmployee cannot access all staff', () => {
    const adminEmpSession: ServerSession = {
      sessionToken: 'ADMIN_EMP_TOKEN',
      userId: 'usr-adminemp-20',
      employeeId: 'EMP-20',
      role: 'AdministrativeEmployee',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const result = authorize(adminEmpSession, 'employees.view', {
      schoolId: 'SCH-BADR',
    });
    expect(result.allowed).toBe(false);
    expect(['SELF_SCOPE_VIOLATION', 'ROLE_PERMISSION_DENIED']).toContain(result.code);
  });

  // Test 12: Legacy Admin is not GLOBAL
  it('12. Legacy Admin is not GLOBAL', () => {
    // 12.1 Automatic session creation assigns SCHOOL, never GLOBAL
    const createdSession = createAuthoritativeSession({
      id: 'legacy-admin-1',
      username: 'admin',
      role: 'Admin',
      schoolId: 'SCH-BADR',
    });
    expect(createdSession.accessScope).toBe('SCHOOL');
    expect(createdSession.accessScope).not.toBe('GLOBAL');

    // 12.2 If a legacy admin session somehow claims GLOBAL, authorize() rejects it
    const rogueGlobalLegacyAdmin: ServerSession = {
      sessionToken: 'ROGUE_TOKEN',
      userId: 'legacy-admin-1',
      role: 'Admin',
      accessScope: 'GLOBAL', // Forbidden for legacy Admin
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const result = authorize(rogueGlobalLegacyAdmin, 'students.view', { schoolId: 'SCH-BADR' });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('ACCESS_DENIED');
  });

  // Test 13: Legacy Admin cannot access another school
  it('13. Legacy Admin cannot access another school', () => {
    const legacyAdminBadr: ServerSession = {
      sessionToken: 'LEGACY_ADMIN_BADR',
      userId: 'legacy-admin-1',
      role: 'Admin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    // Attempting to access SCH-ALNOOR
    const result = authorize(legacyAdminBadr, 'students.view', { schoolId: 'SCH-ALNOOR' });
    expect(result.allowed).toBe(false);
    expect(['SCHOOL_CONTEXT_MISMATCH', 'CROSS_SCHOOL_ACCESS_DENIED']).toContain(result.code);

    // Legacy Admin without bound schoolId fails closed
    const unlinkedLegacyAdmin: ServerSession = {
      ...legacyAdminBadr,
      schoolId: '',
    };
    const unlinkedResult = authorize(unlinkedLegacyAdmin, 'students.view');
    expect(unlinkedResult.allowed).toBe(false);
    expect(unlinkedResult.code).toBe('NEEDS_ADMIN_REVIEW');
  });

  // Test 14: Missing/unknown scope fails closed
  it('14. Missing/unknown scope fails closed', () => {
    const invalidScopeSession: ServerSession = {
      sessionToken: 'INVALID_SCOPE_TOKEN',
      userId: 'usr-unknown',
      role: 'SchoolAdmin',
      accessScope: 'UNKNOWN_SCOPE' as any,
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const result = authorize(invalidScopeSession, 'students.view', { schoolId: 'SCH-BADR' });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('MISSING_OR_INVALID_SCOPE');
  });

  // Test 15: Inactive account denied
  it('15. inactive account denied', () => {
    const inactiveSession: ServerSession = {
      sessionToken: 'INACTIVE_TOKEN',
      userId: 'usr-disabled',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: false, // Inactive
      status: 'Inactive',
    };

    const result = authorize(inactiveSession, 'students.view', { schoolId: 'SCH-BADR' });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('ACCOUNT_INACTIVE');
  });

  // Test 16: Permission false remains denied even with aliases
  it('16. permission false remains denied even with aliases', () => {
    // If a custom matrix explicitly sets a permission to false for a role,
    // hasEffectivePermission MUST NOT flip it to true because of an alias.
    const customMatrix = {
      TeacherAffairs: {
        'employees.delete': false, // Explicit false
        'teachers.delete': true,   // Alias would normally be true
      },
    };

    const result = hasEffectivePermission('TeacherAffairs', 'employees.delete', customMatrix as any);
    expect(result).toBe(false);

    // Verify when checking the alias directly, if the target has explicit false
    const reverseMatrix = {
      TeacherAffairs: {
        'studentAttendance.manage': false,
        'attendance.students.manage': true,
      },
    };
    const reverseResult = hasEffectivePermission('TeacherAffairs', 'studentAttendance.manage', reverseMatrix as any);
    expect(reverseResult).toBe(false);
  });

  // Test 17: spreadsheetId never appears in frontend-safe DTO
  it('17. spreadsheetId never appears in frontend-safe DTO', () => {
    const backendSchoolRecord: MasterSchoolRegistryRecord = {
      schoolId: 'SCH-SECRET',
      schoolCode: 'SECRET',
      schoolName: 'مدرسة سرية',
      spreadsheetId: 'VERY_SECRET_SPREADSHEET_KEY_12345',
      status: 'Active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const sanitizedDTO = sanitizeSchoolDTO(backendSchoolRecord);
    expect(sanitizedDTO.schoolId).toBe('SCH-SECRET');
    expect(sanitizedDTO.schoolName).toBe('مدرسة سرية');
    expect('spreadsheetId' in sanitizedDTO).toBe(false);
    expect((sanitizedDTO as any).spreadsheetId).toBeUndefined();
    expect(JSON.stringify(sanitizedDTO)).not.toContain('VERY_SECRET_SPREADSHEET_KEY_12345');
  });

  // Test 18: Cross-school denial is audited
  it('18. cross-school denial is audited', () => {
    clearSecurityAuditLogs();

    const schoolAdminA: ServerSession = {
      sessionToken: 'SCH_ADMIN_A_TOKEN',
      userId: 'usr-admin-badr',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    // Attempt cross-school access
    const result = authorize(schoolAdminA, 'students.view', { schoolId: 'SCH-ALNOOR' }, 'REQ_TEST_AUDIT_18');
    expect(result.allowed).toBe(false);

    const logs = getSecurityAuditLogs();
    expect(logs.length).toBeGreaterThanOrEqual(1);

    const auditEntry = logs.find(l => l.requestId === 'REQ_TEST_AUDIT_18');
    expect(auditEntry).toBeDefined();
    expect(auditEntry?.actorUserId).toBe('usr-admin-badr');
    expect(auditEntry?.actorRole).toBe('SchoolAdmin');
    expect(auditEntry?.actorSchoolId).toBe('SCH-BADR');
    expect(auditEntry?.targetSchoolId).toBe('SCH-ALNOOR');
    expect(auditEntry?.action).toBe('students.view');
    expect(auditEntry?.timestamp).toBeDefined();

    // Critical security assertion: audit log MUST NEVER contain password, hash, salt, or sessionToken
    const logStr = JSON.stringify(logs);
    expect(logStr).not.toContain('password');
    expect(logStr).not.toContain('hash');
    expect(logStr).not.toContain('salt');
    expect(logStr).not.toContain('SCH_ADMIN_A_TOKEN');
  });

  // Additional School Context Resolution and Isolation Tests
  describe('Backend School Context & Spreadsheet Resolution', () => {
    it('resolveSchoolContext enforces GLOBAL allowedSchoolIds boundary', () => {
      const globalSession: ServerSession = {
        sessionToken: 'TOK',
        userId: 'u1',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        schoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR'],
        activeSchoolId: 'SCH-BADR',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      const resAllowed = resolveSchoolContext(globalSession, 'SCH-BADR');
      expect(resAllowed.success).toBe(true);
      expect(resAllowed.school?.schoolId).toBe('SCH-BADR');

      const resDenied = resolveSchoolContext(globalSession, 'SCH-ALNOOR');
      expect(resDenied.success).toBe(false);
      expect(resDenied.code).toBe('ACCESS_DENIED_SCHOOL_SCOPE');
    });

    it('resolveSchoolContext rejects school override for SCHOOL scoped session', () => {
      const schoolSession: ServerSession = {
        sessionToken: 'TOK',
        userId: 'u2',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR'],
        activeSchoolId: 'SCH-BADR',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      const resDenied = resolveSchoolContext(schoolSession, 'SCH-ALNOOR');
      expect(resDenied.success).toBe(false);
      expect(resDenied.code).toBe('SCHOOL_CONTEXT_MISMATCH');
    });

    it('getSchoolSpreadsheet resolves distinct spreadsheets by school', () => {
      const sheetBadr = getSchoolSpreadsheet('SCH-BADR');
      const sheetAlnoor = getSchoolSpreadsheet('SCH-ALNOOR');

      expect(sheetBadr).toBeDefined();
      expect(sheetAlnoor).toBeDefined();
      expect(sheetBadr).not.toBe(sheetAlnoor);
    });

    it('Phase 2B Hardening: authorize rejects requests without sessionToken with SESSION_MISSING', () => {
      const tokenlessSession: any = {
        userId: 'usr-admin-badr',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR'],
        activeSchoolId: 'SCH-BADR',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        isActive: true,
        status: 'Active',
      };

      const result = authorize(tokenlessSession, 'students.view', { schoolId: 'SCH-BADR' });
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('SESSION_MISSING');
    });

    it('Phase 2B Hardening: server resource ownership blocks cross-school student or employee tampering', async () => {
      const { verifyServerResourceOwnership, getIsolatedSchoolStore } = await import('../src/services/backendAuthService');
      
      const storeBadr = getIsolatedSchoolStore('SCH-BADR');
      const storeAlnoor = getIsolatedSchoolStore('SCH-ALNOOR');

      expect(storeBadr).toBeDefined();
      expect(storeAlnoor).toBeDefined();

      const studentFromAlnoor = { id: 'STU-200', schoolId: 'SCH-ALNOOR', name: 'طالب النور' };

      // Attempting to operate on Alnoor student within Badr school context
      const ownershipCheck = verifyServerResourceOwnership(studentFromAlnoor, 'SCH-BADR');
      expect(ownershipCheck.valid).toBe(false);
      expect(ownershipCheck.code).toBe('CROSS_SCHOOL_ACCESS_DENIED');

      // Operating on Badr student within Badr school context
      const studentFromBadr = { id: 'STU-100', schoolId: 'SCH-BADR', name: 'طالب بدر' };
      const validOwnershipCheck = verifyServerResourceOwnership(studentFromBadr, 'SCH-BADR');
      expect(validOwnershipCheck.valid).toBe(true);
    });

    it('Phase 2B Hardening: ACTION_PERMISSION_MAP maps backend actions strictly to canonical permission keys', async () => {
      const { ACTION_PERMISSION_MAP } = await import('../src/services/backendAuthService');

      expect(ACTION_PERMISSION_MAP['getStudents']).toBe('students.view');
      expect(ACTION_PERMISSION_MAP['saveStudent']).toBe('students.create');
      expect(ACTION_PERMISSION_MAP['deleteStudent']).toBe('students.delete');
      expect(ACTION_PERMISSION_MAP['getEmployees']).toBe('employees.view');
      expect(ACTION_PERMISSION_MAP['saveEmployee']).toBe('employees.create');
      expect(ACTION_PERMISSION_MAP['deleteEmployee']).toBe('employees.delete');
      expect(ACTION_PERMISSION_MAP['getSchedule']).toBe('schedule.view');
      expect(ACTION_PERMISSION_MAP['saveScheduleEntry']).toBe('timetable.manage');
      expect(ACTION_PERMISSION_MAP['publishSchedule']).toBe('timetable.publish');
      expect(ACTION_PERMISSION_MAP['adminCreateSchool']).toBe('schools.manage');
      expect(ACTION_PERMISSION_MAP['adminUpdateSchool']).toBe('schools.manage');
    });
  });

  describe('RBAC Phase 2C: Comprehensive Backend Isolation & Operational Gaps', () => {
    const sysAdminSession: ServerSession = {
      sessionToken: 'TOKEN_SYSADMIN_2C',
      userId: 'usr-sysadmin-1',
      username: 'sysadmin',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const schoolAdminBadr: ServerSession = {
      sessionToken: 'TOKEN_ADMIN_BADR_2C',
      userId: 'usr-admin-badr',
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

    const schoolAdminNoor: ServerSession = {
      sessionToken: 'TOKEN_ADMIN_NOOR_2C',
      userId: 'usr-admin-noor',
      username: 'admin_noor',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-ALNOOR',
      allowedSchoolIds: ['SCH-ALNOOR'],
      activeSchoolId: 'SCH-ALNOOR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const schoolDirectorBadr: ServerSession = {
      sessionToken: 'TOKEN_DIRECTOR_BADR_2C',
      userId: 'usr-director-badr',
      username: 'director_badr',
      role: 'SchoolDirector',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    const teacherBadr: ServerSession = {
      sessionToken: 'TOKEN_TEACHER_BADR_2C',
      userId: 'usr-teacher-badr',
      username: 'teacher_badr',
      role: 'Teacher',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      status: 'Active',
    };

    beforeEach(async () => {
      const { resetMasterUsersStore } = await import('../src/services/backendAuthService');
      resetMasterUsersStore();
    });

    // 1. syncData returns operational data strictly from school store
    it('1. syncData returns operational data from school store (only effective school data)', async () => {
      const { executeSchoolScopedAction } = await import('../src/services/backendAuthService');
      const res = executeSchoolScopedAction(schoolAdminBadr, 'syncData', {});
      expect(res.success).toBe(true);
      expect(res.data.schoolId).toBe('SCH-BADR');
      expect(res.data.students.length).toBeGreaterThan(0);
      expect(res.data.students.every((s: any) => s.schoolId === 'SCH-BADR')).toBe(true);
    });

    // 2. syncData blocks unauthorized roles
    it('2. syncData blocks requests with missing or expired session', async () => {
      const { executeSchoolScopedAction } = await import('../src/services/backendAuthService');
      const invalidSession = { ...schoolAdminBadr, sessionToken: '' };
      const res = executeSchoolScopedAction(invalidSession, 'syncData', {});
      expect(res.success).toBe(false);
      expect(res.code).toBe('SESSION_MISSING');
    });

    // 3. commitTimetableImport saves rows scoped to schoolSs with effectiveSchoolId
    it('3. commitTimetableImport saves rows scoped to school store with effectiveSchoolId', async () => {
      const { executeSchoolScopedAction, getIsolatedSchoolStore } = await import('../src/services/backendAuthService');
      const payload = {
        rows: [
          { subject: 'رياضيات', classroom: '1/2', dayOfWeek: 'الأحد', periodNumber: 1 },
          { subject: 'لغة عربية', classroom: '1/2', dayOfWeek: 'الأحد', periodNumber: 2 }
        ],
        batchFingerprint: 'batch-test-001'
      };

      const res = executeSchoolScopedAction(schoolAdminBadr, 'commitTimetableImport', payload);
      expect(res.success).toBe(true);
      expect(res.importedCount).toBe(2);

      const store = getIsolatedSchoolStore('SCH-BADR');
      const addedRows = store?.schedule.filter(s => s.classroom === '1/2');
      expect(addedRows?.length).toBe(2);
      expect(addedRows?.every(r => r.schoolId === 'SCH-BADR')).toBe(true);
    });

    // 4. commitTimetableImport rejects empty batches
    it('4. commitTimetableImport rejects empty batches', async () => {
      const { executeSchoolScopedAction } = await import('../src/services/backendAuthService');
      const res = executeSchoolScopedAction(schoolAdminBadr, 'commitTimetableImport', { rows: [] });
      expect(res.success).toBe(false);
      expect(res.code).toBe('EMPTY_BATCH');
    });

    // 5. createArchiveSnapshot operates on schoolSs and returns archive receipt
    it('5. createArchiveSnapshot operates on school store and produces isolated receipt', async () => {
      const { executeSchoolScopedAction, getIsolatedSchoolStore } = await import('../src/services/backendAuthService');
      const res = executeSchoolScopedAction(schoolAdminBadr, 'createArchiveSnapshot', {});
      expect(res.success).toBe(true);
      expect(res.archiveReceipt).toBeDefined();
      expect(res.archiveReceipt.schoolId).toBe('SCH-BADR');

      const store = getIsolatedSchoolStore('SCH-BADR');
      expect(store?.archivedReceipts?.length).toBeGreaterThan(0);
    });

    // 6. createArchiveSnapshot rejects users without settings.manage
    it('6. createArchiveSnapshot rejects users without settings.manage permission', async () => {
      const { executeSchoolScopedAction } = await import('../src/services/backendAuthService');
      const res = executeSchoolScopedAction(teacherBadr, 'createArchiveSnapshot', {});
      expect(res.success).toBe(false);
      expect(res.code).toBe('ROLE_PERMISSION_DENIED');
    });

    // 7. Explicit Deny: SchoolDirector has users.view but CANNOT users.manageRoles
    it('7. Explicit Deny: SchoolDirector has users.view but CANNOT users.manageRoles', () => {
      const viewRes = authorize(schoolDirectorBadr, 'users.view');
      expect(viewRes.allowed).toBe(true);

      const rolesRes = authorize(schoolDirectorBadr, 'users.manageRoles');
      expect(rolesRes.allowed).toBe(false);
      expect(rolesRes.code).toBe('ROLE_PERMISSION_DENIED');
    });

    // 8. Explicit Deny: SchoolAdmin CANNOT execute schools.manage
    it('8. Explicit Deny: SchoolAdmin CANNOT execute schools.manage (adminCreateSchool)', () => {
      const res = authorize(schoolAdminBadr, 'adminCreateSchool');
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('ROLE_PERMISSION_DENIED');
    });

    // 9. Fail-Closed: Unmapped action returns PERMISSION_MAPPING_MISSING
    it('9. Fail-Closed: Unmapped action returns PERMISSION_MAPPING_MISSING', () => {
      const res = authorize(schoolAdminBadr, 'arbitraryUnauthorizedAction' as any);
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('PERMISSION_MAPPING_MISSING');
    });

    // 10. getUsersListSecure: SchoolAdmin gets only users from their own school, NEVER SystemAdmin
    it('10. getUsersListSecure: SchoolAdmin gets only users from their own school, NEVER SystemAdmin', async () => {
      const { getUsersListSecure } = await import('../src/services/backendAuthService');
      const res = getUsersListSecure(schoolAdminBadr);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      const userRoles = res.data!.map(u => u.role);
      const userSchools = res.data!.map(u => u.schoolId);

      expect(userRoles).not.toContain('SystemAdmin');
      expect(userSchools.every(s => s === 'SCH-BADR')).toBe(true);
      expect(res.data!.some(u => u.username === 'admin_badr')).toBe(true);
      expect(res.data!.some(u => u.username === 'admin_noor')).toBe(false);
    });

    // 11. getUsersListSecure: SystemAdmin gets users across their allowed schools
    it('11. getUsersListSecure: SystemAdmin gets users across their allowed schools', async () => {
      const { getUsersListSecure } = await import('../src/services/backendAuthService');
      const res = getUsersListSecure(sysAdminSession);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data!.some(u => u.username === 'sysadmin')).toBe(true);
      expect(res.data!.some(u => u.schoolId === 'SCH-BADR')).toBe(true);
      expect(res.data!.some(u => u.schoolId === 'SCH-ALNOOR')).toBe(true);
    });

    // 12. getUsersListSecure: Teacher cannot list users (ROLE_PERMISSION_DENIED)
    it('12. getUsersListSecure: Teacher cannot list users (ROLE_PERMISSION_DENIED)', async () => {
      const { getUsersListSecure } = await import('../src/services/backendAuthService');
      const res = getUsersListSecure(teacherBadr);
      expect(res.success).toBe(false);
      expect(res.code).toBe('ROLE_PERMISSION_DENIED');
    });

    // 13. saveUserSecure: SchoolAdmin cannot create or elevate a user to SystemAdmin
    it('13. saveUserSecure: SchoolAdmin cannot create or elevate a user to SystemAdmin', async () => {
      const { saveUserSecure } = await import('../src/services/backendAuthService');
      const res = saveUserSecure(schoolAdminBadr, {
        username: 'malicious_admin',
        fullName: 'هاكر محتمل',
        role: 'SystemAdmin'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN_ROLE_ELEVATION');
    });

    // 14. saveUserSecure: SchoolAdmin cannot edit a SystemAdmin user
    it('14. saveUserSecure: SchoolAdmin cannot edit a SystemAdmin user', async () => {
      const { saveUserSecure } = await import('../src/services/backendAuthService');
      const res = saveUserSecure(schoolAdminBadr, {
        id: 'usr-sysadmin-1',
        fullName: 'تعديل غير مصرح'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN');
    });

    // 15. saveUserSecure: SchoolAdmin cannot edit a user in another school
    it('15. saveUserSecure: SchoolAdmin cannot edit a user in another school', async () => {
      const { saveUserSecure } = await import('../src/services/backendAuthService');
      const res = saveUserSecure(schoolAdminBadr, {
        id: 'usr-admin-noor',
        fullName: 'تعديل مدرسة أخرى'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('CROSS_SCHOOL_ACCESS_DENIED');
    });

    // 16. saveUserSecure: SchoolAdmin automatically forces user schoolId to match session.schoolId
    it('16. saveUserSecure: SchoolAdmin automatically forces user schoolId to match session.schoolId', async () => {
      const { saveUserSecure } = await import('../src/services/backendAuthService');
      const res = saveUserSecure(schoolAdminBadr, {
        username: 'new_teacher_badr',
        fullName: 'معلم جديد',
        role: 'Teacher',
        schoolId: 'SCH-MALICIOUS' // Trying to assign outside
      });
      expect(res.success).toBe(true);
      expect(res.user?.schoolId).toBe('SCH-BADR');
    });

    // 17. deleteUserSecure: SchoolAdmin cannot delete a user from another school
    it('17. deleteUserSecure: SchoolAdmin cannot delete a user from another school', async () => {
      const { deleteUserSecure } = await import('../src/services/backendAuthService');
      const res = deleteUserSecure(schoolAdminBadr, 'usr-admin-noor');
      expect(res.success).toBe(false);
      expect(res.code).toBe('CROSS_SCHOOL_ACCESS_DENIED');
    });

    // 18. resetUserPasswordSecure: SchoolAdmin cannot reset password of cross-school user
    it('18. resetUserPasswordSecure: SchoolAdmin cannot reset password of cross-school user', async () => {
      const { resetUserPasswordSecure } = await import('../src/services/backendAuthService');
      const res = resetUserPasswordSecure(schoolAdminBadr, 'usr-admin-noor');
      expect(res.success).toBe(false);
      expect(res.code).toBe('CROSS_SCHOOL_ACCESS_DENIED');
    });

    // 19. toggleUserStatusSecure: SchoolAdmin cannot toggle status of cross-school user
    it('19. toggleUserStatusSecure: SchoolAdmin cannot toggle status of cross-school user', async () => {
      const { toggleUserStatusSecure } = await import('../src/services/backendAuthService');
      const res = toggleUserStatusSecure(schoolAdminBadr, 'usr-admin-noor');
      expect(res.success).toBe(false);
      expect(res.code).toBe('CROSS_SCHOOL_ACCESS_DENIED');
    });

    // 20. revokeUserSessionsSecure: SchoolAdmin cannot revoke sessions of cross-school user
    it('20. revokeUserSessionsSecure: SchoolAdmin cannot revoke sessions of cross-school user', async () => {
      const { revokeUserSessionsSecure } = await import('../src/services/backendAuthService');
      const res = revokeUserSessionsSecure(schoolAdminBadr, 'usr-admin-noor');
      expect(res.success).toBe(false);
      expect(res.code).toBe('CROSS_SCHOOL_ACCESS_DENIED');
    });
  });
});
