import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

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
  getLastRow() { return this.rows.length + 1; }

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
      deleteRow: (rowIdx: number) => {
        this.rows.splice(rowIdx - 2, 1);
      },
      setBackground: () => {},
    };
  }

  appendRow(arr: any[]) {
    this.rows.push([...arr]);
  }
}

function createTeacherTestEnv() {
  const codeGsPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');
  const codeContent = fs.readFileSync(codeGsPath, 'utf8');

  const sheets: Record<string, MockGasSheet> = {
    Teacher_Credentials: new MockGasSheet('Teacher_Credentials', [
      'employeeId', 'teacherId', 'username', 'teacherCode', 'fullName', 'schoolId',
      'passwordHash', 'passwordSalt', 'passwordAlgorithm', 'passwordIterations',
      'status', 'accountStatus', 'mustChangePassword', 'failedLoginAttempts',
      'lockedUntil', 'legacyPinRetired', 'migrationVersion', 'updatedAt',
    ]),
    Teacher_Sessions: new MockGasSheet('Teacher_Sessions', [
      'sessionId', 'tokenHash', 'teacherId', 'employeeId', 'teacherCode', 'teacherName',
      'schoolId', 'createdAt', 'expiresAt', 'status',
    ]),
    Employees: new MockGasSheet('Employees', [
      'id', 'name', 'teacherCode', 'schoolId', 'status',
    ], [
      ['EMP-T101', 'أحمد إبراهيم', 'TC-101', 'SCH-BADR', 'Active'],
      ['EMP-T102', 'خالد عبد الرحمن', 'TC-102', 'SCH-BADR', 'Active'],
    ]),
    Master_Schools: new MockGasSheet('Master_Schools', [
      'schoolId', 'schoolCode', 'schoolName', 'spreadsheetId', 'status', 'createdAt', 'updatedAt',
    ], [
      ['SCH-BADR', 'BADR', 'مدرسة بدر الإعدادية بنين', 'ss-badr', 'Active', '', ''],
    ]),
    Audit_Logs: new MockGasSheet('Audit_Logs', [
      'id', 'timestamp', 'username', 'userRole', 'action', 'entity', 'targetId', 'details', 'requestId',
    ]),
  };

  const ss = {
    getId: () => 'ss-badr',
    getSheetByName: (name: string) => sheets[name] || null,
    insertSheet: (name: string) => {
      const s = new MockGasSheet(name, []);
      sheets[name] = s;
      return s;
    },
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
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: (id: string) => ss,
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
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s: string) => ({ getContent: () => s, setMimeType: () => ({ getContent: () => s }) }),
    },
    Logger: { log: () => {} },
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(codeContent, context);

  // Hook getSchoolSpreadsheet to return ss
  context.getSchoolSpreadsheet = () => ss;

  const addTeacher = (data: {
    employeeId: string;
    username: string;
    teacherCode: string;
    fullName: string;
    schoolId: string;
    password: string;
    mustChangePassword?: boolean;
  }) => {
    const salt = 'salt_' + Math.random().toString(36).substring(2, 8);
    const hash = context.computeSaltedHash(data.password, salt, 10000);
    sheets.Teacher_Credentials.appendRow([
      data.employeeId,
      data.employeeId,
      data.username,
      data.teacherCode,
      data.fullName,
      data.schoolId,
      hash,
      salt,
      'PBKDF2-HMAC-SHA256',
      10000,
      'Active',
      'Active',
      data.mustChangePassword ? true : false,
      0,
      '',
      true,
      'MIG_SCOPE_013',
      new Date().toISOString(),
    ]);
  };

  return { context, ss, sheets, addTeacher, codeContent };
}

