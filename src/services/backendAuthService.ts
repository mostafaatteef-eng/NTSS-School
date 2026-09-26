/**
 * ==============================================================================
 * NTSS SCHOOL ERP & TIMETABLE SYSTEM - BACKEND AUTHORIZATION ENGINE (RBAC PHASE 2)
 * ==============================================================================
 * 
 * Unifies enterprise authorization, data isolation, and audit logging.
 * Enforces the strict 8-step authorization order:
 * 1. validateSession()
 * 2. verify account is Active
 * 3. resolve effective canonical role & validate scope
 * 4. verify permission (via hasEffectivePermission)
 * 5. verify AccessScope
 * 6. verify target school & cross-school object access
 * 7. verify SELF ownership (if required)
 * 8. execute action (Fail-Closed)
 * ==============================================================================
 */

import {
  AccessScope,
  AuthorizationResult,
  BackendSecurityAuditEvent,
  MasterSchoolRegistryRecord,
  PermissionKey,
  ResourceContext,
  School,
  ServerSession,
  StaffRole,
  User,
  UserRole,
} from '../types';
import { hasEffectivePermission, DEFAULT_ROLE_PERMISSIONS } from '../utils/permissions';

export const CANONICAL_BACKEND_VERSION = '5.2.0-AUTH-MULTISCHOOL';

// In-Memory Security Audit Logs Store (Server Authoritative)
const securityAuditLogs: BackendSecurityAuditEvent[] = [];

/**
 * Records a security audit event.
 * Strictly guarantees that sensitive credentials (passwords, salts, hashes, tokens)
 * are NEVER recorded in the audit trail.
 */
