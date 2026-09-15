import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageService } from '../src/services/storageService';
import { ScheduleItem, User } from '../src/types';

describe('Cloud Sync (syncData) & Authoritative Schedule Actions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. syncWithGoogleSheets fails closed if user is not authenticated or has no sessionToken', async () => {
    const success = await storageService.syncWithGoogleSheets();
    expect(success).toBe(false);
    const syncStatus = storageService.getSyncStatus();
    expect(syncStatus.status).toBe('error');
    expect(syncStatus.errorMessage).toContain('مطلوب تسجيل الدخول');
  });

  it('2. syncWithGoogleSheets sends POST syncData with sessionToken and saves returned sheets', async () => {
    const authUser: User = {
      id: 'USR-ADMIN',
      username: 'admin',
      role: 'Admin',
      fullName: 'مدير النظام',
      sessionToken: 'AUTH_SESSION_VALID_1234567890',
      sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      status: 'Active',
      isActive: true,
    };
    storageService.setCurrentUser(authUser);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: {
          students: [{ id: 'STU-1', name: 'طالب تجريبي', studentCode: 'S101', classroom: '1/1' }],
          employees: [{ id: 'EMP-1', name: 'أستاذ أحمد', employeeNumber: 'E101', role: 'Teacher' }],
          schedule: [
            {
              id: 'SCH-1',
              dayOfWeek: 'الأحد',
              periodNumber: 1,
              subject: 'رياضيات',
              grade: 'الأول الثانوي',
              classroom: '1/1',
              teacherName: 'أستاذ أحمد',
            },
          ],
          academicYears: [{ id: 'AY-1', name: '2025/2026', isCurrent: true }],
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const success = await storageService.syncWithGoogleSheets();
    expect(success).toBe(true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('POST');
    const sentBody = JSON.parse(options.body);
    expect(sentBody.action).toBe('syncData');
    expect(sentBody.sessionToken).toBe('AUTH_SESSION_VALID_1234567890');
    expect(sentBody.requestId).toBeDefined();

    // Verify localStorage cache was populated
    const students = storageService.getStudents();
    expect(students.length).toBe(1);
    expect(students[0].name).toBe('طالب تجريبي');

    const schedule = storageService.getSchedule();
    expect(schedule.length).toBe(1);
    expect(schedule[0].subject).toBe('رياضيات');

    const status = storageService.getSyncStatus();
    expect(status.status).toBe('success');
    expect(status.connectedToGoogleSheets).toBe(true);
  });

  it('3. syncWithGoogleSheets clears session when backend returns 401 Unauthorized or SESSION_EXPIRED', async () => {
    const authUser: User = {
      id: 'USR-ADMIN',
      username: 'admin',
      role: 'Admin',
      fullName: 'مدير النظام',
      sessionToken: 'AUTH_SESSION_REVOKED_9999999',
      status: 'Active',
      isActive: true,
    };
    storageService.setCurrentUser(authUser);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 'error',
        code: 'SESSION_EXPIRED',
        message: 'انتهت الجلسة',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const success = await storageService.syncWithGoogleSheets();
    expect(success).toBe(false);

    // Current user should be purged (fail-closed logout)
    expect(storageService.getCurrentUser()).toBeNull();
    const status = storageService.getSyncStatus();
    expect(status.status).toBe('session_expired');
  });

  it('4. saveScheduleItem and deleteScheduleItem enforce fail-closed auth and dispatch backend actions', async () => {
    const mockItem: ScheduleItem = {
      id: 'SCH-TEST-1',
      dayOfWeek: 'الاثنين',
      periodNumber: 2,
      subject: 'فيزياء',
      grade: 'الأول الثانوي',
      classroom: '1/2',
      teacherName: 'أستاذ خالد',
      isActive: true,
    };

    // Attempt without login must fail
    const unauthSave = storageService.saveScheduleItem(mockItem);
    expect(unauthSave.success).toBe(false);

    const unauthDelete = storageService.deleteScheduleItem('SCH-TEST-1');
    expect(unauthDelete.success).toBe(false);

    // Login as Admin
    const adminUser: User = {
      id: 'USR-ADMIN-2',
      username: 'admin2',
      role: 'Admin',
      fullName: 'مدير النظام 2',
      sessionToken: 'AUTH_TOKEN_TEST_VALID_000',
      status: 'Active',
      isActive: true,
    };
    storageService.setCurrentUser(adminUser);

    const pushSpy = vi.spyOn(storageService as any, 'pushPost').mockResolvedValue(true);

    const authSave = storageService.saveScheduleItem(mockItem);
    expect(authSave.success).toBe(true);
    expect(pushSpy).toHaveBeenCalledWith('saveScheduleEntry', mockItem);

    const authDelete = storageService.deleteScheduleItem('SCH-TEST-1');
    expect(authDelete.success).toBe(true);
    expect(pushSpy).toHaveBeenCalledWith('deleteScheduleEntry', { id: 'SCH-TEST-1' });
  });
});
