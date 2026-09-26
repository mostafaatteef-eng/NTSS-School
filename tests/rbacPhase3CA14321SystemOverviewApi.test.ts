// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { systemAdminOverviewService } from '../src/services/systemAdminOverviewService';
import { storageService } from '../src/services/storageService';
import { User } from '../src/types';

class MockGasSheet {
  name: string;
  headers: string[];
  rows: any[][];

  constructor(name: string, headers: string[] = [], initialRows: any[][] = []) {
    this.name = name;
    this.headers = [...headers];
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
  schoolSpreadsheets?: Record<string, Record<string, MockGasSheet>>;
  initialUsers?: any[][];
  initialSchools?: any[][];
  openedSpreadsheetIds?: string[];
} = {}) {
  const codeGsPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');
  const codeContent = fs.readFileSync(codeGsPath, 'utf8');

  const propertiesStore: ScriptPropertiesStore = { ...(options.properties || {}) };
  const openedIds: string[] = options.openedSpreadsheetIds || [];

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
        openedIds.push(id);
        if (!id || !id.trim()) {
          throw new Error('SpreadsheetApp.openById: invalid ID');
        }
        if (options.failingSpreadsheetIds && options.failingSpreadsheetIds.includes(id)) {
          throw new Error('SpreadsheetApp.openById: spreadsheet not reachable ' + id);
        }
        if (options.schoolSpreadsheets && options.schoolSpreadsheets[id]) {
          const schoolSheets = options.schoolSpreadsheets[id];
          return {
            getId: () => id,
            getSheetByName: (name: string) => schoolSheets[name] || null,
          };
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

  function executeDoPost(body: any) {
    const e = {
      postData: {
        contents: JSON.stringify(body),
      },
    };
    const res = sandbox.doPost(e);
    return JSON.parse(res.getContent());
  }

  function hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }

  function insertSession(session: {
    sessionId: string;
    token: string;
    userId: string;
    username: string;
    fullName: string;
    role: string;
    schoolId: string;
    accessScope: string;
    allowedSchoolIds: string[];
    activeSchoolId: string;
    employeeId?: string;
  }) {
    sheets.Sessions.appendRow([
      session.sessionId,
      hashToken(session.token),
      session.userId,
      session.username,
      session.fullName,
      session.role,
      session.schoolId,
      session.username + '@school.edu',
      session.accessScope,
      JSON.stringify(session.allowedSchoolIds),
      session.activeSchoolId,
      session.employeeId || '',
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
      'Active',
    ]);
  }

  return {
    sandbox,
    sheets,
    masterSs,
    logs,
    openedIds,
    executeDoPost,
    insertSession,
  };
}

