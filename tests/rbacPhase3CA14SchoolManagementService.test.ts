// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { schoolAdminService } from '../src/services/schoolAdminService';
import { storageService } from '../src/services/storageService';
import { MASTER_SCHOOLS_KEY } from '../src/services/migrationScope014MultiSchool';
import { School, User } from '../src/types';

// ============================================================================
// GAS Sandboxed Environment for Direct Code.gs Testing
// ============================================================================
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

// ============================================================================
// Service Layer & Integration Test Suite
// ============================================================================
describe('PHASE 3C-A14.1 & A14.1.1 — SYSTEMADMIN SCHOOL MANAGEMENT SERVICE LAYER', () => {
  const originalFetch = global.fetch;

  const initialMockSchools: School[] = [
    {
      schoolId: 'SCH-BADR',
      schoolCode: 'BADR',
      schoolName: 'مدرسة بدر الوطنية للتكنولوجيا التطبيقية',
      status: 'Active',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    },
    {
      schoolId: 'SCH-DAMIETTA',
      schoolCode: 'DAMIETTA',
      schoolName: 'مدرسة دمياط الوطنية للتكنولوجيا التطبيقية',
      status: 'Active',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    },
  ];

  const sysAdminUser: User = {
    id: 'u-sysadmin-master',
    username: 'sysadmin',
    fullName: 'مدير النظام الشامل',
    role: 'SystemAdmin',
    accessScope: 'GLOBAL',
    activeSchoolId: 'SCH-BADR',
    allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA', 'SCH-NEW'],
    sessionToken: 'tok-authoritative-sysadmin-token-12345',
    status: 'Active',
    isActive: true,
  };

  const schoolAdminUser: User = {
    id: 'u-schadmin-local',
    username: 'schadmin',
    fullName: 'مدير المدرسة المحلي',
    role: 'SchoolAdmin',
    accessScope: 'SCHOOL',
    schoolId: 'SCH-BADR',
    activeSchoolId: 'SCH-BADR',
    allowedSchoolIds: ['SCH-BADR'],
    sessionToken: 'tok-authoritative-schadmin-token-54321',
    status: 'Active',
    isActive: true,
  };

  let simulatedMasterRegistry: (School & { spreadsheetId?: string })[] = [];
  let simulatedAuditLogs: any[] = [];
  let lastOutgoingFetchBody: any = null;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    lastOutgoingFetchBody = null;

    simulatedMasterRegistry = [
      {
        schoolId: 'SCH-BADR',
        schoolCode: 'BADR',
        schoolName: 'مدرسة بدر الوطنية للتكنولوجيا التطبيقية',
        spreadsheetId: 'secret-ss-id-badr-999',
        status: 'Active',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
      },
      {
        schoolId: 'SCH-DAMIETTA',
        schoolCode: 'DAMIETTA',
        schoolName: 'مدرسة دمياط الوطنية للتكنولوجيا التطبيقية',
        spreadsheetId: 'secret-ss-id-damietta-888',
        status: 'Active',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
      },
    ];

    simulatedAuditLogs = [];

    // Pre-populate client cache with clean schools
    localStorage.setItem(MASTER_SCHOOLS_KEY, JSON.stringify(initialMockSchools));

    storageService.saveSettings({
      ...storageService.getSettings(),
      googleAppsScriptUrl: 'https://script.google.com/macros/s/AKfycbAuthoritativeBackend/exec',
    });

    // Mock authoritative backend fetch
    global.fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
      if (!opts || !opts.body) {
        return { ok: true, status: 200, json: async () => ({ status: 'success' }) };
      }

      const body = JSON.parse(opts.body);
      lastOutgoingFetchBody = body;
      const { action, sessionToken, school, schoolId, updates } = body;

      // Public binding action guard: strictly forbidden
      if (
        action === 'bindSchoolSpreadsheet' ||
        action === 'bindSchoolSpreadsheetFromScriptProperties' ||
        action === 'setSchoolSpreadsheetId' ||
        action === 'updateSpreadsheetId'
      ) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            status: 'error',
            code: 'ACTION_NOT_FOUND',
            message: 'الإجراء المطلوب غير متاح أو غير مصرح به عبر الواجهة العامة.',
          }),
        };
      }

      // Authoritative Backend RBAC Gatekeeper
      const isSysAdmin = sessionToken === sysAdminUser.sessionToken;

      // 1. adminGetSchools
      if (action === 'adminGetSchools') {
        if (!isSysAdmin) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              status: 'error',
              code: 'FORBIDDEN_SYSTEM_ADMIN_ONLY',
              message: 'صلاحية مرفوضة: هذا الإجراء مخصص حصرياً لمدير النظام الشامل (SystemAdmin).',
            }),
          };
        }

        // Backend strips spreadsheetId in safe response
        const safeSchools = simulatedMasterRegistry.map(s => ({
          schoolId: s.schoolId,
          schoolCode: s.schoolCode,
          schoolName: s.schoolName,
          status: s.status,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        }));

        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            schools: safeSchools,
          }),
        };
      }

      // 2. adminCreateSchool
      if (action === 'adminCreateSchool') {
        if (!isSysAdmin) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              status: 'error',
              code: 'FORBIDDEN_SYSTEM_ADMIN_ONLY',
              message: 'صلاحية مرفوضة: هذا الإجراء مخصص حصرياً لمدير النظام الشامل (SystemAdmin).',
            }),
          };
        }

        // Hardening Phase 3C-A14.1.1: Fail-Closed if client attempts to send spreadsheetId
        if (school?.spreadsheetId !== undefined || body?.spreadsheetId !== undefined) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              status: 'error',
              code: 'CLIENT_SPREADSHEET_BINDING_FORBIDDEN',
              message: 'ربط جدول البيانات عبر واجهة المستخدم أو العميل محظور أمنياً. الربط يتم حصرياً عبر الخادم الرئيسي.',
            }),
          };
        }

        const newId = String(school?.schoolId || '').trim().toUpperCase();
        const newCode = String(school?.schoolCode || '').trim().toUpperCase();
        const newName = String(school?.schoolName || '').trim();

        if (!newId || !newCode || !newName) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              status: 'error',
              code: 'INVALID_SCHOOL_DATA',
              message: 'يرجى إدخال كود المدرسة ورمزها واسمها بالكامل',
            }),
          };
        }

        const exists = simulatedMasterRegistry.some(
          s => s.schoolId === newId || s.schoolCode === newCode
        );
        if (exists) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              status: 'error',
              code: 'SCHOOL_EXISTS',
              message: 'المدرسة مسجلة مسبقاً بنفس المعرف أو الرمز',
            }),
          };
        }

        // New schools default to Inactive with empty spreadsheetId
        const created = {
          schoolId: newId,
          schoolCode: newCode,
          schoolName: newName,
          spreadsheetId: '',
          status: 'Inactive' as const,
          createdAt: '2026-09-25T12:00:00.000Z',
          updatedAt: '2026-09-25T12:00:00.000Z',
        };
        simulatedMasterRegistry.push(created);

        // Record backend audit (strictly no spreadsheetId in audit)
        simulatedAuditLogs.push({
          action: 'SCHOOL_CREATED',
          schoolId: created.schoolId,
          details: { schoolName: created.schoolName, schoolCode: created.schoolCode, status: created.status },
        });

        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            message: 'تم تسجيل المدرسة بنجاح',
            school: {
              schoolId: created.schoolId,
              schoolCode: created.schoolCode,
              schoolName: created.schoolName,
              status: created.status,
              createdAt: created.createdAt,
              updatedAt: created.updatedAt,
            },
          }),
        };
      }

      // 3. adminUpdateSchool
      if (action === 'adminUpdateSchool') {
        if (!isSysAdmin) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              status: 'error',
              code: 'FORBIDDEN_SYSTEM_ADMIN_ONLY',
              message: 'صلاحية مرفوضة: هذا الإجراء مخصص حصرياً لمدير النظام الشامل (SystemAdmin).',
            }),
          };
        }

        const targetId = String(schoolId || '').trim().toUpperCase();
        if (updates?.schoolId && String(updates.schoolId).trim().toUpperCase() !== targetId) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              status: 'error',
              code: 'IMMUTABLE_SCHOOL_ID',
              message: 'معرف المدرسة (schoolId) ثابت وغير قابل للتعديل',
            }),
          };
        }

        const target = simulatedMasterRegistry.find(s => s.schoolId === targetId);
        if (!target) {
          return {
            ok: false,
            status: 404,
            json: async () => ({
              status: 'error',
              code: 'SCHOOL_NOT_FOUND',
              message: 'المدرسة المحددة غير موجودة',
            }),
          };
        }

        const changedFields: any = {};

        if (updates.schoolCode !== undefined) {
          const newCode = String(updates.schoolCode).trim().toUpperCase();
          if (!newCode) {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                status: 'error',
                code: 'INVALID_SCHOOL_CODE',
                message: 'رمز المدرسة لا يمكن أن يكون فارغاً',
              }),
            };
          }
          const duplicate = simulatedMasterRegistry.some(
            s => s.schoolId !== targetId && s.schoolCode === newCode
          );
          if (duplicate) {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                status: 'error',
                code: 'DUPLICATE_SCHOOL_CODE',
                message: 'رمز المدرسة مسجل مسبقاً لمدرسة أخرى',
              }),
            };
          }
          changedFields.schoolCode = { from: target.schoolCode, to: newCode };
          target.schoolCode = newCode;
        }

        if (updates.schoolName !== undefined) {
          const newName = String(updates.schoolName).trim();
          if (!newName) {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                status: 'error',
                code: 'INVALID_SCHOOL_NAME',
                message: 'اسم المدرسة لا يمكن أن يكون فارغاً',
              }),
            };
          }
          changedFields.schoolName = { from: target.schoolName, to: newName };
          target.schoolName = newName;
        }

        if (updates.status !== undefined) {
          const newStatus = String(updates.status).trim();
          if (newStatus !== 'Active' && newStatus !== 'Inactive') {
            return {
              ok: false,
              status: 400,
              json: async () => ({
                status: 'error',
                code: 'INVALID_SCHOOL_STATUS',
                message: 'حالة المدرسة يجب أن تكون إما Active أو Inactive',
              }),
            };
          }

          // Strict activation rule: must have valid, reachable spreadsheet bound
          if (newStatus === 'Active') {
            const ssId = String(target.spreadsheetId || '').trim();
            if (!ssId) {
              return {
                ok: false,
                status: 400,
                json: async () => ({
                  status: 'error',
                  code: 'SCHOOL_SPREADSHEET_NOT_BOUND',
                  message: 'لا يمكن تفعيل المدرسة قبل ربط جدول بيانات مستقل وصالح عبر الخادم الرئيسي.',
                }),
              };
            }
            if (ssId === 'INVALID_SS_ID') {
              return {
                ok: false,
                status: 400,
                json: async () => ({
                  status: 'error',
                  code: 'SCHOOL_SPREADSHEET_INVALID',
                  message: 'جدول البيانات المرتبط بالمدرسة غير صالح أو تعذر الوصول إليه.',
                }),
              };
            }
          }

          if (newStatus !== target.status) {
            changedFields.status = { from: target.status, to: newStatus };
            target.status = newStatus as 'Active' | 'Inactive';
            simulatedAuditLogs.push({
              action: newStatus === 'Active' ? 'SCHOOL_ACTIVATED' : 'SCHOOL_DEACTIVATED',
              schoolId: target.schoolId,
              details: { status: changedFields.status },
            });
          }
        }

        target.updatedAt = '2026-09-25T12:05:00.000Z';

        // Record backend audit
        simulatedAuditLogs.push({
          action: 'SCHOOL_UPDATED',
          schoolId: target.schoolId,
          details: changedFields,
        });

        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            message: 'تم تحديث بيانات المدرسة بنجاح',
            school: {
              schoolId: target.schoolId,
              schoolCode: target.schoolCode,
              schoolName: target.schoolName,
              status: target.status,
              createdAt: target.createdAt,
              updatedAt: target.updatedAt,
            },
          }),
        };
      }

      // 4. switchActiveSchool
      if (action === 'switchActiveSchool') {
        if (!isSysAdmin) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              status: 'error',
              code: 'SCHOOL_SWITCH_NOT_ALLOWED',
              message: 'تبديل المدرسة مخصص حصرياً لمدير النظام الشامل.',
            }),
          };
        }

        const targetId = String(body.data?.targetSchoolId || '').trim().toUpperCase();
        const schoolObj = simulatedMasterRegistry.find(s => s.schoolId === targetId);

        if (!schoolObj) {
          return {
            ok: false,
            status: 404,
            json: async () => ({
              status: 'error',
              code: 'SCHOOL_NOT_FOUND',
              message: 'المدرسة المطلوبة غير موجودة في سجل المدارس المعتمد',
            }),
          };
        }

        if (schoolObj.status !== 'Active') {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              status: 'error',
              code: 'SCHOOL_INACTIVE',
              message: 'المدرسة المطلوبة غير مفعلة حالياً في النظام',
            }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            user: { activeSchoolId: targetId },
            school: {
              schoolId: schoolObj.schoolId,
              schoolCode: schoolObj.schoolCode,
              schoolName: schoolObj.schoolName,
              status: schoolObj.status,
            },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({ status: 'success' }) };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------
  // 1. GET MANAGED SCHOOLS (RBAC & DTO SANITIZATION)
  // -------------------------------------------------------------
  describe('1. Get Managed Schools', () => {
    it('SystemAdmin adminGetSchools = PASS with sanitized safe DTOs', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const res = await schoolAdminService.getManagedSchools();

      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data?.length).toBe(2);

      const badr = res.data?.find(s => s.schoolId === 'SCH-BADR');
      expect(badr).toBeDefined();
      expect(badr?.schoolCode).toBe('BADR');
      expect(badr?.schoolName).toBe('مدرسة بدر الوطنية للتكنولوجيا التطبيقية');
      expect(badr?.status).toBe('Active');

      // Crucial: spreadsheetId must NOT be returned in safe DTO
      expect((badr as any)?.spreadsheetId).toBeUndefined();
    });

    it('SchoolAdmin adminGetSchools = DENIED (Client & Backend Auth Guard)', async () => {
      storageService.setCurrentUser(schoolAdminUser);

      const res = await schoolAdminService.getManagedSchools();

      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN_SYSTEM_ADMIN_ONLY');
      expect(res.data).toBeUndefined();
    });
  });

  // -------------------------------------------------------------
  // 2. CREATE SCHOOL (SYSTEMADMIN ONLY, VALIDATION, DUPLICATES)
  // -------------------------------------------------------------
  describe('2. Create School', () => {
    it('SystemAdmin create school = PASS and syncs registry cache with Inactive default status', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const input = {
        schoolCode: 'OCTOBER',
        schoolName: 'مدرسة أكتوبر الوطنية للعلوم والتقنية',
        schoolId: 'SCH-OCTOBER',
      };

      const res = await schoolAdminService.createSchool(input);

      expect(res.success).toBe(true);
      expect(res.data?.schoolId).toBe('SCH-OCTOBER');
      expect(res.data?.schoolCode).toBe('OCTOBER');
      expect(res.data?.schoolName).toBe('مدرسة أكتوبر الوطنية للعلوم والتقنية');
      // Crucial: New school default status is Inactive
      expect(res.data?.status).toBe('Inactive');

      // Crucial: spreadsheetId must NEVER be returned in public DTO
      expect((res.data as any)?.spreadsheetId).toBeUndefined();

      // Registry cache sync check: newly created school exists in client cache
      const cached = storageService.getSchools();
      const cachedOctober = cached.find(s => s.schoolId === 'SCH-OCTOBER');
      expect(cachedOctober).toBeDefined();
      expect(cachedOctober?.status).toBe('Inactive');
      expect((cachedOctober as any)?.spreadsheetId).toBeUndefined();
    });

    it('SchoolAdmin create school = DENIED', async () => {
      storageService.setCurrentUser(schoolAdminUser);

      const input = {
        schoolCode: 'HACKED',
        schoolName: 'مدرسة غير مصرح بها',
      };

      const res = await schoolAdminService.createSchool(input);

      expect(res.success).toBe(false);
      expect(res.code).toBe('FORBIDDEN_SYSTEM_ADMIN_ONLY');
    });

    it('duplicate schoolId = BLOCKED', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const input = {
        schoolCode: 'UNIQUE_CODE',
        schoolName: 'مدرسة جديدة مكررة المعرف',
        schoolId: 'SCH-BADR', // Already exists
      };

      const res = await schoolAdminService.createSchool(input);

      expect(res.success).toBe(false);
      expect(res.code).toBe('SCHOOL_EXISTS');
    });

    it('duplicate schoolCode = BLOCKED', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const input = {
        schoolCode: 'BADR', // Code already exists
        schoolName: 'مدرسة أخرى بكود بدر',
        schoolId: 'SCH-DIFF',
      };

      const res = await schoolAdminService.createSchool(input);

      expect(res.success).toBe(false);
      expect(res.code).toBe('SCHOOL_EXISTS');
    });

    it('invalid/blank schoolName = BLOCKED', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const input = {
        schoolCode: 'NEW_CODE',
        schoolName: '   ', // Blank
      };

      const res = await schoolAdminService.createSchool(input);

      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_SCHOOL_NAME');
    });

    it('invalid/blank schoolCode = BLOCKED', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const input = {
        schoolCode: '   ', // Blank
        schoolName: 'مدرسة برمز فارغ',
      };

      const res = await schoolAdminService.createSchool(input);

      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_SCHOOL_CODE');
    });
  });

  // -------------------------------------------------------------
  // 3. UPDATE SCHOOL & IMMUTABILITY
  // -------------------------------------------------------------
  describe('3. Update School', () => {
    it('update school name = PASS', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const res = await schoolAdminService.updateSchool('SCH-BADR', {
        schoolName: 'مدرسة بدر الوطنية المحدثة',
      });

      expect(res.success).toBe(true);
      expect(res.data?.schoolName).toBe('مدرسة بدر الوطنية المحدثة');

      // Verified in local cache
      const cached = storageService.getSchools();
      expect(cached.find(s => s.schoolId === 'SCH-BADR')?.schoolName).toBe('مدرسة بدر الوطنية المحدثة');
    });

    it('update school status (Active -> Inactive) = PASS', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const res = await schoolAdminService.updateSchool('SCH-DAMIETTA', {
        status: 'Inactive',
      });

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe('Inactive');

      // Inactive school remains preserved in registry cache
      const cached = storageService.getSchools();
      const damietta = cached.find(s => s.schoolId === 'SCH-DAMIETTA');
      expect(damietta).toBeDefined();
      expect(damietta?.status).toBe('Inactive');
    });

    it('schoolId mutation = BLOCKED (Immutability Enforced)', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const res = await schoolAdminService.updateSchool('SCH-BADR', {
        schoolId: 'SCH-ATTEMPTED-CHANGE',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('IMMUTABLE_SCHOOL_ID');
    });

    it('duplicate schoolCode on update = BLOCKED', async () => {
      storageService.setCurrentUser(sysAdminUser);

      // Attempting to change Damietta's code to BADR
      const res = await schoolAdminService.updateSchool('SCH-DAMIETTA', {
        schoolCode: 'BADR',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('DUPLICATE_SCHOOL_CODE');
    });

    it('invalid status on update = BLOCKED', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const res = await schoolAdminService.updateSchool('SCH-BADR', {
        status: 'Deleted' as any,
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('INVALID_SCHOOL_STATUS');
    });
  });

  // -------------------------------------------------------------
  // 4. INACTIVE SCHOOL INVARIANTS & SWITCHING PROTECTION
  // -------------------------------------------------------------
  describe('4. Inactive School Invariants', () => {
    it('inactive school is preserved in registry and cannot be selected by switchActiveSchool', async () => {
      storageService.setCurrentUser(sysAdminUser);

      // 1. Mark Damietta as Inactive
      const updateRes = await schoolAdminService.updateSchool('SCH-DAMIETTA', {
        status: 'Inactive',
      });
      expect(updateRes.success).toBe(true);
      expect(updateRes.data?.status).toBe('Inactive');

      // 2. Preserved in Master Registry (not deleted)
      const managed = await schoolAdminService.getManagedSchools();
      const damietta = managed.data?.find(s => s.schoolId === 'SCH-DAMIETTA');
      expect(damietta).toBeDefined();
      expect(damietta?.status).toBe('Inactive');

      // 3. Attempting to switch active school into Inactive school fails-closed
      const switchRes = await storageService.switchActiveSchool('SCH-DAMIETTA');
      expect(switchRes.success).toBe(false);
      expect(switchRes.code).toBe('SCHOOL_INACTIVE');

      // Active school remains unchanged
      expect(storageService.getCurrentUser()?.activeSchoolId).toBe('SCH-BADR');
    });
  });

  // -------------------------------------------------------------
  // 5. SECURITY & ZERO SPREADSHEET ID EXPOSURE
  // -------------------------------------------------------------
  describe('5. Security & Zero Spreadsheet ID Exposure', () => {
    it('spreadsheetId is absent from safe DTO', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const res = await schoolAdminService.getManagedSchools();
      expect(res.success).toBe(true);

      for (const s of res.data || []) {
        expect((s as any).spreadsheetId).toBeUndefined();
      }
    });

    it('spreadsheetId is absent from client cache (localStorage)', async () => {
      storageService.setCurrentUser(sysAdminUser);

      await schoolAdminService.createSchool({
        schoolCode: 'NO_LEAK',
        schoolName: 'مدرسة عدم تسريب المعرف',
      });

      const rawCache = localStorage.getItem(MASTER_SCHOOLS_KEY);
      expect(rawCache).not.toBeNull();
      expect(rawCache?.includes('spreadsheetId')).toBe(false);
    });

    it('spreadsheetId is absent from audit events', async () => {
      storageService.setCurrentUser(sysAdminUser);

      await schoolAdminService.createSchool({
        schoolCode: 'AUDIT_SAFE',
        schoolName: 'مدرسة آمنة في سجل التدقيق',
      });

      await schoolAdminService.updateSchool('SCH-AUDIT_SAFE', {
        schoolName: 'مدرسة آمنة محدثة في التدقيق',
      });

      for (const log of simulatedAuditLogs) {
        const strLog = JSON.stringify(log);
        expect(strLog.includes('spreadsheetId')).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------
  // 6. REGISTRY REFRESH AFTER OPERATIONS
  // -------------------------------------------------------------
  describe('6. Registry Cache Refresh', () => {
    it('registry refresh reflects newly created school in storageService.getSchools()', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const before = storageService.getSchools().length;

      await schoolAdminService.createSchool({
        schoolCode: 'REFRESH_TEST',
        schoolName: 'مدرسة اختبار التحديث',
      });

      const after = storageService.getSchools();
      expect(after.length).toBe(before + 1);
      expect(after.some(s => s.schoolCode === 'REFRESH_TEST')).toBe(true);
    });

    it('registry refresh reflects updated fields in storageService.getSchools()', async () => {
      storageService.setCurrentUser(sysAdminUser);

      await schoolAdminService.updateSchool('SCH-BADR', {
        schoolName: 'اسم جديد مجدد',
      });

      const schools = storageService.getSchools();
      const updated = schools.find(s => s.schoolId === 'SCH-BADR');
      expect(updated?.schoolName).toBe('اسم جديد مجدد');
    });
  });

  // -------------------------------------------------------------
  // 7. SERVER-ONLY SPREADSHEET BINDING HARDENING (PHASE 3C-A14.1.1)
  // -------------------------------------------------------------
  describe('7. Server-Only School Spreadsheet Binding Hardening (Phase 3C-A14.1.1)', () => {
    it('Frontend create request body NEVER contains spreadsheetId', async () => {
      storageService.setCurrentUser(sysAdminUser);

      await schoolAdminService.createSchool({
        schoolCode: 'CHECK_REQ',
        schoolName: 'مدرسة فحص الطلب الصادر',
        schoolId: 'SCH-CHECK_REQ',
      });

      expect(lastOutgoingFetchBody).not.toBeNull();
      expect(lastOutgoingFetchBody.action).toBe('adminCreateSchool');
      expect(lastOutgoingFetchBody.school).toBeDefined();
      expect('spreadsheetId' in lastOutgoingFetchBody.school).toBe(false);
      expect('spreadsheetId' in lastOutgoingFetchBody).toBe(false);
      expect(JSON.stringify(lastOutgoingFetchBody).includes('spreadsheetId')).toBe(false);
    });

    it('Malicious client spreadsheetId is BLOCKED with CLIENT_SPREADSHEET_BINDING_FORBIDDEN', async () => {
      // Direct raw fetch simulation where a rogue client tries to inject spreadsheetId
      const scriptUrl = storageService.getBackendUrl();
      const rawRes = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'adminCreateSchool',
          sessionToken: sysAdminUser.sessionToken,
          school: {
            schoolId: 'SCH-MALICIOUS',
            schoolCode: 'MALICIOUS',
            schoolName: 'مدرسة محاولة اختراق الربط',
            spreadsheetId: 'hacked-external-sheet-id',
          },
        }),
      });

      expect(rawRes.ok).toBe(false);
      expect(rawRes.status).toBe(403);
      const data = await rawRes.json();
      expect(data.code).toBe('CLIENT_SPREADSHEET_BINDING_FORBIDDEN');
    });

    it('New school default status is strictly Inactive with empty spreadsheetId in Master Registry', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const res = await schoolAdminService.createSchool({
        schoolCode: 'NEW_UNBOUND',
        schoolName: 'مدرسة جديدة غير مربوطة',
        schoolId: 'SCH-NEW_UNBOUND',
      });

      expect(res.success).toBe(true);
      expect(res.data?.status).toBe('Inactive');

      // Verify simulated backend internal row
      const internalRow = simulatedMasterRegistry.find(s => s.schoolId === 'SCH-NEW_UNBOUND');
      expect(internalRow).toBeDefined();
      expect(internalRow?.status).toBe('Inactive');
      expect(internalRow?.spreadsheetId).toBe('');
    });

    it('Activate unbound school is BLOCKED with SCHOOL_SPREADSHEET_NOT_BOUND', async () => {
      storageService.setCurrentUser(sysAdminUser);

      // Create new unbound school (status: Inactive)
      await schoolAdminService.createSchool({
        schoolCode: 'UNBOUND_ACTIVATE',
        schoolName: 'مدرسة غير مربوطة للتفعيل',
        schoolId: 'SCH-UNBOUND_ACTIVATE',
      });

      // Attempting to activate without spreadsheet binding fails-closed
      const res = await schoolAdminService.updateSchool('SCH-UNBOUND_ACTIVATE', {
        status: 'Active',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('SCHOOL_SPREADSHEET_NOT_BOUND');

      // School status remains Inactive
      const internalRow = simulatedMasterRegistry.find(s => s.schoolId === 'SCH-UNBOUND_ACTIVATE');
      expect(internalRow?.status).toBe('Inactive');
    });

    it('Activate school with invalid/unreachable spreadsheet is BLOCKED with SCHOOL_SPREADSHEET_INVALID', async () => {
      storageService.setCurrentUser(sysAdminUser);

      // Seed a school with an invalid spreadsheet binding
      simulatedMasterRegistry.push({
        schoolId: 'SCH-INVALID-BIND',
        schoolCode: 'INVALID_BIND',
        schoolName: 'مدرسة بجدول غير صالح',
        spreadsheetId: 'INVALID_SS_ID',
        status: 'Inactive',
        createdAt: '2026-09-25T12:00:00.000Z',
        updatedAt: '2026-09-25T12:00:00.000Z',
      });

      const res = await schoolAdminService.updateSchool('SCH-INVALID-BIND', {
        status: 'Active',
      });

      expect(res.success).toBe(false);
      expect(res.code).toBe('SCHOOL_SPREADSHEET_INVALID');

      const internalRow = simulatedMasterRegistry.find(s => s.schoolId === 'SCH-INVALID-BIND');
      expect(internalRow?.status).toBe('Inactive');
    });

    it('Bind through public API actions is ABSENT / REJECTED', async () => {
      const scriptUrl = storageService.getBackendUrl();

      const forbiddenActions = [
        'bindSchoolSpreadsheet',
        'bindSchoolSpreadsheetFromScriptProperties',
        'setSchoolSpreadsheetId',
        'updateSpreadsheetId',
      ];

      for (const forbiddenAction of forbiddenActions) {
        const res = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: forbiddenAction,
            sessionToken: sysAdminUser.sessionToken,
            schoolId: 'SCH-BADR',
            spreadsheetId: 'injected-id',
          }),
        });

        expect(res.ok).toBe(false);
        const data = await res.json();
        expect(data.code).toBe('ACTION_NOT_FOUND');
      }
    });

    it('Switch active school to unbound/inactive school fails-closed', async () => {
      storageService.setCurrentUser({
        ...sysAdminUser,
        allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA', 'SCH-UNSWITCHABLE'],
      });

      await schoolAdminService.createSchool({
        schoolCode: 'UNSWITCHABLE',
        schoolName: 'مدرسة غير مفعلة للتبديل',
        schoolId: 'SCH-UNSWITCHABLE',
      });

      const switchRes = await storageService.switchActiveSchool('SCH-UNSWITCHABLE');
      expect(switchRes.success).toBe(false);
      expect(switchRes.code).toBe('SCHOOL_INACTIVE');
      expect(storageService.getCurrentUser()?.activeSchoolId).toBe('SCH-BADR');
    });
  });

  // -------------------------------------------------------------
  // 8. DIRECT GOOGLE APPS SCRIPT Code.gs EVALUATION
  // -------------------------------------------------------------
  describe('8. Direct Google Apps Script Code.gs Evaluation', () => {
    it('bindSchoolSpreadsheetFromScriptProperties is NOT in doPost routing or doGet routing', () => {
      const { context } = createGasTestEnv();

      const postRes = context.doPost({
        postData: {
          contents: JSON.stringify({ action: 'bindSchoolSpreadsheetFromScriptProperties', schoolId: 'SCH-BADR' }),
        },
      });
      const postBody = JSON.parse(postRes.getContent());
      expect(postBody.status).not.toBe('success');

      const getRes = context.doGet({
        parameter: { action: 'bindSchoolSpreadsheetFromScriptProperties' },
      });
      const getBody = JSON.parse(getRes.getContent());
      expect(getBody.status).not.toBe('success');
    });

    it('Code.gs adminCreateSchool blocks client-provided spreadsheetId with CLIENT_SPREADSHEET_BINDING_FORBIDDEN', () => {
      const initialUsers = [
        [
          'u-sys', 'sysadmin', 'hash', 'salt', 'PBKDF2', 10000,
          'مدير النظام', 'SystemAdmin', 'Active', 'Admin', 'sys@ntss.edu.eg', '', '["*"]',
          'EMP-01', '2026-09-01T00:00:00.000Z', '', '',
        ],
      ];
      const initialSchools = [
        ['SCH-BADR', 'BADR', 'مدرسة بدر', 'ss-badr-id', 'Active', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
      ];

      const { context } = createGasTestEnv({ initialUsers, initialSchools });

      // Create session for sysadmin
      const loginRes = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'login',
            username: 'sysadmin',
            password: 'password', // will fail unless mock, let's inject session directly
          }),
        },
      });

      // Instead inject active session in Sessions sheet directly
      const sessionToken = 'tok-sysadmin-gas-direct';
      const tokenHash = Array.from(crypto.createHash('sha256').update(sessionToken, 'utf8').digest())
        .map(b => (b < 16 ? '0' : '') + b.toString(16)).join('');
      
      const sessionSheet = context.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sessions');
      sessionSheet.appendRow([
        'sess-1', tokenHash, 'u-sys', 'sysadmin', 'مدير النظام', 'SystemAdmin', '',
        'sys@ntss.edu.eg', 'GLOBAL', '["*"]', 'SCH-BADR', 'EMP-01',
        '2026-09-25T10:00:00.000Z', '2099-01-01T00:00:00.000Z', 'Active',
      ]);

      // Call adminCreateSchool with client spreadsheetId
      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'adminCreateSchool',
            sessionToken: sessionToken,
            school: {
              schoolId: 'SCH-MAL',
              schoolCode: 'MAL',
              schoolName: 'مدرسة تسريب',
              spreadsheetId: 'leak-sheet-id',
            },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('error');
      expect(body.code).toBe('CLIENT_SPREADSHEET_BINDING_FORBIDDEN');
    });

    it('Code.gs adminCreateSchool defaults new school to Inactive with empty spreadsheetId', () => {
      const initialUsers = [
        [
          'u-sys', 'sysadmin', 'hash', 'salt', 'PBKDF2', 10000,
          'مدير النظام', 'SystemAdmin', 'Active', 'Admin', 'sys@ntss.edu.eg', '', '["*"]',
          'EMP-01', '2026-09-01T00:00:00.000Z', '', '',
        ],
      ];
      const initialSchools = [
        ['SCH-BADR', 'BADR', 'مدرسة بدر', 'ss-badr-id', 'Active', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
      ];

      const { context, sheets } = createGasTestEnv({ initialUsers, initialSchools });

      const sessionToken = 'tok-sysadmin-gas-direct-2';
      const tokenHash = Array.from(crypto.createHash('sha256').update(sessionToken, 'utf8').digest())
        .map(b => (b < 16 ? '0' : '') + b.toString(16)).join('');
      
      const sessionSheet = sheets['Sessions'];
      sessionSheet.appendRow([
        'sess-2', tokenHash, 'u-sys', 'sysadmin', 'مدير النظام', 'SystemAdmin', '',
        'sys@ntss.edu.eg', 'GLOBAL', '["*"]', 'SCH-BADR', 'EMP-01',
        '2026-09-25T10:00:00.000Z', '2099-01-01T00:00:00.000Z', 'Active',
      ]);

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'adminCreateSchool',
            sessionToken: sessionToken,
            school: {
              schoolId: 'SCH-NEW-GAS',
              schoolCode: 'NEWGAS',
              schoolName: 'مدرسة غاز الجديدة',
            },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('success');
      expect(body.school.status).toBe('Inactive');
      expect(body.school.spreadsheetId).toBeUndefined();

      // Check Master_Schools row
      const masterRows = sheets['Master_Schools'].getDataRange().getValues();
      const newRow = masterRows.find(r => r[0] === 'SCH-NEW-GAS');
      expect(newRow).toBeDefined();
      expect(newRow[3]).toBe(''); // spreadsheetId is empty
      expect(newRow[4]).toBe('Inactive'); // status is Inactive
    });

    it('Code.gs adminUpdateSchool blocks activating unbound school with SCHOOL_SPREADSHEET_NOT_BOUND', () => {
      const initialUsers = [
        [
          'u-sys', 'sysadmin', 'hash', 'salt', 'PBKDF2', 10000,
          'مدير النظام', 'SystemAdmin', 'Active', 'Admin', 'sys@ntss.edu.eg', '', '["*"]',
          'EMP-01', '2026-09-01T00:00:00.000Z', '', '',
        ],
      ];
      const initialSchools = [
        ['SCH-UNBOUND', 'UNBOUND', 'مدرسة غير مربوطة', '', 'Inactive', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
      ];

      const { context, sheets } = createGasTestEnv({ initialUsers, initialSchools });

      const sessionToken = 'tok-sysadmin-gas-direct-3';
      const tokenHash = Array.from(crypto.createHash('sha256').update(sessionToken, 'utf8').digest())
        .map(b => (b < 16 ? '0' : '') + b.toString(16)).join('');
      
      const sessionSheet = sheets['Sessions'];
      sessionSheet.appendRow([
        'sess-3', tokenHash, 'u-sys', 'sysadmin', 'مدير النظام', 'SystemAdmin', '',
        'sys@ntss.edu.eg', 'GLOBAL', '["*"]', '', 'EMP-01',
        '2026-09-25T10:00:00.000Z', '2099-01-01T00:00:00.000Z', 'Active',
      ]);

      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'adminUpdateSchool',
            sessionToken: sessionToken,
            schoolId: 'SCH-UNBOUND',
            updates: { status: 'Active' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('error');
      expect(body.code).toBe('SCHOOL_SPREADSHEET_NOT_BOUND');
    });

    it('bindSchoolSpreadsheetFromScriptProperties fails if Script Property is missing', () => {
      const initialSchools = [
        ['SCH-NEW', 'NEW', 'مدرسة جديدة', '', 'Inactive', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
      ];

      const { context } = createGasTestEnv({ initialSchools, properties: {} });

      expect(() => {
        context.bindSchoolSpreadsheetFromScriptProperties('SCH-NEW');
      }).toThrow(/SPREADSHEET_PROPERTY_NOT_FOUND/);
    });

    it('bindSchoolSpreadsheetFromScriptProperties fails if spreadsheet cannot be opened', () => {
      const initialSchools = [
        ['SCH-NEW', 'NEW', 'مدرسة جديدة', '', 'Inactive', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
      ];

      const { context } = createGasTestEnv({
        initialSchools,
        properties: {
          'SCHOOL_SPREADSHEET_ID__SCH_NEW': 'unreachable-sheet-id',
        },
        failingSpreadsheetIds: ['unreachable-sheet-id'],
      });

      expect(() => {
        context.bindSchoolSpreadsheetFromScriptProperties('SCH-NEW');
      }).toThrow(/INVALID_SCHOOL_SPREADSHEET/);
    });

    it('bindSchoolSpreadsheetFromScriptProperties binds valid spreadsheet and records safe audit', () => {
      const initialSchools = [
        ['SCH-ALEX', 'ALEX', 'مدرسة الإسكندرية', '', 'Inactive', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
      ];

      const { context, sheets } = createGasTestEnv({
        initialSchools,
        properties: {
          'SCHOOL_SPREADSHEET_ID__SCH_ALEX': 'valid-alex-sheet-999',
        },
      });

      const result = context.bindSchoolSpreadsheetFromScriptProperties('SCH-ALEX', false);
      expect(result.success).toBe(true);
      expect(result.schoolId).toBe('SCH-ALEX');
      expect(result.status).toBe('Inactive'); // Remains inactive unless explicitly activated

      // Verify spreadsheetId bound in Master_Schools
      const masterRows = sheets['Master_Schools'].getDataRange().getValues();
      const alexRow = masterRows.find(r => r[0] === 'SCH-ALEX');
      expect(alexRow[3]).toBe('valid-alex-sheet-999');
      expect(alexRow[4]).toBe('Inactive');

      // Verify Audit_Logs
      const auditRows = sheets['Audit_Logs'].getDataRange().getValues();
      const boundAudit = auditRows.find(r => r[4] === 'SCHOOL_SPREADSHEET_BOUND');
      expect(boundAudit).toBeDefined();
      expect(boundAudit[6]).toBe('SCH-ALEX');
      // Crucial: spreadsheetId must NOT appear in audit details
      expect(boundAudit[7]).not.toContain('valid-alex-sheet-999');
    });

    it('bindSchoolSpreadsheetFromScriptProperties with optActivate: true activates school and records audit', () => {
      const initialSchools = [
        ['SCH-ASWAN', 'ASWAN', 'مدرسة أسوان', '', 'Inactive', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
      ];

      const { context, sheets } = createGasTestEnv({
        initialSchools,
        properties: {
          'SCHOOL_SPREADSHEET_ID__SCH_ASWAN': 'valid-aswan-sheet-777',
        },
      });

      const result = context.bindSchoolSpreadsheetFromScriptProperties('SCH-ASWAN', true);
      expect(result.success).toBe(true);
      expect(result.status).toBe('Active');

      const masterRows = sheets['Master_Schools'].getDataRange().getValues();
      const aswanRow = masterRows.find(r => r[0] === 'SCH-ASWAN');
      expect(aswanRow[3]).toBe('valid-aswan-sheet-777');
      expect(aswanRow[4]).toBe('Active');

      const auditRows = sheets['Audit_Logs'].getDataRange().getValues();
      const actAudit = auditRows.find(r => r[4] === 'SCHOOL_ACTIVATED');
      expect(actAudit).toBeDefined();
      expect(actAudit[6]).toBe('SCH-ASWAN');
      expect(actAudit[7]).not.toContain('valid-aswan-sheet-777');
    });

    it('activation via adminUpdateSchool succeeds once valid spreadsheet is bound', () => {
      const initialUsers = [
        [
          'u-sys', 'sysadmin', 'hash', 'salt', 'PBKDF2', 10000,
          'مدير النظام', 'SystemAdmin', 'Active', 'Admin', 'sys@ntss.edu.eg', '', '["*"]',
          'EMP-01', '2026-09-01T00:00:00.000Z', '', '',
        ],
      ];
      const initialSchools = [
        ['SCH-LUXOR', 'LUXOR', 'مدرسة الأقصر', '', 'Inactive', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
      ];

      const { context, sheets } = createGasTestEnv({
        initialUsers,
        initialSchools,
        properties: {
          'SCHOOL_SPREADSHEET_ID__SCH_LUXOR': 'valid-luxor-sheet-555',
        },
      });

      const sessionToken = 'tok-sysadmin-luxor';
      const tokenHash = Array.from(crypto.createHash('sha256').update(sessionToken, 'utf8').digest())
        .map(b => (b < 16 ? '0' : '') + b.toString(16)).join('');
      
      sheets['Sessions'].appendRow([
        'sess-luxor', tokenHash, 'u-sys', 'sysadmin', 'مدير النظام', 'SystemAdmin', '',
        'sys@ntss.edu.eg', 'GLOBAL', '["*"]', '', 'EMP-01',
        '2026-09-25T10:00:00.000Z', '2099-01-01T00:00:00.000Z', 'Active',
      ]);

      // 1. First, bind spreadsheet via server function
      context.bindSchoolSpreadsheetFromScriptProperties('SCH-LUXOR', false);

      // 2. Now activate via adminUpdateSchool API
      const res = context.doPost({
        postData: {
          contents: JSON.stringify({
            action: 'adminUpdateSchool',
            sessionToken: sessionToken,
            schoolId: 'SCH-LUXOR',
            updates: { status: 'Active' },
          }),
        },
      });

      const body = JSON.parse(res.getContent());
      expect(body.status).toBe('success');
      expect(body.school.status).toBe('Active');

      // 3. Verify Master_Schools
      const masterRows = sheets['Master_Schools'].getDataRange().getValues();
      const luxorRow = masterRows.find(r => r[0] === 'SCH-LUXOR');
      expect(luxorRow[4]).toBe('Active');
    });
  });
});
