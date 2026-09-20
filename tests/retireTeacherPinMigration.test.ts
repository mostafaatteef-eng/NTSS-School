import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrationScope013RetireTeacherPin, MIGRATION_013_FLAG_KEY } from '../src/services/migrationScope013RetireTeacherPin';
import { storageService } from '../src/services/storageService';
import { timetableService } from '../src/services/timetableService';
import { TeacherAccount, TeacherSession } from '../src/types';

describe('MIG_SCOPE_013_RETIRE_TEACHER_PIN - Teacher Authentication System Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Idempotently migrates legacy PIN-only accounts and strips pinHash', () => {
    const legacyAccounts: any[] = [
      {
        id: 'ACC-LEGACY-1',
        employeeId: 'EMP-LEG-1',
        teacherCode: 'T-101',
        teacherName: 'أحمد محمود',
        username: 'ahmed_m',
        pinHash: 'legacy_salted_hash_xyz',
        salt: 'legacy_salt_123',
        status: 'Active',
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      {
        id: 'ACC-LEGACY-2',
        employeeId: 'EMP-LEG-2',
        teacherCode: 'T-102',
        teacherName: 'سارة علي',
        username: '', // missing username
        pinHash: 'legacy_salted_hash_abc',
        salt: 'legacy_salt_456',
        status: 'Active',
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      {
        id: 'ACC-VALID-3',
        employeeId: 'EMP-LEG-3',
        teacherCode: 'T-103',
        teacherName: 'خالد عمر',
        username: 'khaled_o',
        passwordHash: 'valid_pbkdf2_hash',
        passwordSalt: 'valid_salt',
        status: 'Active',
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    ];

    localStorage.setItem('ntss_teacher_accounts_v3', JSON.stringify(legacyAccounts));

    // Also simulate active teacher session for legacy user 1
    const activeSession: TeacherSession = {
      teacherSessionToken: 'TSESS_LEGACY_TOKEN',
      schoolId: 'SCH-BADR',
      employeeId: 'EMP-LEG-1',
      teacherCode: 'T-101',
      teacherName: 'أحمد محمود',
      username: 'ahmed_m',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem('ntss_teacher_session_v3', JSON.stringify(activeSession));

    // Run migration
    const res1 = runMigrationScope013RetireTeacherPin();
    expect(res1.migratedCount).toBe(3);
    expect(res1.pinOnlyAccountsConverted).toBe(2);
    expect(res1.passwordAccountsRetained).toBe(1);
    expect(res1.sessionsRevokedCount).toBe(1);

    // Verify session for legacy user was revoked
    expect(localStorage.getItem('ntss_teacher_session_v3')).toBeNull();

    // Verify accounts in storage
    const accounts = storageService.getTeacherAccounts();
    const acc1 = accounts.find(a => a.employeeId === 'EMP-LEG-1');
    expect(acc1).toBeDefined();
    expect(acc1?.mustChangePassword).toBe(true);
    expect(acc1?.legacyPinRetired).toBe(true);
    expect(acc1?.accountStatus).toBe('PasswordResetRequired');
    expect(acc1?.status).toBe('PasswordResetRequired');
    expect((acc1 as any).pinHash).toBeUndefined();
    expect((acc1 as any).salt).toBeUndefined();
    expect(acc1?.username).toBe('ahmed_m');

    // Verify account 2 (missing username -> Needs Setup)
    const acc2 = accounts.find(a => a.employeeId === 'EMP-LEG-2');
    expect(acc2).toBeDefined();
    expect(acc2?.mustChangePassword).toBe(true);
    expect(acc2?.legacyPinRetired).toBe(true);
    expect(acc2?.accountStatus).toBe('Needs Setup');
    expect(acc2?.status).toBe('Needs Setup');
    expect((acc2 as any).pinHash).toBeUndefined();

    // Verify account 3 (valid password -> Retained as Active with username)
    const acc3 = accounts.find(a => a.employeeId === 'EMP-LEG-3');
    expect(acc3).toBeDefined();
    expect(acc3?.username).toBe('khaled_o');
    expect(acc3?.status).toBe('Active');
    expect((acc3 as any).pinHash).toBeUndefined();
    expect((acc3 as any).salt).toBeUndefined();

    // Run migration again (Idempotency test)
    const res2 = runMigrationScope013RetireTeacherPin();
    expect(res2.alreadyApplied).toBe(true);
  });

  it('2. Legacy PIN runtime methods are permanently retired and reject calls', async () => {
    const setRes = await timetableService.setTeacherPin('EMP-TEST', '1234');
    expect(setRes.success).toBe(false);
    expect(setRes.code).toBe('LEGACY_PIN_RETIRED');

    const verifyRes = await timetableService.verifyTeacherPin('EMP-TEST', '1234');
    expect(verifyRes.success).toBe(false);
    expect(verifyRes.code).toBe('LEGACY_PIN_RETIRED');
  });

  it('3. Teacher Login rejects PINs and accounts with PasswordResetRequired or Needs Setup', async () => {
    // Setup employee and account requiring password reset
    const emp = {
      id: 'EMP-RESET-TEST',
      name: 'معلم قيد التهيئة',
      teacherCode: 'T-999',
      jobTitle: 'معلم',
    };
    storageService.saveEmployee(emp as any);

    const accounts: TeacherAccount[] = [
      {
        id: 'TAC-RESET',
        employeeId: 'EMP-RESET-TEST',
        teacherCode: 'T-999',
        teacherName: 'معلم قيد التهيئة',
        username: 'teacher_pending',
        status: 'PasswordResetRequired',
        accountStatus: 'PasswordResetRequired',
        isActive: true,
        mustChangePassword: true,
        legacyPinRetired: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem('ntss_teacher_accounts_v3', JSON.stringify(accounts));

    // Attempt login while in PasswordResetRequired
    const loginAttempt1 = await storageService.teacherLogin('teacher_pending', 'anyPassword123');
    expect(loginAttempt1.success).toBe(false);
    expect(loginAttempt1.code).toBe('PASSWORD_RESET_REQUIRED');

    // Admin resets password with a temporary password
    const resetRes = await storageService.resetTeacherPassword('EMP-RESET-TEST', 'TemporaryPass#2026');
    expect(resetRes.success).toBe(true);

    // Now teacher logs in with Username + Password
    const loginAttempt2 = await storageService.teacherLogin('teacher_pending', 'TemporaryPass#2026');
    expect(loginAttempt2.success).toBe(true);
    expect(loginAttempt2.teacherSessionToken).toBeTruthy();
    expect(loginAttempt2.mustChangePassword).toBe(true);
  });
});