describe('PHASE 3C-A14.3.2.1 — AUTHORITATIVE CROSS-SCHOOL OVERVIEW API', () => {
  const initialSchools = [
    // 1. Active, Allowed, Bound -> SCH-BADR
    ['SCH-BADR', 'BADR', 'مدرسة بدر الدولية للتكنولوجيا التطبيقية', 'ss-badr-id-12345', 'Active', '2026-09-01T08:00:00Z', '2026-09-01T08:00:00Z'],
    // 2. Inactive -> SCH-DAMIETTA
    ['SCH-DAMIETTA', 'DAMIETTA', 'مدرسة دمياط للتكنولوجيا التطبيقية', 'ss-damietta-id-67890', 'Inactive', '2026-09-05T09:00:00Z', '2026-09-05T09:00:00Z'],
    // 3. Active, Outside allowedSchoolIds -> SCH-CAIRO
    ['SCH-CAIRO', 'CAIRO', 'مدرسة القاهرة التطبيقية', 'ss-cairo-id-11223', 'Active', '2026-09-10T09:00:00Z', '2026-09-10T09:00:00Z'],
    // 4. Active, Allowed, Unbound (empty spreadsheetId) -> SCH-ALEX
    ['SCH-ALEX', 'ALEX', 'مدرسة الإسكندرية', '', 'Active', '2026-09-12T09:00:00Z', '2026-09-12T09:00:00Z'],
    // 5. Active, Allowed, Bound, but Spreadsheet fails to open -> SCH-ASWAN
    ['SCH-ASWAN', 'ASWAN', 'مدرسة أسوان', 'ss-aswan-id-broken', 'Active', '2026-09-15T09:00:00Z', '2026-09-15T09:00:00Z'],
  ];

  // Mock tenant school spreadsheets
  const badrSpreadsheet: Record<string, MockGasSheet> = {
    Students: new MockGasSheet('Students', ['id', 'name', 'grade', 'status'], [
      ['STU-1', 'أحمد محمود', 'Grade 10', 'Active'],
      ['STU-2', 'سارة علي', 'Grade 10', 'Active'],
      ['STU-3', 'محمد حسن', 'Grade 11', 'Active'],
      ['', '', '', ''], // Blank row: must NOT count
      ['   ', '   ', '', ''], // Whitespace-only id row: must NOT count
    ]),
    Employees: new MockGasSheet('Employees', ['id', 'name', 'jobTitle', 'status'], [
      ['EMP-1', 'طارق مصطفى', 'معلم رياضيات', 'Active'],
      ['EMP-2', 'مروة كريم', 'معلمة لغة عربية', 'Active'],
      ['', '', '', ''], // Blank row: must NOT count
    ]),
  };

  const cairoSpreadsheet: Record<string, MockGasSheet> = {
    Students: new MockGasSheet('Students', ['id', 'name', 'grade', 'status'], [
      ['STU-C1', 'طالب القاهرة', 'Grade 10', 'Active'],
    ]),
    Employees: new MockGasSheet('Employees', ['id', 'name', 'jobTitle', 'status'], [
      ['EMP-C1', 'معلم القاهرة', 'معلم فيزياء', 'Active'],
    ]),
  };

  let gasEnv: ReturnType<typeof createGasTestEnv>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();

    gasEnv = createGasTestEnv({
      initialSchools,
      failingSpreadsheetIds: ['ss-aswan-id-broken'],
      schoolSpreadsheets: {
        'ss-badr-id-12345': badrSpreadsheet,
        'ss-cairo-id-11223': cairoSpreadsheet,
      },
    });

    // Insert SystemAdmin session with allowedSchoolIds: ['SCH-BADR', 'SCH-ALEX', 'SCH-ASWAN']
    // Note: SCH-CAIRO is NOT in allowedSchoolIds
    gasEnv.insertSession({
      sessionId: 'sess-sysadmin',
      token: 'tok-sysadmin',
      userId: 'usr-sysadmin',
      username: 'sysadmin',
      fullName: 'مدير النظام الشامل',
      role: 'SystemAdmin',
      schoolId: 'SCH-BADR',
      accessScope: 'GLOBAL',
      allowedSchoolIds: ['SCH-BADR', 'SCH-ALEX', 'SCH-ASWAN'],
      activeSchoolId: '',
    });

    // Insert SchoolAdmin session
    gasEnv.insertSession({
      sessionId: 'sess-schooladmin',
      token: 'tok-schooladmin',
      userId: 'usr-schooladmin',
      username: 'schooladmin_badr',
      fullName: 'مدير مدرسة بدر',
      role: 'SchoolAdmin',
      schoolId: 'SCH-BADR',
      accessScope: 'SCHOOL',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
    });

    // Insert Teacher session
    gasEnv.insertSession({
      sessionId: 'sess-teacher',
      token: 'tok-teacher',
      userId: 'usr-teacher',
      username: 'teacher_1',
      fullName: 'معلم أول',
      role: 'Teacher',
      schoolId: 'SCH-BADR',
      accessScope: 'SCHOOL',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // 1. AUTHORIZATION GUARDS
  // -------------------------------------------------------------
  describe('1. Authorization Guards', () => {
    it('SystemAdmin with GLOBAL accessScope → ALLOWED', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
      });

      expect(res.status).toBe('success');
      expect(res.summary).toBeDefined();
      expect(Array.isArray(res.schools)).toBe(true);
    });

    it('SchoolAdmin → BLOCKED with 403 FORBIDDEN_SYSTEM_ADMIN_ONLY', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-schooladmin',
      });

      expect(res.status).toBe('error');
      expect(res.code).toBe('FORBIDDEN_SYSTEM_ADMIN_ONLY');
    });

    it('Teacher → BLOCKED with 403 FORBIDDEN_SYSTEM_ADMIN_ONLY', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-teacher',
      });

      expect(res.status).toBe('error');
      expect(res.code).toBe('FORBIDDEN_SYSTEM_ADMIN_ONLY');
    });

    it('Unauthenticated caller → BLOCKED', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'invalid-or-missing-token',
      });

      expect(res.status).toBe('error');
    });
  });

  // -------------------------------------------------------------
  // 2. DATA SCOPING & ZERO-LEAK ACCESS RULES
  // -------------------------------------------------------------
  describe('2. Data Scoping & Operational Status Rules', () => {
    it('Allowed, active, bound school (SCH-BADR) → dataStatus: AVAILABLE with real counts (excluding blank rows)', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
      });

      const badr = res.schools.find((s: any) => s.schoolId === 'SCH-BADR');
      expect(badr).toBeDefined();
      expect(badr.dataStatus).toBe('AVAILABLE');
      // 3 valid students (2 blank rows ignored)
      expect(badr.studentsCount).toBe(3);
      // 2 valid employees (1 blank row ignored)
      expect(badr.employeesCount).toBe(2);
    });

    it('Inactive school (SCH-DAMIETTA) → dataStatus: INACTIVE and spreadsheet never opened', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
      });

      const damietta = res.schools.find((s: any) => s.schoolId === 'SCH-DAMIETTA');
      expect(damietta).toBeDefined();
      expect(damietta.dataStatus).toBe('INACTIVE');
      expect(damietta.studentsCount).toBeNull();
      expect(damietta.employeesCount).toBeNull();

      // Ensure DAMIETTA spreadsheet was never opened
      expect(gasEnv.openedIds).not.toContain('ss-damietta-id-67890');
    });

    it('Active school outside session.allowedSchoolIds (SCH-CAIRO) → dataStatus: NOT_ALLOWED and spreadsheet never opened', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
      });

      const cairo = res.schools.find((s: any) => s.schoolId === 'SCH-CAIRO');
      expect(cairo).toBeDefined();
      expect(cairo.dataStatus).toBe('NOT_ALLOWED');
      expect(cairo.studentsCount).toBeNull();
      expect(cairo.employeesCount).toBeNull();

      // Ensure CAIRO spreadsheet was never opened
      expect(gasEnv.openedIds).not.toContain('ss-cairo-id-11223');
    });

    it('Unbound school (SCH-ALEX) → dataStatus: UNBOUND, counts null, spreadsheet not opened', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
      });

      const alex = res.schools.find((s: any) => s.schoolId === 'SCH-ALEX');
      expect(alex).toBeDefined();
      expect(alex.dataStatus).toBe('UNBOUND');
      expect(alex.studentsCount).toBeNull();
      expect(alex.employeesCount).toBeNull();
    });

    it('Unavailable spreadsheet (SCH-ASWAN) → dataStatus: UNAVAILABLE, partial failure handled safely', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
      });

      expect(res.status).toBe('success');
      const aswan = res.schools.find((s: any) => s.schoolId === 'SCH-ASWAN');
      expect(aswan).toBeDefined();
      expect(aswan.dataStatus).toBe('UNAVAILABLE');
      expect(aswan.studentsCount).toBeNull();
      expect(aswan.employeesCount).toBeNull();

      // summary reflects 1 unavailable school
      expect(res.summary.schoolsUnavailable).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // 3. AGGREGATE TOTALS INTEGRITY
  // -------------------------------------------------------------
  describe('3. Aggregate Totals Calculation Integrity', () => {
    it('Global totals sum ONLY AVAILABLE schools (excluding INACTIVE, NOT_ALLOWED, UNBOUND, UNAVAILABLE)', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
      });

      expect(res.summary).toEqual({
        studentsTotal: 3, // only from SCH-BADR
        employeesTotal: 2, // only from SCH-BADR
        schoolsIncluded: 1, // SCH-BADR
        schoolsUnavailable: 1, // SCH-ASWAN
      });
    });

    it('Client-supplied schoolId parameter cannot narrow or tamper with authoritative system overview', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
        schoolId: 'SCH-BADR', // Client attempts to supply schoolId
      });

      expect(res.status).toBe('success');
      // All schools from Master_Schools registry remain present
      expect(res.schools.length).toBe(5);
    });
  });

  // -------------------------------------------------------------
  // 4. PRIVACY, SECURITY & AUDIT
  // -------------------------------------------------------------
  describe('4. Privacy, Security & Audit Logging', () => {
    it('Response contains NO spreadsheetId or SHEET_ID anywhere', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
      });

      const jsonStr = JSON.stringify(res);
      expect(jsonStr.includes('spreadsheetId')).toBe(false);
      expect(jsonStr.includes('ss-badr-id-12345')).toBe(false);
      expect(jsonStr.includes('ss-damietta-id-67890')).toBe(false);
      expect(jsonStr.includes('ss-cairo-id-11223')).toBe(false);
      expect(jsonStr.includes('SPREADSHEET_ID')).toBe(false);
      expect(jsonStr.includes('SHEET_ID')).toBe(false);
    });

    it('Response contains NO student or employee PII (names, nationalIds, phones, etc.)', () => {
      const res = gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
      });

      const jsonStr = JSON.stringify(res);
      expect(jsonStr.includes('أحمد محمود')).toBe(false);
      expect(jsonStr.includes('سارة علي')).toBe(false);
      expect(jsonStr.includes('طارق مصطفى')).toBe(false);
      expect(jsonStr.includes('STU-1')).toBe(false);
      expect(jsonStr.includes('EMP-1')).toBe(false);
    });

    it('Records authoritative audit event SYSTEM_OVERVIEW_VIEWED without secrets or spreadsheetIds', () => {
      gasEnv.executeDoPost({
        action: 'adminGetSystemOverview',
        sessionToken: 'tok-sysadmin',
      });

      const auditRows = gasEnv.sheets.Audit_Logs.rows;
      expect(auditRows.length).toBeGreaterThan(0);

      const overviewAudit = auditRows.find(r => r[4] === 'SYSTEM_OVERVIEW_VIEWED');
      expect(overviewAudit).toBeDefined();
      expect(overviewAudit[2]).toBe('sysadmin');
      expect(overviewAudit[3]).toBe('SystemAdmin');

      // Audit row contains no spreadsheetId
      const auditStr = JSON.stringify(overviewAudit);
      expect(auditStr.includes('ss-badr-id-12345')).toBe(false);
      expect(auditStr.includes('spreadsheetId')).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // 5. FRONTEND SERVICE LAYER
  // -------------------------------------------------------------
  describe('5. Frontend SystemAdminOverviewService', () => {
    const sysAdminUser: User = {
      id: 'usr-sysadmin-1',
      username: 'sysadmin',
      fullName: 'مدير النظام الشامل',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      allowedSchoolIds: ['SCH-BADR'],
      activeSchoolId: 'SCH-BADR',
      sessionToken: 'tok-sysadmin',
    };

    const schoolAdminUser: User = {
      id: 'usr-schooladmin-1',
      username: 'admin_badr',
      fullName: 'مدير مدرسة بدر',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      activeSchoolId: 'SCH-BADR',
      sessionToken: 'tok-schooladmin',
    };

    it('Calls backend adminGetSystemOverview with sessionToken and returns typed overview response', async () => {
      storageService.setCurrentUser(sysAdminUser);
      vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://script.google.com/macros/s/test-url/exec');

      const mockResponse = {
        status: 'success',
        summary: {
          studentsTotal: 300,
          employeesTotal: 50,
          schoolsIncluded: 2,
          schoolsUnavailable: 0,
        },
        schools: [
          {
            schoolId: 'SCH-BADR',
            schoolCode: 'BADR',
            schoolName: 'مدرسة بدر',
            status: 'Active',
            dataStatus: 'AVAILABLE',
            studentsCount: 200,
            employeesCount: 30,
          },
          {
            schoolId: 'SCH-CAIRO',
            schoolCode: 'CAIRO',
            schoolName: 'مدرسة القاهرة',
            status: 'Active',
            dataStatus: 'AVAILABLE',
            studentsCount: 100,
            employeesCount: 20,
          },
        ],
        generatedAt: '2026-09-26T09:00:00Z',
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const res = await systemAdminOverviewService.getSystemOverview(sysAdminUser);

      expect(res.success).toBe(true);
      expect(res.data?.summary.studentsTotal).toBe(300);
      expect(res.data?.summary.employeesTotal).toBe(50);
      expect(res.data?.schools.length).toBe(2);

      // Verify network request
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://script.google.com/macros/s/test-url/exec',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'adminGetSystemOverview',
            sessionToken: 'tok-sysadmin',
          }),
        })
      );
    });

    it('Rejects non-SystemAdmin callers before making network requests', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await systemAdminOverviewService.getSystemOverview(schoolAdminUser);

      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN_SYSTEM_ADMIN_ONLY');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('Never derives cross-school totals from local storage student/employee caches', async () => {
      // Plant fake local student and employee data
      const getStudentsSpy = vi.spyOn(storageService, 'getStudents');
      const getEmployeesSpy = vi.spyOn(storageService, 'getEmployees');

      vi.spyOn(storageService, 'getBackendUrl').mockReturnValue('https://script.google.com/macros/s/test-url/exec');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          summary: { studentsTotal: 10, employeesTotal: 5, schoolsIncluded: 1, schoolsUnavailable: 0 },
          schools: [],
        }),
      } as any);

      await systemAdminOverviewService.getSystemOverview(sysAdminUser);

      // Neither getStudents nor getEmployees should be touched!
      expect(getStudentsSpy).not.toHaveBeenCalled();
      expect(getEmployeesSpy).not.toHaveBeenCalled();
    });
  });
});