export function recordSecurityAuditEvent(event: {
  requestId?: string;
  actorUserId: string;
  actorRole: string;
  actorSchoolId: string;
  targetSchoolId: string;
  action: string;
  code?: string;
  reason?: string;
  resourceId?: string;
  timestamp?: string;
}): BackendSecurityAuditEvent {
  const auditRecord: BackendSecurityAuditEvent = {
    requestId: event.requestId || `REQ_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    actorUserId: event.actorUserId || 'UNKNOWN_USER',
    actorRole: event.actorRole || 'UNKNOWN_ROLE',
    actorSchoolId: event.actorSchoolId || 'UNKNOWN_SCHOOL',
    targetSchoolId: event.targetSchoolId || event.actorSchoolId || 'UNKNOWN_SCHOOL',
    action: event.action,
    timestamp: event.timestamp || new Date().toISOString(),
    code: event.code,
    reason: event.reason,
    resourceId: event.resourceId,
  };

  securityAuditLogs.push(auditRecord);
  return auditRecord;
}

export function getSecurityAuditLogs(): BackendSecurityAuditEvent[] {
  return [...securityAuditLogs];
}

export function clearSecurityAuditLogs(): void {
  securityAuditLogs.length = 0;
}

// Backend Master School Registry (Backend-authoritative only)
let masterSchoolRegistry: MasterSchoolRegistryRecord[] = [];

export function setMasterSchoolRegistry(schools: MasterSchoolRegistryRecord[]): void {
  masterSchoolRegistry = [...schools];
}

export function getMasterSchoolRegistry(): MasterSchoolRegistryRecord[] {
  return [...masterSchoolRegistry];
}

/**
 * Sanitizes school data for client consumption.
 * Strictly guarantees spreadsheetId is NEVER returned to frontend or DTOs.
 */
export function sanitizeSchoolDTO(school: MasterSchoolRegistryRecord | School | any): School {
  if (!school) {
    return {
      schoolId: '',
      schoolCode: '',
      schoolName: '',
      status: 'Inactive',
    };
  }

  const sanitized: School = {
    schoolId: String(school.schoolId || '').trim(),
    schoolCode: String(school.schoolCode || '').trim(),
    schoolName: String(school.schoolName || '').trim(),
    status: school.status === 'Inactive' ? 'Inactive' : 'Active',
  };

  if (school.createdAt) sanitized.createdAt = school.createdAt;
  if (school.updatedAt) sanitized.updatedAt = school.updatedAt;

  // Explicit safety check: spreadsheetId must never be present
  if ('spreadsheetId' in (sanitized as any)) {
    delete (sanitized as any).spreadsheetId;
  }

  return sanitized;
}

/**
 * Resolves the Google Spreadsheet ID for a specific school from the backend registry.
 * This is strictly an internal backend operation.
 */
export function getSchoolSpreadsheet(effectiveSchoolId: string): string {
  const cleanId = String(effectiveSchoolId || '').trim().toUpperCase();
  if (!cleanId) {
    return '';
  }
  const found = masterSchoolRegistry.find(
    s => s.schoolId.toUpperCase() === cleanId || s.schoolCode.toUpperCase() === cleanId
  );
  if (found && found.spreadsheetId) {
    return found.spreadsheetId;
  }
  return '';
}

/**
 * Resolves school context for an authenticated session.
 * Enforces role scope constraints:
 * - GLOBAL: target school must be within session.allowedSchoolIds
 * - SCHOOL: session.schoolId is authoritative; requested school mismatch is rejected
 * - SELF: restricted to session.schoolId
 */
export function resolveSchoolContext(
  session: ServerSession,
  requestedSchoolId?: string
): { success: boolean; school?: MasterSchoolRegistryRecord; code?: string; message?: string } {
  if (!session) {
    return { success: false, code: 'SESSION_REQUIRED', message: 'مطلوب جلسة عمل معتمدة' };
  }

  const cleanRequested = requestedSchoolId ? String(requestedSchoolId).trim().toUpperCase() : undefined;
  const sessionSchool = String(session.schoolId || '').trim().toUpperCase();

  let effectiveSchoolId = sessionSchool;

  if (session.accessScope === 'GLOBAL') {
    if (cleanRequested) {
      const allowed = (session.allowedSchoolIds || []).map(id => id.trim().toUpperCase());
      if (!allowed.includes(cleanRequested)) {
        return {
          success: false,
          code: 'ACCESS_DENIED_SCHOOL_SCOPE',
          message: 'المدرسة المطلوبة خارج نطاق المدارس المصرح لك بالوصول إليها',
        };
      }
      effectiveSchoolId = cleanRequested;
    } else {
      effectiveSchoolId = (session.activeSchoolId || session.schoolId || '').trim().toUpperCase();
    }
  } else if (session.accessScope === 'SCHOOL' || session.accessScope === 'SELF') {
    // School-bound roles: payload/requested school cannot override session
    if (cleanRequested && cleanRequested !== sessionSchool) {
      return {
        success: false,
        code: 'SCHOOL_CONTEXT_MISMATCH',
        message: 'لا يمكن تجاوز المدرسة المربوطة بالجلسة بمدرسة أخرى في الطلب',
      };
    }
    effectiveSchoolId = sessionSchool;
  } else {
    return {
      success: false,
      code: 'MISSING_OR_INVALID_SCOPE',
      message: 'نطاق الوصول غير محدد أو غير مصرح به',
    };
  }

  if (!effectiveSchoolId) {
    return {
      success: false,
      code: 'SCHOOL_CONTEXT_REQUIRED',
      message: 'الجلسة غير مربوطة بمدرسة محددة (FAIL CLOSED)',
    };
  }

  const found = masterSchoolRegistry.find(
    s => s.schoolId.toUpperCase() === effectiveSchoolId || s.schoolCode.toUpperCase() === effectiveSchoolId
  );

  if (!found) {
    return {
      success: false,
      code: 'SCHOOL_NOT_FOUND',
      message: `المدرسة (${effectiveSchoolId}) غير مسجلة في النظام`,
    };
  }

  return { success: true, school: found };
}

/**
 * Constructs an authoritative ServerSession from a user record with safe defaults.
 * Guarantees:
 * - SystemAdmin: accessScope = GLOBAL only if backed by explicit allowedSchoolIds
 * - Legacy Admin: accessScope = SCHOOL only; bound to a single school; NEVER GLOBAL
 * - Teachers / AdministrativeEmployees: accessScope = SELF
 * - School roles: accessScope = SCHOOL
 * - Unknown: fails closed (DENY / MISSING_OR_INVALID_SCOPE)
 */
export function createAuthoritativeSession(
  user: Partial<User> & { id: string; role: any },
  options?: {
    allowedSchoolIds?: string[];
    schoolId?: string;
    expiresInHours?: number;
    token?: string;
  }
): ServerSession {
  const role = user.role as StaffRole;
  const boundSchoolId = options?.schoolId || user.schoolId || '';
  const now = new Date();
  const expiresInHours = options?.expiresInHours || 24;
  const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString();
  const token = options?.token || `SES_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  let accessScope: AccessScope;
  let allowedSchoolIds: string[] = [];

  if (role === 'SystemAdmin') {
    accessScope = 'GLOBAL';
    // User record / session authority ONLY. Do not invent all schools!
    const configuredSchools = options?.allowedSchoolIds || (user as any).allowedSchoolIds;
    if (configuredSchools && Array.isArray(configuredSchools)) {
      allowedSchoolIds = configuredSchools.map((s: string) => String(s).trim()).filter(Boolean);
    } else {
      allowedSchoolIds = []; // Fail closed if not explicitly granted
    }
  } else if (role === 'Admin') {
    // Legacy Admin: MUST be SCHOOL scoped. NEVER GLOBAL. Bound to single school.
    accessScope = 'SCHOOL';
    allowedSchoolIds = boundSchoolId ? [boundSchoolId] : [];
  } else if (role === 'Teacher' || role === 'AdministrativeEmployee') {
    accessScope = 'SELF';
    allowedSchoolIds = boundSchoolId ? [boundSchoolId] : [];
  } else if (
    role === 'SchoolAdmin' ||
    role === 'SchoolDirector' ||
    role === 'StudentAffairs' ||
    role === 'TeacherAffairs' ||
    role === 'QualityOfficer' ||
    role === 'TrainingOfficer' ||
    role === 'SocialSpecialist'
  ) {
    accessScope = 'SCHOOL';
    allowedSchoolIds = boundSchoolId ? [boundSchoolId] : [];
  } else {
    // Unknown or unsupported role
    accessScope = '' as any;
    allowedSchoolIds = [];
  }

  return {
    sessionToken: token,
    userId: user.id,
    username: user.username || user.id,
    fullName: user.fullName || user.name || user.username || 'مستخدم النظام',
    role: role as UserRole,
    accessScope,
    schoolId: boundSchoolId,
    allowedSchoolIds,
    activeSchoolId: boundSchoolId,
    expiresAt,
    employeeId: user.employeeId || (role === 'Teacher' || role === 'AdministrativeEmployee' ? user.id : undefined),
    isActive: user.isActive !== false && user.status !== 'Inactive' && user.status !== 'Suspended',
    status: user.status || 'Active',
  };
}

export const SELF_SAFE_ACTIONS = new Set<string>([
  'validateSession',
  'logout',
  'getLeaves',
  'saveLeave',
  'getPermissions',
  'savePermission',
  'getSchedule',
  'teacherSchedule.viewOwn',
  'leaves.own.view',
  'leaves.own.create',
  'homework.create',
  'lessonResources.manage',
  'teacherPortal.access',
]);

/**
 * Authoritative Central Backend Authorization Engine.
 * 
 * Order of Evaluation (Fail Closed):
 * 1. validateSession()
 * 2. verify account is Active
 * 3. resolve effective canonical role & validate accessScope
 * 4. verify permission (via hasEffectivePermission)
 * 5. verify AccessScope
 * 6. verify target school & cross-school object access
 * 7. verify SELF ownership (if required)
 * 8. execute action
 */
export function authorize(
  session: ServerSession | null | undefined,
  permission: PermissionKey | string,
  resourceContext?: ResourceContext,
  requestId?: string
): AuthorizationResult {
  const reqId = requestId || `REQ_AUTH_${Date.now()}`;

  // 1. validateSession()
  if (!session || !session.sessionToken) {
    return {
      allowed: false,
      code: 'SESSION_MISSING',
      reason: 'رمز جلسة العمل مفقود أو غير صالح',
    };
  }

  if (session.expiresAt) {
    const exp = new Date(session.expiresAt).getTime();
    if (!isNaN(exp) && Date.now() > exp) {
      return {
        allowed: false,
        code: 'SESSION_EXPIRED',
        reason: 'انتهت صلاحية جلسة العمل',
      };
    }
  }

  // 2. verify account is Active
  const isInactive =
    session.isActive === false ||
    String(session.status || '').trim().toLowerCase() === 'inactive' ||
    String(session.status || '').trim().toLowerCase() === 'suspended';

  if (isInactive) {
    const audit = recordSecurityAuditEvent({
      requestId: reqId,
      actorUserId: session.userId,
      actorRole: String(session.role),
      actorSchoolId: session.schoolId || 'UNKNOWN',
      targetSchoolId: resourceContext?.schoolId || session.schoolId || 'UNKNOWN',
      action: permission,
      code: 'ACCOUNT_INACTIVE',
      reason: 'الحساب معطل أو غير نشط حالياً',
      resourceId: resourceContext?.resourceId,
    });
    return {
      allowed: false,
      code: 'ACCOUNT_INACTIVE',
      reason: 'الحساب معطل أو غير نشط حالياً',
      actorUserId: session.userId,
      actorRole: String(session.role),
      auditEvent: audit,
    };
  }

  // 3. resolve effective canonical role & validate scope
  const role = session.role;
  const scope = session.accessScope;

  if (!scope || (scope !== 'GLOBAL' && scope !== 'SCHOOL' && scope !== 'SELF')) {
    const audit = recordSecurityAuditEvent({
      requestId: reqId,
      actorUserId: session.userId,
      actorRole: String(role),
      actorSchoolId: session.schoolId || 'UNKNOWN',
      targetSchoolId: resourceContext?.schoolId || session.schoolId || 'UNKNOWN',
      action: permission,
      code: 'MISSING_OR_INVALID_SCOPE',
      reason: 'نطاق الوصول غير معروف أو مفقود (Fail Closed)',
      resourceId: resourceContext?.resourceId,
    });
    return {
      allowed: false,
      code: 'MISSING_OR_INVALID_SCOPE',
      reason: 'نطاق الوصول غير معروف أو مفقود (Fail Closed)',
      actorUserId: session.userId,
      actorRole: String(role),
      auditEvent: audit,
    };
  }

  // Legacy Admin verification (Section 7)
  if (role === 'Admin') {
    if (scope === 'GLOBAL') {
      const audit = recordSecurityAuditEvent({
        requestId: reqId,
        actorUserId: session.userId,
        actorRole: 'Admin',
        actorSchoolId: session.schoolId || 'UNKNOWN',
        targetSchoolId: resourceContext?.schoolId || session.schoolId || 'UNKNOWN',
        action: permission,
        code: 'ACCESS_DENIED',
        reason: 'دور Admin القديم لا يمكن أن يمتلك نطاق GLOBAL',
      });
      return {
        allowed: false,
        code: 'ACCESS_DENIED',
        reason: 'دور Admin القديم لا يمكن أن يمتلك نطاق GLOBAL',
        actorUserId: session.userId,
        actorRole: 'Admin',
        auditEvent: audit,
      };
    }
    if (!session.schoolId || session.schoolId.trim() === '') {
      const audit = recordSecurityAuditEvent({
        requestId: reqId,
        actorUserId: session.userId,
        actorRole: 'Admin',
        actorSchoolId: 'UNLINKED',
        targetSchoolId: resourceContext?.schoolId || 'UNLINKED',
        action: permission,
        code: 'NEEDS_ADMIN_REVIEW',
        reason: 'حساب المشرف القديم غير مربوط بمدرسة محددة، يتطلب مراجعة مدير النظام',
      });
      return {
        allowed: false,
        code: 'NEEDS_ADMIN_REVIEW',
        reason: 'حساب المشرف القديم غير مربوط بمدرسة محددة، يتطلب مراجعة مدير النظام',
        actorUserId: session.userId,
        actorRole: 'Admin',
        auditEvent: audit,
      };
    }
  }

  // 3.5. SELF Scope Fail-Closed Check: Broad/non-self actions rejected immediately
  if (scope === 'SELF') {
    const permStr = String(permission);
    const isSelfSafe =
      SELF_SAFE_ACTIONS.has(permStr) ||
      (ACTION_PERMISSION_MAP[permStr] && SELF_SAFE_ACTIONS.has(ACTION_PERMISSION_MAP[permStr])) ||
      permStr.includes('.own.');

    if (!isSelfSafe) {
      const audit = recordSecurityAuditEvent({
        requestId: reqId,
        actorUserId: session.userId,
        actorRole: String(role),
        actorSchoolId: session.schoolId || 'UNKNOWN',
        targetSchoolId: resourceContext?.schoolId || session.schoolId || 'UNKNOWN',
        action: permission,
        code: 'SELF_SCOPE_VIOLATION',
        reason: `تم حجب الإجراء لانتهاك حدود النطاق الذاتي (SELF Scope Fail-Closed): ${permission}`,
        resourceId: resourceContext?.resourceId,
      });
      return {
        allowed: false,
        code: 'SELF_SCOPE_VIOLATION',
        reason: `تم حجب الإجراء لانتهاك حدود النطاق الذاتي (SELF Scope Fail-Closed): ${permission}`,
        actorUserId: session.userId,
        actorRole: String(role),
        auditEvent: audit,
      };
    }
  }

  // 4. resolve canonical permission from action or key (Fail-Closed on unknown actions)
  let effectivePermission: PermissionKey;
  if (permission === 'saveUser') {
    const targetUserId = resourceContext?.resourceId || resourceContext?.targetUserId;
    const targetUsername = resourceContext?.targetUsername;
    const existing = masterUsersStore.find(
      u => (targetUserId && u.id === targetUserId) || (targetUsername && u.username === targetUsername)
    );
    effectivePermission = existing ? 'users.edit' : 'users.create';
  } else if (ACTION_PERMISSION_MAP[permission as string]) {
    effectivePermission = ACTION_PERMISSION_MAP[permission as string];
    if (scope === 'SELF') {
      const permStr = String(permission);
      if (permStr === 'getLeaves' || permStr === 'getPermissions') {
        effectivePermission = 'leaves.own.view';
      } else if (permStr === 'saveLeave' || permStr === 'savePermission') {
        effectivePermission = 'leaves.own.create';
      }
    }
  } else if ((permission as string).includes('.') || (permission as string) in DEFAULT_ROLE_PERMISSIONS.SystemAdmin) {
    effectivePermission = permission as PermissionKey;
  } else {
    // Unknown action with missing permission mapping: Fail Closed
    const audit = recordSecurityAuditEvent({
      requestId: reqId,
      actorUserId: session.userId,
      actorRole: String(role),
      actorSchoolId: session.schoolId || 'UNKNOWN',
      targetSchoolId: resourceContext?.schoolId || session.schoolId || 'UNKNOWN',
      action: permission,
      code: 'PERMISSION_MAPPING_MISSING',
      reason: `تم حجب الإجراء لعدم وجود ربط صلاحية معتمد (Fail-Closed): ${permission}`,
      resourceId: resourceContext?.resourceId,
    });
    return {
      allowed: false,
      code: 'PERMISSION_MAPPING_MISSING',
      reason: `تم حجب الإجراء لعدم وجود ربط صلاحية معتمد (Fail-Closed): ${permission}`,
      actorUserId: session.userId,
      actorRole: String(role),
      auditEvent: audit,
    };
  }

  // 4b. verify permission (via hasEffectivePermission)
  const hasPerm = hasEffectivePermission(session, effectivePermission);
  if (!hasPerm) {
    const audit = recordSecurityAuditEvent({
      requestId: reqId,
      actorUserId: session.userId,
      actorRole: String(role),
      actorSchoolId: session.schoolId || 'UNKNOWN',
      targetSchoolId: resourceContext?.schoolId || session.schoolId || 'UNKNOWN',
      action: effectivePermission,
      code: 'ROLE_PERMISSION_DENIED',
      reason: 'ليس لديك الصلاحيات الإدارية المطلوبة لتنفيذ هذا الإجراء',
      resourceId: resourceContext?.resourceId,
    });
    return {
      allowed: false,
      code: 'ROLE_PERMISSION_DENIED',
      reason: 'ليس لديك الصلاحيات الإدارية المطلوبة لتنفيذ هذا الإجراء',
      actorUserId: session.userId,
      actorRole: String(role),
      auditEvent: audit,
    };
  }

  // 5. verify AccessScope & Target School
  let effectiveSchoolId = session.schoolId;

  if (scope === 'GLOBAL') {
    // SystemAdmin: targetSchoolId must be inside session.allowedSchoolIds if targeted
    const targetSchoolId = resourceContext?.schoolId || session.activeSchoolId || session.schoolId;
    if (targetSchoolId) {
      const allowed = (session.allowedSchoolIds || []).map(id => id.trim().toUpperCase());
      if (!allowed.includes(targetSchoolId.trim().toUpperCase())) {
        const audit = recordSecurityAuditEvent({
          requestId: reqId,
          actorUserId: session.userId,
          actorRole: String(role),
          actorSchoolId: session.schoolId,
          targetSchoolId,
          action: permission,
          code: 'ACCESS_DENIED_SCHOOL_SCOPE',
          reason: 'المدرسة المطلوبة تقع خارج نطاق المدارس المصرح بها لهذا الحساب',
          resourceId: resourceContext?.resourceId,
        });
        return {
          allowed: false,
          code: 'ACCESS_DENIED_SCHOOL_SCOPE',
          reason: 'المدرسة المطلوبة تقع خارج نطاق المدارس المصرح بها لهذا الحساب',
          actorUserId: session.userId,
          actorRole: String(role),
          auditEvent: audit,
        };
      }
    }
    effectiveSchoolId = targetSchoolId || 'GLOBAL';
  } else if (scope === 'SCHOOL') {
    // School-bound roles: session.schoolId is authoritative.
    // If request contains a mismatched schoolId, REJECT with SCHOOL_CONTEXT_MISMATCH.
    if (resourceContext?.schoolId && resourceContext.schoolId.trim().toUpperCase() !== session.schoolId.trim().toUpperCase()) {
      const audit = recordSecurityAuditEvent({
        requestId: reqId,
        actorUserId: session.userId,
        actorRole: String(role),
        actorSchoolId: session.schoolId,
        targetSchoolId: resourceContext.schoolId,
        action: permission,
        code: 'SCHOOL_CONTEXT_MISMATCH',
        reason: 'تم رفض الطلب: لا يمكن تجاوز نطاق المدرسة المربوطة بالجلسة بمدرسة أخرى في الطلب',
        resourceId: resourceContext?.resourceId,
      });
      return {
        allowed: false,
        code: 'SCHOOL_CONTEXT_MISMATCH',
        reason: 'تم رفض الطلب: لا يمكن تجاوز نطاق المدرسة المربوطة بالجلسة بمدرسة أخرى في الطلب',
        actorUserId: session.userId,
        actorRole: String(role),
        auditEvent: audit,
      };
    }
    effectiveSchoolId = session.schoolId;
  } else if (scope === 'SELF') {
    // SELF scope: strictly within session.schoolId
    if (resourceContext?.schoolId && resourceContext.schoolId.trim().toUpperCase() !== session.schoolId.trim().toUpperCase()) {
      const audit = recordSecurityAuditEvent({
        requestId: reqId,
        actorUserId: session.userId,
        actorRole: String(role),
        actorSchoolId: session.schoolId,
        targetSchoolId: resourceContext.schoolId,
        action: permission,
        code: 'CROSS_SCHOOL_ACCESS_DENIED',
        reason: 'تم رفض الطلب: غير مصرح بالوصول إلى بيانات مدرسة أخرى',
        resourceId: resourceContext?.resourceId,
      });
      return {
        allowed: false,
        code: 'CROSS_SCHOOL_ACCESS_DENIED',
        reason: 'تم رفض الطلب: غير مصرح بالوصول إلى بيانات مدرسة أخرى',
        actorUserId: session.userId,
        actorRole: String(role),
        auditEvent: audit,
      };
    }
    effectiveSchoolId = session.schoolId;
  }

  // 6. Cross-School Object Access Check (Section 13)
  // When operating on a specific resource, verify resource.schoolId === effectiveSchoolId
  if (resourceContext?.schoolId && resourceContext.schoolId.trim().toUpperCase() !== effectiveSchoolId.trim().toUpperCase()) {
    const audit = recordSecurityAuditEvent({
      requestId: reqId,
      actorUserId: session.userId,
      actorRole: String(role),
      actorSchoolId: session.schoolId,
      targetSchoolId: resourceContext.schoolId,
      action: permission,
      code: 'CROSS_SCHOOL_ACCESS_DENIED',
      reason: 'تم حجب المورد: كائن البيانات المطلوب يتبع لمدرسة أخرى',
      resourceId: resourceContext?.resourceId,
    });
    return {
      allowed: false,
      code: 'CROSS_SCHOOL_ACCESS_DENIED',
      reason: 'تم حجب المورد: كائن البيانات المطلوب يتبع لمدرسة أخرى',
      actorUserId: session.userId,
      actorRole: String(role),
      auditEvent: audit,
    };
  }

  // 7. Verify SELF ownership (Section 8 & 9)
  if (scope === 'SELF' || permission.includes('.own.')) {
    const sessionEmpId = (session.employeeId || session.userId || '').trim().toLowerCase();

    // AdministrativeEmployee cannot read all staff (Section 9 & Test 11)
    if (role === 'AdministrativeEmployee' && (permission === 'employees.view' || permission === 'teachers.view')) {
      const audit = recordSecurityAuditEvent({
        requestId: reqId,
        actorUserId: session.userId,
        actorRole: String(role),
        actorSchoolId: session.schoolId,
        targetSchoolId: effectiveSchoolId,
        action: permission,
        code: 'SELF_SCOPE_VIOLATION',
        reason: 'الموظف الإداري مصرح له بالعمليات الذاتية فقط ولا يمكنه قراءة بيانات جميع العاملين',
      });
      return {
        allowed: false,
        code: 'SELF_SCOPE_VIOLATION',
        reason: 'الموظف الإداري مصرح له بالعمليات الذاتية فقط ولا يمكنه قراءة بيانات جميع العاملين',
        actorUserId: session.userId,
        actorRole: String(role),
        auditEvent: audit,
      };
    }

    if (resourceContext?.ownerEmployeeId) {
      const ownerEmpId = resourceContext.ownerEmployeeId.trim().toLowerCase();
      if (ownerEmpId !== sessionEmpId && ownerEmpId !== (session.userId || '').trim().toLowerCase()) {
        const audit = recordSecurityAuditEvent({
          requestId: reqId,
          actorUserId: session.userId,
          actorRole: String(role),
          actorSchoolId: session.schoolId,
          targetSchoolId: effectiveSchoolId,
          action: permission,
          code: 'SELF_SCOPE_VIOLATION',
          reason: 'تم رفض العملية: غير مصرح بالوصول إلى بيانات أو طلبات موظف آخر',
          resourceId: resourceContext?.resourceId,
        });
        return {
          allowed: false,
          code: 'SELF_SCOPE_VIOLATION',
          reason: 'تم رفض العملية: غير مصرح بالوصول إلى بيانات أو طلبات موظف آخر',
          actorUserId: session.userId,
          actorRole: String(role),
          auditEvent: audit,
        };
      }
    }
  }

  // 8. Authorized
  return {
    allowed: true,
    effectiveSchoolId,
    accessScope: scope,
    actorUserId: session.userId,
    actorRole: String(role),
  };
}

/**
 * Action-to-Permission Mapping Table
 * Defines canonical PermissionKey for each backend API action.
 */
export const ACTION_PERMISSION_MAP: Record<string, PermissionKey> = {
  // Students
  getStudents: 'students.view',
  saveStudent: 'students.create',
  bulkSaveStudents: 'students.import',
  deleteStudent: 'students.delete',

  // Student Attendance
  getStudentAttendance: 'studentAttendance.view',
  saveStudentAttendance: 'studentAttendance.manage',
  bulkSaveStudentAttendance: 'studentAttendance.manage',
  saveDailyStudentAttendanceBatch: 'studentAttendance.manage',

  // Student Tokens
  issueStudentAccessToken: 'students.edit',
  revokeStudentAccessToken: 'students.edit',
  rotateStudentAccessToken: 'students.edit',
  getStudentAccessTokensList: 'students.view',

  // Employees / Staff
  getEmployees: 'employees.view',
  saveEmployee: 'employees.create',
  bulkSaveEmployees: 'employees.import',
  deleteEmployee: 'employees.delete',

  // Staff Attendance
  getAttendance: 'teacherAttendance.view',
  saveAttendance: 'teacherAttendance.manage',
  bulkSaveAttendance: 'teacherAttendance.manage',
  saveDailyStaffAttendanceBatch: 'teacherAttendance.manage',
  saveDailyTeacherAttendanceBatch: 'teacherAttendance.manage',

  // Leaves & Permissions
  getLeaves: 'leaves.view',
  saveLeave: 'leaves.create',
  deleteLeave: 'leaves.delete',
  getPermissions: 'leaves.view',
  savePermission: 'leaves.create',
  deletePermission: 'leaves.delete',

  // Teaching Assignments
  getTeacherAssignments: 'timetable.manage',
  saveTeacherAssignment: 'timetable.manage',
  deleteTeacherAssignment: 'timetable.manage',
  bulkSaveTeacherAssignments: 'timetable.manage',
  commitTimetableImport: 'timetable.import',

  // Timetable & Schedule
  getSchedule: 'schedule.view',
  saveScheduleEntry: 'timetable.manage',
  bulkSaveSchedule: 'timetable.manage',
  deleteScheduleEntry: 'timetable.manage',
  publishSchedule: 'timetable.publish',
  getScheduleBreaks: 'timetable.manage',
  saveScheduleBreaks: 'timetable.manage',
  getTeacherAvailability: 'timetable.manage',
  saveTeacherAvailability: 'timetable.manage',

  // Reserve
  getReserveAssignments: 'timetable.view',
  saveReserveAssignment: 'timetable.manage',
  cancelReserveAssignment: 'timetable.manage',
  getReserveCandidates: 'timetable.view',

  // Supervision
  getSupervisionLocations: 'timetable.view',
  saveSupervisionLocation: 'timetable.manage',
  getSupervisionAssignments: 'timetable.view',
  saveSupervisionAssignment: 'timetable.manage',

  // Homework & Resources
  getHomework: 'lessonContent.view',
  saveHomework: 'homework.create',
  deleteHomework: 'homework.create',
  getTeacherResources: 'lessonContent.view',
  saveTeacherResource: 'lessonResources.manage',
  deleteTeacherResource: 'lessonResources.manage',

  // Exam Schedules
  getExamSchedules: 'timetable.view',
  saveExamSchedule: 'timetable.manage',
  deleteExamSchedule: 'timetable.manage',

  // Teacher Portal Account Admin
  setTeacherPortalPin: 'teacherAccounts.manage',
  createTeacherAccount: 'teacherAccounts.manage',
  resetTeacherPassword: 'teacherAccounts.manage',
  setTeacherAccountStatus: 'teacherAccounts.manage',
  getTeacherAccounts: 'teacherAccounts.manage',

  // Behavior
  getBehaviorRecords: 'behavior.view',
  saveBehaviorViolation: 'behavior.create',
  saveBehaviorCase: 'behaviorCases.create',

  // Academic Years & Enrollments
  getAcademicYears: 'academicYears.view',
  saveAcademicYear: 'academicYears.create',
  saveStudentEnrollment: 'academicYears.edit',

  // Communications
  getParentCommunications: 'parentCommunication.view',
  saveParentCommunication: 'parentCommunication.create',

  // Users & Roles (Master spreadsheet only)
  getUsers: 'users.view',
  saveUser: 'users.create',
  deleteUser: 'users.manage',
  resetUserPassword: 'users.resetPassword',
  issueUserActivationToken: 'users.manageRoles',
  revokeUserSessions: 'users.manageRoles',
  toggleUserStatus: 'users.disable',

  // Master Schools (Master spreadsheet only)
  adminGetSchools: 'schools.manage',
  adminCreateSchool: 'schools.manage',
  adminUpdateSchool: 'schools.manage',
  adminGetSystemOverview: 'schools.manage',

  // Settings & Audit
  getSettings: 'settings.view',
  saveSettings: 'settings.manage',
  getAuditLogs: 'audit.view',
  addAuditLog: 'audit.view',

  // Lifecycle
  logout: 'settings.view',
  validateSession: 'settings.view',
  syncData: 'data.sync.full',
  createArchiveSnapshot: 'settings.manage',
};

/**
 * Server-Side Resource Ownership Verifier.
 * Ensures the target resource actually belongs to effectiveSchoolId in its school spreadsheet.
 */
export function verifyServerResourceOwnership(
  resource: { id?: string; schoolId?: string } | null | undefined,
  effectiveSchoolId: string
): { valid: boolean; code?: string; message?: string } {
  if (!resource) {
    return {
      valid: false,
      code: 'RESOURCE_NOT_FOUND',
      message: 'المورد المطلوب غير موجود في قاعدة بيانات هذه المدرسة',
    };
  }
  if (resource.schoolId && String(resource.schoolId).trim().toUpperCase() !== String(effectiveSchoolId).trim().toUpperCase()) {
    return {
      valid: false,
      code: 'CROSS_SCHOOL_ACCESS_DENIED',
      message: 'تم رفض العملية: المورد المطلوب ينتمي إلى مدرسة أخرى',
    };
  }
  return { valid: true };
}

/**
 * Isolated School Data Storage Engine for testing and backend dispatch validation.
 */
export interface SchoolDataStore {
  students: Array<{ id: string; name: string; schoolId?: string }>;
  employees: Array<{ id: string; name: string; schoolId?: string }>;
  schedule: Array<{ id: string; subject?: string; teacherId?: string; classroom?: string; schoolId?: string; version?: string }>;
  leaves: Array<{ id: string; employeeId: string; schoolId?: string; status?: string; [key: string]: any }>;
  permissions?: Array<{ id: string; employeeId: string; schoolId?: string; status?: string; [key: string]: any }>;
  settings: Record<string, any>;
  archivedReceipts?: Array<{ archivedAt: string; archivedBy: string; count: number }>;
}

const isolatedSchoolStores: Record<string, SchoolDataStore> = {
  'SCH-BADR': {
    students: [
      { id: 'STU-BADR-1', name: 'أحمد محمود', schoolId: 'SCH-BADR' },
      { id: 'STU-BADR-2', name: 'عمر خالد', schoolId: 'SCH-BADR' },
    ],
    employees: [
      { id: 'EMP-BADR-1', name: 'محمد علي', schoolId: 'SCH-BADR' },
    ],
    schedule: [
      { id: 'SCH-B1', subject: 'رياضيات', classroom: '1/1', schoolId: 'SCH-BADR' },
    ],
    leaves: [],
    permissions: [],
    settings: { schoolName: 'مدرسة بدر الحديثة' },
    archivedReceipts: [],
  },
  'SCH-ALNOOR': {
    students: [
      { id: 'STU-NOOR-100', name: 'فاطمة الزهراء', schoolId: 'SCH-ALNOOR' },
    ],
    employees: [
      { id: 'EMP-NOOR-1', name: 'هدى يوسف', schoolId: 'SCH-ALNOOR' },
    ],
    schedule: [
      { id: 'SCH-N1', subject: 'علوم', classroom: '2/1', schoolId: 'SCH-ALNOOR' },
    ],
    leaves: [],
    permissions: [],
    settings: { schoolName: 'مدرسة النور' },
    archivedReceipts: [],
  },
};

export function getIsolatedSchoolStore(schoolId: string): SchoolDataStore | undefined {
  return isolatedSchoolStores[String(schoolId).trim().toUpperCase()];
}

export function executeSchoolScopedAction(
  session: ServerSession,
  action: string,
  payload: any,
  options?: { targetSchoolId?: string }
): { success: boolean; code?: string; data?: any; message?: string; importedCount?: number; archiveReceipt?: any } {
  // 1. Resolve permission from ACTION_PERMISSION_MAP
  let permission = ACTION_PERMISSION_MAP[action];
  if (session.accessScope === 'SELF') {
    if (action === 'getLeaves' || action === 'getPermissions') {
      permission = 'leaves.own.view';
    } else if (action === 'saveLeave' || action === 'savePermission') {
      permission = 'leaves.own.create';
    }
  }

  // 2. Authorize
  const authRes = authorize(
    session,
    permission || action,
    {
      schoolId: options?.targetSchoolId || (session.accessScope === 'GLOBAL' ? options?.targetSchoolId : undefined),
      resourceId: payload?.id,
    }
  );

  if (!authRes.allowed) {
    return {
      success: false,
      code: authRes.code,
      message: authRes.reason,
    };
  }

  const effectiveSchoolId = authRes.effectiveSchoolId;
  const store = getIsolatedSchoolStore(effectiveSchoolId);
  if (!store) {
    return {
      success: false,
      code: 'SCHOOL_NOT_FOUND',
      message: `قاعدة بيانات المدرسة (${effectiveSchoolId}) غير متوفرة`,
    };
  }

  // 3. School-scoped resource actions with server-side ownership verification
  if (action === 'getStudents') {
    return { success: true, data: [...store.students] };
  }

  if (action === 'deleteStudent') {
    const studentIndex = store.students.findIndex(s => s.id === payload.id);
    if (studentIndex === -1) {
      return {
        success: false,
        code: 'RESOURCE_NOT_FOUND',
        message: 'سجل الطالب غير موجود في هذه المدرسة',
      };
    }
    const targetStudent = store.students[studentIndex];
    const ownership = verifyServerResourceOwnership(targetStudent, effectiveSchoolId);
    if (!ownership.valid) {
      return {
        success: false,
        code: ownership.code,
        message: ownership.message,
      };
    }
    store.students.splice(studentIndex, 1);
    return { success: true, message: 'تم حذف الطالب بنجاح' };
  }

  if (action === 'saveStudent') {
    if (payload.id) {
      const existing = store.students.find(s => s.id === payload.id);
      if (existing) {
        const ownership = verifyServerResourceOwnership(existing, effectiveSchoolId);
        if (!ownership.valid) {
          return { success: false, code: ownership.code, message: ownership.message };
        }
      }
    }
    const cleanStudent = { ...payload, schoolId: effectiveSchoolId };
    const idx = store.students.findIndex(s => s.id === cleanStudent.id);
    if (idx >= 0) {
      store.students[idx] = cleanStudent;
    } else {
      store.students.push(cleanStudent);
    }
    return { success: true, message: 'تم حفظ بيانات الطالب بنجاح' };
  }

  // Operational syncData reading strictly from school store
  if (action === 'syncData') {
    return {
      success: true,
      data: {
        schoolId: effectiveSchoolId,
        students: [...store.students],
        employees: [...store.employees],
        schedule: [...(store.schedule || [])],
        leaves: [...store.leaves],
        permissions: [...(store.permissions || [])],
        settings: { ...store.settings },
      },
    };
  }

  // School Leaves & Permissions with strict SELF Scope Enforcement
  if (action === 'getLeaves') {
    if (session.accessScope === 'SELF') {
      const selfEmpId = String(session.employeeId || session.userId || '').trim().toLowerCase();
      const ownLeaves = store.leaves.filter(
        l => String(l.employeeId || '').trim().toLowerCase() === selfEmpId
      );
      return { success: true, data: ownLeaves };
    }
    return { success: true, data: [...store.leaves] };
  }

  if (action === 'getPermissions') {
    store.permissions = store.permissions || [];
    if (session.accessScope === 'SELF') {
      const selfEmpId = String(session.employeeId || session.userId || '').trim().toLowerCase();
      const ownPerms = store.permissions.filter(
        p => String(p.employeeId || '').trim().toLowerCase() === selfEmpId
      );
      return { success: true, data: ownPerms };
    }
    return { success: true, data: [...store.permissions] };
  }

  if (action === 'saveLeave') {
    let leaveData = { ...payload };
    if (session.accessScope === 'SELF') {
      const selfEmpId = String(session.employeeId || session.userId || '').trim();
      if (leaveData.employeeId && String(leaveData.employeeId).trim().toLowerCase() !== selfEmpId.toLowerCase()) {
        recordSecurityAuditEvent({
          actorUserId: session.userId,
          actorRole: String(session.role),
          actorSchoolId: session.schoolId,
          targetSchoolId: effectiveSchoolId,
          action: 'saveLeave',
          code: 'SELF_SCOPE_VIOLATION',
          reason: 'محاولة تسجيل إجازة لموظف آخر (forged employeeId)',
        });
        return {
          success: false,
          code: 'SELF_SCOPE_VIOLATION',
          message: 'تم رفض العملية: غير مصرح بطلب أو تسجيل إجازة لموظف آخر',
        };
      }
      if (leaveData.id) {
        const existing = store.leaves.find(l => l.id === leaveData.id);
        if (existing) {
          if (String(existing.employeeId || '').trim().toLowerCase() !== selfEmpId.toLowerCase()) {
            recordSecurityAuditEvent({
              actorUserId: session.userId,
              actorRole: String(session.role),
              actorSchoolId: session.schoolId,
              targetSchoolId: effectiveSchoolId,
              action: 'saveLeave',
              code: 'SELF_SCOPE_VIOLATION',
              reason: 'محاولة تعديل إجازة موظف آخر عبر معرف معروف',
            });
            return {
              success: false,
              code: 'SELF_SCOPE_VIOLATION',
              message: 'تم رفض العملية: غير مصرح بتعديل إجازة موظف آخر',
            };
          }
          if (leaveData.status && leaveData.status !== existing.status) {
            if (['Approved', 'Rejected', 'معتمدة', 'مرفوضة'].includes(leaveData.status)) {
              return {
                success: false,
                code: 'ROLE_PERMISSION_DENIED',
                message: 'غير مصرح بتغيير حالة اعتماد الإجازة إدارياً',
              };
            }
          }
        }
      }
      leaveData.employeeId = selfEmpId;
    }

    const cleanLeave = { ...leaveData, schoolId: effectiveSchoolId };
    const idx = store.leaves.findIndex(l => l.id === cleanLeave.id);
    if (idx >= 0) {
      store.leaves[idx] = cleanLeave;
    } else {
      store.leaves.push(cleanLeave);
    }
    return { success: true, message: 'تم حفظ سجل الإجازة بنجاح' };
  }

  if (action === 'savePermission') {
    store.permissions = store.permissions || [];
    let permData = { ...payload };
    if (session.accessScope === 'SELF') {
      const selfEmpId = String(session.employeeId || session.userId || '').trim();
      if (permData.employeeId && String(permData.employeeId).trim().toLowerCase() !== selfEmpId.toLowerCase()) {
        recordSecurityAuditEvent({
          actorUserId: session.userId,
          actorRole: String(session.role),
          actorSchoolId: session.schoolId,
          targetSchoolId: effectiveSchoolId,
          action: 'savePermission',
          code: 'SELF_SCOPE_VIOLATION',
          reason: 'محاولة تسجيل إذن لموظف آخر (forged employeeId)',
        });
        return {
          success: false,
          code: 'SELF_SCOPE_VIOLATION',
          message: 'تم رفض العملية: غير مصرح بطلب أو تسجيل إذن لموظف آخر',
        };
      }
      if (permData.id) {
        const existing = store.permissions.find(p => p.id === permData.id);
        if (existing) {
          if (String(existing.employeeId || '').trim().toLowerCase() !== selfEmpId.toLowerCase()) {
            recordSecurityAuditEvent({
              actorUserId: session.userId,
              actorRole: String(session.role),
              actorSchoolId: session.schoolId,
              targetSchoolId: effectiveSchoolId,
              action: 'savePermission',
              code: 'SELF_SCOPE_VIOLATION',
              reason: 'محاولة تعديل إذن موظف آخر عبر معرف معروف',
            });
            return {
              success: false,
              code: 'SELF_SCOPE_VIOLATION',
              message: 'تم رفض العملية: غير مصرح بتعديل إذن موظف آخر',
            };
          }
          if (permData.status && permData.status !== existing.status) {
            if (['Approved', 'Rejected', 'معتمد', 'مرفوض'].includes(permData.status)) {
              return {
                success: false,
                code: 'ROLE_PERMISSION_DENIED',
                message: 'غير مصرح بتغيير حالة اعتماد الإذن إدارياً',
              };
            }
          }
        }
      }
      permData.employeeId = selfEmpId;
    }

    const cleanPerm = { ...permData, schoolId: effectiveSchoolId };
    const idx = store.permissions.findIndex(p => p.id === cleanPerm.id);
    if (idx >= 0) {
      store.permissions[idx] = cleanPerm;
    } else {
      store.permissions.push(cleanPerm);
    }
    return { success: true, message: 'تم حفظ سجل الإذن بنجاح' };
  }

  if (action === 'deleteLeave') {
    if (session.accessScope === 'SELF') {
      return {
        success: false,
        code: 'ROLE_PERMISSION_DENIED',
        message: 'حسابات النطاق الذاتي غير مصرح لها بحذف سجلات الإجازات',
      };
    }
    const idx = store.leaves.findIndex(l => l.id === payload?.id);
    if (idx >= 0) {
      store.leaves.splice(idx, 1);
    }
    return { success: true, message: 'تم حذف سجل الإجازة بنجاح' };
  }

  if (action === 'deletePermission') {
    if (session.accessScope === 'SELF') {
      return {
        success: false,
        code: 'ROLE_PERMISSION_DENIED',
        message: 'حسابات النطاق الذاتي غير مصرح لها بحذف سجلات الأذونات',
      };
    }
    store.permissions = store.permissions || [];
    const idx = store.permissions.findIndex(p => p.id === payload?.id);
    if (idx >= 0) {
      store.permissions.splice(idx, 1);
    }
    return { success: true, message: 'تم حذف سجل الإذن بنجاح' };
  }

  // Timetable import strictly isolated to effective school store
  if (action === 'commitTimetableImport') {
    if (!payload?.rows || !Array.isArray(payload.rows) || payload.rows.length === 0) {
      return { success: false, code: 'EMPTY_BATCH', message: 'مجموعة البيانات المراد استيرادها فارغة' };
    }
    const cleanRows = payload.rows.map((r: any) => ({
      ...r,
      schoolId: effectiveSchoolId,
    }));
    store.schedule = store.schedule || [];
    store.schedule.push(...cleanRows);
    return { success: true, importedCount: cleanRows.length, message: 'تم استيراد واعتماد الجدول' };
  }

  // Server-side archive snapshot executes on school store
  if (action === 'createArchiveSnapshot') {
    const count = (store.schedule || []).length;
    const receipt = {
      archivedAt: new Date().toISOString(),
      archivedBy: session.username || session.userId,
      schoolId: effectiveSchoolId,
      totalRowsArchived: count,
    };
    store.archivedReceipts = store.archivedReceipts || [];
    store.archivedReceipts.push({ archivedAt: receipt.archivedAt, archivedBy: receipt.archivedBy, count });
    return { success: true, archiveReceipt: receipt, message: 'تم أرشفة وتجميد الجداول التشغيلية للمدرسة بنجاح' };
  }

  return { success: true, data: null };
}

// -------------------------------------------------------------
// CENTRAL USER MANAGEMENT & SCHOOL ISOLATION ENGINE
// -------------------------------------------------------------

export interface BackendUserRecord {
  id: string;
  email?: string;
  username: string;
  fullName: string;
  role: string;
  accessScope?: AccessScope;
  schoolId?: string;
  allowedSchoolIds?: string[];
  employeeId?: string;
  status: string;
  department?: string;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
  loginNumber?: number | string;
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
  passwordAlgorithm?: string;
  passwordIterations?: number;
  activationTokenHash?: string;
}

/**
 * Normalizes staff roles to canonical staff roles.
 * Returns null for invalid, non-staff, or unknown roles.
 */
export function normalizeUserRole(role: string): string | null {
  const r = String(role || '').trim();
  if (!r) return null;
  if (r === 'Parent' || r === 'Student') return null;
  if (r === 'SystemAdmin') return 'SystemAdmin';
  if (r === 'SchoolAdmin') return 'SchoolAdmin';
  if (r === 'Admin') return 'SchoolAdmin';
  if (r === 'SchoolDirector' || r === 'Supervisor') return 'SchoolDirector';
  if (r === 'StudentAffairs') return 'StudentAffairs';
  if (r === 'TeacherAffairs' || r === 'HR' || r === 'Employee') return 'TeacherAffairs';
  if (r === 'SocialSpecialist' || r === 'BehaviorOfficer') return 'SocialSpecialist';
  if (r === 'TrainingOfficer') return 'TrainingOfficer';
  if (r === 'QualityOfficer' || r === 'Viewer') return 'QualityOfficer';
  if (r === 'Teacher') return 'Teacher';
  if (r === 'AdministrativeEmployee') return 'AdministrativeEmployee';
  return null;
}

/**
 * Derives authoritative accessScope strictly from canonical role.
 */
export function deriveUserAccessScope(normalizedRole: string): AccessScope {
  if (normalizedRole === 'SystemAdmin') return 'GLOBAL';
  if (normalizedRole === 'Teacher') return 'SELF';
  return 'SCHOOL';
}

/**
 * Normalizes email address.
 */
export function normalizeEmail(email: string | undefined): string {
  return String(email || '').trim().toLowerCase();
}

/**
 * Validates email format according to standard pattern.
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Returns safe User DTO. Purges internal secrets, passwords, hashes, salts, and tokens.
 */
export function sanitizeUserDTO(u: BackendUserRecord): BackendUserRecord {
  const roleStr = String(u.role || '').trim();
  const normRole = normalizeUserRole(roleStr);

  if (!normRole) {
    return {
      id: String(u.id || '').trim(),
      username: String(u.username || '').trim(),
      email: u.email ? normalizeEmail(u.email) : undefined,
      fullName: String(u.fullName || '').trim(),
      role: 'NeedsAdminReview',
      accessScope: 'SCHOOL',
      schoolId: '',
      allowedSchoolIds: [],
      employeeId: undefined,
      status: 'NeedsAdminReview',
      department: String(u.department || '').trim() || undefined,
      createdAt: u.createdAt || '',
      updatedAt: u.updatedAt || '',
      lastLogin: u.lastLogin || '',
      loginNumber: u.loginNumber || '',
    };
  }

  const derivedScope = deriveUserAccessScope(normRole);
  let safeSchoolId = '';
  let safeAllowedSchoolIds: string[] = [];

  if (derivedScope === 'GLOBAL') {
    safeAllowedSchoolIds = u.allowedSchoolIds
      ? Array.from(new Set(u.allowedSchoolIds.map(s => String(s).trim().toUpperCase()).filter(Boolean)))
      : [];
  } else {
    const storedSchool = String(u.schoolId || '').trim().toUpperCase();
    safeSchoolId = storedSchool;
    safeAllowedSchoolIds = storedSchool ? [storedSchool] : [];
  }

  return {
    id: String(u.id || '').trim(),
    username: String(u.username || '').trim(),
    email: u.email ? normalizeEmail(u.email) : undefined,
    fullName: String(u.fullName || '').trim(),
    role: normRole,
    accessScope: derivedScope,
    schoolId: safeSchoolId,
    allowedSchoolIds: safeAllowedSchoolIds,
    employeeId: derivedScope === 'GLOBAL' ? undefined : (String(u.employeeId || '').trim() || undefined),
    status: String(u.status || 'Active').trim(),
    department: String(u.department || '').trim() || undefined,
    createdAt: u.createdAt || '',
    updatedAt: u.updatedAt || '',
    lastLogin: u.lastLogin || '',
    loginNumber: u.loginNumber || '',
  };
}

let masterUsersStore: BackendUserRecord[] = [
  { id: 'usr-sysadmin-1', email: 'sysadmin@ntss.edu.eg', username: 'sysadmin', fullName: 'مدير النظام العام', role: 'SystemAdmin', accessScope: 'GLOBAL', allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'], status: 'Active' },
  { id: 'usr-admin-badr', email: 'admin_badr@ntss.edu.eg', username: 'admin_badr', fullName: 'مدير مدرسة بدر', role: 'SchoolAdmin', accessScope: 'SCHOOL', schoolId: 'SCH-BADR', allowedSchoolIds: ['SCH-BADR'], status: 'Active' },
  { id: 'usr-admin-noor', email: 'admin_noor@ntss.edu.eg', username: 'admin_noor', fullName: 'مدير مدرسة النور', role: 'SchoolAdmin', accessScope: 'SCHOOL', schoolId: 'SCH-ALNOOR', allowedSchoolIds: ['SCH-ALNOOR'], status: 'Active' },
  { id: 'usr-director-badr', email: 'director_badr@ntss.edu.eg', username: 'director_badr', fullName: 'ناظر مدرسة بدر', role: 'SchoolDirector', accessScope: 'SCHOOL', schoolId: 'SCH-BADR', allowedSchoolIds: ['SCH-BADR'], status: 'Active' },
  { id: 'usr-teacher-badr', email: 'teacher_badr@ntss.edu.eg', username: 'teacher_badr', fullName: 'معلم بدر', role: 'Teacher', accessScope: 'SELF', schoolId: 'SCH-BADR', allowedSchoolIds: ['SCH-BADR'], status: 'Active' },
  { id: 'usr-teacher-noor', email: 'teacher_noor@ntss.edu.eg', username: 'teacher_noor', fullName: 'معلم النور', role: 'Teacher', accessScope: 'SELF', schoolId: 'SCH-ALNOOR', allowedSchoolIds: ['SCH-ALNOOR'], status: 'Active' },
];

export function resetMasterUsersStore() {
  masterUsersStore = [
    { id: 'usr-sysadmin-1', email: 'sysadmin@ntss.edu.eg', username: 'sysadmin', fullName: 'مدير النظام العام', role: 'SystemAdmin', accessScope: 'GLOBAL', allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'], status: 'Active' },
    { id: 'usr-admin-badr', email: 'admin_badr@ntss.edu.eg', username: 'admin_badr', fullName: 'مدير مدرسة بدر', role: 'SchoolAdmin', accessScope: 'SCHOOL', schoolId: 'SCH-BADR', allowedSchoolIds: ['SCH-BADR'], status: 'Active' },
    { id: 'usr-admin-noor', email: 'admin_noor@ntss.edu.eg', username: 'admin_noor', fullName: 'مدير مدرسة النور', role: 'SchoolAdmin', accessScope: 'SCHOOL', schoolId: 'SCH-ALNOOR', allowedSchoolIds: ['SCH-ALNOOR'], status: 'Active' },
    { id: 'usr-director-badr', email: 'director_badr@ntss.edu.eg', username: 'director_badr', fullName: 'ناظر مدرسة بدر', role: 'SchoolDirector', accessScope: 'SCHOOL', schoolId: 'SCH-BADR', allowedSchoolIds: ['SCH-BADR'], status: 'Active' },
    { id: 'usr-teacher-badr', email: 'teacher_badr@ntss.edu.eg', username: 'teacher_badr', fullName: 'معلم بدر', role: 'Teacher', accessScope: 'SELF', schoolId: 'SCH-BADR', allowedSchoolIds: ['SCH-BADR'], status: 'Active' },
    { id: 'usr-teacher-noor', email: 'teacher_noor@ntss.edu.eg', username: 'teacher_noor', fullName: 'معلم النور', role: 'Teacher', accessScope: 'SELF', schoolId: 'SCH-ALNOOR', allowedSchoolIds: ['SCH-ALNOOR'], status: 'Active' },
  ];
}

export function getUsersListSecure(session: ServerSession): { success: boolean; data?: BackendUserRecord[]; code?: string; message?: string } {
  const auth = authorize(session, 'users.view');
  if (!auth.allowed) {
    return { success: false, code: auth.code, message: auth.reason };
  }

  const role = session.role;
  const sessionSchool = String(session.schoolId || '').trim().toUpperCase();
  const allowed = (session.allowedSchoolIds || []).map(s => s.trim().toUpperCase());

  const filtered = masterUsersStore.filter(u => {
    const normalizedTargetRole = normalizeUserRole(String(u.role || ''));
    if (!normalizedTargetRole) return false;

    const uSchool = String(u.schoolId || '').trim().toUpperCase();
    if (role === 'SchoolAdmin') {
      if (normalizedTargetRole === 'SystemAdmin') return false;
      return uSchool === sessionSchool;
    }
    if (role === 'SystemAdmin') {
      if (normalizedTargetRole === 'SystemAdmin') {
        const targetAllowed = (u.allowedSchoolIds || []).map(s => String(s).trim().toUpperCase()).filter(Boolean);
        return targetAllowed.every(schoolId => allowed.includes(schoolId));
      }
      if (!uSchool) return false;
      return allowed.includes(uSchool);
    }
    if (role === 'Admin') {
      return uSchool === sessionSchool;
    }
    return false;
  });

  return { success: true, data: filtered.map(sanitizeUserDTO) };
}

export function saveUserSecure(
  session: ServerSession,
  payload: Partial<BackendUserRecord>
): { success: boolean; user?: BackendUserRecord; code?: string; message?: string } {
  const targetId = payload.id ? String(payload.id).trim() : '';
  const targetUsername = payload.username ? String(payload.username).trim().toLowerCase() : '';
  const existingUser = masterUsersStore.find(
    u => (targetId && u.id === targetId) || (targetUsername && u.username.toLowerCase() === targetUsername)
  );

  // Dynamic authorization check: new user -> users.create; edit existing user -> users.edit
  const requiredPerm = existingUser ? 'users.edit' : 'users.create';
  const auth = authorize(session, requiredPerm);
  if (!auth.allowed) {
    return { success: false, code: auth.code, message: auth.reason };
  }

  // Validate target role
  const targetRoleRaw = String(payload.role || (existingUser ? existingUser.role : '')).trim();
  const targetRole = normalizeUserRole(targetRoleRaw);
  if (!targetRole) {
    return {
      success: false,
      code: 'INVALID_ROLE',
      message: `الدور المحدد غير صالح: ${targetRoleRaw}`,
    };
  }
  payload.role = targetRole;

  // If role is changed on an existing user, additionally require users.manageRoles
  if (existingUser && targetRole !== existingUser.role) {
    const roleAuth = authorize(session, 'users.manageRoles');
    if (!roleAuth.allowed) {
      return {
        success: false,
        code: roleAuth.code || 'ROLE_PERMISSION_DENIED',
        message: 'تعديل دور المستخدم يتطلب صلاحية users.manageRoles',
      };
    }
  }

  // Self-protection on edit
  if (existingUser) {
    const isSelf = existingUser.id === session.userId ||
      (session.username && existingUser.username.toLowerCase() === session.username.toLowerCase());
    if (isSelf) {
      if (existingUser.role === 'SystemAdmin' && targetRole !== 'SystemAdmin') {
        return {
          success: false,
          code: 'SELF_DEMOTION_DENIED',
          message: 'لا يمكن لمدير النظام تجريد نفسه من صلاحية مدير النظام',
        };
      }
      if (payload.status && String(payload.status).toLowerCase() !== 'active') {
        return {
          success: false,
          code: 'SELF_DISABLE_DENIED',
          message: 'لا يمكن تعطيل الحساب الحالي المستخدم في الجلسة',
        };
      }
    }
  }

  // Role boundaries & School scoping
  const actorRole = session.role;
  const sessionSchool = String(session.schoolId || '').trim().toUpperCase();

  if (actorRole === 'SchoolAdmin') {
    if (existingUser) {
      if (existingUser.role === 'SystemAdmin') {
        return {
          success: false,
          code: 'FORBIDDEN',
          message: 'غير مصرح بتعديل حساب مدير نظام عام',
        };
      }
      if (existingUser.schoolId && String(existingUser.schoolId).trim().toUpperCase() !== sessionSchool) {
        return {
          success: false,
          code: 'CROSS_SCHOOL_ACCESS_DENIED',
          message: 'غير مصرح بتعديل مستخدم ينتمي لمدرسة أخرى',
        };
      }
    }
    if (targetRole === 'SystemAdmin') {
      return {
        success: false,
        code: 'ROLE_ESCALATION_DENIED',
        message: 'لا يمكن لمدير المدرسة إنشاء أو ترقية مستخدم إلى مدير نظام عام (SystemAdmin)',
      };
    }
    payload.schoolId = session.schoolId;
    payload.allowedSchoolIds = session.schoolId ? [session.schoolId] : [];
  } else if (actorRole === 'SystemAdmin') {
    const actorAllowed = (session.allowedSchoolIds || []).map(s => s.trim().toUpperCase());

    if (targetRole === 'SystemAdmin') {
      payload.schoolId = '';
      payload.employeeId = '';
      const allowedSource = payload.allowedSchoolIds !== undefined
        ? payload.allowedSchoolIds
        : (existingUser?.allowedSchoolIds || []);
      const parsedAllowed = (allowedSource || []).map(s => String(s).trim().toUpperCase()).filter(Boolean);
      const registry = getMasterSchoolRegistry();

      if (parsedAllowed.length > 0) {
        if (!registry || registry.length === 0) {
          return {
            success: false,
            code: 'SCHOOL_REGISTRY_UNAVAILABLE',
            message: 'سجل المدارس الرئيسي غير متوفر أو فارغ، تعذر التحقق من المدارس المصرح بها',
          };
        }
        const validSchoolIds = registry.map(s => s.schoolId.toUpperCase());
        for (const chkId of parsedAllowed) {
          if (!validSchoolIds.includes(chkId)) {
            return {
              success: false,
              code: 'INVALID_SCHOOL_ID',
              message: `المدرسة المحددة غير مسجلة في النظام: ${chkId}`,
            };
          }
          if (!actorAllowed.includes(chkId)) {
            return {
              success: false,
              code: 'ACCESS_DENIED_SCHOOL_SCOPE',
              message: `لا يمكن منح صلاحية لمدارس خارج نطاق صلاحيات مدير النظام الحالي: ${chkId}`,
            };
          }
        }
      }
      payload.allowedSchoolIds = Array.from(new Set(parsedAllowed));
    } else {
      // School-scoped user
      const targetSchId = String(payload.schoolId !== undefined ? payload.schoolId : (existingUser ? existingUser.schoolId : '')).trim().toUpperCase();
      if (!targetSchId) {
        return {
          success: false,
          code: 'SCHOOL_REQUIRED',
          message: 'يجب تحديد المدرسة للمستخدم',
        };
      }
      const registry = getMasterSchoolRegistry();
      if (!registry || registry.length === 0) {
        return {
          success: false,
          code: 'SCHOOL_REGISTRY_UNAVAILABLE',
          message: 'سجل المدارس الرئيسي غير متوفر أو فارغ، تعذر التحقق من المدرسة',
        };
      }
      const validSchoolIds = registry.map(s => s.schoolId.toUpperCase());

      if (!validSchoolIds.includes(targetSchId)) {
        return {
          success: false,
          code: 'INVALID_SCHOOL_ID',
          message: `المدرسة المحددة غير مسجلة في النظام: ${targetSchId}`,
        };
      }
      if (!actorAllowed.includes(targetSchId)) {
        return {
          success: false,
          code: 'ACCESS_DENIED_SCHOOL_SCOPE',
          message: 'المدرسة المحددة للمستخدم خارج نطاق المدارس المصرح لك بها',
        };
      }
      if (existingUser && existingUser.schoolId && !actorAllowed.includes(String(existingUser.schoolId).trim().toUpperCase())) {
        return {
          success: false,
          code: 'ACCESS_DENIED_SCHOOL_SCOPE',
          message: 'المستخدم ينتمي لمدرسة خارج نطاق الصلاحيات المصرح لك بها',
        };
      }
      payload.schoolId = targetSchId;
      payload.allowedSchoolIds = [targetSchId];
    }
  }

  // School transfer immutability on existing user
  if (existingUser && existingUser.schoolId) {
    const existSch = String(existingUser.schoolId).trim().toUpperCase();
    const reqSch = payload.schoolId !== undefined ? String(payload.schoolId || '').trim().toUpperCase() : '';
    if (reqSch && reqSch !== existSch) {
      return {
        success: false,
        code: 'USER_SCHOOL_IMMUTABLE',
        message: 'لا يمكن نقل المستخدم بين المدارس مباشرة',
      };
    }
  }

  // Email validation & immutability
  const rawEmail = payload.email !== undefined ? normalizeEmail(payload.email) : '';
  const isAdministrativeUser = (targetRole !== 'Teacher');
  if (!existingUser) {
    if (isAdministrativeUser && !rawEmail) {
      return {
        success: false,
        code: 'EMAIL_REQUIRED',
        message: 'البريد الإلكتروني مطلوب لإنشاء مستخدم جديد',
      };
    }
    if (rawEmail) {
      if (!isValidEmailFormat(rawEmail)) {
        return {
          success: false,
          code: 'INVALID_EMAIL',
          message: 'صيغة البريد الإلكتروني غير صالحة',
        };
      }
      const duplicate = masterUsersStore.find(
        u => u.email && normalizeEmail(u.email) === rawEmail
      );
      if (duplicate) {
        return {
          success: false,
          code: 'DUPLICATE_ACCOUNT_EMAIL',
          message: 'البريد الإلكتروني مستخدم بالفعل لحساب آخر',
        };
      }
    }
    payload.email = rawEmail;
  } else {
    const existingEmail = normalizeEmail(existingUser.email);
    if (existingEmail && rawEmail && rawEmail !== existingEmail) {
      return {
        success: false,
        code: 'USER_EMAIL_IMMUTABLE',
        message: 'لا يمكن تعديل البريد الإلكتروني للحساب بعد إنشائه',
      };
    }
    payload.email = existingEmail || rawEmail;
  }

  // Derive accessScope from role
  const derivedScope = deriveUserAccessScope(targetRole);
  payload.accessScope = derivedScope;

  const record: BackendUserRecord = {
    id: existingUser ? existingUser.id : (payload.id || `USR_${Date.now()}`),
    username: String(payload.username || (existingUser ? existingUser.username : '')).trim().toLowerCase(),
    fullName: payload.fullName !== undefined ? payload.fullName : (existingUser ? existingUser.fullName : ''),
    role: targetRole,
    accessScope: derivedScope,
    schoolId: payload.schoolId !== undefined ? payload.schoolId : (existingUser ? existingUser.schoolId : undefined),
    allowedSchoolIds: payload.allowedSchoolIds !== undefined ? payload.allowedSchoolIds : (existingUser ? existingUser.allowedSchoolIds : undefined),
    employeeId: payload.employeeId !== undefined ? payload.employeeId : (existingUser ? existingUser.employeeId : undefined),
    status: payload.status || (existingUser ? existingUser.status : 'Active'),
    department: payload.department !== undefined ? payload.department : (existingUser ? existingUser.department : undefined),
    email: payload.email || (existingUser ? existingUser.email : undefined),
    createdAt: existingUser ? existingUser.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLogin: existingUser ? existingUser.lastLogin : undefined,
  };

  const sanitized = sanitizeUserDTO(record);

  const idx = masterUsersStore.findIndex(u => u.id === record.id);
  if (idx >= 0) {
    masterUsersStore[idx] = record;
  } else {
    masterUsersStore.push(record);
  }

  // Audit event logging
  let auditAction = 'USER_CREATED';
  if (existingUser) {
    if (targetRole !== existingUser.role) {
      auditAction = 'USER_ROLE_CHANGED';
    } else if (record.status !== existingUser.status) {
      auditAction = 'USER_STATUS_CHANGED';
    } else {
      auditAction = 'USER_UPDATED';
    }
  }

  recordSecurityAuditEvent({
    requestId: `REQ_${Date.now()}`,
    actorUserId: session.userId || 'UNKNOWN_ACTOR',
    actorRole: session.role || 'UNKNOWN_ROLE',
    actorSchoolId: session.schoolId || 'GLOBAL',
    targetSchoolId: record.schoolId || 'GLOBAL',
    action: auditAction,
    resourceId: record.id,
    reason: `حفظ حساب مستخدم: ${targetRole}`,
  });

  return { success: true, user: sanitized, message: 'تم حفظ حساب المستخدم بنجاح' };
}

export function deleteUserSecure(
  session: ServerSession,
  targetUserId: string
): { success: boolean; code?: string; message?: string } {
  const auth = authorize(session, 'users.manage');
  if (!auth.allowed) {
    return { success: false, code: auth.code, message: auth.reason };
  }

  const target = masterUsersStore.find(u => u.id === targetUserId);
  if (!target) {
    return { success: false, code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' };
  }

  // Self-protection
  if (target.id === session.userId || (session.username && target.username.toLowerCase() === session.username.toLowerCase())) {
    return { success: false, code: 'SELF_DELETION_DENIED', message: 'لا يمكن حذف الحساب الحالي المستخدم في الجلسة' };
  }

  const role = session.role;
  const sessionSchool = String(session.schoolId || '').trim().toUpperCase();

  if (role === 'SchoolAdmin') {
    if (target.role === 'SystemAdmin') {
      return { success: false, code: 'FORBIDDEN', message: 'غير مصرح بحذف حساب مدير نظام عام' };
    }
    if (target.schoolId && String(target.schoolId).trim().toUpperCase() !== sessionSchool) {
      return { success: false, code: 'CROSS_SCHOOL_ACCESS_DENIED', message: 'غير مصرح بحذف مستخدم ينتمي لمدرسة أخرى' };
    }
  } else if (role === 'SystemAdmin') {
    const allowed = (session.allowedSchoolIds || []).map(s => s.trim().toUpperCase());
    if (normalizeUserRole(String(target.role || '')) === 'SystemAdmin') {
      const targetAllowed = (target.allowedSchoolIds || []).map(s => String(s).trim().toUpperCase()).filter(Boolean);
      if (!targetAllowed.every(schoolId => allowed.includes(schoolId))) {
        return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'مدير النظام المستهدف لديه نطاق مدارس يتجاوز نطاق صلاحياتك' };
      }
    } else if (target.schoolId && !allowed.includes(target.schoolId.trim().toUpperCase())) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المستخدم يتبع مدرسة خارج نطاق المدارس المصرح بها' };
    }
  }

  const idx = masterUsersStore.findIndex(u => u.id === targetUserId);
  if (idx >= 0) {
    masterUsersStore.splice(idx, 1);
  }

  recordSecurityAuditEvent({
    requestId: `REQ_${Date.now()}`,
    actorUserId: session.userId || 'UNKNOWN_ACTOR',
    actorRole: session.role || 'UNKNOWN_ROLE',
    actorSchoolId: session.schoolId || 'GLOBAL',
    targetSchoolId: target.schoolId || 'GLOBAL',
    action: 'USER_DELETED',
    resourceId: target.id,
    reason: 'حذف حساب مستخدم',
  });

  return { success: true, message: 'تم حذف حساب المستخدم بنجاح' };
}

export function resetUserPasswordSecure(
  session: ServerSession,
  targetUserId: string
): { success: boolean; code?: string; message?: string } {
  const auth = authorize(session, 'users.resetPassword');
  if (!auth.allowed) {
    return { success: false, code: auth.code, message: auth.reason };
  }

  const target = masterUsersStore.find(u => u.id === targetUserId);
  if (!target) {
    return { success: false, code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' };
  }

  const role = session.role;
  const sessionSchool = String(session.schoolId || '').trim().toUpperCase();

  if (role === 'SchoolAdmin') {
    if (target.role === 'SystemAdmin') {
      return { success: false, code: 'FORBIDDEN', message: 'غير مصرح بإعادة تعيين كلمة مرور مدير نظام عام' };
    }
    if (target.schoolId && String(target.schoolId).trim().toUpperCase() !== sessionSchool) {
      return { success: false, code: 'CROSS_SCHOOL_ACCESS_DENIED', message: 'غير مصرح بإعادة تعيين كلمة مرور مستخدم ينتمي لمدرسة أخرى' };
    }
  } else if (role === 'SystemAdmin') {
    const allowed = (session.allowedSchoolIds || []).map(s => s.trim().toUpperCase());
    if (normalizeUserRole(String(target.role || '')) === 'SystemAdmin') {
      const targetAllowed = (target.allowedSchoolIds || []).map(s => String(s).trim().toUpperCase()).filter(Boolean);
      if (!targetAllowed.every(schoolId => allowed.includes(schoolId))) {
        return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'مدير النظام المستهدف لديه نطاق مدارس يتجاوز نطاق صلاحياتك' };
      }
    } else if (target.schoolId && !allowed.includes(target.schoolId.trim().toUpperCase())) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المستخدم يتبع مدرسة خارج نطاق المدارس المصرح بها' };
    }
  }

  recordSecurityAuditEvent({
    requestId: `REQ_${Date.now()}`,
    actorUserId: session.userId || 'UNKNOWN_ACTOR',
    actorRole: session.role || 'UNKNOWN_ROLE',
    actorSchoolId: session.schoolId || 'GLOBAL',
    targetSchoolId: target.schoolId || 'GLOBAL',
    action: 'USER_PASSWORD_RESET',
    resourceId: target.id,
    reason: 'إعادة تعيين كلمة مرور مستخدم',
  });

  return { success: true, message: 'تم إعادة تعيين كلمة المرور بنجاح' };
}

export function toggleUserStatusSecure(
  session: ServerSession,
  targetUserId: string,
  newStatus?: string
): { success: boolean; status?: string; code?: string; message?: string } {
  const auth = authorize(session, 'users.disable');
  if (!auth.allowed) {
    return { success: false, code: auth.code, message: auth.reason };
  }

  const target = masterUsersStore.find(u => u.id === targetUserId);
  if (!target) {
    return { success: false, code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' };
  }

  const currentStatus = target.status || 'Active';
  const nextStatus = newStatus || (currentStatus === 'Active' ? 'Suspended' : 'Active');

  // Self-protection
  if (target.id === session.userId || (session.username && target.username.toLowerCase() === session.username.toLowerCase())) {
    if (nextStatus !== 'Active') {
      return { success: false, code: 'SELF_DISABLE_DENIED', message: 'لا يمكن تعطيل الحساب الحالي المستخدم في الجلسة' };
    }
  }

  const role = session.role;
  const sessionSchool = String(session.schoolId || '').trim().toUpperCase();

  if (role === 'SchoolAdmin') {
    if (target.role === 'SystemAdmin') {
      return { success: false, code: 'FORBIDDEN', message: 'غير مصرح بتعديل حالة حساب مدير نظام عام' };
    }
    if (target.schoolId && String(target.schoolId).trim().toUpperCase() !== sessionSchool) {
      return { success: false, code: 'CROSS_SCHOOL_ACCESS_DENIED', message: 'غير مصرح بتعديل حالة مستخدم ينتمي لمدرسة أخرى' };
    }
  } else if (role === 'SystemAdmin') {
    const allowed = (session.allowedSchoolIds || []).map(s => s.trim().toUpperCase());
    if (normalizeUserRole(String(target.role || '')) === 'SystemAdmin') {
      const targetAllowed = (target.allowedSchoolIds || []).map(s => String(s).trim().toUpperCase()).filter(Boolean);
      if (!targetAllowed.every(schoolId => allowed.includes(schoolId))) {
        return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'مدير النظام المستهدف لديه نطاق مدارس يتجاوز نطاق صلاحياتك' };
      }
    } else if (target.schoolId && !allowed.includes(target.schoolId.trim().toUpperCase())) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المستخدم يتبع مدرسة خارج نطاق المدارس المصرح بها' };
    }
  }

  target.status = nextStatus;

  recordSecurityAuditEvent({
    requestId: `REQ_${Date.now()}`,
    actorUserId: session.userId || 'UNKNOWN_ACTOR',
    actorRole: session.role || 'UNKNOWN_ROLE',
    actorSchoolId: session.schoolId || 'GLOBAL',
    targetSchoolId: target.schoolId || 'GLOBAL',
    action: 'USER_STATUS_CHANGED',
    resourceId: target.id,
    reason: `تعديل حالة حساب المستخدم إلى ${nextStatus}`,
  });

  return { success: true, status: target.status, message: `تم تحديث حالة الحساب إلى ${target.status}` };
}

