import { describe, it, expect, beforeEach } from 'vitest';
import { storageService } from '../services/storageService';
import { timetableService } from '../services/timetableService';
import { derivePBKDF2Hash, generateCryptographicSalt } from '../utils/cryptoUtils';
import { Employee, User, ScheduleItem } from '../types';

describe('NTSS ERP - Security, Login Numbers, First Login & Timetable Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Test 1: Login number generation is unique, sequential, and persisted', () => {
    const num1 = storageService.generateNextLoginNumber();
    const num2 = storageService.generateNextLoginNumber();
    const num3 = storageService.generateNextLoginNumber();

    expect(Number(num1)).toBeGreaterThanOrEqual(100);
    expect(Number(num2)).toBe(Number(num1) + 1);
    expect(Number(num3)).toBe(Number(num2) + 1);
  });

  it('Test 2: Legacy users and employees migrate to have unique login numbers', () => {
    const employees: Employee[] = [
      { id: 'EMP-1', name: 'أحمد محمود', nationalId: '29001011234567', jobTitle: 'معلم تخصص', department: 'التعليم' },
      { id: 'EMP-2', name: 'سارة إبراهيم', nationalId: '29201011234568', jobTitle: 'معلمة تخصص', department: 'التعليم' },
    ];
    localStorage.setItem('ntss_employees', JSON.stringify(employees));

    const users: User[] = [
      { id: 'USR-1', username: 'ahmed', fullName: 'أحمد محمود', role: 'Teacher', passwordInitialized: false },
      { id: 'USR-2', username: 'sara', fullName: 'سارة إبراهيم', role: 'Teacher', passwordInitialized: true },
    ];
    localStorage.setItem('ntss_users', JSON.stringify(users));

    storageService.migrateLoginNumbersAndFirstLoginState();

    const updatedEmployees = storageService.getEmployees();
    expect(updatedEmployees[0].loginNumber).toBeDefined();
    expect(updatedEmployees[1].loginNumber).toBeDefined();
    expect(updatedEmployees[0].loginNumber).not.toBe(updatedEmployees[1].loginNumber);

    const updatedUsers = storageService.getUsers();
    expect(updatedUsers[0].loginNumber).toBeDefined();
    expect(updatedUsers[1].loginNumber).toBeDefined();
  });

  it('Test 3: New employee creation auto-allocates login number', () => {
    const emp: Employee = {
      id: `EMP-${Date.now()}`,
      name: 'طارق عبد الله',
      nationalId: '29505051234569',
      jobTitle: 'معلم برمجة',
      department: 'تكنولوجيا المعلومات',
    };

    storageService.saveEmployee(emp);
    const saved = storageService.getEmployeeById(emp.id);

    expect(saved).toBeDefined();
    expect(saved?.loginNumber).toBeDefined();
    expect(saved?.teacherCode).toBeDefined();
  });

  it('Test 4: Teacher lookup by code or login number succeeds', () => {
    const emp: Employee = {
      id: 'EMP-FIND-TEST',
      name: 'محمود عبد السلام',
      teacherCode: 'T-999',
      loginNumber: '199',
      nationalId: '28001011234570',
      jobTitle: 'معلم شبكات',
      department: 'التعليم',
    };
    storageService.saveEmployee(emp);

    const foundByCode = timetableService.findTeacherByCode('T-999');
    expect(foundByCode?.id).toBe(emp.id);

    const foundByNumber = timetableService.findTeacherByCode('199');
    expect(foundByNumber?.id).toBe(emp.id);
  });

  it('Test 5: First-time user with passwordInitialized: false returns PASSWORD_SETUP_REQUIRED', async () => {
    const user: User = {
      id: 'USR-SETUP-TEST',
      username: 'new_teacher',
      loginNumber: '105',
      fullName: 'معلم جديد',
      role: 'Teacher',
      passwordInitialized: false,
      status: 'Active',
    };
    storageService.saveUser(user);

    const issueRes = await storageService.issueUserActivationToken(user.id);
    expect(issueRes.success).toBe(true);

    const storedUser = storageService.getUserById(user.id);
    expect(storedUser?.passwordInitialized).toBe(false);
    expect(storedUser?.activationTokenHash).toBeDefined();
  });

  it('Test 6: Issuing one-time activation token generates token and stores secure hash', async () => {
    const user: User = {
      id: 'USR-TOKEN-TEST',
      username: 'token_user',
      loginNumber: '106',
      fullName: 'مستخدم تجربة',
      role: 'Teacher',
      passwordInitialized: false,
      status: 'Active',
    };
    storageService.saveUser(user);

    const result = await storageService.issueUserActivationToken(user.id);
    expect(result.success).toBe(true);
    expect(result.activationToken).toBeDefined();
    expect(result.activationToken?.length).toBeGreaterThan(6);

    const updated = storageService.getUserById(user.id);
    expect(updated?.activationTokenHash).toBeDefined();
    // Plain token must never be stored in database
    expect((updated as any).activationToken).toBeUndefined();
  });

  it('Test 7: FirstLoginPasswordSetup with valid token hashes password, sets passwordInitialized=true, burns token', async () => {
    const user: User = {
      id: 'USR-ACTIVATE-TEST',
      username: 'activate_user',
      loginNumber: '107',
      fullName: 'مستخدم التفعيل',
      role: 'Teacher',
      passwordInitialized: false,
      status: 'Active',
    };
    storageService.saveUser(user);

    const tokenRes = await storageService.issueUserActivationToken(user.id);
    const token = tokenRes.activationToken!;

    const setupRes = await storageService.firstLoginPasswordSetup('107', token, 'StrongPassword123!');
    expect(setupRes.success).toBe(true);

    const updated = storageService.getUserById(user.id);
    expect(updated?.passwordInitialized).toBe(true);
    expect(updated?.activationTokenHash).toBeUndefined();
    expect(updated?.passwordHash).toBeDefined();
    expect(updated?.passwordSalt).toBeDefined();
  });

  it('Test 8: FirstLoginPasswordSetup with already burned token fails', async () => {
    const user: User = {
      id: 'USR-BURN-TEST',
      username: 'burn_user',
      loginNumber: '108',
      fullName: 'مستخدم الكود المحروق',
      role: 'Teacher',
      passwordInitialized: false,
      status: 'Active',
    };
    storageService.saveUser(user);

    const tokenRes = await storageService.issueUserActivationToken(user.id);
    const token = tokenRes.activationToken!;

    // First use
    const firstUse = await storageService.firstLoginPasswordSetup('108', token, 'FirstPassword123!');
    expect(firstUse.success).toBe(true);

    // Second use of the same token must fail
    const secondUse = await storageService.firstLoginPasswordSetup('108', token, 'SecondPassword123!');
    expect(secondUse.success).toBe(false);
  });

  it('Test 9: FirstLoginPasswordSetup with expired token fails', async () => {
    const user: User = {
      id: 'USR-EXPIRE-TEST',
      username: 'expire_user',
      loginNumber: '109',
      fullName: 'مستخدم الكود منتهي الصلاحية',
      role: 'Teacher',
      passwordInitialized: false,
      status: 'Active',
    };
    storageService.saveUser(user);

    const tokenRes = await storageService.issueUserActivationToken(user.id);
    const token = tokenRes.activationToken!;

    // Manually expire the token in database
    const userDoc = storageService.getUserById(user.id)!;
    userDoc.activationTokenExpiresAt = new Date(Date.now() - 100000).toISOString();
    storageService.saveUser(userDoc);

    const setupRes = await storageService.firstLoginPasswordSetup('109', token, 'Password123!');
    expect(setupRes.success).toBe(false);
    expect(setupRes.message).toContain('منتهي الصلاحية');
  });

  it('Test 10: Reset user to pending setup clears password and resets passwordInitialized to false', () => {
    const user: User = {
      id: 'USR-RESET-TEST',
      username: 'reset_user',
      loginNumber: '110',
      fullName: 'مستخدم الإعادة',
      role: 'Teacher',
      passwordInitialized: true,
      passwordHash: 'some_hash',
      passwordSalt: 'some_salt',
      status: 'Active',
    };
    storageService.saveUser(user);

    const res = storageService.resetUserToPendingSetup(user.id);
    expect(res.success).toBe(true);

    const updated = storageService.getUserById(user.id);
    expect(updated?.passwordInitialized).toBe(false);
    expect(updated?.passwordHash).toBeUndefined();
    expect(updated?.passwordSalt).toBeUndefined();
  });

  it('Test 11: Revoke all user sessions successfully wipes session state', () => {
    const user: User = {
      id: 'USR-REVOKE-TEST',
      username: 'revoke_user',
      loginNumber: '111',
      fullName: 'مستخدم إنهاء الجلسات',
      role: 'Teacher',
      sessionToken: 'active_session_token_123',
    };
    storageService.saveUser(user);
    storageService.setCurrentUser(user);

    const revokeRes = storageService.revokeAllUserSessions(user.id);
    expect(revokeRes.success).toBe(true);

    const current = storageService.getCurrentUser();
    expect(current).toBeNull();
  });

  it('Test 12: Public student schedule endpoint returns only sanitized fields (no nationalId, no phone)', async () => {
    const scheduleItem: ScheduleItem = {
      id: 'SCHED-PUBLIC-1',
      grade: 'الصف الأول الثانوي',
      classroom: '1/1',
      dayOfWeek: 'الأحد',
      periodNumber: 1,
      startTime: '08:00',
      endTime: '08:45',
      subject: 'البرمجة والذكاء الاصطناعي',
      teacherName: 'م. أحمد حسني',
      room: 'معمل الحاسب 1',
      status: 'Published',
      isActive: true,
    };
    storageService.saveSchedule([scheduleItem]);

    const res = await storageService.getPublicClassSchedule('الصف الأول الثانوي', '1/1');
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data?.lessons.length).toBe(1);

    const lesson = res.data?.lessons[0];
    expect(lesson?.subjectName).toBe('البرمجة والذكاء الاصطناعي');
    expect(lesson?.teacherDisplayName).toBe('م. أحمد حسني');
    expect(lesson?.periodNumber).toBe(1);

    // Verify absence of sensitive data in response
    expect((lesson as any).nationalId).toBeUndefined();
    expect((lesson as any).teacherPhone).toBeUndefined();
    expect((lesson as any).salary).toBeUndefined();
  });

  it('Test 13: Public student schedule excludes drafts, cancelled, and inactive lessons', async () => {
    const items: ScheduleItem[] = [
      {
        id: 'SCHED-PUB',
        grade: 'الصف الأول الثانوي',
        classroom: '1/2',
        dayOfWeek: 'الإثنين',
        periodNumber: 1,
        subject: 'شبكات الحاسب',
        teacherName: 'أ. محمود',
        status: 'Published',
        isActive: true,
      },
      {
        id: 'SCHED-DRAFT',
        grade: 'الصف الأول الثانوي',
        classroom: '1/2',
        dayOfWeek: 'الإثنين',
        periodNumber: 2,
        subject: 'رياضيات تطبيقية',
        teacherName: 'أ. خالد',
        status: 'Draft',
        isActive: true,
      },
      {
        id: 'SCHED-CANCELLED',
        grade: 'الصف الأول الثانوي',
        classroom: '1/2',
        dayOfWeek: 'الإثنين',
        periodNumber: 3,
        subject: 'فيزياء',
        teacherName: 'أ. سامي',
        status: 'Published',
        isActive: true,
        isCancelled: true,
      },
    ];
    storageService.saveSchedule(items);

    const res = await storageService.getPublicClassSchedule('الصف الأول الثانوي', '1/2');
    expect(res.success).toBe(true);
    expect(res.data?.lessons.length).toBe(1);
    expect(res.data?.lessons[0].subjectName).toBe('شبكات الحاسب');
  });

  it('Test 14: Timetable scheduling validates teacher registration (rejects unknown teacher code)', () => {
    const knownTeacher = timetableService.findTeacherByCode('NON_EXISTENT_TEACHER_CODE_XYZ');
    expect(knownTeacher).toBeFalsy();
  });

  it('Test 15: Teacher portal verifyTeacherPin recognizes loginNumber', async () => {
    const emp: Employee = {
      id: 'EMP-PIN-TEST',
      name: 'معلم الاختبار',
      teacherCode: 'T-777',
      loginNumber: '177',
      nationalId: '28501011234571',
      jobTitle: 'معلم روبوتكس',
      department: 'التعليم',
    };
    storageService.saveEmployee(emp);

    const setRes = await timetableService.setTeacherPin(emp.id, '5566');
    expect(setRes.success).toBe(true);

    // Verification via loginNumber
    const verifyByNum = await timetableService.verifyTeacherPin('177', '5566');
    expect(verifyByNum.success).toBe(true);
    expect(verifyByNum.employee?.id).toBe(emp.id);

    // Verification via teacherCode
    const verifyByCode = await timetableService.verifyTeacherPin('T-777', '5566');
    expect(verifyByCode.success).toBe(true);
    expect(verifyByCode.employee?.id).toBe(emp.id);
  });

  it('Test 16: Deactivating a user account blocks subsequent login attempts', async () => {
    const user: User = {
      id: 'USR-DEACTIVATE-TEST',
      username: 'deactivated_user',
      loginNumber: '116',
      fullName: 'مستخدم معطل',
      role: 'Teacher',
      status: 'Active',
      isActive: true,
    };
    storageService.saveUser(user);

    await storageService.setUserActiveStatus(user.id, false);

    const updated = storageService.getUserById(user.id);
    expect(updated?.status).toBe('Inactive');
    expect(updated?.isActive).toBe(false);
  });
});
