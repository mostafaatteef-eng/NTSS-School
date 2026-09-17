import { describe, it, expect, beforeEach } from 'vitest';
import { canAccessTab, normalizeTab, resolveDefaultRouteForCurrentUser } from '../utils/navigation';
import { storageService } from '../services/storageService';
import { User } from '../types';

describe('NTSS ERP - Sidebar Navigation Stability & Route Guard Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    // Polyfill window and sessionStorage for test environment
    if (typeof window === 'undefined') {
      const storage: Record<string, string> = {};
      (globalThis as any).window = {
        sessionStorage: {
          getItem: (key: string) => storage[key] || null,
          setItem: (key: string, val: string) => { storage[key] = val; },
          removeItem: (key: string) => { delete storage[key]; },
          clear: () => {
            for (const k in storage) delete storage[k];
          },
        },
      };
    } else if (!window.sessionStorage) {
      const storage: Record<string, string> = {};
      (window as any).sessionStorage = {
        getItem: (key: string) => storage[key] || null,
        setItem: (key: string, val: string) => { storage[key] = val; },
        removeItem: (key: string) => { delete storage[key]; },
        clear: () => {
          for (const k in storage) delete storage[k];
        },
      };
    } else {
      window.sessionStorage.clear();
    }
  });

  it('Test 1: normalizeTab cleans hashes, slashes, and query params accurately', () => {
    expect(normalizeTab('#/students')).toBe('students');
    expect(normalizeTab('#students')).toBe('students');
    expect(normalizeTab('/employees?page=2')).toBe('employees');
    expect(normalizeTab('##timetable_weekly')).toBe('timetable_weekly');
    expect(normalizeTab('')).toBe('dashboard');
    expect(normalizeTab(null)).toBe('dashboard');
  });

  it('Test 2: resolveDefaultRouteForCurrentUser assigns strict authorized initial landing routes', () => {
    const adminUser: User = { id: 'U1', username: 'admin', fullName: 'مدير النظام', role: 'Admin' };
    const studentAffairs: User = { id: 'U2', username: 'stu_affairs', fullName: 'مسؤول طلاب', role: 'StudentAffairs' };
    const hrUser: User = { id: 'U3', username: 'hr_user', fullName: 'شئون عاملين', role: 'TeacherAffairs' };
    const teacherUser: User = { id: 'U4', username: 'teacher1', fullName: 'معلم أول', role: 'Teacher' };
    const parentUser: User = { id: 'U5', username: 'parent1', fullName: 'ولي أمر', role: 'Parent' };

    expect(resolveDefaultRouteForCurrentUser(adminUser)).toBe('dashboard');
    expect(resolveDefaultRouteForCurrentUser(studentAffairs)).toBe('students');
    expect(resolveDefaultRouteForCurrentUser(hrUser)).toBe('employees');
    expect(resolveDefaultRouteForCurrentUser(teacherUser)).toBe('teacher_portal');
    expect(resolveDefaultRouteForCurrentUser(parentUser)).toBe('dashboard');
  });

  it('Test 3: canAccessTab ensures dashboard is accessible to admin while strictly guarding against teacher ERP access', () => {
    const teacherUser: User = { id: 'U4', username: 'teacher1', fullName: 'معلم أول', role: 'Teacher' };
    const adminUser: User = { id: 'U1', username: 'admin', fullName: 'مدير النظام', role: 'Admin' };

    // Admin has access to administrative dashboard and system operations
    expect(canAccessTab(adminUser, 'dashboard')).toBe(true);
    expect(canAccessTab(adminUser, 'settings')).toBe(true);
    expect(canAccessTab(adminUser, 'users')).toBe(true);
    expect(canAccessTab(adminUser, 'audit')).toBe(true);

    // Teacher cannot enter administrative ERP modules (Strictly isolated to teacher_portal)
    expect(canAccessTab(teacherUser, 'dashboard')).toBe(false);
    expect(canAccessTab(teacherUser, 'teacher_portal')).toBe(true);
    expect(canAccessTab(teacherUser, 'timetable_weekly')).toBe(false);
    expect(canAccessTab(teacherUser, 'settings')).toBe(false);
    expect(canAccessTab(teacherUser, 'users')).toBe(false);
    expect(canAccessTab(teacherUser, 'audit')).toBe(false);
    expect(canAccessTab(teacherUser, 'backup')).toBe(false);
    expect(canAccessTab(teacherUser, 'system_health')).toBe(false);
  });

  it('Test 4: Backend sessionToken is strictly required - local storage presence alone is not authenticated', () => {
    // 1. User without sessionToken is NOT authenticated
    const unauthenticatedUser: User = {
      id: 'U99',
      username: 'fake_user',
      fullName: 'مستخدم بدون توكن',
      role: 'Teacher',
    };
    expect(storageService.isAuthenticated(unauthenticatedUser)).toBe(false);

    // If placed in localStorage directly, it is rejected and purged
    localStorage.setItem('ntss_current_user', JSON.stringify(unauthenticatedUser));
    expect(storageService.getCurrentUser()).toBeNull();
    expect(localStorage.getItem('ntss_current_user')).toBeNull();

    // 2. Placing user in sessionStorage does NOT grant authentication
    window.sessionStorage.setItem('ntss_current_user', JSON.stringify(unauthenticatedUser));
    expect(storageService.getCurrentUser()).toBeNull();

    // 3. User WITH a valid authoritative sessionToken IS authenticated
    const authenticatedUser: User = {
      id: 'U100',
      username: 'valid_teacher',
      fullName: 'معلم بتوكن معتمد',
      role: 'Teacher',
      sessionToken: 'BE_AUTH_SECURE_TOKEN_9988776655',
    };
    expect(storageService.isAuthenticated(authenticatedUser)).toBe(true);
    storageService.setCurrentUser(authenticatedUser);
    expect(storageService.getCurrentUser()?.id).toBe('U100');

    // 4. Expired session is NOT authenticated and triggers logout
    const expiredUser: User = {
      id: 'U101',
      username: 'expired_teacher',
      fullName: 'معلم منتهي الجلسة',
      role: 'Teacher',
      sessionToken: 'BE_AUTH_SECURE_TOKEN_1122334455',
      sessionExpiresAt: new Date(Date.now() - 10000).toISOString(), // in the past
    };
    expect(storageService.isAuthenticated(expiredUser)).toBe(false);

    // 5. Explicit logout clears session completely
    storageService.setCurrentUser(null);
    expect(storageService.getCurrentUser()).toBeNull();
  });
});
