/**
 * Phase 3C-A14.1: SystemAdmin School Management Service Layer.
 * Provides authoritative administrative operations for managing multi-tenant schools.
 * 
 * Strict Security Invariants:
 * 1. All administrative operations are restricted to SystemAdmin with GLOBAL scope.
 * 2. Backend Google Apps Script (Master Spreadsheet) remains the single source of truth.
 * 3. Client checks act as UX guards; backend enforces authoritative RBAC (schools.manage).
 * 4. spreadsheetId is NEVER persisted in client storage, logs, or public School DTOs.
 * 5. Inactive schools are preserved in the registry (no physical deletion) and cannot be switched into.
 * 6. schoolId is strictly immutable.
 */

import { School, User } from '../types';
import { storageService } from './storageService';
import { MASTER_SCHOOLS_KEY } from './migrationScope014MultiSchool';

export interface CreateSchoolInput {
  schoolCode: string;
  schoolName: string;
  schoolId?: string;
}

export interface UpdateSchoolInput {
  schoolName?: string;
  schoolCode?: string;
  status?: 'Active' | 'Inactive';
  schoolId?: string; // Included to validate immutability
}

export interface SchoolAdminOperationResult<T = any> {
  success: boolean;
  code?: string;
  message: string;
  data?: T;
}

export class SchoolAdminService {
  private static instance: SchoolAdminService | null = null;

  public static getInstance(): SchoolAdminService {
    if (!SchoolAdminService.instance) {
      SchoolAdminService.instance = new SchoolAdminService();
    }
    return SchoolAdminService.instance;
  }

  /**
   * Helper: Validates that caller is an authenticated SystemAdmin with GLOBAL accessScope.
   * Acts as a Frontend UX guard. Backend remains the authoritative gatekeeper.
   */
  private validateSystemAdminCaller(caller?: User | null): { allowed: boolean; user?: User; error?: SchoolAdminOperationResult } {
    const user = caller !== undefined ? caller : storageService.getCurrentUser();
    if (!user || !storageService.isAuthenticated(user)) {
      return {
        allowed: false,
        error: {
          success: false,
          code: 'AUTH_REQUIRED',
          message: 'يجب تسجيل الدخول بجلسة معتمدة لإدارة المدارس.',
        },
      };
    }

    if (user.role !== 'SystemAdmin' || user.accessScope !== 'GLOBAL') {
      return {
        allowed: false,
        error: {
          success: false,
          code: 'FORBIDDEN_SYSTEM_ADMIN_ONLY',
          message: 'صلاحية مرفوضة: هذا الإجراء مخصص حصرياً لمدير النظام الشامل (SystemAdmin).',
        },
      };
    }

    return { allowed: true, user };
  }

  /**
   * Helper: Sanitizes any school record into a safe, client-facing School DTO.
   * Strictly purges spreadsheetId, secrets, tokens, or script internal attributes.
   */
  public sanitizeSchoolDto(rawSchool: any): School {
    return {
      schoolId: String(rawSchool?.schoolId || '').trim().toUpperCase(),
      schoolCode: String(rawSchool?.schoolCode || '').trim().toUpperCase(),
      schoolName: String(rawSchool?.schoolName || '').trim(),
      status: String(rawSchool?.status || '').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
      createdAt: rawSchool?.createdAt || undefined,
      updatedAt: rawSchool?.updatedAt || undefined,
    };
  }

  /**
   * Synchronizes the client-side master schools registry cache with safe DTOs.
   * NEVER saves spreadsheetId to localStorage.
   */
  public syncClientSchoolsCache(schools: School[]): void {
    try {
      const safeList = schools.map(s => this.sanitizeSchoolDto(s));
      localStorage.setItem(MASTER_SCHOOLS_KEY, JSON.stringify(safeList));
      storageService.notifyChange();
    } catch (e) {
      console.warn('Failed to sync master schools cache to localStorage:', e);
    }
  }