export function revokeUserSessionsSecure(
  session: ServerSession,
  targetUserId: string
): { success: boolean; code?: string; message?: string } {
  const auth = authorize(session, 'users.manageRoles');
  if (!auth.allowed) {
    return { success: false, code: auth.code, message: auth.reason };
  }

  const target = masterUsersStore.find(u => u.id === targetUserId);
  if (!target) {
    return { success: false, code: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' };
  }

  const role = session.role;
  const sessionSchool = String(session.schoolId || '').trim().toUpperCase();

  if (role === 'SchoolAdmin') {
    if (target.role === 'SystemAdmin') {
      return { success: false, code: 'FORBIDDEN', message: 'غير مصرح بإلغاء جلسات مدير نظام عام' };
    }
    if (target.schoolId && String(target.schoolId).trim().toUpperCase() !== sessionSchool) {
      return { success: false, code: 'CROSS_SCHOOL_ACCESS_DENIED', message: 'غير مصرح بإلغاء جلسات مستخدم ينتمي لمدرسة أخرى' };
    }
  } else if (role === 'SystemAdmin') {
    const allowed = (session.allowedSchoolIds || []).map(s => s.trim().toUpperCase());
    if (normalizeUserRole(String(target.role || '')) === 'SystemAdmin') {
      const targetAllowed = (target.allowedSchoolIds || []).map(s => String(s).trim().toUpperCase()).filter(Boolean);
      if (!targetAllowed.every(schoolId => allowed.includes(schoolId))) {
        return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'مدير النظام المستهدف لديه نطاق مدارس يتجاوز نطاق صلاحياتك' };
      }
    } else if (target.schoolId && !allowed.includes(target.schoolId.trim().toUpperCase())) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المستخدم يتبع مدرسة خارج نطاق المدارس المصرح بها' };
    }
  }

  recordSecurityAuditEvent({
    requestId: `REQ_${Date.now()}`,
    actorUserId: session.userId || 'UNKNOWN_ACTOR',
    actorRole: session.role || 'UNKNOWN_ROLE',
    actorSchoolId: session.schoolId || 'GLOBAL',
    targetSchoolId: target.schoolId || 'GLOBAL',
    action: 'USER_SESSIONS_REVOKED',
    resourceId: target.id,
    reason: 'إلغاء جميع جلسات المستخدم',
  });

  return { success: true, message: 'تم إلغاء جميع جلسات العمل النشطة للمستخدم بنجاح' };
}

