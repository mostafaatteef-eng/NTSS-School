import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { storageService } from '../src/services/storageService';
import { User } from '../src/types';

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

  appendRow(rowArr: any[]) {
    this.rows.push([...rowArr]);
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

  context.getSchoolSpreadsheet = (schoolId: string, mSs: any) => schoolSpreadsheet;

  // Seed Users
  const salt1 = 'salt_admin_123';
  const hash1 = context.computeSaltedHash('CorrectPassword123!', salt1, 10000);

  const salt2 = 'salt_sysadmin_123';
  const hash2 = context.computeSaltedHash('SysAdminPassword123!', salt2, 10000);

  sheets.Users.appendRow([
    'USR-SA1', 'admin_badr', hash1, salt1, 'PBKDF2_SHA256', 10000,
    'مدير بدر', 'SchoolAdmin', 'Active', 'Administration', 'admin@badr.edu.eg', 'SCH-BADR', '',
    'EMP-01', '2026-01-01', '', '',
  ]);

  sheets.Users.appendRow([
    'USR-SYS1', 'sysadmin', hash2, salt2, 'PBKDF2_SHA256', 10000,
    'مدير النظام الشامل', 'SystemAdmin', 'Active', 'Central IT', 'sysadmin@moe.edu.eg', '', JSON.stringify(['SCH-BADR', 'SCH-ALNOOR']),
    '', '2026-01-01', '', '',
  ]);

  return { context, sheets, masterSs };
}

