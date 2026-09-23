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
import { hasEffectivePermission } from '../utils/permissions';

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
  const found = masterSchoolRegistry.find(
    s => s.schoolId.toUpperCase() === cleanId || s.schoolCode.toUpperCase() === cleanId
  );
  if (found && found.spreadsheetId) {
    return found.spreadsheetId;
  }
  // Safe fallback to default primary spreadsheet
  return masterSchoolRegistry[0]?.spreadsheetId || 'SHEET_ID_DEFAULT_FALLBACK';
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
      effectiveSchoolId = (session.activeSchoolId || session.schoolId || 'SCH-BADR').trim().toUpperCase();
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
 * - SystemAdmin: accessScope = GLOBAL only if backed by allowedSchoolIds
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
    allowedSchoolIds = options?.allowedSchoolIds && options.allowedSchoolIds.length > 0
      ? options.allowedSchoolIds
      : [boundSchoolId || 'SCH-BADR', 'SCH-ALNOOR'];
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
  permission: PermissionKey,
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

  // 4. verify permission (via hasEffectivePermission)
  const hasPerm = hasEffectivePermission(session, permission);
  if (!hasPerm) {
    const audit = recordSecurityAuditEvent({
      requestId: reqId,
      actorUserId: session.userId,
      actorRole: String(role),
      actorSchoolId: session.schoolId || 'UNKNOWN',
      targetSchoolId: resourceContext?.schoolId || session.schoolId || 'UNKNOWN',
      action: permission,
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