/**
 * Phase 3C-A12: Authoritative System Admin School Switching (Backend Engine Emulation)
 */
export function switchActiveSchoolBackend(
  session: ServerSession,
  targetSchoolId: string,
  requestId?: string
): {
  success: boolean;
  code?: string;
  message?: string;
  user?: Partial<User>;
  school?: School;
  updatedSession?: ServerSession;
} {
  const reqId = requestId || `REQ_SWITCH_${Date.now()}`;

  // 1. Session verification
  if (!session || !session.sessionToken) {
    return { success: false, code: 'SESSION_MISSING', message: 'رمز جلسة العمل مفقود أو غير صالح' };
  }
  if (session.expiresAt && Date.now() > new Date(session.expiresAt).getTime()) {
    return { success: false, code: 'SESSION_EXPIRED', message: 'انتهت صلاحية جلسة العمل' };
  }

  // 2. Role and Scope verification: SystemAdmin + GLOBAL only
  if (session.role !== 'SystemAdmin' || session.accessScope !== 'GLOBAL') {
    recordSecurityAuditEvent({
      requestId: reqId,
      actorUserId: session.userId,
      actorRole: String(session.role),
      actorSchoolId: session.schoolId || 'UNKNOWN',
      targetSchoolId: targetSchoolId || 'UNKNOWN',
      action: 'switchActiveSchool',
      code: 'SCHOOL_SWITCH_NOT_ALLOWED',
      reason: 'تبديل المدرسة مخصص حصرياً لمدير النظام الشامل (SystemAdmin)',
    });
    return {
      success: false,
      code: 'SCHOOL_SWITCH_NOT_ALLOWED',
      message: 'تبديل المدرسة مخصص حصرياً لمدير النظام الشامل (SystemAdmin)',
    };
  }

  const cleanTarget = String(targetSchoolId || '').trim().toUpperCase();
  if (!cleanTarget) {
    return {
      success: false,
      code: 'INVALID_SCHOOL_ID',
      message: 'يرجى تحديد معرف المدرسة المراد التبديل إليها',
    };
  }

  // 3. Allowed school scope check
  const allowedList = (session.allowedSchoolIds || []).map(id => id.trim().toUpperCase());
  if (!allowedList.includes(cleanTarget)) {
    recordSecurityAuditEvent({
      requestId: reqId,
      actorUserId: session.userId,
      actorRole: 'SystemAdmin',
      actorSchoolId: session.schoolId || 'UNKNOWN',
      targetSchoolId: cleanTarget,
      action: 'switchActiveSchool',
      code: 'ACCESS_DENIED_SCHOOL_SCOPE',
      reason: `المدرسة المطلوبة (${cleanTarget}) خارج نطاق المدارس المصرح لك بالوصول إليها`,
    });
    return {
      success: false,
      code: 'ACCESS_DENIED_SCHOOL_SCOPE',
      message: 'المدرسة المطلوبة خارج نطاق المدارس المصرح لك بالوصول إليها',
    };
  }

  // 4. Verify school exists in Master School Registry
  const targetSchoolRecord = masterSchoolRegistry.find(
    s => s.schoolId.toUpperCase() === cleanTarget || s.schoolCode.toUpperCase() === cleanTarget
  );
  if (!targetSchoolRecord) {
    recordSecurityAuditEvent({
      requestId: reqId,
      actorUserId: session.userId,
      actorRole: 'SystemAdmin',
      actorSchoolId: session.schoolId || 'UNKNOWN',
      targetSchoolId: cleanTarget,
      action: 'switchActiveSchool',
      code: 'SCHOOL_NOT_FOUND',
      reason: `المدرسة المطلوبة (${cleanTarget}) غير مسجلة في النظام`,
    });
    return {
      success: false,
      code: 'SCHOOL_NOT_FOUND',
      message: 'المدرسة المطلوبة غير مسجلة في النظام',
    };
  }

  // 5. Verify school is Active
  if (targetSchoolRecord.status !== 'Active') {
    recordSecurityAuditEvent({
      requestId: reqId,
      actorUserId: session.userId,
      actorRole: 'SystemAdmin',
      actorSchoolId: session.schoolId || 'UNKNOWN',
      targetSchoolId: cleanTarget,
      action: 'switchActiveSchool',
      code: 'SCHOOL_INACTIVE',
      reason: `المدرسة المطلوبة (${cleanTarget}) غير مفعلة حالياً`,
    });
    return {
      success: false,
      code: 'SCHOOL_INACTIVE',
      message: 'المدرسة المطلوبة غير مفعلة حالياً',
    };
  }

  // 6. Update session context
  const previousSchoolId = session.activeSchoolId || '';
  session.activeSchoolId = cleanTarget;

  // 7. Record authoritative audit event
  recordSecurityAuditEvent({
    requestId: reqId,
    actorUserId: session.userId,
    actorRole: 'SystemAdmin',
    actorSchoolId: previousSchoolId,
    targetSchoolId: cleanTarget,
    action: 'SCHOOL_CONTEXT_SWITCH',
    code: 'SUCCESS',
    reason: `تبديل سياق المدرسة بنجاح من ${previousSchoolId || 'NONE'} إلى ${cleanTarget}`,
  });

  return {
    success: true,
    user: {
      id: session.userId,
      email: session.email || '',
      fullName: session.fullName || '',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      schoolId: '',
      activeSchoolId: cleanTarget,
      allowedSchoolIds: session.allowedSchoolIds || [],
    },
    school: sanitizeSchoolDTO(targetSchoolRecord),
    updatedSession: session,
  };
}
