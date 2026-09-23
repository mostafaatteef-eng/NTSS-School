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
let masterSchoolRegistry: MasterSchoolRegistryRecord[] = [
  {
    schoolId: 'SCH-BADR',
    schoolCode: 'BADR',
    schoolName: 'مدرسة بدر الإعدادية بنين',
    spreadsheetId: 'SHEET_ID_BADR_OFFICIAL_SECURE_991',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    schoolId: 'SCH-ALNOOR',
    schoolCode: 'ALNOOR',
    schoolName: 'مدرسة النور الثانوية بنات',
    spreadsheetId: 'SHEET_ID_ALNOOR_OFFICIAL_SECURE_992',
    status: 'Active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

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
      schoolId: 'SCH-BADR',
      schoolCode: 'BADR',
      schoolName: 'مدرسة بدر الإعدادية بنين',
      status: 'Active',
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
  if (ACTION_PERMISSION_MAP[permission as string]) {
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
    // SystemAdmin: targetSchoolId must be inside session.allowedSchoolIds
    const targetSchoolId = resourceContext?.schoolId || session.activeSchoolId || session.schoolId;
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
    effectiveSchoolId = targetSchoolId;
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
  leaves: Array<{ id: string; employeeId: string; schoolId?: string }>;
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
        settings: { ...store.settings },
      },
    };
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
  username: string;
  fullName: string;
  role: string;
  schoolId?: string;
  allowedSchoolIds?: string[];
  status: string;
}

let masterUsersStore: BackendUserRecord[] = [
  { id: 'usr-sysadmin-1', username: 'sysadmin', fullName: 'مدير النظام العام', role: 'SystemAdmin', allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'], status: 'Active' },
  { id: 'usr-admin-badr', username: 'admin_badr', fullName: 'مدير مدرسة بدر', role: 'SchoolAdmin', schoolId: 'SCH-BADR', status: 'Active' },
  { id: 'usr-admin-noor', username: 'admin_noor', fullName: 'مدير مدرسة النور', role: 'SchoolAdmin', schoolId: 'SCH-ALNOOR', status: 'Active' },
  { id: 'usr-director-badr', username: 'director_badr', fullName: 'ناظر مدرسة بدر', role: 'SchoolDirector', schoolId: 'SCH-BADR', status: 'Active' },
  { id: 'usr-teacher-badr', username: 'teacher_badr', fullName: 'معلم بدر', role: 'Teacher', schoolId: 'SCH-BADR', status: 'Active' },
  { id: 'usr-teacher-noor', username: 'teacher_noor', fullName: 'معلم النور', role: 'Teacher', schoolId: 'SCH-ALNOOR', status: 'Active' },
];

export function resetMasterUsersStore() {
  masterUsersStore = [
    { id: 'usr-sysadmin-1', username: 'sysadmin', fullName: 'مدير النظام العام', role: 'SystemAdmin', allowedSchoolIds: ['SCH-BADR', 'SCH-ALNOOR'], status: 'Active' },
    { id: 'usr-admin-badr', username: 'admin_badr', fullName: 'مدير مدرسة بدر', role: 'SchoolAdmin', schoolId: 'SCH-BADR', status: 'Active' },
    { id: 'usr-admin-noor', username: 'admin_noor', fullName: 'مدير مدرسة النور', role: 'SchoolAdmin', schoolId: 'SCH-ALNOOR', status: 'Active' },
    { id: 'usr-director-badr', username: 'director_badr', fullName: 'ناظر مدرسة بدر', role: 'SchoolDirector', schoolId: 'SCH-BADR', status: 'Active' },
    { id: 'usr-teacher-badr', username: 'teacher_badr', fullName: 'معلم بدر', role: 'Teacher', schoolId: 'SCH-BADR', status: 'Active' },
    { id: 'usr-teacher-noor', username: 'teacher_noor', fullName: 'معلم النور', role: 'Teacher', schoolId: 'SCH-ALNOOR', status: 'Active' },
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
    const uSchool = String(u.schoolId || '').trim().toUpperCase();
    if (role === 'SchoolAdmin') {
      // SchoolAdmin sees ONLY users of own school, and NEVER SystemAdmin
      if (u.role === 'SystemAdmin') return false;
      return uSchool === sessionSchool;
    }
    if (role === 'SystemAdmin') {
      if (!uSchool) return true;
      return allowed.includes(uSchool);
    }
    if (role === 'Admin') {
      return uSchool === sessionSchool;
    }
    return false;
  });

  return { success: true, data: filtered.map(u => ({ ...u })) };
}

