import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { storageService } from '../src/services/storageService';
import {
  switchActiveSchoolBackend,
  getSecurityAuditLogs,
  clearSecurityAuditLogs,
  resolveSchoolContext,
  setMasterSchoolRegistry,
} from '../src/services/backendAuthService';
import { ServerSession, User } from '../src/types';

// ============================================================
// GAS IN-MEMORY ENVIRONMENT FOR A12 SCHOOL SWITCHING
// ============================================================

class MockGasSheet {
  name: string;
  headers: string[];
  rows: any[][];

  constructor(name: string, defaultHeaders: string[], initialRows: any[][] = []) {
    this.name = name;
    this.headers = [...defaultHeaders];
    this.rows = initialRows.map(r => [...r]);
  }

  getName() { return this.name; }
  getLastColumn() { return this.headers.length; }
  getLastRow() { return this.rows.length + (this.headers.length > 0 ? 1 : 0); }

  getDataRange() {
    return {
      getValues: () => [this.headers, ...this.rows],
    };
  }

  getRange(r: number, c: number, numRows = 1, numCols = 1) {
    return {
      getValues: () => {
        const res: any[][] = [];
        for (let ro = 0; ro < numRows; ro++) {
          const rowArr: any[] = [];
          const curR = r + ro;
          for (let co = 0; co < numCols; co++) {
            const curC = c + co;
            if (curR === 1) {
              rowArr.push(this.headers[curC - 1] || '');
            } else {
              const row = this.rows[curR - 2];
              rowArr.push(row ? (row[curC - 1] !== undefined ? row[curC - 1] : '') : '');
            }
          }
          res.push(rowArr);
        }
        return res;
      },
      setValue: (val: any) => {
        if (r === 1) {
          while (this.headers.length < c) this.headers.push('');
          this.headers[c - 1] = val;
        } else {
          while (this.rows.length <= r - 2) this.rows.push(new Array(this.headers.length).fill(''));
          this.rows[r - 2][c - 1] = val;
        }
      },
      setValues: (matrix: any[][]) => {
        for (let ro = 0; ro < matrix.length; ro++) {
          for (let co = 0; co < matrix[ro].length; co++) {
            const curR = r + ro;
            const curC = c + co;
            if (curR === 1) {
              while (this.headers.length < curC) this.headers.push('');
              this.headers[curC - 1] = matrix[ro][co];
            } else {
              while (this.rows.length <= curR - 2) this.rows.push(new Array(this.headers.length).fill(''));
              this.rows[curR - 2][curC - 1] = matrix[ro][co];
            }
          }
        }
      },
      setBackground: () => {},
    };
  }

  appendRow(rowArr: any[]) {
    this.rows.push([...rowArr]);
  }
}

