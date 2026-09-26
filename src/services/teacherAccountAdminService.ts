import { Employee, PermissionKey, TeacherAccount, User } from '../types';
import { hasPermission } from '../utils/permissions';
import { storageService } from './storageService';

export interface TeacherAccountAdminResult<T = undefined> {
  success: boolean;
  code?: string;
  message: string;
  data?: T;
}

export interface SafeTeachingEmployee {
  id: string;
  name: string;
  teacherCode: string;
  jobTitle: string;
  specialization?: string;
  employeeType?: 'Teacher' | 'Administrative';
  status?: 'Active' | 'Inactive' | 'Suspended';
  isTeacher: boolean;
  isTeachingStaff: boolean;
}

export interface TeacherAccountAdminBundle {
  effectiveSchoolId: string;
  accounts: TeacherAccount[];
  teachingStaff: SafeTeachingEmployee[];
}

const SESSION_FAILURE_CODES = new Set([
  'SESSION_EXPIRED',
  'INVALID_SESSION',
  'SESSION_REVOKED',
  'UNAUTHORIZED',
]);

const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;

class TeacherAccountAdminService {
  private caller(caller?: User | null): User | null {
    return caller !== undefined ? caller : storageService.getCurrentUser();
  }

  private guard(
    caller?: User | null,
    permission: PermissionKey = 'teacherAccounts.manage'
  ): { user?: User; effectiveSchoolId?: string; error?: TeacherAccountAdminResult } {
    const user = this.caller(caller);

    if (!user?.sessionToken) {
      return {
        error: {
          success: false,
          code: 'AUTH_REQUIRED',
          message: 'يجب تسجيل الدخول بجلسة إدارية معتمدة.',
        },
      };
    }

    if (!hasPermission(user, permission)) {
      return {
        error: {
          success: false,
          code: 'ROLE_PERMISSION_DENIED',
          message: 'ليس لديك صلاحية إدارة حسابات المعلمين.',
        },
      };
    }

    if (user.accessScope === 'GLOBAL') {
      const activeSchoolId = String(user.activeSchoolId || '').trim().toUpperCase();
      const allowed = (user.allowedSchoolIds || [])
        .map(id => String(id || '').trim().toUpperCase())
        .filter(Boolean);

      if (!activeSchoolId) {
        return {
          error: {
            success: false,
            code: 'SCHOOL_CONTEXT_REQUIRED',
            message: 'اختر مدرسة نشطة أولاً لإدارة حسابات المعلمين.',
          },
        };
      }

      if (!allowed.includes(activeSchoolId)) {
        return {
          error: {
            success: false,
            code: 'ACCESS_DENIED_SCHOOL_SCOPE',
            message: 'المدرسة الحالية خارج نطاق المدارس المصرح بها.',
          },
        };
      }

      return { user, effectiveSchoolId: activeSchoolId };
    }

    if (user.accessScope === 'SCHOOL') {
      const schoolId = String(user.schoolId || '').trim().toUpperCase();
      if (!schoolId) {
        return {
          error: {
            success: false,
            code: 'SCHOOL_CONTEXT_REQUIRED',
            message: 'سياق المدرسة غير متوفر في الجلسة الحالية.',
          },
        };
      }
      return { user, effectiveSchoolId: schoolId };
    }

    return {
      error: {
        success: false,
        code: 'ROLE_PERMISSION_DENIED',
        message: 'إدارة حسابات المعلمين غير متاحة للحسابات ذات النطاق الذاتي.',
      },
    };
  }

