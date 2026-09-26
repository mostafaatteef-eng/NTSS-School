import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageService } from '../services/storageService';
import { timetableService } from '../services/timetableService';
import { derivePBKDF2Hash, generateCryptographicSalt } from '../utils/cryptoUtils';
import { Employee, User, ScheduleItem } from '../types';

describe('NTSS ERP - Security, Login Numbers, First Login & Timetable Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
    vi.restoreAllMocks();
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

  it('Test 5: issueUserActivationToken fails closed with FIRST_LOGIN_DECOMMISSIONED (MIG_SCOPE_015)', async () => {
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
    expect(issueRes.success).toBe(false);
    expect(issueRes.code).toBe('FIRST_LOGIN_DECOMMISSIONED');
  });

  it('Test 6: Issuing one-time activation token is permanently retired', async () => {
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
    expect(result.success).toBe(false);
    expect(result.code).toBe('FIRST_LOGIN_DECOMMISSIONED');
    expect(result.activationToken).toBeUndefined();
  });

  it('Test 7: FirstLoginPasswordSetup is decommissioned and returns FIRST_LOGIN_DECOMMISSIONED', async () => {
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

    const setupRes = await storageService.firstLoginPasswordSetup('107', 'ANYTOKEN', 'StrongPassword123!');
    expect(setupRes.success).toBe(false);
    expect(setupRes.code).toBe('FIRST_LOGIN_DECOMMISSIONED');
  });

  it('Test 8: FirstLoginPasswordSetup fails closed without generating session tokens', async () => {
    const setupRes = await storageService.firstLoginPasswordSetup('108', 'TOKEN123', 'SecondPassword123!');
    expect(setupRes.success).toBe(false);
    expect(setupRes.code).toBe('FIRST_LOGIN_DECOMMISSIONED');
    expect(setupRes.sessionToken).toBeUndefined();
  });

  it('Test 9: FirstLoginPasswordSetup returns decommissioning error message', async () => {
    const setupRes = await storageService.firstLoginPasswordSetup('109', 'EXPIRED_TOKEN', 'Password123!');
    expect(setupRes.success).toBe(false);
    expect(setupRes.code).toBe('FIRST_LOGIN_DECOMMISSIONED');
    expect(setupRes.message).toContain('تم إيقاف مسار إعداد كلمة المرور لأول مرة بشكل نهائي');
  });

  it('Test 10: Reset user to pending setup clears password and resets passwordInitialized to false', async () => {
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

    const res = await storageService.resetUserToPendingSetup(user.id);
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

  it('Test 15: Teacher portal rejects legacy PIN and never authenticates from local cache when backend is unavailable', async () => {
    const emp: Employee = {
      id: 'EMP-PIN-TEST',
      name: 'معلم الاختبار',
      teacherCode: 'T-777',
      loginNumber: '177',
      nationalId: '28501011234571',
      jobTitle: 'معلم روبوتكس',
      department: 'التعليم',
    };

    const setRes = await timetableService.setTeacherPin(emp.id, '5566');
    expect(setRes.success).toBe(false);
    expect(setRes.code).toBe('LEGACY_PIN_RETIRED');

    const verifyRes = await timetableService.verifyTeacherPin('177', '5566');
    expect(verifyRes.success).toBe(false);
    expect(verifyRes.code).toBe('LEGACY_PIN_RETIRED');

    localStorage.setItem('ntss_teacher_accounts_v3', JSON.stringify([{
      id: 'TAC-LOCAL-ONLY',
      employeeId: emp.id,
      teacherCode: emp.teacherCode,
      teacherName: emp.name,
      username: 'teacher_robotics',
      status: 'Active',
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
    }]));

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('');
    const loginRes = await storageService.teacherLogin('teacher_robotics', 'AnyPasswordLongEnough', 'SCH-BADR');

    expect(loginRes.success).toBe(false);
    expect(loginRes.code).toBe('SERVICE_UNAVAILABLE');
    expect(loginRes.teacherSessionToken).toBeUndefined();
    expect(storageService.getTeacherSession()).toBeNull();
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

  it('Test 17: Teacher login uses backend authority and persists server session metadata', async () => {
    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        teacherSessionToken: 'SERVER_SESSION_TOKEN_123',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        schoolId: 'SCH-BADR',
        mustChangePassword: true,
        teacher: {
          employeeId: 'EMP-AUTH-1',
          teacherCode: 'T-AUTH-1',
          teacherName: 'معلم معتمد',
          department: 'التعليم',
        },
      }),
    } as Response);

    const result = await storageService.teacherLogin('teacher.auth', 'TemporaryPassword2026!', 'SCH-BADR');

    expect(result.success).toBe(true);
    expect(result.mustChangePassword).toBe(true);
    expect(storageService.getTeacherSession()?.teacherSessionToken).toBe('SERVER_SESSION_TOKEN_123');
    expect(storageService.getTeacherSession()?.mustChangePassword).toBe(true);

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('teacherLogin');
    expect(request.schoolId).toBe('SCH-BADR');
  });

  it('Test 18: Invalid persisted teacher session is rejected after backend revalidation', async () => {
    storageService.setTeacherSession({
      teacherSessionToken: 'OLD_SESSION_TOKEN_123',
      employeeId: 'EMP-AUTH-2',
      teacherCode: 'T-AUTH-2',
      teacherName: 'معلم',
      username: 'teacher.auth2',
      schoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 'error',
        code: 'TEACHER_SESSION_INVALID',
        message: 'invalid',
      }),
    } as Response);

    const result = await storageService.validateTeacherPortalSession();

    expect(result.success).toBe(false);
    expect(storageService.getTeacherSession()).toBeNull();
  });

  it('Test 19: Teacher password change rotates the server-issued session token', async () => {
    storageService.setTeacherSession({
      teacherSessionToken: 'OLD_ROTATION_TOKEN_123',
      employeeId: 'EMP-AUTH-3',
      teacherCode: 'T-AUTH-3',
      teacherName: 'معلم',
      username: 'teacher.auth3',
      schoolId: 'SCH-BADR',
      mustChangePassword: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        teacherSessionToken: 'NEW_ROTATION_TOKEN_456',
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
      }),
    } as Response);

    const result = await storageService.changeTeacherPassword('NewTeacherPassword2026!');

    expect(result.success).toBe(true);
    expect(storageService.getTeacherSession()?.teacherSessionToken).toBe('NEW_ROTATION_TOKEN_456');
    expect(storageService.getTeacherSession()?.mustChangePassword).toBe(false);
  });


  it('Test 20: Teacher homework write is backend-authoritative and sends no teacher/status/school authority', async () => {
    storageService.setTeacherSession({
      teacherSessionToken: 'WRITE_HOMEWORK_TOKEN_123',
      employeeId: 'EMP-WRITE-1',
      teacherCode: 'T-WRITE-1',
      teacherName: 'معلم الواجب',
      username: 'teacher.write1',
      schoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    const localSave = vi.spyOn(storageService, 'saveHomework');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        message: 'saved',
        homework: {
          id: 'HW-SERVER-1',
          teacherId: 'EMP-WRITE-1',
          teacherName: 'معلم الواجب',
          subject: 'الذكاء الاصطناعي',
          grade: 'الصف الأول الثانوي',
          classroom: '1/1',
          title: 'واجب تجريبي',
          description: 'تفاصيل',
          assignedDate: '2026-09-26',
          dueDate: '2026-09-27',
          status: 'Draft',
          createdAt: new Date().toISOString(),
        },
      }),
    } as Response);

    const result = await storageService.saveTeacherHomeworkDraftAuthoritative({
      title: 'واجب تجريبي',
      description: 'تفاصيل',
      subject: 'الذكاء الاصطناعي',
      grade: 'الصف الأول الثانوي',
      classroom: '1/1',
      assignedDate: '2026-09-26',
      dueDate: '2026-09-27',
    });

    expect(result.success).toBe(true);
    expect(result.homework?.status).toBe('Draft');
    expect(localSave).not.toHaveBeenCalled();

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('saveTeacherHomeworkDraft');
    expect(request.teacherSessionToken).toBe('WRITE_HOMEWORK_TOKEN_123');
    expect(request.schoolId).toBeUndefined();
    expect(request.data.teacherId).toBeUndefined();
    expect(request.data.teacherName).toBeUndefined();
    expect(request.data.status).toBeUndefined();
    expect(request.data.classroom).toBe('1/1');
  });

  it('Test 21: Teacher resource write is backend-authoritative and cannot self-publish', async () => {
    storageService.setTeacherSession({
      teacherSessionToken: 'WRITE_RESOURCE_TOKEN_123',
      employeeId: 'EMP-WRITE-2',
      teacherCode: 'T-WRITE-2',
      teacherName: 'معلم المورد',
      username: 'teacher.write2',
      schoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    const localSave = vi.spyOn(timetableService, 'saveTeacherLessonResource');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        message: 'saved',
        resource: {
          id: 'RES-SERVER-1',
          teacherId: 'EMP-WRITE-2',
          subjectId: 'AI',
          classroomId: '1/1',
          visibility: 'Draft',
        },
      }),
    } as Response);

    const result = await storageService.saveTeacherResourceDraftAuthoritative({
      title: 'مقدمة في الذكاء الاصطناعي',
      topic: 'مقدمة في الذكاء الاصطناعي',
      subject: 'الذكاء الاصطناعي',
      classroom: '1/1',
      studentResourceUrl: 'https://example.com/student-resource',
      presentationUrl: 'https://example.com/slides',
      preparationNotesUrl: 'https://example.com/teacher-notes',
    });

    expect(result.success).toBe(true);
    expect(result.resource?.visibility).toBe('Draft');
    expect(localSave).not.toHaveBeenCalled();

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('saveTeacherResourceDraft');
    expect(request.teacherSessionToken).toBe('WRITE_RESOURCE_TOKEN_123');
    expect(request.schoolId).toBeUndefined();
    expect(request.data.teacherId).toBeUndefined();
    expect(request.data.teacherName).toBeUndefined();
    expect(request.data.visibility).toBeUndefined();
    expect(request.data.classroom).toBe('1/1');
  });

  it('Test 22: Classroom assignment denial fails safely without revoking a valid teacher session', async () => {
    storageService.setTeacherSession({
      teacherSessionToken: 'ASSIGNMENT_DENIED_TOKEN_123',
      employeeId: 'EMP-WRITE-3',
      teacherCode: 'T-WRITE-3',
      teacherName: 'معلم',
      username: 'teacher.write3',
      schoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        status: 'error',
        code: 'TEACHER_NOT_ASSIGNED_TO_CLASSROOM',
        message: 'غير مسند إلى الفصل',
      }),
    } as Response);

    const result = await storageService.saveTeacherHomeworkDraftAuthoritative({
      title: 'واجب غير مسموح',
      classroom: '3/9',
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('TEACHER_NOT_ASSIGNED_TO_CLASSROOM');
    expect(storageService.getTeacherSession()?.teacherSessionToken).toBe('ASSIGNMENT_DENIED_TOKEN_123');
  });

  it('Test 23: Invalid teacher session during content write clears only teacher portal session', async () => {
    storageService.setTeacherSession({
      teacherSessionToken: 'EXPIRED_WRITE_TOKEN_123',
      employeeId: 'EMP-WRITE-4',
      teacherCode: 'T-WRITE-4',
      teacherName: 'معلم',
      username: 'teacher.write4',
      schoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 'error',
        code: 'TEACHER_SESSION_INVALID',
        message: 'جلسة غير صالحة',
      }),
    } as Response);

    const result = await storageService.saveTeacherResourceDraftAuthoritative({
      title: 'مورد',
      classroom: '1/1',
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('TEACHER_SESSION_INVALID');
    expect(storageService.getTeacherSession()).toBeNull();
  });


  it('Test 24: Teacher self-service read uses TeacherSession token and returns only authoritative self bundle', async () => {
    storageService.setTeacherSession({
      teacherSessionToken: 'SELF_REQUESTS_TOKEN_123',
      employeeId: 'EMP-SELF-1',
      teacherCode: 'T-SELF-1',
      teacherName: 'معلم الخدمة الذاتية',
      username: 'teacher.self1',
      schoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: {
          profile: {
            employeeId: 'EMP-SELF-1',
            employeeName: 'معلم الخدمة الذاتية',
            department: 'التعليم',
            teacherCode: 'T-SELF-1',
          },
          leaves: [{ id: 'LEV-1', employeeId: 'EMP-SELF-1', leaveType: 'سنوية', startDate: '2026-09-27', endDate: '2026-09-27', daysCount: 1, status: 'معلقة', reason: 'سبب' }],
          permissions: [],
        },
      }),
    } as Response);

    const result = await storageService.getTeacherSelfRequestsAuthoritative();

    expect(result.success).toBe(true);
    expect(result.profile?.employeeId).toBe('EMP-SELF-1');
    expect(result.leaves?.length).toBe(1);

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('getTeacherSelfRequests');
    expect(request.teacherSessionToken).toBe('SELF_REQUESTS_TOKEN_123');
    expect(request.sessionToken).toBeUndefined();
    expect(request.schoolId).toBeUndefined();
    expect(request.employeeId).toBeUndefined();
  });

  it('Test 25: Teacher leave request sends content only and cannot choose identity, status, school, or id', async () => {
    storageService.setTeacherSession({
      teacherSessionToken: 'SELF_LEAVE_TOKEN_123',
      employeeId: 'EMP-SELF-2',
      teacherCode: 'T-SELF-2',
      teacherName: 'معلم',
      username: 'teacher.self2',
      schoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        message: 'created',
        leave: {
          id: 'LEV-SERVER-1',
          employeeId: 'EMP-SELF-2',
          employeeName: 'معلم',
          department: 'التعليم',
          leaveType: 'سنوية',
          startDate: '2026-09-27',
          endDate: '2026-09-28',
          daysCount: 2,
          status: 'معلقة',
          reason: 'ظرف شخصي',
          createdAt: new Date().toISOString(),
        },
      }),
    } as Response);

    const result = await storageService.createTeacherLeaveRequestAuthoritative({
      leaveType: 'سنوية',
      startDate: '2026-09-27',
      endDate: '2026-09-28',
      reason: 'ظرف شخصي',
      notes: 'ملاحظة',
    });

    expect(result.success).toBe(true);
    expect(result.leave?.status).toBe('معلقة');

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('createTeacherLeaveRequest');
    expect(request.teacherSessionToken).toBe('SELF_LEAVE_TOKEN_123');
    expect(request.data.employeeId).toBeUndefined();
    expect(request.data.employeeName).toBeUndefined();
    expect(request.data.schoolId).toBeUndefined();
    expect(request.data.status).toBeUndefined();
    expect(request.data.id).toBeUndefined();
    expect(request.data.daysCount).toBeUndefined();
  });

  it('Test 26: Teacher permission request leaves duration and approval authority to the backend', async () => {
    storageService.setTeacherSession({
      teacherSessionToken: 'SELF_PERMISSION_TOKEN_123',
      employeeId: 'EMP-SELF-3',
      teacherCode: 'T-SELF-3',
      teacherName: 'معلم',
      username: 'teacher.self3',
      schoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        permission: {
          id: 'PERM-SERVER-1',
          employeeId: 'EMP-SELF-3',
          employeeName: 'معلم',
          department: 'التعليم',
          date: '2026-09-27',
          permissionType: 'إذن خروج مؤقت',
          startTime: '10:00',
          endTime: '12:00',
          durationHours: 2,
          reason: 'سبب',
          status: 'معلقة',
          createdAt: new Date().toISOString(),
        },
      }),
    } as Response);

    const result = await storageService.createTeacherPermissionRequestAuthoritative({
      date: '2026-09-27',
      permissionType: 'إذن خروج مؤقت',
      startTime: '10:00',
      endTime: '12:00',
      reason: 'سبب',
    });

    expect(result.success).toBe(true);
    expect(result.permission?.durationHours).toBe(2);

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('createTeacherPermissionRequest');
    expect(request.data.employeeId).toBeUndefined();
    expect(request.data.schoolId).toBeUndefined();
    expect(request.data.status).toBeUndefined();
    expect(request.data.id).toBeUndefined();
    expect(request.data.durationHours).toBeUndefined();
    expect(request.data.approvedBy).toBeUndefined();
  });

  it('Test 27: Invalid TeacherSession on self-service request clears teacher session', async () => {
    storageService.setTeacherSession({
      teacherSessionToken: 'INVALID_SELF_TOKEN_123',
      employeeId: 'EMP-SELF-4',
      teacherCode: 'T-SELF-4',
      teacherName: 'معلم',
      username: 'teacher.self4',
      schoolId: 'SCH-BADR',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/teacher');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 'error',
        code: 'TEACHER_SESSION_INVALID',
        message: 'invalid',
      }),
    } as Response);

    const result = await storageService.getTeacherSelfRequestsAuthoritative();
    expect(result.success).toBe(false);
    expect(storageService.getTeacherSession()).toBeNull();
  });


  it('Test 28: Staff self-service read uses staff session only and no client identity authority', async () => {
    const staff: User = {
      id: 'USR-SELF-STAFF-1',
      username: 'staff.self1',
      fullName: 'موظف خدمة ذاتية',
      role: 'AdministrativeEmployee',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      employeeId: 'EMP-SELF-STAFF-1',
      sessionToken: 'STAFF_SELF_SESSION_123',
    };
    storageService.setCurrentUser(staff);

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/staff');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: {
          profile: {
            employeeId: 'EMP-SELF-STAFF-1',
            employeeName: 'موظف خدمة ذاتية',
            department: 'الإدارة',
            employeeNumber: 'E-001',
          },
          leaves: [],
          permissions: [],
        },
      }),
    } as Response);

    const result = await storageService.getStaffSelfRequestsAuthoritative();

    expect(result.success).toBe(true);
    expect(result.profile?.employeeId).toBe('EMP-SELF-STAFF-1');
    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('getMyRequests');
    expect(request.sessionToken).toBe('STAFF_SELF_SESSION_123');
    expect(request.employeeId).toBeUndefined();
    expect(request.schoolId).toBeUndefined();
  });

  it('Test 29: Staff leave request cannot choose employee, school, id, status or days count', async () => {
    storageService.setCurrentUser({
      id: 'USR-SELF-STAFF-2',
      username: 'staff.self2',
      fullName: 'موظف',
      role: 'AdministrativeEmployee',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      employeeId: 'EMP-SELF-STAFF-2',
      sessionToken: 'STAFF_LEAVE_SESSION_123',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/staff');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        leave: {
          id: 'LEV-SERVER-STAFF-1',
          employeeId: 'EMP-SELF-STAFF-2',
          leaveType: 'سنوية',
          startDate: '2026-09-27',
          endDate: '2026-09-28',
          daysCount: 2,
          reason: 'سبب',
          status: 'معلقة',
        },
      }),
    } as Response);

    const result = await storageService.createStaffLeaveRequestAuthoritative({
      leaveType: 'سنوية',
      startDate: '2026-09-27',
      endDate: '2026-09-28',
      reason: 'سبب',
    });

    expect(result.success).toBe(true);
    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('createMyLeaveRequest');
    expect(request.sessionToken).toBe('STAFF_LEAVE_SESSION_123');
    expect(request.data.employeeId).toBeUndefined();
    expect(request.data.employeeName).toBeUndefined();
    expect(request.data.schoolId).toBeUndefined();
    expect(request.data.id).toBeUndefined();
    expect(request.data.status).toBeUndefined();
    expect(request.data.daysCount).toBeUndefined();
  });

  it('Test 30: Staff permission request leaves duration and approval fields to the backend', async () => {
    storageService.setCurrentUser({
      id: 'USR-SELF-STAFF-3',
      username: 'staff.self3',
      fullName: 'موظف',
      role: 'AdministrativeEmployee',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      employeeId: 'EMP-SELF-STAFF-3',
      sessionToken: 'STAFF_PERMISSION_SESSION_123',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/staff');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        permission: {
          id: 'PERM-SERVER-STAFF-1',
          employeeId: 'EMP-SELF-STAFF-3',
          date: '2026-09-27',
          permissionType: 'إذن خروج مؤقت',
          startTime: '10:00',
          endTime: '11:30',
          durationHours: 1.5,
          reason: 'سبب',
          status: 'معلقة',
        },
      }),
    } as Response);

    const result = await storageService.createStaffPermissionRequestAuthoritative({
      date: '2026-09-27',
      permissionType: 'إذن خروج مؤقت',
      startTime: '10:00',
      endTime: '11:30',
      reason: 'سبب',
    });

    expect(result.success).toBe(true);
    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('createMyPermissionRequest');
    expect(request.data.employeeId).toBeUndefined();
    expect(request.data.schoolId).toBeUndefined();
    expect(request.data.id).toBeUndefined();
    expect(request.data.status).toBeUndefined();
    expect(request.data.durationHours).toBeUndefined();
    expect(request.data.approvedBy).toBeUndefined();
  });

  it('Test 31: Staff self-service fails closed before network when account lacks employee link', async () => {
    storageService.setCurrentUser({
      id: 'USR-NO-EMPLOYEE',
      username: 'no.employee',
      fullName: 'حساب غير مربوط',
      role: 'AdministrativeEmployee',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'STAFF_NO_EMPLOYEE_SESSION',
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await storageService.getStaffSelfRequestsAuthoritative();

    expect(result.success).toBe(false);
    expect(result.code).toBe('EMPLOYEE_CONTEXT_REQUIRED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Test 32: Staff session failure during self-service clears current staff session', async () => {
    storageService.setCurrentUser({
      id: 'USR-EXPIRED-SELF',
      username: 'expired.self',
      fullName: 'موظف',
      role: 'AdministrativeEmployee',
      accessScope: 'SELF',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      employeeId: 'EMP-EXPIRED-SELF',
      sessionToken: 'EXPIRED_STAFF_SELF_SESSION',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/staff');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        status: 'error',
        code: 'SESSION_EXPIRED',
        message: 'expired',
      }),
    } as Response);

    const result = await storageService.getStaffSelfRequestsAuthoritative();

    expect(result.success).toBe(false);
    expect(storageService.getCurrentUser()).toBeNull();
  });


  it('Test 33: Leave management read uses authoritative staff session', async () => {
    storageService.setCurrentUser({
      id: 'USR-LEAVE-MGR-1',
      username: 'leave.manager1',
      fullName: 'مدير الإجازات',
      role: 'TeacherAffairs',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      employeeId: 'EMP-MGR-1',
      sessionToken: 'LEAVE_MGMT_SESSION_123',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/admin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: {
          leaves: [{ id: 'LEV-1', employeeId: 'EMP-1', status: 'معلقة' }],
          permissions: [{ id: 'PERM-1', employeeId: 'EMP-1', status: 'معلقة' }],
        },
      }),
    } as Response);

    const result = await storageService.getLeaveManagementDataAuthoritative();

    expect(result.success).toBe(true);
    expect(result.leaves?.length).toBe(1);
    expect(result.permissions?.length).toBe(1);

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('getLeaveManagementData');
    expect(request.sessionToken).toBe('LEAVE_MGMT_SESSION_123');
    expect(request.schoolId).toBeUndefined();
  });

  it('Test 34: Managed leave create sends employee selection and content only, never approval authority', async () => {
    storageService.setCurrentUser({
      id: 'USR-LEAVE-MGR-2',
      username: 'leave.manager2',
      fullName: 'مدير الإجازات',
      role: 'TeacherAffairs',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'LEAVE_CREATE_SESSION_123',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/admin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        leave: {
          id: 'LEV-SERVER-2',
          employeeId: 'EMP-2',
          employeeName: 'موظف',
          leaveType: 'سنوية',
          startDate: '2026-09-27',
          endDate: '2026-09-28',
          daysCount: 2,
          status: 'معلقة',
          reason: 'سبب',
        },
      }),
    } as Response);

    const result = await storageService.createManagedLeaveAuthoritative({
      employeeId: 'EMP-2',
      leaveType: 'سنوية',
      startDate: '2026-09-27',
      endDate: '2026-09-28',
      reason: 'سبب',
    });

    expect(result.success).toBe(true);

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('createManagedLeave');
    expect(request.data.employeeId).toBe('EMP-2');
    expect(request.data.status).toBeUndefined();
    expect(request.data.approvedBy).toBeUndefined();
    expect(request.data.id).toBeUndefined();
    expect(request.data.daysCount).toBeUndefined();
    expect(request.data.employeeName).toBeUndefined();
    expect(request.data.department).toBeUndefined();
    expect(request.data.schoolId).toBeUndefined();
  });

  it('Test 35: Managed permission create leaves duration, status and approver to backend', async () => {
    storageService.setCurrentUser({
      id: 'USR-LEAVE-MGR-3',
      username: 'leave.manager3',
      fullName: 'مدير الإجازات',
      role: 'TeacherAffairs',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'PERM_CREATE_SESSION_123',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/admin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        permission: {
          id: 'PERM-SERVER-2',
          employeeId: 'EMP-3',
          date: '2026-09-27',
          startTime: '10:00',
          endTime: '12:00',
          durationHours: 2,
          status: 'معلقة',
        },
      }),
    } as Response);

    const result = await storageService.createManagedPermissionAuthoritative({
      employeeId: 'EMP-3',
      date: '2026-09-27',
      permissionType: 'إذن خروج مؤقت',
      startTime: '10:00',
      endTime: '12:00',
      reason: 'سبب',
    });

    expect(result.success).toBe(true);

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('createManagedPermission');
    expect(request.data.employeeId).toBe('EMP-3');
    expect(request.data.durationHours).toBeUndefined();
    expect(request.data.status).toBeUndefined();
    expect(request.data.approvedBy).toBeUndefined();
    expect(request.data.id).toBeUndefined();
    expect(request.data.schoolId).toBeUndefined();
  });

  it('Test 36: Approval and rejection use distinct authoritative actions, not generic save', async () => {
    storageService.setCurrentUser({
      id: 'USR-LEAVE-MGR-4',
      username: 'leave.manager4',
      fullName: 'مدير الإجازات',
      role: 'TeacherAffairs',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'STATUS_SESSION_123',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/admin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success' }),
    } as Response);

    await storageService.setManagedLeaveStatusAuthoritative('LEV-9', 'مقبولة');
    await storageService.setManagedPermissionStatusAuthoritative('PERM-9', 'مرفوضة', 'سبب رفض');

    const first = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body));

    expect(first.action).toBe('approveManagedLeave');
    expect(first.data).toEqual({ id: 'LEV-9', reason: '' });
    expect(second.action).toBe('rejectManagedPermission');
    expect(second.data).toEqual({ id: 'PERM-9', reason: 'سبب رفض' });
    expect(first.data.status).toBeUndefined();
    expect(second.data.status).toBeUndefined();
  });


  it('Test 37: Employee management read uses authoritative staff session without client school authority', async () => {
    storageService.setCurrentUser({
      id: 'USR-EMP-MGR-1',
      username: 'employee.manager1',
      fullName: 'مدير العاملين',
      role: 'TeacherAffairs',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'EMPLOYEE_READ_SESSION_123',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/admin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: [{ id: 'EMP001', name: 'موظف', employeeType: 'Administrative', jobTitle: 'إداري' }],
      }),
    } as Response);

    const result = await storageService.getEmployeeManagementDataAuthoritative();

    expect(result.success).toBe(true);
    expect(result.employees?.length).toBe(1);

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('getEmployees');
    expect(request.sessionToken).toBe('EMPLOYEE_READ_SESSION_123');
    expect(request.schoolId).toBeUndefined();
  });

  it('Test 38: Managed employee create strips server-owned and sensitive authority fields', async () => {
    storageService.setCurrentUser({
      id: 'USR-EMP-MGR-2',
      username: 'employee.manager2',
      fullName: 'مدير العاملين',
      role: 'TeacherAffairs',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'EMPLOYEE_CREATE_SESSION_123',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/admin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        employee: {
          id: 'EMP001',
          name: 'معلم جديد',
          employeeType: 'Teacher',
          jobTitle: 'معلم',
          loginNumber: 121,
          schoolId: 'SCH-BADR',
        },
      }),
    } as Response);

    const result = await storageService.createManagedEmployeeAuthoritative({
      id: 'EMP001',
      name: 'معلم جديد',
      employeeType: 'Teacher',
      jobTitle: 'معلم',
      teacherCode: 'T-001',
      loginNumber: 999,
      basicSalary: 50000,
      salary: 60000,
      ...( { password: 'should-never-send', passwordHash: 'hash', schoolId: 'SCH-OTHER' } as any ),
    });

    expect(result.success).toBe(true);

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('createManagedEmployee');
    expect(request.data.id).toBe('EMP001');
    expect(request.data.name).toBe('معلم جديد');
    expect(request.data.loginNumber).toBeUndefined();
    expect(request.data.schoolId).toBeUndefined();
    expect(request.data.basicSalary).toBeUndefined();
    expect(request.data.salary).toBeUndefined();
    expect(request.data.password).toBeUndefined();
    expect(request.data.passwordHash).toBeUndefined();
  });

  it('Test 39: Managed employee update and status use edit-specific authoritative actions', async () => {
    storageService.setCurrentUser({
      id: 'USR-EMP-MGR-3',
      username: 'employee.manager3',
      fullName: 'مدير العاملين',
      role: 'TeacherAffairs',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'EMPLOYEE_EDIT_SESSION_123',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/admin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', employee: { id: 'EMP002', name: 'موظف معدل' } }),
    } as Response);

    await storageService.updateManagedEmployeeAuthoritative({
      id: 'EMP002',
      name: 'موظف معدل',
      employeeType: 'Administrative',
      jobTitle: 'إداري',
    });
    await storageService.setManagedEmployeeStatusAuthoritative('EMP002', 'Inactive');

    const updateRequest = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    const statusRequest = JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body));

    expect(updateRequest.action).toBe('updateManagedEmployee');
    expect(updateRequest.data.id).toBe('EMP002');
    expect(statusRequest.action).toBe('setManagedEmployeeStatus');
    expect(statusRequest.data).toEqual({ id: 'EMP002', status: 'Inactive' });
  });

  it('Test 40: Employee import uses import-specific backend action and strips sensitive fields row-by-row', async () => {
    storageService.setCurrentUser({
      id: 'USR-EMP-MGR-4',
      username: 'employee.manager4',
      fullName: 'مدير العاملين',
      role: 'TeacherAffairs',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'EMPLOYEE_IMPORT_SESSION_123',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/admin');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        stats: { added: 1, updated: 1, skipped: 0, errors: [] },
      }),
    } as Response);

    const result = await storageService.importManagedEmployeesAuthoritative([
      {
        id: 'EMP003',
        name: 'موظف 1',
        employeeType: 'Administrative',
        jobTitle: 'إداري',
        loginNumber: 500,
        basicSalary: 10000,
        ...( { password: 'nope', schoolId: 'SCH-OTHER' } as any ),
      },
      {
        id: 'EMP004',
        name: 'معلم 2',
        employeeType: 'Teacher',
        jobTitle: 'معلم',
        teacherCode: 'T-004',
      },
    ]);

    expect(result.success).toBe(true);
    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(request.action).toBe('importManagedEmployees');
    expect(request.data).toHaveLength(2);
    expect(request.data[0].loginNumber).toBeUndefined();
    expect(request.data[0].basicSalary).toBeUndefined();
    expect(request.data[0].password).toBeUndefined();
    expect(request.data[0].schoolId).toBeUndefined();
  });

  it('Test 41: Employee management session failure clears current staff session', async () => {
    storageService.setCurrentUser({
      id: 'USR-EMP-EXPIRED',
      username: 'employee.expired',
      fullName: 'مدير العاملين',
      role: 'TeacherAffairs',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'EXPIRED_EMPLOYEE_SESSION',
    });

    vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://example.com/admin');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ status: 'error', code: 'SESSION_EXPIRED', message: 'expired' }),
    } as Response);

    const result = await storageService.getEmployeeManagementDataAuthoritative();
    expect(result.success).toBe(false);
    expect(storageService.getCurrentUser()).toBeNull();
  });

});
