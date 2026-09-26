import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageService } from '../src/services/storageService';
import { AttendanceRecord, Employee, Student, StudentAttendanceRecord } from '../src/types';

describe('NTSS Daily Attendance System - Students & Staff', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Daily Student Attendance', () => {
    const makeStudentRecord = (): StudentAttendanceRecord => ({
      id: 'CLIENT-STATT-20260917-STU-1001',
      studentId: 'STU-1001',
      studentName: 'اسم من المتصفح',
      stage: 'مرحلة من المتصفح',
      grade: 'صف من المتصفح',
      classroom: 'فصل من المتصفح',
      date: '2026-09-17',
      dayName: 'يوم من المتصفح',
      status: 'حاضر',
      lateMinutes: 0,
      recordedBy: 'عميل غير موثوق',
      recordedAt: new Date().toISOString(),
    });

    it('does NOT update student attendance cache when backend batch save fails', async () => {
      vi.spyOn(storageService, 'pushPostDirect').mockResolvedValueOnce({
        success: false,
        message: 'Student attendance backend rejected',
      });

      const res = await storageService.saveDailyStudentAttendanceBatchToBackend({
        date: '2026-09-17',
        gradeId: 'الصف الأول',
        classroomId: '1/1',
        records: [makeStudentRecord()],
      });

      expect(res.success).toBe(false);
      expect(res.message).toBe('Student attendance backend rejected');
      expect(res.cacheUpdated).toBe(false);
      expect(storageService.getStudentAttendance()).toEqual([]);
    });

    it('hydrates student attendance cache only from canonical backend records', async () => {
      const backendSpy = vi.spyOn(storageService, 'pushPostDirect').mockResolvedValueOnce({
        success: true,
        message: 'تم حفظ حضور الطلاب',
        savedCount: 1,
        records: [
          {
            id: 'STATT_20260917_STU-1001',
            studentId: 'STU-1001',
            studentCode: '2026-1001',
            studentName: 'أحمد محمود - معتمد',
            stage: 'ابتدائي',
            grade: 'الصف الأول',
            classroom: '1/1',
            date: '2026-09-17',
            dayName: 'الخميس',
            status: 'حاضر',
            lateMinutes: 0,
            recordedBy: 'server-user',
            recordedAt: '2026-09-17T08:00:00.000Z',
          },
        ],
      });

      const res = await storageService.saveDailyStudentAttendanceBatchToBackend({
        date: '2026-09-17',
        gradeId: 'الصف الأول',
        classroomId: '1/1',
        records: [makeStudentRecord()],
      });

      expect(res.success).toBe(true);
      expect(res.cacheUpdated).toBe(true);

      const saved = storageService.getStudentAttendance();
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('STATT_20260917_STU-1001');
      expect(saved[0].studentName).toBe('أحمد محمود - معتمد');
      expect(saved[0].grade).toBe('الصف الأول');
      expect(saved[0].classroom).toBe('1/1');
      expect(saved[0].recordedBy).toBe('server-user');

      const [, payload] = backendSpy.mock.calls[0];
      expect(payload.records).toEqual([
        {
          studentId: 'STU-1001',
          date: '2026-09-17',
          status: 'حاضر',
          lateMinutes: 0,
          notes: '',
        },
      ]);
      expect(payload.records[0].studentName).toBeUndefined();
      expect(payload.records[0].grade).toBeUndefined();
      expect(payload.records[0].classroom).toBeUndefined();
      expect(payload.records[0].id).toBeUndefined();
      expect(payload.records[0].recordedBy).toBeUndefined();
    });

    it('does not hydrate client payload when backend omits canonical student records', async () => {
      vi.spyOn(storageService, 'pushPostDirect').mockResolvedValueOnce({
        success: true,
        message: 'تم الحفظ في الخادم',
        savedCount: 1,
      });

      const res = await storageService.saveDailyStudentAttendanceBatchToBackend({
        date: '2026-09-17',
        gradeId: 'الصف الأول',
        classroomId: '1/1',
        records: [makeStudentRecord()],
      });

      expect(res.success).toBe(true);
      expect(res.cacheUpdated).toBe(false);
      expect(storageService.getStudentAttendance()).toEqual([]);
    });
  });

  describe('Daily Staff Attendance & Strict Backend Constraint', () => {
    it('does NOT update localStorage if backend call fails', async () => {
      const emp: Employee = {
        id: 'EMP-9001',
        name: 'سارة عبد الله',
        department: 'اللغة العربية',
        jobTitle: 'معلم أول',
        status: 'Active',
      };
      storageService.saveEmployee(emp);

      // Verify localStorage is empty for attendance initially
      expect(storageService.getAttendance().length).toBe(0);

      // Mock pushPostDirect to simulate backend failure
      vi.spyOn(storageService, 'pushPostDirect').mockResolvedValueOnce({
        success: false,
        message: 'Network connection failed to Google Apps Script',
      });

      const records: AttendanceRecord[] = [
        {
          id: 'EMPATT_20260917_EMP-9001',
          employeeId: 'EMP-9001',
          employeeName: 'سارة عبد الله',
          department: 'اللغة العربية',
          date: '2026-09-17',
          dayName: 'الخميس',
          checkIn: '',
          checkOut: '',
          workingHours: 0,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          overtimeHours: 0,
          status: 'غائب',
        },
      ];

      const res = await storageService.saveDailyStaffAttendanceBatchToBackend({
        date: '2026-09-17',
        records,
      });

      // Verification: returned error and localStorage was NOT updated!
      expect(res.success).toBe(false);
      expect(res.message).toBe('Network connection failed to Google Apps Script');
      expect(storageService.getAttendance().length).toBe(0);
    });

    it('updates localStorage only after backend responds with success', async () => {
      const emp: Employee = {
        id: 'EMP-9002',
        name: 'محمد خالد',
        department: 'الرياضيات',
        jobTitle: 'معلم',
        status: 'Active',
      };
      storageService.saveEmployee(emp);

      // Mock pushPostDirect to simulate backend success
      vi.spyOn(storageService, 'pushPostDirect').mockResolvedValueOnce({
        success: true,
        message: 'تم حفظ الدفعة بنجاح في السحابة',
        savedCount: 1,
        records: [
          {
            id: 'EMPATT_20260917_EMP-9002',
            employeeId: 'EMP-9002',
            employeeName: 'محمد خالد - من الخادم',
            department: 'الرياضيات',
            date: '2026-09-17',
            dayName: 'الخميس',
            checkIn: '08:00',
            checkOut: '14:30',
            workingHours: 6.5,
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
            overtimeHours: 0,
            status: 'مأذونية',
          },
        ],
      });

      const records: AttendanceRecord[] = [
        {
          id: 'EMPATT_20260917_EMP-9002',
          employeeId: 'EMP-9002',
          employeeName: 'محمد خالد',
          department: 'الرياضيات',
          date: '2026-09-17',
          dayName: 'الخميس',
          checkIn: '08:00',
          checkOut: '14:30',
          workingHours: 6.5,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          overtimeHours: 0,
          status: 'مأذونية',
        },
      ];

      const res = await storageService.saveDailyStaffAttendanceBatchToBackend({
        date: '2026-09-17',
        records,
      });

      expect(res.success).toBe(true);
      const saved = storageService.getAttendance();
      expect(saved.length).toBe(1);
      expect(saved[0].employeeId).toBe('EMP-9002');
      expect(saved[0].status).toBe('مأذونية');
      expect(saved[0].employeeName).toBe('محمد خالد - من الخادم');
      expect(res.cacheUpdated).toBe(true);
    });

    it('does not update local cache when backend success omits canonical records', async () => {
      vi.spyOn(storageService, 'pushPostDirect').mockResolvedValueOnce({
        success: true,
        message: 'تم الحفظ في الخادم',
        savedCount: 1,
      });

      const records: AttendanceRecord[] = [
        {
          id: 'CLIENT-SPOOFED-ID',
          employeeId: 'EMP-9003',
          employeeName: 'اسم من المتصفح',
          department: 'قسم من المتصفح',
          date: '2026-09-17',
          dayName: 'الخميس',
          checkIn: '08:00',
          checkOut: '14:30',
          workingHours: 99,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          overtimeHours: 0,
          status: 'حاضر',
        },
      ];

      const res = await storageService.saveDailyStaffAttendanceBatchToBackend({
        date: '2026-09-17',
        records,
      });

      expect(res.success).toBe(true);
      expect(res.cacheUpdated).toBe(false);
      expect(storageService.getAttendance()).toHaveLength(0);
    });
  });
});
