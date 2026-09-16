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

  it('4. saveScheduleItem and deleteScheduleItem are backend-authoritative and update localStorage only on success', async () => {
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

    // 4.1 Attempt without login must fail and not touch localStorage
    const unauthSave = await storageService.saveScheduleItem(mockItem);
    expect(unauthSave.success).toBe(false);
    expect(storageService.getSchedule().find(s => s.id === 'SCH-TEST-1')).toBeUndefined();

    const unauthDelete = await storageService.deleteScheduleItem('SCH-TEST-1');
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

    // 4.2 Backend failure -> must NOT touch localStorage
    const mockFailFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 'error', message: 'Internal server error' }),
    });
    vi.stubGlobal('fetch', mockFailFetch);

    const failSave = await storageService.saveScheduleItem(mockItem);
    expect(failSave.success).toBe(false);
    expect(storageService.getSchedule().find(s => s.id === 'SCH-TEST-1')).toBeUndefined();

    // 4.3 Backend success -> MUST update localStorage cache
    const mockSuccessFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', message: 'تم حفظ الحصة الدراسية بنجاح' }),
    });
    vi.stubGlobal('fetch', mockSuccessFetch);

    const authSave = await storageService.saveScheduleItem(mockItem);
    expect(authSave.success).toBe(true);
    expect(storageService.getSchedule().find(s => s.id === 'SCH-TEST-1')).toBeDefined();

    // Verify correct POST payload
    const saveCall = mockSuccessFetch.mock.calls[0];
    const saveBody = JSON.parse(saveCall[1].body);
    expect(saveBody.action).toBe('saveScheduleEntry');
    expect(saveBody.sessionToken).toBe('AUTH_TOKEN_TEST_VALID_000');
    expect(saveBody.data.id).toBe('SCH-TEST-1');

    // 4.4 Delete failure -> must NOT remove from localStorage
    mockSuccessFetch.mockClear();
    vi.stubGlobal('fetch', mockFailFetch);

    const failDelete = await storageService.deleteScheduleItem('SCH-TEST-1');
    expect(failDelete.success).toBe(false);
    expect(storageService.getSchedule().find(s => s.id === 'SCH-TEST-1')).toBeDefined();

    // 4.5 Delete success -> removes from localStorage
    const mockDeleteSuccessFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', message: 'تم حذف الحصة الدراسية بنجاح' }),
    });
    vi.stubGlobal('fetch', mockDeleteSuccessFetch);

    const authDelete = await storageService.deleteScheduleItem('SCH-TEST-1');
    expect(authDelete.success).toBe(true);
    expect(storageService.getSchedule().find(s => s.id === 'SCH-TEST-1')).toBeUndefined();

    const deleteCall = mockDeleteSuccessFetch.mock.calls[0];
    const deleteBody = JSON.parse(deleteCall[1].body);
    expect(deleteBody.action).toBe('deleteScheduleEntry');
    expect(deleteBody.data.id).toBe('SCH-TEST-1');
  });
});
