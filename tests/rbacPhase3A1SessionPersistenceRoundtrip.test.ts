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
      setBackground: () => {},
    };
  }

  appendRow(arr: any[]) {
    this.rows.push([...arr]);
  }
}

function createGasTestEnv() {
  const codeGsPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');
  const codeContent = fs.readFileSync(codeGsPath, 'utf8');

  const sheets: Record<string, MockGasSheet> = {
    Users: new MockGasSheet('Users', [
      'id', 'username', 'passwordHash', 'passwordSalt', 'passwordAlgorithm', 'passwordIterations',
      'fullName', 'role', 'status', 'department', 'email', 'schoolId', 'allowedSchoolIds',
      'employeeId', 'createdAt', 'lastLogin', 'passwordChangedAt',
    ]),
    Sessions: new MockGasSheet('Sessions', [
      'sessionId', 'tokenHash', 'userId', 'username', 'fullName', 'role', 'schoolId',
      'email', 'accessScope', 'allowedSchoolIds', 'activeSchoolId', 'employeeId',
      'createdAt', 'expiresAt', 'status',
    ]),
    Master_Schools: new MockGasSheet('Master_Schools', [
      'schoolId', 'schoolCode', 'schoolName', 'spreadsheetId', 'status', 'createdAt', 'updatedAt',
    ], [
      ['SCH-BADR', 'BADR', 'مدرسة بدر الإعدادية بنين', 'ss-badr', 'Active', '', ''],
      ['SCH-ALNOOR', 'ALNOOR', 'مدرسة النور الثانوية بنات', 'ss-noor', 'Active', '', ''],
    ]),
    Audit_Logs: new MockGasSheet('Audit_Logs', [
      'id', 'timestamp', 'username', 'userRole', 'action', 'entity', 'targetId', 'details', 'requestId',
    ]),
  };

  const schoolSpreadsheet = {
    getId: () => 'ss-badr',
    getSheetByName: (name: string) => {
      if (!sheets['School_' + name]) {
        sheets['School_' + name] = new MockGasSheet(name, [
          'sessionId', 'tokenHash', 'userId', 'username', 'fullName', 'role', 'schoolId',
          'email', 'accessScope', 'allowedSchoolIds', 'activeSchoolId', 'employeeId',
          'createdAt', 'expiresAt', 'status',
        ]);
      }
      return sheets['School_' + name];
    },
    insertSheet: (name: string) => {
      const s = new MockGasSheet(name, []);
      sheets['School_' + name] = s;
      return s;
    },
  };

  const masterSs = {
    getId: () => 'master-ss',
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
      getActiveSpreadsheet: () => masterSs,
      openById: (id: string) => (id === 'ss-badr' ? schoolSpreadsheet : masterSs),
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

  // Hook getSchoolSpreadsheet to return schoolSpreadsheet
  context.getSchoolSpreadsheet = (schoolId: string, mSs: any) => {
    return schoolSpreadsheet;
  };

  const computeHash = (password: string, salt: string) => {
    return context.computeSaltedHash(password, salt, 10000);
  };

  const addUser = (userData: {
    id: string;
    username: string;
    email: string;
    password: string;
    fullName: string;
    role: string;
    schoolId?: string;
    allowedSchoolIds?: string[];
    employeeId?: string;
    status?: string;
  }) => {
    const salt = 'salt_' + Math.random().toString(36).substring(2, 8);
    const hash = computeHash(userData.password, salt);
    sheets.Users.appendRow([
      userData.id,
      userData.username,
      hash,
      salt,
      'PBKDF2-HMAC-SHA256',
      10000,
      userData.fullName,
      userData.role,
      userData.status || 'Active',
      'الإدارة',
      userData.email,
      userData.schoolId || '',
      userData.allowedSchoolIds ? JSON.stringify(userData.allowedSchoolIds) : '',
      userData.employeeId || '',
      new Date().toISOString(),
      '',
      '',
    ]);
  };

  return { context, masterSs, schoolSpreadsheet, sheets, addUser, computeHash, codeContent };
}

describe('PHASE 3A.1 — FIX SESSION PERSISTENCE ROUNDTRIP', () => {
  it('1. SchoolAdmin: Login -> Header-Safe Persistence -> validateSessionToken Roundtrip', () => {
    const { context, masterSs, sheets, addUser } = createGasTestEnv();

    addUser({
      id: 'USR-SA-BADR',
      username: 'admin_badr',
      email: 'admin.badr@ntss.edu.eg',
      password: 'AdminPassword123!',
      fullName: 'أحمد محمود مصطفى',
      role: 'SchoolAdmin',
      schoolId: 'SCH-BADR',
    });

    const loginRes = context.handleStaffLogin(masterSs, 'admin.badr@ntss.edu.eg', 'AdminPassword123!', 'REQ_SA_1');
    expect(loginRes.success).toBe(true);
    expect(loginRes.sessionToken).toBeDefined();

    const sessionsSheet = sheets.Sessions;
    expect(sessionsSheet.rows.length).toBe(1);

    const headers = sessionsSheet.headers;
    const row = sessionsSheet.rows[0];
    const getVal = (header: string) => row[headers.indexOf(header)];

    // Check all headers are strictly populated with correct values
    expect(getVal('sessionId')).toMatch(/^SESS_/);
    expect(getVal('tokenHash')).toBe(context.hashStringSHA256(loginRes.sessionToken));
    expect(getVal('userId')).toBe('USR-SA-BADR');
    expect(getVal('username')).toBe('admin_badr');
    expect(getVal('fullName')).toBe('أحمد محمود مصطفى');
    expect(getVal('role')).toBe('SchoolAdmin');
    expect(getVal('schoolId')).toBe('SCH-BADR');
    expect(getVal('email')).toBe('admin.badr@ntss.edu.eg');
    expect(getVal('accessScope')).toBe('SCHOOL');
    expect(getVal('allowedSchoolIds')).toBe('["SCH-BADR"]');
    expect(getVal('activeSchoolId')).toBe('SCH-BADR');
    expect(getVal('employeeId')).toBe('');
    expect(new Date(getVal('createdAt')).getTime()).toBeGreaterThan(0);
    expect(new Date(getVal('expiresAt')).getTime()).toBeGreaterThan(Date.now());
    expect(getVal('status')).toBe('ACTIVE');

    // validateSessionToken Roundtrip
    const valRes = context.validateSessionToken(masterSs, loginRes.sessionToken);
    expect(valRes.valid).toBe(true);
    expect(valRes.session.userId).toBe('USR-SA-BADR');
    expect(valRes.session.role).toBe('SchoolAdmin');
    expect(valRes.session.accessScope).toBe('SCHOOL');
    expect(valRes.session.schoolId).toBe('SCH-BADR');
    expect(valRes.session.activeSchoolId).toBe('SCH-BADR');
    expect(valRes.session.allowedSchoolIds).toEqual(['SCH-BADR']);
    expect(valRes.session.email).toBe('admin.badr@ntss.edu.eg');
    expect(valRes.session.status).toBe('Active');
    expect(new Date(valRes.session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('2. AdministrativeEmployee (SELF): Roundtrip enforces employeeId and schoolId', () => {
    const { context, masterSs, sheets, addUser } = createGasTestEnv();

    addUser({
      id: 'USR-EMP-01',
      username: 'clerk_ali',
      email: 'ali.clerk@ntss.edu.eg',
      password: 'ClerkPassword123!',
      fullName: 'علي حسن',
      role: 'AdministrativeEmployee',
      schoolId: 'SCH-BADR',
      employeeId: 'EMP-9988',
    });

    const loginRes = context.handleStaffLogin(masterSs, 'ali.clerk@ntss.edu.eg', 'ClerkPassword123!', 'REQ_EMP_1');
    expect(loginRes.success).toBe(true);

    const sessionsSheet = sheets.Sessions;
    const headers = sessionsSheet.headers;
    const row = sessionsSheet.rows[0];
    const getVal = (header: string) => row[headers.indexOf(header)];

    expect(getVal('role')).toBe('AdministrativeEmployee');
    expect(getVal('accessScope')).toBe('SELF');
    expect(getVal('schoolId')).toBe('SCH-BADR');
    expect(getVal('activeSchoolId')).toBe('SCH-BADR');
    expect(getVal('employeeId')).toBe('EMP-9988');
    expect(getVal('status')).toBe('ACTIVE');

    // Validate token roundtrip
    const valRes = context.validateSessionToken(masterSs, loginRes.sessionToken);
    expect(valRes.valid).toBe(true);
    expect(valRes.session.accessScope).toBe('SELF');
    expect(valRes.session.schoolId).toBe('SCH-BADR');
    expect(valRes.session.activeSchoolId).toBe('SCH-BADR');
    expect(valRes.session.employeeId).toBe('EMP-9988');
  });

  it('3. SystemAdmin with Single School: activeSchoolId and schoolId set to that school', () => {
    const { context, masterSs, sheets, addUser } = createGasTestEnv();

    addUser({
      id: 'USR-SYS-SINGLE',
      username: 'sys_single',
      email: 'sys.single@gov.eg',
      password: 'SysPassword123!',
      fullName: 'مدير نظام بدر',
      role: 'SystemAdmin',
      allowedSchoolIds: ['SCH-BADR'],
    });

    const loginRes = context.handleStaffLogin(masterSs, 'sys.single@gov.eg', 'SysPassword123!', 'REQ_SYS_1');
    expect(loginRes.success).toBe(true);

    const sessionsSheet = sheets.Sessions;
    const headers = sessionsSheet.headers;
    const row = sessionsSheet.rows[0];
    const getVal = (header: string) => row[headers.indexOf(header)];

    expect(getVal('role')).toBe('SystemAdmin');
    expect(getVal('accessScope')).toBe('GLOBAL');
    expect(getVal('allowedSchoolIds')).toBe('["SCH-BADR"]');
    expect(getVal('activeSchoolId')).toBe('SCH-BADR');
    expect(getVal('schoolId')).toBe('SCH-BADR');

    // Validate token roundtrip
    const valRes = context.validateSessionToken(masterSs, loginRes.sessionToken);
    expect(valRes.valid).toBe(true);
    expect(valRes.session.accessScope).toBe('GLOBAL');
    expect(valRes.session.allowedSchoolIds).toEqual(['SCH-BADR']);
    expect(valRes.session.activeSchoolId).toBe('SCH-BADR');
    expect(valRes.session.schoolId).toBe('SCH-BADR');
  });

  it('4. SystemAdmin with Multiple Schools: activeSchoolId is empty, schoolId is empty, session remains valid', () => {
    const { context, masterSs, sheets, addUser } = createGasTestEnv();

    addUser({
      id: 'USR-SYS-MULTI',
      username: 'sys_multi',
      email: 'sys.multi@gov.eg',
      password: 'SysMultiPassword123!',
      fullName: 'مدير النظام العام متعدد المدارس',
      role: 'SystemAdmin',
      allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'],
    });

    const loginRes = context.handleStaffLogin(masterSs, 'sys.multi@gov.eg', 'SysMultiPassword123!', 'REQ_SYS_2');
    expect(loginRes.success).toBe(true);

    const sessionsSheet = sheets.Sessions;
    const headers = sessionsSheet.headers;
    const row = sessionsSheet.rows[0];
    const getVal = (header: string) => row[headers.indexOf(header)];

    expect(getVal('role')).toBe('SystemAdmin');
    expect(getVal('accessScope')).toBe('GLOBAL');
    expect(getVal('allowedSchoolIds')).toBe('["SCH-BADR","SCH-ALNOOR"]');
    expect(getVal('activeSchoolId')).toBe('');
    expect(getVal('schoolId')).toBe('');

    // Validate token roundtrip
    const valRes = context.validateSessionToken(masterSs, loginRes.sessionToken);
    expect(valRes.valid).toBe(true);
    expect(valRes.session.role).toBe('SystemAdmin');
    expect(valRes.session.accessScope).toBe('GLOBAL');
    expect(valRes.session.allowedSchoolIds).toEqual(['SCH-BADR', 'SCH-ALNOOR']);
    expect(valRes.session.activeSchoolId).toBe('');
    expect(valRes.session.schoolId).toBe('');
  });

  it('5. School Sessions Sheet gets identical header-safe record', () => {
    const { context, masterSs, sheets, addUser } = createGasTestEnv();

    addUser({
      id: 'USR-SA-2',
      username: 'director_badr',
      email: 'dir.badr@ntss.edu.eg',
      password: 'DirPassword123!',
      fullName: 'ناظر مدرسة بدر',
      role: 'SchoolDirector',
      schoolId: 'SCH-BADR',
    });

    const loginRes = context.handleStaffLogin(masterSs, 'dir.badr@ntss.edu.eg', 'DirPassword123!', 'REQ_DIR_1');
    expect(loginRes.success).toBe(true);

    const schoolSessionsSheet = sheets['School_Sessions'];
    expect(schoolSessionsSheet).toBeDefined();
    expect(schoolSessionsSheet.rows.length).toBe(1);

    const headers = schoolSessionsSheet.headers;
    const row = schoolSessionsSheet.rows[0];
    const getVal = (header: string) => row[headers.indexOf(header)];

    expect(getVal('email')).toBe('dir.badr@ntss.edu.eg');
    expect(getVal('role')).toBe('SchoolDirector');
    expect(getVal('accessScope')).toBe('SCHOOL');
    expect(getVal('schoolId')).toBe('SCH-BADR');
    expect(getVal('status')).toBe('ACTIVE');
    expect(new Date(getVal('expiresAt')).getTime()).toBeGreaterThan(Date.now());
  });

  it('6. Regression Prevention: Source code forbids positional 10-column sessionRow write in handleStaffLogin', () => {
    const { codeContent } = createGasTestEnv();

    // Check that handleStaffLogin does NOT use positional 10-column sessionRow
    const staffLoginSection = codeContent.substring(
      codeContent.indexOf('function handleStaffLogin'),
      codeContent.indexOf('function handleTeacherLogin')
    );

    expect(staffLoginSection).not.toContain('var sessionRow = [');
    expect(staffLoginSection).toContain('appendRecordByHeaders(sessionsSheet, sessionRecord)');
    expect(staffLoginSection).toContain('ensureSessionHeaders(sessionsSheet)');
  });
});