describe('PHASE 3B.1 — SESSION LIFECYCLE FAIL-CLOSED FIX', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      'ntss_settings',
      JSON.stringify({ googleAppsScriptUrl: 'https://script.google.com/macros/s/AKfycbytest1234567890/exec' })
    );
    storageService.setCurrentUser(null);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. SchoolAdmin validateSession => success + valid=true with safe user context', () => {
    const { context } = createGasTestEnv();

    // 1. Login as SchoolAdmin
    const loginPostEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'login',
          email: 'admin@badr.edu.eg',
          password: 'CorrectPassword123!',
        }),
      },
    };
    const loginRes = JSON.parse(context.doPost(loginPostEvent).getContent());
    expect(loginRes.status).toBe('success');
    expect(loginRes.sessionToken).toBeTruthy();

    const token = loginRes.sessionToken;

    // 2. Validate session
    const valPostEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'validateSession',
          sessionToken: token,
        }),
      },
    };
    const valRes = JSON.parse(context.doPost(valPostEvent).getContent());
    expect(valRes.status).toBe('success');
    expect(valRes.valid).toBe(true);
    expect(valRes.user).toBeDefined();
    expect(valRes.user.id).toBe('USR-SA1');
    expect(valRes.user.email).toBe('admin@badr.edu.eg');
    expect(valRes.user.role).toBe('SchoolAdmin');
    expect(valRes.user.schoolId).toBe('SCH-BADR');
  });

  it('2. SystemAdmin GLOBAL with activeSchoolId="" validates successfully without active school', () => {
    const { context } = createGasTestEnv();

    // 1. Login as multi-school SystemAdmin
    const loginPostEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'login',
          email: 'sysadmin@moe.edu.eg',
          password: 'SysAdminPassword123!',
        }),
      },
    };
    const loginRes = JSON.parse(context.doPost(loginPostEvent).getContent());
    expect(loginRes.status).toBe('success');
    expect(loginRes.user.accessScope).toBe('GLOBAL');
    expect(loginRes.user.activeSchoolId).toBe('');

    const token = loginRes.sessionToken;

    // 2. Validate session (must NOT fail or require active school)
    const valPostEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'validateSession',
          sessionToken: token,
        }),
      },
    };
    const valRes = JSON.parse(context.doPost(valPostEvent).getContent());
    expect(valRes.status).toBe('success');
    expect(valRes.valid).toBe(true);
    expect(valRes.user.accessScope).toBe('GLOBAL');
    expect(valRes.user.activeSchoolId).toBe('');
    expect(valRes.user.allowedSchoolIds).toEqual(['SCH-BADR', 'SCH-ALNOOR']);
  });

  it('3. SystemAdmin multi-school logout succeeds without choosing a school', () => {
    const { context } = createGasTestEnv();

    // Login as multi-school SystemAdmin
    const loginPostEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'login',
          email: 'sysadmin@moe.edu.eg',
          password: 'SysAdminPassword123!',
        }),
      },
    };
    const loginRes = JSON.parse(context.doPost(loginPostEvent).getContent());
    const token = loginRes.sessionToken;

    // Logout without schoolId / activeSchoolId
    const logoutPostEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'logout',
          sessionToken: token,
        }),
      },
    };
    const logoutRes = JSON.parse(context.doPost(logoutPostEvent).getContent());
    expect(logoutRes.status).toBe('success');
  });

  it('4. After logout: the same token fails validation (SESSION_REVOKED)', () => {
    const { context } = createGasTestEnv();

    // Login
    const loginPostEvent = {
      postData: {
        contents: JSON.stringify({
          action: 'login',
          email: 'admin@badr.edu.eg',
          password: 'CorrectPassword123!',
        }),
      },
    };
    const loginRes = JSON.parse(context.doPost(loginPostEvent).getContent());
    const token = loginRes.sessionToken;

    // Logout
    context.doPost({
      postData: { contents: JSON.stringify({ action: 'logout', sessionToken: token }) },
    });

    // Validate token after logout
    const valRes = JSON.parse(context.doPost({
      postData: { contents: JSON.stringify({ action: 'validateSession', sessionToken: token }) },
    }).getContent());

    expect(valRes.status).toBe('error');
    expect(valRes.code).toBe('SESSION_REVOKED');
  });

  it('5. Invalid token fails validation with 401 status error', () => {
    const { context } = createGasTestEnv();

    const valRes = JSON.parse(context.doPost({
      postData: { contents: JSON.stringify({ action: 'validateSession', sessionToken: 'INVALID_NON_EXISTENT_TOKEN' }) },
    }).getContent());

    expect(valRes.status).toBe('error');
    expect(valRes.valid).toBeUndefined();
  });

  it('6. Frontend: status="error" and code="ACCESS_DENIED_SCHOOL_SCOPE" returns false (fail-closed)', async () => {
    const testUser: User = {
      id: 'U-1',
      fullName: 'مدير',
      role: 'SchoolAdmin',
      sessionToken: 'TOKEN_ACCESS_DENIED_TEST',
    };
    storageService.setCurrentUser(testUser);

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'error',
        code: 'ACCESS_DENIED_SCHOOL_SCOPE',
        message: 'School scope denied',
      }),
    })) as any;

    const isValid = await storageService.validateSessionWithBackend(testUser);
    expect(isValid).toBe(false);
    expect(storageService.getCurrentUser()).toBeNull();
  });

  it('7. Frontend: status="error" and code="UNKNOWN_ERROR" returns false', async () => {
    const testUser: User = {
      id: 'U-1',
      fullName: 'مدير',
      role: 'SchoolAdmin',
      sessionToken: 'TOKEN_UNKNOWN_ERROR_TEST',
    };
    storageService.setCurrentUser(testUser);

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'error',
        code: 'UNKNOWN_ERROR',
        message: 'Something unexpected occurred on backend',
      }),
    })) as any;

    const isValid = await storageService.validateSessionWithBackend(testUser);
    expect(isValid).toBe(false);
    expect(storageService.getCurrentUser()).toBeNull();
  });

  it('8. Frontend: status="success" but valid=false returns false', async () => {
    const testUser: User = {
      id: 'U-1',
      fullName: 'مدير',
      role: 'SchoolAdmin',
      sessionToken: 'TOKEN_VALID_FALSE_TEST',
    };
    storageService.setCurrentUser(testUser);

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        valid: false,
      }),
    })) as any;

    const isValid = await storageService.validateSessionWithBackend(testUser);
    expect(isValid).toBe(false);
    expect(storageService.getCurrentUser()).toBeNull();
  });

  it('9. Frontend: status="success" and valid=true returns true and refreshes context', async () => {
    const testUser: User = {
      id: 'U-1',
      fullName: 'مدير',
      role: 'SchoolAdmin',
      schoolId: 'SCH-OLD',
      sessionToken: 'TOKEN_VALID_TRUE_TEST',
    };
    storageService.setCurrentUser(testUser);

    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        valid: true,
        expiresAt: '2026-12-31T23:59:59.000Z',
        user: {
          id: 'U-1',
          email: 'admin@badr.edu.eg',
          fullName: 'مدير بدر المحدث',
          role: 'SchoolAdmin',
          accessScope: 'SCHOOL',
          schoolId: 'SCH-BADR',
          activeSchoolId: 'SCH-BADR',
        },
      }),
    })) as any;

    const isValid = await storageService.validateSessionWithBackend(testUser);
    expect(isValid).toBe(true);

    const currentUser = storageService.getCurrentUser();
    expect(currentUser).not.toBeNull();
    expect(currentUser?.schoolId).toBe('SCH-BADR');
    expect(currentUser?.fullName).toBe('مدير بدر المحدث');
    expect(currentUser?.sessionToken).toBe('TOKEN_VALID_TRUE_TEST'); // Local token preserved
  });

  it('10. validateSession does not send or return secrets (tokenHash, password, passwordSalt, spreadsheetId)', () => {
    const { context } = createGasTestEnv();

    const loginRes = JSON.parse(context.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'login',
          email: 'admin@badr.edu.eg',
          password: 'CorrectPassword123!',
        }),
      },
    }).getContent());

    const token = loginRes.sessionToken;

    const valRes = JSON.parse(context.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'validateSession',
          sessionToken: token,
        }),
      },
    }).getContent());

    expect(valRes.status).toBe('success');
    expect(valRes.valid).toBe(true);
    expect(valRes.tokenHash).toBeUndefined();
    expect(valRes.password).toBeUndefined();
    expect(valRes.passwordHash).toBeUndefined();
    expect(valRes.passwordSalt).toBeUndefined();
    expect(valRes.spreadsheetId).toBeUndefined();

    if (valRes.user) {
      expect(valRes.user.sessionToken).toBeUndefined();
      expect(valRes.user.tokenHash).toBeUndefined();
      expect(valRes.user.password).toBeUndefined();
      expect(valRes.user.passwordHash).toBeUndefined();
      expect(valRes.user.passwordSalt).toBeUndefined();
      expect(valRes.user.spreadsheetId).toBeUndefined();
    }
  });
});
