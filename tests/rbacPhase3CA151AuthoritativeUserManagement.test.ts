import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveUserSecure,
  deleteUserSecure,
  resetUserPasswordSecure,
  toggleUserStatusSecure,
  revokeUserSessionsSecure,
  getUsersListSecure,
  resetMasterUsersStore,
  normalizeUserRole,
  deriveUserAccessScope,
  normalizeEmail,
  isValidEmailFormat,
  sanitizeUserDTO,
  getSecurityAuditLogs,
  clearSecurityAuditLogs,
  setMasterSchoolRegistry,
  BackendUserRecord
} from '../src/services/backendAuthService';
import { ServerSession } from '../src/types';

describe('PHASE 3C-A15.1: Authoritative Multi-School User Management Backend Hardening', () => {
  const systemAdminSession: ServerSession = {
    userId: 'usr-sysadmin-1',
    username: 'sysadmin',
    email: 'sysadmin@ntss.edu.eg',
    role: 'SystemAdmin',
    accessScope: 'GLOBAL',
    schoolId: '',
    activeSchoolId: '',
    allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'],
    sessionToken: 'token-sysadmin',
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };

  const schoolAdminBadrSession: ServerSession = {
    userId: 'usr-admin-badr',
    username: 'admin_badr',
    email: 'admin_badr@ntss.edu.eg',
    role: 'SchoolAdmin',
    accessScope: 'SCHOOL',
    schoolId: 'SCH-BADR',
    activeSchoolId: 'SCH-BADR',
    allowedSchoolIds: ['SCH-BADR'],
    sessionToken: 'token-admin-badr',
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };

  beforeEach(() => {
    resetMasterUsersStore();
    clearSecurityAuditLogs();
    setMasterSchoolRegistry([
      { schoolId: 'SCH-BADR', schoolCode: 'BADR', schoolName: 'مدرسة بدر', status: 'Active', spreadsheetId: 'ss-badr' },
      { schoolId: 'SCH-ALNOOR', schoolCode: 'NOOR', schoolName: 'مدرسة النور', status: 'Active', spreadsheetId: 'ss-noor' },
      { schoolId: 'SCH-DAMIETTA', schoolCode: 'DAM', schoolName: 'مدرسة دمياط', status: 'Active', spreadsheetId: 'ss-dam' }
    ]);
  });

  describe('1. Canonical Role Normalization & AccessScope Derivation', () => {
    it('derives GLOBAL scope strictly for SystemAdmin', () => {
      expect(normalizeUserRole('SystemAdmin')).toBe('SystemAdmin');
      expect(deriveUserAccessScope('SystemAdmin')).toBe('GLOBAL');
    });

    it('derives SELF scope strictly for Teacher', () => {
      expect(normalizeUserRole('Teacher')).toBe('Teacher');
      expect(deriveUserAccessScope('Teacher')).toBe('SELF');
    });

    it('derives SCHOOL scope for all administrative and operational staff roles', () => {
      const schoolRoles = [
        'SchoolAdmin',
        'SchoolDirector',
        'StudentAffairs',
        'TeacherAffairs',
        'SocialSpecialist',
        'TrainingOfficer',
        'QualityOfficer',
        'AdministrativeEmployee'
      ];
      schoolRoles.forEach(role => {
        const normalized = normalizeUserRole(role);
        expect(normalized).toBe(role);
        expect(deriveUserAccessScope(normalized!)).toBe('SCHOOL');
      });
    });

    it('rejects unknown or invalid roles without fallback to admin', () => {
      expect(normalizeUserRole('SuperUser')).toBeNull();
      expect(normalizeUserRole('Hacker')).toBeNull();
      expect(normalizeUserRole('Parent')).toBeNull();
      expect(normalizeUserRole('Student')).toBeNull();
      expect(normalizeUserRole('')).toBeNull();
    });

    it('rejects saving a user with an invalid role', () => {
      const res = saveUserSecure(systemAdminSession, {
        username: 'invalid_role_user',
        email: 'invalid@ntss.edu.eg',
        fullName: 'مستخدم بدور وهمي',
        role: 'SuperHacker' as any,
        schoolId: 'SCH-BADR'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_ROLE');
    });
  });

  describe('2. Email Requirements, Validation & Uniqueness', () => {
    it('requires email for new administrative staff accounts', () => {
      const res = saveUserSecure(schoolAdminBadrSession, {
        username: 'new_student_affairs',
        fullName: 'أخصائي شؤون طلاب',
        role: 'StudentAffairs'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('EMAIL_REQUIRED');
    });

    it('rejects invalid email formats', () => {
      const res = saveUserSecure(schoolAdminBadrSession, {
        username: 'bad_email_user',
        email: 'not-a-valid-email',
        fullName: 'مستخدم بريد خاطئ',
        role: 'StudentAffairs'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_EMAIL');
    });

    it('enforces email uniqueness across accounts (normalized check)', () => {
      const res = saveUserSecure(schoolAdminBadrSession, {
        username: 'duplicate_user',
        email: '  SYSADMIN@ntss.edu.eg  ', // Matches sysadmin normalized email
        fullName: 'محاولة تكرار البريد',
        role: 'TeacherAffairs'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('DUPLICATE_ACCOUNT_EMAIL');
    });

    it('normalizes valid emails to lowercase trimmed format', () => {
      expect(normalizeEmail('  User.Name@NTSS.edu.eg ')).toBe('user.name@ntss.edu.eg');
      expect(isValidEmailFormat('user.name@ntss.edu.eg')).toBe(true);
      expect(isValidEmailFormat('user.name@domain')).toBe(false);
      expect(isValidEmailFormat('user name@domain.com')).toBe(false);
    });

    it('prevents modifying email on existing user (USER_EMAIL_IMMUTABLE)', () => {
      const res = saveUserSecure(schoolAdminBadrSession, {
        id: 'usr-director-badr',
        email: 'new_director_email@ntss.edu.eg'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('USER_EMAIL_IMMUTABLE');
    });
  });

  describe('3. Immutability & School Scoping Rules', () => {
    it('blocks direct school transfer on existing user (USER_SCHOOL_IMMUTABLE)', () => {
      const res = saveUserSecure(systemAdminSession, {
        id: 'usr-director-badr',
        schoolId: 'SCH-ALNOOR'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('USER_SCHOOL_IMMUTABLE');
    });

    it('requires schoolId when creating a school-scoped user by SystemAdmin', () => {
      const res = saveUserSecure(systemAdminSession, {
        username: 'missing_school_user',
        email: 'missing_school@ntss.edu.eg',
        fullName: 'مستخدم بدون مدرسة',
        role: 'SchoolDirector'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('SCHOOL_REQUIRED');
    });

    it('blocks SystemAdmin from assigning a school outside actor allowedSchoolIds', () => {
      const res = saveUserSecure(systemAdminSession, {
        username: 'outside_school_user',
        email: 'outside@ntss.edu.eg',
        fullName: 'مستخدم مدرسة خارج الصلاحية',
        role: 'SchoolDirector',
        schoolId: 'SCH-DAMIETTA' // SystemAdmin only has SCH-BADR, SCH-ALNOOR
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('ACCESS_DENIED_SCHOOL_SCOPE');
    });

    it('blocks SystemAdmin from assigning an unregistered school', () => {
      const res = saveUserSecure(systemAdminSession, {
        username: 'unknown_school_user',
        email: 'unknown_school@ntss.edu.eg',
        fullName: 'مستخدم مدرسة مجهولة',
        role: 'SchoolDirector',
        schoolId: 'SCH-NONEXISTENT'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_SCHOOL_ID');
    });
  });

  describe('4. SystemAdmin Role Rules & Target SystemAdmin Scope', () => {
    it('enforces accessScope=GLOBAL, empty schoolId & employeeId on target SystemAdmin', () => {
      const res = saveUserSecure(systemAdminSession, {
        username: 'new_central_sysadmin',
        email: 'central@ntss.edu.eg',
        fullName: 'مدير نظام مساعد',
        role: 'SystemAdmin',
        allowedSchoolIds: ['SCH-BADR'],
        schoolId: 'SCH-BADR', // should be cleared
        employeeId: 'EMP_999'  // should be cleared
      });
      expect(res.success).toBe(true);
      expect(res.user?.role).toBe('SystemAdmin');
      expect(res.user?.accessScope).toBe('GLOBAL');
      expect(res.user?.schoolId).toBeUndefined();
      expect(res.user?.employeeId).toBeUndefined();
      expect(res.user?.allowedSchoolIds).toEqual(['SCH-BADR']);
    });

    it('blocks SystemAdmin from granting target SystemAdmin schools outside actor scope', () => {
      const res = saveUserSecure(systemAdminSession, {
        username: 'escalated_sysadmin',
        email: 'escalated@ntss.edu.eg',
        fullName: 'مدير نظام واسع الصلاحيات',
        role: 'SystemAdmin',
        allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'] // SCH-DAMIETTA not in actor scope
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('ACCESS_DENIED_SCHOOL_SCOPE');
    });
  });

  describe('5. SchoolAdmin Isolation & Boundaries', () => {
    it('prevents SchoolAdmin from creating or promoting to SystemAdmin', () => {
      const res = saveUserSecure(schoolAdminBadrSession, {
        username: 'illegal_sysadmin',
        email: 'illegal@ntss.edu.eg',
        fullName: 'محاولة ترقية محظورة',
        role: 'SystemAdmin'
      });
      expect(res.success).toBe(false);
      expect(['ROLE_ESCALATION_DENIED', 'FORBIDDEN_ROLE_ELEVATION']).toContain(res.code);
    });

    it('prevents SchoolAdmin from editing a SystemAdmin user', () => {
      const res = saveUserSecure(schoolAdminBadrSession, {
        id: 'usr-sysadmin-1',
        fullName: 'تعديل غير مسموح'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN');
    });

    it('prevents SchoolAdmin from managing users of another school', () => {
      const res = saveUserSecure(schoolAdminBadrSession, {
        id: 'usr-admin-noor',
        fullName: 'تعديل مدرسة أخرى'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('CROSS_SCHOOL_ACCESS_DENIED');
    });

    it('forces SchoolAdmin created users to match actor schoolId', () => {
      const res = saveUserSecure(schoolAdminBadrSession, {
        username: 'badr_social_worker',
        email: 'social_badr@ntss.edu.eg',
        fullName: 'أخصائي اجتماعي بمدرسة بدر',
        role: 'SocialSpecialist',
        schoolId: 'SCH-MALICIOUS'
      });
      expect(res.success).toBe(true);
      expect(res.user?.schoolId).toBe('SCH-BADR');
      expect(res.user?.allowedSchoolIds).toEqual(['SCH-BADR']);
      expect(res.user?.accessScope).toBe('SCHOOL');
    });
  });

  describe('6. Self-Protection Rules', () => {
    it('blocks self-deletion (SELF_DELETION_DENIED)', () => {
      const res = deleteUserSecure(systemAdminSession, 'usr-sysadmin-1');
      expect(res.success).toBe(false);
      expect(res.code).toBe('SELF_DELETION_DENIED');
    });

    it('blocks self-disabling via toggleUserStatus (SELF_DISABLE_DENIED)', () => {
      const res = toggleUserStatusSecure(systemAdminSession, 'usr-sysadmin-1', 'Suspended');
      expect(res.success).toBe(false);
      expect(res.code).toBe('SELF_DISABLE_DENIED');
    });

    it('blocks self-demotion from SystemAdmin (SELF_DEMOTION_DENIED)', () => {
      const res = saveUserSecure(systemAdminSession, {
        id: 'usr-sysadmin-1',
        role: 'SchoolAdmin'
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('SELF_DEMOTION_DENIED');
    });
  });

  describe('7. Safe DTO Purging & Sensitive Data Protection', () => {
    it('purges passwords, hashes, salts, and tokens from returned DTO', () => {
      const dirtyUser: BackendUserRecord = {
        id: 'usr-test-dirty',
        username: 'dirty_user',
        email: 'clean@ntss.edu.eg',
        fullName: 'مستخدم أمني',
        role: 'StudentAffairs',
        status: 'Active',
        schoolId: 'SCH-BADR',
        password: 'PlainTextPassword123!',
        passwordHash: 'hash_abc123',
        passwordSalt: 'salt_xyz789',
        passwordAlgorithm: 'PBKDF2',
        passwordIterations: 10000,
        activationTokenHash: 'token_hash_secret'
      };

      const sanitized = sanitizeUserDTO(dirtyUser);

      expect((sanitized as any).password).toBeUndefined();
      expect((sanitized as any).passwordHash).toBeUndefined();
      expect((sanitized as any).passwordSalt).toBeUndefined();
      expect((sanitized as any).passwordAlgorithm).toBeUndefined();
      expect((sanitized as any).passwordIterations).toBeUndefined();
      expect((sanitized as any).activationTokenHash).toBeUndefined();

      expect(sanitized.id).toBe('usr-test-dirty');
      expect(sanitized.email).toBe('clean@ntss.edu.eg');
      expect(sanitized.role).toBe('StudentAffairs');
      expect(sanitized.accessScope).toBe('SCHOOL');
    });

    it('sanitizes all records in getUsersListSecure response', () => {
      const res = getUsersListSecure(systemAdminSession);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      res.data!.forEach(user => {
        expect((user as any).passwordHash).toBeUndefined();
        expect((user as any).passwordSalt).toBeUndefined();
        expect(user.accessScope).toBeDefined();
      });
    });
  });

  describe('8. Authoritative Security Audit Event Logging', () => {
    it('logs USER_CREATED on new user creation', () => {
      saveUserSecure(schoolAdminBadrSession, {
        username: 'audit_test_user',
        email: 'audit_user@ntss.edu.eg',
        fullName: 'مستخدم فحص الرقابة',
        role: 'TeacherAffairs'
      });

      const logs = getSecurityAuditLogs();
      const createLog = logs.find(l => l.action === 'USER_CREATED');
      expect(createLog).toBeDefined();
      expect(createLog?.actorRole).toBe('SchoolAdmin');
    });

    it('logs USER_STATUS_CHANGED on status toggle', () => {
      toggleUserStatusSecure(schoolAdminBadrSession, 'usr-teacher-badr', 'Inactive');
      const logs = getSecurityAuditLogs();
      const statusLog = logs.find(l => l.action === 'USER_STATUS_CHANGED');
      expect(statusLog).toBeDefined();
    });

    it('logs USER_DELETED on user deletion', () => {
      deleteUserSecure(schoolAdminBadrSession, 'usr-teacher-badr');
      const logs = getSecurityAuditLogs();
      const deleteLog = logs.find(l => l.action === 'USER_DELETED');
      expect(deleteLog).toBeDefined();
    });

    it('logs USER_PASSWORD_RESET on password reset', () => {
      resetUserPasswordSecure(schoolAdminBadrSession, 'usr-teacher-badr');
      const logs = getSecurityAuditLogs();
      const resetLog = logs.find(l => l.action === 'USER_PASSWORD_RESET');
      expect(resetLog).toBeDefined();
    });

    it('logs USER_SESSIONS_REVOKED on session revocation', () => {
      revokeUserSessionsSecure(schoolAdminBadrSession, 'usr-teacher-badr');
      const logs = getSecurityAuditLogs();
      const revokeLog = logs.find(l => l.action === 'USER_SESSIONS_REVOKED');
      expect(revokeLog).toBeDefined();
    });
  });
});
