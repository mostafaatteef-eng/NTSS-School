import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageService } from '../src/services/storageService';
import { AttendanceRecord, Employee, Student, StudentAttendanceRecord } from '../src/types';

describe('NTSS Daily Attendance System - Students & Staff', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Daily Student Attendance', () => {
    it('saves daily student attendance batch and synchronizes records', async () => {
      const student: Student = {
        id: 'STU-1001',
        studentCode: '2026-1001',
        name: 'أحمد محمود',
        stage: 'ابتدائي',
        grade: 'الصف الأول',
        classroom: '1/1',
        gender: 'ذكر',
        status: 'نشط',
      };
      storageService.saveStudent(student);

      const records: StudentAttendanceRecord[] = [
        {
          id: 'STATT_20260917_STU-1001',
          studentId: 'STU-1001',
          studentName: 'أحمد محمود',
          stage: 'ابتدائي',
          grade: 'الصف الأول',
          classroom: '1/1',
          date: '2026-09-17',
          dayName: 'الخميس',
          status: 'حاضر',
          lateMinutes: 0,
          recordedBy: 'مشرف الحضور',
          recordedAt: new Date().toISOString(),
        },
      ];

      const res = await storageService.saveDailyStudentAttendanceBatchToBackend({
        date: '2026-09-17',
        gradeId: 'الصف الأول',
        classroomId: '1/1',
        records,
      });

      expect(res.success).toBe(true);
      const saved = storageService.getStudentAttendance();
      expect(saved.length).toBe(1);
      expect(saved[0].studentId).toBe('STU-1001');
      expect(saved[0].status).toBe('حاضر');
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
    });
  });
});
