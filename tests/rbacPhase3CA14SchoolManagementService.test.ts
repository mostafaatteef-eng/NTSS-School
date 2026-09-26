// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { schoolAdminService } from '../src/services/schoolAdminService';
import { storageService } from '../src/services/storageService';
import { MASTER_SCHOOLS_KEY } from '../src/services/migrationScope014MultiSchool';
import { School, User } from '../src/types';

describe('PHASE 3C-A14.1 — SYSTEMADMIN SCHOOL MANAGEMENT SERVICE LAYER', () => {
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
    fullName: 'مدير مدرسة بدر',
    role: 'SchoolAdmin',
    accessScope: 'SCHOOL',
    schoolId: 'SCH-BADR',
    allowedSchoolIds: ['SCH-BADR'],
    sessionToken: 'tok-authoritative-schadmin-token-54321',
    status: 'Active',
    isActive: true,
  };

  let simulatedMasterRegistry: (School & { spreadsheetId?: string })[] = [];
  let simulatedAuditLogs: any[] = [];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

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
      const { action, sessionToken, school, schoolId, updates } = body;

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

        const created = {
          schoolId: newId,
          schoolCode: newCode,
          schoolName: newName,
          spreadsheetId: school?.spreadsheetId || '',
          status: 'Active' as const,
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
          changedFields.status = { from: target.status, to: newStatus };
          target.status = newStatus as 'Active' | 'Inactive';
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
    it('SystemAdmin create school = PASS and syncs registry cache', async () => {
      storageService.setCurrentUser(sysAdminUser);

      const input = {
        schoolCode: 'OCTOBER',
        schoolName: 'مدرسة أكتوبر الوطنية للعلوم والتقنية',
        schoolId: 'SCH-OCTOBER',
        spreadsheetId: 'secret-raw-spreadsheet-october-id',
      };

      const res = await schoolAdminService.createSchool(input);

      expect(res.success).toBe(true);
      expect(res.data?.schoolId).toBe('SCH-OCTOBER');
      expect(res.data?.schoolCode).toBe('OCTOBER');
      expect(res.data?.schoolName).toBe('مدرسة أكتوبر الوطنية للعلوم والتقنية');
      expect(res.data?.status).toBe('Active');

      // Crucial: spreadsheetId must NEVER be returned in public DTO
      expect((res.data as any)?.spreadsheetId).toBeUndefined();

      // Registry cache sync check: newly created school exists in client cache
      const cached = storageService.getSchools();
      const cachedOctober = cached.find(s => s.schoolId === 'SCH-OCTOBER');
      expect(cachedOctober).toBeDefined();
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
        spreadsheetId: 'secret-raw-spreadsheet-no-leak',
      });

      const rawCache = localStorage.getItem(MASTER_SCHOOLS_KEY);
      expect(rawCache).not.toBeNull();
      expect(rawCache?.includes('secret-raw-spreadsheet-no-leak')).toBe(false);
      expect(rawCache?.includes('spreadsheetId')).toBe(false);
    });

    it('spreadsheetId is absent from audit events', async () => {
      storageService.setCurrentUser(sysAdminUser);

      await schoolAdminService.createSchool({
        schoolCode: 'AUDIT_SAFE',
        schoolName: 'مدرسة آمنة في سجل التدقيق',
        spreadsheetId: 'secret-forbidden-audit-id',
      });

      await schoolAdminService.updateSchool('SCH-AUDIT_SAFE', {
        schoolName: 'مدرسة آمنة محدثة في التدقيق',
      });

      for (const log of simulatedAuditLogs) {
        const strLog = JSON.stringify(log);
        expect(strLog.includes('secret-forbidden-audit-id')).toBe(false);
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
});
