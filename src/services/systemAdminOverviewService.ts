/**
 * Phase 3C-A14.3.2.1: Authoritative Cross-School Overview Service.
 * Provides central aggregate operational metrics across managed schools for SystemAdmin.
 *
 * Security Invariants:
 * 1. Strictly SystemAdmin with GLOBAL accessScope.
 * 2. Real cross-school counts calculated authoritatively server-side via adminGetSystemOverview.
 * 3. Never derives cross-school totals from localStorage or school-scoped client cache.
 * 4. Zero PII, zero spreadsheet IDs exposed.
 */

import { SystemOverviewResponse, User } from '../types';
import { storageService } from './storageService';

export interface SystemOverviewOperationResult {
  success: boolean;
  code?: string;
  message: string;
  data?: SystemOverviewResponse;
}

export class SystemAdminOverviewService {
  private static instance: SystemAdminOverviewService | null = null;

  public static getInstance(): SystemAdminOverviewService {
    if (!SystemAdminOverviewService.instance) {
      SystemAdminOverviewService.instance = new SystemAdminOverviewService();
    }
    return SystemAdminOverviewService.instance;
  }

  /**
   * Helper: Validates that caller is an authenticated SystemAdmin with GLOBAL accessScope.
   * Client-side guard; backend remains authoritative gatekeeper.
   */
  private validateSystemAdminCaller(caller?: User | null): {
    allowed: boolean;
    user?: User;
    error?: SystemOverviewOperationResult;
  } {
    const user = caller !== undefined ? caller : storageService.getCurrentUser();
    if (!user || !storageService.isAuthenticated(user)) {
      return {
        allowed: false,
        error: {
          success: false,
          code: 'AUTH_REQUIRED',
          message: 'يجب تسجيل الدخول بجلسة معتمدة لعرض النظرة العامة للمنظومة.',
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
   * Retrieves authoritative cross-school system overview directly from the backend.
   * Only calls action: 'adminGetSystemOverview'.
   * Never reads local student/employee cache.
   */
  public async getSystemOverview(
    caller?: User | null
  ): Promise<SystemOverviewOperationResult> {
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
        message: 'تعذر الاتصال بالخادم الرئيسي لاسترجاع النظرة العامة.',
      };
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'adminGetSystemOverview',
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
              message: errRes.message || `خطأ في استجابة الخادم (${response.status}) أثناء جلب النظرة العامة.`,
            };
          }
        } catch {}
        return {
          success: false,
          code: `HTTP_${response.status}`,
          message: `خطأ في استجابة الخادم (${response.status}) أثناء جلب النظرة العامة.`,
        };
      }

      const res = await response.json();
      if (res.status === 'success' && res.summary && Array.isArray(res.schools)) {
        const overviewData: SystemOverviewResponse = {
          summary: {
            studentsTotal: Number(res.summary.studentsTotal) || 0,
            employeesTotal: Number(res.summary.employeesTotal) || 0,
            schoolsIncluded: Number(res.summary.schoolsIncluded) || 0,
            schoolsUnavailable: Number(res.summary.schoolsUnavailable) || 0,
          },
          schools: res.schools.map((s: any) => ({
            schoolId: String(s.schoolId || '').trim().toUpperCase(),
            schoolCode: String(s.schoolCode || '').trim().toUpperCase(),
            schoolName: String(s.schoolName || '').trim(),
            status: String(s.status || '').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
            dataStatus: s.dataStatus,
            studentsCount: typeof s.studentsCount === 'number' ? s.studentsCount : null,
            employeesCount: typeof s.employeesCount === 'number' ? s.employeesCount : null,
          })),
          generatedAt: res.generatedAt || new Date().toISOString(),
        };

        return {
          success: true,
          message: 'تم استرجاع النظرة العامة للمنظومة بنجاح.',
          data: overviewData,
        };
      }

      return {
        success: false,
        code: res.code || 'GET_OVERVIEW_FAILED',
        message: res.message || 'فشل استرجاع النظرة العامة من الخادم.',
      };
    } catch (err: any) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: err?.message || 'حدث خطأ في الاتصال أثناء استرجاع النظرة العامة.',
      };
    }
  }
}

export const systemAdminOverviewService = SystemAdminOverviewService.getInstance();
