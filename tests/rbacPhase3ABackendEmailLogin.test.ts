import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

// Setup sandboxed GAS environment evaluating google-apps-script/Code.gs directly
function createGasSandbox(initialData?: {
  masterUsers?: any[];
  masterSchools?: any[];
  sessions?: any[];
  auditLogs?: any[];
}) {
  const codeGsPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');
  const codeContent = fs.readFileSync(codeGsPath, 'utf8');

  const sheetsData: Record<string, any[]> = {
    Users: initialData?.masterUsers ? [...initialData.masterUsers] : [],
    Master_Schools: initialData?.masterSchools ? [...initialData.masterSchools] : [
      { schoolId: 'SCH-BADR', schoolCode: 'BADR', schoolName: 'مدرسة بدر', spreadsheetId: 'ss-badr', status: 'Active' },
      { schoolId: 'SCH-ALNOOR', schoolCode: 'ALNOOR', schoolName: 'مدرسة النور', spreadsheetId: 'ss-noor', status: 'Active' },
      { schoolId: 'SCH-NEW', schoolCode: 'NEW', schoolName: 'مدرسة جديدة', spreadsheetId: 'ss-new', status: 'Active' },
    ],
    Sessions: initialData?.sessions ? [...initialData.sessions] : [],
    Audit_Logs: initialData?.auditLogs ? [...initialData.auditLogs] : [],
    Employees: [
      { id: 'EMP-T101', teacherCode: 'TC-101', name: 'أحمد محمود', department: 'التعليم' },
    ],
    Teacher_Credentials: [],
    Teacher_Sessions: [],
  };

  const createMockSheet = (name: string) => {
    return {
      getName: () => name,
      getLastColumn: () => 15,
      getLastRow: () => (sheetsData[name] || []).length + 1,
      getDataRange: () => ({
        getValues: () => {
          const rows = sheetsData[name] || [];
          if (rows.length === 0) {
            return [['id', 'email', 'schoolId', 'status']];
          }
          const headers = Object.keys(rows[0]);
          const dataRows = rows.map(r => headers.map(h => (r[h] !== undefined ? r[h] : '')));
          return [headers, ...dataRows];
        },
      }),
      getRange: (r: number, c: number, numRows?: number, numCols?: number) => ({
        getValues: () => {
          if (r === 1) {
            if (name === 'Users') {
              return [['id', 'username', 'passwordHash', 'passwordSalt', 'passwordAlgorithm', 'passwordIterations', 'fullName', 'role', 'status', 'department', 'email', 'schoolId', 'allowedSchoolIds', 'employeeId', 'lastLogin']];
            }
            if (name === 'Master_Schools') {
              return [['schoolId', 'schoolCode', 'schoolName', 'spreadsheetId', 'status', 'createdAt', 'updatedAt']];
            }
            if (name === 'Sessions') {
              return [['sessionId', 'tokenHash', 'userId', 'username', 'fullName', 'role', 'schoolId', 'createdAt', 'expiresAt', 'status']];
            }
            return [['col1', 'col2', 'col3']];
          }
          const rowIdx = r - 2;
          const rowData = sheetsData[name]?.[rowIdx];
          return [[rowData ? Object.values(rowData)[0] : '']];
        },
        setValue: (val: any) => {},
      }),
      appendRow: (rowArr: any[]) => {
        if (!sheetsData[name]) sheetsData[name] = [];
        sheetsData[name].push(rowArr);
      },
    };
  };

  const mockSpreadsheet = {
    getId: () => 'master-ss-id',
    getName: () => 'Master Spreadsheet',
    getSheetByName: (name: string) => createMockSheet(name),
  };

  const sandbox: any = {
    console,
    Math,
    Date,
    parseInt,
    parseFloat,
    String,
    Array,
    Object,
    JSON,
    RegExp,
    sheetsData,
    SpreadsheetApp: {
      openById: (id: string) => mockSpreadsheet,
      getActiveSpreadsheet: () => mockSpreadsheet,
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeDigest: (algo: any, str: string) => {
        const hash = crypto.createHash('sha256').update(str, 'utf8').digest();
        return Array.from(new Int8Array(hash.buffer));
      },
      computeHmacSha256Signature: (val: any, key: any) => {
        const v = typeof val === 'string' ? Buffer.from(val, 'utf8') : Buffer.from(new Uint8Array(val));
        const k = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(new Uint8Array(key));
        return Array.from(new Int8Array(crypto.createHmac('sha256', k).update(v).digest().buffer));
      },
      formatDate: (d: Date) => d.toISOString(),
      DigestAlgorithm: {
        SHA_256: 'SHA_256',
      },
      Charset: {
        UTF_8: 'UTF_8',
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (jsonStr: string) => ({
        setMimeType: () => ({
          getContent: () => jsonStr,
        }),
        getContent: () => jsonStr,
      }),
    },
    Logger: {
      log: () => {},
    },
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(codeContent, context);

  // Bind sheetsData
  context.getSheetData = (ss: any, sheetName: string) => {
    return sheetsData[sheetName] || [];
  };
  context.getSchoolSpreadsheet = () => mockSpreadsheet;
  context.recordAuthoritativeAudit = (ss: any, reqId: string, user: string, role: string, action: string, entity: string, targetId: string, details: string) => {
    if (!sheetsData.Audit_Logs) sheetsData.Audit_Logs = [];
    sheetsData.Audit_Logs.push({
      requestId: reqId,
      user,
      role,
      action,
      entity,
      targetId,
      details,
      timestamp: new Date().toISOString(),
    });
  };

  // Populate valid teacher credentials if needed
  const teacherSalt = 'testsalt123';
  const teacherHash = context.computeSaltedHash('TeacherPass123', teacherSalt, 10000);
  sheetsData.Teacher_Credentials = [
    {
      employeeId: 'EMP-T101',
      teacherCode: 'TC-101',
      username: 'teacher1',
      status: 'Active',
      passwordHash: teacherHash,
      passwordSalt: teacherSalt,
      passwordIterations: 10000,
      failedLoginAttempts: 0,
    },
  ];

  return { context, sheetsData, mockSpreadsheet };
}

describe('PHASE 3A — BACKEND EMAIL LOGIN + SERVER-DERIVED SCHOOL CONTEXT', () => {
  it('1. Email normalized trim + lowercase', () => {
    const { context } = createGasSandbox();
    expect(context.normalizeEmail('   Admin@School.EDU.EG   ')).toBe('admin@school.edu.eg');
    expect(context.normalizeEmail('USER.NAME+TEST@Domain.COM  ')).toBe('user.name+test@domain.com');
    expect(context.normalizeEmail('')).toBe('');
    expect(context.normalizeEmail(null)).toBe('');

    expect(context.isValidEmailFormat('admin@school.edu.eg')).toBe(true);
    expect(context.isValidEmailFormat('invalid-email')).toBe(false);
    expect(context.isValidEmailFormat('')).toBe(false);
  });

  it('2. Valid email/password login succeeds', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-001',
        email: 'schooladmin@badr.edu.eg',
        username: 'admin_badr',
        fullName: 'أحمد محمود',
        role: 'SchoolAdmin',
        schoolId: 'SCH-BADR',
        passwordHash: hash,
        passwordSalt: salt,
        passwordIterations: 10000,
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const postEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'login',
          email: '  SchoolAdmin@Badr.EDU.EG  ',
          password: 'Password123!',
        }),
      },
    };

    const resRaw = testCtx.doPost(postEvent).getContent();
    const res = JSON.parse(resRaw);

    expect(res.status).toBe('success');
    expect(res.sessionToken).toBeDefined();
    expect(res.sessionToken.length).toBeGreaterThanOrEqual(32);
    expect(res.user.email).toBe('schooladmin@badr.edu.eg');
    expect(res.user.role).toBe('SchoolAdmin');
    expect(res.user.schoolId).toBe('SCH-BADR');
    expect(res.user.accessScope).toBe('SCHOOL');
  });

  it('3. Client schoolId cannot override account school', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-001',
        email: 'director@badr.edu.eg',
        username: 'dir_badr',
        fullName: 'ناظر المدرسة',
        role: 'SchoolDirector',
        schoolId: 'SCH-BADR', // Account is strictly bound to SCH-BADR
        passwordHash: hash,
        passwordSalt: salt,
        passwordIterations: 10000,
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const postEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'login',
          email: 'director@badr.edu.eg',
          password: 'Password123!',
          schoolId: 'SCH-ALNOOR', // Malicious or wrong client schoolId
        }),
      },
    };

    const res = JSON.parse(testCtx.doPost(postEvent).getContent());
    expect(res.status).toBe('success');
    // Must strictly come from account: SCH-BADR, NOT SCH-ALNOOR
    expect(res.user.schoolId).toBe('SCH-BADR');
    expect(res.user.activeSchoolId).toBe('SCH-BADR');
  });

  it('4. SchoolAdmin schoolId comes from account', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-SA-1',
        email: 'sa_noor@school.eg',
        fullName: 'مدير النور',
        role: 'SchoolAdmin',
        schoolId: 'SCH-ALNOOR',
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const res = testCtx.handleStaffLogin(testCtx.SpreadsheetApp.getActiveSpreadsheet(), 'sa_noor@school.eg', 'Password123!', 'REQ_1');
    expect(res.success).toBe(true);
    expect(res.user.role).toBe('SchoolAdmin');
    expect(res.user.accessScope).toBe('SCHOOL');
    expect(res.user.schoolId).toBe('SCH-ALNOOR');
    expect(res.user.activeSchoolId).toBe('SCH-ALNOOR');
  });

  it('5. SystemAdmin allowedSchoolIds come from account', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-SYS-1',
        email: 'sysadmin@gov.eg',
        fullName: 'مدير النظام المركزي',
        role: 'SystemAdmin',
        allowedSchoolIds: JSON.stringify(['SCH-BADR', 'SCH-ALNOOR']),
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const res = testCtx.handleStaffLogin(testCtx.SpreadsheetApp.getActiveSpreadsheet(), 'sysadmin@gov.eg', 'Password123!', 'REQ_1');
    expect(res.success).toBe(true);
    expect(res.user.role).toBe('SystemAdmin');
    expect(res.user.accessScope).toBe('GLOBAL');
    expect(res.user.allowedSchoolIds).toEqual(['SCH-BADR', 'SCH-ALNOOR']);
  });

  it('6. SystemAdmin does not receive all Master_Schools automatically', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    // Master_Schools contains SCH-BADR, SCH-ALNOOR, SCH-NEW
    // But SystemAdmin account only has allowedSchoolIds = ['SCH-BADR']
    const masterUsers = [
      {
        id: 'U-SYS-2',
        email: 'syssingle@gov.eg',
        fullName: 'مشرف قطاع بدر',
        role: 'SystemAdmin',
        allowedSchoolIds: JSON.stringify(['SCH-BADR']),
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const res = testCtx.handleStaffLogin(testCtx.SpreadsheetApp.getActiveSpreadsheet(), 'syssingle@gov.eg', 'Password123!', 'REQ_1');
    expect(res.success).toBe(true);
    // Does NOT get SCH-ALNOOR or SCH-NEW
    expect(res.user.allowedSchoolIds).toEqual(['SCH-BADR']);
    // Exactly 1 allowed school -> activeSchoolId becomes SCH-BADR
    expect(res.user.activeSchoolId).toBe('SCH-BADR');

    // If multiple schools allowed: activeSchoolId is empty (no auto-selection)
    const masterUsersMulti = [
      {
        id: 'U-SYS-3',
        email: 'sysmulti@gov.eg',
        fullName: 'مشرف عام',
        role: 'SystemAdmin',
        allowedSchoolIds: JSON.stringify(['SCH-BADR', 'SCH-ALNOOR']),
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
    ];
    const { context: context2 } = createGasSandbox({ masterUsers: masterUsersMulti });
    const resMulti = context2.handleStaffLogin(context2.SpreadsheetApp.getActiveSpreadsheet(), 'sysmulti@gov.eg', 'Password123!', 'REQ_2');
    expect(resMulti.user.allowedSchoolIds).toEqual(['SCH-BADR', 'SCH-ALNOOR']);
    expect(resMulti.user.activeSchoolId).toBe('');
  });

  it('7. Missing email fails', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-NO-EMAIL',
        username: 'old_admin',
        email: '', // Missing email
        fullName: 'حساب قديم',
        role: 'SchoolAdmin',
        schoolId: 'SCH-BADR',
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const res = testCtx.handleStaffLogin(testCtx.SpreadsheetApp.getActiveSpreadsheet(), 'old_admin@test.com', 'Password123!', 'REQ_1');
    expect(res.success).toBe(false);
    expect(res.code).toBe('INVALID_CREDENTIALS');
  });

  it('8. Duplicate email fails closed', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-DUP-1',
        email: 'duplicate@school.eg',
        username: 'dup1',
        fullName: 'المستخدم الأول',
        role: 'SchoolAdmin',
        schoolId: 'SCH-BADR',
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
      {
        id: 'U-DUP-2',
        email: 'duplicate@school.eg', // Same normalized email
        username: 'dup2',
        fullName: 'المستخدم الثاني',
        role: 'SchoolDirector',
        schoolId: 'SCH-ALNOOR',
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const res = testCtx.handleStaffLogin(testCtx.SpreadsheetApp.getActiveSpreadsheet(), 'duplicate@school.eg', 'Password123!', 'REQ_1');
    expect(res.success).toBe(false);
    expect(res.code).toBe('DUPLICATE_ACCOUNT_EMAIL');
  });

  it('9. School account without schoolId fails', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-NO-SCH',
        email: 'orphaned@school.eg',
        fullName: 'مدير بدون مدرسة',
        role: 'SchoolAdmin',
        schoolId: '', // Missing schoolId
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const res = testCtx.handleStaffLogin(testCtx.SpreadsheetApp.getActiveSpreadsheet(), 'orphaned@school.eg', 'Password123!', 'REQ_1');
    expect(res.success).toBe(false);
    expect(res.code).toBe('SCHOOL_CONTEXT_REQUIRED');
  });

  it('10. AdministrativeEmployee without employeeId fails', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-EMP-NO-ID',
        email: 'clerk@badr.edu.eg',
        fullName: 'موظف إداري بدون معرف',
        role: 'AdministrativeEmployee',
        schoolId: 'SCH-BADR',
        employeeId: '', // Missing employeeId
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const res = testCtx.handleStaffLogin(testCtx.SpreadsheetApp.getActiveSpreadsheet(), 'clerk@badr.edu.eg', 'Password123!', 'REQ_1');
    expect(res.success).toBe(false);
    expect(res.code).toBe('SELF_IDENTITY_REQUIRED');
  });

  it('11. Legacy Admin without schoolId => NEEDS_ADMIN_REVIEW', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-LEGACY-ADMIN',
        email: 'legacyadmin@badr.edu.eg',
        fullName: 'مدير قديم',
        role: 'Admin', // Legacy role
        schoolId: '', // Missing schoolId
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const res = testCtx.handleStaffLogin(testCtx.SpreadsheetApp.getActiveSpreadsheet(), 'legacyadmin@badr.edu.eg', 'Password123!', 'REQ_1');
    expect(res.success).toBe(false);
    expect(res.code).toBe('NEEDS_ADMIN_REVIEW');
    // Must never be converted to SystemAdmin
    expect((res as any).role).not.toBe('SystemAdmin');
  });

  it('12. Password/hash/salt/spreadsheetId not returned', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-SA-DTO',
        email: 'dto_check@badr.edu.eg',
        fullName: 'فحص الأمان',
        role: 'SchoolAdmin',
        schoolId: 'SCH-BADR',
        passwordHash: hash,
        passwordSalt: salt,
        passwordIterations: 10000,
        passwordAlgorithm: 'PBKDF2-HMAC-SHA256',
        spreadsheetId: 'secret-ss-id-12345',
        status: 'Active',
      },
    ];

    const { context: testCtx } = createGasSandbox({ masterUsers });
    const postEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'login',
          email: 'dto_check@badr.edu.eg',
          password: 'Password123!',
        }),
      },
    };

    const res = JSON.parse(testCtx.doPost(postEvent).getContent());
    expect(res.status).toBe('success');
    expect(res.user.password).toBeUndefined();
    expect(res.user.passwordHash).toBeUndefined();
    expect(res.user.passwordSalt).toBeUndefined();
    expect(res.user.passwordAlgorithm).toBeUndefined();
    expect(res.user.spreadsheetId).toBeUndefined();
    expect(res.spreadsheetId).toBeUndefined();
  });

  it('13. Login audit does not contain password/sessionToken', () => {
    const { context } = createGasSandbox();
    const salt = 'testsalt123';
    const hash = context.computeSaltedHash('Password123!', salt, 10000);

    const masterUsers = [
      {
        id: 'U-AUDIT',
        email: 'audit_test@badr.edu.eg',
        fullName: 'مستخدم التدقيق',
        role: 'SchoolAdmin',
        schoolId: 'SCH-BADR',
        passwordHash: hash,
        passwordSalt: salt,
        status: 'Active',
      },
    ];

    const { context: testCtx, sheetsData } = createGasSandbox({ masterUsers });
    const postEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'login',
          email: 'audit_test@badr.edu.eg',
          password: 'Password123!',
        }),
      },
    };

    const res = JSON.parse(testCtx.doPost(postEvent).getContent());
    expect(res.status).toBe('success');

    const auditLogs = sheetsData.Audit_Logs || [];
    expect(auditLogs.length).toBeGreaterThan(0);
    const lastLog = auditLogs[auditLogs.length - 1];

    expect(lastLog.action).toBe('LOGIN_SUCCESS');
    expect(lastLog.user).toBe('audit_test@badr.edu.eg');

    // Details and logged data must NOT contain raw password or sessionToken
    const logStr = JSON.stringify(lastLog);
    expect(logStr).not.toContain('Password123!');
    expect(logStr).not.toContain(res.sessionToken);
  });

  it('14. Username-only login no longer authenticates Staff ERP', () => {
    const { context } = createGasSandbox();
    const postEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'login',
          username: 'admin_badr', // No email provided!
          password: 'Password123!',
          schoolId: 'SCH-BADR',
        }),
      },
    };

    const res = JSON.parse(context.doPost(postEvent).getContent());
    expect(res.status).toBe('error');
    expect(res.code).toBe('INVALID_EMAIL');
  });

  it('15. Teacher Portal login remains unchanged', () => {
    const { context } = createGasSandbox();
    // Teacher login uses action: 'teacherLogin'
    const postEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'teacherLogin',
          schoolId: 'SCH-BADR',
          teacherCode: 'TC-101',
          password: 'TeacherPass123',
        }),
      },
    };

    const res = JSON.parse(context.doPost(postEvent).getContent());
    expect(res.status).toBe('success');
    expect(res.teacherSessionToken).toBeDefined();
    expect(res.teacherSessionToken.length).toBeGreaterThanOrEqual(32);
    expect(res.teacher.teacherCode).toBe('TC-101');
  });
});
