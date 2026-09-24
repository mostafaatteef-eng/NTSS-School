import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { storageService } from '../src/services/storageService';
import {
  MASTER_SCHOOLS_KEY,
  ACTIVE_SCHOOL_KEY,
  runMigrationScope014MultiSchool,
} from '../src/services/migrationScope014MultiSchool';
import { CANONICAL_BACKEND_VERSION } from '../src/services/googleSheetsAppScript';
import { CANONICAL_BACKEND_VERSION as BACKEND_AUTH_VERSION } from '../src/services/backendAuthService';

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

function createGasTestEnv(initialMasterSchoolsRows: any[][] = [], throwOnOpenById = false) {
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
    Teacher_Sessions: new MockGasSheet('Teacher_Sessions', [
      'sessionId', 'tokenHash', 'teacherId', 'employeeId', 'teacherCode', 'teacherName',
      'schoolId', 'createdAt', 'expiresAt', 'status',
    ]),
    Master_Schools: new MockGasSheet('Master_Schools', [
      'schoolId', 'schoolCode', 'schoolName', 'spreadsheetId', 'status', 'createdAt', 'updatedAt',
    ], initialMasterSchoolsRows),
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

  const sandbox: any = {
    console,
    Math,
    Date,
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (d: Date, tz: string, fmt: string) => d.toISOString(),
      computeDigest: () => [],
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
    Logger: { log: () => {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => masterSs,
      openById: (id: string) => {
        if (throwOnOpenById) {
          throw new Error('SpreadsheetApp.openById failed: network or permission error');
        }
        if (!id || !id.trim()) {
          throw new Error('Invalid spreadsheet id');
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

  return { context, sheets, masterSs };
}

describe('PHASE 3C-A1 — REMOVE FAKE SCHOOL AUTHORITY + FAIL-CLOSED SCHOOL STORAGE', () => {
  beforeEach(() => {
    localStorage.clear();
    storageService.setCurrentUser(null);
  });

  // 1. Empty local registry => getSchools() returns []
  it('1. Empty local registry => getSchools() returns []', () => {
    localStorage.removeItem(MASTER_SCHOOLS_KEY);
    const schools = storageService.getSchools();
    expect(schools).toEqual([]);
  });

  // 2. No active school => getActiveSchoolId() returns ''
  it('2. No active school => getActiveSchoolId() returns empty string', () => {
    localStorage.removeItem(ACTIVE_SCHOOL_KEY);
    expect(storageService.getActiveSchoolId()).toBe('');

    // Authenticated user with no activeSchoolId and no schoolId
    storageService.setCurrentUser({
      id: 'usr-global-admin',
      fullName: 'Global Admin',
      role: 'SystemAdmin',
      email: 'admin@system.local',
      accessScope: 'GLOBAL',
      activeSchoolId: '',
      schoolId: '',
    });
    expect(storageService.getActiveSchoolId()).toBe('');
  });

  // 3. getActiveSchool() returns null with no server context
  it('3. getActiveSchool() returns null with no server context', () => {
    expect(storageService.getActiveSchool()).toBeNull();

    // Even if ACTIVE_SCHOOL_KEY is set in UX cache but school is not in registry
    localStorage.setItem(ACTIVE_SCHOOL_KEY, 'SCH-NON-EXISTENT');
    expect(storageService.getActiveSchool()).toBeNull();
  });

  // 4. MIG_SCOPE_014 does not seed Badr
  it('4. MIG_SCOPE_014 does not seed Badr', () => {
    localStorage.clear();
    const result = runMigrationScope014MultiSchool();

    const schools = storageService.getSchools();
    expect(schools).toEqual([]);
    expect(result.schoolsCount).toBe(0);
    expect(schools.some(s => s.schoolId === 'SCH-BADR' || s.schoolCode === 'BADR')).toBe(false);
  });

  // 5. MIG_SCOPE_014 does not seed Damietta
  it('5. MIG_SCOPE_014 does not seed Damietta', () => {
    localStorage.clear();
    runMigrationScope014MultiSchool();

    const schools = storageService.getSchools();
    expect(schools.some(s => s.schoolId === 'SCH-DAMIETTA' || s.schoolCode === 'DAMIETTA')).toBe(false);
  });

  // 6. Backend empty Master_Schools remains empty
  it('6. Backend empty Master_Schools remains empty after migration 015', () => {
    const { context, sheets, masterSs } = createGasTestEnv([]);
    
    // Run migration 015 on empty Master_Schools
    context.runMigrationScope015MultiSchoolAndDecommissionActivation(masterSs);

    const masterSheet = sheets.Master_Schools;
    expect(masterSheet.rows.length).toBe(0);
  });

  // 7. Backend does not backfill blank session schoolId
  it('7. Backend does not backfill blank session schoolId with SCH-BADR', () => {
    const { context, sheets, masterSs } = createGasTestEnv([]);
    
    // Add sessions with blank schoolId
    sheets.Sessions.rows.push([
      'sess-1', 'hash-1', 'usr-1', 'admin', 'Admin User', 'SystemAdmin', '',
      'admin@test.local', 'GLOBAL', '', '', '', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z', 'active'
    ]);
    sheets.Teacher_Sessions.rows.push([
      'tsess-1', 'thash-1', 't-1', 'emp-1', 'T01', 'Teacher One', '',
      '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z', 'active'
    ]);

    context.runMigrationScope015MultiSchoolAndDecommissionActivation(masterSs);

    // Assert schoolId was NOT backfilled with SCH-BADR
    expect(sheets.Sessions.rows[0][6]).toBe('');
    expect(sheets.Teacher_Sessions.rows[0][6]).toBe('');
  });

  // 8. Public schools empty registry => []
  it('8. Public schools empty registry => []', () => {
    const { context, masterSs } = createGasTestEnv([]);

    const schools = context.getPublicActiveSchools(masterSs);
    expect(schools).toEqual([]);

    // Test via doPost action = 'publicSchools'
    const postEvent = {
      postData: {
        contents: JSON.stringify({ action: 'publicSchools' }),
      },
    };
    const response = context.doPost(postEvent);
    const body = JSON.parse(response.getContent());
    expect(body.status).toBe('success');
    expect(body.schools).toEqual([]);
  });

  // 9. getSchoolSpreadsheet missing registry => null
  it('9. getSchoolSpreadsheet missing registry => null', () => {
    const { context, masterSs } = createGasTestEnv([]);

    // Master_Schools has no rows
    const ss = context.getSchoolSpreadsheet('SCH-BADR', masterSs);
    expect(ss).toBeNull();
  });

  // 10. blank spreadsheetId => null
  it('10. blank spreadsheetId => null', () => {
    const { context, masterSs } = createGasTestEnv([
      ['SCH-TEST', 'TEST', 'Test School', '', 'Active', '', ''],
      ['SCH-BLANK', 'BLANK', 'Blank School', '   ', 'Active', '', ''],
    ]);

    const ss1 = context.getSchoolSpreadsheet('SCH-TEST', masterSs);
    expect(ss1).toBeNull();

    const ss2 = context.getSchoolSpreadsheet('SCH-BLANK', masterSs);
    expect(ss2).toBeNull();
  });

  // 11. openById failure => null
  it('11. openById failure => null without falling back to masterSs', () => {
    const { context, masterSs } = createGasTestEnv([
      ['SCH-FAIL', 'FAIL', 'Failing School', 'ss-failing-id', 'Active', '', ''],
    ], true); // throwOnOpenById = true

    const result = context.getSchoolSpreadsheet('SCH-FAIL', masterSs);
    expect(result).toBeNull();
  });

  // 12. explicit registered spreadsheetId === masterSs.getId() remains supported
  it('12. explicit registered spreadsheetId === masterSs.getId() remains supported', () => {
    const { context, masterSs } = createGasTestEnv([
      ['SCH-PRIMARY', 'PRIMARY', 'Primary School In Master', 'master-ss-id', 'Active', '', ''],
    ]);

    const result = context.getSchoolSpreadsheet('SCH-PRIMARY', masterSs);
    expect(result).not.toBeNull();
    expect(result.getId()).toBe('master-ss-id');
  });

  // 13. version === 5.2.0-AUTH-MULTISCHOOL
  it('13. version === 5.2.0-AUTH-MULTISCHOOL across all authoritative sources', () => {
    expect(CANONICAL_BACKEND_VERSION).toBe('5.2.0-AUTH-MULTISCHOOL');
    expect(BACKEND_AUTH_VERSION).toBe('5.2.0-AUTH-MULTISCHOOL');

    const codeGsPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');
    const codeGsContent = fs.readFileSync(codeGsPath, 'utf8');
    expect(codeGsContent).toContain("var CANONICAL_BACKEND_VERSION = '5.2.0-AUTH-MULTISCHOOL';");
    expect(codeGsContent).toContain('* Version: 5.2.0-AUTH-MULTISCHOOL');
  });

  // 14. no production runtime references to SECONDARY_SEED_SCHOOL
  it('14. no production runtime references to SECONDARY_SEED_SCHOOL', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    
    function checkDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          // Exclude tests inside src if any
          if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue;
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content).not.toContain('SECONDARY_SEED_SCHOOL');
        }
      }
    }

    checkDir(srcDir);
  });
});
