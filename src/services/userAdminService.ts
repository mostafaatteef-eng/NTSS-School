import { CanonicalStaffRole, PermissionKey, User } from '../types';
import { hasPermission } from '../utils/permissions';
import { storageService } from './storageService';

export interface UserAdminResult<T = undefined> {
  success: boolean;
  code?: string;
  message: string;
  data?: T;
}

export interface CreateManagedUserInput {
  email: string;
  username: string;
  fullName: string;
  role: CanonicalStaffRole;
  password: string;
  department?: string;
  schoolId?: string;
  allowedSchoolIds?: string[];
  employeeId?: string;
}

export interface UpdateManagedUserInput {
  id: string;
  username?: string;
  fullName?: string;
  role?: CanonicalStaffRole;
  department?: string;
  schoolId?: string;
  allowedSchoolIds?: string[];
  employeeId?: string;
}

const SESSION_CODES = new Set(['SESSION_EXPIRED', 'INVALID_SESSION', 'SESSION_REVOKED', 'UNAUTHORIZED']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class UserAdminService {
  private caller(caller?: User | null): User | null {
    return caller !== undefined ? caller : storageService.getCurrentUser();
  }

  private guard(permission: PermissionKey, caller?: User | null): { user?: User; error?: UserAdminResult } {
    const user = this.caller(caller);
    if (!user?.sessionToken) {
      return { error: { success: false, code: 'AUTH_REQUIRED', message: 'يجب تسجيل الدخول بجلسة معتمدة.' } };
    }
    if (!hasPermission(user, permission)) {
      return { error: { success: false, code: 'ROLE_PERMISSION_DENIED', message: 'ليس لديك الصلاحية المطلوبة.' } };
    }
    return { user };
  }

  private projectUser(raw: any): User {
    const scope = raw?.accessScope === 'GLOBAL' || raw?.accessScope === 'SELF' ? raw.accessScope : 'SCHOOL';
    return {
      id: String(raw?.id || '').trim(),
      username: String(raw?.username || '').trim().toLowerCase(),
      email: raw?.email ? String(raw.email).trim().toLowerCase() : undefined,
      fullName: String(raw?.fullName || '').trim(),
      role: raw?.role || 'Unknown',
      accessScope: scope,
      schoolId: raw?.schoolId ? String(raw.schoolId).trim().toUpperCase() : '',
      allowedSchoolIds: Array.isArray(raw?.allowedSchoolIds)
        ? Array.from(new Set(raw.allowedSchoolIds.map((x: unknown) => String(x || '').trim().toUpperCase()).filter(Boolean)))
        : [],
      employeeId: raw?.employeeId ? String(raw.employeeId).trim() : undefined,
      status: raw?.status === 'Inactive' || raw?.status === 'Suspended' ? raw.status : 'Active',
      department: raw?.department ? String(raw.department).trim() : undefined,
      createdAt: raw?.createdAt || undefined,
      updatedAt: raw?.updatedAt || undefined,
      lastLogin: raw?.lastLogin || undefined,
      loginNumber: raw?.loginNumber || undefined,
    };
  }

  private async request(action: string, data: Record<string, any> | undefined, user: User): Promise<UserAdminResult<any>> {
    const url = storageService.getBackendUrl();
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!url || url.length < 15 || !online) {
      return { success: false, code: 'SERVICE_UNAVAILABLE', message: 'تعذر الاتصال بالخادم الرئيسي.' };
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, sessionToken: user.sessionToken, ...(data ? { data } : {}) }),
      });
      let body: any = null;
      try { body = await response.json(); } catch {}
      const code = body?.code || (!response.ok ? 'HTTP_' + response.status : undefined);
      if (SESSION_CODES.has(String(code || '')) || response.status === 401) {
        storageService.setCurrentUser(null);
      }
      if (!response.ok || body?.status === 'error') {
        return { success: false, code: code || 'USER_ADMIN_REQUEST_FAILED', message: body?.message || 'تعذر تنفيذ العملية.' };
      }
      return { success: true, code: body?.code, message: body?.message || 'تمت العملية بنجاح.', data: body };
    } catch (err: any) {
      return { success: false, code: 'NETWORK_ERROR', message: err?.message || 'حدث خطأ في الاتصال بالخادم.' };
    }
  }

  async getUsers(caller?: User | null): Promise<UserAdminResult<User[]>> {
    const check = this.guard('users.view', caller);
    if (!check.user) return check.error as UserAdminResult<User[]>;
    const res = await this.request('adminGetUsers', undefined, check.user);
    if (!res.success) return res;
    return { success: true, message: res.message, data: Array.isArray(res.data?.data) ? res.data.data.map((u: any) => this.projectUser(u)) : [] };
  }

  async createUser(input: CreateManagedUserInput, caller?: User | null): Promise<UserAdminResult<User>> {
    const check = this.guard('users.create', caller);
    if (!check.user) return check.error as UserAdminResult<User>;
    const email = String(input.email || '').trim().toLowerCase();
    if (!email) return { success: false, code: 'EMAIL_REQUIRED', message: 'البريد الإلكتروني مطلوب.' };
    if (!EMAIL_RE.test(email)) return { success: false, code: 'INVALID_EMAIL', message: 'صيغة البريد الإلكتروني غير صالحة.' };
    if (!String(input.username || '').trim() || !String(input.fullName || '').trim()) {
      return { success: false, code: 'REQUIRED_FIELDS_MISSING', message: 'الاسم الكامل واسم المستخدم مطلوبان.' };
    }
    if (String(input.password || '').trim().length < 8) {
      return { success: false, code: 'PASSWORD_TOO_SHORT', message: 'كلمة المرور يجب ألا تقل عن 8 أحرف.' };
    }
    if (input.role === 'SystemAdmin' && check.user.role !== 'SystemAdmin') {
      return { success: false, code: 'ROLE_ESCALATION_DENIED', message: 'غير مصرح بإنشاء مدير نظام مركزي.' };
    }
    const res = await this.request('saveUser', {
      email,
      username: input.username.trim().toLowerCase(),
      fullName: input.fullName.trim(),
      role: input.role,
      password: input.password,
      department: input.department?.trim() || undefined,
      schoolId: input.schoolId?.trim().toUpperCase() || undefined,
      allowedSchoolIds: input.allowedSchoolIds?.map(x => x.trim().toUpperCase()).filter(Boolean),
      employeeId: input.employeeId?.trim() || undefined,
    }, check.user);
    if (!res.success) return res;
    return { success: true, message: res.message, data: res.data?.user ? this.projectUser(res.data.user) : undefined };
  }

  async updateUser(input: UpdateManagedUserInput, caller?: User | null): Promise<UserAdminResult<User>> {
    const check = this.guard('users.edit', caller);
    if (!check.user) return check.error as UserAdminResult<User>;
    if (!input.id?.trim()) return { success: false, code: 'TARGET_REQUIRED', message: 'معرف المستخدم مطلوب.' };
    if (input.role === 'SystemAdmin' && check.user.role !== 'SystemAdmin') {
      return { success: false, code: 'ROLE_ESCALATION_DENIED', message: 'غير مصرح بترقية الحساب إلى مدير نظام مركزي.' };
    }
    const res = await this.request('saveUser', {
      id: input.id.trim(),
      username: input.username?.trim().toLowerCase(),
      fullName: input.fullName?.trim(),
      role: input.role,
      department: input.department?.trim(),
      schoolId: input.schoolId !== undefined ? input.schoolId.trim().toUpperCase() : undefined,
      allowedSchoolIds: input.allowedSchoolIds?.map(x => x.trim().toUpperCase()).filter(Boolean),
      employeeId: input.employeeId?.trim(),
    }, check.user);
    if (!res.success) return res;
    return { success: true, message: res.message, data: res.data?.user ? this.projectUser(res.data.user) : undefined };
  }

  async deleteUser(userId: string, caller?: User | null): Promise<UserAdminResult> {
    const check = this.guard('users.manage', caller);
    if (!check.user) return check.error!;
    return this.request('deleteUser', { id: userId.trim() }, check.user);
  }

  async resetPassword(userId: string, newPassword: string, caller?: User | null): Promise<UserAdminResult> {
    const check = this.guard('users.resetPassword', caller);
    if (!check.user) return check.error!;
    if (newPassword.trim().length < 8) return { success: false, code: 'PASSWORD_TOO_SHORT', message: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.' };
    return this.request('resetUserPassword', { userId: userId.trim(), newPassword: newPassword.trim() }, check.user);
  }

  async setStatus(userId: string, newStatus: 'Active' | 'Inactive' | 'Suspended', caller?: User | null): Promise<UserAdminResult> {
    const check = this.guard('users.disable', caller);
    if (!check.user) return check.error!;
    return this.request('toggleUserStatus', { userId: userId.trim(), newStatus }, check.user);
  }

  async revokeSessions(userId: string, caller?: User | null): Promise<UserAdminResult> {
    const check = this.guard('users.manage', caller);
    if (!check.user) return check.error!;
    return this.request('revokeUserSessions', { userId: userId.trim() }, check.user);
  }
}

export const userAdminService = new UserAdminService();
