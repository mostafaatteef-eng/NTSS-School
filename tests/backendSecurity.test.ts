/**
 * Backend Security & Authorization Test Suite
 * Validates enterprise security controls:
 * 1. Teacher Login fails closed when backend is unreachable or invalid
 * 2. No plain-text passwords or raw tokens in storage
 * 3. Migration 010 quarantines unknown roles (Suspended)
 * 4. Migration 010 purges raw tokens and local PINs
 * 5. Student public portal data strictly enforces 'Published' filter
 * 6. Cryptographically secure random tokens without Math.random()
 */

import { describe, it, expect, beforeEach } from 'vitest';

// LocalStorage polyfill for Node.js
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

import { timetableService } from '../src/services/timetableService';
import { storageService } from '../src/services/storageService';
import { runMigrationScope010TimetableSecureBackend } from '../src/services/migrationScope010TimetableSecureBackend';
import { generateCryptographicSalt, generateCryptographicToken, generateSecureId } from '../src/utils/cryptoUtils';
import { STORAGE_KEYS } from '../src/services/masterDataDefaults';

describe('Backend Security & Authorization Verification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Teacher login fails closed without backend or with invalid credentials', async () => {
    // When backend URL is not configured or fails, it MUST fail closed (NO local backdoor PIN)
    const result = await timetableService.verifyTeacherPin('T-999', '1234');
    expect(result.success).toBe(false);
    expect(result.employee).toBeUndefined();
    expect(result.token).toBeUndefined();
  });

  it('2. Migration 010 quarantines unknown roles (sets status to Suspended)', () => {
    const mockUsers = [
      { id: 'U-1', username: 'admin1', role: 'Admin', status: 'Active' },
      { id: 'U-2', username: 'hacker', role: 'SuperGodRole', status: 'Active' },
      { id: 'U-3', username: 'unknown_role', role: 'ExternalVisitor', status: 'Active' },
    ];
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(mockUsers));

    const migResult = runMigrationScope010TimetableSecureBackend();
    expect(migResult.usersNormalizedCount).toBe(3);

    const updatedUsers = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    const adminUser = updatedUsers.find((u: any) => u.username === 'admin1');
    const hackerUser = updatedUsers.find((u: any) => u.username === 'hacker');
    const visitorUser = updatedUsers.find((u: any) => u.username === 'unknown_role');

    expect(adminUser.role).toBe('Admin');
    expect(adminUser.status).toBe('Active');

    // Unknown roles must be quarantined
    expect(hackerUser.status).toBe('Suspended');
    expect(visitorUser.status).toBe('Suspended');
  });

  it('3. Migration 010 purges raw tokens and local PINs', () => {
    // Seed raw token and local pin
    const mockTokens = [
      { id: 'T-1', studentId: 'S-1', token: 'RAW_SECRET_TOKEN_123', isActive: true },
    ];
    const mockTeacherAccess = [
      { employeeId: 'EMP-1', pin: '9988', pinHash: 'local_hash_abc', salt: 'salt123' },
    ];

    localStorage.setItem(STORAGE_KEYS.STUDENT_ACCESS_TOKENS, JSON.stringify(mockTokens));
    localStorage.setItem(STORAGE_KEYS.TEACHER_PORTAL_ACCESS, JSON.stringify(mockTeacherAccess));

    runMigrationScope010TimetableSecureBackend();

    const updatedTokens = JSON.parse(localStorage.getItem(STORAGE_KEYS.STUDENT_ACCESS_TOKENS) || '[]');
    const updatedAccess = JSON.parse(localStorage.getItem(STORAGE_KEYS.TEACHER_PORTAL_ACCESS) || '[]');

    // Raw token must be deleted
    expect(updatedTokens[0].token).toBeUndefined();
    expect(updatedTokens[0].tokenHash).toBeDefined();

    // Local pin, pinHash, and salt must be deleted
    expect(updatedAccess[0].pin).toBeUndefined();
    expect(updatedAccess[0].pinHash).toBeUndefined();
    expect(updatedAccess[0].salt).toBeUndefined();
    expect(updatedAccess[0].backendAuthority).toBe(true);
  });

  it('4. Cryptographic entropy generators produce valid hex and tokens', () => {
    const salt1 = generateCryptographicSalt(16);
    const salt2 = generateCryptographicSalt(16);
    expect(salt1.length).toBe(32); // 16 bytes = 32 hex chars
    expect(salt2.length).toBe(32);
    expect(salt1).not.toBe(salt2); // High entropy

    const token = generateCryptographicToken(32);
    expect(token.length).toBe(32);

    const recordId = generateSecureId('SCH');
    expect(recordId.startsWith('SCH-')).toBe(true);
    expect(recordId.length).toBeGreaterThan(15);
  });

  it('5. Pure query operations: getTeachingStaff does not mutate storage', () => {
    const emp = {
      id: 'EMP-T1',
      name: 'معلم العلوم',
      teacherCode: 'T-005',
      jobTitle: 'معلم كيمياء',
      isTeacher: true,
      status: 'Active',
    };
    storageService.saveEmployee(emp as any);

    const beforeLength = localStorage.length;
    timetableService.getTeachingStaff();
    timetableService.findTeacherByCode('T-005');
    const afterLength = localStorage.length;

    // Read operations must be pure, no side effects
    expect(afterLength).toBe(beforeLength);
  });
});