function createGasTestEnv(options: {
  initialUsers?: any[][];
  initialSessions?: any[][];
  initialSchools?: any[][];
  schoolSpreadsheets?: Record<string, { sheets: Record<string, MockGasSheet> }>;
} = {}) {
  const codeGsPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');
  const codeContent = fs.readFileSync(codeGsPath, 'utf8');

  const defaultSchools = [
    ['SCH-BADR', 'BADR', 'مدرسة إبدأ الوطنية - بدر', 'ss-badr-real-id', 'Active', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'],
    ['SCH-DAMIETTA', 'DAMIETTA', 'مدرسة إبدأ الوطنية - دمياط', 'ss-damietta-real-id', 'Active', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'],
    ['SCH-INACTIVE', 'INACTIVE', 'مدرسة مغلقة', 'ss-inactive-real-id', 'Inactive', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'],
  ];

  const sheets: Record<string, MockGasSheet> = {
    Users: new MockGasSheet('Users', [
      'id', 'username', 'passwordHash', 'passwordSalt', 'passwordAlgorithm', 'passwordIterations',
      'fullName', 'role', 'status', 'department', 'email', 'schoolId', 'allowedSchoolIds',
      'employeeId', 'createdAt', 'lastLogin', 'passwordChangedAt',
    ], options.initialUsers || []),
    Sessions: new MockGasSheet('Sessions', [
      'sessionId', 'tokenHash', 'userId', 'username', 'fullName', 'role', 'schoolId',
      'email', 'accessScope', 'allowedSchoolIds', 'activeSchoolId', 'employeeId',
      'createdAt', 'expiresAt', 'status',
    ], options.initialSessions || []),
    Teacher_Sessions: new MockGasSheet('Teacher_Sessions', [
      'sessionId', 'tokenHash', 'teacherId', 'employeeId', 'teacherCode', 'teacherName',
      'schoolId', 'createdAt', 'expiresAt', 'status',
    ]),
    Master_Schools: new MockGasSheet('Master_Schools', [
      'schoolId', 'schoolCode', 'schoolName', 'spreadsheetId', 'status', 'createdAt', 'updatedAt',
    ], options.initialSchools || defaultSchools),
    Audit_Logs: new MockGasSheet('Audit_Logs', [
      'id', 'timestamp', 'username', 'userRole', 'action', 'entity', 'targetId', 'details', 'requestId',
    ]),
  };

  const masterSs = {
    getId: () => 'master-ss-id',
    getSheetByName: (name: string) => sheets[name] || null,
    insertSheet: (name: string) => {
      const s = new MockGasSheet(name, []);
      sheets[name] = s;
      return s;
    },
  };

  // Dedicated school spreadsheets
  const badrSheets: Record<string, MockGasSheet> = {
    Students: new MockGasSheet('Students', ['id', 'schoolId', 'studentName', 'grade'], [
      ['std-badr-1', 'SCH-BADR', 'طالب بدر الأول', 'Grade 1'],
    ]),
  };
  const damiettaSheets: Record<string, MockGasSheet> = {
    Students: new MockGasSheet('Students', ['id', 'schoolId', 'studentName', 'grade'], [
      ['std-damietta-1', 'SCH-DAMIETTA', 'طالب دمياط الأول', 'Grade 1'],
    ]),
  };

  const schoolSsMap: Record<string, any> = {
    'ss-badr-real-id': {
      getId: () => 'ss-badr-real-id',
      getSheetByName: (name: string) => badrSheets[name] || new MockGasSheet(name, []),
    },
    'ss-damietta-real-id': {
      getId: () => 'ss-damietta-real-id',
      getSheetByName: (name: string) => damiettaSheets[name] || new MockGasSheet(name, []),
    },
    'ss-inactive-real-id': {
      getId: () => 'ss-inactive-real-id',
      getSheetByName: (name: string) => new MockGasSheet(name, []),
    },
    ...(options.schoolSpreadsheets || {}),
  };

  const logs: string[] = [];

  const sandbox: any = {
    console,
    Math,
    Date,
    Logger: {
      log: (...args: any[]) => {
        logs.push(args.map(a => String(a)).join(' '));
      },
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (d: Date, tz: string, fmt: string) => d.toISOString(),
      computeDigest: (algo: any, value: string) => {
        const hash = crypto.createHash('sha256').update(value, 'utf8').digest();
        return Array.from(hash);
      },
      computeHmacSha256Signature: (value: any, key: string) => {
        const hmac = crypto.createHmac('sha256', key);
        if (Array.isArray(value)) {
          hmac.update(Buffer.from(value));
        } else {
          hmac.update(String(value), 'utf8');
        }
        return Array.from(hmac.digest());
      },
      base64Encode: () => '',
      Charset: { UTF_8: 'UTF-8' },
      DigestAlgorithm: { SHA_256: 'SHA-256' },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s: string) => ({
        getContent: () => s,
        setMimeType: () => ({ getContent: () => s }),
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null,
        setProperty: () => {},
        deleteProperty: () => {},
        getProperties: () => ({
          INITIAL_ADMIN_EMAIL: 'admin@system.local',
          INITIAL_ADMIN_PASSWORD: 'SecretPassword123!',
          BADR_SPREADSHEET_ID: 'ss-badr-real-id',
          DAMIETTA_SPREADSHEET_ID: 'ss-damietta-real-id',
        }),
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => masterSs,
      openById: (id: string) => {
        if (!id || !id.trim()) {
          throw new Error('SpreadsheetApp.openById: invalid ID');
        }
        if (schoolSsMap[id]) {
          return schoolSsMap[id];
        }
        return {
          getId: () => id,
          getSheetByName: (name: string) => new MockGasSheet(name, []),
        };
      },
    },
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(codeContent, context);

  return { context, sheets, masterSs, logs, badrSheets, damiettaSheets };
}

function sha256Hex(str: string): string {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// ============================================================
// TEST SUITE: PHASE 3C-A12 AUTHORITATIVE SCHOOL SWITCHING
// ============================================================

describe('PHASE 3C-A12 — AUTHORITATIVE SYSTEM ADMIN SCHOOL SWITCHING', () => {
  const SYSADMIN_TOKEN = 'token-sysadmin-secret-xyz';
  const SYSADMIN_TOKEN_HASH = sha256Hex(SYSADMIN_TOKEN);

  const SCHOOLADMIN_TOKEN = 'token-schooladmin-badr';
  const SCHOOLADMIN_TOKEN_HASH = sha256Hex(SCHOOLADMIN_TOKEN);

  const TEACHER_TOKEN = 'token-teacher-badr';
  const TEACHER_TOKEN_HASH = sha256Hex(TEACHER_TOKEN);

  const EMPLOYEE_TOKEN = 'token-employee-badr';
  const EMPLOYEE_TOKEN_HASH = sha256Hex(EMPLOYEE_TOKEN);

  const initialUsers = [
    [
      'usr-sysadmin', 'systemadmin', 'dummyhash', 'dummysalt', 'PBKDF2', 10000,
      'مدير النظام الشامل', 'SystemAdmin', 'Active', 'IT', 'admin@ntss.edu.eg',
      '', JSON.stringify(['SCH-BADR', 'SCH-DAMIETTA']), 'EMP-SYS-1',
      '2026-09-01T00:00:00Z', '2026-09-24T00:00:00Z', '2026-09-01T00:00:00Z',
    ],
    [
      'usr-schooladmin-badr', 'admin_badr', 'dummyhash', 'dummysalt', 'PBKDF2', 10000,
      'مدير مدرسة بدر', 'SchoolAdmin', 'Active', 'Admin', 'badr.admin@ntss.edu.eg',
      'SCH-BADR', JSON.stringify(['SCH-BADR']), 'EMP-BADR-1',
      '2026-09-01T00:00:00Z', '2026-09-24T00:00:00Z', '2026-09-01T00:00:00Z',
    ],
    [
      'usr-employee-badr', 'emp_badr', 'dummyhash', 'dummysalt', 'PBKDF2', 10000,
      'موظف إداري بدر', 'AdministrativeEmployee', 'Active', 'HR', 'badr.emp@ntss.edu.eg',
      'SCH-BADR', JSON.stringify(['SCH-BADR']), 'EMP-BADR-2',
      '2026-09-01T00:00:00Z', '2026-09-24T00:00:00Z', '2026-09-01T00:00:00Z',
    ],
    [
      'usr-teacher-badr', 'teacher_badr', 'dummyhash', 'dummysalt', 'PBKDF2', 10000,
      'معلم مدرسة بدر', 'Teacher', 'Active', 'Teaching', 'teacher.badr@ntss.edu.eg',
      'SCH-BADR', JSON.stringify(['SCH-BADR']), 'EMP-BADR-3',
      '2026-09-01T00:00:00Z', '2026-09-24T00:00:00Z', '2026-09-01T00:00:00Z',
    ],
  ];

  const initialSessions = [
    [
      'sess-sysadmin-1', SYSADMIN_TOKEN_HASH, 'usr-sysadmin', 'systemadmin', 'مدير النظام الشامل',
      'SystemAdmin', '', 'admin@ntss.edu.eg', 'GLOBAL', JSON.stringify(['SCH-BADR', 'SCH-DAMIETTA']),
      'SCH-BADR', 'EMP-SYS-1', '2026-09-24T00:00:00Z', '2099-01-01T00:00:00Z', 'Active',
    ],
    [
      'sess-schooladmin-1', SCHOOLADMIN_TOKEN_HASH, 'usr-schooladmin-badr', 'admin_badr', 'مدير مدرسة بدر',
      'SchoolAdmin', 'SCH-BADR', 'badr.admin@ntss.edu.eg', 'SCHOOL', JSON.stringify(['SCH-BADR']),
      'SCH-BADR', 'EMP-BADR-1', '2026-09-24T00:00:00Z', '2099-01-01T00:00:00Z', 'Active',
    ],
    [
      'sess-emp-1', EMPLOYEE_TOKEN_HASH, 'usr-employee-badr', 'emp_badr', 'موظف إداري بدر',
      'AdministrativeEmployee', 'SCH-BADR', 'badr.emp@ntss.edu.eg', 'SELF', JSON.stringify(['SCH-BADR']),
      'SCH-BADR', 'EMP-BADR-2', '2026-09-24T00:00:00Z', '2099-01-01T00:00:00Z', 'Active',
    ],
    [
      'sess-teacher-1', TEACHER_TOKEN_HASH, 'usr-teacher-badr', 'teacher_badr', 'معلم مدرسة بدر',
      'Teacher', 'SCH-BADR', 'teacher.badr@ntss.edu.eg', 'SELF', JSON.stringify(['SCH-BADR']),
      'SCH-BADR', 'EMP-BADR-3', '2026-09-24T00:00:00Z', '2099-01-01T00:00:00Z', 'Active',
    ],
  ];

  beforeEach(() => {
    localStorage.clear();
    storageService.setCurrentUser(null);
    clearSecurityAuditLogs();
    setMasterSchoolRegistry([
      {
        schoolId: 'SCH-BADR',
        schoolCode: 'BADR',
        schoolName: 'مدرسة إبدأ الوطنية للعلوم التقنية - بدر',
        spreadsheetId: 'SHEET_ID_BADR_TEST',
        status: 'Active',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
      {
        schoolId: 'SCH-DAMIETTA',
        schoolCode: 'DAMIETTA',
        schoolName: 'مدرسة إبدأ الوطنية للعلوم التقنية - دمياط',
        spreadsheetId: 'SHEET_ID_DAMIETTA_TEST',
        status: 'Active',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
      {
        schoolId: 'SCH-INACTIVE',
        schoolCode: 'INACTIVE',
        schoolName: 'مدرسة غير مفعلة',
        spreadsheetId: 'SHEET_ID_INACTIVE_TEST',
        status: 'Inactive',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ]);
  });

  // -------------------------------------------------------------
  // 1. BACKEND SWITCH TESTS
  // -------------------------------------------------------------
  describe('1. Backend Authoritative Switch Tests', () => {
    it('1. SystemAdmin + GLOBAL can switch from SCH-BADR to SCH-DAMIETTA', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('success');
      expect(body.user.activeSchoolId).toBe('SCH-DAMIETTA');
      expect(body.school.schoolId).toBe('SCH-DAMIETTA');
      expect(body.school.schoolCode).toBe('DAMIETTA');
    });

    it('2. SystemAdmin can switch back from SCH-DAMIETTA to SCH-BADR', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      // First switch to DAMIETTA
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      // Switch back to BADR
      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-BADR' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('success');
      expect(body.user.activeSchoolId).toBe('SCH-BADR');
      expect(body.school.schoolId).toBe('SCH-BADR');
      expect(body.school.schoolCode).toBe('BADR');
    });

    it('3. Same sessionToken remains unchanged after switch', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('success');
      // Server does not emit a new session token; the caller keeps the existing token
      expect(body.sessionToken).toBeUndefined();
      expect(body.user.sessionToken).toBeUndefined();
    });

    it('4. activeSchoolId changes in Server Session row in Sessions sheet', () => {
      const { context, sheets } = createGasTestEnv({ initialUsers, initialSessions });

      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      // Check Sessions sheet
      const sessionValues = sheets.Sessions.getDataRange().getValues();
      const headers = sessionValues[0];
      const tokenHashIdx = headers.indexOf('tokenHash');
      const activeSchoolIdx = headers.indexOf('activeSchoolId');

      const sysRow = sessionValues.find(row => row[tokenHashIdx] === SYSADMIN_TOKEN_HASH);
      expect(sysRow).toBeDefined();
      expect(sysRow[activeSchoolIdx]).toBe('SCH-DAMIETTA');
    });

    it('5. validateSession with same token returns the new activeSchoolId', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      // Switch school
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      // Now call validateSession with the exact same token
      const valRes = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'validateSession',
            sessionToken: SYSADMIN_TOKEN,
          }),
        },
      });

      const valBody = JSON.parse(valRes.getContent());
      expect(valBody.status).toBe('success');
      expect(valBody.user.activeSchoolId).toBe('SCH-DAMIETTA');
      expect(valBody.user.role).toBe('SystemAdmin');
    });

    it('6. SchoolAdmin trying switchActiveSchool fails with HTTP 403 & SCHOOL_SWITCH_NOT_ALLOWED', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SCHOOLADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('error');
      expect(body.code).toBe('SCHOOL_SWITCH_NOT_ALLOWED');
    });

    it('7. Teacher attempting switchActiveSchool is DENIED', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: TEACHER_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('error');
      expect(body.code).toBe('SCHOOL_SWITCH_NOT_ALLOWED');
    });

    it('8. AdministrativeEmployee attempting switchActiveSchool is DENIED', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: EMPLOYEE_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('error');
      expect(body.code).toBe('SCHOOL_SWITCH_NOT_ALLOWED');
    });

    it('9. Target school outside allowedSchoolIds returns ACCESS_DENIED_SCHOOL_SCOPE', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-ALNOOR' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('error');
      expect(body.code).toBe('ACCESS_DENIED_SCHOOL_SCOPE');
    });

    it('10. Unknown school (not in Master_Schools) returns SCHOOL_NOT_FOUND', () => {
      // Modify SystemAdmin to allow SCH-UNKNOWN in Users and Sessions
      const customSessions = initialSessions.map(r => {
        if (r[0] === 'sess-sysadmin-1') {
          const c = [...r];
          c[9] = JSON.stringify(['SCH-BADR', 'SCH-DAMIETTA', 'SCH-NONEXISTENT']);
          return c;
        }
        return r;
      });
      const customUsers = initialUsers.map(u => {
        if (u[0] === 'usr-sysadmin') {
          const cu = [...u];
          cu[12] = JSON.stringify(['SCH-BADR', 'SCH-DAMIETTA', 'SCH-NONEXISTENT']);
          return cu;
        }
        return u;
      });

      const { context } = createGasTestEnv({ initialUsers: customUsers, initialSessions: customSessions });

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-NONEXISTENT' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('error');
      expect(body.code).toBe('SCHOOL_NOT_FOUND');
    });

    it('11. Inactive school returns SCHOOL_INACTIVE', () => {
      // Allow SCH-INACTIVE for SystemAdmin
      const customSessions = initialSessions.map(r => {
        if (r[0] === 'sess-sysadmin-1') {
          const c = [...r];
          c[9] = JSON.stringify(['SCH-BADR', 'SCH-DAMIETTA', 'SCH-INACTIVE']);
          return c;
        }
        return r;
      });
      const customUsers = initialUsers.map(u => {
        if (u[0] === 'usr-sysadmin') {
          const cu = [...u];
          cu[12] = JSON.stringify(['SCH-BADR', 'SCH-DAMIETTA', 'SCH-INACTIVE']);
          return cu;
        }
        return u;
      });

      const { context } = createGasTestEnv({ initialUsers: customUsers, initialSessions: customSessions });

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-INACTIVE' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('error');
      expect(body.code).toBe('SCHOOL_INACTIVE');
    });

    it('12. targetSchoolId is trimmed and uppercase normalized', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: '   sch-damietta   ' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('success');
      expect(body.user.activeSchoolId).toBe('SCH-DAMIETTA');
      expect(body.school.schoolId).toBe('SCH-DAMIETTA');
    });
  });

  // -------------------------------------------------------------
  // 2. PAYLOAD TAMPERING TESTS
  // -------------------------------------------------------------
  describe('2. Payload Tampering Protection Tests', () => {
    it('GLOBAL scope: data actions strictly use session.activeSchoolId and ignore payload.schoolId', () => {
      const { context, badrSheets, damiettaSheets } = createGasTestEnv({ initialUsers, initialSessions });

      // SystemAdmin is active in SCH-BADR.
      // An attacker attempts payload tampering: { schoolId: 'SCH-DAMIETTA' }
      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'getStudents',
            sessionToken: SYSADMIN_TOKEN,
            schoolId: 'SCH-DAMIETTA',
            data: { schoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('success');
      // Must return students from BADR, NOT Damietta
      expect(body.data).toHaveLength(1);
      expect(body.data[0].schoolId).toBe('SCH-BADR');
      expect(body.data[0].studentName).toBe('طالب بدر الأول');
    });

    it('SCHOOL scope: request with mismatched payload.schoolId is rejected (SCHOOL_CONTEXT_MISMATCH)', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      // SchoolAdmin is bounded to SCH-BADR. Attempts payload tampering: { schoolId: 'SCH-DAMIETTA' }
      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'getStudents',
            sessionToken: SCHOOLADMIN_TOKEN,
            schoolId: 'SCH-DAMIETTA',
            data: { schoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('error');
      expect(body.code).toBe('SCHOOL_CONTEXT_MISMATCH');
    });

    it('Emulation level: resolveSchoolContext enforces authoritative schoolId', () => {
      const sysAdminSession: ServerSession = {
        sessionToken: 'token-test',
        userId: 'usr-sys',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        schoolId: '',
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        status: 'Active',
      };

      // When requestedSchoolId is not provided, defaults to activeSchoolId
      const res = resolveSchoolContext(sysAdminSession);
      expect(res.success).toBe(true);
      expect(res.school?.schoolId).toBe('SCH-BADR');

      // SchoolAdmin cannot override session school
      const schoolAdminSession: ServerSession = {
        sessionToken: 'token-admin',
        userId: 'usr-admin',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR'],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        status: 'Active',
      };
      const tamperRes = resolveSchoolContext(schoolAdminSession, 'SCH-DAMIETTA');
      expect(tamperRes.success).toBe(false);
      expect(tamperRes.code).toBe('SCHOOL_CONTEXT_MISMATCH');
    });
  });

  // -------------------------------------------------------------
  // 3. RESPONSE SECURITY
  // -------------------------------------------------------------
  describe('3. Response Security Tests', () => {
    it('switchActiveSchool response contains ONLY safe DTO and no secrets', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('success');

      // Stringify whole response to check for forbidden leak keywords
      const rawText = res.getContent();
      expect(rawText).not.toContain('spreadsheetId');
      expect(rawText).not.toContain('ss-damietta-real-id');
      expect(rawText).not.toContain('password');
      expect(rawText).not.toContain('passwordHash');
      expect(rawText).not.toContain('passwordSalt');
      expect(rawText).not.toContain('tokenHash');
      expect(rawText).not.toContain('SecretPassword123!');
      expect(rawText).not.toContain('INITIAL_ADMIN');

      // Verify safe fields only
      expect(body.user).toEqual({
        id: 'usr-sysadmin',
        email: 'admin@ntss.edu.eg',
        fullName: 'مدير النظام الشامل',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        schoolId: '',
        activeSchoolId: 'SCH-DAMIETTA',
        allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
      });
      expect(body.school).toEqual({
        schoolId: 'SCH-DAMIETTA',
        schoolCode: 'DAMIETTA',
        schoolName: 'مدرسة إبدأ الوطنية - دمياط',
        status: 'Active',
      });
    });
  });

  // -------------------------------------------------------------
  // 4. AUDIT LOGGING
  // -------------------------------------------------------------
  describe('4. Authoritative Audit Logging Tests', () => {
    it('Successful switch logs SCHOOL_CONTEXT_SWITCH with complete metadata and no secrets', () => {
      const { context, sheets } = createGasTestEnv({ initialUsers, initialSessions });

      const reqId = 'REQ_A12_TEST_SWITCH_01';
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            requestId: reqId,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      const auditValues = sheets.Audit_Logs.getDataRange().getValues();
      const headers = auditValues[0];
      const actionIdx = headers.indexOf('action');
      const entityIdx = headers.indexOf('entity');
      const detailsIdx = headers.indexOf('details');

      const switchAudit = auditValues.find(row => row[actionIdx] === 'SCHOOL_CONTEXT_SWITCH');
      expect(switchAudit).toBeDefined();
      expect(switchAudit![entityIdx]).toBe('SESSION');

      const details = JSON.parse(switchAudit![detailsIdx]);
      expect(details.actorUserId).toBe('usr-sysadmin');
      expect(details.actorEmail).toBe('admin@ntss.edu.eg');
      expect(details.actorRole).toBe('SystemAdmin');
      expect(details.previousSchoolId).toBe('SCH-BADR');
      expect(details.targetSchoolId).toBe('SCH-DAMIETTA');
      expect(details.timestamp).toBeDefined();

      // No secrets in details
      expect(switchAudit![detailsIdx]).not.toContain('password');
      expect(switchAudit![detailsIdx]).not.toContain('tokenHash');
      expect(switchAudit![detailsIdx]).not.toContain('spreadsheetId');
    });

    it('Rejected switch attempts log security audit entries', () => {
      const { context, sheets } = createGasTestEnv({ initialUsers, initialSessions });

      // SchoolAdmin tries to switch
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SCHOOLADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      const auditValues = sheets.Audit_Logs.getDataRange().getValues();
      const headers = auditValues[0];
      const actionIdx = headers.indexOf('action');
      const targetIdIdx = headers.indexOf('targetId');

      const deniedAudit = auditValues.find(row =>
        row[actionIdx] === 'ACCESS_DENIED' && row[targetIdIdx] === 'usr-schooladmin-badr'
      );
      expect(deniedAudit).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // 5. SESSION PERSISTENCE ACROSS INDEPENDENT REQUESTS
  // -------------------------------------------------------------
  describe('5. Session Persistence Across Independent Requests', () => {
    it('After switch, server remembers new activeSchoolId and never reverts without explicit switch', () => {
      const { context } = createGasTestEnv({ initialUsers, initialSessions });

      // 1. Switch to DAMIETTA
      context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'switchActiveSchool',
            sessionToken: SYSADMIN_TOKEN,
            data: { targetSchoolId: 'SCH-DAMIETTA' },
          }),
        },
      });

      // 2. Simulate fresh client request (e.g. page reload or separate API call)
      const res1 = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'validateSession',
            sessionToken: SYSADMIN_TOKEN,
          }),
        },
      });
      const body1 = JSON.parse(res1.getContent());
      expect(body1.user.activeSchoolId).toBe('SCH-DAMIETTA');

      // 3. Perform a data query in this session
      const res2 = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'getStudents',
            sessionToken: SYSADMIN_TOKEN,
          }),
        },
      });
      const body2 = JSON.parse(res2.getContent());
      // Students must come from Damietta
      expect(body2.data[0].schoolId).toBe('SCH-DAMIETTA');
      expect(body2.data[0].studentName).toBe('طالب دمياط الأول');

      // 4. Another validateSession call still returns DAMIETTA
      const res3 = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'validateSession',
            sessionToken: SYSADMIN_TOKEN,
          }),
        },
      });
      const body3 = JSON.parse(res3.getContent());
      expect(body3.user.activeSchoolId).toBe('SCH-DAMIETTA');
    });
  });

  // -------------------------------------------------------------
  // 6. FRONTEND CACHE INVALIDATION & STORAGE SERVICE
  // -------------------------------------------------------------
  describe('6. Frontend Cache Invalidation & Storage Service Tests', () => {
    it('storageService.switchActiveSchool clears school-scoped caches to prevent data bleeding', async () => {
      // Setup current user
      const currentUser: User = {
        id: 'usr-sysadmin',
        username: 'systemadmin',
        fullName: 'مدير النظام الشامل',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        schoolId: '',
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
        sessionToken: 'valid-sysadmin-token',
      };
      storageService.setCurrentUser(currentUser);
      storageService.saveSettings({
        ...storageService.getSettings(),
        googleAppsScriptUrl: 'https://script.google.com/macros/s/AKfycbyFakeEndpoint/exec',
      });

      // Seed local storage with school-scoped data from BADR
      localStorage.setItem('ntss_students_v3', JSON.stringify([{ id: 'std-badr', schoolId: 'SCH-BADR' }]));
      localStorage.setItem('ntss_employees_v3', JSON.stringify([{ id: 'emp-badr', schoolId: 'SCH-BADR' }]));
      localStorage.setItem('ntss_student_attendance_v3', JSON.stringify({ date: '2026-09-24', schoolId: 'SCH-BADR' }));

      // Mock backend response for switchActiveSchool
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          user: {
            id: 'usr-sysadmin',
            role: 'SystemAdmin',
            accessScope: 'GLOBAL',
            activeSchoolId: 'SCH-DAMIETTA',
            allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
          },
          school: {
            schoolId: 'SCH-DAMIETTA',
            schoolCode: 'DAMIETTA',
            schoolName: 'مدرسة إبدأ الوطنية - دمياط',
            status: 'Active',
          },
        }),
      });
      global.fetch = mockFetch;

      let notificationFired = false;
      const unsubscribe = storageService.subscribe(() => {
        notificationFired = true;
      });

      const res = await storageService.switchActiveSchool('SCH-DAMIETTA');
      expect(res.success).toBe(true);

      // Verify school-scoped caches are cleared
      expect(localStorage.getItem('ntss_students_v3')).toBeNull();
      expect(localStorage.getItem('ntss_employees_v3')).toBeNull();
      expect(localStorage.getItem('ntss_student_attendance_v3')).toBeNull();

      // Verify current user updated
      const updated = storageService.getCurrentUser();
      expect(updated?.activeSchoolId).toBe('SCH-DAMIETTA');
      expect(storageService.getActiveSchoolId()).toBe('SCH-DAMIETTA');

      // Verify observers notified
      expect(notificationFired).toBe(true);

      unsubscribe();
    });

    it('storageService.switchActiveSchool fails closed on non-SystemAdmin caller', async () => {
      const schoolAdminUser: User = {
        id: 'usr-admin-badr',
        username: 'admin_badr',
        fullName: 'مدير مدرسة بدر',
        role: 'SchoolAdmin',
        accessScope: 'SCHOOL',
        schoolId: 'SCH-BADR',
        sessionToken: 'valid-admin-token',
      };
      storageService.setCurrentUser(schoolAdminUser);

      const res = await storageService.switchActiveSchool('SCH-DAMIETTA');
      expect(res.success).toBe(false);
      expect(res.code).toBe('SCHOOL_SWITCH_NOT_ALLOWED');
    });

    it('storageService.switchActiveSchool fails closed on out-of-scope school', async () => {
      const sysAdmin: User = {
        id: 'usr-sysadmin',
        username: 'systemadmin',
        fullName: 'مدير النظام الشامل',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        schoolId: '',
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
        sessionToken: 'valid-token',
      };
      storageService.setCurrentUser(sysAdmin);

      const res = await storageService.switchActiveSchool('SCH-FORBIDDEN');
      expect(res.success).toBe(false);
      expect(res.code).toBe('ACCESS_DENIED_SCHOOL_SCOPE');
    });
  });

  // -------------------------------------------------------------
  // 7. BACKEND SERVICE EMULATION (backendAuthService.ts)
  // -------------------------------------------------------------
  describe('7. Backend Engine Emulation (backendAuthService.ts)', () => {
    it('switchActiveSchoolBackend executes authoritative switch with audit logging', () => {
      const sysAdminSession: ServerSession = {
        sessionToken: 'token-sysadmin-mock',
        userId: 'usr-sys-1',
        email: 'sysadmin@ntss.edu.eg',
        role: 'SystemAdmin',
        accessScope: 'GLOBAL',
        schoolId: '',
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        status: 'Active',
      };

      const result = switchActiveSchoolBackend(sysAdminSession, 'SCH-DAMIETTA', 'REQ_TEST_EMU_1');
      expect(result.success).toBe(true);
      expect(result.user?.activeSchoolId).toBe('SCH-DAMIETTA');
      expect(sysAdminSession.activeSchoolId).toBe('SCH-DAMIETTA');

      const audits = getSecurityAuditLogs();
      const switchAudit = audits.find(a => a.action === 'SCHOOL_CONTEXT_SWITCH');
      expect(switchAudit).toBeDefined();
      expect(switchAudit?.targetSchoolId).toBe('SCH-DAMIETTA');
      expect(switchAudit?.actorSchoolId).toBe('SCH-BADR');
    });

    it('switchActiveSchoolBackend rejects non-SystemAdmin sessions', () => {
      const teacherSession: ServerSession = {
        sessionToken: 'token-teacher-mock',
        userId: 'usr-tch-1',
        role: 'Teacher',
        accessScope: 'SELF',
        schoolId: 'SCH-BADR',
        activeSchoolId: 'SCH-BADR',
        allowedSchoolIds: ['SCH-BADR'],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        status: 'Active',
      };

      const result = switchActiveSchoolBackend(teacherSession, 'SCH-DAMIETTA');
      expect(result.success).toBe(false);
      expect(result.code).toBe('SCHOOL_SWITCH_NOT_ALLOWED');
    });
  });
});
