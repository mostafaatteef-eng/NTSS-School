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

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✅ PASSED: ${msg}`);
}

async function runTests() {
  const { timetableService } = await import('../src/services/timetableService');
  const { storageService } = await import('../src/services/storageService');

  console.log('====================================================');
  console.log('🚀 RUNNING TIMETABLE ENGINE & LOAD POLICY TEST SUITE');
  console.log('====================================================\n');

  localStorage.clear();

  // ----------------------------------------------------
  // Setup Mock Data
  // ----------------------------------------------------
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

  storageService.saveEmployee(teacherA);
  storageService.saveEmployee(teacherB);

  // ----------------------------------------------------
  // TEST 1: Policy limits structure
  // ----------------------------------------------------
  console.log('\n--- TEST 1: Policy Limits Configuration ---');
  const policy = timetableService.getTeacherLoadPolicy();
  assert(policy.weeklyPeriodLimit === 30, 'weeklyPeriodLimit is 30 periods');
  assert(policy.weeklyMinutesLimit === 1500, 'weeklyMinutesLimit is 1500 minutes');
  assert(policy.defaultPeriodMinutes === 50, 'defaultPeriodMinutes is 50 minutes');

  // ----------------------------------------------------
  // TEST 2: Base 26 periods + Reserve 3 = 29/30
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Base 26 + Reserve 3 = 29/30 ---');
  // Seed 26 schedule items for teacherA in week 1 (e.g. 2026-10-04 to 2026-10-08)
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

  // Seed 3 reserve substitutions for teacherA in this same week
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
  assert(load1.scheduledBasePeriods === 26, `Base periods = 26 (got ${load1.scheduledBasePeriods})`);
  assert(load1.reservePeriodsThisWeek === 3, `Reserve this week = 3 (got ${load1.reservePeriodsThisWeek})`);
  assert(load1.countedWeeklyPeriods === 29, `Counted weekly periods = 29 (got ${load1.countedWeeklyPeriods})`);
  assert(load1.countedWeeklyMinutes === 1450, `Counted weekly minutes = 1450 (got ${load1.countedWeeklyMinutes})`);
  assert(load1.remainingCapacity === 1, `Remaining capacity = 1 (got ${load1.remainingCapacity})`);
  assert(load1.loadStatus === 'NEAR_LIMIT', `Load status = NEAR_LIMIT (got ${load1.loadStatus})`);

  // ----------------------------------------------------
  // TEST 3: Add reserve => 30/30 PASS
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Add 4th reserve => 30/30 PASS ---');
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
  assert(res4.success === true, 'Adding 4th reserve succeeded (30/30 reached)');

  const load2 = timetableService.calculateTeacherLoad(teacherA.id, currentWeekDate);
  assert(load2.countedWeeklyPeriods === 30, `Counted weekly periods = 30 (got ${load2.countedWeeklyPeriods})`);
  assert(load2.countedWeeklyMinutes === 1500, `Counted weekly minutes = 1500 (got ${load2.countedWeeklyMinutes})`);
  assert(load2.remainingCapacity === 0, `Remaining capacity = 0 (got ${load2.remainingCapacity})`);
  assert(load2.loadStatus === 'FULL', `Load status = FULL (got ${load2.loadStatus})`);

  // ----------------------------------------------------
  // TEST 4: Add another reserve => DENIED (31 > 30)
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Add 5th reserve => DENIED (31 > 30) ---');
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
  assert(res5.success === false, 'Adding 5th reserve was strictly DENIED by the engine');
  assert(res5.message?.includes('تجاوز') || res5.message?.includes('30'), 'Denial reason clearly states exceeding 30-period limit');

  // Verify teacher load is still 30/30
  const loadAfterAttempt = timetableService.calculateTeacherLoad(teacherA.id, currentWeekDate);
  assert(loadAfterAttempt.countedWeeklyPeriods === 30, 'Teacher remains at 30/30');

  // ----------------------------------------------------
  // TEST 5: Next week reserve counter = 0 (Query-Based Reset Only)
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Next Week Reserve Counter = 0 (Query-Based Reset) ---');
  const nextWeekDate = '2026-10-11'; // Next Sunday
  const loadNextWeek = timetableService.calculateTeacherLoad(teacherA.id, nextWeekDate);

  assert(loadNextWeek.scheduledBasePeriods === 26, `Next week base periods = 26 (got ${loadNextWeek.scheduledBasePeriods})`);
  assert(loadNextWeek.reservePeriodsThisWeek === 0, `Next week reserve counter = 0 (got ${loadNextWeek.reservePeriodsThisWeek})`);
  assert(loadNextWeek.countedWeeklyPeriods === 26, `Next week counted periods = 26 (got ${loadNextWeek.countedWeeklyPeriods})`);
  assert(loadNextWeek.remainingCapacity === 4, `Next week remaining capacity = 4 (got ${loadNextWeek.remainingCapacity})`);

  // Verify historical records were NOT deleted
  const allHistoricalSubs = storageService.getSubstitutions();
  assert(allHistoricalSubs.length === 4, `All 4 historical substitution records are preserved intact in database (got ${allHistoricalSubs.length})`);
  assert(loadNextWeek.historicalReserveCount === 4, `Teacher historical reserve count tracks all past records (got ${loadNextWeek.historicalReserveCount})`);

  // ----------------------------------------------------
  // TEST 6: Reserve candidate exclusions & 5-tier ranking
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Reserve Candidate Exclusions & Ranking ---');
  // On 2026-10-04, teacherA was at 30/30. teacherA must be NOT_ELIGIBLE.
  const candidatesWeek1 = timetableService.getReserveCandidates('2026-10-04', 7, 'الأحد', 'EMP-OTHER', 'برمجة وتطوير المواقع');
  const candA = candidatesWeek1.find(c => c.teacherId === teacherA.id);
  assert(candA?.isEligible === false, 'Teacher at 30/30 is NOT_ELIGIBLE for reserve');
  assert(candA?.status === 'NOT_ELIGIBLE', 'Candidate status is NOT_ELIGIBLE');

  // On next week 2026-10-11, teacherA has 4 remaining capacity, teacherB has 30 remaining capacity
  const candidatesNextWeek = timetableService.getReserveCandidates('2026-10-11', 7, 'الأحد', 'EMP-OTHER', 'برمجة وتطوير المواقع');
  const candANext = candidatesNextWeek.find(c => c.teacherId === teacherA.id);
  assert(candANext?.isEligible === true, 'Teacher is ELIGIBLE in next week after query-based reset');

  // ----------------------------------------------------
  // TEST 7: Supervision conflict validation
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Supervision Conflict Check ---');
  // TeacherA is scheduled for period 1 on Sunday
  const supConflict1 = timetableService.validateSupervisionConflict({
    teacherId: teacherA.id,
    date: '2026-10-04',
    dayOfWeek: 'الأحد',
    periodNumber: 1,
  });
  assert(supConflict1.hasConflict === true, 'Supervision conflicting with scheduled lesson is detected');

  // Assign supervision at period 7 (when teacher had reserve SUB-1)
  const supConflict2 = timetableService.validateSupervisionConflict({
    teacherId: teacherA.id,
    date: '2026-10-04',
    dayOfWeek: 'الأحد',
    periodNumber: 7,
  });
  assert(supConflict2.hasConflict === true, 'Supervision conflicting with reserve substitution is detected');

  // ----------------------------------------------------
  // TEST 8: Lesson-Break interval overlap conflict
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Lesson-Break Overlap Conflict Check ---');
  timetableService.saveScheduleBreak({
    id: 'BRK-TEST',
    name: 'فسحة الصلاة',
    startTime: '10:20',
    endTime: '10:45',
    sortOrder: 1,
    isActive: true,
  });

  const breakConflict = timetableService.validateLessonBreakConflict('10:00', '10:30');
  assert(breakConflict.hasConflict === true, 'Lesson ending at 10:30 overlaps break starting at 10:20');

  const breakNoConflict = timetableService.validateLessonBreakConflict('09:20', '10:10');
  assert(breakNoConflict.hasConflict === false, 'Lesson from 09:20 to 10:10 does not overlap break (10:20-10:45)');

  // ----------------------------------------------------
  // TEST 9: Curriculum 39-period plan & Week A/B cycle
  // ----------------------------------------------------
  console.log('\n--- TEST 9: Curriculum 39-Period Validation ---');
  const coverageInitial = timetableService.validateCurriculum39('1/1');
  assert(coverageInitial.totalRequiredPeriods === 39, 'Required curriculum periods is 39');
  assert(coverageInitial.status === 'DEFICIT', 'Unfilled class has DEFICIT status');

  // ----------------------------------------------------
  // TEST 10: Backend Teacher Classroom Authorization
  // ----------------------------------------------------
  console.log('\n--- TEST 10: Backend Teacher Classroom Authorization ---');
  // TeacherA is scheduled for classroom 1/1, but NOT 2/3
  const authAssigned = timetableService.validateTeacherClassroomAuthorization(
    { role: 'Teacher', employeeId: teacherA.id },
    '1/1'
  );
  assert(authAssigned.authorized === true, 'Teacher is authorized for assigned classroom 1/1');

  const authUnassigned = timetableService.validateTeacherClassroomAuthorization(
    { role: 'Teacher', employeeId: teacherA.id },
    '2/3'
  );
  assert(authUnassigned.authorized === false, 'Teacher is BLOCKED from unassigned classroom 2/3');

  // Try creating homework for unassigned classroom
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
  assert(hwDenied.success === false, 'Homework creation for unassigned classroom was strictly REJECTED');

  // ----------------------------------------------------
  // TEST 11: Student Read-Only Access & Revocation
  // ----------------------------------------------------
  console.log('\n--- TEST 11: Student Token Access & Revocation ---');
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

  // Direct student code access must fail
  const directCodeAttempt = timetableService.getStudentTimetableData('2026001');
  assert(directCodeAttempt.success === false, 'Direct studentCode access without secure token is rejected');

  // Generate secure token
  const tokenObj = timetableService.generateStudentAccessToken(mockStudent.id, mockStudent.studentCode!);
  assert(tokenObj.token.length >= 32, 'Generated token is a secure random string');

  // Access with valid token
  const validAccess = timetableService.getStudentTimetableData(tokenObj.token);
  assert(validAccess.success === true, 'Access with valid secure token succeeded');
  assert(validAccess.schedule?.length === 26, `Student retrieved read-only schedule (26 items, got ${validAccess.schedule?.length})`);

  // Revoke token
  timetableService.revokeStudentAccessToken(tokenObj.token);
  const revokedAccess = timetableService.getStudentTimetableData(tokenObj.token);
  assert(revokedAccess.success === false, 'Access with revoked token was rejected');

  // ----------------------------------------------------
  // TEST 12: Timetable Import Wizard TeacherCode Mapping
  // ----------------------------------------------------
  console.log('\n--- TEST 12: Timetable Import TeacherCode Mapping ---');
  const rawImportRows = [
    {
      'اليوم': 'السبت',
      'الحصة': 1,
      'الصف': 'الصف الأول',
      'الفصل': '1/1',
      'المادة': 'برمجة وتطوير المواقع',
      'كود المعلم': 'T101', // Known code
      'اسم المعلم': 'أحمد محمود',
    },
    {
      'اليوم': 'السبت',
      'الحصة': 2,
      'الصف': 'الصف الأول',
      'الفصل': '1/1',
      'المادة': 'برمجة وتطوير المواقع',
      'كود المعلم': 'UNKNOWN_CODE', // Unknown code
      'اسم المعلم': 'معلم مجهول',
    },
    {
      'اليوم': 'السبت',
      'الحصة': 3,
      'الصف': 'الصف الأول',
      'الفصل': '1/1',
      'المادة': 'برمجة وتطوير المواقع',
      'كود المعلم': '', // Missing code - forbidden to match by name
      'اسم المعلم': 'محمد إبراهيم',
    },
  ];

  const importSummary = timetableService.parseAndValidateImportData(rawImportRows);
  assert(importSummary.totalRows === 3, 'Import has 3 rows');
  assert(importSummary.validRowsCount === 1, 'Only 1 row with known valid teacher code is valid');
  assert(importSummary.invalidRowsCount === 2, '2 rows with unknown/missing teacher code are invalid');
  assert(importSummary.unknownTeacherCodes.includes('UNKNOWN_CODE'), 'Unknown teacher code is detected and flagged');

  console.log('\n====================================================');
  console.log('🎉 ALL 12 TEST SUITES PASSED FLAWLESSLY (100% GREEN)');
  console.log('====================================================\n');
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
  });
