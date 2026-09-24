import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { storageService } from '../src/services/storageService';
import { User } from '../src/types';

describe('RBAC Phase 2F-A: Auth Client Hardening', () => {
  beforeEach(() => {
    localStorage.clear();
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Source verification: No fake GAS_SES_ session token generator in App.tsx or storageService.ts', () => {
    const appTsxPath = path.resolve(__dirname, '../src/App.tsx');
    const storageServicePath = path.resolve(__dirname, '../src/services/storageService.ts');

    const appContent = fs.readFileSync(appTsxPath, 'utf8');
    const storageContent = fs.readFileSync(storageServicePath, 'utf8');

    expect(appContent).not.toContain('GAS_SES_');
    expect(storageContent).not.toContain('GAS_SES_');
  });

  it('2. Login fails closed with LOGIN_SESSION_TOKEN_MISSING if backend response has no sessionToken', async () => {
    // Mock backend returning success without sessionToken
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        user: {
          id: 'USR-TEST-1',
          username: 'admin1',
          role: 'SchoolAdmin',
          fullName: 'مدير المدرسة',
        },
        // Intentionally missing sessionToken
      }),
    } as any);

    const loginRes = await storageService.login('admin1', 'correctPassword123');
    expect(loginRes.success).toBe(false);
    expect(loginRes.code).toBe('LOGIN_SESSION_TOKEN_MISSING');
    // Ensure user is not persisted locally
    expect(storageService.getCurrentUser()).toBeNull();
  });

  it('3. validateSessionWithBackend returns false on offline / missing URL / network error without local auth fallback', async () => {
    const testUser: User = {
      id: 'USR-TEST-1',
      username: 'admin1',
      fullName: 'مدير المدرسة',
      role: 'SchoolAdmin',
      schoolId: 'SCH-BADR',
      sessionToken: 'VALID_FORMAT_TOKEN_BUT_OFFLINE',
    };
    storageService.setCurrentUser(testUser);

    // Mock network failure
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error / connection refused'));

    const isValid = await storageService.validateSessionWithBackend(testUser);
    expect(isValid).toBe(false);
  });

  it('4. Admin client bypass removed: hasPermission uses permission matrix and does not grant true by default', () => {
    const adminUser: User = {
      id: 'USR-ADMIN-1',
      username: 'legacy_admin',
      fullName: 'مشرف عام قديم',
      role: 'Admin',
      schoolId: 'SCH-BADR',
      sessionToken: 'VALID_ADMIN_TOKEN',
    };
    storageService.setCurrentUser(adminUser);

    // Explicitly configure rolePermissions where 'canViewStudents' is false for Admin
    const settings = storageService.getSettings();
    if (settings.rolePermissions && settings.rolePermissions.Admin) {
      settings.rolePermissions.Admin.canViewStudents = false;
    }
    storageService.saveSettings(settings);

    const hasStudentsPerm = storageService.hasPermission('canViewStudents');
    expect(hasStudentsPerm).toBe(false);
  });
});