  /**
   * Retrieves all managed schools directly from Backend Master Registry (adminGetSchools).
   * Authorized strictly for SystemAdmin. Returns sanitized School DTOs.
   */
  public async getManagedSchools(caller?: User | null): Promise<SchoolAdminOperationResult<School[]>> {
    const check = this.validateSystemAdminCaller(caller);
    if (!check.allowed || !check.user) {
      return check.error!;
    }
    const user = check.user;

    const scriptUrl = storageService.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return {
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'تعذر الاتصال بالخادم الرئيسي لإدارة المدارس.',
      };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'adminGetSchools',
          sessionToken: user.sessionToken,
        }),
      });

      if (!response.ok) {
        try {
          const errRes = await response.json();
          if (errRes && errRes.code) {
            return {
              success: false,
              code: errRes.code,
              message: errRes.message || `خطأ في استجابة الخادم (${response.status}) أثناء جلب المدارس.`,
            };
          }
        } catch {}
        return {
          success: false,
          code: `HTTP_${response.status}`,
          message: `خطأ في استجابة الخادم (${response.status}) أثناء جلب المدارس.`,
        };
      }

      const res = await response.json();
      if (res.status === 'success' && Array.isArray(res.schools)) {
        const safeSchools: School[] = res.schools.map((s: any) => this.sanitizeSchoolDto(s));
        this.syncClientSchoolsCache(safeSchools);
        return {
          success: true,
          message: 'تم استرجاع قائمة المدارس بنجاح.',
          data: safeSchools,
        };
      }

      return {
        success: false,
        code: res.code || 'GET_SCHOOLS_FAILED',
        message: res.message || 'فشل استرجاع قائمة المدارس من الخادم.',
      };
    } catch (err: any) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: err?.message || 'حدث خطأ في الاتصال بالخادم أثناء استرجاع المدارس.',
      };
    }
  }

  /**
   * Registers a new school into the Master Registry via adminCreateSchool.
   * Enforces client-side validation and delegates authoritative creation to Backend.
   */
  public async createSchool(
    input: CreateSchoolInput,
    caller?: User | null
  ): Promise<SchoolAdminOperationResult<School>> {
    const check = this.validateSystemAdminCaller(caller);
    if (!check.allowed || !check.user) {
      return check.error!;
    }
    const user = check.user;

    // 1. Validation
    const schoolCode = String(input.schoolCode || '').trim().toUpperCase();
    if (!schoolCode) {
      return {
        success: false,
        code: 'INVALID_SCHOOL_CODE',
        message: 'يرجى إدخال رمز المدرسة (schoolCode).',
      };
    }

    const schoolName = String(input.schoolName || '').trim();
    if (!schoolName) {
      return {
        success: false,
        code: 'INVALID_SCHOOL_NAME',
        message: 'يرجى إدخال اسم المدرسة (schoolName).',
      };
    }

    const schoolId = String(input.schoolId || ('SCH-' + schoolCode)).trim().toUpperCase();
    if (!schoolId) {
      return {
        success: false,
        code: 'INVALID_SCHOOL_ID',
        message: 'يرجى تحديد كود المدرسة (schoolId).',
      };
    }

    // 2. Duplicate Check against client-cached registry
    const existing = storageService.getSchools();
    const hasDuplicate = existing.some(
      s => (s.schoolId || '').toUpperCase() === schoolId || (s.schoolCode || '').toUpperCase() === schoolCode
    );
    if (hasDuplicate) {
      return {
        success: false,
        code: 'SCHOOL_EXISTS',
        message: 'المدرسة مسجلة مسبقاً بنفس المعرف أو الرمز.',
      };
    }

    const scriptUrl = storageService.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return {
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'تعذر الاتصال بالخادم الرئيسي لإنشاء المدرسة.',
      };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'adminCreateSchool',
          sessionToken: user.sessionToken,
          school: {
            schoolId,
            schoolCode,
            schoolName,
          },
        }),
      });

      if (!response.ok) {
        try {
          const errRes = await response.json();
          if (errRes && errRes.code) {
            return {
              success: false,
              code: errRes.code,
              message: errRes.message || `خطأ في استجابة الخادم (${response.status}) أثناء إنشاء المدرسة.`,
            };
          }
        } catch {}
        return {
          success: false,
          code: `HTTP_${response.status}`,
          message: `خطأ في استجابة الخادم (${response.status}) أثناء إنشاء المدرسة.`,
        };
      }

      const res = await response.json();
      if (res.status === 'success' && res.school) {
        const safeSchool = this.sanitizeSchoolDto(res.school);
        // Refresh local cache with newly created school
        const updatedList = [...existing.filter(s => s.schoolId !== safeSchool.schoolId), safeSchool];
        this.syncClientSchoolsCache(updatedList);

        return {
          success: true,
          message: res.message || 'تم تسجيل المدرسة بنجاح.',
          data: safeSchool,
        };
      }

      return {
        success: false,
        code: res.code || 'CREATE_SCHOOL_FAILED',
        message: res.message || 'فشل إنشاء المدرسة من قبل الخادم.',
      };
    } catch (err: any) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: err?.message || 'حدث خطأ في الاتصال أثناء تسجيل المدرسة.',
      };
    }
  }

  /**
   * Updates an existing school in the Master Registry via adminUpdateSchool.
   * Enforces immutability of schoolId and strict validation on fields.
   */
  public async updateSchool(
    schoolId: string,
    updates: UpdateSchoolInput,
    caller?: User | null
  ): Promise<SchoolAdminOperationResult<School>> {
    const check = this.validateSystemAdminCaller(caller);
    if (!check.allowed || !check.user) {
      return check.error!;
    }
    const user = check.user;

    const targetSchoolId = String(schoolId || '').trim().toUpperCase();
    if (!targetSchoolId) {
      return {
        success: false,
        code: 'INVALID_SCHOOL_ID',
        message: 'يرجى تحديد معرف المدرسة المراد تحديثها.',
      };
    }

    // 1. Strict Immutability Guard: schoolId cannot be mutated
    if (updates.schoolId && String(updates.schoolId).trim().toUpperCase() !== targetSchoolId) {
      return {
        success: false,
        code: 'IMMUTABLE_SCHOOL_ID',
        message: 'معرف المدرسة (schoolId) ثابت وغير قابل للتعديل.',
      };
    }

    // 2. Field Validation
    const cleanUpdates: { schoolName?: string; schoolCode?: string; status?: 'Active' | 'Inactive' } = {};

    if (updates.schoolName !== undefined) {
      const name = String(updates.schoolName).trim();
      if (!name) {
        return {
          success: false,
          code: 'INVALID_SCHOOL_NAME',
          message: 'اسم المدرسة لا يمكن أن يكون فارغاً.',
        };
      }
      cleanUpdates.schoolName = name;
    }

    if (updates.schoolCode !== undefined) {
      const code = String(updates.schoolCode).trim().toUpperCase();
      if (!code) {
        return {
          success: false,
          code: 'INVALID_SCHOOL_CODE',
          message: 'رمز المدرسة لا يمكن أن يكون فارغاً.',
        };
      }

      // Check for duplicate schoolCode in existing cache
      const cached = storageService.getSchools();
      const codeDuplicate = cached.some(
        s => s.schoolId !== targetSchoolId && (s.schoolCode || '').toUpperCase() === code
      );
      if (codeDuplicate) {
        return {
          success: false,
          code: 'DUPLICATE_SCHOOL_CODE',
          message: 'رمز المدرسة مسجل مسبقاً لمدرسة أخرى.',
        };
      }
      cleanUpdates.schoolCode = code;
    }

    if (updates.status !== undefined) {
      const st = String(updates.status).trim();
      if (st !== 'Active' && st !== 'Inactive') {
        return {
          success: false,
          code: 'INVALID_SCHOOL_STATUS',
          message: 'حالة المدرسة يجب أن تكون إما Active أو Inactive.',
        };
      }
      cleanUpdates.status = st as 'Active' | 'Inactive';
    }

    const scriptUrl = storageService.getBackendUrl();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!scriptUrl || scriptUrl.length < 15 || !isOnline) {
      return {
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'تعذر الاتصال بالخادم الرئيسي لتحديث المدرسة.',
      };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'adminUpdateSchool',
          sessionToken: user.sessionToken,
          schoolId: targetSchoolId,
          updates: cleanUpdates,
        }),
      });

      if (!response.ok) {
        try {
          const errRes = await response.json();
          if (errRes && errRes.code) {
            return {
              success: false,
              code: errRes.code,
              message: errRes.message || `خطأ في استجابة الخادم (${response.status}) أثناء تحديث المدرسة.`,
            };
          }
        } catch {}
        return {
          success: false,
          code: `HTTP_${response.status}`,
          message: `خطأ في استجابة الخادم (${response.status}) أثناء تحديث المدرسة.`,
        };
      }

      const res = await response.json();
      if (res.status === 'success' && res.school) {
        const safeSchool = this.sanitizeSchoolDto(res.school);
        // Refresh local cache with updated school
        const cached = storageService.getSchools();
        const updatedList = cached.map(s => (s.schoolId === targetSchoolId ? safeSchool : s));
        this.syncClientSchoolsCache(updatedList);

        return {
          success: true,
          message: res.message || 'تم تحديث بيانات المدرسة بنجاح.',
          data: safeSchool,
        };
      }

      return {
        success: false,
        code: res.code || 'UPDATE_SCHOOL_FAILED',
        message: res.message || 'فشل تحديث بيانات المدرسة من قبل الخادم.',
      };
    } catch (err: any) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: err?.message || 'حدث خطأ في الاتصال أثناء تحديث المدرسة.',
      };
    }
  }
}

export const schoolAdminService = SchoolAdminService.getInstance();