  private async request(
    action: string,
    data: Record<string, unknown> | undefined,
    user: User
  ): Promise<TeacherAccountAdminResult<any>> {
    const url = storageService.getBackendUrl();
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;

    if (!url || url.length < 15 || !online) {
      return {
        success: false,
        code: 'SERVICE_UNAVAILABLE',
        message: 'تعذر الاتصال بالخادم الرئيسي.',
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action,
          sessionToken: user.sessionToken,
          ...(data ? { data } : {}),
        }),
      });

      let body: any = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      const code = body?.code || (!response.ok ? `HTTP_${response.status}` : undefined);

      if (SESSION_FAILURE_CODES.has(String(code || '')) || response.status === 401) {
        storageService.setCurrentUser(null);
      }

      if (!response.ok || body?.status === 'error') {
        return {
          success: false,
          code: code || 'TEACHER_ACCOUNT_REQUEST_FAILED',
          message: body?.message || 'تعذر تنفيذ العملية المطلوبة.',
        };
      }

      return {
        success: true,
        code: body?.code,
        message: body?.message || 'تمت العملية بنجاح.',
        data: body,
      };
    } catch (error: any) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: error?.message || 'حدث خطأ في الاتصال بالخادم.',
      };
    }
  }

  private safeAccount(raw: any, effectiveSchoolId: string): TeacherAccount {
    const status = [
      'Active',
      'Suspended',
      'Disabled',
      'Inactive',
      'PasswordResetRequired',
      'Needs Setup',
    ].includes(String(raw?.status || ''))
      ? raw.status
      : 'Inactive';

    return {
      id: String(raw?.id || `TAC_${raw?.employeeId || raw?.teacherId || ''}`).trim(),
      schoolId: effectiveSchoolId,
      employeeId: String(raw?.employeeId || raw?.teacherId || '').trim(),
      teacherCode: String(raw?.teacherCode || '').trim(),
      teacherName: '',
      username: String(raw?.username || '').trim(),
      status,
      accountStatus: status,
      isActive: status === 'Active',
      mustChangePassword: raw?.mustChangePassword === true || raw?.mustChangePassword === 'true',
      legacyPinRetired: true,
      failedLoginAttempts: Number(raw?.failedLoginAttempts) || 0,
      lockedUntil: raw?.lockedUntil ? String(raw.lockedUntil) : null,
      lastLoginAt: raw?.lastLoginAt ? String(raw.lastLoginAt) : '',
      createdAt: raw?.createdAt ? String(raw.createdAt) : '',
      updatedAt: raw?.updatedAt ? String(raw.updatedAt) : '',
    };
  }

  private safeEmployee(raw: any): SafeTeachingEmployee {
    const isTeacher =
      raw?.isTeacher === true ||
      raw?.isTeacher === 'true' ||
      raw?.employeeType === 'Teacher' ||
      Boolean(raw?.teacherCode);

    const isTeachingStaff =
      raw?.isTeachingStaff === true ||
      raw?.isTeachingStaff === 'true' ||
      isTeacher ||
      /معلم|مدرس/.test(String(raw?.jobTitle || ''));

    return {
      id: String(raw?.id || raw?.employeeId || '').trim(),
      name: String(raw?.name || raw?.fullName || '').trim(),
      teacherCode: String(raw?.teacherCode || raw?.id || '').trim(),
      jobTitle: String(raw?.jobTitle || '').trim(),
      specialization: raw?.specialization ? String(raw.specialization).trim() : undefined,
      employeeType: raw?.employeeType === 'Teacher' ? 'Teacher' : raw?.employeeType === 'Administrative' ? 'Administrative' : undefined,
      status:
        raw?.status === 'Inactive' || raw?.status === 'Suspended'
          ? raw.status
          : 'Active',
      isTeacher,
      isTeachingStaff,
    };
  }

  public async getBundle(caller?: User | null): Promise<TeacherAccountAdminResult<TeacherAccountAdminBundle>> {
    const check = this.guard(caller);
    if (!check.user || !check.effectiveSchoolId) {
      return check.error as TeacherAccountAdminResult<TeacherAccountAdminBundle>;
    }

    if (!hasPermission(check.user, 'employees.view')) {
      return {
        success: false,
        code: 'ROLE_PERMISSION_DENIED',
        message: 'صلاحية عرض المعلمين مطلوبة لإدارة حسابات البوابة.',
      };
    }

    const [accountsRes, employeesRes] = await Promise.all([
      this.request('getTeacherAccounts', undefined, check.user),
      this.request('getEmployees', undefined, check.user),
    ]);

    if (!accountsRes.success) return accountsRes;
    if (!employeesRes.success) return employeesRes;

    const employees = Array.isArray(employeesRes.data?.data)
      ? employeesRes.data.data.map((row: any) => this.safeEmployee(row))
      : [];

    const teachingStaff = employees.filter((employee: SafeTeachingEmployee) =>
      employee.isTeachingStaff && employee.status !== 'Inactive'
    );

    const employeeById = new Map<string, SafeTeachingEmployee>(
      teachingStaff.map(employee => [employee.id, employee] as const)
    );

    const accounts = (Array.isArray(accountsRes.data?.data) ? accountsRes.data.data : [])
      .map((row: any) => this.safeAccount(row, check.effectiveSchoolId!))
      .filter((account: TeacherAccount) => Boolean(account.employeeId))
      .map((account: TeacherAccount) => {
        const employee = employeeById.get(account.employeeId);
        return {
          ...account,
          teacherCode: account.teacherCode || employee?.teacherCode || account.employeeId,
          teacherName: employee?.name || account.teacherCode || account.employeeId,
          department: employee?.specialization || employee?.jobTitle || 'هيئة التدريس',
        };
      });

    return {
      success: true,
      message: 'تم تحميل حسابات المعلمين من الخادم المعتمد.',
      data: {
        effectiveSchoolId: check.effectiveSchoolId,
        accounts,
        teachingStaff,
      },
    };
  }

  public async createAccount(
    employeeId: string,
    username: string,
    temporaryPassword: string,
    caller?: User | null
  ): Promise<TeacherAccountAdminResult<TeacherAccount>> {
    const check = this.guard(caller);
    if (!check.user || !check.effectiveSchoolId) {
      return check.error as TeacherAccountAdminResult<TeacherAccount>;
    }

    const cleanEmployeeId = String(employeeId || '').trim();
    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanPassword = String(temporaryPassword || '').trim();

    if (!cleanEmployeeId || !cleanUsername || !cleanPassword) {
      return {
        success: false,
        code: 'MISSING_FIELDS',
        message: 'المعلم واسم المستخدم وكلمة المرور حقول مطلوبة.',
      };
    }

    if (!USERNAME_RE.test(cleanUsername)) {
      return {
        success: false,
        code: 'INVALID_USERNAME',
        message: 'اسم المستخدم يقبل الأحرف الإنجليزية والأرقام والرموز . _ - فقط.',
      };
    }

    if (cleanPassword.length < 8) {
      return {
        success: false,
        code: 'INVALID_PASSWORD',
        message: 'كلمة المرور يجب ألا تقل عن 8 أحرف.',
      };
    }

    const response = await this.request(
      'createTeacherAccount',
      {
        employeeId: cleanEmployeeId,
        username: cleanUsername,
        temporaryPassword: cleanPassword,
      },
      check.user
    );

    if (!response.success) return response;

    return {
      success: true,
      message: response.message,
      data: this.safeAccount(response.data?.data || {}, check.effectiveSchoolId),
    };
  }

  public async resetPassword(
    employeeId: string,
    temporaryPassword: string,
    caller?: User | null
  ): Promise<TeacherAccountAdminResult> {
    const check = this.guard(caller);
    if (!check.user) return check.error!;

    const cleanEmployeeId = String(employeeId || '').trim();
    const cleanPassword = String(temporaryPassword || '').trim();

    if (!cleanEmployeeId || cleanPassword.length < 8) {
      return {
        success: false,
        code: 'INVALID_PASSWORD',
        message: 'المعلم وكلمة مرور لا تقل عن 8 أحرف مطلوبان.',
      };
    }

    return this.request(
      'resetTeacherPassword',
      {
        employeeId: cleanEmployeeId,
        temporaryPassword: cleanPassword,
      },
      check.user
    );
  }

  public async setStatus(
    employeeId: string,
    status: 'Active' | 'Suspended' | 'Inactive',
    caller?: User | null
  ): Promise<TeacherAccountAdminResult> {
    const check = this.guard(caller);
    if (!check.user) return check.error!;

    const cleanEmployeeId = String(employeeId || '').trim();
    if (!cleanEmployeeId) {
      return {
        success: false,
        code: 'MISSING_FIELDS',
        message: 'معرف المعلم مطلوب.',
      };
    }

    return this.request(
      'setTeacherAccountStatus',
      { employeeId: cleanEmployeeId, status },
      check.user
    );
  }
}

export const teacherAccountAdminService = new TeacherAccountAdminService();
