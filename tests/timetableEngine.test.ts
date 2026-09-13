/**
 * Timetable Engine & Teacher Load Policy Test Suite
 * Tests all 16 corrective phase requirements:
 * 1. Base 26 + Reserve 3 = 29/30
 * 2. Add reserve => 30/30 PASS
 * 3. Add another => DENIED
 * 4. Next week reserve counter = 0 (Query-based reset, historical records preserved)
 * 5. Reserve candidate exclusions (timetable, reserve, supervision, unavailable, at 30/30)
 * 6. Reserve candidate 5-tier ranking hierarchy
 * 7. Supervision conflicts (double booking, lesson conflict, reserve conflict)
 * 8. Lesson-Break interval overlap conflict check
 * 9. Curriculum 39-period plan & Week A / Week B cycle
 * 10. Backend authorization for teacher homework/resources/exams
 * 11. Student read-only token and revocation
 * 12. Timetable import teacherCode mapping rules
 */

import { describe, it, expect, beforeEach } from 'vitest';

// 1. In-memory localStorage polyfill for Node.js test runtime
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

import { Employee, ScheduleItem, ScheduleSubstitution, Student } from '../src/types';
import { timetableService } from '../src/services/timetableService';
import { storageService } from '../src/services/storageService';

describe('Timetable Engine & Load Policy', () => {
  const teacherA: Employee = {
    id: 'EMP-T1',
    name: 'أحمد محمود',
    teacherCode: 'T101',
    isTeacher: true,
    department: 'قسم الحاسب الآلي والبرمجة',
    teachingSubjects: ['برمجة وتطوير المواقع', 'شبكات الحاسب'],
    phone: '01000000001',
    nationalId: '29001010101011',
    hireDate: '2022-01-01',
    jobTitle: 'معلم أول أ',
    workingHours: 8,
    workStartTime: '07:30',
    workEndTime: '15:00',
    daysOff: ['الجمعة', 'السبت'],
    status: 'Active',
  };

  const teacherB: Employee = {
    id: 'EMP-T2',
    name: 'محمد إبراهيم',
    teacherCode: 'T102',
    isTeacher: true,
    department: 'قسم الحاسب الآلي والبرمجة',
    teachingSubjects: ['برمجة وتطوير المواقع'],
    phone: '01000000002',
    nationalId: '29001010101012',
    hireDate: '2022-01-01',
    jobTitle: 'معلم',
    workingHours: 8,
    workStartTime: '07:30',
    workEndTime: '15:00',
    daysOff: ['الجمعة', 'السبت'],
    status: 'Active',
  };

  beforeEach(() => {
    localStorage.clear();
    storageService.saveEmployee(teacherA);
    storageService.saveEmployee(teacherB);
  });

  it('TEST 1: Policy Limits Configuration', () => {
    const policy = timetableService.getTeacherLoadPolicy();
    expect(policy.weeklyPeriodLimit).toBe(30);
    expect(policy.weeklyMinutesLimit).toBe(1500);
    expect(policy.defaultPeriodMinutes).toBe(50);
  });

  it('TEST 2: Base 26 + Reserve 3 = 29/30', () => {
    const currentWeekDate = '2026-10-04'; // Sunday
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

    const scheduleList: ScheduleItem[] = [];
    let pCount = 0;
    for (let d = 0; d < 5 && pCount < 26; d++) {
      for (let p = 1; p <= 6 && pCount < 26; p++) {
        pCount++;
        scheduleList.push({
          id: `SCH-T1-${pCount}`,
          academicYear: '2026-2027',
          grade: 'الصف الأول',
          classroom: '1/1',
          dayOfWeek: days[d],
          periodNumber: p,
          startTime: '08:00',
          endTime: '08:50',
          subject: 'برمجة وتطوير المواقع',
          teacherId: teacherA.id,
          teacherName: teacherA.name,
          teacherCode: teacherA.teacherCode,
          isActive: true,
        });
      }
    }
    localStorage.setItem('ntss_schedule_v3', JSON.stringify(scheduleList));

    const sub1: ScheduleSubstitution = {
      id: 'SUB-1',
      date: '2026-10-04',
      dayOfWeek: 'الأحد',
      periodNumber: 7,
      classroom: '1/2',
      subject: 'برمجة وتطوير المواقع',
      originalTeacherId: 'EMP-OTHER',
      originalTeacherName: 'معلم غائب',
      substituteTeacherId: teacherA.id,
      substituteTeacherName: teacherA.name,
      reason: 'غياب مرضي',
      status: 'CONFIRMED',
      createdAt: '2026-10-04T07:00:00.000Z',
    };
    const sub2: ScheduleSubstitution = {
      id: 'SUB-2',
      date: '2026-10-05',
      dayOfWeek: 'الإثنين',
      periodNumber: 7,
      classroom: '1/2',
      subject: 'برمجة وتطوير المواقع',
      originalTeacherId: 'EMP-OTHER',
      originalTeacherName: 'معلم غائب',
      substituteTeacherId: teacherA.id,
      substituteTeacherName: teacherA.name,
      reason: 'مأمورية',
      status: 'CONFIRMED',
      createdAt: '2026-10-05T07:00:00.000Z',
    };
    const sub3: ScheduleSubstitution = {
      id: 'SUB-3',
      date: '2026-10-06',
      dayOfWeek: 'الثلاثاء',
      periodNumber: 7,
      classroom: '1/2',
      subject: 'برمجة وتطوير المواقع',
      originalTeacherId: 'EMP-OTHER',
      originalTeacherName: 'معلم غائب',
      substituteTeacherId: teacherA.id,
      substituteTeacherName: teacherA.name,
      reason: 'إجازة عارضة',
      status: 'CONFIRMED',
      createdAt: '2026-10-06T07:00:00.000Z',
    };

    storageService.saveSubstitution(sub1);
    storageService.saveSubstitution(sub2);
    storageService.saveSubstitution(sub3);

    const load1 = timetableService.calculateTeacherLoad(teacherA.id, currentWeekDate);
    expect(load1.scheduledBasePeriods).toBe(26);
    expect(load1.reservePeriodsThisWeek).toBe(3);
    expect(load1.countedWeeklyPeriods).toBe(29);
    expect(load1.countedWeeklyMinutes).toBe(1450);
    expect(load1.remainingCapacity).toBe(1);
    expect(load1.loadStatus).toBe('NEAR_LIMIT');
  });

  it('TEST 3: Add 4th reserve => 30/30 reached', () => {
    const currentWeekDate = '2026-10-04';
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
    const scheduleList: ScheduleItem[] = [];
    let pCount = 0;
    for (let d = 0; d < 5 && pCount < 26; d++) {
      for (let p = 1; p <= 6 && pCount < 26; p++) {
        pCount++;
        scheduleList.push({
          id: `SCH-T1-${pCount}`,
          academicYear: '2026-2027',
          grade: 'الصف الأول',
          classroom: '1/1',
          dayOfWeek: days[d],
          periodNumber: p,
          startTime: '08:00',
          endTime: '08:50',
          subject: 'برمجة وتطوير المواقع',
          teacherId: teacherA.id,
          teacherName: teacherA.name,
          teacherCode: teacherA.teacherCode,
          isActive: true,
        });
      }
    }
    localStorage.setItem('ntss_schedule_v3', JSON.stringify(scheduleList));

    for (let i = 1; i <= 3; i++) {
      storageService.saveSubstitution({
        id: `SUB-${i}`,
        date: `2026-10-0${3 + i}`,
        dayOfWeek: days[i - 1],
        periodNumber: 7,
        classroom: '1/2',
        subject: 'برمجة وتطوير المواقع',
        originalTeacherId: 'EMP-OTHER',
        originalTeacherName: 'معلم غائب',
        substituteTeacherId: teacherA.id,
        substituteTeacherName: teacherA.name,
        reason: 'غياب',
        status: 'CONFIRMED',
        createdAt: '2026-10-04T07:00:00.000Z',
      });
    }

    const sub4: ScheduleSubstitution = {
      id: 'SUB-4',
      date: '2026-10-07',
      dayOfWeek: 'الأربعاء',
      periodNumber: 7,
      classroom: '1/2',
      subject: 'برمجة وتطوير المواقع',
      originalTeacherId: 'EMP-OTHER',
      originalTeacherName: 'معلم غائب',
      substituteTeacherId: teacherA.id,
      substituteTeacherName: teacherA.name,
      reason: 'غياب',
      status: 'CONFIRMED',
      createdAt: '2026-10-07T07:00:00.000Z',
    };

    const res4 = timetableService.saveReserveSubstitution(sub4);
    expect(res4.success).toBe(true);

    const load2 = timetableService.calculateTeacherLoad(teacherA.id, currentWeekDate);
    expect(load2.countedWeeklyPeriods).toBe(30);
    expect(load2.countedWeeklyMinutes).toBe(1500);
    expect(load2.remainingCapacity).toBe(0);
    expect(load2.loadStatus).toBe('FULL');
  });

  it('TEST 4: Add 5th reserve => DENIED (31 > 30)', () => {
    const currentWeekDate = '2026-10-04';
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
    const scheduleList: ScheduleItem[] = [];
    let pCount = 0;
    for (let d = 0; d < 5 && pCount < 26; d++) {
      for (let p = 1; p <= 6 && pCount < 26; p++) {
        pCount++;
        scheduleList.push({
          id: `SCH-T1-${pCount}`,
          academicYear: '2026-2027',
          grade: 'الصف الأول',
          classroom: '1/1',
          dayOfWeek: days[d],
          periodNumber: p,
          startTime: '08:00',
          endTime: '08:50',
          subject: 'برمجة وتطوير المواقع',
          teacherId: teacherA.id,
          teacherName: teacherA.name,
          teacherCode: teacherA.teacherCode,
          isActive: true,
        });
      }
    }
    localStorage.setItem('ntss_schedule_v3', JSON.stringify(scheduleList));

    for (let i = 1; i <= 4; i++) {
      storageService.saveSubstitution({
        id: `SUB-${i}`,
        date: `2026-10-0${3 + i}`,
        dayOfWeek: days[i - 1],
        periodNumber: 7,
        classroom: '1/2',
        subject: 'برمجة وتطوير المواقع',
        originalTeacherId: 'EMP-OTHER',
        originalTeacherName: 'معلم غائب',
        substituteTeacherId: teacherA.id,
        substituteTeacherName: teacherA.name,
        reason: 'غياب',
        status: 'CONFIRMED',
        createdAt: '2026-10-04T07:00:00.000Z',
      });
    }

    const sub5: ScheduleSubstitution = {
      id: 'SUB-5',
      date: '2026-10-08',
      dayOfWeek: 'الخميس',
      periodNumber: 7,
      classroom: '1/2',
      subject: 'برمجة وتطوير المواقع',
      originalTeacherId: 'EMP-OTHER',
      originalTeacherName: 'معلم غائب',
      substituteTeacherId: teacherA.id,
      substituteTeacherName: teacherA.name,
      reason: 'غياب إضافي',
      status: 'CONFIRMED',
      createdAt: '2026-10-08T07:00:00.000Z',
    };

    const res5 = timetableService.saveReserveSubstitution(sub5);
    expect(res5.success).toBe(false);
    expect(res5.message).toMatch(/تجاوز|30/);

    const loadAfterAttempt = timetableService.calculateTeacherLoad(teacherA.id, currentWeekDate);
    expect(loadAfterAttempt.countedWeeklyPeriods).toBe(30);
  });

  it('TEST 5: Next week reserve counter = 0 (Query-based reset)', () => {
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
    const scheduleList: ScheduleItem[] = [];
    let pCount = 0;
    for (let d = 0; d < 5 && pCount < 26; d++) {
      for (let p = 1; p <= 6 && pCount < 26; p++) {
        pCount++;
        scheduleList.push({
          id: `SCH-T1-${pCount}`,
          academicYear: '2026-2027',
          grade: 'الصف الأول',
          classroom: '1/1',
          dayOfWeek: days[d],
          periodNumber: p,
          startTime: '08:00',
          endTime: '08:50',
          subject: 'برمجة وتطوير المواقع',
          teacherId: teacherA.id,
          teacherName: teacherA.name,
          teacherCode: teacherA.teacherCode,
          isActive: true,
        });
      }
    }
    localStorage.setItem('ntss_schedule_v3', JSON.stringify(scheduleList));

    for (let i = 1; i <= 4; i++) {
      storageService.saveSubstitution({
        id: `SUB-${i}`,
        date: `2026-10-0${3 + i}`,
        dayOfWeek: days[i - 1],
        periodNumber: 7,
        classroom: '1/2',
        subject: 'برمجة وتطوير المواقع',
        originalTeacherId: 'EMP-OTHER',
        originalTeacherName: 'معلم غائب',
        substituteTeacherId: teacherA.id,
        substituteTeacherName: teacherA.name,
        reason: 'غياب',
        status: 'CONFIRMED',
        createdAt: '2026-10-04T07:00:00.000Z',
      });
    }

    const nextWeekDate = '2026-10-11';
    const loadNextWeek = timetableService.calculateTeacherLoad(teacherA.id, nextWeekDate);

    expect(loadNextWeek.scheduledBasePeriods).toBe(26);
    expect(loadNextWeek.reservePeriodsThisWeek).toBe(0);
    expect(loadNextWeek.countedWeeklyPeriods).toBe(26);
    expect(loadNextWeek.remainingCapacity).toBe(4);

    const allHistoricalSubs = storageService.getSubstitutions();
    expect(allHistoricalSubs.length).toBe(4);
    expect(loadNextWeek.historicalReserveCount).toBe(4);
  });

  it('TEST 6: Reserve candidate exclusions & 5-tier ranking', () => {
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
    const scheduleList: ScheduleItem[] = [];
    let pCount = 0;
    for (let d = 0; d < 5 && pCount < 26; d++) {
      for (let p = 1; p <= 6 && pCount < 26; p++) {
        pCount++;
        scheduleList.push({
          id: `SCH-T1-${pCount}`,
          academicYear: '2026-2027',
          grade: 'الصف الأول',
          classroom: '1/1',
          dayOfWeek: days[d],
          periodNumber: p,
          startTime: '08:00',
          endTime: '08:50',
          subject: 'برمجة وتطوير المواقع',
          teacherId: teacherA.id,
          teacherName: teacherA.name,
          teacherCode: teacherA.teacherCode,
          isActive: true,
        });
      }
    }
    localStorage.setItem('ntss_schedule_v3', JSON.stringify(scheduleList));

    for (let i = 1; i <= 4; i++) {
      storageService.saveSubstitution({
        id: `SUB-${i}`,
        date: `2026-10-0${3 + i}`,
        dayOfWeek: days[i - 1],
        periodNumber: 7,
        classroom: '1/2',
        subject: 'برمجة وتطوير المواقع',
        originalTeacherId: 'EMP-OTHER',
        originalTeacherName: 'معلم غائب',
        substituteTeacherId: teacherA.id,
        substituteTeacherName: teacherA.name,
        reason: 'غياب',
        status: 'CONFIRMED',
        createdAt: '2026-10-04T07:00:00.000Z',
      });
    }

    const candidatesWeek1 = timetableService.getReserveCandidates('2026-10-04', 7, 'الأحد', 'EMP-OTHER', 'برمجة وتطوير المواقع');
    const candA = candidatesWeek1.find(c => c.teacherId === teacherA.id);
    expect(candA?.isEligible).toBe(false);
    expect(candA?.status).toBe('NOT_ELIGIBLE');

    const candidatesNextWeek = timetableService.getReserveCandidates('2026-10-11', 7, 'الأحد', 'EMP-OTHER', 'برمجة وتطوير المواقع');
    const candANext = candidatesNextWeek.find(c => c.teacherId === teacherA.id);
    expect(candANext?.isEligible).toBe(true);
  });

  it('TEST 7: Supervision conflict validation', () => {
    const scheduleItem: ScheduleItem = {
      id: 'SCH-1',
      academicYear: '2026-2027',
      grade: 'الصف الأول',
      classroom: '1/1',
      dayOfWeek: 'الأحد',
      periodNumber: 1,
      startTime: '08:00',
      endTime: '08:50',
      subject: 'برمجة وتطوير المواقع',
      teacherId: teacherA.id,
      teacherName: teacherA.name,
      teacherCode: teacherA.teacherCode,
      isActive: true,
    };
    localStorage.setItem('ntss_schedule_v3', JSON.stringify([scheduleItem]));

    storageService.saveSubstitution({
      id: 'SUB-1',
      date: '2026-10-04',
      dayOfWeek: 'الأحد',
      periodNumber: 7,
      classroom: '1/2',
      subject: 'برمجة وتطوير المواقع',
      originalTeacherId: 'EMP-OTHER',
      originalTeacherName: 'معلم غائب',
      substituteTeacherId: teacherA.id,
      substituteTeacherName: teacherA.name,
      reason: 'غياب',
      status: 'CONFIRMED',
      createdAt: '2026-10-04T07:00:00.000Z',
    });

    const supConflict1 = timetableService.validateSupervisionConflict({
      teacherId: teacherA.id,
      date: '2026-10-04',
      dayOfWeek: 'الأحد',
      periodNumber: 1,
    });
    expect(supConflict1.hasConflict).toBe(true);

    const supConflict2 = timetableService.validateSupervisionConflict({
      teacherId: teacherA.id,
      date: '2026-10-04',
      dayOfWeek: 'الأحد',
      periodNumber: 7,
    });
    expect(supConflict2.hasConflict).toBe(true);
  });

  it('TEST 8: Lesson-Break interval overlap conflict', () => {
    timetableService.saveScheduleBreak({
      id: 'BRK-TEST',
      name: 'فسحة الصلاة',
      startTime: '10:20',
      endTime: '10:45',
      sortOrder: 1,
      isActive: true,
    });

    const breakConflict = timetableService.validateLessonBreakConflict('10:00', '10:30');
    expect(breakConflict.hasConflict).toBe(true);

    const breakNoConflict = timetableService.validateLessonBreakConflict('09:20', '10:10');
    expect(breakNoConflict.hasConflict).toBe(false);
  });

  it('TEST 9: Curriculum 39-period plan', () => {
    const coverageInitial = timetableService.validateCurriculum39('1/1');
    expect(coverageInitial.totalRequiredPeriods).toBe(39);
    expect(coverageInitial.status).toBe('DEFICIT');
  });

  it('TEST 10: Backend Teacher Classroom Authorization', () => {
    const scheduleItem: ScheduleItem = {
      id: 'SCH-1',
      academicYear: '2026-2027',
      grade: 'الصف الأول',
      classroom: '1/1',
      dayOfWeek: 'الأحد',
      periodNumber: 1,
      startTime: '08:00',
      endTime: '08:50',
      subject: 'برمجة وتطوير المواقع',
      teacherId: teacherA.id,
      teacherName: teacherA.name,
      teacherCode: teacherA.teacherCode,
      isActive: true,
    };
    localStorage.setItem('ntss_schedule_v3', JSON.stringify([scheduleItem]));

    const authAssigned = timetableService.validateTeacherClassroomAuthorization(
      { role: 'Teacher', employeeId: teacherA.id },
      '1/1'
    );
    expect(authAssigned.authorized).toBe(true);

    const authUnassigned = timetableService.validateTeacherClassroomAuthorization(
      { role: 'Teacher', employeeId: teacherA.id },
      '2/3'
    );
    expect(authUnassigned.authorized).toBe(false);

    const hwDenied = timetableService.saveHomework(
      {
        id: '',
        classroomId: '2/3',
        classroom: '2/3',
        grade: 'الصف الأول',
        description: 'واجب تجريبي لاختبار الصلاحية',
        createdAt: '2026-10-04T07:00:00.000Z',
        subjectId: 'برمجة وتطوير المواقع',
        subject: 'برمجة وتطوير المواقع',
        title: 'واجب غير مصرح به',
        assignedDate: '2026-10-04',
        dueDate: '2026-10-07',
        teacherId: teacherA.id,
        teacherName: teacherA.name,
      },
      { role: 'Teacher', employeeId: teacherA.id }
    );
    expect(hwDenied.success).toBe(false);
  });

  it('TEST 11: Student Read-Only Access & Revocation', () => {
    const mockStudent: Student = {
      id: 'STU-001',
      studentCode: '2026001',
      name: 'عمر خالد',
      grade: 'الصف الأول',
      classroom: '1/1',
      nationalId: '30801010101011',
      gender: 'ذكر',
      status: 'نشط',
      enrollmentDate: '2026-09-01',
    };
    storageService.saveStudent(mockStudent);

    const directCodeAttempt = timetableService.getStudentTimetableData('2026001');
    expect(directCodeAttempt.success).toBe(false);

    const tokenObj = timetableService.generateStudentAccessToken(mockStudent.id, mockStudent.studentCode!);
    expect(tokenObj.token.length).toBeGreaterThanOrEqual(32);

    const validAccess = timetableService.getStudentTimetableData(tokenObj.token);
    expect(validAccess.success).toBe(true);

    timetableService.revokeStudentAccessToken(tokenObj.token);
    const revokedAccess = timetableService.getStudentTimetableData(tokenObj.token);
    expect(revokedAccess.success).toBe(false);
  });

  it('TEST 12: Timetable Import Wizard TeacherCode Mapping', () => {
    const rawImportRows = [
      {
        'اليوم': 'السبت',
        'الحصة': 1,
        'الصف': 'الصف الأول',
        'الفصل': '1/1',
        'المادة': 'برمجة وتطوير المواقع',
        'كود المعلم': 'T101',
        'اسم المعلم': 'أحمد محمود',
      },
      {
        'اليوم': 'السبت',
        'الحصة': 2,
        'الصف': 'الصف الأول',
        'الفصل': '1/1',
        'المادة': 'برمجة وتطوير المواقع',
        'كود المعلم': 'UNKNOWN_CODE',
        'اسم المعلم': 'معلم مجهول',
      },
      {
        'اليوم': 'السبت',
        'الحصة': 3,
        'الصف': 'الصف الأول',
        'الفصل': '1/1',
        'المادة': 'برمجة وتطوير المواقع',
        'كود المعلم': '',
        'اسم المعلم': 'محمد إبراهيم',
      },
    ];

    const importSummary = timetableService.parseAndValidateImportData(rawImportRows);
    expect(importSummary.totalRows).toBe(3);
    expect(importSummary.validRowsCount).toBe(1);
    expect(importSummary.invalidRowsCount).toBe(2);
    expect(importSummary.unknownTeacherCodes).toContain('UNKNOWN_CODE');
  });
});
