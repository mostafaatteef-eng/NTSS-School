import { describe, it, expect, beforeEach } from 'vitest';
import { storageService } from '../services/storageService';
import { hrService } from '../services/hrService';
import { timetableService } from '../services/timetableService';
import { User, LeaveRecord, EmployeePermissionRecord, Employee, SupervisionAssignment } from '../types';

describe('Phase 3 Test Suite: Ownership, School Isolation & FULL_DAY Supervision Logic', () => {
  beforeEach(() => {
    localStorage.clear();
    storageService.setCurrentUser(null);
  });

  /* =========================================================================
   * 1. OWNERSHIP ENFORCEMENT (Self-Service Only for Teachers / Staff)
   * ========================================================================= */
  describe('1. Ownership Enforcement: Employee cannot submit requests for others', () => {
    const teacherUser1: User = {
      id: 'USR-T1',
      username: 'ahmed_teacher',
      fullName: 'أحمد محمود',
      role: 'Teacher',
      employeeId: 'EMP-001',
      schoolId: 'SCH-001',
      sessionToken: 'SESSION-TOKEN-TEACHER-1',
    };

    const teacherUser2: User = {
      id: 'USR-T2',
      username: 'mona_teacher',
      fullName: 'منى إبراهيم',
      role: 'Teacher',
      employeeId: 'EMP-002',
      schoolId: 'SCH-001',
      sessionToken: 'SESSION-TOKEN-TEACHER-2',
    };

    it('A teacher can submit leave for themselves using session identity', () => {
      storageService.setCurrentUser(teacherUser1);

      const res = storageService.submitMyLeaveRequest(
        {
          leaveType: 'اعتيادية',
          startDate: '2026-10-01',
          endDate: '2026-10-02',
          daysCount: 2,
          reason: 'ظرف عائلي',
        },
        teacherUser1
      );

      expect(res.success).toBe(true);

      const leaves = storageService.getLeaves();
      expect(leaves.length).toBe(1);
      expect(leaves[0].employeeId).toBe('EMP-001');
      expect(leaves[0].schoolId).toBe('SCH-001');
      expect(leaves[0].status).toBe('معلقة');
    });

    it('Reject or override when a non-admin teacher attempts to spoof another employeeId in leave request', () => {
      storageService.setCurrentUser(teacherUser1);

      // Attempt to tamper with employeeId pointing to EMP-002 (Teacher 2)
      const spoofedLeave: LeaveRecord = {
        id: 'LEV-SPOOF-01',
        schoolId: 'SCH-001',
        employeeId: 'EMP-002',
        employeeName: 'منى إبراهيم',
        leaveType: 'عارضة',
        startDate: '2026-10-05',
        endDate: '2026-10-05',
        daysCount: 1,
        reason: 'محاولة اختراق',
        status: 'معلقة',
      };

      const res = storageService.saveLeave(spoofedLeave, teacherUser1);
      // Must be rejected by strict security guard
      expect(res.success).toBe(false);
      expect(res.message).toContain('غير مصرح لك بإنشاء أو تعديل طلب لموظف آخر');

      // Verify no leave was saved for EMP-002
      const leaves = storageService.getLeaves();
      const monaLeaves = leaves.filter(l => l.employeeId === 'EMP-002');
      expect(monaLeaves.length).toBe(0);
    });

    it('A teacher can request permission for themselves but cannot request for another employee', () => {
      storageService.setCurrentUser(teacherUser1);

      // 1. Valid self permission
      const validPerm: Partial<EmployeePermissionRecord> = {
        date: '2026-10-06',
        startTime: '10:00',
        endTime: '12:00',
        permissionType: 'إذن خروج مؤقت',
        reason: 'مراجعة طبية',
      };
      const resValid = hrService.savePermission(validPerm as EmployeePermissionRecord, teacherUser1);
      expect(resValid.success).toBe(true);
      expect(resValid.data?.employeeId).toBe('EMP-001');

      // 2. Spoofed permission pointing to another employee EMP-002
      const spoofedPerm: Partial<EmployeePermissionRecord> = {
        employeeId: 'EMP-002',
        date: '2026-10-06',
        startTime: '10:00',
        endTime: '12:00',
        permissionType: 'إذن خروج مؤقت',
        reason: 'محاولة تزوير إذن',
      };
      const resSpoofed = hrService.savePermission(spoofedPerm as EmployeePermissionRecord, teacherUser1);
      expect(resSpoofed.success).toBe(false);
      expect(resSpoofed.message).toContain('لا يمكنك إنشاء طلب إذن لموظف آخر');
    });

    it('HR or Admin CAN submit or manage leaves on behalf of school employees', () => {
      const hrAdmin: User = {
        id: 'USR-HR',
        username: 'hr_manager',
        fullName: 'مسؤول الموارد البشرية',
        role: 'TeacherAffairs',
        schoolId: 'SCH-001',
        sessionToken: 'SESSION-TOKEN-HR',
      };
      storageService.setCurrentUser(hrAdmin);

      const adminManagedLeave: LeaveRecord = {
        id: 'LEV-HR-01',
        schoolId: 'SCH-001',
        employeeId: 'EMP-002',
        employeeName: 'منى إبراهيم',
        leaveType: 'مرضية',
        startDate: '2026-10-10',
        endDate: '2026-10-12',
        daysCount: 3,
        reason: 'تقرير طبي معتمد',
        status: 'مقبولة',
      };

      const res = storageService.saveLeave(adminManagedLeave, hrAdmin);
      expect(res.success).toBe(true);

      const leaves = storageService.getLeaves();
      expect(leaves.some(l => l.employeeId === 'EMP-002' && l.status === 'مقبولة')).toBe(true);
    });
  });

  /* =========================================================================
   * 2. SCHOOL DATA ISOLATION (Multi-School Multi-Tenant Boundaries)
   * ========================================================================= */
  describe('2. School Data Isolation: Strictly prevent cross-school data leakage', () => {
    const schoolAUser: User = {
      id: 'USR-SCH-A',
      username: 'teacher_sch_a',
      fullName: 'معلم مدرسة أ',
      role: 'Teacher',
      employeeId: 'EMP-A1',
      schoolId: 'SCH-AAA',
      sessionToken: 'TOKEN-SCH-A',
    };

    const schoolBUser: User = {
      id: 'USR-SCH-B',
      username: 'teacher_sch_b',
      fullName: 'معلم مدرسة ب',
      role: 'Teacher',
      employeeId: 'EMP-B1',
      schoolId: 'SCH-BBB',
      sessionToken: 'TOKEN-SCH-B',
    };

    it('Leaves created in School AAA are completely isolated from School BBB queries', () => {
      // Create leave for School A
      storageService.saveLeave(
        {
          id: 'LEV-SCH-A-01',
          schoolId: 'SCH-AAA',
          employeeId: 'EMP-A1',
          employeeName: 'معلم مدرسة أ',
          leaveType: 'سنوية',
          startDate: '2026-10-15',
          endDate: '2026-10-16',
          daysCount: 2,
          reason: 'إجازة خاصة بمدرسة أ',
          status: 'معلقة',
        },
        schoolAUser
      );

      // Create leave for School B
      storageService.saveLeave(
        {
          id: 'LEV-SCH-B-01',
          schoolId: 'SCH-BBB',
          employeeId: 'EMP-B1',
          employeeName: 'معلم مدرسة ب',
          leaveType: 'سنوية',
          startDate: '2026-10-15',
          endDate: '2026-10-16',
          daysCount: 2,
          reason: 'إجازة خاصة بمدرسة ب',
          status: 'معلقة',
        },
        schoolBUser
      );

      // Query leaves for School A
      const leavesA = storageService.getLeaves('SCH-AAA');
      expect(leavesA.length).toBe(1);
      expect(leavesA[0].schoolId).toBe('SCH-AAA');
      expect(leavesA[0].employeeId).toBe('EMP-A1');

      // Query leaves for School B
      const leavesB = storageService.getLeaves('SCH-BBB');
      expect(leavesB.length).toBe(1);
      expect(leavesB[0].schoolId).toBe('SCH-BBB');
      expect(leavesB[0].employeeId).toBe('EMP-B1');
    });

    it('Rejects attempt by user from School A to edit or overwrite leave belonging to School B', () => {
      // Pre-seed School B leave
      storageService.saveLeave(
        {
          id: 'LEV-SCH-B-SECURE',
          schoolId: 'SCH-BBB',
          employeeId: 'EMP-B1',
          employeeName: 'معلم مدرسة ب',
          leaveType: 'سنوية',
          startDate: '2026-10-20',
          endDate: '2026-10-20',
          daysCount: 1,
          status: 'معلقة',
        },
        schoolBUser
      );

      // User from School A attempts to tamper with School B's leave
      const tamperRes = storageService.saveLeave(
        {
          id: 'LEV-SCH-B-SECURE',
          schoolId: 'SCH-AAA',
          employeeId: 'EMP-A1',
          leaveType: 'مرضية',
          startDate: '2026-10-20',
          endDate: '2026-10-20',
          daysCount: 1,
          status: 'مقبولة',
        },
        schoolAUser
      );

      expect(tamperRes.success).toBe(false);
      expect(tamperRes.message).toContain('غير مصرح لك بتعديل سجل يتبع مدرسة أخرى');
    });

    it('Supervision assignments strictly filter by schoolId to avoid cross-school scheduling leak', () => {
      timetableService.saveSupervisionAssignment({
        id: 'SUP-A-1',
        schoolId: 'SCH-AAA',
        teacherId: 'EMP-A1',
        teacherName: 'معلم أ',
        locationId: 'LOC-GATE',
        locationName: 'البوابة الرئيسية',
        date: '2026-10-25',
        dayOfWeek: 'الأحد',
        shift: 'FULL_DAY',
        supervisionMode: 'FULL_DAY',
        status: 'Scheduled',
      });

      timetableService.saveSupervisionAssignment({
        id: 'SUP-B-1',
        schoolId: 'SCH-BBB',
        teacherId: 'EMP-B1',
        teacherName: 'معلم ب',
        locationId: 'LOC-YARD',
        locationName: 'الفناء المدرسي',
        date: '2026-10-25',
        dayOfWeek: 'الأحد',
        shift: 'FULL_DAY',
        supervisionMode: 'FULL_DAY',
        status: 'Scheduled',
      });

      const listA = timetableService.getSupervisionAssignments({ schoolId: 'SCH-AAA' });
      expect(listA.length).toBe(1);
      expect(listA[0].id).toBe('SUP-A-1');

      const listB = timetableService.getSupervisionAssignments({ schoolId: 'SCH-BBB' });
      expect(listB.length).toBe(1);
      expect(listB[0].id).toBe('SUP-B-1');
    });
  });

  /* =========================================================================
   * 3. FULL_DAY SUPERVISION LOGIC & NO QUOTA INFLATION
   * ========================================================================= */
  describe('3. FULL_DAY Supervision Logic: conflict detection & quota safety', () => {
    const teacherId = 'EMP-SUP-01';

    beforeEach(() => {
      // Seed teacher as active teaching staff
      const teacher: Employee = {
        id: teacherId,
        name: 'أستاذ عصام المشرف',
        employeeType: 'Teacher',
        jobTitle: 'معلم أول',
        status: 'Active',
        isTeachingStaff: true,
      };
      storageService.saveEmployee(teacher);
    });

    it('Assigning FULL_DAY supervision detects and blocks duplicate supervision on the same day', () => {
      const assignment1: SupervisionAssignment = {
        id: 'SUP-FD-1',
        teacherId,
        teacherName: 'أستاذ عصام المشرف',
        locationId: 'LOC-GATE',
        locationName: 'البوابة الرئيسية',
        date: '2026-11-01',
        dayOfWeek: 'الأحد',
        shift: 'FULL_DAY',
        supervisionMode: 'FULL_DAY',
        status: 'Scheduled',
      };

      const res1 = timetableService.saveSupervisionAssignment(assignment1);
      expect(res1.success).toBe(true);

      // Attempting to assign another shift (e.g. MORNING or ANOTHER FULL_DAY) on the same date for the same teacher
      const conflictCheck = timetableService.validateSupervisionConflict({
        teacherId,
        date: '2026-11-01',
        shift: 'MORNING',
        supervisionMode: 'TIME_SLOT',
      });

      expect(conflictCheck.hasConflict).toBe(true);
      expect(conflictCheck.reason).toContain('المعلم معين بالفعل في الإشراف');
      expect(conflictCheck.reason).toContain('إشراف يوم كامل');
    });

    it('FULL_DAY supervision does NOT artificially inflate teaching load / period quotas', () => {
      // Initial load calculation for teacher with 0 scheduled classes
      const initialLoad = timetableService.calculateTeacherLoad(teacherId, '2026-11-01');
      expect(initialLoad.scheduledBasePeriods).toBe(0);
      expect(initialLoad.countedWeeklyPeriods).toBe(0);
      expect(initialLoad.supervisionCount).toBe(0);

      // Assign a FULL_DAY supervision
      timetableService.saveSupervisionAssignment({
        id: 'SUP-FD-2',
        teacherId,
        teacherName: 'أستاذ عصام المشرف',
        locationId: 'LOC-YARD',
        locationName: 'الفناء المدرسي',
        date: '2026-11-01', // Sunday
        dayOfWeek: 'الأحد',
        shift: 'FULL_DAY',
        supervisionMode: 'FULL_DAY',
        status: 'Scheduled',
      });

      // Recalculate load
      const loadAfterSupervision = timetableService.calculateTeacherLoad(teacherId, '2026-11-01');

      // Supervision count should increment by 1
      expect(loadAfterSupervision.supervisionCount).toBe(1);

      // CRITICAL: Supervision does NOT add teaching periods (no quota inflation)
      expect(loadAfterSupervision.countedWeeklyPeriods).toBe(0);
      expect(loadAfterSupervision.scheduledBasePeriods).toBe(0);
      expect(loadAfterSupervision.reservePeriodsThisWeek).toBe(0);
      expect(loadAfterSupervision.isOverloaded).toBe(false);
      expect(loadAfterSupervision.remainingCapacity).toBe(30); // Standard quota unchanged
    });
  });
});