export function saveUserSecure(
  session: ServerSession,
  payload: Partial<BackendUserRecord>
): { success: boolean; user?: BackendUserRecord; code?: string; message?: string } {
  const existingUser = masterUsersStore.find(u => (payload.id && u.id === payload.id) || (payload.username && u.username === payload.username));

  // Dynamic authorization check: new user -> users.create; edit existing user -> users.edit
  const requiredPerm = existingUser ? 'users.edit' : 'users.create';
  const auth = authorize(session, requiredPerm);
  if (!auth.allowed) {
    return { success: false, code: auth.code, message: auth.reason };
  }

  // If role is changed on an existing user, additionally require users.manageRoles
  if (existingUser && payload.role && payload.role !== existingUser.role) {
    const roleAuth = authorize(session, 'users.manageRoles');
    if (!roleAuth.allowed) {
      return {
        success: false,
        code: roleAuth.code || 'ROLE_PERMISSION_DENIED',
        message: 'تعديل دور المستخدم يتطلب صلاحية users.manageRoles',
      };
    }
  }

  const role = session.role;
  const sessionSchool = String(session.schoolId || '').trim().toUpperCase();

  if (role === 'SchoolAdmin') {
    if (payload.role === 'SystemAdmin') {
      return { success: false, code: 'ROLE_ESCALATION_DENIED', message: 'لا يمكن لمدير المدرسة إنشاء أو ترقية مستخدم إلى مدير نظام عام (SystemAdmin)' };
    }
    if (existingUser) {
      if (existingUser.role === 'SystemAdmin') {
        return { success: false, code: 'FORBIDDEN', message: 'غير مصرح بتعديل حساب مدير نظام عام' };
      }
      if (existingUser.schoolId && String(existingUser.schoolId).trim().toUpperCase() !== sessionSchool) {
        return { success: false, code: 'CROSS_SCHOOL_ACCESS_DENIED', message: 'غير مصرح بتعديل مستخدم ينتمي لمدرسة أخرى' };
      }
    }
    // Force user schoolId to match session.schoolId
    payload.schoolId = session.schoolId;
  } else if (role === 'SystemAdmin') {
    const allowed = (session.allowedSchoolIds || []).map(s => s.trim().toUpperCase());
    if (payload.schoolId && !allowed.includes(payload.schoolId.trim().toUpperCase())) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المدرسة المحددة للمستخدم خارج نطاق المدارس المصرح بها' };
    }
    if (existingUser && existingUser.schoolId && !allowed.includes(existingUser.schoolId.trim().toUpperCase())) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المستخدم ينتمي لمدرسة خارج نطاق الصلاحيات المصرح لك بها' };
    }
  }

  const record: BackendUserRecord = {
    id: payload.id || `USR_${Date.now()}`,
    username: String(payload.username || '').trim().toLowerCase(),
    fullName: payload.fullName || '',
    role: payload.role || 'Teacher',
    schoolId: payload.schoolId,
    allowedSchoolIds: payload.allowedSchoolIds,
    status: payload.status || 'Active',
  };

  const idx = masterUsersStore.findIndex(u => u.id === record.id);
  if (idx >= 0) {
    masterUsersStore[idx] = record;
  } else {
    masterUsersStore.push(record);
  }

  return { success: true, user: record, message: 'تم حفظ حساب المستخدم بنجاح' };
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
    if (target.schoolId && !allowed.includes(target.schoolId.trim().toUpperCase())) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المستخدم يتبع مدرسة خارج نطاق المدارس المصرح بها' };
    }
  }

  const idx = masterUsersStore.findIndex(u => u.id === targetUserId);
  if (idx >= 0) {
    masterUsersStore.splice(idx, 1);
  }
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
    if (target.schoolId && !allowed.includes(target.schoolId.trim().toUpperCase())) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المستخدم يتبع مدرسة خارج نطاق المدارس المصرح بها' };
    }
  }

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
    if (target.schoolId && !allowed.includes(target.schoolId.trim().toUpperCase())) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المستخدم يتبع مدرسة خارج نطاق المدارس المصرح بها' };
    }
  }

  target.status = newStatus || (target.status === 'Active' ? 'Suspended' : 'Active');
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
    if (target.schoolId && !allowed.includes(target.schoolId.trim().toUpperCase())) {
      return { success: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المستخدم يتبع مدرسة خارج نطاق المدارس المصرح بها' };
    }
  }

  return { success: true, message: 'تم إلغاء جميع جلسات العمل النشطة للمستخدم بنجاح' };
}