describe('PHASE 3A.2 — TEACHER SESSION PERSISTENCE FIX', () => {
  it('1. Teacher login -> valid session -> change password -> new teacherSessionToken -> roundtrip validation', () => {
    const { context, ss, sheets, addTeacher } = createTeacherTestEnv();

    addTeacher({
      employeeId: 'EMP-T101',
      username: 'teacher_ahmed',
      teacherCode: 'TC-101',
      fullName: 'أحمد إبراهيم',
      schoolId: 'SCH-BADR',
      password: 'OldPassword123!',
      mustChangePassword: true,
    });

    // 1. Teacher Login
    const loginRes = context.handleTeacherLogin(ss, 'teacher_ahmed', 'OldPassword123!', 'REQ_TLOGIN_1', 'SCH-BADR');
    expect(loginRes.success).toBe(true);
    expect(loginRes.teacherSessionToken).toBeDefined();

    // Verify Teacher_Sessions row after login
    const tSessionsSheet = sheets.Teacher_Sessions;
    expect(tSessionsSheet.rows.length).toBe(1);
    const headers = tSessionsSheet.headers;
    const loginSessionRow = tSessionsSheet.rows[0];
    const getLoginVal = (header: string) => loginSessionRow[headers.indexOf(header)];

    expect(getLoginVal('sessionId')).toMatch(/^TSESS_/);
    expect(getLoginVal('teacherId')).toBe('EMP-T101');
    expect(getLoginVal('employeeId')).toBe('EMP-T101');
    expect(getLoginVal('teacherCode')).toBe('TC-101');
    expect(getLoginVal('teacherName')).toBe('أحمد إبراهيم');
    expect(getLoginVal('schoolId')).toBe('SCH-BADR');
    expect(new Date(getLoginVal('expiresAt')).getTime()).toBeGreaterThan(Date.now());
    expect(getLoginVal('status')).toBe('ACTIVE');

    // Validate initial session token
    const initialVal = context.validateTeacherSessionToken(ss, loginRes.teacherSessionToken);
    expect(initialVal.valid).toBe(true);
    expect(initialVal.session.schoolId).toBe('SCH-BADR');
    expect(initialVal.session.teacherId).toBe('EMP-T101');
    expect(initialVal.session.employeeId).toBe('EMP-T101');

    // 2. Change Teacher Password with current token
    const changeRes = context.changeTeacherPassword(ss, loginRes.teacherSessionToken, 'NewPassword456!#', 'REQ_TPASS_1');
    expect(changeRes.success).toBe(true);
    expect(changeRes.teacherSessionToken).toBeDefined();
    expect(changeRes.teacherSessionToken).not.toBe(loginRes.teacherSessionToken);

    // Old session should be revoked
    const oldVal = context.validateTeacherSessionToken(ss, loginRes.teacherSessionToken);
    expect(oldVal.valid).toBe(false);

    // 3. Validate new teacherSessionToken roundtrip
    const newVal = context.validateTeacherSessionToken(ss, changeRes.teacherSessionToken);
    expect(newVal.valid).toBe(true);
    expect(newVal.session.schoolId).toBe('SCH-BADR');
    expect(newVal.session.teacherId).toBe('EMP-T101');
    expect(newVal.session.employeeId).toBe('EMP-T101');
    expect(newVal.session.teacherCode).toBe('TC-101');
    expect(newVal.session.teacherName).toBe('أحمد إبراهيم');
    expect(newVal.session.status).toBe('Active');
    expect(new Date(newVal.session.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // Verify newly persisted session row in sheet
    const newSessionRow = tSessionsSheet.rows.find(r => r[headers.indexOf('tokenHash')] === context.hashStringSHA256(changeRes.teacherSessionToken));
    expect(newSessionRow).toBeDefined();
    const getNewVal = (header: string) => newSessionRow![headers.indexOf(header)];
    expect(getNewVal('schoolId')).toBe('SCH-BADR');
    expect(getNewVal('status')).toBe('ACTIVE');
    expect(getNewVal('teacherId')).toBe('EMP-T101');
    expect(getNewVal('employeeId')).toBe('EMP-T101');
  });

  it('2. changeTeacherPassword: fails closed if schoolId is missing in current session (SCHOOL_CONTEXT_REQUIRED)', () => {
    const { context, ss, sheets, addTeacher } = createTeacherTestEnv();

    addTeacher({
      employeeId: 'EMP-T102',
      username: 'teacher_khaled',
      teacherCode: 'TC-102',
      fullName: 'خالد عبد الرحمن',
      schoolId: 'SCH-BADR',
      password: 'OldPassword123!',
    });

    // Create a malformed legacy session directly in sheet WITHOUT schoolId
    const token = 'MALFORMED_SESSION_TOKEN_1234567890';
    const tokenHash = context.hashStringSHA256(token);
    sheets.Teacher_Sessions.appendRow([
      'TSESS_MALFORMED',
      tokenHash,
      'EMP-T102',
      'EMP-T102',
      'TC-102',
      'خالد عبد الرحمن',
      '', // schoolId missing!
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
      'ACTIVE',
    ]);

    const changeRes = context.changeTeacherPassword(ss, token, 'NewSecurePassword789!', 'REQ_FAIL_1');
    expect(changeRes.success).toBe(false);
    expect(changeRes.code).toBe('SCHOOL_CONTEXT_REQUIRED');
  });

  it('3. Regression: Positional sessionRow write is completely removed from Teacher Session flows', () => {
    const { codeContent } = createTeacherTestEnv();

    // Must not contain any sessionRow
    expect(codeContent).not.toContain('var sessionRow = [');
    expect(codeContent).not.toContain('sessionRow');

    // Both flows must call appendRecordByHeaders and ensureTeacherSessionHeaders
    const handleLoginSection = codeContent.substring(
      codeContent.indexOf('function handleTeacherLogin'),
      codeContent.indexOf('function validateTeacherSessionToken')
    );
    expect(handleLoginSection).toContain('ensureTeacherSessionHeaders');
    expect(handleLoginSection).toContain('appendRecordByHeaders');

    const changePassSection = codeContent.substring(
      codeContent.indexOf('function changeTeacherPassword'),
      codeContent.indexOf('function runMigrationScope013RetireTeacherPin')
    );
    expect(changePassSection).toContain('ensureTeacherSessionHeaders');
    expect(changePassSection).toContain('appendRecordByHeaders');
  });
});
