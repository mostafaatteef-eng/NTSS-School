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
  public async getSystemOverview(caller?: User | null): Promise<SystemOverviewOperationResult> {
    const check = this.validateSystemAdminCaller(caller);
    if (!check.allowed || !check.user) return check.error!;
    const user = check.user;
    const apiUrl = ((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_POSTGRES_API_URL) as string) || '';
    if (!apiUrl || !user.sessionToken) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'تعذر الاتصال بخادم PostgreSQL لاسترجاع النظرة العامة.' };
    }

    try {
      const base = apiUrl.replace(/\/$/, '');
      const headers = { Authorization: `Bearer ${user.sessionToken}` };
      const schoolsResponse = await fetch(`${base}/api/schools`, { headers });
      const schoolsPayload = await schoolsResponse.json().catch(() => ({}));
      if (!schoolsResponse.ok || schoolsPayload.status !== 'success' || !Array.isArray(schoolsPayload.data)) {
        return { success: false, code: schoolsPayload.code || `HTTP_${schoolsResponse.status}`, message: 'تعذر تحميل مؤشرات المدارس من PostgreSQL.' };
      }

      const rows = await Promise.all(schoolsPayload.data.map(async (s: any) => {
        const schoolId = String(s.id || '').trim().toUpperCase();
        try {
          const [studentsRes, employeesRes] = await Promise.all([
            fetch(`${base}/api/students?schoolId=${encodeURIComponent(schoolId)}&page=1&pageSize=10`, { headers }),
            fetch(`${base}/api/employees?schoolId=${encodeURIComponent(schoolId)}&page=1&pageSize=10`, { headers }),
          ]);
          const [students, employees] = await Promise.all([
            studentsRes.json().catch(() => ({})), employeesRes.json().catch(() => ({})),
          ]);
          const available = studentsRes.ok && employeesRes.ok && students.status === 'success' && employees.status === 'success';
          return {
            schoolId, schoolCode: String(s.code || '').trim().toUpperCase(), schoolName: String(s.name || '').trim(),
            status: String(s.status || '').toUpperCase() === 'ACTIVE' ? 'Active' : 'Inactive',
            dataStatus: available ? 'AVAILABLE' : 'UNAVAILABLE',
            studentsCount: available ? Number(students.pagination?.total || 0) : null,
            employeesCount: available ? Number(employees.pagination?.total || 0) : null,
          };
        } catch {
          return {
            schoolId, schoolCode: String(s.code || '').trim().toUpperCase(), schoolName: String(s.name || '').trim(),
            status: String(s.status || '').toUpperCase() === 'ACTIVE' ? 'Active' : 'Inactive',
            dataStatus: 'UNAVAILABLE', studentsCount: null, employeesCount: null,
          };
        }
      }));

      const available = rows.filter((s: any) => s.dataStatus === 'AVAILABLE');
      const data: SystemOverviewResponse = {
        summary: {
          studentsTotal: available.reduce((n: number, s: any) => n + Number(s.studentsCount || 0), 0),
          employeesTotal: available.reduce((n: number, s: any) => n + Number(s.employeesCount || 0), 0),
          schoolsIncluded: available.length,
          schoolsUnavailable: rows.length - available.length,
        },
        schools: rows as any,
        generatedAt: new Date().toISOString(),
      };
      return { success: true, message: 'تم استرجاع النظرة العامة للمنظومة بنجاح.', data };
    } catch (err: any) {
      return { success: false, code: 'NETWORK_ERROR', message: err?.message || 'حدث خطأ في الاتصال بخادم PostgreSQL.' };
    }
  }

}

export const systemAdminOverviewService = SystemAdminOverviewService.getInstance();
