import { describe, it, expect, beforeEach } from 'vitest';
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

interface ScriptPropertiesStore {
  [key: string]: string;
}

function createGasTestEnv(options: {
  properties?: ScriptPropertiesStore;
  failingSpreadsheetIds?: string[];
  initialUsers?: any[][];
  initialSchools?: any[][];
} = {}) {
  const codeGsPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');
  const codeContent = fs.readFileSync(codeGsPath, 'utf8');

  const propertiesStore: ScriptPropertiesStore = { ...(options.properties || {}) };

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
    ]),
    Teacher_Sessions: new MockGasSheet('Teacher_Sessions', [
      'sessionId', 'tokenHash', 'teacherId', 'employeeId', 'teacherCode', 'teacherName',
      'schoolId', 'createdAt', 'expiresAt', 'status',
    ]),
    Master_Schools: new MockGasSheet('Master_Schools', [
      'schoolId', 'schoolCode', 'schoolName', 'spreadsheetId', 'status', 'createdAt', 'updatedAt',
    ], options.initialSchools || []),
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
        getProperty: (k: string) => propertiesStore[k] || null,
        setProperty: (k: string, v: string) => { propertiesStore[k] = v; },
        deleteProperty: (k: string) => { delete propertiesStore[k]; },
        getProperties: () => ({ ...propertiesStore }),
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => masterSs,
      openById: (id: string) => {
        if (!id || !id.trim()) {
          throw new Error('SpreadsheetApp.openById: invalid ID');
        }
        if (options.failingSpreadsheetIds && options.failingSpreadsheetIds.includes(id)) {
          throw new Error('SpreadsheetApp.openById: spreadsheet not reachable ' + id);
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

  return { context, sheets, masterSs, propertiesStore, logs };
}

describe('PHASE 3C-A1.1 — SECURE MANUAL SYSTEM PROVISIONING', () => {
  // 1. provisioning function NOT in doPost routing / doGet routing
  it('1. provisioning function is NOT in doPost routing or doGet routing', () => {
    const { context } = createGasTestEnv();

    // Call doPost with action = 'provisionInitialSystemFromScriptProperties'
    const postRes = context.doPost({
      postData: {
        contents: JSON.stringify({ action: 'provisionInitialSystemFromScriptProperties' }),
      },
    });
    const postBody = JSON.parse(postRes.getContent());
    expect(postBody.status).not.toBe('success');
    expect(postBody.error || postBody.code).toBeDefined();

    // Call doGet with action = 'provisionInitialSystemFromScriptProperties'
    const getRes = context.doGet({
      parameter: { action: 'provisionInitialSystemFromScriptProperties' },
    });
    const getBody = JSON.parse(getRes.getContent());
    expect(getBody.status).not.toBe('success');
  });

  // 2. missing properties => fail closed
  it('2. missing properties => fails closed without partial data', () => {
    const { context, sheets } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: 'admin@badr.edu.eg',
        // INITIAL_ADMIN_PASSWORD is missing!
        BADR_SPREADSHEET_ID: 'badr-sheet-id-123',
        DAMIETTA_SPREADSHEET_ID: 'damietta-sheet-id-456',
      },
    });

    const result = context.provisionInitialSystemFromScriptProperties();
    expect(result.success).toBe(false);
    expect(result.code).toBe('MISSING_PROPERTIES');

    // Verify no user created and no school created
    expect(sheets.Users.rows.length).toBe(0);
    expect(sheets.Master_Schools.rows.length).toBe(0);
  });

  // 3. invalid Spreadsheet ID => no partial provisioning
  it('3. invalid Spreadsheet ID => fails closed without creating data', () => {
    const { context, sheets } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: 'admin@ebda.edu.eg',
        INITIAL_ADMIN_PASSWORD: 'SuperSecretPassword123!',
        BADR_SPREADSHEET_ID: 'badr-sheet-id-123',
        DAMIETTA_SPREADSHEET_ID: 'failing-damietta-id',
      },
      failingSpreadsheetIds: ['failing-damietta-id'],
    });

    const result = context.provisionInitialSystemFromScriptProperties();
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_SPREADSHEET_ID');

    // Neither school nor user should be saved
    expect(sheets.Users.rows.length).toBe(0);
    expect(sheets.Master_Schools.rows.length).toBe(0);
  });

  // 4. both schools registered correctly
  it('4. both schools registered correctly with real spreadsheet IDs', () => {
    const { context, sheets } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: 'admin@ebda.edu.eg',
        INITIAL_ADMIN_PASSWORD: 'SuperSecretPassword123!',
        BADR_SPREADSHEET_ID: 'badr-real-sheet-id',
        DAMIETTA_SPREADSHEET_ID: 'damietta-real-sheet-id',
        INITIAL_ADMIN_FULL_NAME: 'المهندس مصطفى عاطف',
      },
    });

    const result = context.provisionInitialSystemFromScriptProperties();
    expect(result.success).toBe(true);

    const schools = sheets.Master_Schools.rows;
    expect(schools.length).toBe(2);

    const badr = schools.find(s => s[0] === 'SCH-BADR');
    expect(badr).toBeDefined();
    expect(badr[1]).toBe('BADR');
    expect(badr[2]).toBe('مدرسة إبدأ الوطنية للعلوم التقنية - بدر');
    expect(badr[3]).toBe('badr-real-sheet-id');
    expect(badr[4]).toBe('Active');

    const damietta = schools.find(s => s[0] === 'SCH-DAMIETTA');
    expect(damietta).toBeDefined();
    expect(damietta[1]).toBe('DAMIETTA');
    expect(damietta[2]).toBe('مدرسة إبدأ الوطنية للعلوم التقنية - دمياط');
    expect(damietta[3]).toBe('damietta-real-sheet-id');
    expect(damietta[4]).toBe('Active');
  });

  // 5. SystemAdmin created
  it('5. SystemAdmin account is created with correct roles, attributes and normalized email', () => {
    const { context, sheets } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: 'Admin.Ebda@Ebda.Edu.EG  ',
        INITIAL_ADMIN_PASSWORD: 'SuperSecretPassword123!',
        BADR_SPREADSHEET_ID: 'badr-real-sheet-id',
        DAMIETTA_SPREADSHEET_ID: 'damietta-real-sheet-id',
        INITIAL_ADMIN_FULL_NAME: 'المهندس مصطفى عاطف',
      },
    });

    const result = context.provisionInitialSystemFromScriptProperties();
    expect(result.success).toBe(true);

    const users = sheets.Users.rows;
    expect(users.length).toBe(1);

    const u = users[0];
    const headers = sheets.Users.headers;
    const emailIdx = headers.indexOf('email');
    const roleIdx = headers.indexOf('role');
    const statusIdx = headers.indexOf('status');
    const fullNameIdx = headers.indexOf('fullName');
    const schoolIdIdx = headers.indexOf('schoolId');
    const allowedIdx = headers.indexOf('allowedSchoolIds');

    expect(u[emailIdx]).toBe('admin.ebda@ebda.edu.eg');
    expect(u[roleIdx]).toBe('SystemAdmin');
    expect(u[statusIdx]).toBe('Active');
    expect(u[fullNameIdx]).toBe('المهندس مصطفى عاطف');
    expect(u[schoolIdIdx]).toBe('');
    expect(JSON.parse(u[allowedIdx])).toEqual(['SCH-BADR', 'SCH-DAMIETTA']);
  });

  // 6. duplicate run doesn't duplicate user
  it('6. duplicate run does NOT duplicate user', () => {
    const { context, sheets } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: 'admin@ebda.edu.eg',
        INITIAL_ADMIN_PASSWORD: 'SuperSecretPassword123!',
        BADR_SPREADSHEET_ID: 'badr-real-sheet-id',
        DAMIETTA_SPREADSHEET_ID: 'damietta-real-sheet-id',
      },
    });

    const res1 = context.provisionInitialSystemFromScriptProperties();
    expect(res1.success).toBe(true);
    expect(sheets.Users.rows.length).toBe(1);

    // Run a second time
    const res2 = context.provisionInitialSystemFromScriptProperties();
    expect(res2.success).toBe(true);
    expect(sheets.Users.rows.length).toBe(1);
  });

  // 7. duplicate run doesn't duplicate schools
  it('7. duplicate run does NOT duplicate schools', () => {
    const { context, sheets } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: 'admin@ebda.edu.eg',
        INITIAL_ADMIN_PASSWORD: 'SuperSecretPassword123!',
        BADR_SPREADSHEET_ID: 'badr-real-sheet-id',
        DAMIETTA_SPREADSHEET_ID: 'damietta-real-sheet-id',
      },
    });

    context.provisionInitialSystemFromScriptProperties();
    expect(sheets.Master_Schools.rows.length).toBe(2);

    // Run again
    context.provisionInitialSystemFromScriptProperties();
    expect(sheets.Master_Schools.rows.length).toBe(2);
  });

  // 8. password plaintext never stored
  it('8. password plaintext is NEVER stored in sheet rows or properties', () => {
    const plainPass = 'MyUltraSecretP@ssw0rd!#';
    const { context, sheets, propertiesStore } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: 'admin@ebda.edu.eg',
        INITIAL_ADMIN_PASSWORD: plainPass,
        BADR_SPREADSHEET_ID: 'badr-real-sheet-id',
        DAMIETTA_SPREADSHEET_ID: 'damietta-real-sheet-id',
      },
    });

    context.provisionInitialSystemFromScriptProperties();

    // Check all cells across all sheets
    for (const sheetName in sheets) {
      const sheet = sheets[sheetName];
      for (const row of sheet.rows) {
        for (const cell of row) {
          expect(String(cell)).not.toContain(plainPass);
        }
      }
    }

    // Check properties store
    expect(propertiesStore.INITIAL_ADMIN_PASSWORD).toBeUndefined();
  });

  // 9. password verifies using backend verifier
  it('9. password verifies using backend login verifier', () => {
    const plainPass = 'ValidP@ssw0rd123';
    const email = 'admin@ebda.edu.eg';
    const { context } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: email,
        INITIAL_ADMIN_PASSWORD: plainPass,
        BADR_SPREADSHEET_ID: 'badr-real-sheet-id',
        DAMIETTA_SPREADSHEET_ID: 'damietta-real-sheet-id',
      },
    });

    context.provisionInitialSystemFromScriptProperties();

    // Attempt backend login via doPost
    const loginRes = context.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'login',
          email,
          password: plainPass,
        }),
      },
    });

    const body = JSON.parse(loginRes.getContent());
    expect(body.status).toBe('success');
    expect(body.sessionToken).toBeDefined();
    expect(body.user.role).toBe('SystemAdmin');
    expect(body.user.email).toBe(email);
    expect(body.user.accessScope).toBe('GLOBAL');
    expect(body.user.allowedSchoolIds).toEqual(['SCH-BADR', 'SCH-DAMIETTA']);
  });

  // 10. allowedSchoolIds = Badr + Damietta only
  it('10. allowedSchoolIds strictly contains only Badr and Damietta', () => {
    const { context, sheets } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: 'admin@ebda.edu.eg',
        INITIAL_ADMIN_PASSWORD: 'SuperSecretPassword123!',
        BADR_SPREADSHEET_ID: 'badr-real-sheet-id',
        DAMIETTA_SPREADSHEET_ID: 'damietta-real-sheet-id',
      },
    });

    context.provisionInitialSystemFromScriptProperties();

    const headers = sheets.Users.headers;
    const allowedIdx = headers.indexOf('allowedSchoolIds');
    const u = sheets.Users.rows[0];

    const allowed = JSON.parse(u[allowedIdx]);
    expect(allowed).toEqual(['SCH-BADR', 'SCH-DAMIETTA']);
    expect(allowed.length).toBe(2);
  });

  // 11. password Script Property deleted after success
  it('11. password Script Property is purged after provisioning success', () => {
    const { context, propertiesStore } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: 'admin@ebda.edu.eg',
        INITIAL_ADMIN_PASSWORD: 'SuperSecretPassword123!',
        BADR_SPREADSHEET_ID: 'badr-real-sheet-id',
        DAMIETTA_SPREADSHEET_ID: 'damietta-real-sheet-id',
      },
    });

    expect(propertiesStore.INITIAL_ADMIN_PASSWORD).toBeDefined();

    context.provisionInitialSystemFromScriptProperties();

    expect(propertiesStore.INITIAL_ADMIN_PASSWORD).toBeUndefined();
    expect(propertiesStore.INITIAL_SYSTEM_PROVISIONED).toBe('true');
  });

  // 12. verifyInitialSystemProvisioning logs findings safely
  it('12. verifyInitialSystemProvisioning logs status safely without leaking credentials', () => {
    const { context, logs } = createGasTestEnv({
      properties: {
        INITIAL_ADMIN_EMAIL: 'admin@ebda.edu.eg',
        INITIAL_ADMIN_PASSWORD: 'SuperSecretPassword123!',
        BADR_SPREADSHEET_ID: 'badr-real-sheet-id',
        DAMIETTA_SPREADSHEET_ID: 'damietta-real-sheet-id',
      },
    });

    context.provisionInitialSystemFromScriptProperties();

    const report = context.verifyInitialSystemProvisioning();
    expect(report.systemAdminExists).toBe(true);
    expect(report.email).toBe('admin@ebda.edu.eg');
    expect(report.role).toBe('SystemAdmin');
    expect(report.badrRegistered).toBe(true);
    expect(report.damiettaRegistered).toBe(true);
    expect(report.badrSpreadsheetReachable).toBe(true);
    expect(report.damiettaSpreadsheetReachable).toBe(true);

    const fullLog = logs.join('\n');
    expect(fullLog).not.toContain('SuperSecretPassword123!');
    expect(fullLog).not.toContain('passwordHash');
    expect(fullLog).not.toContain('passwordSalt');
  });
});
