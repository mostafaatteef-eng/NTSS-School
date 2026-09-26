/**
 * ==============================================================================
 * NTSS SCHOOL ERP & TIMETABLE SYSTEM - AUTHORITATIVE GOOGLE APPS SCRIPT BACKEND
 * ==============================================================================
 * Version: 5.2.0-AUTH-MULTISCHOOL
 * Runtime: V8 (Google Apps Script)
 * Authoritative Storage: Google Sheets Spreadsheet
 *
 * SCOPE:
 * 1. Administrative School ERP:
 *    - Master Data (Students, Employees, Academic Years, Classrooms)
 *    - Daily Student Attendance (School-day level only)
 *    - Employee Attendance, Leaves, Permissions
 *    - Student Behavior & Discipline
 *    - Settings, Roles, Users, Audit Logs
 * 2. School Timetable & Teacher Operations (Fully Active):
 *    - Timetable Structure & Schedule Breaks
 *    - Teacher Availability
 *    - Teacher Teaching Assignments
 *    - Weekly Timetable (Draft -> UnderReview -> Approved -> Published)
 *    - Reserve Engine & Teacher Load Tracking (30 Periods / 1500 Mins Cap)
 *    - Supervision Schedule
 *    - Timetable Import & Curriculum Coverage
 *    - Exam Schedules
 * 3. Limited Teacher Portal (Authenticated via TeacherSession):
 *    - Teacher's weekly timetable & today's schedule
 *    - Classroom homework & resources (Assignment-scoped draft creation)
 *    - Exam supervision duties & reserve substitutions
 *    - Leaves & Permissions Self-Portal (Strictly employeeId scoped)
 * 4. Read-Only Public Student Timetable Portal:
 *    - Server-hashed token-based access
 *    - Sanitized Safe Student DTO
 *    - Published schedule, homework, resources, and exams ONLY
 *
 * RETIRED MODULES (Permanently Rejected):
 * - Parent Portal / Parent Accounts
 * - Payroll & Salary Calculations
 * - SAMAT Competency Tracking
 * - Class-Period Attendance
 * ==============================================================================
 */

var CANONICAL_BACKEND_SOURCE = 'google-apps-script/Code.gs';
var CANONICAL_BACKEND_VERSION = '5.2.0-AUTH-MULTISCHOOL';
var PBKDF2_ITERATIONS = 10000;
var SESSION_DURATION_HOURS = 24;
var TEACHER_SESSION_DURATION_HOURS = 24;

// Active and Canonical Sheets
var SHEETS = {
  // Core ERP Sheets
  USERS: 'Users',
  SESSIONS: 'Sessions',
  EMPLOYEES: 'Employees',
  ATTENDANCE: 'Attendance',
  LEAVES: 'Leaves',
  PERMISSIONS: 'Permissions',
  SETTINGS: 'Settings',
  AUDIT_LOGS: 'Audit_Logs',
  STUDENTS: 'Students',
  STUDENT_ATTENDANCE: 'Student_Attendance',
  BEHAVIOR_VIOLATIONS: 'Behavior_Violations',
  BEHAVIOR_CASES: 'Behavior_Cases',
  POSITIVE_BEHAVIOR_TYPES: 'Positive_Behavior_Types',
  ACADEMIC_YEARS: 'Academic_Years',
  STUDENT_ENROLLMENTS: 'Student_Enrollments',
  PARENT_COMMUNICATIONS: 'Parent_Communications',
  LOCATIONS: 'Locations',
  ARCHIVE_METRICS: 'Archive_Metrics',

  // Timetable, Reserve, Supervision, Exams, and Portal Sheets
  TEACHER_TEACHING_ASSIGNMENTS: 'Teacher_Teaching_Assignments',
  SCHEDULE: 'Schedule',
  SCHEDULE_BREAKS: 'Schedule_Breaks',
  TEACHER_AVAILABILITY: 'Teacher_Availability',
  RESERVE_ASSIGNMENTS: 'Reserve_Assignments',
  SUPERVISION_LOCATIONS: 'Supervision_Locations',
  SUPERVISION_ASSIGNMENTS: 'Supervision_Assignments',
  HOMEWORK: 'Homework',
  TEACHER_RESOURCES: 'Teacher_Resources',
  EXAM_SCHEDULES: 'Exam_Schedules',
  STUDENT_ACCESS_TOKENS: 'Student_Access_Tokens',
  TEACHER_SESSIONS: 'Teacher_Sessions',
  TEACHER_CREDENTIALS: 'Teacher_Credentials',
  MASTER_SCHOOLS: 'Master_Schools'
};

// Retired Modules List (Strictly forbidden from execution)
var RETIRED_ACTIONS = [
  'saveClassAttendance',
  'bulkSaveClassAttendance',
  'getClassAttendance',
  'savePayroll',
  'bulkSavePayroll',
  'deletePayroll',
  'generatePayroll',
  'getPayroll',
  'saveSamat',
  'getSamat',
  'saveParentPortal',
  'getParentPortal',
  'saveParentDay',
  'getParentDay'
];

/**
 * HTTP GET - Restricted exclusively to Health Check & System Status
 * Any attempts to query data via GET are forbidden to prevent credential exposure in URLs.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = params.action || '';

  if (action === 'health' || action === 'ping' || !action) {
    return createJsonResponse({
      status: 'success',
      serviceAvailable: true,
      canonicalSource: CANONICAL_BACKEND_SOURCE,
      version: CANONICAL_BACKEND_VERSION,
      systemMode: 'PRODUCTION_RBAC',
      timestamp: new Date().toISOString(),
      serverTime: getCairoISOString()
    }, 200);
  }

  // Public Active Schools Registry (No spreadsheetId returned)
  if (action === 'publicSchools' || action === 'getPublicSchools' || action === 'getSchools') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureProductionStaffSheetsExist(ss);
    var schools = getPublicActiveSchools(ss);
    return createJsonResponse({
      status: 'success',
      schools: schools
    }, 200);
  }

  // Reject all other GET requests (including legacy getAll)
  return createJsonResponse({
    status: 'error',
    code: 'GET_DATA_ACCESS_FORBIDDEN',
    message: 'قراءة البيانات وقواعد الجداول عبر طلبات GET غير مسموحة أمنياً. استخدم مسارات POST المعتمدة مع رمز الجلسة (sessionToken).',
    action: action
  }, 403);
}

/**
 * HTTP POST - Central Authoritative Gateway
 */
function doPost(e) {
  var requestId = 'REQ_' + Utilities.getUuid().substring(0, 8);
  var output = {
    status: 'success',
    requestId: requestId,
    version: CANONICAL_BACKEND_VERSION,
    timestamp: new Date().toISOString()
  };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureProductionStaffSheetsExist(ss);

    // Parse Request Body
    var postData = {};
    if (e && e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return createJsonResponse({
          status: 'error',
          code: 'INVALID_JSON_PAYLOAD',
          message: 'فشل تحليل محتوى الطلب (JSON غير صالح)',
          requestId: requestId
        }, 400);
      }
    }

    var action = postData.action || '';
    var payload = postData.data;

    // -------------------------------------------------------------
    // 1. PUBLIC ACTIONS (No authentication required)
    // -------------------------------------------------------------
    if (action === 'ping' || action === 'health') {
      output.status = 'success';
      output.serviceAvailable = true;
      output.canonicalSource = CANONICAL_BACKEND_SOURCE;
      output.version = CANONICAL_BACKEND_VERSION;
      output.systemMode = 'PRODUCTION_RBAC';
      output.timestamp = new Date().toISOString();
      output.message = 'Backend is active, authoritative, and secure';
      return createJsonResponse(output, 200);
    }

    // Public Active Schools Registry (No spreadsheetId returned)
    if (action === 'publicSchools' || action === 'getPublicSchools' || action === 'getSchools') {
      ensureProductionStaffSheetsExist(ss);
      output.schools = getPublicActiveSchools(ss);
      output.status = 'success';
      return createJsonResponse(output, 200);
    }

    // Staff Login (Email + Password) - Authoritative Server-Derived Context
    if (action === 'login') {
      var rawEmail = (postData && (postData.email !== undefined ? postData.email : (payload && payload.email))) || '';
      var password = String((postData && postData.password) || (payload && payload.password) || '').trim();

      // Prohibit username-only login (strictly no username fallback)
      var normalizedEmail = normalizeEmail(rawEmail);
      if (!normalizedEmail || !isValidEmailFormat(normalizedEmail)) {
        recordAuthoritativeAudit(ss, requestId, normalizedEmail || 'UNKNOWN', '', 'LOGIN_FAILED', 'AUTH', '', 'فشل تسجيل الدخول: بريد إلكتروني غير صالح');
        return createJsonResponse({
          status: 'error',
          code: 'INVALID_EMAIL',
          message: 'يرجى إدخال بريد إلكتروني صالح لتسجيل الدخول',
          requestId: requestId
        }, 400);
      }

      if (!password) {
        recordAuthoritativeAudit(ss, requestId, normalizedEmail, '', 'LOGIN_FAILED', 'AUTH', '', 'فشل تسجيل الدخول: كلمة المرور مطلوبة');
        return createJsonResponse({
          status: 'error',
          code: 'CREDENTIALS_REQUIRED',
          message: 'يرجى إدخال كلمة المرور',
          requestId: requestId
        }, 400);
      }

      // Ignore client schoolId: Server derives school context authoritatively from Master USERS
      var authResult = handleStaffLogin(ss, normalizedEmail, password, requestId);
      if (!authResult.success) {
        var statusCode = 401;
        if (
          authResult.code === 'DUPLICATE_ACCOUNT_EMAIL' ||
          authResult.code === 'SCHOOL_CONTEXT_REQUIRED' ||
          authResult.code === 'SELF_IDENTITY_REQUIRED' ||
          authResult.code === 'NEEDS_ADMIN_REVIEW' ||
          authResult.code === 'ACCOUNT_EMAIL_SETUP_REQUIRED' ||
          authResult.code === 'ACCOUNT_ROLE_NOT_ALLOWED'
        ) {
          statusCode = 403;
        }
        return createJsonResponse({
          status: 'error',
          code: authResult.code || 'AUTH_FAILED',
          message: authResult.message,
          requestId: requestId
        }, statusCode);
      }

      output.status = 'success';
      output.message = 'تم تسجيل الدخول وإنشاء جلسة عمل معتمدة بنجاح';
      output.sessionToken = authResult.sessionToken;
      output.expiresAt = authResult.expiresAt;
      output.user = authResult.user;
      return createJsonResponse(output, 200);
    }

    // Teacher Login (School + Username/TeacherCode + Password -> Opaque TeacherSessionToken)
    if (action === 'teacherLogin') {
      var teacherSchoolId = String(postData.schoolId || (payload && payload.schoolId) || '').trim();
      var tUserOrCode = String(postData.username || postData.teacherCode || (payload && (payload.username || payload.teacherCode)) || '').trim();
      var tPass = String(postData.password || (payload && payload.password) || '').trim();

      if (!teacherSchoolId) {
        return createJsonResponse({
          status: 'error',
          code: 'SCHOOL_CONTEXT_REQUIRED',
          message: 'يرجى تحديد كود المدرسة لتسجيل دخول المعلم',
          requestId: requestId
        }, 400);
      }

      var teacherAuth = handleTeacherLogin(ss, tUserOrCode, tPass, requestId, teacherSchoolId);
      if (!teacherAuth.success) {
        return createJsonResponse({
          status: 'error',
          code: teacherAuth.code || 'TEACHER_AUTH_FAILED',
          message: teacherAuth.message,
          requestId: requestId
        }, 401);
      }

      output.message = 'تم تسجيل دخول المعلم بنجاح';
      output.teacherSessionToken = teacherAuth.teacherSessionToken;
      output.expiresAt = teacherAuth.expiresAt;
      output.schoolId = teacherAuth.schoolId;
      output.teacher = teacherAuth.teacher;
      output.mustChangePassword = teacherAuth.mustChangePassword === true;
      return createJsonResponse(output, 200);
    }

    if (action === 'changeTeacherPassword') {
      var tSessionToken = String(postData.teacherSessionToken || (payload && payload.teacherSessionToken) || '').trim();
      var tNewPassword = String(postData.newPassword || (payload && payload.newPassword) || '').trim();

      var changeRes = changeTeacherPassword(ss, tSessionToken, tNewPassword, requestId);
      if (!changeRes.success) {
        return createJsonResponse({
          status: 'error',
          code: changeRes.code || 'CHANGE_PASSWORD_FAILED',
          message: changeRes.message,
          requestId: requestId
        }, 400);
      }

      output.message = changeRes.message;
      output.teacherSessionToken = changeRes.teacherSessionToken;
      output.expiresAt = changeRes.expiresAt;
      return createJsonResponse(output, 200);
    }

    // Public Student Portal Data Access (Token-Based Read-Only Access)
    if (action === 'getStudentPublicPortalData') {
      var rawStudentToken = String(postData.token || (payload && payload.token) || '').trim();
      var studentPortalResult = handleStudentPublicPortalAccess(ss, rawStudentToken, requestId);
      if (!studentPortalResult.success) {
        return createJsonResponse({
          status: 'error',
          code: studentPortalResult.code || 'INVALID_STUDENT_TOKEN',
          message: studentPortalResult.message,
          requestId: requestId
        }, 401);
      }

      output.student = studentPortalResult.student;
      output.schedule = studentPortalResult.schedule;
      output.homework = studentPortalResult.homework;
      output.exams = studentPortalResult.exams;
      output.resources = studentPortalResult.resources;
      return createJsonResponse(output, 200);
    }


    // Public Student Class Schedule (School-Scoped, NO login, NO token, strictly published lessons only)
    if (action === 'getPublicClassSchedule') {
      var targetSchoolIdForSchedule = String(postData.schoolId || (payload && payload.schoolId) || '').trim();
      if (!targetSchoolIdForSchedule) {
        return createJsonResponse({
          status: 'error',
          code: 'SCHOOL_CONTEXT_REQUIRED',
          message: 'يرجى تحديد كود المدرسة لعرض الجدول المدرسي',
          requestId: requestId
        }, 400);
      }
      var scheduleSchoolSs = getSchoolSpreadsheet(targetSchoolIdForSchedule, ss);
      var gradeParam = String(postData.gradeId || postData.grade || postData.gradeName || (payload && (payload.gradeId || payload.grade || payload.gradeName)) || '').trim();
      var classroomParam = String(postData.classroomId || postData.classroom || postData.classroomName || (payload && (payload.classroomId || payload.classroom || payload.classroomName)) || '').trim();
      
      var publicScheduleRes = getPublicClassSchedule(scheduleSchoolSs, gradeParam, classroomParam);
      if (!publicScheduleRes.success) {
        return createJsonResponse({
          status: 'error',
          code: publicScheduleRes.code || 'PUBLIC_SCHEDULE_ERROR',
          message: publicScheduleRes.message,
          requestId: requestId
        }, 400);
      }

      output.gradeName = publicScheduleRes.gradeName;
      output.classroomName = publicScheduleRes.classroomName;
      output.schedule = publicScheduleRes.schedule;
      output.schoolId = targetSchoolIdForSchedule;
      return createJsonResponse(output, 200);
    }

    // First Login Password Setup & Activation Tokens (Permanently Decommissioned via MIG_SCOPE_015)
    if (action === 'firstLoginPasswordSetup' || action === 'issueUserActivationToken') {
      return createJsonResponse({
        status: 'error',
        code: 'FIRST_LOGIN_DECOMMISSIONED',
        message: 'تم إلغاء نظام أول دخول وأكواد التفعيل نهائياً. يتم إنشاء وتعيين كلمات المرور مباشرة عبر إدارة النظام.',
        requestId: requestId
      }, 410);
    }

    // Bootstrap First Admin (Permanently Retired - Public Route Forbidden)
    if (action === 'bootstrapFirstAdmin') {
      return createJsonResponse({
        status: 'error',
        code: 'BOOTSTRAP_PUBLIC_ROUTE_RETIRED',
        message: 'تم إيقاف مسار التهيئة العامة للمسؤول الأول أمنياً. يتم تهيئة الحسابات الإدارية عبر القنوات الخادمة الموثوقة فقط.',
        requestId: requestId
      }, 410);
    }

    // -------------------------------------------------------------
    // 2. RETIRED MODULE CHECK
    // -------------------------------------------------------------
    if (RETIRED_ACTIONS.indexOf(action) !== -1) {
      return createJsonResponse({
        status: 'error',
        code: 'MODULE_RETIRED',
        message: 'تم إلغاء هذه الوحدة (مسير الرواتب / حضور الحصص / بوابة أولياء الأمور / كفايات SAMAT) نهائياً من النظام التشغيلي.',
        requestId: requestId
      }, 410);
    }

    // -------------------------------------------------------------
    // 3. TEACHER SESSION GATE (For Teacher-Specific Actions)
    // -------------------------------------------------------------
    var incomingTeacherToken = postData.teacherSessionToken || (payload && payload.teacherSessionToken) || '';
    if (
      action === 'teacherLogout' ||
      action === 'getTeacherPortalData' ||
      action === 'saveTeacherHomeworkDraft' ||
      action === 'saveTeacherResourceDraft' ||
      action === 'getTeacherSelfRequests' ||
      action === 'createTeacherLeaveRequest' ||
      action === 'createTeacherPermissionRequest'
    ) {
      if (!incomingTeacherToken) {
        return createJsonResponse({
          status: 'error',
          code: 'TEACHER_SESSION_REQUIRED',
          message: 'مطلوب رمز جلسة معلم نشط ومعتمد لتنفيذ هذا الإجراء',
          requestId: requestId
        }, 401);
      }

      var teacherSessionAuth = validateTeacherSessionToken(ss, incomingTeacherToken);
      if (!teacherSessionAuth.valid) {
        return createJsonResponse({
          status: 'error',
          code: teacherSessionAuth.code || 'TEACHER_SESSION_INVALID',
          message: teacherSessionAuth.message,
          requestId: requestId
        }, 401);
      }

      var tSession = teacherSessionAuth.session;

      if (!tSession.schoolId || String(tSession.schoolId).trim() === '') {
        return createJsonResponse({
          status: 'error',
          code: 'SCHOOL_CONTEXT_REQUIRED',
          message: 'جلسة المعلم غير مرتبطة بمدرسة محددة (FAIL CLOSED)',
          requestId: requestId
        }, 403);
      }

      var teacherSchoolSs = getSchoolSpreadsheet(tSession.schoolId, ss);
      if (!teacherSchoolSs) {
        return createJsonResponse({
          status: 'error',
          code: 'SCHOOL_NOT_FOUND',
          message: 'قاعدة بيانات مدرسة المعلم غير متوفرة',
          requestId: requestId
        }, 404);
      }

      if (action === 'teacherLogout') {
        revokeTeacherSessionToken(ss, incomingTeacherToken);
        if (teacherSchoolSs.getId() !== ss.getId()) {
          revokeTeacherSessionToken(teacherSchoolSs, incomingTeacherToken);
        }
        output.message = 'تم تسجيل خروج المعلم بنجاح';
        return createJsonResponse(output, 200);
      }

      if (action === 'getTeacherPortalData') {
        output.data = getTeacherPortalDataBundle(teacherSchoolSs, tSession);
        return createJsonResponse(output, 200);
      }

      if (action === 'saveTeacherHomeworkDraft') {
        var hwResult = saveTeacherHomeworkDraft(teacherSchoolSs, tSession, payload, requestId);
        if (!hwResult.success) {
          return createJsonResponse({
            status: 'error',
            code: hwResult.code || 'HOMEWORK_SAVE_FAILED',
            message: hwResult.message,
            requestId: requestId
          }, 403);
        }
        output.message = hwResult.message;
        output.homework = hwResult.homework;
        return createJsonResponse(output, 200);
      }

      if (action === 'saveTeacherResourceDraft') {
        var resResult = saveTeacherResourceDraft(teacherSchoolSs, tSession, payload, requestId);
        if (!resResult.success) {
          return createJsonResponse({
            status: 'error',
            code: resResult.code || 'RESOURCE_SAVE_FAILED',
            message: resResult.message,
            requestId: requestId
          }, 403);
        }
        output.message = resResult.message;
        output.resource = resResult.resource;
        return createJsonResponse(output, 200);
      }

      if (action === 'getTeacherSelfRequests') {
        var selfRequestsResult = getTeacherSelfRequestsBundle(teacherSchoolSs, tSession);
        if (!selfRequestsResult.success) {
          return createJsonResponse({
            status: 'error',
            code: selfRequestsResult.code || 'SELF_REQUESTS_READ_FAILED',
            message: selfRequestsResult.message,
            requestId: requestId
          }, 400);
        }
        output.data = {
          profile: selfRequestsResult.profile,
          leaves: selfRequestsResult.leaves,
          permissions: selfRequestsResult.permissions
        };
        return createJsonResponse(output, 200);
      }

      if (action === 'createTeacherLeaveRequest') {
        var teacherLeaveResult = createTeacherLeaveRequest(teacherSchoolSs, tSession, payload, requestId);
        if (!teacherLeaveResult.success) {
          return createJsonResponse({
            status: 'error',
            code: teacherLeaveResult.code || 'LEAVE_REQUEST_FAILED',
            message: teacherLeaveResult.message,
            requestId: requestId
          }, 400);
        }
        output.message = teacherLeaveResult.message;
        output.leave = teacherLeaveResult.leave;
        return createJsonResponse(output, 200);
      }

      if (action === 'createTeacherPermissionRequest') {
        var teacherPermissionResult = createTeacherPermissionRequest(teacherSchoolSs, tSession, payload, requestId);
        if (!teacherPermissionResult.success) {
          return createJsonResponse({
            status: 'error',
            code: teacherPermissionResult.code || 'PERMISSION_REQUEST_FAILED',
            message: teacherPermissionResult.message,
            requestId: requestId
          }, 400);
        }
        output.message = teacherPermissionResult.message;
        output.permission = teacherPermissionResult.permission;
        return createJsonResponse(output, 200);
      }
    }

    // -------------------------------------------------------------
    // 4. STAFF SESSION AUTHENTICATION GATE (For all Staff Actions)
    // -------------------------------------------------------------
    var incomingStaffToken = postData.sessionToken || (payload && payload.sessionToken) || '';
    if (!incomingStaffToken) {
      return createJsonResponse({
        status: 'error',
        code: 'AUTH_REQUIRED',
        message: 'مطلوب رمز جلسة عمل نشط ومعتمد (sessionToken) لتنفيذ هذا الإجراء',
        requestId: requestId
      }, 401);
    }

    var sessionAuth = validateSessionToken(ss, incomingStaffToken);
    if (!sessionAuth.valid) {
      return createJsonResponse({
        status: 'error',
        code: sessionAuth.code || 'AUTH_REQUIRED',
        message: sessionAuth.message,
        requestId: requestId
      }, 401);
    }

    var activeSession = sessionAuth.session;
    activeSession.sessionToken = incomingStaffToken; // Wire sessionToken in-memory for authorization pipeline
    var authenticatedUserId = activeSession.userId;
    var authenticatedRole = activeSession.role;
    var authenticatedUsername = activeSession.username;
    var sessionSchoolId = activeSession.schoolId || '';

    // -------------------------------------------------------------
    // 4A. SESSION LIFECYCLE (Before School Authorization)
    // -------------------------------------------------------------
    if (action === 'logout') {
      revokeSessionToken(ss, incomingStaffToken);
      output.message = 'تم إنهاء جلسة العمل وإلغاؤها بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'validateSession') {
      output.valid = true;
      output.user = {
        id: authenticatedUserId,
        email: activeSession.email || '',
        fullName: activeSession.fullName || '',
        role: authenticatedRole,
        accessScope: activeSession.accessScope,
        schoolId: activeSession.schoolId || '',
        activeSchoolId: activeSession.activeSchoolId || '',
        allowedSchoolIds: activeSession.allowedSchoolIds || [],
        employeeId: activeSession.employeeId || ''
      };
      output.expiresAt = activeSession.expiresAt;
      return createJsonResponse(output, 200);
    }

    if (action === 'switchActiveSchool') {
      // 1. Permission Check: SystemAdmin with GLOBAL scope ONLY
      if (authenticatedRole !== 'SystemAdmin' || activeSession.accessScope !== 'GLOBAL') {
        recordAuthoritativeAudit(ss, requestId, activeSession.email || activeSession.username || authenticatedUserId, authenticatedRole, 'ACCESS_DENIED', 'AUTH', authenticatedUserId, 'محاولة تبديل مدرسة غير مصرح بها للدور: ' + authenticatedRole);
        return createJsonResponse({
          status: 'error',
          code: 'SCHOOL_SWITCH_NOT_ALLOWED',
          message: 'تبديل المدرسة مخصص حصرياً لمدير النظام الشامل (SystemAdmin).',
          requestId: requestId
        }, 403);
      }

      // 2. Extract targetSchoolId
      var targetSchoolId = (payload && (payload.targetSchoolId || (payload.data && payload.data.targetSchoolId))) ||
                           (postData.data && postData.data.targetSchoolId) ||
                           postData.targetSchoolId ||
                           (payload && payload.schoolId);
      targetSchoolId = String(targetSchoolId || '').trim().toUpperCase();

      if (!targetSchoolId) {
        return createJsonResponse({
          status: 'error',
          code: 'INVALID_SCHOOL_ID',
          message: 'يرجى تحديد معرف المدرسة المراد التبديل إليها.',
          requestId: requestId
        }, 400);
      }

      // 3. Verify against allowedSchoolIds
      var allowedList = (activeSession.allowedSchoolIds || []).map(function(id) {
        return String(id).trim().toUpperCase();
      });
      if (allowedList.indexOf(targetSchoolId) === -1) {
        recordAuthoritativeAudit(ss, requestId, activeSession.email || activeSession.username || authenticatedUserId, authenticatedRole, 'ACCESS_DENIED', 'AUTH', authenticatedUserId, 'المدرسة خارج نطاق الصلاحيات: ' + targetSchoolId);
        return createJsonResponse({
          status: 'error',
          code: 'ACCESS_DENIED_SCHOOL_SCOPE',
          message: 'المدرسة المطلوبة خارج نطاق المدارس المصرح لك بالوصول إليها',
          requestId: requestId
        }, 403);
      }

      // 4. Verify school exists in Master_Schools registry
      var masterSchools = getSheetData(ss, SHEETS.MASTER_SCHOOLS);
      var targetSchoolObj = null;
      for (var sIdx = 0; sIdx < masterSchools.length; sIdx++) {
        if (String(masterSchools[sIdx].schoolId || '').trim().toUpperCase() === targetSchoolId) {
          targetSchoolObj = masterSchools[sIdx];
          break;
        }
      }

      if (!targetSchoolObj) {
        recordAuthoritativeAudit(ss, requestId, activeSession.email || activeSession.username || authenticatedUserId, authenticatedRole, 'SCHOOL_NOT_FOUND', 'AUTH', authenticatedUserId, 'مدرسة غير موجودة في السجل: ' + targetSchoolId);
        return createJsonResponse({
          status: 'error',
          code: 'SCHOOL_NOT_FOUND',
          message: 'المدرسة المطلوبة غير موجودة في سجل المدارس المعتمد',
          requestId: requestId
        }, 404);
      }

      // 5. Verify school status is Active
      if (String(targetSchoolObj.status || '').trim().toLowerCase() !== 'active') {
        recordAuthoritativeAudit(ss, requestId, activeSession.email || activeSession.username || authenticatedUserId, authenticatedRole, 'SCHOOL_INACTIVE', 'AUTH', authenticatedUserId, 'محاولة تبديل لمدرسة غير مفعلة: ' + targetSchoolId);
        return createJsonResponse({
          status: 'error',
          code: 'SCHOOL_INACTIVE',
          message: 'المدرسة المطلوبة غير مفعلة حالياً في النظام',
          requestId: requestId
        }, 400);
      }

      // 6. Update current server session row in Sessions sheet
      var previousSchoolId = activeSession.activeSchoolId || '';
      var tokenHash = hashStringSHA256(incomingStaffToken);
      var sessionsSheet = ss.getSheetByName(SHEETS.SESSIONS);
      if (sessionsSheet) {
        var sData = sessionsSheet.getDataRange().getValues();
        if (sData.length > 1) {
          var sHeaders = sData[0];
          var tokenHashCol = sHeaders.indexOf('tokenHash');
          var activeSchoolCol = sHeaders.indexOf('activeSchoolId');
          if (tokenHashCol >= 0 && activeSchoolCol >= 0) {
            for (var r = 1; r < sData.length; r++) {
              if (sData[r][tokenHashCol] === tokenHash) {
                sessionsSheet.getRange(r + 1, activeSchoolCol + 1).setValue(targetSchoolId);
                break;
              }
            }
          }
        }
      }

      // Update in-memory active session
      activeSession.activeSchoolId = targetSchoolId;

      // 7. Authoritative Audit Log
      recordAuthoritativeAudit(
        ss,
        requestId,
        activeSession.email || activeSession.username || authenticatedUserId,
        authenticatedRole,
        'SCHOOL_CONTEXT_SWITCH',
        'SESSION',
        authenticatedUserId,
        JSON.stringify({
          requestId: requestId,
          actorUserId: authenticatedUserId,
          actorEmail: activeSession.email || '',
          actorRole: authenticatedRole,
          previousSchoolId: previousSchoolId,
          targetSchoolId: targetSchoolId,
          timestamp: getCairoISOString()
        })
      );

      // 8. Safe Response (no spreadsheetId, no passwords, no tokens)
      output.status = 'success';
      output.user = {
        id: authenticatedUserId,
        email: activeSession.email || '',
        fullName: activeSession.fullName || '',
        role: authenticatedRole,
        accessScope: activeSession.accessScope,
        schoolId: '',
        activeSchoolId: targetSchoolId,
        allowedSchoolIds: activeSession.allowedSchoolIds || []
      };
      output.school = {
        schoolId: targetSchoolObj.schoolId,
        schoolCode: targetSchoolObj.schoolCode,
        schoolName: targetSchoolObj.schoolName,
        status: targetSchoolObj.status || 'Active'
      };

      return createJsonResponse(output, 200);
    }

    // School Management for SystemAdmin (Master Spreadsheet only)
    if (action === 'adminGetSchools' || action === 'adminCreateSchool' || action === 'adminUpdateSchool' || action === 'adminGetSystemOverview') {
      var schoolAdminAuth = authorize(activeSession, action, null, ss, requestId);
      if (!schoolAdminAuth.allowed || authenticatedRole !== 'SystemAdmin') {
        return createJsonResponse({
          status: 'error',
          code: authenticatedRole !== 'SystemAdmin' ? 'FORBIDDEN_SYSTEM_ADMIN_ONLY' : (schoolAdminAuth.code || 'FORBIDDEN_SYSTEM_ADMIN_ONLY'),
          message: 'صلاحية مرفوضة: هذا الإجراء مخصص حصرياً لمدير النظام الشامل (SystemAdmin).',
          requestId: requestId
        }, 403);
      }

      if (action === 'adminGetSystemOverview') {
        var allMasterSchools = getSheetData(ss, SHEETS.MASTER_SCHOOLS);
        var allowedIds = Array.isArray(activeSession.allowedSchoolIds)
          ? activeSession.allowedSchoolIds.map(function(id) { return String(id || '').trim().toUpperCase(); })
          : [];

        var summary = {
          studentsTotal: 0,
          employeesTotal: 0,
          schoolsIncluded: 0,
          schoolsUnavailable: 0
        };

        var schoolOverviewList = [];

        for (var scIdx = 0; scIdx < allMasterSchools.length; scIdx++) {
          var sc = allMasterSchools[scIdx];
          var sId = String(sc.schoolId || '').trim().toUpperCase();
          var sCode = String(sc.schoolCode || '').trim().toUpperCase();
          var sName = String(sc.schoolName || '').trim();
          var sStatus = String(sc.status || '').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
          var boundSpreadsheetId = String(sc.spreadsheetId || '').trim();

          var item = {
            schoolId: sId,
            schoolCode: sCode,
            schoolName: sName,
            status: sStatus,
            dataStatus: 'UNAVAILABLE',
            studentsCount: null,
            employeesCount: null
          };

          // 1. Inactive school
          if (sStatus === 'Inactive') {
            item.dataStatus = 'INACTIVE';
            schoolOverviewList.push(item);
            continue;
          }

          // 2. School outside allowedSchoolIds
          if (allowedIds.indexOf(sId) === -1) {
            item.dataStatus = 'NOT_ALLOWED';
            schoolOverviewList.push(item);
            continue;
          }

          // 3. Unbound school
          if (!boundSpreadsheetId) {
            item.dataStatus = 'UNBOUND';
            schoolOverviewList.push(item);
            continue;
          }

          // 4. Try opening spreadsheet
          var targetSs = null;
          try {
            targetSs = getSchoolSpreadsheet(sId, ss);
          } catch (e) {
            targetSs = null;
          }

          if (!targetSs) {
            item.dataStatus = 'UNAVAILABLE';
            summary.schoolsUnavailable++;
            schoolOverviewList.push(item);
            continue;
          }

          // 5. Read and count real structured records (ignore blank rows)
          try {
            var rawStudents = getSheetData(targetSs, SHEETS.STUDENTS);
            var validStdCount = 0;
            for (var stI = 0; stI < rawStudents.length; stI++) {
              var rowStd = rawStudents[stI];
              if (rowStd && String(rowStd.id || '').trim() !== '') {
                validStdCount++;
              }
            }

            var rawEmployees = getSheetData(targetSs, SHEETS.EMPLOYEES);
            var validEmpCount = 0;
            for (var emI = 0; emI < rawEmployees.length; emI++) {
              var rowEmp = rawEmployees[emI];
              if (rowEmp && String(rowEmp.id || '').trim() !== '') {
                validEmpCount++;
              }
            }

            item.dataStatus = 'AVAILABLE';
            item.studentsCount = validStdCount;
            item.employeesCount = validEmpCount;

            summary.studentsTotal += validStdCount;
            summary.employeesTotal += validEmpCount;
            summary.schoolsIncluded++;
          } catch (readErr) {
            item.dataStatus = 'UNAVAILABLE';
            item.studentsCount = null;
            item.employeesCount = null;
            summary.schoolsUnavailable++;
          }

          schoolOverviewList.push(item);
        }

        recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SYSTEM_OVERVIEW_VIEWED', 'MASTER_SCHOOLS', '', 'عرض نظرة عامة مركزية للمدارس');

        output.summary = summary;
        output.schools = schoolOverviewList;
        output.generatedAt = getCairoISOString();
        return createJsonResponse(output, 200);
      }

      if (action === 'adminGetSchools') {
        var allSchools = getSheetData(ss, SHEETS.MASTER_SCHOOLS);
        var safeAll = allSchools.map(function(s) {
          return {
            schoolId: s.schoolId,
            schoolCode: s.schoolCode,
            schoolName: s.schoolName,
            status: s.status || 'Active',
            createdAt: s.createdAt,
            updatedAt: s.updatedAt
          };
        });
        output.schools = safeAll;
        return createJsonResponse(output, 200);
      }

      if (action === 'adminCreateSchool') {
        var schoolData = (payload && payload.school) || postData.school || {};
        var newSchoolId = String(schoolData.schoolId || '').trim().toUpperCase();
        var newSchoolCode = String(schoolData.schoolCode || '').trim().toUpperCase();
        var newSchoolName = String(schoolData.schoolName || '').trim();

        // Fail-Closed: client must NEVER send spreadsheetId (binding is strictly server-only)
        if (schoolData.spreadsheetId !== undefined || postData.spreadsheetId !== undefined || (payload && payload.spreadsheetId !== undefined)) {
          return createJsonResponse({
            status: 'error',
            code: 'CLIENT_SPREADSHEET_BINDING_FORBIDDEN',
            message: 'ربط جدول البيانات عبر واجهة المستخدم أو العميل محظور أمنياً. الربط يتم حصرياً عبر الخادم الرئيسي.',
            requestId: requestId
          }, 403);
        }

        if (!newSchoolId || !newSchoolCode || !newSchoolName) {
          return createJsonResponse({
            status: 'error',
            code: 'INVALID_SCHOOL_DATA',
            message: 'يرجى إدخال كود المدرسة ورمزها واسمها بالكامل',
            requestId: requestId
          }, 400);
        }

        var existingSchools = getSheetData(ss, SHEETS.MASTER_SCHOOLS);
        for (var si = 0; si < existingSchools.length; si++) {
          if (String(existingSchools[si].schoolId || '').toUpperCase() === newSchoolId ||
              String(existingSchools[si].schoolCode || '').toUpperCase() === newSchoolCode) {
            return createJsonResponse({
              status: 'error',
              code: 'SCHOOL_EXISTS',
              message: 'المدرسة مسجلة مسبقاً بنفس المعرف أو الرمز',
              requestId: requestId
            }, 400);
          }
        }

        // New schools default to Inactive until server binds an authenticated spreadsheet
        var createdSchool = {
          schoolId: newSchoolId,
          schoolCode: newSchoolCode,
          schoolName: newSchoolName,
          spreadsheetId: '',
          status: 'Inactive',
          createdAt: getCairoISOString(),
          updatedAt: getCairoISOString()
        };
        upsertRecord(ss, SHEETS.MASTER_SCHOOLS, 'schoolId', createdSchool);

        // Authoritative audit logging for school creation (no spreadsheetId logged)
        recordAuthoritativeAudit(
          ss,
          requestId,
          activeSession.email || activeSession.username || authenticatedUserId,
          authenticatedRole,
          'SCHOOL_CREATED',
          'MASTER_SCHOOLS',
          createdSchool.schoolId,
          JSON.stringify({ schoolName: createdSchool.schoolName, schoolCode: createdSchool.schoolCode, status: createdSchool.status })
        );

        output.message = 'تم تسجيل المدرسة بنجاح';
        output.school = {
          schoolId: createdSchool.schoolId,
          schoolCode: createdSchool.schoolCode,
          schoolName: createdSchool.schoolName,
          status: createdSchool.status,
          createdAt: createdSchool.createdAt,
          updatedAt: createdSchool.updatedAt
        };
        return createJsonResponse(output, 200);
      }

      if (action === 'adminUpdateSchool') {
        var updSchoolId = String(postData.schoolId || (payload && payload.schoolId) || '').trim().toUpperCase();
        var updates = (payload && payload.updates) || postData.updates || {};

        if (!updSchoolId) {
          return createJsonResponse({
            status: 'error',
            code: 'INVALID_SCHOOL_ID',
            message: 'يرجى تحديد معرف المدرسة للتحديث',
            requestId: requestId
          }, 400);
        }

        // Prevent mutation of immutable schoolId
        if (updates.schoolId && String(updates.schoolId).trim().toUpperCase() !== updSchoolId) {
          return createJsonResponse({
            status: 'error',
            code: 'IMMUTABLE_SCHOOL_ID',
            message: 'معرف المدرسة (schoolId) ثابت وغير قابل للتعديل',
            requestId: requestId
          }, 400);
        }

        var existingSchoolsList = getSheetData(ss, SHEETS.MASTER_SCHOOLS);
        var targetSchool = null;
        for (var sj = 0; sj < existingSchoolsList.length; sj++) {
          if (String(existingSchoolsList[sj].schoolId || '').toUpperCase() === updSchoolId) {
            targetSchool = existingSchoolsList[sj];
            break;
          }
        }
        if (!targetSchool) {
          return createJsonResponse({
            status: 'error',
            code: 'SCHOOL_NOT_FOUND',
            message: 'المدرسة المحددة غير موجودة',
            requestId: requestId
          }, 404);
        }

        var changedFields = {};

        // Update schoolCode if provided with duplicate validation
        if (updates.schoolCode !== undefined) {
          var newCode = String(updates.schoolCode || '').trim().toUpperCase();
          if (!newCode) {
            return createJsonResponse({
              status: 'error',
              code: 'INVALID_SCHOOL_CODE',
              message: 'رمز المدرسة لا يمكن أن يكون فارغاً',
              requestId: requestId
            }, 400);
          }
          if (newCode !== String(targetSchool.schoolCode || '').toUpperCase()) {
            for (var ckIdx = 0; ckIdx < existingSchoolsList.length; ckIdx++) {
              if (String(existingSchoolsList[ckIdx].schoolId || '').toUpperCase() !== updSchoolId &&
                  String(existingSchoolsList[ckIdx].schoolCode || '').toUpperCase() === newCode) {
                return createJsonResponse({
                  status: 'error',
                  code: 'DUPLICATE_SCHOOL_CODE',
                  message: 'رمز المدرسة مسجل مسبقاً لمدرسة أخرى',
                  requestId: requestId
                }, 400);
              }
            }
            changedFields.schoolCode = { from: targetSchool.schoolCode, to: newCode };
            targetSchool.schoolCode = newCode;
          }
        }

        // Update schoolName if provided
        if (updates.schoolName !== undefined) {
          var newName = String(updates.schoolName || '').trim();
          if (!newName) {
            return createJsonResponse({
              status: 'error',
              code: 'INVALID_SCHOOL_NAME',
              message: 'اسم المدرسة لا يمكن أن يكون فارغاً',
              requestId: requestId
            }, 400);
          }
          if (newName !== targetSchool.schoolName) {
            changedFields.schoolName = { from: targetSchool.schoolName, to: newName };
            targetSchool.schoolName = newName;
          }
        }

        // Update status if provided with strict enum validation & server binding validation
        if (updates.status !== undefined) {
          var newStatus = String(updates.status || '').trim();
          if (newStatus !== 'Active' && newStatus !== 'Inactive') {
            return createJsonResponse({
              status: 'error',
              code: 'INVALID_SCHOOL_STATUS',
              message: 'حالة المدرسة يجب أن تكون إما Active أو Inactive',
              requestId: requestId
            }, 400);
          }

          // Strict Activation Guard: school MUST have a valid, reachable spreadsheet bound server-side
          if (newStatus === 'Active') {
            var ssIdToVerify = String(targetSchool.spreadsheetId || '').trim();
            if (!ssIdToVerify) {
              return createJsonResponse({
                status: 'error',
                code: 'SCHOOL_SPREADSHEET_NOT_BOUND',
                message: 'لا يمكن تفعيل المدرسة قبل ربط جدول بيانات مستقل وصالح عبر الخادم الرئيسي.',
                requestId: requestId
              }, 400);
            }
            try {
              var openedTest = SpreadsheetApp.openById(ssIdToVerify);
              if (!openedTest) {
                return createJsonResponse({
                  status: 'error',
                  code: 'SCHOOL_SPREADSHEET_INVALID',
                  message: 'جدول البيانات المرتبط بالمدرسة غير صالح أو تعذر الوصول إليه.',
                  requestId: requestId
                }, 400);
              }
            } catch (openErr) {
              return createJsonResponse({
                status: 'error',
                code: 'SCHOOL_SPREADSHEET_INVALID',
                message: 'جدول البيانات المرتبط بالمدرسة غير صالح أو تعذر الوصول إليه.',
                requestId: requestId
              }, 400);
            }
          }

          if (newStatus !== targetSchool.status) {
            changedFields.status = { from: targetSchool.status, to: newStatus };
            targetSchool.status = newStatus;
          }
        }

        targetSchool.updatedAt = getCairoISOString();
        upsertRecord(ss, SHEETS.MASTER_SCHOOLS, 'schoolId', targetSchool);

        // Authoritative audit logging for school updates (no spreadsheetId logged)
        recordAuthoritativeAudit(
          ss,
          requestId,
          activeSession.email || activeSession.username || authenticatedUserId,
          authenticatedRole,
          'SCHOOL_UPDATED',
          'MASTER_SCHOOLS',
          targetSchool.schoolId,
          JSON.stringify(changedFields)
        );

        // Explicit activation/deactivation audits
        if (changedFields.status) {
          var auditAction = targetSchool.status === 'Active' ? 'SCHOOL_ACTIVATED' : 'SCHOOL_DEACTIVATED';
          recordAuthoritativeAudit(
            ss,
            requestId,
            activeSession.email || activeSession.username || authenticatedUserId,
            authenticatedRole,
            auditAction,
            'MASTER_SCHOOLS',
            targetSchool.schoolId,
            JSON.stringify({ status: changedFields.status })
          );
        }

        output.message = 'تم تحديث بيانات المدرسة بنجاح';
        output.school = {
          schoolId: targetSchool.schoolId,
          schoolCode: targetSchool.schoolCode,
          schoolName: targetSchool.schoolName,
          status: targetSchool.status,
          createdAt: targetSchool.createdAt,
          updatedAt: targetSchool.updatedAt
        };
        return createJsonResponse(output, 200);
      }
    }

    // -------------------------------------------------------------
    // 5. UNIFIED BACKEND AUTHORIZATION ENGINE (RBAC Phase 2)
    // -------------------------------------------------------------
    var requestedSchoolId = postData.schoolId || (payload && payload.schoolId);
    var resourceOwnerEmployeeId = (payload && (payload.employeeId || payload.ownerEmployeeId)) || postData.employeeId;
    var resourceContext = {
      schoolId: requestedSchoolId,
      ownerEmployeeId: resourceOwnerEmployeeId,
      resourceId: (payload && payload.id) || postData.id,
      targetUserId: (payload && payload.id) || postData.id,
      targetUsername: (payload && payload.username) || postData.username
    };

    var authResult = authorize(activeSession, action, resourceContext, ss, requestId);
    if (!authResult.allowed) {
      return createJsonResponse({
        status: 'error',
        code: authResult.code || 'FORBIDDEN',
        message: authResult.message || 'ليس لديك الصلاحيات الإدارية الكافية لتنفيذ هذا الإجراء',
        userRole: authenticatedRole,
        action: action,
        requestId: requestId
      }, 403);
    }

    var effectiveSchoolId = authResult.effectiveSchoolId;
    var targetSchoolSs = getSchoolSpreadsheet(effectiveSchoolId, ss);
    if (!targetSchoolSs) {
      return createJsonResponse({
        status: 'error',
        code: 'SCHOOL_NOT_FOUND',
        message: 'قاعدة بيانات المدرسة المطلوبة غير متوفرة',
        requestId: requestId
      }, 404);
    }
    var schoolSs = targetSchoolSs;

    // -------------------------------------------------------------
    // 6. PROTECTED STAFF ACTIONS DISPATCH
    // -------------------------------------------------------------

    // B. Students Master Data (School-Scoped strictly to schoolSs)
    if (action === 'getStudents') {
      output.data = getSheetData(schoolSs, SHEETS.STUDENTS);
      return createJsonResponse(output, 200);
    }

    if (action === 'createManagedStudent') {
      var createStudentResult = createManagedStudentRecord(
        schoolSs,
        payload || {},
        effectiveSchoolId,
        authenticatedUsername,
        authenticatedRole,
        requestId
      );
      if (!createStudentResult.success) {
        return createJsonResponse({
          status: 'error',
          code: createStudentResult.code || 'STUDENT_CREATE_FAILED',
          message: createStudentResult.message,
          requestId: requestId
        }, createStudentResult.httpStatus || 400);
      }
      output.message = createStudentResult.message;
      output.student = createStudentResult.student;
      output.enrollment = createStudentResult.enrollment || null;
      return createJsonResponse(output, 200);
    }

    if (action === 'updateManagedStudent') {
      var updateStudentResult = updateManagedStudentRecord(
        schoolSs,
        payload || {},
        effectiveSchoolId,
        authenticatedUsername,
        authenticatedRole,
        requestId
      );
      if (!updateStudentResult.success) {
        return createJsonResponse({
          status: 'error',
          code: updateStudentResult.code || 'STUDENT_UPDATE_FAILED',
          message: updateStudentResult.message,
          requestId: requestId
        }, updateStudentResult.httpStatus || 400);
      }
      output.message = updateStudentResult.message;
      output.student = updateStudentResult.student;
      output.enrollment = updateStudentResult.enrollment || null;
      return createJsonResponse(output, 200);
    }

    if (action === 'setManagedStudentStatus') {
      var studentStatusResult = setManagedStudentStatus(
        schoolSs,
        payload || {},
        effectiveSchoolId,
        authenticatedUsername,
        authenticatedRole,
        requestId
      );
      if (!studentStatusResult.success) {
        return createJsonResponse({
          status: 'error',
          code: studentStatusResult.code || 'STUDENT_STATUS_FAILED',
          message: studentStatusResult.message,
          requestId: requestId
        }, studentStatusResult.httpStatus || 400);
      }
      output.message = studentStatusResult.message;
      output.student = studentStatusResult.student;
      return createJsonResponse(output, 200);
    }

    if (action === 'saveStudent' && payload) {
      if (payload.id) {
        var curStudents = getSheetData(schoolSs, SHEETS.STUDENTS);
        for (var csIdx = 0; csIdx < curStudents.length; csIdx++) {
          if (curStudents[csIdx].id === payload.id) {
            var exStd = curStudents[csIdx];
            if (exStd.schoolId && String(exStd.schoolId).trim().toUpperCase() !== String(effectiveSchoolId).trim().toUpperCase()) {
              recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'CROSS_SCHOOL_ACCESS_DENIED', 'STUDENTS', payload.id, 'محاولة تعديل طالب من مدرسة أخرى');
              return createJsonResponse({
                status: 'error',
                code: 'CROSS_SCHOOL_ACCESS_DENIED',
                message: 'تم رفض العملية: الطالب المطلوب ينتمي إلى مدرسة أخرى',
                requestId: requestId
              }, 403);
            }
            break;
          }
        }
      }
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.STUDENTS, 'id', payload);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'STUDENTS', payload.id || '', 'حفظ سجل طالب');
      output.message = 'تم حفظ بيانات الطالب بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteStudent' && payload && payload.id) {
      var existingStudents = getSheetData(schoolSs, SHEETS.STUDENTS);
      var targetStudent = null;
      for (var sIdx = 0; sIdx < existingStudents.length; sIdx++) {
        if (existingStudents[sIdx].id === payload.id) {
          targetStudent = existingStudents[sIdx];
          break;
        }
      }
      if (!targetStudent) {
        return createJsonResponse({
          status: 'error',
          code: 'RESOURCE_NOT_FOUND',
          message: 'سجل الطالب غير موجود في قاعدة بيانات هذه المدرسة',
          requestId: requestId
        }, 404);
      }
      if (targetStudent.schoolId && String(targetStudent.schoolId).trim().toUpperCase() !== String(effectiveSchoolId).trim().toUpperCase()) {
        recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'CROSS_SCHOOL_ACCESS_DENIED', 'STUDENTS', payload.id, 'محاولة حذف طالب يتبع مدرسة أخرى');
        return createJsonResponse({
          status: 'error',
          code: 'CROSS_SCHOOL_ACCESS_DENIED',
          message: 'تم رفض العملية: الطالب المطلوب ينتمي إلى مدرسة أخرى',
          requestId: requestId
        }, 403);
      }
      deleteRecord(schoolSs, SHEETS.STUDENTS, 'id', payload.id);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'DELETE', 'STUDENTS', payload.id, 'حذف سجل طالب');
      output.message = 'تم حذف سجل الطالب بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'bulkSaveStudents' && payload && Array.isArray(payload)) {
      payload.forEach(function(rec) {
        rec.schoolId = effectiveSchoolId;
        upsertRecord(schoolSs, SHEETS.STUDENTS, 'id', rec);
      });
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'BULK_SAVE', 'STUDENTS', payload.length + ' records', 'حفظ دفعة طلاب');
      output.message = 'تم حفظ ' + payload.length + ' سجل طالب بنجاح';
      return createJsonResponse(output, 200);
    }

    // C. Student Access Token Management (School-Scoped strictly to schoolSs)
    if (action === 'issueStudentAccessToken' && payload) {
      var issueResult = issueStudentAccessToken(schoolSs, payload.studentId, authenticatedUserId, requestId);
      if (!issueResult.success) {
        return createJsonResponse({
          status: 'error',
          code: issueResult.code || 'TOKEN_ISSUE_FAILED',
          message: issueResult.message,
          requestId: requestId
        }, 400);
      }
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'ISSUE_TOKEN', 'STUDENT_ACCESS', payload.studentId, 'إصدار رمز وصول طالب');
      output.message = 'تم إصدار رمز الوصول بنجاح';
      output.rawToken = issueResult.rawToken;
      output.tokenRecord = issueResult.tokenRecord;
      return createJsonResponse(output, 200);
    }

    if (action === 'revokeStudentAccessToken' && payload) {
      revokeStudentAccessToken(schoolSs, payload.id || payload.studentId);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'REVOKE_TOKEN', 'STUDENT_ACCESS', payload.id || payload.studentId, 'إلغاء رمز وصول طالب');
      output.message = 'تم إلغاء رمز الوصول بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'getStudentAccessTokensList') {
      var allTokens = getSheetData(schoolSs, SHEETS.STUDENT_ACCESS_TOKENS);
      output.data = allTokens.map(function(t) {
        var clean = Object.assign({}, t);
        delete clean.tokenHash; // Do not leak hash
        return clean;
      });
      return createJsonResponse(output, 200);
    }

    // D. Daily Student Attendance (School-Scoped strictly to schoolSs)
    if (action === 'getStudentAttendance') {
      output.data = getSheetData(schoolSs, SHEETS.STUDENT_ATTENDANCE);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveStudentAttendance' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.STUDENT_ATTENDANCE, 'id', payload);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'STUDENT_ATTENDANCE', payload.id || '', 'تسجيل حضور طالب');
      output.message = 'تم تسجيل حضور الطالب بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'bulkSaveStudentAttendance' && payload && Array.isArray(payload)) {
      payload.forEach(function(rec) {
        rec.schoolId = effectiveSchoolId;
        upsertRecord(schoolSs, SHEETS.STUDENT_ATTENDANCE, 'id', rec);
      });
      output.message = 'تم حفظ دفعة حضور الطلاب بنجاح (' + payload.length + ' سجل)';
      return createJsonResponse(output, 200);
    }

    if (action === 'saveDailyStudentAttendanceBatch' && payload) {
      var stdBatchRes = saveDailyStudentAttendanceBatch(schoolSs, payload, authenticatedUsername, authenticatedRole, requestId);
      if (!stdBatchRes.success) {
        return createJsonResponse({
          status: 'error',
          code: stdBatchRes.code || 'STUDENT_ATTENDANCE_BATCH_FAILED',
          message: stdBatchRes.message,
          requestId: requestId
        }, 400);
      }
      output.message = stdBatchRes.message;
      output.savedCount = stdBatchRes.savedCount;
      output.records = stdBatchRes.records || [];
      return createJsonResponse(output, 200);
    }

    // E. Staff & Employees (School-Scoped strictly to schoolSs)
    if (action === 'getEmployees') {
      var rawEmployees = getSheetData(schoolSs, SHEETS.EMPLOYEES);
      output.data = rawEmployees.map(function(emp) {
        var cleanEmp = Object.assign({}, emp);
        delete cleanEmp.basicSalary;
        delete cleanEmp.allowances;
        delete cleanEmp.netSalary;
        delete cleanEmp.salary;
        delete cleanEmp.password;
        delete cleanEmp.passwordHash;
        delete cleanEmp.passwordSalt;
        delete cleanEmp.passwordAlgorithm;
        delete cleanEmp.passwordIterations;
        cleanEmp.employeeType = cleanEmp.employeeType || (cleanEmp.isTeacher || cleanEmp.teacherCode ? 'Teacher' : 'Administrative');
        cleanEmp.specialization = cleanEmp.specialization || cleanEmp.department || 'عام';
        return cleanEmp;
      });
      return createJsonResponse(output, 200);
    }

    if (action === 'createManagedEmployee') {
      var createEmpResult = createManagedEmployeeRecord(schoolSs, payload || {}, effectiveSchoolId, authenticatedUsername, authenticatedRole, requestId);
      if (!createEmpResult.success) {
        return createJsonResponse({
          status: 'error',
          code: createEmpResult.code || 'EMPLOYEE_CREATE_FAILED',
          message: createEmpResult.message,
          requestId: requestId
        }, createEmpResult.httpStatus || 400);
      }
      output.message = createEmpResult.message;
      output.employee = createEmpResult.employee;
      return createJsonResponse(output, 200);
    }

    if (action === 'updateManagedEmployee') {
      var updateEmpResult = updateManagedEmployeeRecord(schoolSs, payload || {}, effectiveSchoolId, authenticatedUsername, authenticatedRole, requestId);
      if (!updateEmpResult.success) {
        return createJsonResponse({
          status: 'error',
          code: updateEmpResult.code || 'EMPLOYEE_UPDATE_FAILED',
          message: updateEmpResult.message,
          requestId: requestId
        }, updateEmpResult.httpStatus || 400);
      }
      output.message = updateEmpResult.message;
      output.employee = updateEmpResult.employee;
      return createJsonResponse(output, 200);
    }

    if (action === 'setManagedEmployeeStatus') {
      var statusEmpResult = setManagedEmployeeStatusRecord(schoolSs, payload || {}, effectiveSchoolId, authenticatedUsername, authenticatedRole, requestId);
      if (!statusEmpResult.success) {
        return createJsonResponse({
          status: 'error',
          code: statusEmpResult.code || 'EMPLOYEE_STATUS_FAILED',
          message: statusEmpResult.message,
          requestId: requestId
        }, statusEmpResult.httpStatus || 400);
      }
      output.message = statusEmpResult.message;
      output.employee = statusEmpResult.employee;
      return createJsonResponse(output, 200);
    }

    if (action === 'importManagedEmployees') {
      var importEmpResult = importManagedEmployeeRecords(schoolSs, Array.isArray(payload) ? payload : [], effectiveSchoolId, authenticatedUsername, authenticatedRole, requestId);
      if (!importEmpResult.success) {
        return createJsonResponse({
          status: 'error',
          code: importEmpResult.code || 'EMPLOYEE_IMPORT_FAILED',
          message: importEmpResult.message,
          requestId: requestId
        }, importEmpResult.httpStatus || 400);
      }
      output.message = importEmpResult.message;
      output.stats = importEmpResult.stats;
      return createJsonResponse(output, 200);
    }

    if (action === 'saveEmployee' && payload) {
      if (payload.id) {
        var exEmps = getSheetData(schoolSs, SHEETS.EMPLOYEES);
        for (var eI = 0; eI < exEmps.length; eI++) {
          if (exEmps[eI].id === payload.id) {
            if (exEmps[eI].schoolId && String(exEmps[eI].schoolId).trim().toUpperCase() !== String(effectiveSchoolId).trim().toUpperCase()) {
              recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'CROSS_SCHOOL_ACCESS_DENIED', 'EMPLOYEES', payload.id, 'محاولة تعديل موظف من مدرسة أخرى');
              return createJsonResponse({
                status: 'error',
                code: 'CROSS_SCHOOL_ACCESS_DENIED',
                message: 'تم رفض العملية: الموظف المطلوب ينتمي إلى مدرسة أخرى',
                requestId: requestId
              }, 403);
            }
            break;
          }
        }
      }
      var sanitizedEmp = Object.assign({}, payload);
      delete sanitizedEmp.basicSalary;
      delete sanitizedEmp.allowances;
      delete sanitizedEmp.netSalary;
      delete sanitizedEmp.salary;
      delete sanitizedEmp.password;
      delete sanitizedEmp.passwordHash;
      delete sanitizedEmp.passwordSalt;
      sanitizedEmp.employeeType = sanitizedEmp.employeeType === 'Teacher' ? 'Teacher' : 'Administrative';
      if (sanitizedEmp.employeeType === 'Teacher' && !sanitizedEmp.teacherCode && sanitizedEmp.id) {
        sanitizedEmp.teacherCode = sanitizedEmp.id;
      }
      sanitizedEmp.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.EMPLOYEES, 'id', sanitizedEmp);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'EMPLOYEES', payload.id || '', 'حفظ سجل موظف');
      output.message = 'تم حفظ بيانات الموظف بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'bulkSaveEmployees' && payload && Array.isArray(payload)) {
      var addedCount = 0;
      var updatedCount = 0;
      var existingEmps = getSheetData(schoolSs, SHEETS.EMPLOYEES);

      payload.forEach(function(emp) {
        var clean = Object.assign({}, emp);
        delete clean.basicSalary;
        delete clean.allowances;
        delete clean.netSalary;
        delete clean.salary;
        delete clean.password;
        delete clean.passwordHash;
        delete clean.passwordSalt;

        clean.employeeType = clean.employeeType === 'Teacher' ? 'Teacher' : 'Administrative';
        if (clean.employeeType === 'Teacher' && !clean.teacherCode && clean.id) {
          clean.teacherCode = clean.id;
        }
        clean.schoolId = effectiveSchoolId;

        // Match existing by immutable id, or by unique nationalId if present
        var matchIdx = -1;
        if (clean.id) {
          for (var i = 0; i < existingEmps.length; i++) {
            if (existingEmps[i].id === clean.id) {
              matchIdx = i;
              break;
            }
          }
        }
        if (matchIdx === -1 && clean.nationalId) {
          for (var j = 0; j < existingEmps.length; j++) {
            if (existingEmps[j].nationalId && String(existingEmps[j].nationalId).trim() === String(clean.nationalId).trim()) {
              matchIdx = j;
              break;
            }
          }
        }

        if (matchIdx >= 0) {
          clean.id = existingEmps[matchIdx].id;
          upsertRecord(schoolSs, SHEETS.EMPLOYEES, 'id', clean);
          updatedCount++;
        } else {
          if (!clean.id) {
            clean.id = 'EMP' + Utilities.getUuid().substring(0, 6).toUpperCase();
          }
          upsertRecord(schoolSs, SHEETS.EMPLOYEES, 'id', clean);
          existingEmps.push(clean);
          addedCount++;
        }
      });

      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'BULK_SAVE', 'EMPLOYEES', payload.length + ' records', 'استيراد وحفظ دفعة عاملين ومدرسين');
      output.message = 'تم حفظ واستيراد ' + payload.length + ' سجل بنجاح (' + addedCount + ' جديد، ' + updatedCount + ' تحديث)';
      output.stats = { added: addedCount, updated: updatedCount };
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteEmployee' && payload && payload.id) {
      var allEmpsForDel = getSheetData(schoolSs, SHEETS.EMPLOYEES);
      var targetEmpForDel = null;
      for (var edIdx = 0; edIdx < allEmpsForDel.length; edIdx++) {
        if (allEmpsForDel[edIdx].id === payload.id) {
          targetEmpForDel = allEmpsForDel[edIdx];
          break;
        }
      }
      if (!targetEmpForDel) {
        return createJsonResponse({
          status: 'error',
          code: 'RESOURCE_NOT_FOUND',
          message: 'سجل الموظف غير موجود في قاعدة بيانات هذه المدرسة',
          requestId: requestId
        }, 404);
      }
      if (targetEmpForDel.schoolId && String(targetEmpForDel.schoolId).trim().toUpperCase() !== String(effectiveSchoolId).trim().toUpperCase()) {
        recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'CROSS_SCHOOL_ACCESS_DENIED', 'EMPLOYEES', payload.id, 'محاولة حذف موظف يتبع مدرسة أخرى');
        return createJsonResponse({
          status: 'error',
          code: 'CROSS_SCHOOL_ACCESS_DENIED',
          message: 'تم رفض العملية: الموظف المطلوب ينتمي إلى مدرسة أخرى',
          requestId: requestId
        }, 403);
      }
      deleteRecord(schoolSs, SHEETS.EMPLOYEES, 'id', payload.id);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'DELETE', 'EMPLOYEES', payload.id, 'حذف موظف');
      output.message = 'تم حذف سجل الموظف بنجاح';
      return createJsonResponse(output, 200);
    }

    // F. Employee Attendance, Leaves, Permissions (School-Scoped strictly to schoolSs)
    if (action === 'getAttendance') {
      output.data = getSheetData(schoolSs, SHEETS.ATTENDANCE);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveAttendance' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.ATTENDANCE, 'id', payload);
      output.message = 'تم تسجيل دوام الموظف بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'bulkSaveAttendance' && payload && Array.isArray(payload)) {
      payload.forEach(function(rec) {
        rec.schoolId = effectiveSchoolId;
        upsertRecord(schoolSs, SHEETS.ATTENDANCE, 'id', rec);
      });
      output.message = 'تم حفظ دوام الموظفين (' + payload.length + ' سجل)';
      return createJsonResponse(output, 200);
    }

    if ((action === 'saveDailyStaffAttendanceBatch' || action === 'saveDailyTeacherAttendanceBatch') && payload) {
      var staffBatchRes = saveDailyStaffAttendanceBatch(schoolSs, payload, authenticatedUsername, authenticatedRole, requestId);
      if (!staffBatchRes.success) {
        return createJsonResponse({
          status: 'error',
          code: staffBatchRes.code || 'STAFF_ATTENDANCE_BATCH_FAILED',
          message: staffBatchRes.message,
          requestId: requestId
        }, 400);
      }
      output.message = staffBatchRes.message;
      output.savedCount = staffBatchRes.savedCount;
      output.records = staffBatchRes.records || [];
      return createJsonResponse(output, 200);
    }

    if (action === 'getMyRequests') {
      var myRequestsResult = getStaffSelfRequestsBundle(schoolSs, activeSession);
      if (!myRequestsResult.success) {
        return createJsonResponse({
          status: 'error',
          code: myRequestsResult.code || 'SELF_REQUESTS_READ_FAILED',
          message: myRequestsResult.message,
          requestId: requestId
        }, 400);
      }
      output.data = {
        profile: myRequestsResult.profile,
        leaves: myRequestsResult.leaves,
        permissions: myRequestsResult.permissions
      };
      return createJsonResponse(output, 200);
    }

    if (action === 'createMyLeaveRequest') {
      var myLeaveResult = createStaffSelfLeaveRequest(
        schoolSs,
        activeSession,
        payload || {},
        effectiveSchoolId,
        requestId
      );
      if (!myLeaveResult.success) {
        return createJsonResponse({
          status: 'error',
          code: myLeaveResult.code || 'LEAVE_REQUEST_FAILED',
          message: myLeaveResult.message,
          requestId: requestId
        }, 400);
      }
      output.message = myLeaveResult.message;
      output.leave = myLeaveResult.leave;
      return createJsonResponse(output, 200);
    }

    if (action === 'createMyPermissionRequest') {
      var myPermissionResult = createStaffSelfPermissionRequest(
        schoolSs,
        activeSession,
        payload || {},
        effectiveSchoolId,
        requestId
      );
      if (!myPermissionResult.success) {
        return createJsonResponse({
          status: 'error',
          code: myPermissionResult.code || 'PERMISSION_REQUEST_FAILED',
          message: myPermissionResult.message,
          requestId: requestId
        }, 400);
      }
      output.message = myPermissionResult.message;
      output.permission = myPermissionResult.permission;
      return createJsonResponse(output, 200);
    }

    if (action === 'getLeaveManagementData') {
      output.data = {
        leaves: getSheetData(schoolSs, SHEETS.LEAVES),
        permissions: getSheetData(schoolSs, SHEETS.PERMISSIONS)
      };
      return createJsonResponse(output, 200);
    }

    if (action === 'createManagedLeave') {
      var managedLeaveResult = createManagedLeaveRequest(
        schoolSs,
        activeSession,
        payload || {},
        effectiveSchoolId,
        requestId
      );
      if (!managedLeaveResult.success) {
        return createJsonResponse({
          status: 'error',
          code: managedLeaveResult.code || 'LEAVE_CREATE_FAILED',
          message: managedLeaveResult.message,
          requestId: requestId
        }, 400);
      }
      output.message = managedLeaveResult.message;
      output.leave = managedLeaveResult.leave;
      return createJsonResponse(output, 200);
    }

    if (action === 'createManagedPermission') {
      var managedPermissionResult = createManagedPermissionRequest(
        schoolSs,
        activeSession,
        payload || {},
        effectiveSchoolId,
        requestId
      );
      if (!managedPermissionResult.success) {
        return createJsonResponse({
          status: 'error',
          code: managedPermissionResult.code || 'PERMISSION_CREATE_FAILED',
          message: managedPermissionResult.message,
          requestId: requestId
        }, 400);
      }
      output.message = managedPermissionResult.message;
      output.permission = managedPermissionResult.permission;
      return createJsonResponse(output, 200);
    }

    if (action === 'approveManagedLeave' || action === 'rejectManagedLeave') {
      var managedLeaveStatusResult = setManagedLeaveStatus(
        schoolSs,
        activeSession,
        payload || {},
        action === 'approveManagedLeave' ? 'مقبولة' : 'مرفوضة',
        requestId
      );
      if (!managedLeaveStatusResult.success) {
        return createJsonResponse({
          status: 'error',
          code: managedLeaveStatusResult.code || 'LEAVE_STATUS_FAILED',
          message: managedLeaveStatusResult.message,
          requestId: requestId
        }, managedLeaveStatusResult.httpStatus || 400);
      }
      output.message = managedLeaveStatusResult.message;
      output.leave = managedLeaveStatusResult.leave;
      return createJsonResponse(output, 200);
    }

    if (action === 'approveManagedPermission' || action === 'rejectManagedPermission') {
      var managedPermissionStatusResult = setManagedPermissionStatus(
        schoolSs,
        activeSession,
        payload || {},
        action === 'approveManagedPermission' ? 'مقبولة' : 'مرفوضة',
        requestId
      );
      if (!managedPermissionStatusResult.success) {
        return createJsonResponse({
          status: 'error',
          code: managedPermissionStatusResult.code || 'PERMISSION_STATUS_FAILED',
          message: managedPermissionStatusResult.message,
          requestId: requestId
        }, managedPermissionStatusResult.httpStatus || 400);
      }
      output.message = managedPermissionStatusResult.message;
      output.permission = managedPermissionStatusResult.permission;
      return createJsonResponse(output, 200);
    }

    if (action === 'getLeaves') {
      var allLeaves = getSheetData(schoolSs, SHEETS.LEAVES);
      if (activeSession.accessScope === 'SELF') {
        var selfEmpId = String(activeSession.employeeId || activeSession.userId || '').trim().toLowerCase();
        output.data = allLeaves.filter(function(l) {
          return String(l.employeeId || '').trim().toLowerCase() === selfEmpId;
        });
      } else {
        output.data = allLeaves;
      }
      return createJsonResponse(output, 200);
    }

    if (action === 'saveLeave' && payload) {
      if (activeSession.accessScope === 'SELF') {
        var selfEmpId = String(activeSession.employeeId || activeSession.userId || '').trim();
        if (payload.employeeId && String(payload.employeeId).trim().toLowerCase() !== selfEmpId.toLowerCase()) {
          recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SELF_SCOPE_VIOLATION', 'LEAVES', payload.id || '', 'محاولة تسجيل إجازة لموظف آخر');
          return createJsonResponse({
            status: 'error',
            code: 'SELF_SCOPE_VIOLATION',
            message: 'تم رفض العملية: غير مصرح بطلب أو تسجيل إجازة لموظف آخر',
            requestId: requestId
          }, 403);
        }
        if (payload.id) {
          var allSchoolLeaves = getSheetData(schoolSs, SHEETS.LEAVES);
          var existingLeave = null;
          for (var li = 0; li < allSchoolLeaves.length; li++) {
            if (String(allSchoolLeaves[li].id || '').trim() === String(payload.id).trim()) {
              existingLeave = allSchoolLeaves[li];
              break;
            }
          }
          if (existingLeave) {
            if (String(existingLeave.employeeId || '').trim().toLowerCase() !== selfEmpId.toLowerCase()) {
              recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SELF_SCOPE_VIOLATION', 'LEAVES', payload.id, 'محاولة تعديل إجازة موظف آخر');
              return createJsonResponse({
                status: 'error',
                code: 'SELF_SCOPE_VIOLATION',
                message: 'تم رفض العملية: غير مصرح بتعديل إجازة موظف آخر',
                requestId: requestId
              }, 403);
            }
            if (payload.status && payload.status !== existingLeave.status) {
              if (['Approved', 'Rejected', 'معتمدة', 'مرفوضة'].indexOf(payload.status) !== -1) {
                return createJsonResponse({
                  status: 'error',
                  code: 'ROLE_PERMISSION_DENIED',
                  message: 'غير مصرح بتغيير حالة اعتماد الإجازة إدارياً',
                  requestId: requestId
                }, 403);
              }
            }
          }
        }
        payload.employeeId = selfEmpId;
      }
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.LEAVES, 'id', payload);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'LEAVES', payload.id || '', 'طلب / اعتماد إجازة');
      output.message = 'تم حفظ سجل الإجازة بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteLeave' && payload && payload.id) {
      if (activeSession.accessScope === 'SELF') {
        recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SELF_SCOPE_VIOLATION', 'LEAVES', payload.id, 'محاولة حذف إجازة من حساب نطاق ذاتي');
        return createJsonResponse({
          status: 'error',
          code: 'ROLE_PERMISSION_DENIED',
          message: 'حسابات النطاق الذاتي غير مصرح لها بحذف سجلات الإجازات',
          requestId: requestId
        }, 403);
      }
      deleteRecord(schoolSs, SHEETS.LEAVES, 'id', payload.id);
      output.message = 'تم حذف سجل الإجازة بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'getPermissions') {
      var allPerms = getSheetData(schoolSs, SHEETS.PERMISSIONS);
      if (activeSession.accessScope === 'SELF') {
        var selfPermEmpId = String(activeSession.employeeId || activeSession.userId || '').trim().toLowerCase();
        output.data = allPerms.filter(function(p) {
          return String(p.employeeId || '').trim().toLowerCase() === selfPermEmpId;
        });
      } else {
        output.data = allPerms;
      }
      return createJsonResponse(output, 200);
    }

    if (action === 'savePermission' && payload) {
      if (activeSession.accessScope === 'SELF') {
        var selfPermEmpId = String(activeSession.employeeId || activeSession.userId || '').trim();
        if (payload.employeeId && String(payload.employeeId).trim().toLowerCase() !== selfPermEmpId.toLowerCase()) {
          recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SELF_SCOPE_VIOLATION', 'PERMISSIONS', payload.id || '', 'محاولة تسجيل إذن لموظف آخر');
          return createJsonResponse({
            status: 'error',
            code: 'SELF_SCOPE_VIOLATION',
            message: 'تم رفض العملية: غير مصرح بطلب أو تسجيل إذن لموظف آخر',
            requestId: requestId
          }, 403);
        }
        if (payload.id) {
          var allSchoolPerms = getSheetData(schoolSs, SHEETS.PERMISSIONS);
          var existingPerm = null;
          for (var pi = 0; pi < allSchoolPerms.length; pi++) {
            if (String(allSchoolPerms[pi].id || '').trim() === String(payload.id).trim()) {
              existingPerm = allSchoolPerms[pi];
              break;
            }
          }
          if (existingPerm) {
            if (String(existingPerm.employeeId || '').trim().toLowerCase() !== selfPermEmpId.toLowerCase()) {
              recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SELF_SCOPE_VIOLATION', 'PERMISSIONS', payload.id, 'محاولة تعديل إذن موظف آخر');
              return createJsonResponse({
                status: 'error',
                code: 'SELF_SCOPE_VIOLATION',
                message: 'تم رفض العملية: غير مصرح بتعديل إذن موظف آخر',
                requestId: requestId
              }, 403);
            }
            if (payload.status && payload.status !== existingPerm.status) {
              if (['Approved', 'Rejected', 'معتمد', 'مرفوض'].indexOf(payload.status) !== -1) {
                return createJsonResponse({
                  status: 'error',
                  code: 'ROLE_PERMISSION_DENIED',
                  message: 'غير مصرح بتغيير حالة اعتماد الإذن إدارياً',
                  requestId: requestId
                }, 403);
              }
            }
          }
        }
        payload.employeeId = selfPermEmpId;
      }
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.PERMISSIONS, 'id', payload);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'PERMISSIONS', payload.id || '', 'طلب / اعتماد إذن');
      output.message = 'تم حفظ سجل الإذن بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deletePermission' && payload && payload.id) {
      if (activeSession.accessScope === 'SELF') {
        recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SELF_SCOPE_VIOLATION', 'PERMISSIONS', payload.id, 'محاولة حذف إذن من حساب نطاق ذاتي');
        return createJsonResponse({
          status: 'error',
          code: 'ROLE_PERMISSION_DENIED',
          message: 'حسابات النطاق الذاتي غير مصرح لها بحذف سجلات الأذونات',
          requestId: requestId
        }, 403);
      }
      deleteRecord(schoolSs, SHEETS.PERMISSIONS, 'id', payload.id);
      output.message = 'تم حذف سجل الإذن بنجاح';
      return createJsonResponse(output, 200);
    }

    // G. Timetable - Teacher Teaching Assignments (School-Scoped strictly to schoolSs)
    if (action === 'getTeacherAssignments') {
      output.data = getSheetData(schoolSs, SHEETS.TEACHER_TEACHING_ASSIGNMENTS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveTeacherAssignment' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.TEACHER_TEACHING_ASSIGNMENTS, 'id', payload);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'TEACHING_ASSIGNMENT', payload.id || '', 'إسناد تدريس لمعلم');
      output.message = 'تم حفظ إسناد التدريس بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteTeacherAssignment' && payload && payload.id) {
      deleteRecord(schoolSs, SHEETS.TEACHER_TEACHING_ASSIGNMENTS, 'id', payload.id);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'DELETE', 'TEACHING_ASSIGNMENT', payload.id, 'حذف إسناد تدريس');
      output.message = 'تم حذف إسناد التدريس بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'bulkSaveTeacherAssignments' && payload && Array.isArray(payload)) {
      payload.forEach(function(rec) {
        rec.schoolId = effectiveSchoolId;
        upsertRecord(schoolSs, SHEETS.TEACHER_TEACHING_ASSIGNMENTS, 'id', rec);
      });
      output.message = 'تم حفظ ' + payload.length + ' إسناد تدريس بنجاح';
      return createJsonResponse(output, 200);
    }

    // H. Timetable - Schedule Entries (Weekly Timetable - School-Scoped strictly to schoolSs)
    if (action === 'getSchedule') {
      output.data = getSheetData(schoolSs, SHEETS.SCHEDULE);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveScheduleEntry' && payload) {
      var lock = LockService.getScriptLock();
      try {
        var acquired = lock.tryLock(15000);
        if (!acquired) {
          return createJsonResponse({
            status: 'error',
            code: 'LOCK_TIMEOUT',
            message: 'النظام مشغول بعملية أخرى، يرجى المحاولة لاحقاً',
            requestId: requestId
          }, 429);
        }

        var scheduleConflict = validateServerScheduleConflicts(schoolSs, payload);
        if (!scheduleConflict.success) {
          return createJsonResponse({
            status: 'error',
            code: scheduleConflict.code || 'SCHEDULE_CONFLICT',
            message: scheduleConflict.message,
            requestId: requestId
          }, 400);
        }

        payload.schoolId = effectiveSchoolId;
        upsertRecord(schoolSs, SHEETS.SCHEDULE, 'id', payload);
        recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'SCHEDULE', payload.id || '', 'حفظ حصة دراسية مع التحقق الأمني');
        output.message = 'تم حفظ الحصة الدراسية بنجاح';
        return createJsonResponse(output, 200);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'bulkSaveSchedule' && payload && Array.isArray(payload)) {
      payload.forEach(function(rec) {
        rec.schoolId = effectiveSchoolId;
        upsertRecord(schoolSs, SHEETS.SCHEDULE, 'id', rec);
      });
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'BULK_SAVE', 'SCHEDULE', payload.length + ' slots', 'حفظ دفعة جدول دراسي');
      output.message = 'تم حفظ ' + payload.length + ' حصة في الجدول بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteScheduleEntry' && payload && payload.id) {
      deleteRecord(schoolSs, SHEETS.SCHEDULE, 'id', payload.id);
      output.message = 'تم حذف الحصة الدراسية بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'publishSchedule' && payload) {
      var pubResult = publishScheduleBatch(schoolSs, payload.classroomOrGrade, payload.version, authenticatedUsername);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'PUBLISH', 'SCHEDULE', payload.classroomOrGrade || 'ALL', 'نشر الجدول الدراسي رسمياً');
      output.message = pubResult.message;
      return createJsonResponse(output, 200);
    }

    // I. Schedule Breaks (School-Scoped strictly to schoolSs)
    if (action === 'getScheduleBreaks') {
      output.data = getSheetData(schoolSs, SHEETS.SCHEDULE_BREAKS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveScheduleBreaks' && payload && Array.isArray(payload)) {
      var breaksSheet = schoolSs.getSheetByName(SHEETS.SCHEDULE_BREAKS);
      if (breaksSheet) {
        breaksSheet.clearContents();
        var headers = ['id', 'name', 'afterPeriod', 'startTime', 'endTime', 'durationMinutes', 'isActive'];
        breaksSheet.appendRow(headers);
        payload.forEach(function(b) {
          breaksSheet.appendRow([b.id, b.name, b.afterPeriod, b.startTime, b.endTime, b.durationMinutes, b.isActive !== false]);
        });
        styleHeaderRow(breaksSheet, headers.length);
      }
      output.message = 'تم تحديث فترات الفسحة بنجاح';
      return createJsonResponse(output, 200);
    }

    // J. Teacher Availability (School-Scoped strictly to schoolSs)
    if (action === 'getTeacherAvailability') {
      output.data = getSheetData(schoolSs, SHEETS.TEACHER_AVAILABILITY);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveTeacherAvailability' && payload) {
      if (Array.isArray(payload)) {
        payload.forEach(function(rec) {
          rec.schoolId = effectiveSchoolId;
          upsertRecord(schoolSs, SHEETS.TEACHER_AVAILABILITY, 'id', rec);
        });
      } else {
        payload.schoolId = effectiveSchoolId;
        upsertRecord(schoolSs, SHEETS.TEACHER_AVAILABILITY, 'id', payload);
      }
      output.message = 'تم حفظ بيانات تفرغ المعلم بنجاح';
      return createJsonResponse(output, 200);
    }

    // K. Reserve Substitutions (School-Scoped strictly to schoolSs)
    if (action === 'getReserveAssignments') {
      output.data = getSheetData(schoolSs, SHEETS.RESERVE_ASSIGNMENTS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveReserveAssignment' && payload) {
      var lock = LockService.getScriptLock();
      try {
        var acquired = lock.tryLock(15000);
        if (!acquired) {
          return createJsonResponse({
            status: 'error',
            code: 'LOCK_TIMEOUT',
            message: 'النظام مشغول بعملية إسناد أخرى، يرجى المحاولة مرة أخرى.',
            requestId: requestId
          }, 429);
        }

        payload.schoolId = effectiveSchoolId;
        var reserveResult = handleSaveReserveAssignment(schoolSs, payload, authenticatedUsername, requestId);
        if (!reserveResult.success) {
          return createJsonResponse({
            status: 'error',
            code: reserveResult.code || 'RESERVE_ASSIGN_FAILED',
            message: reserveResult.message,
            requestId: requestId
          }, 400);
        }

        recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'ASSIGN', 'RESERVE', payload.id || '', 'إسناد حصة احتياطي');
        output.message = reserveResult.message;
        output.record = reserveResult.record;
        return createJsonResponse(output, 200);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'cancelReserveAssignment' && payload && payload.id) {
      var cancelRes = cancelReserveAssignmentRecord(schoolSs, payload.id, payload.reason, authenticatedUsername);
      output.message = cancelRes.message;
      return createJsonResponse(output, 200);
    }

    // L. Supervision Schedule (School-Scoped strictly to schoolSs)
    if (action === 'getSupervisionLocations') {
      output.data = getSheetData(schoolSs, SHEETS.SUPERVISION_LOCATIONS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveSupervisionLocation' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.SUPERVISION_LOCATIONS, 'id', payload);
      output.message = 'تم حفظ موقع الإشراف بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'getSupervisionAssignments') {
      output.data = getSheetData(schoolSs, SHEETS.SUPERVISION_ASSIGNMENTS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveSupervisionAssignment' && payload) {
      payload.schoolId = effectiveSchoolId;
      var supResult = handleSaveSupervisionAssignment(schoolSs, payload, authenticatedUsername, requestId);
      if (!supResult.success) {
        return createJsonResponse({
          status: 'error',
          code: supResult.code || 'SUPERVISION_CONFLICT',
          message: supResult.message,
          requestId: requestId
        }, 400);
      }
      output.message = supResult.message;
      return createJsonResponse(output, 200);
    }

    // M. Homework Management (School-Scoped strictly to schoolSs)
    if (action === 'getHomework') {
      output.data = getSheetData(schoolSs, SHEETS.HOMEWORK);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveHomework' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.HOMEWORK, 'id', payload);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'HOMEWORK', payload.id || '', 'حفظ / اعتماد واجب منزلي');
      output.message = 'تم حفظ سجل الواجب بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteHomework' && payload && payload.id) {
      deleteRecord(schoolSs, SHEETS.HOMEWORK, 'id', payload.id);
      output.message = 'تم حذف الواجب بنجاح';
      return createJsonResponse(output, 200);
    }

    // N. Teacher Lesson Resources (School-Scoped strictly to schoolSs)
    if (action === 'getTeacherResources') {
      output.data = getSheetData(schoolSs, SHEETS.TEACHER_RESOURCES);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveTeacherResource' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.TEACHER_RESOURCES, 'id', payload);
      output.message = 'تم حفظ المورد التعليمي بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteTeacherResource' && payload && payload.id) {
      deleteRecord(schoolSs, SHEETS.TEACHER_RESOURCES, 'id', payload.id);
      output.message = 'تم حذف المورد بنجاح';
      return createJsonResponse(output, 200);
    }

    // O. Exam Schedules (School-Scoped strictly to schoolSs)
    if (action === 'getExamSchedules') {
      output.data = getSheetData(schoolSs, SHEETS.EXAM_SCHEDULES);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveExamSchedule' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.EXAM_SCHEDULES, 'id', payload);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'EXAM_SCHEDULE', payload.id || '', 'حفظ جدول امتحان');
      output.message = 'تم حفظ جدول الامتحان بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteExamSchedule' && payload && payload.id) {
      deleteRecord(schoolSs, SHEETS.EXAM_SCHEDULES, 'id', payload.id);
      output.message = 'تم حذف موعد الامتحان بنجاح';
      return createJsonResponse(output, 200);
    }

    // P. Teacher Portal PIN (Retired) & Account Management (School-Scoped strictly to schoolSs)
    if (action === 'setTeacherPortalPin') {
      return createJsonResponse({
        status: 'error',
        success: false,
        code: 'LEGACY_PIN_RETIRED',
        message: 'تم إيقاف تسجيل الدخول باستخدام PIN',
        requestId: requestId
      }, 400);
    }

    if (action === 'createTeacherAccount' && payload) {
      var createAccRes = createTeacherAccount(schoolSs, payload, authenticatedUsername, authenticatedRole, requestId);
      if (!createAccRes.success) {
        return createJsonResponse({
          status: 'error',
          code: createAccRes.code || 'CREATE_TEACHER_ACCOUNT_FAILED',
          message: createAccRes.message,
          requestId: requestId
        }, 400);
      }
      output.message = createAccRes.message;
      output.data = createAccRes.data;
      return createJsonResponse(output, 200);
    }

    if (action === 'resetTeacherPassword' && payload) {
      var resetPassRes = resetTeacherPassword(schoolSs, payload, authenticatedUsername, authenticatedRole, requestId);
      if (!resetPassRes.success) {
        return createJsonResponse({
          status: 'error',
          code: resetPassRes.code || 'RESET_TEACHER_PASSWORD_FAILED',
          message: resetPassRes.message,
          requestId: requestId
        }, 400);
      }
      output.message = resetPassRes.message;
      return createJsonResponse(output, 200);
    }

    if (action === 'setTeacherAccountStatus' && payload) {
      var statusRes = setTeacherAccountStatus(schoolSs, payload, authenticatedUsername, authenticatedRole, requestId);
      if (!statusRes.success) {
        return createJsonResponse({
          status: 'error',
          code: statusRes.code || 'SET_STATUS_FAILED',
          message: statusRes.message,
          requestId: requestId
        }, 400);
      }
      output.message = statusRes.message;
      return createJsonResponse(output, 200);
    }

    if (action === 'getTeacherAccounts') {
      output.data = getTeacherAccountsSafeList(schoolSs);
      return createJsonResponse(output, 200);
    }

    // Q. Behavior & Social Support (School-Scoped strictly to schoolSs)
    if (action === 'getBehaviorRecords') {
      output.violations = getSheetData(schoolSs, SHEETS.BEHAVIOR_VIOLATIONS);
      output.cases = getSheetData(schoolSs, SHEETS.BEHAVIOR_CASES);
      output.positiveTypes = getSheetData(schoolSs, SHEETS.POSITIVE_BEHAVIOR_TYPES);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveBehaviorViolation' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.BEHAVIOR_VIOLATIONS, 'id', payload);
      output.message = 'تم تسجيل المخالفة السلوكية بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'saveBehaviorCase' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.BEHAVIOR_CASES, 'id', payload);
      output.message = 'تم حفظ دراسة الحالة بنجاح';
      return createJsonResponse(output, 200);
    }

    // R. Academic Years & Enrollments (School-Scoped strictly to schoolSs)
    if (action === 'getAcademicYears') {
      output.academicYears = getSheetData(schoolSs, SHEETS.ACADEMIC_YEARS);
      output.enrollments = getSheetData(schoolSs, SHEETS.STUDENT_ENROLLMENTS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveAcademicYear' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.ACADEMIC_YEARS, 'id', payload);
      output.message = 'تم حفظ العام الدراسي بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'saveStudentEnrollment' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.STUDENT_ENROLLMENTS, 'id', payload);
      output.message = 'تم حفظ قيد الطالب بنجاح';
      return createJsonResponse(output, 200);
    }

    // S. Parent Communications (School-Scoped strictly to schoolSs)
    if (action === 'getParentCommunications') {
      output.data = getSheetData(schoolSs, SHEETS.PARENT_COMMUNICATIONS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveParentCommunication' && payload) {
      payload.schoolId = effectiveSchoolId;
      upsertRecord(schoolSs, SHEETS.PARENT_COMMUNICATIONS, 'id', payload);
      output.message = 'تم تسجيل محضر التواصل بنجاح';
      return createJsonResponse(output, 200);
    }

    // T. Settings & Audit (School-Scoped strictly to schoolSs)
    if (action === 'getSettings') {
      output.data = getSettingsDataClean(schoolSs);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveSettings' && payload) {
      saveSettingsDataClean(schoolSs, payload);
      output.message = 'تم حفظ إعدادات المدرسة بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'getAuditLogs') {
      output.data = getSheetData(schoolSs, SHEETS.AUDIT_LOGS);
      return createJsonResponse(output, 200);
    }

    if (action === 'addAuditLog' && payload) {
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, payload.action || 'CUSTOM', payload.entity || 'SYSTEM', payload.targetId || '', payload.details || '');
      output.message = 'تم قيد العملية في سجل الرقابة';
      return createJsonResponse(output, 200);
    }

    // U. User Management (Strictly scoped via Central USERS sheet & School Isolation)
    if (action === 'getUsers' || action === 'adminGetUsers') {
      output.data = getSanitizedUsersList(ss, activeSession);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveUser' && payload) {
      var targetRoleRaw = String(payload.role || '').trim();
      var existingUsers = getSheetData(ss, SHEETS.USERS);
      var existingUser = null;
      var targetId = payload.id ? String(payload.id).trim() : '';
      var targetUsername = payload.username ? String(payload.username).trim().toLowerCase() : '';

      for (var eu = 0; eu < existingUsers.length; eu++) {
        var euId = String(existingUsers[eu].id || '').trim();
        var euUser = String(existingUsers[eu].username || '').trim().toLowerCase();
        if ((targetId && euId === targetId) || (targetUsername && euUser === targetUsername)) {
          existingUser = existingUsers[eu];
          targetId = euId;
          break;
        }
      }

      // Dynamic authorization: new user requires users.create; edit requires users.edit
      var requiredPermission = existingUser ? 'users.edit' : 'users.create';
      if (!hasEffectivePermissionGas(activeSession, requiredPermission)) {
        return createJsonResponse({
          status: 'error',
          code: 'ROLE_PERMISSION_DENIED',
          message: 'ليس لديك صلاحية ' + requiredPermission + ' لتنفيذ هذا الإجراء',
          requestId: requestId
        }, 403);
      }

      // Validate target role (derive from canonical roles)
      var targetRole = normalizeUserRoleGas(targetRoleRaw || (existingUser ? existingUser.role : ''));
      if (!targetRole) {
        return createJsonResponse({
          status: 'error',
          code: 'INVALID_ROLE',
          message: 'الدور المحدد غير صالح: ' + targetRoleRaw,
          requestId: requestId
        }, 400);
      }
      payload.role = targetRole;

      // If role is changed on an existing user, additionally require users.manageRoles
      if (existingUser && targetRole !== existingUser.role) {
        if (!hasEffectivePermissionGas(activeSession, 'users.manageRoles')) {
          return createJsonResponse({
            status: 'error',
            code: 'ROLE_PERMISSION_DENIED',
            message: 'تعديل دور المستخدم يتطلب صلاحية users.manageRoles',
            requestId: requestId
          }, 403);
        }
      }

      // Self-protection on edit
      if (existingUser) {
        var isSelf = (existingUser.id === activeSession.userId || 
                      String(existingUser.username || '').toLowerCase() === String(activeSession.username || '').toLowerCase());
        if (isSelf) {
          if (existingUser.role === 'SystemAdmin' && targetRole !== 'SystemAdmin') {
            return createJsonResponse({
              status: 'error',
              code: 'SELF_DEMOTION_DENIED',
              message: 'لا يمكن لمدير النظام تجريد نفسه من صلاحية مدير النظام',
              requestId: requestId
            }, 403);
          }
          if (payload.status && String(payload.status).toLowerCase() !== 'active') {
            return createJsonResponse({
              status: 'error',
              code: 'SELF_DISABLE_DENIED',
              message: 'لا يمكن تعطيل الحساب الحالي المستخدم في الجلسة',
              requestId: requestId
            }, 403);
          }
        }
      }

      // Role boundaries & School scoping
      if (authenticatedRole === 'SchoolAdmin') {
        if (existingUser) {
          if (existingUser.role === 'SystemAdmin') {
            return createJsonResponse({
              status: 'error',
              code: 'FORBIDDEN',
              message: 'غير مصرح بتعديل حساب مدير نظام عام',
              requestId: requestId
            }, 403);
          }
          if (existingUser.schoolId && String(existingUser.schoolId).trim().toUpperCase() !== String(effectiveSchoolId).trim().toUpperCase()) {
            return createJsonResponse({
              status: 'error',
              code: 'CROSS_SCHOOL_ACCESS_DENIED',
              message: 'غير مصرح بتعديل مستخدم ينتمي لمدرسة أخرى',
              requestId: requestId
            }, 403);
          }
        }
        if (targetRole === 'SystemAdmin') {
          return createJsonResponse({
            status: 'error',
            code: 'ROLE_ESCALATION_DENIED',
            message: 'لا يمكن لمدير المدرسة إنشاء أو ترقية مستخدم إلى مدير نظام عام (SystemAdmin)',
            requestId: requestId
          }, 403);
        }
        // Force school to actor's school
        payload.schoolId = effectiveSchoolId;
        payload.allowedSchoolIds = [effectiveSchoolId];
      } else if (authenticatedRole === 'SystemAdmin') {
        var actorAllowedList = (activeSession.allowedSchoolIds || []).map(function(id) { return String(id).trim().toUpperCase(); });

        if (targetRole === 'SystemAdmin') {
          payload.schoolId = '';
          payload.employeeId = '';
          var allowedSource = payload.allowedSchoolIds !== undefined
            ? payload.allowedSchoolIds
            : (existingUser ? existingUser.allowedSchoolIds : []);
          var parsedAllowed = parseAllowedSchoolIdsGas(allowedSource);
          var mSchools = getSheetData(ss, SHEETS.MASTER_SCHOOLS);
          var mIds = mSchools.map(function(s) { return String(s.schoolId || '').trim().toUpperCase(); });

          for (var paI = 0; paI < parsedAllowed.length; paI++) {
            var chkId = parsedAllowed[paI];
            if (mIds.indexOf(chkId) === -1) {
              return createJsonResponse({
                status: 'error',
                code: 'INVALID_SCHOOL_ID',
                message: 'المدرسة المحددة غير مسجلة في النظام: ' + chkId,
                requestId: requestId
              }, 400);
            }
            if (actorAllowedList.indexOf(chkId) === -1) {
              return createJsonResponse({
                status: 'error',
                code: 'ACCESS_DENIED_SCHOOL_SCOPE',
                message: 'لا يمكن منح صلاحية لمدارس خارج نطاق صلاحيات مدير النظام الحالي: ' + chkId,
                requestId: requestId
              }, 403);
            }
          }
          payload.allowedSchoolIds = parsedAllowed;
        } else {
          // School-scoped user
          var targetSchId = String(payload.schoolId !== undefined ? payload.schoolId : (existingUser ? existingUser.schoolId : '')).trim().toUpperCase();
          if (!targetSchId) {
            return createJsonResponse({
              status: 'error',
              code: 'SCHOOL_REQUIRED',
              message: 'يجب تحديد المدرسة للمستخدم',
              requestId: requestId
            }, 400);
          }
          var allMSchools = getSheetData(ss, SHEETS.MASTER_SCHOOLS);
          var allMIds = allMSchools.map(function(s) { return String(s.schoolId || '').trim().toUpperCase(); });
          if (allMIds.indexOf(targetSchId) === -1) {
            return createJsonResponse({
              status: 'error',
              code: 'INVALID_SCHOOL_ID',
              message: 'المدرسة المحددة غير مسجلة في النظام: ' + targetSchId,
              requestId: requestId
            }, 400);
          }
          if (actorAllowedList.indexOf(targetSchId) === -1) {
            return createJsonResponse({
              status: 'error',
              code: 'ACCESS_DENIED_SCHOOL_SCOPE',
              message: 'المدرسة المحددة للمستخدم خارج نطاق المدارس المصرح لك بها',
              requestId: requestId
            }, 403);
          }
          if (existingUser && existingUser.schoolId && actorAllowedList.indexOf(String(existingUser.schoolId).trim().toUpperCase()) === -1) {
            return createJsonResponse({
              status: 'error',
              code: 'ACCESS_DENIED_SCHOOL_SCOPE',
              message: 'المستخدم ينتمي لمدرسة خارج نطاق الصلاحيات المصرح لك بها',
              requestId: requestId
            }, 403);
          }
          payload.schoolId = targetSchId;
          payload.allowedSchoolIds = [targetSchId];
        }
      }

      // School transfer immutability on existing user
      if (existingUser && existingUser.schoolId) {
        var existSch = String(existingUser.schoolId).trim().toUpperCase();
        var reqSch = payload.schoolId !== undefined ? String(payload.schoolId || '').trim().toUpperCase() : '';
        if (reqSch && reqSch !== existSch) {
          return createJsonResponse({
            status: 'error',
            code: 'USER_SCHOOL_IMMUTABLE',
            message: 'لا يمكن نقل المستخدم بين المدارس مباشرة',
            requestId: requestId
          }, 400);
        }
      }

      // Email validation & immutability
      var rawEmail = payload.email !== undefined ? normalizeEmail(payload.email) : '';
      var isAdministrativeUser = (targetRole !== 'Teacher');
      if (!existingUser) {
        if (isAdministrativeUser && !rawEmail) {
          return createJsonResponse({
            status: 'error',
            code: 'EMAIL_REQUIRED',
            message: 'البريد الإلكتروني مطلوب لإنشاء مستخدم جديد',
            requestId: requestId
          }, 400);
        }
        if (rawEmail) {
          if (!isValidEmailFormat(rawEmail)) {
            return createJsonResponse({
              status: 'error',
              code: 'INVALID_EMAIL',
              message: 'صيغة البريد الإلكتروني غير صالحة',
              requestId: requestId
            }, 400);
          }
          for (var emIdx = 0; emIdx < existingUsers.length; emIdx++) {
            var emCheck = normalizeEmail(existingUsers[emIdx].email);
            if (emCheck && emCheck === rawEmail) {
              return createJsonResponse({
                status: 'error',
                code: 'DUPLICATE_ACCOUNT_EMAIL',
                message: 'البريد الإلكتروني مستخدم بالفعل لحساب آخر',
                requestId: requestId
              }, 400);
            }
          }
        }
        payload.email = rawEmail;
      } else {
        var existingEmail = normalizeEmail(existingUser.email);
        if (existingEmail && rawEmail && rawEmail !== existingEmail) {
          return createJsonResponse({
            status: 'error',
            code: 'USER_EMAIL_IMMUTABLE',
            message: 'لا يمكن تعديل البريد الإلكتروني للحساب بعد إنشائه',
            requestId: requestId
          }, 400);
        }
        payload.email = existingEmail || rawEmail;
      }

      // Derive accessScope from role
      var derivedScope = deriveUserAccessScopeGas(targetRole);
      payload.accessScope = derivedScope;

      // Check if status is transitioning to inactive/suspended
      var oldStatus = existingUser ? String(existingUser.status || 'Active') : 'Active';
      var newStatus = String(payload.status || (existingUser ? existingUser.status : 'Active'));
      if (existingUser && oldStatus === 'Active' && newStatus !== 'Active') {
        revokeAllUserSessions(ss, existingUser.id);
      }

      var savedUser = saveUserSecure(ss, payload, authenticatedUsername, requestId);

      var auditEvent = 'USER_CREATED';
      if (existingUser) {
        if (targetRole !== existingUser.role) {
          auditEvent = 'USER_ROLE_CHANGED';
        } else if (newStatus !== oldStatus) {
          auditEvent = 'USER_STATUS_CHANGED';
        } else {
          auditEvent = 'USER_UPDATED';
        }
      }

      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, auditEvent, 'USERS', savedUser.id || payload.username || '', 'حفظ حساب مستخدم: ' + targetRole);

      output.message = 'تم حفظ حساب المستخدم بنجاح';
      output.user = savedUser;
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteUser' && payload && payload.id) {
      var checkTarget = verifyTargetUserAccess(ss, activeSession, payload.id);
      if (!checkTarget.allowed) {
        return createJsonResponse({
          status: 'error',
          code: checkTarget.code,
          message: checkTarget.message,
          requestId: requestId
        }, 403);
      }
      var targetUser = checkTarget.targetUser;
      if (targetUser && (targetUser.id === activeSession.userId || 
          String(targetUser.username || '').toLowerCase() === String(activeSession.username || '').toLowerCase())) {
        return createJsonResponse({
          status: 'error',
          code: 'SELF_DELETION_DENIED',
          message: 'لا يمكن حذف الحساب الحالي المستخدم في الجلسة',
          requestId: requestId
        }, 403);
      }
      revokeAllUserSessions(ss, payload.id);
      deleteRecord(ss, SHEETS.USERS, 'id', payload.id);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'USER_DELETED', 'USERS', payload.id, 'حذف حساب مستخدم');
      output.message = 'تم حذف حساب المستخدم بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'resetUserPassword' && payload) {
      var checkTarget = verifyTargetUserAccess(ss, activeSession, payload.userId);
      if (!checkTarget.allowed) {
        return createJsonResponse({
          status: 'error',
          code: checkTarget.code,
          message: checkTarget.message,
          requestId: requestId
        }, 403);
      }
      var resetRes = resetUserPasswordSecure(ss, payload.userId, payload.newPassword, authenticatedUsername, requestId);
      if (!resetRes.success) {
        return createJsonResponse({
          status: 'error',
          code: resetRes.code || 'RESET_FAILED',
          message: resetRes.message,
          requestId: requestId
        }, 400);
      }
      revokeAllUserSessions(ss, payload.userId);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'USER_PASSWORD_RESET', 'USERS', payload.userId, 'إعادة تعيين كلمة مرور مستخدم');
      output.message = resetRes.message;
      return createJsonResponse(output, 200);
    }

    if (action === 'issueUserActivationToken' && payload) {
      var checkTarget = verifyTargetUserAccess(ss, activeSession, payload.userId);
      if (!checkTarget.allowed) {
        return createJsonResponse({
          status: 'error',
          code: checkTarget.code,
          message: checkTarget.message,
          requestId: requestId
        }, 403);
      }
      var tokenRes = issueUserActivationTokenSecure(ss, payload.userId, authenticatedUsername, requestId);
      if (!tokenRes.success) {
        return createJsonResponse({
          status: 'error',
          code: 'TOKEN_ISSUE_FAILED',
          message: tokenRes.message,
          requestId: requestId
        }, 400);
      }
      output.message = tokenRes.message;
      output.loginNumber = tokenRes.loginNumber;
      output.activationToken = tokenRes.activationToken;
      output.expiresAt = tokenRes.expiresAt;
      return createJsonResponse(output, 200);
    }

    if (action === 'revokeUserSessions' && payload && payload.userId) {
      var checkTarget = verifyTargetUserAccess(ss, activeSession, payload.userId);
      if (!checkTarget.allowed) {
        return createJsonResponse({
          status: 'error',
          code: checkTarget.code,
          message: checkTarget.message,
          requestId: requestId
        }, 403);
      }
      revokeAllUserSessions(ss, payload.userId);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'USER_SESSIONS_REVOKED', 'USERS', payload.userId, 'إلغاء جميع جلسات المستخدم');
      output.message = 'تم إلغاء جميع جلسات العمل النشطة للمستخدم بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'toggleUserStatus' && payload && payload.userId) {
      var checkTarget = verifyTargetUserAccess(ss, activeSession, payload.userId);
      if (!checkTarget.allowed) {
        return createJsonResponse({
          status: 'error',
          code: checkTarget.code,
          message: checkTarget.message,
          requestId: requestId
        }, 403);
      }
      var targetUser = checkTarget.targetUser;
      if (targetUser && (targetUser.id === activeSession.userId || 
          String(targetUser.username || '').toLowerCase() === String(activeSession.username || '').toLowerCase())) {
        var currentStatus = targetUser.status || 'Active';
        var nextStatus = payload.status || (currentStatus === 'Active' ? 'Suspended' : 'Active');
        if (nextStatus !== 'Active') {
          return createJsonResponse({
            status: 'error',
            code: 'SELF_DISABLE_DENIED',
            message: 'لا يمكن تعطيل الحساب الحالي المستخدم في الجلسة',
            requestId: requestId
          }, 403);
        }
      }
      var statusRes = toggleUserStatusSecure(ss, payload.userId, payload.status);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'USER_STATUS_CHANGED', 'USERS', payload.userId, 'تعديل حالة حساب المستخدم إلى ' + statusRes.status);
      output.message = statusRes.message;
      output.status = statusRes.status;
      return createJsonResponse(output, 200);
    }

    // V. Authenticated POST Data Sync (Strictly isolated to school operational spreadsheet: schoolSs)
    if (action === 'syncData') {
      output.data = {
        students: getSheetData(schoolSs, SHEETS.STUDENTS),
        employees: getSheetData(schoolSs, SHEETS.EMPLOYEES).map(function(e) {
          var clean = Object.assign({}, e);
          delete clean.basicSalary;
          delete clean.allowances;
          return clean;
        }),
        schedule: getSheetData(schoolSs, SHEETS.SCHEDULE),
        scheduleBreaks: getSheetData(schoolSs, SHEETS.SCHEDULE_BREAKS),
        teacherAssignments: getSheetData(schoolSs, SHEETS.TEACHER_TEACHING_ASSIGNMENTS),
        substitutions: getSheetData(schoolSs, SHEETS.RESERVE_ASSIGNMENTS),
        supervisionLocations: getSheetData(schoolSs, SHEETS.SUPERVISION_LOCATIONS),
        supervisionAssignments: getSheetData(schoolSs, SHEETS.SUPERVISION_ASSIGNMENTS),
        teacherAvailability: getSheetData(schoolSs, SHEETS.TEACHER_AVAILABILITY),
        homeworks: getSheetData(schoolSs, SHEETS.HOMEWORK),
        teacherResources: getSheetData(schoolSs, SHEETS.TEACHER_RESOURCES),
        examSchedules: getSheetData(schoolSs, SHEETS.EXAM_SCHEDULES),
        academicYears: getSheetData(schoolSs, SHEETS.ACADEMIC_YEARS),
        studentAttendance: getSheetData(schoolSs, SHEETS.STUDENT_ATTENDANCE),
        employeeAttendance: getSheetData(schoolSs, SHEETS.ATTENDANCE),
        leaves: getSheetData(schoolSs, SHEETS.LEAVES),
        permissions: getSheetData(schoolSs, SHEETS.PERMISSIONS),
        settings: getSettingsDataClean(schoolSs)
      };
      return createJsonResponse(output, 200);
    }

    // W. Timetable Import Commit (Strictly isolated to school operational spreadsheet: schoolSs)
    if (action === 'commitTimetableImport' && payload) {
      var importRes = commitTimetableImportBatch(schoolSs, payload.rows, payload.batchFingerprint, authenticatedUsername, effectiveSchoolId);
      if (!importRes.success) {
        return createJsonResponse({
          status: 'error',
          code: importRes.code || 'IMPORT_FAILED',
          message: importRes.message,
          errors: importRes.errors,
          requestId: requestId
        }, 400);
      }
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'IMPORT', 'SCHEDULE', payload.batchFingerprint || '', 'استيراد واعتماد جدول دراسي');
      output.message = importRes.message;
      output.importedCount = importRes.importedCount;
      return createJsonResponse(output, 200);
    }

    // X. Server-Side Archive & Scope Snapshot (Strictly isolated to school operational spreadsheet: schoolSs)
    if (action === 'createArchiveSnapshot') {
      var archiveReceipt = executeServerSideArchive(schoolSs, authenticatedUsername, requestId);
      recordAuthoritativeAudit(schoolSs, requestId, authenticatedUsername, authenticatedRole, 'ARCHIVE', 'OPERATIONAL_SNAPSHOT', '', 'أرشفة وتجميد الجداول التشغيلية للمدرسة');
      output.message = 'تم أرشفة وتجميد الجداول الملغاة وحفظ إيصال الأرشفة بنجاح';
      output.archiveReceipt = archiveReceipt;
      return createJsonResponse(output, 200);
    }

    // Unknown action
    return createJsonResponse({
      status: 'error',
      code: 'UNKNOWN_ACTION',
      message: 'الإجراء المطلوب غير معروف أو تم إيقافه: ' + action,
      requestId: requestId
    }, 404);

  } catch (err) {
    return createJsonResponse({
      status: 'error',
      code: 'INTERNAL_SERVER_ERROR',
      message: err.toString(),
      requestId: requestId
    }, 500);
  }
}

// -------------------------------------------------------------
// CORE AUTHENTICATION & SECURITY IMPLEMENTATION
// -------------------------------------------------------------

/**
 * Normalizes email address: String(value || '').trim().toLowerCase()
 */
function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Validates email format according to standard pattern
 */
function isValidEmailFormat(email) {
  if (!email || typeof email !== 'string') return false;
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Helper to safely parse allowedSchoolIds array from account field
 */
function parseAllowedSchoolIdsGas(rawAllowed) {
  var list = [];
  if (Array.isArray(rawAllowed)) {
    list = rawAllowed;
  } else if (typeof rawAllowed === 'string' && rawAllowed.trim()) {
    try {
      var parsed = JSON.parse(rawAllowed);
      if (Array.isArray(parsed)) list = parsed;
      else list = [String(parsed)];
    } catch (e) {
      list = rawAllowed.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    }
  }
  return list.map(function(s) { return String(s).trim().toUpperCase(); }).filter(Boolean);
}

/**
 * Handle staff login with email-only identifier, salted PBKDF2/HMAC verification,
 * and authoritative server-derived school context & access scope.
 */
function handleStaffLogin(masterSs, normalizedEmail, inputPassword, requestId) {
  if (!normalizedEmail || !inputPassword) {
    return { success: false, code: 'CREDENTIALS_REQUIRED', message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' };
  }

  ensureProductionStaffSheetsExist(masterSs);
  var masterUsersSheet = masterSs.getSheetByName(SHEETS.USERS);
  if (masterUsersSheet) {
    ensureHeaderColumn(masterUsersSheet, 'email');
    ensureHeaderColumn(masterUsersSheet, 'schoolId');
    ensureHeaderColumn(masterUsersSheet, 'allowedSchoolIds');
    ensureHeaderColumn(masterUsersSheet, 'employeeId');
  }

  var masterUsers = getSheetData(masterSs, SHEETS.USERS);
  if (!masterUsers || masterUsers.length === 0) {
    recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, '', 'LOGIN_FAILED', 'AUTH', '', 'قاعدة بيانات المستخدمين فارغة');
    return {
      success: false,
      code: 'DATABASE_EMPTY',
      message: 'قاعدة بيانات المستخدمين فارغة. يرجى تهيئة حساب مدير النظام.'
    };
  }

  // 1. Central Master USERS Lookup by Normalized Email
  var matchedAccounts = [];
  for (var i = 0; i < masterUsers.length; i++) {
    var u = masterUsers[i];
    var uEmail = normalizeEmail(u.email);
    if (uEmail && uEmail === normalizedEmail) {
      matchedAccounts.push({ user: u, rowIndex: i + 2 });
    }
  }

  // Outcome 0: No account matched (Fail-Closed)
  // Legacy account without email must be flagged by authenticated/admin user-management tooling as ACCOUNT_EMAIL_SETUP_REQUIRED / Needs Setup.
  // Do not attempt username fallback during public login to prevent account enumeration.
  if (matchedAccounts.length === 0) {
    recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, '', 'LOGIN_FAILED', 'AUTH', '', 'محاولة تسجيل دخول لبريد غير مسجل');
    return {
      success: false,
      code: 'INVALID_CREDENTIALS',
      message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
    };
  }

  // Outcome > 1: Duplicate accounts with same email (Fail-Closed)
  if (matchedAccounts.length > 1) {
    recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, '', 'LOGIN_FAILED', 'AUTH', '', 'تكرار البريد الإلكتروني في عدة حسابات (Fail-Closed)');
    return {
      success: false,
      code: 'DUPLICATE_ACCOUNT_EMAIL',
      message: 'تم العثور على أكثر من حساب مرتبط بهذا البريد الإلكتروني. يرجى مراجعة إدارة النظام لفك التكرار.'
    };
  }

  var matchedUser = matchedAccounts[0].user;
  var userRowIndex = matchedAccounts[0].rowIndex;

  // 2. Missing Email check (Never invent email for legacy accounts)
  if (!matchedUser.email || !normalizeEmail(matchedUser.email)) {
    recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, matchedUser.role || '', 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'الحساب يفتقر لبريد إلكتروني');
    return {
      success: false,
      code: 'ACCOUNT_EMAIL_SETUP_REQUIRED',
      message: 'الحساب بحاجة لربط وتوثيق بريد إلكتروني معتمد قبل تسجيل الدخول.'
    };
  }

  // 3. Staff-Only Role Enforcement: Block Teacher, Parent, Student from staff ERP login
  var role = String(matchedUser.role || '').trim();
  if (role === 'Teacher' || role === 'Parent' || role === 'Student') {
    recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, role, 'LOGIN_BLOCKED', 'AUTH', matchedUser.id || '', 'محاولة دخول بحساب دور ملغى من بوابة الموظفين (' + role + ')');
    return {
      success: false,
      code: 'ACCOUNT_ROLE_NOT_ALLOWED',
      message: 'حسابات المعلمين المستقلة وأولياء الأمور والطلاب لا تسجل الدخول من هنا. الدخول مخصص لموظفي الإدارة المعتمدين فقط.'
    };
  }

  // 4. Account Status Check
  var status = String(matchedUser.status || 'Active').trim().toLowerCase();
  var isActive = (matchedUser.isActive === true || matchedUser.isActive === 'true' || matchedUser.isActive === undefined);
  if (status === 'inactive' || status === 'disabled' || !isActive) {
    recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, role, 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'حساب غير مفعل');
    return { success: false, code: 'ACCOUNT_INACTIVE', message: 'هذا الحساب غير مفعل حالياً. يرجى مراجعة مدير النظام.' };
  }

  if (status === 'needs setup' || (!matchedUser.passwordHash && !matchedUser.password)) {
    recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, role, 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'حساب بحاجة لتهيئة كلمة المرور');
    return {
      success: false,
      code: 'ACCOUNT_NEEDS_SETUP',
      message: 'الحساب بحاجة لتعيين كلمة مرور بواسطة إدارة النظام قبل تسجيل الدخول.'
    };
  }

  // 5. Salted Password Verification (PBKDF2-HMAC-SHA256 / SHA-256 upgrade)
  var storedHash = String(matchedUser.passwordHash || matchedUser.password || '').trim();
  var storedSalt = String(matchedUser.passwordSalt || '').trim();
  var storedIter = parseInt(matchedUser.passwordIterations || '10000', 10);
  var passwordValid = false;

  if (storedSalt) {
    var computedHash = computeSaltedHash(inputPassword, storedSalt, storedIter);
    passwordValid = (computedHash === storedHash);
  } else {
    var inputSha256 = hashStringSHA256(inputPassword);
    if (storedHash === inputSha256) {
      passwordValid = true;
      try {
        var newSalt = Utilities.getUuid().replace(/-/g, '');
        var newHash = computeSaltedHash(inputPassword, newSalt, PBKDF2_ITERATIONS);
        updateUserPasswordColumns(masterSs, userRowIndex, newHash, newSalt, 'PBKDF2-HMAC-SHA256', PBKDF2_ITERATIONS);
      } catch (upgradeErr) {}
    }
  }

  if (!passwordValid) {
    recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, role, 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'محاولة تسجيل دخول بكلمة مرور خاطئة');
    return { success: false, code: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' };
  }

  // 6. Server-Derived Role, AccessScope, and School Context
  var accessScope = 'SCHOOL';
  var boundSchoolId = '';
  var allowedSchoolIds = [];
  var activeSchoolId = '';
  var employeeId = matchedUser.employeeId ? String(matchedUser.employeeId).trim() : '';

  if (role === 'SystemAdmin') {
    accessScope = 'GLOBAL';
    // allowedSchoolIds strictly from user account - never automatically all Master_Schools
    allowedSchoolIds = parseAllowedSchoolIdsGas(matchedUser.allowedSchoolIds);
    if (allowedSchoolIds.length === 1) {
      activeSchoolId = allowedSchoolIds[0];
    } else {
      activeSchoolId = ''; // Undefined/empty until Phase 3C School Switcher
    }
    boundSchoolId = activeSchoolId;
  } else if (role === 'Admin') {
    // Legacy Admin: strictly SCHOOL scope
    accessScope = 'SCHOOL';
    var adminSchool = matchedUser.schoolId ? String(matchedUser.schoolId).trim().toUpperCase() : '';
    if (!adminSchool) {
      recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, role, 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'حساب مدير قديم بدون تحديد مدرسة (NEEDS_ADMIN_REVIEW)');
      return {
        success: false,
        code: 'NEEDS_ADMIN_REVIEW',
        message: 'حساب المدير القديم بحاجة لمراجعة وتحديد المدرسة التابع لها بواسطة مدير النظام.'
      };
    }
    boundSchoolId = adminSchool;
    allowedSchoolIds = [adminSchool];
    activeSchoolId = adminSchool;
  } else if (role === 'AdministrativeEmployee') {
    accessScope = 'SELF';
    var empSchool = matchedUser.schoolId ? String(matchedUser.schoolId).trim().toUpperCase() : '';
    if (!empSchool) {
      recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, role, 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'حساب موظف إداري بدون تحديد مدرسة (SCHOOL_CONTEXT_REQUIRED)');
      return {
        success: false,
        code: 'SCHOOL_CONTEXT_REQUIRED',
        message: 'الحساب غير مرتبط بمدرسة معتمدة.'
      };
    }
    if (!employeeId) {
      recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, role, 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'حساب موظف إداري بدون معرف موظف (SELF_IDENTITY_REQUIRED)');
      return {
        success: false,
        code: 'SELF_IDENTITY_REQUIRED',
        message: 'حساب الموظف الإداري غير مرتبط بملف موظف (employeeId).'
      };
    }
    boundSchoolId = empSchool;
    allowedSchoolIds = [empSchool];
    activeSchoolId = empSchool;
  } else {
    // SchoolAdmin, SchoolDirector, StudentAffairs, TeacherAffairs, QualityOfficer, TrainingOfficer, SocialSpecialist
    accessScope = 'SCHOOL';
    var schId = matchedUser.schoolId ? String(matchedUser.schoolId).trim().toUpperCase() : '';
    if (!schId) {
      recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, role, 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'حساب مدرسي بدون تحديد مدرسة (SCHOOL_CONTEXT_REQUIRED)');
      return {
        success: false,
        code: 'SCHOOL_CONTEXT_REQUIRED',
        message: 'الحساب غير مرتبط بمدرسة معتمدة.'
      };
    }
    boundSchoolId = schId;
    allowedSchoolIds = [schId];
    activeSchoolId = schId;
  }

  // 7. Validate School Existence & Active Status if bound to a school
  if (boundSchoolId) {
    var schoolCtx = resolveSchoolContext(boundSchoolId, masterSs);
    if (!schoolCtx) {
      recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, role, 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'مدرسة المستخدم غير مسجلة: ' + boundSchoolId);
      return {
        success: false,
        code: 'SCHOOL_NOT_FOUND',
        message: 'المدرسة المحددة للمستخدم غير مسجلة في النظام.'
      };
    }
    if (String(schoolCtx.status || 'Active').trim() !== 'Active') {
      recordAuthoritativeAudit(masterSs, requestId, normalizedEmail, role, 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'مدرسة المستخدم غير مفعلة: ' + boundSchoolId);
      return {
        success: false,
        code: 'SCHOOL_INACTIVE',
        message: 'المدرسة التابع لها المستخدم غير مفعلة حالياً.'
      };
    }
  }

  // 8. Issue Authoritative Server-Side Session Token
  var sessionToken = generateSecureRandomToken(48);
  var tokenHash = hashStringSHA256(sessionToken);
  var now = new Date();
  var expiresAt = new Date(now.getTime() + (SESSION_DURATION_HOURS * 60 * 60 * 1000));
  var nowStr = now.toISOString();
  var expiresStr = expiresAt.toISOString();

  var sessionRecord = {
    sessionId: 'SESS_' + Utilities.getUuid().substring(0, 10),
    tokenHash: tokenHash,
    userId: matchedUser.id,
    username: matchedUser.username || '',
    fullName: matchedUser.fullName,
    role: role,
    schoolId: (role === 'SystemAdmin' && allowedSchoolIds.length > 1) ? '' : (boundSchoolId || ''),
    email: normalizedEmail,
    accessScope: accessScope,
    allowedSchoolIds: JSON.stringify(allowedSchoolIds),
    activeSchoolId: activeSchoolId || '',
    employeeId: employeeId || '',
    createdAt: nowStr,
    expiresAt: expiresStr,
    status: 'ACTIVE'
  };

  var sessionsSheet = masterSs.getSheetByName(SHEETS.SESSIONS);
  if (sessionsSheet) {
    ensureSessionHeaders(sessionsSheet);
    appendRecordByHeaders(sessionsSheet, sessionRecord);
  }

  if (boundSchoolId) {
    try {
      var targetSchoolSs = getSchoolSpreadsheet(boundSchoolId, masterSs);
      if (targetSchoolSs && targetSchoolSs.getId() !== masterSs.getId()) {
        var schoolSessions = targetSchoolSs.getSheetByName(SHEETS.SESSIONS);
        if (schoolSessions) {
          ensureSessionHeaders(schoolSessions);
          appendRecordByHeaders(schoolSessions, sessionRecord);
        }
      }
    } catch (sErr) {}
  }

  // 9. Update lastLogin in Master Users sheet
  try {
    var usersSheet = masterSs.getSheetByName(SHEETS.USERS);
    var headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
    var lastLoginCol = headers.indexOf('lastLogin') + 1;
    if (lastLoginCol > 0 && userRowIndex > 0) {
      usersSheet.getRange(userRowIndex, lastLoginCol).setValue(nowStr);
    }
  } catch (uErr) {}

  // 10. Security Audit: Safe event without password, hash, salt, or sessionToken
  recordAuthoritativeAudit(
    masterSs,
    requestId,
    normalizedEmail,
    role,
    'LOGIN_SUCCESS',
    'AUTH',
    matchedUser.id,
    'تسجيل دخول ناجح وإنشاء جلسة عمل معتمدة. نطاق: ' + accessScope + '، مدرسة: ' + (boundSchoolId || 'GLOBAL')
  );

  // 11. Safe User DTO (No secrets or spreadsheetId)
  var sanitizedUser = {
    id: matchedUser.id,
    email: normalizedEmail,
    fullName: matchedUser.fullName,
    role: role,
    accessScope: accessScope,
    schoolId: boundSchoolId || '',
    activeSchoolId: activeSchoolId || '',
    allowedSchoolIds: allowedSchoolIds,
    employeeId: employeeId || '',
    department: String(matchedUser.department || ''),
    lastLogin: nowStr
  };

  return {
    success: true,
    sessionToken: sessionToken,
    expiresAt: expiresStr,
    user: sanitizedUser
  };
}

/**
 * Handle Teacher Portal Login (School + Username / Teacher Code + Password -> Teacher Session Token)
 * Strictly password-based (PIN retired via MIG_SCOPE_013_RETIRE_TEACHER_PIN)
 */
function handleTeacherLogin(masterSs, usernameOrCode, password, requestId, schoolId) {
  var cleanInput = String(usernameOrCode || '').trim();
  var inputPassword = String(password || '').trim();

  if (!cleanInput || !inputPassword) {
    return { success: false, code: 'INVALID_CREDENTIALS', message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  }

  var targetSchoolId = schoolId ? String(schoolId).trim().toUpperCase() : '';
  if (!targetSchoolId) {
    return { success: false, code: 'SCHOOL_ID_REQUIRED', message: 'يرجى تحديد المدرسة لتسجيل الدخول.' };
  }
  var schoolCtx = resolveSchoolContext(targetSchoolId, masterSs);
  if (!schoolCtx) {
    return { success: false, code: 'SCHOOL_NOT_FOUND', message: 'المدرسة المحددة غير مسجلة في النظام.' };
  }
  if (String(schoolCtx.status || 'Active').trim() !== 'Active') {
    return { success: false, code: 'SCHOOL_INACTIVE', message: 'المدرسة المحددة غير مفعلة حالياً.' };
  }

  var targetSs = getSchoolSpreadsheet(targetSchoolId, masterSs);
  var lowerInput = cleanInput.toLowerCase();
  var upperInput = cleanInput.toUpperCase();

  var credentials = getSheetData(targetSs, SHEETS.TEACHER_CREDENTIALS);
  var cred = null;
  for (var j = 0; j < credentials.length; j++) {
    var c = credentials[j];
    var cUser = String(c.username || '').trim().toLowerCase();
    var cNorm = String(c.usernameNormalized || '').trim().toLowerCase();
    var cCode = String(c.teacherCode || '').trim().toUpperCase();
    var cEmp = String(c.employeeId || c.teacherId || '').trim();

    if (cUser === lowerInput || cNorm === lowerInput || cCode === upperInput || cEmp === cleanInput) {
      cred = c;
      break;
    }
  }

  // If found in Teacher_Credentials, use credential record
  if (cred) {
    // Check lockout
    if (cred.lockedUntil) {
      var lockTime = new Date(cred.lockedUntil).getTime();
      if (lockTime > new Date().getTime()) {
        recordAuthoritativeAudit(targetSs, requestId, cleanInput, 'Teacher', 'TEACHER_LOGIN_BLOCKED', 'TEACHER_CREDENTIALS', cred.employeeId || cred.teacherId || '', 'محاولة دخول بحساب مجمد مؤقتاً');
        return {
          success: false,
          code: 'ACCOUNT_TEMPORARILY_LOCKED',
          message: 'تم تجميد الحساب مؤقتاً لمدة 15 دقيقة بسبب تكرار المحاولات الخاطئة. يرجى المحاولة لاحقاً أو التواصل مع الإدارة.'
        };
      }
    }

    var credStatus = String(cred.status || cred.accountStatus || 'Active').trim().toLowerCase();
    if (credStatus === 'inactive' || credStatus === 'suspended' || credStatus === 'disabled') {
      return { success: false, code: 'TEACHER_INACTIVE', message: 'حساب المعلم غير نشط حالياً، يرجى مراجعة إدارة شؤون المعلمين' };
    }

    if (credStatus === 'needs setup' || !cred.passwordHash) {
      return { success: false, code: 'ACCOUNT_NEEDS_SETUP', message: 'حساب المعلم بحاجة لتعيين كلمة مرور بواسطة إدارة شؤون المعلمين' };
    }

    // Verify password ONLY (PIN system retired - no pinHash fallback allowed)
    var passwordValid = false;
    var storedHash = cred.passwordHash || '';
    var storedSalt = cred.passwordSalt || '';
    var storedIter = parseInt(cred.passwordIterations || PBKDF2_ITERATIONS, 10);

    if (storedSalt && storedHash) {
      var computedHash = computeSaltedHash(inputPassword, storedSalt, storedIter);
      if (computedHash === storedHash) {
        passwordValid = true;
      }
    }

    if (!passwordValid) {
      var failedCount = (parseInt(cred.failedLoginAttempts || 0, 10) || 0) + 1;
      cred.failedLoginAttempts = failedCount;
      if (failedCount >= 5) {
        cred.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      upsertRecord(targetSs, SHEETS.TEACHER_CREDENTIALS, 'employeeId', cred);

      recordAuthoritativeAudit(targetSs, requestId, cleanInput, 'Teacher', 'TEACHER_LOGIN_FAIL', 'TEACHER_CREDENTIALS', cred.employeeId || cred.teacherId || '', 'محاولة دخول معلم فاشلة');
      return { success: false, code: 'INVALID_CREDENTIALS', message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    // Login success: reset failed attempts
    cred.failedLoginAttempts = 0;
    cred.lockedUntil = '';
    cred.lastLoginAt = getCairoISOString();
    upsertRecord(targetSs, SHEETS.TEACHER_CREDENTIALS, 'employeeId', cred);

    // Retrieve employee info
    var employees = getSheetData(targetSs, SHEETS.EMPLOYEES);
    var targetEmpId = cred.employeeId || cred.teacherId;
    var teacher = employees.find(function(e) { return e.id === targetEmpId; });
    var teacherName = teacher ? teacher.name : (cred.username || 'المعلم');
    var teacherCode = teacher ? (teacher.teacherCode || teacher.id) : (cred.teacherCode || targetEmpId);

    var token = generateSecureRandomToken(48);
    var tokenHash = hashStringSHA256(token);
    var now = new Date();
    var expiresAt = new Date(now.getTime() + (TEACHER_SESSION_DURATION_HOURS * 60 * 60 * 1000));
    var nowStr = now.toISOString();
    var expiresStr = expiresAt.toISOString();

    var teacherSessionRecord = {
      sessionId: 'TSESS_' + Utilities.getUuid().substring(0, 10),
      tokenHash: tokenHash,
      teacherId: targetEmpId,
      employeeId: targetEmpId,
      teacherCode: teacherCode,
      teacherName: teacherName,
      schoolId: targetSchoolId,
      createdAt: nowStr,
      expiresAt: expiresStr,
      status: 'ACTIVE'
    };

    var tSheet = targetSs.getSheetByName(SHEETS.TEACHER_SESSIONS);
    if (tSheet) {
      ensureTeacherSessionHeaders(tSheet);
      appendRecordByHeaders(tSheet, teacherSessionRecord);
    }
    if (masterSs.getId() !== targetSs.getId()) {
      var masterTSessions = masterSs.getSheetByName(SHEETS.TEACHER_SESSIONS);
      if (masterTSessions) {
        ensureTeacherSessionHeaders(masterTSessions);
        appendRecordByHeaders(masterTSessions, teacherSessionRecord);
      }
    }

    recordAuthoritativeAudit(targetSs, requestId, cred.username || teacherCode, 'Teacher', 'TEACHER_LOGIN_SUCCESS', 'TEACHER_AUTH', targetEmpId, 'تسجيل دخول معلم وإنشاء جلسة');

    return {
      success: true,
      teacherSessionToken: token,
      expiresAt: expiresStr,
      schoolId: targetSchoolId,
      mustChangePassword: cred.mustChangePassword === true || cred.mustChangePassword === 'true',
      teacher: {
        teacherId: targetEmpId,
        employeeId: targetEmpId,
        teacherCode: teacherCode,
        teacherName: teacherName,
        schoolId: targetSchoolId,
        department: (teacher && teacher.department) || 'الهيئة التعليمية',
        teachingSubjects: teacher && teacher.teachingSubjects ? (Array.isArray(teacher.teachingSubjects) ? teacher.teachingSubjects : String(teacher.teachingSubjects).split(',').map(function(s){return s.trim();})) : [],
        weeklyPeriodLimit: parseInt((teacher && teacher.weeklyPeriodLimit) || '30', 10)
      }
    };
  }

  return { success: false, code: 'INVALID_CREDENTIALS', message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
}

/**
 * Handle First Admin Bootstrap (Permanently Retired Route - Fails Closed)
 */
function handleFirstAdminBootstrap(ss, postData, requestId) {
  return {
    success: false,
    code: 'BOOTSTRAP_PUBLIC_ROUTE_RETIRED',
    message: 'تم إيقاف مسار التهيئة العامة للمسؤول الأول أمنياً. يتم تهيئة الحسابات الإدارية عبر القنوات الخادمة الموثوقة فقط.'
  };
}

/**
 * Handle Student Public Portal Access via Server-Hashed Token
 */
function handleStudentPublicPortalAccess(ss, rawToken, requestId) {
  if (!rawToken || rawToken.length < 16) {
    return { success: false, code: 'INVALID_TOKEN_FORMAT', message: 'رمز الوصول المقدم غير صالح' };
  }

  var tokenHash = hashStringSHA256(rawToken);
  var tokensSheet = ss.getSheetByName(SHEETS.STUDENT_ACCESS_TOKENS);
  if (!tokensSheet) {
    return { success: false, code: 'STORAGE_UNAVAILABLE', message: 'جدول رموز الوصول غير متاح' };
  }

  var tokens = getSheetData(ss, SHEETS.STUDENT_ACCESS_TOKENS);
  var matchedToken = null;
  var tokenRowIndex = -1;

  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i].tokenHash === tokenHash) {
      matchedToken = tokens[i];
      tokenRowIndex = i + 2;
      break;
    }
  }

  if (!matchedToken) {
    return { success: false, code: 'TOKEN_NOT_FOUND', message: 'رمز الوصول غير مسجل أو غير صحيح' };
  }

  var isActive = (matchedToken.status === 'ACTIVE' || matchedToken.isActive === true || matchedToken.isActive === 'true');
  if (!isActive || matchedToken.revokedAt) {
    return { success: false, code: 'TOKEN_REVOKED', message: 'تم إلغاء صلاحية هذا الرمز. يرجى مراجعة إدارة المدرسة للحصول على رمز جديد.' };
  }

  if (matchedToken.expiresAt) {
    var expDate = new Date(matchedToken.expiresAt);
    if (!isNaN(expDate.getTime()) && new Date() > expDate) {
      return { success: false, code: 'TOKEN_EXPIRED', message: 'انتهت صلاحية رمز الوصول' };
    }
  }

  // Find Student Record
  var students = getSheetData(ss, SHEETS.STUDENTS);
  var student = null;
  for (var s = 0; s < students.length; s++) {
    if (students[s].id === matchedToken.studentId || students[s].studentCode === matchedToken.studentCode) {
      student = students[s];
      break;
    }
  }

  if (!student) {
    return { success: false, code: 'STUDENT_RECORD_NOT_FOUND', message: 'تعذر العثور على سجل الطالب المرتبط' };
  }

  // Update lastAccessedAt in Student_Access_Tokens
  try {
    var headers = tokensSheet.getRange(1, 1, 1, tokensSheet.getLastColumn()).getValues()[0];
    var accessCol = headers.indexOf('lastAccessedAt') + 1;
    if (accessCol > 0 && tokenRowIndex > 0) {
      tokensSheet.getRange(tokenRowIndex, accessCol).setValue(getCairoISOString());
    }
  } catch (e) {}

  // SAFE STUDENT DTO (Explicitly strips nationalId, parentPhone, parentJob, behavior records)
  var safeStudent = {
    id: student.id,
    studentCode: student.studentCode,
    fullName: student.name,
    grade: student.grade,
    classroom: student.classroom
  };

  var classroom = student.classroom;

  // Filter ONLY Published Items for Student Portal
  var allSchedule = getSheetData(ss, SHEETS.SCHEDULE);
  var publishedSchedule = allSchedule.filter(function(item) {
    return (item.classroom === classroom || item.classroomId === classroom) &&
           String(item.status || '').toLowerCase() === 'published' &&
           item.isActive !== false;
  });

  var allHomework = getSheetData(ss, SHEETS.HOMEWORK);
  var publishedHomework = allHomework.filter(function(hw) {
    return (hw.classroom === classroom || hw.classroomId === classroom) &&
           String(hw.status || '').toLowerCase() === 'published';
  });

  var allExams = getSheetData(ss, SHEETS.EXAM_SCHEDULES);
  var publishedExams = allExams.filter(function(ex) {
    var matchClass = (!ex.classroomName || ex.classroomName === classroom || ex.classroomId === classroom);
    return matchClass && String(ex.status || '').toLowerCase() === 'published';
  });

  var allResources = getSheetData(ss, SHEETS.TEACHER_RESOURCES);
  var publishedResources = allResources.filter(function(res) {
    return (res.classroom === classroom || res.classroomId === classroom) &&
           String(res.visibility || '').toLowerCase() === 'published' &&
           res.studentResourceUrl;
  }).map(function(r) {
    return {
      id: r.id,
      title: r.title,
      topic: r.topic,
      subject: r.subject,
      classroom: r.classroom,
      studentResourceUrl: r.studentResourceUrl,
      presentationUrl: r.presentationUrl
    };
  });

  return {
    success: true,
    student: safeStudent,
    schedule: publishedSchedule,
    homework: publishedHomework,
    exams: publishedExams,
    resources: publishedResources
  };
}

/**
 * Validate Staff Session Token
 */
function validateSessionToken(ss, token) {
  if (!token) return { valid: false, code: 'TOKEN_MISSING', message: 'رمز الجلسة غير متوفر' };

  var tokenHash = hashStringSHA256(token);
  var sessions = getSheetData(ss, SHEETS.SESSIONS);
  var matched = null;
  var rowIndex = -1;

  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i].tokenHash === tokenHash) {
      matched = sessions[i];
      rowIndex = i + 2;
      break;
    }
  }

  if (!matched) {
    return { valid: false, code: 'SESSION_NOT_FOUND', message: 'جلسة العمل غير موجودة أو تم إلغاؤها' };
  }

  var status = String(matched.status || 'ACTIVE').toUpperCase();
  if (status !== 'ACTIVE') {
    return { valid: false, code: 'SESSION_REVOKED', message: 'جلسة العمل ملغاة (Revoked)' };
  }

  var expiresAtDate = new Date(matched.expiresAt);
  if (isNaN(expiresAtDate.getTime()) || new Date() > expiresAtDate) {
    try {
      var sheet = ss.getSheetByName(SHEETS.SESSIONS);
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var statusCol = headers.indexOf('status') + 1;
      if (statusCol > 0 && rowIndex > 0) {
        sheet.getRange(rowIndex, statusCol).setValue('EXPIRED');
      }
    } catch (e) {}
    return { valid: false, code: 'SESSION_EXPIRED', message: 'انتهت صلاحية جلسة العمل. يرجى تسجيل الدخول مجدداً.' };
  }

  // Look up user to verify active status and get employeeId
  var userActive = true;
  var userStatus = 'Active';
  var userEmployeeId = matched.employeeId || '';
  var userRecord = null;
  try {
    var users = getSheetData(ss, SHEETS.USERS);
    for (var uIdx = 0; uIdx < users.length; uIdx++) {
      if (String(users[uIdx].id || '') === String(matched.userId || '') || String(users[uIdx].username || '').toLowerCase() === String(matched.username || '').toLowerCase()) {
        userRecord = users[uIdx];
        userStatus = String(userRecord.status || 'Active');
        var isAct = userRecord.isActive;
        if (userStatus.toLowerCase() === 'inactive' || userStatus.toLowerCase() === 'suspended' || isAct === false || isAct === 'false') {
          userActive = false;
        }
        if (userRecord.employeeId) userEmployeeId = String(userRecord.employeeId).trim();
        break;
      }
    }
  } catch (uErr) {}

  var role = String(matched.role || (userRecord && userRecord.role) || '').trim();
  var accessScope = 'SCHOOL';
  var boundSchoolId = String((userRecord && userRecord.schoolId) || matched.schoolId || '').trim();
  var allowedSchoolIds = [];
  var activeSchoolId = '';

  if (role === 'SystemAdmin') {
    accessScope = 'GLOBAL';
    var userAllowedSchools = [];
    if (userRecord && userRecord.allowedSchoolIds) {
      if (Array.isArray(userRecord.allowedSchoolIds)) {
        userAllowedSchools = userRecord.allowedSchoolIds;
      } else if (typeof userRecord.allowedSchoolIds === 'string') {
        try {
          userAllowedSchools = JSON.parse(userRecord.allowedSchoolIds);
        } catch (e) {
          userAllowedSchools = userRecord.allowedSchoolIds.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        }
      }
    } else if (matched.allowedSchoolIds) {
      try {
        userAllowedSchools = typeof matched.allowedSchoolIds === 'string' ? JSON.parse(matched.allowedSchoolIds) : matched.allowedSchoolIds;
      } catch (e) {
        userAllowedSchools = String(matched.allowedSchoolIds).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      }
    }
    // Fail-Closed: only explicitly granted schools
    allowedSchoolIds = userAllowedSchools.map(function(s) { return String(s).trim(); }).filter(Boolean);

    var upperAllowed = allowedSchoolIds.map(function(s) { return String(s).trim().toUpperCase(); });
    var sessionActiveSchool = String(matched.activeSchoolId || '').trim().toUpperCase();

    if (sessionActiveSchool && upperAllowed.indexOf(sessionActiveSchool) !== -1) {
      activeSchoolId = sessionActiveSchool;
      boundSchoolId = sessionActiveSchool;
    } else if (allowedSchoolIds.length === 1) {
      activeSchoolId = allowedSchoolIds[0];
      boundSchoolId = allowedSchoolIds[0];
    } else {
      activeSchoolId = '';
      boundSchoolId = '';
    }
  } else if (role === 'AdministrativeEmployee') {
    accessScope = 'SELF';
    allowedSchoolIds = boundSchoolId ? [boundSchoolId] : [];
    activeSchoolId = boundSchoolId;
  } else {
    // SchoolAdmin, SchoolDirector, StudentAffairs, TeacherAffairs, QualityOfficer, TrainingOfficer, SocialSpecialist, Admin (Legacy)
    accessScope = 'SCHOOL';
    allowedSchoolIds = boundSchoolId ? [boundSchoolId] : [];
    activeSchoolId = boundSchoolId;
  }

  return {
    valid: true,
    session: {
      sessionId: matched.sessionId,
      sessionToken: token, // Attached in-memory for authorization pipeline
      userId: matched.userId,
      username: matched.username,
      fullName: matched.fullName,
      email: matched.email || (userRecord && userRecord.email) || '',
      role: role,
      accessScope: accessScope,
      schoolId: boundSchoolId,
      allowedSchoolIds: allowedSchoolIds,
      activeSchoolId: activeSchoolId,
      employeeId: userEmployeeId,
      isActive: userActive,
      status: userStatus,
      expiresAt: matched.expiresAt
    }
  };
}

/**
 * Validate Teacher Session Token
 */
function validateTeacherSessionToken(ss, token) {
  if (!token) return { valid: false, code: 'TOKEN_MISSING', message: 'رمز جلسة المعلم غير متوفر' };

  var tokenHash = hashStringSHA256(token);
  var sessions = getSheetData(ss, SHEETS.TEACHER_SESSIONS);
  var matched = null;

  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i].tokenHash === tokenHash) {
      matched = sessions[i];
      break;
    }
  }

  if (!matched || String(matched.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
    return { valid: false, code: 'TEACHER_SESSION_INVALID', message: 'جلسة المعلم غير صالحة أو منتهية' };
  }

  var expDate = new Date(matched.expiresAt);
  if (isNaN(expDate.getTime()) || new Date() > expDate) {
    return { valid: false, code: 'TEACHER_SESSION_EXPIRED', message: 'انتهت صلاحية جلسة المعلم' };
  }

  var teacherSchoolId = String(matched.schoolId || '').trim();

  return {
    valid: true,
    session: {
      sessionId: matched.sessionId,
      teacherId: matched.teacherId,
      employeeId: matched.employeeId,
      teacherCode: matched.teacherCode,
      teacherName: matched.teacherName,
      role: 'Teacher',
      accessScope: 'SELF',
      schoolId: teacherSchoolId,
      allowedSchoolIds: teacherSchoolId ? [teacherSchoolId] : [],
      activeSchoolId: teacherSchoolId,
      isActive: true,
      status: 'Active',
      expiresAt: matched.expiresAt
    }
  };
}

function revokeSessionToken(ss, token) {
  var tokenHash = hashStringSHA256(token);
  var sheet = ss.getSheetByName(SHEETS.SESSIONS);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  var headers = data[0];
  var tokenHashCol = headers.indexOf('tokenHash');
  var statusCol = headers.indexOf('status');

  if (tokenHashCol < 0 || statusCol < 0) return;

  for (var i = 1; i < data.length; i++) {
    if (data[i][tokenHashCol] === tokenHash) {
      sheet.getRange(i + 1, statusCol + 1).setValue('REVOKED');
      break;
    }
  }
}

function revokeTeacherSessionToken(ss, token) {
  var tokenHash = hashStringSHA256(token);
  var sheet = ss.getSheetByName(SHEETS.TEACHER_SESSIONS);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  var headers = data[0];
  var tokenHashCol = headers.indexOf('tokenHash');
  var statusCol = headers.indexOf('status');

  if (tokenHashCol < 0 || statusCol < 0) return;

  for (var i = 1; i < data.length; i++) {
    if (data[i][tokenHashCol] === tokenHash) {
      sheet.getRange(i + 1, statusCol + 1).setValue('REVOKED');
      break;
    }
  }
}

// -------------------------------------------------------------
// CANONICAL BACKEND PERMISSION ENGINE & ROLE MATRIX
// -------------------------------------------------------------

var SELF_SAFE_ACTIONS = {
  validateSession: true,
  logout: true,
  getLeaves: true,
  saveLeave: true,
  getPermissions: true,
  savePermission: true,
  getMyRequests: true,
  createMyLeaveRequest: true,
  createMyPermissionRequest: true,
  getSchedule: true,
  'leaves.own.view': true,
  'leaves.own.create': true,
  'teacherSchedule.viewOwn': true,
  'homework.create': true,
  'lessonResources.manage': true,
  'teacherPortal.access': true
};

var ACTION_PERMISSION_MAP = {
  // Students
  getStudents: 'students.view',
  saveStudent: 'students.create',
  bulkSaveStudents: 'students.import',
  deleteStudent: 'students.delete',
  createManagedStudent: 'students.create',
  updateManagedStudent: 'students.edit',
  setManagedStudentStatus: 'students.edit',

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
  createManagedEmployee: 'employees.create',
  updateManagedEmployee: 'employees.edit',
  setManagedEmployeeStatus: 'employees.edit',
  importManagedEmployees: 'employees.import',

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
  getLeaveManagementData: 'leaves.manage.view',
  createManagedLeave: 'leaves.create',
  createManagedPermission: 'leaves.create',
  approveManagedLeave: 'leaves.manage.approve',
  rejectManagedLeave: 'leaves.manage.reject',
  approveManagedPermission: 'leaves.manage.approve',
  rejectManagedPermission: 'leaves.manage.reject',
  getMyRequests: 'leaves.own.view',
  createMyLeaveRequest: 'leaves.own.create',
  createMyPermissionRequest: 'leaves.own.create',

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
  createArchiveSnapshot: 'settings.manage'
};

var PERMISSION_ALIASES = {
  'schools.manage': ['schools.view'],
  'users.create': ['users.manage'],
  'users.edit': ['users.manage'],
  'users.disable': ['users.manage'],
  'users.resetPassword': ['users.manage'],
  'users.manageRoles': ['users.manage'],
  'users.view': ['users.manage'],
  'students.view': ['students.create', 'students.edit', 'students.delete'],
  'employees.view': ['employees.create', 'employees.edit', 'employees.delete'],
  'teachers.view': ['employees.view'],
  'teachers.create': ['employees.create'],
  'teachers.edit': ['employees.edit'],
  'teachers.delete': ['employees.delete'],
  'attendance.students.view': ['studentAttendance.view'],
  'studentAttendance.view': ['attendance.students.view'],
  'attendance.students.manage': ['studentAttendance.manage'],
  'studentAttendance.manage': ['attendance.students.manage'],
  'attendance.staff.view': ['teacherAttendance.view'],
  'teacherAttendance.view': ['attendance.staff.view'],
  'attendance.staff.manage': ['teacherAttendance.manage'],
  'teacherAttendance.manage': ['attendance.staff.manage'],
  'timetable.view': ['schedule.view'],
  'timetable.manage': ['schedule.manage'],
  'schedule.view': ['timetable.view'],
  'schedule.manage': ['timetable.manage'],
  'schedule.publish': ['timetable.publish'],
  'leaves.own.view': ['leaves.view', 'leaves.manage.view'],
  'leaves.own.create': ['leaves.create'],
  'settings.view': ['settings.manage']
};

var BASE_ADMIN_PERMISSIONS = {
  'schools.view': true,
  'schools.manage': true,
  'users.view': true,
  'users.create': true,
  'users.edit': true,
  'users.disable': true,
  'users.resetPassword': true,
  'users.manageRoles': true,
  'users.manage': true,
  'students.view': true,
  'students.create': true,
  'students.edit': true,
  'students.delete': true,
  'students.import': true,
  'employees.view': true,
  'employees.create': true,
  'employees.edit': true,
  'employees.delete': true,
  'employees.import': true,
  'attendance.students.view': true,
  'attendance.students.manage': true,
  'studentAttendance.view': true,
  'studentAttendance.manage': true,
  'attendance.staff.view': true,
  'attendance.staff.manage': true,
  'teacherAttendance.view': true,
  'teacherAttendance.manage': true,
  'leaves.view': true,
  'leaves.create': true,
  'leaves.edit': true,
  'leaves.delete': true,
  'leaves.manage.view': true,
  'leaves.manage.approve': true,
  'leaves.manage.reject': true,
  'leaves.own.view': true,
  'leaves.own.create': true,
  'timetable.view': true,
  'timetable.manage': true,
  'timetable.publish': true,
  'timetable.import': true,
  'schedule.view': true,
  'schedule.manage': true,
  'schedule.publish': true,
  'teacherAccounts.manage': true,
  'lessonContent.view': true,
  'homework.create': true,
  'curriculum.manage': true,
  'lessonResources.manage': true,
  'behavior.view': true,
  'behavior.create': true,
  'behaviorCases.create': true,
  'academicYears.view': true,
  'academicYears.create': true,
  'academicYears.edit': true,
  'parentCommunication.view': true,
  'parentCommunication.create': true,
  'data.sync.full': true,
  'settings.view': true,
  'settings.manage': true,
  'audit.view': true,
  'reports.view': true
};

var CANONICAL_ROLE_PERMISSIONS = {
  SystemAdmin: Object.assign({}, BASE_ADMIN_PERMISSIONS, {
    'schools.view': true,
    'schools.manage': true
  }),

  SchoolAdmin: Object.assign({}, BASE_ADMIN_PERMISSIONS, {
    'schools.view': true,
    'schools.manage': false // SchoolAdmin cannot manage global schools
  }),

  Admin: Object.assign({}, BASE_ADMIN_PERMISSIONS, {
    'schools.view': true,
    'schools.manage': false
  }),

  SchoolDirector: {
    'schools.view': true,
    'schools.manage': false,
    'users.view': true,
    'users.create': false,
    'users.edit': false,
    'users.disable': false,
    'users.resetPassword': false,
    'users.manageRoles': false,
    'users.manage': false,
    'students.view': true,
    'students.create': true,
    'students.edit': true,
    'students.delete': true,
    'students.import': true,
    'studentAttendance.view': true,
    'studentAttendance.manage': true,
    'attendance.students.view': true,
    'attendance.students.manage': true,
    'employees.view': true,
    'employees.create': true,
    'employees.edit': true,
    'employees.delete': true,
    'employees.import': true,
    'attendance.staff.view': true,
    'attendance.staff.manage': true,
    'teacherAttendance.view': true,
    'teacherAttendance.manage': true,
    'leaves.view': true,
    'leaves.create': true,
    'leaves.edit': true,
    'leaves.delete': true,
    'leaves.manage.view': true,
    'leaves.manage.approve': true,
    'leaves.manage.reject': true,
    'leaves.own.view': true,
    'leaves.own.create': true,
    'timetable.view': true,
    'timetable.manage': true,
    'timetable.publish': true,
    'schedule.view': true,
    'schedule.manage': true,
    'schedule.publish': true,
    'teacherAccounts.manage': true,
    'lessonContent.view': true,
    'homework.create': true,
    'curriculum.manage': true,
    'lessonResources.manage': true,
    'behavior.view': true,
    'behavior.create': true,
    'behaviorCases.create': true,
    'academicYears.view': true,
    'academicYears.create': true,
    'academicYears.edit': true,
    'parentCommunication.view': true,
    'parentCommunication.create': true,
    'settings.view': true,
    'settings.manage': true,
    'audit.view': true,
    'reports.view': true
  },

  StudentAffairs: {
    'schools.view': false,
    'schools.manage': false,
    'users.view': false,
    'users.create': false,
    'users.edit': false,
    'users.disable': false,
    'users.resetPassword': false,
    'users.manageRoles': false,
    'users.manage': false,
    'students.view': true,
    'students.create': true,
    'students.edit': true,
    'students.delete': true,
    'students.import': true,
    'studentAttendance.view': true,
    'studentAttendance.manage': true,
    'attendance.students.view': true,
    'attendance.students.manage': true,
    'academicYears.view': true,
    'academicYears.create': false,
    'academicYears.edit': false,
    'behavior.view': true,
    'behavior.create': true,
    'behaviorCases.create': true,
    'parentCommunication.view': true,
    'parentCommunication.create': true,
    'schedule.view': true,
    'timetable.view': true,
    'timetable.manage': false,
    'timetable.publish': false,
    'employees.view': false,
    'settings.view': true,
    'settings.manage': false,
    'audit.view': true,
    'leaves.own.view': true,
    'leaves.own.create': true
  },

  TeacherAffairs: {
    'schools.view': false,
    'schools.manage': false,
    'users.view': false,
    'users.create': false,
    'users.edit': false,
    'users.disable': false,
    'users.resetPassword': false,
    'users.manageRoles': false,
    'users.manage': false,
    'students.view': false,
    'students.create': false,
    'students.edit': false,
    'students.delete': false,
    'studentAttendance.view': false,
    'employees.view': true,
    'employees.create': true,
    'employees.edit': true,
    'employees.delete': false,
    'employees.import': true,
    'attendance.staff.view': true,
    'attendance.staff.manage': true,
    'teacherAttendance.view': true,
    'teacherAttendance.manage': true,
    'leaves.view': true,
    'leaves.create': true,
    'leaves.delete': true,
    'leaves.manage.view': true,
    'leaves.manage.approve': true,
    'leaves.manage.reject': true,
    'leaves.own.view': true,
    'leaves.own.create': true,
    'timetable.view': true,
    'timetable.manage': true,
    'timetable.publish': true,
    'schedule.view': true,
    'schedule.manage': true,
    'schedule.publish': true,
    'teacherAccounts.manage': true,
    'lessonContent.view': true,
    'lessonResources.manage': true,
    'homework.create': true,
    'settings.view': true,
    'settings.manage': false,
    'audit.view': true
  },

  SocialSpecialist: {
    'schools.view': false,
    'schools.manage': false,
    'users.view': false,
    'users.create': false,
    'users.manage': false,
    'students.view': true,
    'students.create': false,
    'employees.view': false,
    'timetable.manage': false,
    'behavior.view': true,
    'behavior.create': true,
    'behaviorCases.create': true,
    'parentCommunication.view': true,
    'parentCommunication.create': true,
    'settings.view': true,
    'settings.manage': false,
    'audit.view': true,
    'leaves.own.view': true,
    'leaves.own.create': true
  },

  QualityOfficer: {
    'schools.view': false,
    'schools.manage': false,
    'users.view': false,
    'users.create': false,
    'users.edit': false,
    'users.disable': false,
    'users.resetPassword': false,
    'users.manageRoles': false,
    'users.manage': false,
    'students.view': true,
    'students.create': false,
    'students.edit': false,
    'students.delete': false,
    'employees.view': true,
    'employees.create': false,
    'employees.edit': false,
    'employees.delete': false,
    'studentAttendance.view': true,
    'studentAttendance.manage': false,
    'attendance.students.view': true,
    'attendance.staff.view': true,
    'attendance.staff.manage': false,
    'teacherAttendance.view': true,
    'teacherAttendance.manage': false,
    'leaves.view': true,
    'leaves.create': false,
    'leaves.own.view': true,
    'leaves.own.create': true,
    'timetable.view': true,
    'timetable.manage': false,
    'timetable.publish': false,
    'schedule.view': true,
    'schedule.manage': false,
    'behavior.view': true,
    'academicYears.view': true,
    'parentCommunication.view': true,
    'settings.view': true,
    'settings.manage': false,
    'audit.view': true,
    'reports.view': true
  },

  TrainingOfficer: {
    'schools.view': false,
    'schools.manage': false,
    'users.view': false,
    'users.create': false,
    'users.manage': false,
    'students.view': false,
    'employees.view': true,
    'employees.create': false,
    'employees.edit': false,
    'attendance.staff.view': true,
    'attendance.staff.manage': false,
    'teacherAttendance.view': true,
    'teacherAttendance.manage': false,
    'leaves.view': true,
    'leaves.own.view': true,
    'leaves.own.create': true,
    'timetable.view': true,
    'timetable.manage': false,
    'settings.view': true,
    'settings.manage': false,
    'audit.view': true,
    'reports.view': true
  },

  Teacher: {
    'schools.view': false,
    'schools.manage': false,
    'users.view': false,
    'users.create': false,
    'users.manage': false,
    'students.view': true,
    'students.create': false,
    'employees.view': false,
    'leaves.own.view': true,
    'leaves.own.create': true,
    'leaves.view': false,
    'leaves.create': false,
    'leaves.delete': false,
    'leaves.manage.view': false,
    'leaves.manage.approve': false,
    'leaves.manage.reject': false,
    'timetable.view': true,
    'timetable.manage': false,
    'timetable.publish': false,
    'schedule.view': true,
    'schedule.manage': false,
    'lessonContent.view': true,
    'lessonResources.manage': true,
    'homework.create': true,
    'settings.view': true,
    'settings.manage': false,
    'audit.view': false
  },

  AdministrativeEmployee: {
    'schools.view': false,
    'schools.manage': false,
    'users.view': false,
    'users.create': false,
    'users.manage': false,
    'students.view': false,
    'employees.view': false,
    'leaves.own.view': true,
    'leaves.own.create': true,
    'leaves.view': false,
    'leaves.create': false,
    'leaves.delete': false,
    'leaves.manage.view': false,
    'leaves.manage.approve': false,
    'leaves.manage.reject': false,
    'timetable.view': false,
    'timetable.manage': false,
    'settings.view': true,
    'settings.manage': false,
    'audit.view': false
  }
};

/**
 * Checks effective canonical permission with strict explicit-deny priority
 */
function hasEffectivePermissionGas(session, permission) {
  if (!session) return false;
  var role = String(session.role || '').trim();

  if (session.isActive === false || String(session.status || '').toLowerCase() === 'inactive' || String(session.status || '').toLowerCase() === 'suspended') {
    return false;
  }

  // Explicit session overrides
  if (session.customPermissions && typeof session.customPermissions === 'object') {
    if (session.customPermissions.hasOwnProperty(permission)) {
      if (session.customPermissions[permission] === false) return false;
      if (session.customPermissions[permission] === true) return true;
    }
  }

  var rolePerms = CANONICAL_ROLE_PERMISSIONS[role];
  if (!rolePerms) {
    return false;
  }

  // 1. Direct check: explicit deny beats allow
  if (rolePerms.hasOwnProperty(permission)) {
    if (rolePerms[permission] === false) return false;
    if (rolePerms[permission] === true) return true;
  }

  // 2. Check aliases if direct permission was not explicitly declared
  var aliases = PERMISSION_ALIASES[permission];
  if (aliases && aliases.length > 0) {
    for (var a = 0; a < aliases.length; a++) {
      var alias = aliases[a];
      if (rolePerms.hasOwnProperty(alias)) {
        if (rolePerms[alias] === false) return false;
        if (rolePerms[alias] === true) return true;
      }
    }
  }

  return false;
}

/**
 * Authoritative Backend Authorization Engine (RBAC Phase 2C)
 * Enforces the strict 8-step order:
 * 1. validateSession()
 * 2. verify account is Active
 * 3. resolve effective canonical role & validate scope
 * 4. verify permission (Canonical ACTION_PERMISSION_MAP + Explicit Deny)
 * 5. verify AccessScope
 * 6. verify target school & cross-school object access
 * 7. verify SELF ownership
 * 8. execute action (Fail-Closed)
 */
function authorize(session, action, resourceContext, masterSs, requestId) {
  var reqId = requestId || ('REQ_AUTH_' + Utilities.getUuid().substring(0, 8));
  var ss = masterSs || SpreadsheetApp.getActiveSpreadsheet();

  // 1. validateSession()
  if (!session || !session.userId || !session.sessionToken) {
    return { allowed: false, code: 'SESSION_MISSING', message: 'جلسة العمل مفقودة أو غير صالحة' };
  }

  if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
    return { allowed: false, code: 'SESSION_EXPIRED', message: 'انتهت صلاحية جلسة العمل. يرجى تسجيل الدخول مجدداً.' };
  }

  // 2. verify account is Active
  if (session.isActive === false || String(session.status || '').toLowerCase() === 'inactive' || String(session.status || '').toLowerCase() === 'suspended') {
    recordAuthoritativeAudit(ss, reqId, session.username || session.userId, session.role, 'ACCESS_DENIED', 'AUTH', session.userId, 'تم رفض الوصول: الحساب غير مفعل');
    return { allowed: false, code: 'ACCOUNT_INACTIVE', message: 'هذا الحساب غير مفعل حالياً' };
  }

  // 3. resolve effective canonical role & validate scope
  var role = String(session.role || '').trim();
  var scope = String(session.accessScope || '').trim().toUpperCase();

  if (!scope || (scope !== 'GLOBAL' && scope !== 'SCHOOL' && scope !== 'SELF')) {
    recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'ACCESS_DENIED', 'AUTH', session.userId, 'نطاق وصول غير صالح أو مفقود');
    return { allowed: false, code: 'MISSING_OR_INVALID_SCOPE', message: 'نطاق الوصول غير محدد أو غير مصرح به' };
  }

  // Legacy Admin rule (Section 7)
  if (role === 'Admin') {
    if (scope === 'GLOBAL') {
      recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'ACCESS_DENIED', 'AUTH', session.userId, 'دور Admin القديم لا يمكن أن يمتلك نطاق GLOBAL');
      return { allowed: false, code: 'ACCESS_DENIED', message: 'دور Admin القديم لا يمكن أن يمتلك نطاق GLOBAL' };
    }
    if (!session.schoolId || String(session.schoolId).trim() === '') {
      recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'ACCESS_DENIED', 'AUTH', session.userId, 'حساب المشرف القديم غير مربوط بمدرسة');
      return { allowed: false, code: 'NEEDS_ADMIN_REVIEW', message: 'حساب المشرف القديم غير مربوط بمدرسة محددة، يتطلب مراجعة مدير النظام' };
    }
  }

  // 3.5. SELF Scope Fail-Closed Check: Broad/non-self actions rejected immediately
  if (scope === 'SELF') {
    if (!SELF_SAFE_ACTIONS.hasOwnProperty(action) && action.indexOf('.own.') === -1) {
      recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'SELF_SCOPE_VIOLATION', 'AUTH', session.userId, 'تم حجب الإجراء لانتهاك حدود النطاق الذاتي (SELF Scope Fail-Closed): ' + action);
      return {
        allowed: false,
        code: 'SELF_SCOPE_VIOLATION',
        message: 'تم حجب الإجراء: حسابات النطاق الذاتي (SELF) غير مصرح لها بتنفيذ هذا الإجراء العام'
      };
    }
  }

  // 4. verify permission via dynamic resolution / canonical ACTION_PERMISSION_MAP and hasEffectivePermissionGas (Fail-Closed)
  var permissionKey;
  if (action === 'saveUser') {
    var targetUsers = getSheetData(ss, SHEETS.USERS);
    var existingUserRec = null;
    var targetId = String((resourceContext && (resourceContext.resourceId || resourceContext.targetUserId)) || '').trim();
    var targetUsername = String((resourceContext && resourceContext.targetUsername) || '').trim().toLowerCase();
    for (var uix = 0; uix < targetUsers.length; uix++) {
      if ((targetId && String(targetUsers[uix].id || '').trim() === targetId) ||
          (targetUsername && String(targetUsers[uix].username || '').trim().toLowerCase() === targetUsername)) {
        existingUserRec = targetUsers[uix];
        break;
      }
    }
    permissionKey = existingUserRec ? 'users.edit' : 'users.create';
  } else if (ACTION_PERMISSION_MAP.hasOwnProperty(action)) {
    permissionKey = ACTION_PERMISSION_MAP[action];
  } else if (action.indexOf('.') !== -1) {
    permissionKey = action;
  } else {
    recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'PERMISSION_MAPPING_MISSING', 'AUTH', session.userId, 'إجراء محمي غير معروف في خريطة الصلاحيات: ' + action);
    return {
      allowed: false,
      code: 'PERMISSION_MAPPING_MISSING',
      message: 'تم حجب الإجراء لعدم وجود ربط صلاحية معتمد (Fail-Closed): ' + action
    };
  }

  if (scope === 'SELF') {
    if (action === 'getLeaves' || action === 'getPermissions') {
      permissionKey = 'leaves.own.view';
    } else if (action === 'saveLeave' || action === 'savePermission') {
      permissionKey = 'leaves.own.create';
    }
  }

  var hasPerm = hasEffectivePermissionGas(session, permissionKey);
  if (!hasPerm) {
    recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'ROLE_PERMISSION_DENIED', 'AUTH', session.userId, 'تم رفض الإجراء: صلاحيات غير كافية لـ ' + action + ' (' + permissionKey + ')');
    return {
      allowed: false,
      code: 'ROLE_PERMISSION_DENIED',
      message: 'ليس لديك الصلاحيات الإدارية الكافية لتنفيذ هذا الإجراء'
    };
  }

  // 5. verify AccessScope & Target School
  var targetSchoolId;

  if (scope === 'GLOBAL') {
    var isMasterAction = (
      action === 'adminGetSchools' ||
      action === 'adminCreateSchool' ||
      action === 'adminUpdateSchool' ||
      action === 'adminGetSystemOverview' ||
      action === 'getUsers' ||
      action === 'saveUser' ||
      action === 'deleteUser' ||
      action === 'resetUserPassword' ||
      action === 'issueUserActivationToken' ||
      action === 'revokeUserSessions' ||
      action === 'toggleUserStatus' ||
      action === 'getSettings' ||
      action === 'saveSettings' ||
      action === 'getAuditLogs' ||
      action === 'addAuditLog' ||
      action === 'logout' ||
      action === 'validateSession'
    );

    if (isMasterAction) {
      return {
        allowed: true,
        effectiveSchoolId: String(session.activeSchoolId || '').trim().toUpperCase(),
        accessScope: 'GLOBAL'
      };
    }

    // For School-Scoped operational actions with GLOBAL scope, the authoritative school context MUST be session.activeSchoolId
    targetSchoolId = String(session.activeSchoolId || '').trim().toUpperCase();
    if (!targetSchoolId) {
      recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'ACCESS_DENIED', 'AUTH', session.userId, 'المدرسة النشطة غير محددة لجلسة مدير النظام');
      return { allowed: false, code: 'SCHOOL_CONTEXT_REQUIRED', message: 'يرجى تحديد المدرسة النشطة لتنفيذ هذا الإجراء' };
    }
    // targetSchoolId must be inside session.allowedSchoolIds
    var allowedList = (session.allowedSchoolIds || []).map(function(id) { return String(id).trim().toUpperCase(); });
    if (allowedList.indexOf(targetSchoolId) === -1) {
      recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'ACCESS_DENIED', 'AUTH', session.userId, 'المدرسة خارج نطاق الصلاحيات: ' + targetSchoolId);
      return { allowed: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المدرسة المطلوبة خارج نطاق المدارس المصرح لك بالوصول إليها' };
    }
  } else if (scope === 'SCHOOL') {
    // School-bound roles: session.schoolId is authoritative.
    targetSchoolId = String(session.schoolId || '').trim();
    if (resourceContext && resourceContext.schoolId && String(resourceContext.schoolId).trim().toUpperCase() !== targetSchoolId.toUpperCase()) {
      recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'SCHOOL_CONTEXT_MISMATCH', 'AUTH', session.userId, 'محاولة تجاوز نطاق مدرسة الجلسة: ' + resourceContext.schoolId);
      return { allowed: false, code: 'SCHOOL_CONTEXT_MISMATCH', message: 'تم رفض الطلب: لا يمكن تجاوز نطاق المدرسة المربوطة بالجلسة بمدرسة أخرى في الطلب' };
    }
  } else if (scope === 'SELF') {
    targetSchoolId = String(session.schoolId || '').trim();
    if (resourceContext && resourceContext.schoolId && String(resourceContext.schoolId).trim().toUpperCase() !== targetSchoolId.toUpperCase()) {
      recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'CROSS_SCHOOL_ACCESS_DENIED', 'AUTH', session.userId, 'محاولة وصول لمدرسة أخرى بنطاق SELF');
      return { allowed: false, code: 'CROSS_SCHOOL_ACCESS_DENIED', message: 'تم رفض الطلب: غير مصرح بالوصول إلى بيانات مدرسة أخرى' };
    }
  }

  // 6. Cross-School Object Access Check (Section 13)
  // For GLOBAL, effectiveSchoolId is strictly session.activeSchoolId. Payload schoolId cannot override it.
  var effectiveSchoolId = targetSchoolId;
  if (scope !== 'GLOBAL' && resourceContext && resourceContext.schoolId && String(resourceContext.schoolId).trim().toUpperCase() !== String(effectiveSchoolId).trim().toUpperCase()) {
    recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'CROSS_SCHOOL_ACCESS_DENIED', 'AUTH', session.userId, 'تم رفض الوصول لكائن مدرسة أخرى: ' + resourceContext.schoolId);
    return { allowed: false, code: 'CROSS_SCHOOL_ACCESS_DENIED', message: 'تم حجب المورد: كائن البيانات المطلوب يتبع لمدرسة أخرى' };
  }

  // 7. Verify SELF ownership (Section 8 & 9)
  if (scope === 'SELF' || (action && action.indexOf('.own.') !== -1)) {
    if (role === 'AdministrativeEmployee' && (action === 'getEmployees' || action === 'employees.view' || action === 'teachers.view')) {
      recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'SELF_SCOPE_VIOLATION', 'AUTH', session.userId, 'محاولة استعراض جميع الموظفين من حساب إداري ذاتي');
      return { allowed: false, code: 'SELF_SCOPE_VIOLATION', message: 'الموظف الإداري مصرح له بالعمليات الذاتية فقط ولا يمكنه استعراض جميع العاملين' };
    }

    if (resourceContext && resourceContext.ownerEmployeeId) {
      var sessionEmpId = String(session.employeeId || session.userId || '').trim().toLowerCase();
      var ownerEmpId = String(resourceContext.ownerEmployeeId).trim().toLowerCase();
      if (ownerEmpId !== sessionEmpId && ownerEmpId !== String(session.userId || '').trim().toLowerCase()) {
        recordAuthoritativeAudit(ss, reqId, session.username || session.userId, role, 'SELF_SCOPE_VIOLATION', 'AUTH', session.userId, 'محاولة الوصول إلى بيانات موظف آخر: ' + resourceContext.ownerEmployeeId);
        return { allowed: false, code: 'SELF_SCOPE_VIOLATION', message: 'تم رفض العملية: غير مصرح بالوصول إلى بيانات أو طلبات موظف آخر' };
      }
    }
  }

  // 8. Authorized
  return {
    allowed: true,
    effectiveSchoolId: effectiveSchoolId,
    accessScope: scope,
    actorUserId: session.userId,
    actorRole: role
  };
}

// -------------------------------------------------------------
// TIMETABLE, RESERVE, SUPERVISION & PORTAL LOGIC
// -------------------------------------------------------------

/**
 * Authoritative employee management helpers.
 * School binding, login number allocation, audit fields and sensitive-field stripping are server-owned.
 */
function findEmployeeByManagedIdentity(records, id, nationalId) {
  var cleanId = String(id || '').trim().toLowerCase();
  var cleanNationalId = String(nationalId || '').trim();

  for (var i = 0; i < records.length; i++) {
    var recordId = String(records[i].id || '').trim().toLowerCase();
    var recordNationalId = String(records[i].nationalId || '').trim();
    if ((cleanId && recordId === cleanId) || (cleanNationalId && recordNationalId === cleanNationalId)) {
      return records[i];
    }
  }
  return null;
}

function validateManagedEmployeeUniqueness(records, candidate, existingId) {
  var candidateNationalId = String(candidate.nationalId || '').trim();
  var candidateTeacherCode = String(candidate.teacherCode || '').trim().toLowerCase();
  var currentId = String(existingId || '').trim().toLowerCase();

  for (var i = 0; i < records.length; i++) {
    var rowId = String(records[i].id || '').trim().toLowerCase();
    if (currentId && rowId === currentId) continue;

    if (candidateNationalId && String(records[i].nationalId || '').trim() === candidateNationalId) {
      return { valid: false, code: 'EMPLOYEE_NATIONAL_ID_CONFLICT', message: 'الرقم القومي مستخدم بالفعل لموظف آخر.' };
    }
    if (candidateTeacherCode && String(records[i].teacherCode || '').trim().toLowerCase() === candidateTeacherCode) {
      return { valid: false, code: 'TEACHER_CODE_CONFLICT', message: 'كود المعلم مستخدم بالفعل لمعلم آخر.' };
    }
  }
  return { valid: true };
}

function buildManagedEmployeeRecord(ss, payload, effectiveSchoolId, existing) {
  payload = payload || {};
  existing = existing || null;

  var name = String(payload.name || payload.fullName || (existing && existing.name) || '').trim();
  if (!name) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'اسم الموظف حقل مطلوب.' };
  }

  var id = existing
    ? String(existing.id || '').trim()
    : String(payload.id || '').trim().toUpperCase();
  if (!id) {
    id = 'EMP' + Utilities.getUuid().substring(0, 8).toUpperCase();
  }

  var employeeType = String(payload.employeeType || (existing && existing.employeeType) || '').trim() === 'Teacher'
    ? 'Teacher'
    : 'Administrative';
  var status = String(payload.status || (existing && existing.status) || 'Active').trim();
  if (['Active', 'Inactive', 'Suspended'].indexOf(status) === -1) status = 'Active';

  var loginNumber = existing && existing.loginNumber ? existing.loginNumber : getNextLoginNumber(ss);
  var teacherCode = employeeType === 'Teacher'
    ? String(payload.teacherCode || (existing && existing.teacherCode) || id).trim().toUpperCase()
    : '';

  var daysOff = Array.isArray(payload.daysOff)
    ? payload.daysOff.map(function(day) { return String(day || '').trim(); }).filter(Boolean)
    : (existing && Array.isArray(existing.daysOff) ? existing.daysOff : []);

  var record = Object.assign({}, existing || {}, {
    id: id,
    employeeId: id,
    name: name,
    fullName: name,
    employeeType: employeeType,
    jobTitle: String(payload.jobTitle || (existing && existing.jobTitle) || (employeeType === 'Teacher' ? 'معلم' : 'إداري')).trim(),
    specialization: String(payload.specialization || (existing && existing.specialization) || (employeeType === 'Teacher' ? 'تعليم عام' : 'إدارة عامة')).trim(),
    teacherCode: teacherCode,
    teacherId: employeeType === 'Teacher' ? id : '',
    nationalId: String(payload.nationalId !== undefined ? payload.nationalId : ((existing && existing.nationalId) || '')).trim(),
    hireDate: String(payload.hireDate || (existing && existing.hireDate) || '').trim(),
    workingHours: Number(payload.workingHours !== undefined ? payload.workingHours : ((existing && existing.workingHours) || 0)) || 0,
    workStartTime: String(payload.workStartTime || (existing && existing.workStartTime) || '').trim(),
    workEndTime: String(payload.workEndTime || (existing && existing.workEndTime) || '').trim(),
    daysOff: daysOff,
    status: status,
    phone: String(payload.phone !== undefined ? payload.phone : ((existing && existing.phone) || '')).trim(),
    email: String(payload.email !== undefined ? payload.email : ((existing && existing.email) || '')).trim().toLowerCase(),
    isTeacher: employeeType === 'Teacher',
    isTeachingStaff: employeeType === 'Teacher',
    loginNumber: loginNumber,
    schoolId: String(effectiveSchoolId || '').trim().toUpperCase(),
    updatedAt: getCairoISOString()
  });

  if (!existing) record.createdAt = getCairoISOString();

  delete record.basicSalary;
  delete record.allowances;
  delete record.netSalary;
  delete record.salary;
  delete record.password;
  delete record.passwordHash;
  delete record.passwordSalt;
  delete record.passwordAlgorithm;
  delete record.passwordIterations;
  delete record.pin;

  return { success: true, record: record };
}

function sanitizeManagedEmployeeResponse(record) {
  var clean = Object.assign({}, record || {});
  delete clean.basicSalary;
  delete clean.allowances;
  delete clean.netSalary;
  delete clean.salary;
  delete clean.password;
  delete clean.passwordHash;
  delete clean.passwordSalt;
  delete clean.passwordAlgorithm;
  delete clean.passwordIterations;
  delete clean.pin;
  return clean;
}

function createManagedEmployeeRecord(ss, payload, effectiveSchoolId, actor, actorRole, requestId) {
  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var requestedId = String(payload.id || '').trim().toUpperCase();
  var requestedNationalId = String(payload.nationalId || '').trim();

  if (findEmployeeByManagedIdentity(employees, requestedId, requestedNationalId)) {
    return {
      success: false,
      code: 'EMPLOYEE_ALREADY_EXISTS',
      message: 'يوجد موظف بنفس الكود أو الرقم القومي. استخدم التعديل بدل إنشاء سجل جديد.',
      httpStatus: 409
    };
  }

  var built = buildManagedEmployeeRecord(ss, payload, effectiveSchoolId, null);
  if (!built.success) return built;

  var unique = validateManagedEmployeeUniqueness(employees, built.record, '');
  if (!unique.valid) return { success: false, code: unique.code, message: unique.message, httpStatus: 409 };

  upsertRecord(ss, SHEETS.EMPLOYEES, 'id', built.record);
  recordAuthoritativeAudit(ss, requestId, actor, actorRole, 'EMPLOYEE_CREATED', 'EMPLOYEES', built.record.id, 'إنشاء سجل موظف/معلم');

  return {
    success: true,
    message: 'تم إنشاء سجل الموظف بنجاح.',
    employee: sanitizeManagedEmployeeResponse(built.record)
  };
}

function updateManagedEmployeeRecord(ss, payload, effectiveSchoolId, actor, actorRole, requestId) {
  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var targetId = String(payload.id || '').trim();
  var existing = findEmployeeByManagedIdentity(employees, targetId, '');
  if (!existing || String(existing.id || '').trim() !== targetId) {
    return { success: false, code: 'RESOURCE_NOT_FOUND', message: 'سجل الموظف غير موجود.', httpStatus: 404 };
  }

  var built = buildManagedEmployeeRecord(ss, payload, effectiveSchoolId, existing);
  if (!built.success) return built;

  var unique = validateManagedEmployeeUniqueness(employees, built.record, existing.id);
  if (!unique.valid) return { success: false, code: unique.code, message: unique.message, httpStatus: 409 };

  upsertRecord(ss, SHEETS.EMPLOYEES, 'id', built.record);
  recordAuthoritativeAudit(ss, requestId, actor, actorRole, 'EMPLOYEE_UPDATED', 'EMPLOYEES', built.record.id, 'تعديل بيانات موظف/معلم');

  return {
    success: true,
    message: 'تم تحديث بيانات الموظف بنجاح.',
    employee: sanitizeManagedEmployeeResponse(built.record)
  };
}

function setManagedEmployeeStatusRecord(ss, payload, effectiveSchoolId, actor, actorRole, requestId) {
  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var targetId = String(payload.id || '').trim();
  var existing = findEmployeeByManagedIdentity(employees, targetId, '');
  if (!existing || String(existing.id || '').trim() !== targetId) {
    return { success: false, code: 'RESOURCE_NOT_FOUND', message: 'سجل الموظف غير موجود.', httpStatus: 404 };
  }

  var nextStatus = String(payload.status || '').trim();
  if (['Active', 'Inactive', 'Suspended'].indexOf(nextStatus) === -1) {
    return { success: false, code: 'INVALID_STATUS', message: 'حالة الموظف غير صالحة.' };
  }

  existing.status = nextStatus;
  existing.schoolId = String(effectiveSchoolId || '').trim().toUpperCase();
  existing.updatedAt = getCairoISOString();
  upsertRecord(ss, SHEETS.EMPLOYEES, 'id', existing);
  recordAuthoritativeAudit(ss, requestId, actor, actorRole, 'EMPLOYEE_STATUS_CHANGED', 'EMPLOYEES', existing.id, JSON.stringify({ status: nextStatus }));

  return {
    success: true,
    message: 'تم تحديث حالة الموظف بنجاح.',
    employee: sanitizeManagedEmployeeResponse(existing)
  };
}

function importManagedEmployeeRecords(ss, payload, effectiveSchoolId, actor, actorRole, requestId) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'لا توجد سجلات صالحة للاستيراد.' };
  }

  var added = 0;
  var updated = 0;
  var skipped = 0;
  var errors = [];
  var employees = getSheetData(ss, SHEETS.EMPLOYEES);

  for (var i = 0; i < payload.length; i++) {
    var raw = payload[i] || {};
    var match = findEmployeeByManagedIdentity(employees, raw.id, raw.nationalId);
    var built = buildManagedEmployeeRecord(ss, raw, effectiveSchoolId, match);

    if (!built.success) {
      skipped++;
      errors.push({ row: i + 1, code: built.code || 'INVALID_PAYLOAD', message: built.message || 'سجل غير صالح' });
      continue;
    }

    var unique = validateManagedEmployeeUniqueness(employees, built.record, match ? match.id : '');
    if (!unique.valid) {
      skipped++;
      errors.push({ row: i + 1, code: unique.code, message: unique.message });
      continue;
    }

    upsertRecord(ss, SHEETS.EMPLOYEES, 'id', built.record);

    var replaced = false;
    for (var j = 0; j < employees.length; j++) {
      if (String(employees[j].id || '').trim() === String(built.record.id || '').trim()) {
        employees[j] = built.record;
        replaced = true;
        break;
      }
    }
    if (!replaced) employees.push(built.record);

    if (match) updated++;
    else added++;
  }

  recordAuthoritativeAudit(ss, requestId, actor, actorRole, 'EMPLOYEES_IMPORTED', 'EMPLOYEES', String(payload.length), JSON.stringify({ added: added, updated: updated, skipped: skipped }));

  return {
    success: true,
    message: 'تم استيراد بيانات العاملين: ' + added + ' جديد، ' + updated + ' تحديث، ' + skipped + ' متجاوز.',
    stats: { added: added, updated: updated, skipped: skipped, errors: errors }
  };
}

/**
 * Authoritative leave/permission management helpers.
 * The client may select an employee and provide request content only.
 * Record identity, school, status, employee metadata and calculated values are server-owned.
 */
function getManagedEmployeeProfile(ss, employeeId) {
  var targetId = String(employeeId || '').trim();
  if (!targetId) return null;

  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  for (var i = 0; i < employees.length; i++) {
    if (String(employees[i].id || '').trim().toLowerCase() === targetId.toLowerCase()) {
      return {
        employeeId: String(employees[i].id || '').trim(),
        employeeName: String(employees[i].name || '').trim(),
        department: String(employees[i].department || '').trim()
      };
    }
  }
  return null;
}

function createManagedLeaveRequest(ss, session, payload, effectiveSchoolId, requestId) {
  var profile = getManagedEmployeeProfile(ss, payload.employeeId);
  if (!profile) {
    return { success: false, code: 'EMPLOYEE_NOT_FOUND', message: 'الموظف المحدد غير موجود في المدرسة النشطة.' };
  }

  var leaveType = String(payload.leaveType || '').trim();
  var startDate = String(payload.startDate || '').trim();
  var endDate = String(payload.endDate || '').trim();
  var reason = String(payload.reason || '').trim();
  var start = parseTeacherSelfDate(startDate);
  var end = parseTeacherSelfDate(endDate);

  if (!leaveType || !reason || !start || !end || end.getTime() < start.getTime()) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'بيانات طلب الإجازة غير مكتملة أو الفترة غير صالحة.' };
  }

  var leave = {
    id: 'LEV_' + Utilities.getUuid().substring(0, 12),
    schoolId: String(effectiveSchoolId || '').trim().toUpperCase(),
    employeeId: profile.employeeId,
    employeeName: profile.employeeName,
    department: profile.department,
    leaveType: leaveType,
    startDate: startDate,
    endDate: endDate,
    daysCount: Math.floor((end.getTime() - start.getTime()) / 86400000) + 1,
    reason: reason,
    notes: String(payload.notes || '').trim(),
    attachment: String(payload.attachment || ''),
    status: 'معلقة',
    createdAt: getCairoISOString()
  };

  upsertRecord(ss, SHEETS.LEAVES, 'id', leave);
  recordAuthoritativeAudit(ss, requestId, session.username || session.email || session.userId, session.role, 'MANAGED_LEAVE_CREATED', 'LEAVES', leave.id, 'إنشاء طلب إجازة إداري قيد المراجعة');

  return { success: true, message: 'تم إنشاء طلب الإجازة وهو الآن قيد المراجعة.', leave: sanitizeTeacherLeaveRecord(leave) };
}

function createManagedPermissionRequest(ss, session, payload, effectiveSchoolId, requestId) {
  var profile = getManagedEmployeeProfile(ss, payload.employeeId);
  if (!profile) {
    return { success: false, code: 'EMPLOYEE_NOT_FOUND', message: 'الموظف المحدد غير موجود في المدرسة النشطة.' };
  }

  var date = String(payload.date || '').trim();
  var permissionType = String(payload.permissionType || '').trim();
  var startTime = String(payload.startTime || '').trim();
  var endTime = String(payload.endTime || '').trim();
  var reason = String(payload.reason || '').trim();
  var startMinutes = parseTeacherSelfTime(startTime);
  var endMinutes = parseTeacherSelfTime(endTime);

  if (!parseTeacherSelfDate(date) || !permissionType || !reason || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'بيانات طلب الإذن غير مكتملة أو الفترة الزمنية غير صالحة.' };
  }

  var permission = {
    id: 'PERM_' + Utilities.getUuid().substring(0, 12),
    schoolId: String(effectiveSchoolId || '').trim().toUpperCase(),
    employeeId: profile.employeeId,
    employeeName: profile.employeeName,
    department: profile.department,
    date: date,
    permissionType: permissionType,
    startTime: startTime,
    endTime: endTime,
    durationHours: Math.round(((endMinutes - startMinutes) / 60) * 100) / 100,
    reason: reason,
    notes: String(payload.notes || '').trim(),
    attachment: String(payload.attachment || ''),
    status: 'معلقة',
    createdAt: getCairoISOString()
  };

  upsertRecord(ss, SHEETS.PERMISSIONS, 'id', permission);
  recordAuthoritativeAudit(ss, requestId, session.username || session.email || session.userId, session.role, 'MANAGED_PERMISSION_CREATED', 'PERMISSIONS', permission.id, 'إنشاء طلب إذن إداري قيد المراجعة');

  return { success: true, message: 'تم إنشاء طلب الإذن وهو الآن قيد المراجعة.', permission: sanitizeTeacherPermissionRecord(permission) };
}

function findRecordById(records, id) {
  var targetId = String(id || '').trim();
  if (!targetId) return null;
  for (var i = 0; i < records.length; i++) {
    if (String(records[i].id || '').trim() === targetId) return records[i];
  }
  return null;
}

function setManagedLeaveStatus(ss, session, payload, status, requestId) {
  var leave = findRecordById(getSheetData(ss, SHEETS.LEAVES), payload.id);
  if (!leave) return { success: false, code: 'RESOURCE_NOT_FOUND', message: 'سجل الإجازة غير موجود.', httpStatus: 404 };

  leave.status = status;
  leave.approvedBy = String(session.fullName || session.username || session.email || session.userId || '').trim();
  leave.approvedAt = getCairoISOString();
  leave.rejectionReason = status === 'مرفوضة'
    ? String(payload.reason || 'لم يتم استيفاء شروط الإجازة').trim()
    : '';

  upsertRecord(ss, SHEETS.LEAVES, 'id', leave);
  recordAuthoritativeAudit(ss, requestId, session.username || session.email || session.userId, session.role, status === 'مقبولة' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', 'LEAVES', leave.id, leave.rejectionReason || 'اعتماد طلب الإجازة');

  return { success: true, message: status === 'مقبولة' ? 'تم اعتماد الإجازة.' : 'تم رفض الإجازة.', leave: sanitizeTeacherLeaveRecord(leave) };
}

function setManagedPermissionStatus(ss, session, payload, status, requestId) {
  var permission = findRecordById(getSheetData(ss, SHEETS.PERMISSIONS), payload.id);
  if (!permission) return { success: false, code: 'RESOURCE_NOT_FOUND', message: 'سجل الإذن غير موجود.', httpStatus: 404 };

  permission.status = status;
  permission.approvedBy = String(session.fullName || session.username || session.email || session.userId || '').trim();
  permission.approvedAt = getCairoISOString();
  permission.rejectionReason = status === 'مرفوضة'
    ? String(payload.reason || 'لم يتم استيفاء شروط الإذن').trim()
    : '';

  upsertRecord(ss, SHEETS.PERMISSIONS, 'id', permission);
  recordAuthoritativeAudit(ss, requestId, session.username || session.email || session.userId, session.role, status === 'مقبولة' ? 'PERMISSION_APPROVED' : 'PERMISSION_REJECTED', 'PERMISSIONS', permission.id, permission.rejectionReason || 'اعتماد طلب الإذن');

  return { success: true, message: status === 'مقبولة' ? 'تم اعتماد الإذن.' : 'تم رفض الإذن.', permission: sanitizeTeacherPermissionRecord(permission) };
}

/**
 * Staff self-service profile and request helpers.
 * Identity, school, request id, approval state and calculated values are server-owned.
 */
function getStaffSelfProfile(ss, session) {
  var employeeId = String((session && session.employeeId) || '').trim();
  if (!employeeId) {
    return null;
  }

  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var employee = null;
  for (var i = 0; i < employees.length; i++) {
    if (String(employees[i].id || '').trim().toLowerCase() === employeeId.toLowerCase()) {
      employee = employees[i];
      break;
    }
  }

  return {
    employeeId: employeeId,
    employeeName: String((employee && employee.name) || session.fullName || session.username || 'الموظف').trim(),
    department: String((employee && employee.department) || '').trim(),
    employeeNumber: String((employee && employee.employeeNumber) || '').trim()
  };
}

function getStaffSelfRequestsBundle(ss, session) {
  var profile = getStaffSelfProfile(ss, session);
  if (!profile) {
    return {
      success: false,
      code: 'EMPLOYEE_CONTEXT_REQUIRED',
      message: 'الحساب غير مربوط بسجل موظف معتمد. يرجى مراجعة إدارة النظام.'
    };
  }

  var ownId = profile.employeeId.toLowerCase();
  var leaves = getSheetData(ss, SHEETS.LEAVES).filter(function(record) {
    return String(record.employeeId || '').trim().toLowerCase() === ownId;
  }).map(sanitizeTeacherLeaveRecord);

  var permissions = getSheetData(ss, SHEETS.PERMISSIONS).filter(function(record) {
    return String(record.employeeId || '').trim().toLowerCase() === ownId;
  }).map(sanitizeTeacherPermissionRecord);

  return {
    success: true,
    profile: profile,
    leaves: leaves,
    permissions: permissions
  };
}

function createStaffSelfLeaveRequest(ss, session, payload, effectiveSchoolId, requestId) {
  var profile = getStaffSelfProfile(ss, session);
  if (!profile) {
    return {
      success: false,
      code: 'EMPLOYEE_CONTEXT_REQUIRED',
      message: 'الحساب غير مربوط بسجل موظف معتمد. يرجى مراجعة إدارة النظام.'
    };
  }

  var leaveType = String(payload.leaveType || '').trim();
  var startDate = String(payload.startDate || '').trim();
  var endDate = String(payload.endDate || '').trim();
  var reason = String(payload.reason || '').trim();
  var notes = String(payload.notes || '').trim();
  var attachment = String(payload.attachment || '');

  if (!leaveType || !startDate || !endDate || !reason) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'نوع الإجازة والفترة والسبب حقول مطلوبة.' };
  }

  var start = parseTeacherSelfDate(startDate);
  var end = parseTeacherSelfDate(endDate);
  if (!start || !end || end.getTime() < start.getTime()) {
    return { success: false, code: 'INVALID_DATE_RANGE', message: 'فترة الإجازة غير صالحة.' };
  }

  var daysCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  var leave = {
    id: 'LEV_' + Utilities.getUuid().substring(0, 12),
    schoolId: String(effectiveSchoolId || '').trim().toUpperCase(),
    employeeId: profile.employeeId,
    employeeName: profile.employeeName,
    department: profile.department,
    leaveType: leaveType,
    startDate: startDate,
    endDate: endDate,
    daysCount: daysCount,
    reason: reason,
    notes: notes,
    attachment: attachment,
    status: 'معلقة',
    createdAt: getCairoISOString()
  };

  upsertRecord(ss, SHEETS.LEAVES, 'id', leave);
  recordAuthoritativeAudit(
    ss,
    requestId,
    session.username || session.email || session.userId,
    session.role || 'Staff',
    'STAFF_SELF_LEAVE_REQUEST_CREATED',
    'LEAVES',
    leave.id,
    'تقديم طلب إجازة ذاتي'
  );

  return {
    success: true,
    message: 'تم إرسال طلب الإجازة بنجاح وهو الآن قيد المراجعة.',
    leave: sanitizeTeacherLeaveRecord(leave)
  };
}

function createStaffSelfPermissionRequest(ss, session, payload, effectiveSchoolId, requestId) {
  var profile = getStaffSelfProfile(ss, session);
  if (!profile) {
    return {
      success: false,
      code: 'EMPLOYEE_CONTEXT_REQUIRED',
      message: 'الحساب غير مربوط بسجل موظف معتمد. يرجى مراجعة إدارة النظام.'
    };
  }

  var date = String(payload.date || '').trim();
  var permissionType = String(payload.permissionType || '').trim();
  var startTime = String(payload.startTime || '').trim();
  var endTime = String(payload.endTime || '').trim();
  var reason = String(payload.reason || '').trim();
  var notes = String(payload.notes || '').trim();
  var attachment = String(payload.attachment || '');

  if (!parseTeacherSelfDate(date) || !permissionType || !reason) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'تاريخ ونوع وسبب الإذن حقول مطلوبة.' };
  }

  var startMinutes = parseTeacherSelfTime(startTime);
  var endMinutes = parseTeacherSelfTime(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return { success: false, code: 'INVALID_TIME_RANGE', message: 'وقت انتهاء الإذن يجب أن يكون بعد وقت البدء.' };
  }

  var durationHours = Math.round(((endMinutes - startMinutes) / 60) * 100) / 100;
  var permission = {
    id: 'PERM_' + Utilities.getUuid().substring(0, 12),
    schoolId: String(effectiveSchoolId || '').trim().toUpperCase(),
    employeeId: profile.employeeId,
    employeeName: profile.employeeName,
    department: profile.department,
    date: date,
    permissionType: permissionType,
    startTime: startTime,
    endTime: endTime,
    durationHours: durationHours,
    reason: reason,
    notes: notes,
    attachment: attachment,
    status: 'معلقة',
    createdAt: getCairoISOString()
  };

  upsertRecord(ss, SHEETS.PERMISSIONS, 'id', permission);
  recordAuthoritativeAudit(
    ss,
    requestId,
    session.username || session.email || session.userId,
    session.role || 'Staff',
    'STAFF_SELF_PERMISSION_REQUEST_CREATED',
    'PERMISSIONS',
    permission.id,
    'تقديم طلب إذن ذاتي'
  );

  return {
    success: true,
    message: 'تم إرسال طلب الإذن بنجاح وهو الآن قيد المراجعة.',
    permission: sanitizeTeacherPermissionRecord(permission)
  };
}

/**
 * Normalize leave/permission status for teacher self-service display.
 */
function normalizeTeacherSelfRequestStatus(status) {
  var raw = String(status || '').trim().toLowerCase();
  if (raw === 'مقبولة' || raw === 'approved' || raw === 'معتمد' || raw === 'معتمدة' || raw === 'مقبول') return 'مقبولة';
  if (raw === 'مرفوضة' || raw === 'rejected' || raw === 'مرفوض') return 'مرفوضة';
  return 'معلقة';
}

function getTeacherSelfProfile(ss, tSession) {
  var employeeId = String(tSession.employeeId || tSession.teacherId || '').trim();
  if (!employeeId) {
    return null;
  }

  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var employee = null;
  for (var i = 0; i < employees.length; i++) {
    if (String(employees[i].id || '').trim().toLowerCase() === employeeId.toLowerCase()) {
      employee = employees[i];
      break;
    }
  }

  return {
    employeeId: employeeId,
    employeeName: String((employee && employee.name) || tSession.teacherName || 'المعلم').trim(),
    department: String((employee && employee.department) || 'هيئة التدريس').trim(),
    teacherCode: String((employee && employee.teacherCode) || tSession.teacherCode || '').trim()
  };
}

function sanitizeTeacherLeaveRecord(record) {
  return {
    id: String(record.id || '').trim(),
    employeeId: String(record.employeeId || '').trim(),
    employeeName: String(record.employeeName || '').trim(),
    department: String(record.department || '').trim(),
    leaveType: String(record.leaveType || '').trim(),
    startDate: String(record.startDate || '').trim(),
    endDate: String(record.endDate || '').trim(),
    daysCount: parseInt(record.daysCount || 0, 10) || 0,
    status: normalizeTeacherSelfRequestStatus(record.status),
    reason: String(record.reason || '').trim(),
    notes: String(record.notes || '').trim(),
    attachment: String(record.attachment || ''),
    rejectionReason: String(record.rejectionReason || '').trim(),
    approvedBy: String(record.approvedBy || '').trim(),
    createdAt: String(record.createdAt || '').trim()
  };
}

function sanitizeTeacherPermissionRecord(record) {
  return {
    id: String(record.id || '').trim(),
    employeeId: String(record.employeeId || '').trim(),
    employeeName: String(record.employeeName || '').trim(),
    department: String(record.department || '').trim(),
    date: String(record.date || '').trim(),
    permissionType: String(record.permissionType || '').trim(),
    startTime: String(record.startTime || '').trim(),
    endTime: String(record.endTime || '').trim(),
    durationHours: Number(record.durationHours || 0) || 0,
    reason: String(record.reason || '').trim(),
    notes: String(record.notes || '').trim(),
    attachment: String(record.attachment || ''),
    status: normalizeTeacherSelfRequestStatus(record.status),
    approvedBy: String(record.approvedBy || '').trim(),
    rejectionReason: String(record.rejectionReason || '').trim(),
    createdAt: String(record.createdAt || '').trim()
  };
}

function getTeacherSelfRequestsBundle(ss, tSession) {
  var profile = getTeacherSelfProfile(ss, tSession);
  if (!profile) {
    return {
      success: false,
      code: 'TEACHER_EMPLOYEE_CONTEXT_REQUIRED',
      message: 'جلسة المعلم غير مرتبطة بسجل موظف صالح.'
    };
  }

  var ownId = profile.employeeId.toLowerCase();
  var leaves = getSheetData(ss, SHEETS.LEAVES).filter(function(record) {
    return String(record.employeeId || '').trim().toLowerCase() === ownId;
  }).map(sanitizeTeacherLeaveRecord);

  var permissions = getSheetData(ss, SHEETS.PERMISSIONS).filter(function(record) {
    return String(record.employeeId || '').trim().toLowerCase() === ownId;
  }).map(sanitizeTeacherPermissionRecord);

  return {
    success: true,
    profile: profile,
    leaves: leaves,
    permissions: permissions
  };
}

function parseTeacherSelfDate(value) {
  var raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  var parsed = new Date(raw + 'T00:00:00Z');
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

function createTeacherLeaveRequest(ss, tSession, payload, requestId) {
  payload = payload || {};
  var profile = getTeacherSelfProfile(ss, tSession);
  if (!profile) {
    return { success: false, code: 'TEACHER_EMPLOYEE_CONTEXT_REQUIRED', message: 'جلسة المعلم غير مرتبطة بسجل موظف صالح.' };
  }

  var leaveType = String(payload.leaveType || '').trim();
  var startDate = String(payload.startDate || '').trim();
  var endDate = String(payload.endDate || '').trim();
  var reason = String(payload.reason || '').trim();
  var notes = String(payload.notes || '').trim();
  var attachment = String(payload.attachment || '');

  if (!leaveType || !startDate || !endDate || !reason) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'نوع الإجازة والفترة والسبب حقول مطلوبة.' };
  }

  var start = parseTeacherSelfDate(startDate);
  var end = parseTeacherSelfDate(endDate);
  if (!start || !end || end.getTime() < start.getTime()) {
    return { success: false, code: 'INVALID_DATE_RANGE', message: 'فترة الإجازة غير صالحة.' };
  }

  var daysCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  var leave = {
    id: 'LEV_' + Utilities.getUuid().substring(0, 12),
    schoolId: String(tSession.schoolId || '').trim(),
    employeeId: profile.employeeId,
    employeeName: profile.employeeName,
    department: profile.department,
    leaveType: leaveType,
    startDate: startDate,
    endDate: endDate,
    daysCount: daysCount,
    reason: reason,
    notes: notes,
    attachment: attachment,
    status: 'معلقة',
    createdAt: getCairoISOString()
  };

  upsertRecord(ss, SHEETS.LEAVES, 'id', leave);
  recordAuthoritativeAudit(
    ss,
    requestId,
    tSession.teacherCode || tSession.teacherName || profile.employeeId,
    'Teacher',
    'TEACHER_LEAVE_REQUEST_CREATED',
    'LEAVES',
    leave.id,
    'تقديم طلب إجازة ذاتي للمعلم'
  );

  return {
    success: true,
    message: 'تم إرسال طلب الإجازة بنجاح وهو الآن قيد المراجعة.',
    leave: sanitizeTeacherLeaveRecord(leave)
  };
}

function parseTeacherSelfTime(value) {
  var raw = String(value || '').trim();
  var match = /^(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  var hour = parseInt(match[1], 10);
  var minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function createTeacherPermissionRequest(ss, tSession, payload, requestId) {
  payload = payload || {};
  var profile = getTeacherSelfProfile(ss, tSession);
  if (!profile) {
    return { success: false, code: 'TEACHER_EMPLOYEE_CONTEXT_REQUIRED', message: 'جلسة المعلم غير مرتبطة بسجل موظف صالح.' };
  }

  var date = String(payload.date || '').trim();
  var permissionType = String(payload.permissionType || '').trim();
  var startTime = String(payload.startTime || '').trim();
  var endTime = String(payload.endTime || '').trim();
  var reason = String(payload.reason || '').trim();
  var notes = String(payload.notes || '').trim();
  var attachment = String(payload.attachment || '');

  if (!parseTeacherSelfDate(date) || !permissionType || !reason) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'تاريخ ونوع وسبب الإذن حقول مطلوبة.' };
  }

  var startMinutes = parseTeacherSelfTime(startTime);
  var endMinutes = parseTeacherSelfTime(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return { success: false, code: 'INVALID_TIME_RANGE', message: 'وقت انتهاء الإذن يجب أن يكون بعد وقت البدء.' };
  }

  var durationHours = Math.round(((endMinutes - startMinutes) / 60) * 100) / 100;
  var permission = {
    id: 'PERM_' + Utilities.getUuid().substring(0, 12),
    schoolId: String(tSession.schoolId || '').trim(),
    employeeId: profile.employeeId,
    employeeName: profile.employeeName,
    department: profile.department,
    date: date,
    permissionType: permissionType,
    startTime: startTime,
    endTime: endTime,
    durationHours: durationHours,
    reason: reason,
    notes: notes,
    attachment: attachment,
    status: 'معلقة',
    createdAt: getCairoISOString()
  };

  upsertRecord(ss, SHEETS.PERMISSIONS, 'id', permission);
  recordAuthoritativeAudit(
    ss,
    requestId,
    tSession.teacherCode || tSession.teacherName || profile.employeeId,
    'Teacher',
    'TEACHER_PERMISSION_REQUEST_CREATED',
    'PERMISSIONS',
    permission.id,
    'تقديم طلب إذن ذاتي للمعلم'
  );

  return {
    success: true,
    message: 'تم إرسال طلب الإذن بنجاح وهو الآن قيد المراجعة.',
    permission: sanitizeTeacherPermissionRecord(permission)
  };
}

/**
 * Retrieve Teacher Portal Data Bundle (Authenticated via TeacherSession)
 */
function getTeacherPortalDataBundle(ss, tSession) {
  var teacherId = tSession.teacherId;

  var schedule = getSheetData(ss, SHEETS.SCHEDULE).filter(function(s) {
    return s.teacherId === teacherId && s.isActive !== false;
  });

  var assignments = getSheetData(ss, SHEETS.TEACHER_TEACHING_ASSIGNMENTS).filter(function(a) {
    return a.teacherId === teacherId && a.isActive !== false;
  });

  var homework = getSheetData(ss, SHEETS.HOMEWORK).filter(function(h) {
    return h.teacherId === teacherId;
  });

  var resources = getSheetData(ss, SHEETS.TEACHER_RESOURCES).filter(function(r) {
    return r.teacherId === teacherId;
  });

  var exams = getSheetData(ss, SHEETS.EXAM_SCHEDULES).filter(function(e) {
    return e.chiefInvigilatorId === teacherId;
  });

  var reserves = getSheetData(ss, SHEETS.RESERVE_ASSIGNMENTS).filter(function(r) {
    return r.substituteTeacherId === teacherId;
  });

  var supervisions = getSheetData(ss, SHEETS.SUPERVISION_ASSIGNMENTS).filter(function(s) {
    return s.teacherId === teacherId;
  });

  return {
    teacher: {
      id: teacherId,
      teacherCode: tSession.teacherCode,
      name: tSession.teacherName
    },
    schedule: schedule,
    teachingAssignments: assignments,
    homework: homework,
    resources: resources,
    examDuties: exams,
    reserveSubstitutions: reserves,
    supervisionDuties: supervisions
  };
}

/**
 * Teacher saves homework draft (Server validates teacher assignment)
 */
function saveTeacherHomeworkDraft(ss, tSession, payload, requestId) {
  if (!payload || !payload.title || !payload.classroom) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'عنوان الواجب والفصل الدراسي مطلوبان' };
  }

  // Verify Classroom Assignment
  var assignments = getSheetData(ss, SHEETS.TEACHER_TEACHING_ASSIGNMENTS);
  var isAssigned = assignments.some(function(a) {
    return a.teacherId === tSession.teacherId &&
           (a.classroomId === payload.classroom || a.classroomName === payload.classroom) &&
           a.isActive !== false;
  });

  if (!isAssigned) {
    return {
      success: false,
      code: 'TEACHER_NOT_ASSIGNED_TO_CLASSROOM',
      message: 'غير مصرح: المعلم غير مسند إليه تدريس هذا الفصل الدراسي (' + payload.classroom + ')'
    };
  }

  var hwRecord = {
    id: payload.id || ('HW_' + Utilities.getUuid().substring(0, 10)),
    title: payload.title,
    description: payload.description || '',
    subject: payload.subject || 'العلوم التقنية',
    grade: payload.grade || '',
    classroom: payload.classroom,
    classroomId: payload.classroom,
    teacherId: tSession.teacherId,
    teacherName: tSession.teacherName,
    assignedDate: payload.assignedDate || getCairoDateString(),
    dueDate: payload.dueDate || getCairoDateString(),
    status: 'Draft', // Enforce Draft status for teacher-created content
    createdAt: getCairoISOString(),
    updatedAt: getCairoISOString()
  };

  upsertRecord(ss, SHEETS.HOMEWORK, 'id', hwRecord);
  return { success: true, message: 'تم حفظ مسودة الواجب بنجاح', homework: hwRecord };
}

/**
 * Teacher saves resource draft (Server validates teacher assignment)
 */
function saveTeacherResourceDraft(ss, tSession, payload, requestId) {
  if (!payload || !payload.title || !payload.classroom) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'عنوان المورد والفصل مطلوبان' };
  }

  var assignments = getSheetData(ss, SHEETS.TEACHER_TEACHING_ASSIGNMENTS);
  var isAssigned = assignments.some(function(a) {
    return a.teacherId === tSession.teacherId &&
           (a.classroomId === payload.classroom || a.classroomName === payload.classroom) &&
           a.isActive !== false;
  });

  if (!isAssigned) {
    return {
      success: false,
      code: 'TEACHER_NOT_ASSIGNED_TO_CLASSROOM',
      message: 'غير مصرح: المعلم غير مسند إليه تدريس هذا الفصل الدراسي'
    };
  }

  var resRecord = {
    id: payload.id || ('RES_' + Utilities.getUuid().substring(0, 10)),
    title: payload.title,
    topic: payload.topic || '',
    subject: payload.subject || '',
    classroom: payload.classroom,
    classroomId: payload.classroom,
    teacherId: tSession.teacherId,
    teacherName: tSession.teacherName,
    studentResourceUrl: payload.studentResourceUrl || '',
    presentationUrl: payload.presentationUrl || '',
    preparationNotesUrl: payload.preparationNotesUrl || '',
    visibility: 'Draft', // Enforce Draft
    createdAt: getCairoISOString(),
    updatedAt: getCairoISOString()
  };

  upsertRecord(ss, SHEETS.TEACHER_RESOURCES, 'id', resRecord);
  return { success: true, message: 'تم حفظ مسودة المورد بنجاح', resource: resRecord };
}

/**
 * Save Reserve Assignment (Server-Side Lock, Load Check, Hard-Block at 30 periods)
 */
function handleSaveReserveAssignment(ss, payload, authenticatedUsername, requestId) {
  if (!payload.substituteTeacherId || !payload.date || !payload.periodNumber) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'بيانات حصة الاحتياطي غير مكتملة' };
  }

  var teacherId = payload.substituteTeacherId;
  var date = payload.date;
  var period = parseInt(payload.periodNumber, 10);
  var dayOfWeek = payload.dayOfWeek || getCairoDayName(date);

  // 1. Check if teacher is Active
  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var teacher = null;
  for (var i = 0; i < employees.length; i++) {
    if (employees[i].id === teacherId) {
      teacher = employees[i];
      break;
    }
  }

  if (!teacher || teacher.status === 'Inactive') {
    return { success: false, code: 'TEACHER_INACTIVE', message: 'المعلم البديل غير مسجل أو حسابه غير نشط' };
  }

  // 2. Check Timetable conflict (Regular lesson collision)
  var schedule = getSheetData(ss, SHEETS.SCHEDULE);
  var hasScheduleCollision = schedule.some(function(s) {
    return s.teacherId === teacherId &&
           (s.dayOfWeek === dayOfWeek || s.dayName === dayOfWeek) &&
           parseInt(s.periodNumber, 10) === period &&
           s.isActive !== false && !s.isCancelled;
  });

  if (hasScheduleCollision) {
    return { success: false, code: 'SCHEDULE_COLLISION', message: 'المعلم البديل لديه حصة مجدولة في نفس هذا التوقيت' };
  }

  // 3. Check Existing Reserve Collision on the same date & period
  var subs = getSheetData(ss, SHEETS.RESERVE_ASSIGNMENTS);
  var hasReserveCollision = subs.some(function(s) {
    return s.id !== payload.id &&
           s.substituteTeacherId === teacherId &&
           s.date === date &&
           parseInt(s.periodNumber, 10) === period &&
           s.status !== 'CANCELLED' && s.status !== 'Cancelled';
  });

  if (hasReserveCollision) {
    return { success: false, code: 'RESERVE_COLLISION', message: 'المعلم البديل مسند إليه حصة احتياطي أخرى في نفس التوقيت' };
  }

  // 4. Check Supervision Collision on the same date & period/timeSlot
  var supervisions = getSheetData(ss, SHEETS.SUPERVISION_ASSIGNMENTS);
  var hasSupervisionCollision = supervisions.some(function(sup) {
    if (sup.teacherId !== teacherId || sup.date !== date) return false;
    if (sup.status === 'Cancelled' || sup.status === 'CANCELLED') return false;
    if (sup.periodNumber && parseInt(sup.periodNumber, 10) === period) return true;
    if (sup.timeSlot && String(sup.timeSlot).indexOf(String(period)) !== -1) return true;
    return false;
  });

  if (hasSupervisionCollision) {
    return { success: false, code: 'SUPERVISION_COLLISION', message: 'المعلم البديل مسند إليه نوبة إشراف في نفس هذا التوقيت' };
  }

  // 5. Check Leave Collision
  var leaves = getSheetData(ss, SHEETS.LEAVES);
  var isOnLeave = leaves.some(function(l) {
    return l.employeeId === teacherId &&
           (l.status === 'Approved' || l.status === 'مقبولة') &&
           date >= l.startDate && date <= l.endDate;
  });

  if (isOnLeave) {
    return { success: false, code: 'TEACHER_ON_LEAVE', message: 'المعلم في إجازة رسمية معتمدة في هذا التاريخ' };
  }

  // 6. Calculate Weekly Load & Check 30-Period Limit (1500 Minutes)
  var weekRange = getCairoWeekRange(date);
  var scheduledPeriods = schedule.filter(function(s) {
    return s.teacherId === teacherId && s.isActive !== false && !s.isCancelled;
  }).length;

  var activeReserveCount = subs.filter(function(s) {
    return s.id !== payload.id &&
           s.substituteTeacherId === teacherId &&
           (s.status === 'Assigned' || s.status === 'Completed') &&
           s.date >= weekRange.start && s.date <= weekRange.end;
  }).length;

  var projectedLoad = scheduledPeriods + activeReserveCount + 1;
  if (projectedLoad > 30) {
    return {
      success: false,
      code: 'TEACHER_LOAD_EXCEEDED',
      message: 'رفض الإسناد: المعلم سيتجاوز الحد الأقصى للنصاب القانوني (' + projectedLoad + ' / 30 حصة - 1500 دقيقة).'
    };
  }

  var subRecord = {
    id: payload.id || ('SUB_' + Utilities.getUuid().substring(0, 10)),
    date: date,
    dayOfWeek: dayOfWeek,
    periodNumber: period,
    classroom: payload.classroom || '',
    classroomId: payload.classroomId || payload.classroom || '',
    grade: payload.grade || '',
    subject: payload.subject || '',
    originalTeacherId: payload.originalTeacherId || '',
    originalTeacherName: payload.originalTeacherName || '',
    substituteTeacherId: teacherId,
    substituteTeacherName: teacher.name,
    substituteTeacherCode: teacher.teacherCode || '',
    status: payload.status || 'Assigned',
    assignedBy: authenticatedUsername,
    assignedAt: getCairoISOString(),
    reason: payload.reason || '',
    notes: payload.notes || ''
  };

  upsertRecord(ss, SHEETS.RESERVE_ASSIGNMENTS, 'id', subRecord);
  return { success: true, message: 'تم إسناد حصة الاحتياطي بنجاح', record: subRecord };
}

function cancelReserveAssignmentRecord(ss, subId, reason, authenticatedUsername) {
  var sheet = ss.getSheetByName(SHEETS.RESERVE_ASSIGNMENTS);
  if (!sheet) return { success: false, message: 'جدول الاحتياطي غير متوفر' };

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: 'سجل غير موجود' };
  var headers = data[0];
  var idCol = headers.indexOf('id');
  var statusCol = headers.indexOf('status');
  var notesCol = headers.indexOf('notes');

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === subId) {
      sheet.getRange(i + 1, statusCol + 1).setValue('CANCELLED');
      if (notesCol >= 0 && reason) {
        var prevNotes = String(data[i][notesCol] || '');
        sheet.getRange(i + 1, notesCol + 1).setValue(prevNotes + ' [تم الإلغاء بواسطة ' + authenticatedUsername + ': ' + reason + ']');
      }
      return { success: true, message: 'تم إلغاء حصة الاحتياطي بنجاح' };
    }
  }
  return { success: false, message: 'سجل الاحتياطي غير موجود' };
}

/**
 * Validate Schedule Conflicts on Server
 */
function validateServerScheduleConflicts(ss, payload) {
  if (!payload.dayOfWeek || !payload.periodNumber || (!payload.classroomId && !payload.classroom)) {
    return { success: false, code: 'INVALID_SCHEDULE_PAYLOAD', message: 'بيانات الحصة الدراسية غير مكتملة' };
  }

  var day = payload.dayOfWeek;
  var period = parseInt(payload.periodNumber, 10);
  var classroom = payload.classroomId || payload.classroom;
  var teacherId = payload.teacherId;
  var room = payload.room || payload.roomId;
  var targetId = payload.id;

  var schedule = getSheetData(ss, SHEETS.SCHEDULE);

  for (var i = 0; i < schedule.length; i++) {
    var s = schedule[i];
    if (s.id === targetId || s.isActive === false || s.isCancelled) continue;
    if (s.dayOfWeek !== day && s.dayName !== day) continue;
    if (parseInt(s.periodNumber, 10) !== period) continue;

    // 1. Classroom Collision (نفس الفصل في مادتين)
    var sClass = s.classroomId || s.classroom;
    if (sClass && sClass === classroom) {
      return { success: false, code: 'CLASSROOM_COLLISION', message: 'تعارض: الفصل (' + classroom + ') لديه حصة أخرى مجدولة في نفس هذا التوقيت' };
    }

    // 2. Teacher Collision (نفس المعلم في حصتين)
    if (teacherId && s.teacherId && s.teacherId === teacherId) {
      return { success: false, code: 'TEACHER_COLLISION', message: 'تعارض: المعلم مسند إليه حصة أخرى في نفس هذا التوقيت' };
    }

    // 3. Room Collision (إذا حُددت قاعة)
    var sRoom = s.room || s.roomId;
    if (room && sRoom && sRoom === room) {
      return { success: false, code: 'ROOM_COLLISION', message: 'تعارض: القاعة/المعمل (' + room + ') محجوزة لحصة أخرى في نفس التوقيت' };
    }
  }

  return { success: true };
}

/**
 * Save Supervision Assignment (Overlap, Lesson, & Reserve Collision Validations)
 */
function handleSaveSupervisionAssignment(ss, payload, authenticatedUsername, requestId) {
  if (!payload.teacherId || !payload.date || !payload.locationId) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'بيانات الإشراف غير مكتملة' };
  }

  var lock = LockService.getScriptLock();
  try {
    var acquired = lock.tryLock(15000);
    if (!acquired) {
      return { success: false, code: 'LOCK_TIMEOUT', message: 'النظام مشغول بعملية أخرى، يرجى المحاولة لاحقاً' };
    }

    var teacherId = payload.teacherId;
    var date = payload.date;
    var dayOfWeek = payload.dayOfWeek || getCairoDayName(date);
    var supPeriod = payload.periodNumber ? parseInt(payload.periodNumber, 10) : null;

    // 1. Existing Supervision Overlap
    var existing = getSheetData(ss, SHEETS.SUPERVISION_ASSIGNMENTS);
    var hasOverlap = existing.some(function(s) {
      return s.id !== payload.id &&
             s.teacherId === teacherId &&
             s.date === date &&
             s.timeSlot === payload.timeSlot &&
             s.status !== 'Cancelled' && s.status !== 'CANCELLED';
    });

    if (hasOverlap) {
      return { success: false, code: 'SUPERVISION_OVERLAP', message: 'المعلم مسند إليه نوبة إشراف أخرى في نفس هذا التوقيت' };
    }

    // 2. Lesson Collision in Regular Schedule
    var schedule = getSheetData(ss, SHEETS.SCHEDULE);
    var hasLessonCollision = schedule.some(function(s) {
      if (s.teacherId !== teacherId || s.isActive === false || s.isCancelled) return false;
      if (s.dayOfWeek !== dayOfWeek && s.dayName !== dayOfWeek) return false;
      if (supPeriod && parseInt(s.periodNumber, 10) === supPeriod) return true;
      if (payload.timeSlot && String(payload.timeSlot).indexOf(String(s.periodNumber)) !== -1) return true;
      return false;
    });

    if (hasLessonCollision) {
      return { success: false, code: 'LESSON_COLLISION', message: 'المعلم لديه حصة تدريسية مجدولة في نفس توقيت نوبة الإشراف' };
    }

    // 3. Reserve Substitution Collision
    var subs = getSheetData(ss, SHEETS.RESERVE_ASSIGNMENTS);
    var hasReserveCollision = subs.some(function(r) {
      if (r.substituteTeacherId !== teacherId || r.date !== date) return false;
      if (r.status === 'Cancelled' || r.status === 'CANCELLED') return false;
      if (supPeriod && parseInt(r.periodNumber, 10) === supPeriod) return true;
      if (payload.timeSlot && String(payload.timeSlot).indexOf(String(r.periodNumber)) !== -1) return true;
      return false;
    });

    if (hasReserveCollision) {
      return { success: false, code: 'RESERVE_COLLISION', message: 'المعلم مسند إليه حصة احتياطي في نفس توقيت نوبة الإشراف' };
    }

    var supRecord = Object.assign({}, payload, {
      assignedBy: authenticatedUsername,
      assignedAt: getCairoISOString(),
      status: payload.status || 'Assigned'
    });

    upsertRecord(ss, SHEETS.SUPERVISION_ASSIGNMENTS, 'id', supRecord);
    return { success: true, message: 'تم حفظ نوبة الإشراف بنجاح مع التحقق الأمني من التعارضات' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Issue Student Access Token (Staff Action: generates token, hashes server-side, saves hash)
 */
function issueStudentAccessToken(ss, studentId, createdByUserId, requestId) {
  var students = getSheetData(ss, SHEETS.STUDENTS);
  var student = null;
  for (var i = 0; i < students.length; i++) {
    if (students[i].id === studentId) {
      student = students[i];
      break;
    }
  }

  if (!student) {
    return { success: false, code: 'STUDENT_NOT_FOUND', message: 'الطالب غير مسجل بالنظام' };
  }

  // Deactivate any prior active tokens
  revokeStudentAccessToken(ss, studentId);

  // Generate cryptographically random raw token
  var rawToken = generateSecureRandomToken(32);
  var tokenHash = hashStringSHA256(rawToken);

  var now = new Date();
  var exp = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000)); // 90 days validity

  var record = {
    id: 'SAT_' + Utilities.getUuid().substring(0, 10),
    studentId: student.id,
    studentCode: student.studentCode || student.id,
    tokenHash: tokenHash,
    issuedAt: getCairoISOString(),
    expiresAt: exp.toISOString(),
    revokedAt: '',
    status: 'ACTIVE',
    lastAccessedAt: '',
    createdBy: createdByUserId
  };

  upsertRecord(ss, SHEETS.STUDENT_ACCESS_TOKENS, 'id', record);

  return {
    success: true,
    rawToken: rawToken, // Returned ONCE to client
    tokenRecord: {
      id: record.id,
      studentId: record.studentId,
      studentCode: record.studentCode,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      isActive: true
    }
  };
}

function revokeStudentAccessToken(ss, targetId) {
  var sheet = ss.getSheetByName(SHEETS.STUDENT_ACCESS_TOKENS);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  var headers = data[0];
  var idCol = headers.indexOf('id');
  var sIdCol = headers.indexOf('studentId');
  var statusCol = headers.indexOf('status');
  var revokedCol = headers.indexOf('revokedAt');

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === targetId || data[i][sIdCol] === targetId) {
      sheet.getRange(i + 1, statusCol + 1).setValue('REVOKED');
      if (revokedCol >= 0) {
        sheet.getRange(i + 1, revokedCol + 1).setValue(getCairoISOString());
      }
    }
  }
}

/**
 * @deprecated LEGACY PIN SYSTEM RETIRED - MIG_SCOPE_013_RETIRE_TEACHER_PIN
 * PIN authentication is permanently disabled. Teacher authentication is strictly Username + Password.
 */
function setTeacherPortalPin(ss, teacherId, pin, authenticatedUsername, requestId) {
  return {
    success: false,
    code: 'LEGACY_PIN_RETIRED',
    message: 'تم إيقاف تسجيل الدخول باستخدام PIN'
  };
}

/**
 * Publish Schedule Batch
 */
function publishScheduleBatch(ss, classroomOrGrade, version, authenticatedUsername) {
  var sheet = ss.getSheetByName(SHEETS.SCHEDULE);
  if (!sheet) return { success: false, message: 'جدول الحصص غير متوفر' };

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: 'لا توجد حصص لنشرها' };

  var headers = data[0];
  var statusCol = headers.indexOf('status');
  var classCol = headers.indexOf('classroom');
  var gradeCol = headers.indexOf('grade');
  var versionCol = headers.indexOf('version');

  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var matchClass = !classroomOrGrade || data[i][classCol] === classroomOrGrade || data[i][gradeCol] === classroomOrGrade;
    if (matchClass) {
      sheet.getRange(i + 1, statusCol + 1).setValue('Published');
      if (versionCol >= 0 && version) {
        sheet.getRange(i + 1, versionCol + 1).setValue(version);
      }
      count++;
    }
  }

  return { success: true, message: 'تم نشر ' + count + ' حصة دراسية رسمياً في الجدول' };
}

/**
 * Commit Timetable Import Batch (teacherCode or teacherId only, batch duplicate slot checking, fingerprint idempotency, school-isolated)
 */
function commitTimetableImportBatch(ss, rows, batchFingerprint, authenticatedUsername, effectiveSchoolId) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return { success: false, code: 'EMPTY_BATCH', message: 'مجموعة البيانات المراد استيرادها فارغة' };
  }

  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var teacherByCode = {};
  var teacherById = {};

  employees.forEach(function(e) {
    if (e.teacherCode) {
      teacherByCode[String(e.teacherCode).trim().toUpperCase()] = e;
    }
    if (e.id) {
      teacherById[String(e.id).trim()] = e;
    }
  });

  var existingSchedule = getSheetData(ss, SHEETS.SCHEDULE);

  // Idempotency check: if batchFingerprint already exists in schedule, return idempotent success
  if (batchFingerprint && batchFingerprint !== 'v1.0') {
    var alreadyImported = existingSchedule.filter(function(s) {
      return s.version === batchFingerprint;
    });
    if (alreadyImported.length > 0 && alreadyImported.length === rows.length) {
      return {
        success: true,
        message: 'تم استيراد واعتماد هذه الدفعة مسبقاً (دفعة مطابقة تم استيرادها بالفعل)',
        importedCount: alreadyImported.length
      };
    }
  }

  var errors = [];
  var cleanRows = [];
  var seenClassroomSlots = {};
  var seenTeacherSlots = {};

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var tCode = String(r.teacherCode || '').trim().toUpperCase();
    var tId = String(r.teacherId || r.resolvedTeacherId || '').trim();
    var tNameOnly = String(r.teacherName || r['اسم المعلم'] || '').trim();

    // REQUIREMENT 13: Strict teacher resolution (teacherCode OR teacherId ONLY, reject name-only)
    var teacher = null;
    if (tCode && teacherByCode[tCode]) {
      teacher = teacherByCode[tCode];
    } else if (tId && teacherById[tId]) {
      teacher = teacherById[tId];
    }

    if (!teacher) {
      if (tNameOnly && !tCode && !tId) {
        errors.push('السطر ' + (i + 1) + ': تم تقديم اسم المعلم (' + tNameOnly + ') فقط. غير مسموح بالاستيراد بالاسم المجرد، يلزم كود المعلم (teacherCode) أو معرّف المعلم (teacherId).');
      } else {
        errors.push('السطر ' + (i + 1) + ': كود المعلم (' + (tCode || tId) + ') غير مسجل في قاعدة المعلمين المعتمدة');
      }
      continue;
    }

    var classroom = String(r.classroom || r.classroomId || '').trim();
    var day = String(r.dayOfWeek || r.dayName || '').trim();
    var period = parseInt(r.periodNumber, 10);

    if (!classroom || !day || isNaN(period) || period < 1) {
      errors.push('السطر ' + (i + 1) + ': بيانات الحصة (الفصل أو اليوم أو رقم الحصة) غير صالحة');
      continue;
    }

    // REQUIREMENT 14: Check duplicate slots within the batch
    var classSlotKey = classroom + '|' + day + '|' + period;
    var teacherSlotKey = teacher.id + '|' + day + '|' + period;

    if (seenClassroomSlots[classSlotKey]) {
      errors.push('السطر ' + (i + 1) + ': تكرار تعارض في نفس الدفعة: الفصل (' + classroom + ') مسند له أكثر من مادة في اليوم ' + day + ' الحصة ' + period);
      continue;
    }
    if (seenTeacherSlots[teacherSlotKey]) {
      errors.push('السطر ' + (i + 1) + ': تكرار تعارض في نفس الدفعة: المعلم (' + teacher.name + ') مسند له أكثر من فصل في اليوم ' + day + ' الحصة ' + period);
      continue;
    }

    seenClassroomSlots[classSlotKey] = true;
    seenTeacherSlots[teacherSlotKey] = true;

    cleanRows.push({
      id: r.id || ('SCH_' + Utilities.getUuid().substring(0, 8)),
      schoolId: effectiveSchoolId || r.schoolId || '',
      dayOfWeek: day,
      dayName: day,
      periodNumber: period,
      classroomId: classroom,
      classroom: classroom,
      gradeId: r.grade || r.gradeId || '',
      grade: r.grade || r.gradeId || '',
      subjectId: r.subject || r.subjectId || '',
      subject: r.subject || r.subjectId || '',
      teacherId: teacher.id,
      employeeId: teacher.id,
      teacherCode: teacher.teacherCode || tCode,
      teacherName: teacher.name,
      loginNumber: teacher.loginNumber || '',
      room: r.room || r.roomId || '',
      roomId: r.room || r.roomId || '',
      cycleWeek: r.cycleWeek || 'ALL',
      status: 'Draft',
      academicYearId: r.academicYearId || '2026-2027',
      termId: r.termId || 'Term-1',
      version: batchFingerprint || 'v1.0',
      isActive: true,
      createdAt: getCairoISOString(),
      updatedAt: getCairoISOString()
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      code: 'VALIDATION_ERRORS',
      message: 'فشل استيراد الجدول لوجود أخطاء في مطابقة المعلمين أو تكرار الحصص',
      errors: errors
    };
  }

  cleanRows.forEach(function(rec) {
    upsertRecord(ss, SHEETS.SCHEDULE, 'id', rec);
  });

  return {
    success: true,
    message: 'تم استيراد واعتماد ' + cleanRows.length + ' حصة دراسية بنجاح مع الفحص الأمني للتعارضات',
    importedCount: cleanRows.length
  };
}

// -------------------------------------------------------------
// USER MANAGEMENT & SECURITY HELPERS
// -------------------------------------------------------------

/**
 * Normalizes staff roles to canonical staff roles.
 * Returns null for invalid, non-staff, or unknown roles.
 */
function normalizeUserRoleGas(role) {
  var r = String(role || '').trim();
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
function deriveUserAccessScopeGas(normalizedRole) {
  if (normalizedRole === 'SystemAdmin') return 'GLOBAL';
  if (normalizedRole === 'Teacher') return 'SELF';
  return 'SCHOOL';
}

/**
 * Returns safe User DTO. Purges all internal secrets, passwords, hashes, salts, and tokens.
 */
function sanitizeUserDTO(u) {
  if (!u) return null;
  var roleStr = String(u.role || '').trim();
  var normRole = normalizeUserRoleGas(roleStr);

  if (!normRole) {
    return {
      id: String(u.id || '').trim(),
      username: String(u.username || '').trim(),
      email: normalizeEmail(u.email),
      fullName: String(u.fullName || '').trim(),
      role: 'NeedsAdminReview',
      accessScope: 'SCHOOL',
      schoolId: '',
      allowedSchoolIds: [],
      employeeId: '',
      status: 'NeedsAdminReview',
      department: String(u.department || '').trim(),
      createdAt: u.createdAt || '',
      lastLogin: u.lastLogin || '',
      loginNumber: u.loginNumber || ''
    };
  }

  var derivedScope = deriveUserAccessScopeGas(normRole);
  var safeSchoolId = '';
  var safeAllowedSchoolIds = [];
  var safeEmployeeId = '';

  if (derivedScope === 'GLOBAL') {
    safeAllowedSchoolIds = parseAllowedSchoolIdsGas(u.allowedSchoolIds);
  } else {
    var storedSchool = String(u.schoolId || '').trim().toUpperCase();
    safeSchoolId = storedSchool;
    safeAllowedSchoolIds = storedSchool ? [storedSchool] : [];
    safeEmployeeId = String(u.employeeId || '').trim();
  }

  return {
    id: String(u.id || '').trim(),
    username: String(u.username || '').trim(),
    email: normalizeEmail(u.email),
    fullName: String(u.fullName || '').trim(),
    role: normRole,
    accessScope: derivedScope,
    schoolId: safeSchoolId,
    allowedSchoolIds: safeAllowedSchoolIds,
    employeeId: safeEmployeeId,
    status: String(u.status || 'Active').trim(),
    department: String(u.department || '').trim(),
    createdAt: u.createdAt || '',
    lastLogin: u.lastLogin || '',
    loginNumber: u.loginNumber || ''
  };
}

function getSanitizedUsersList(ss, activeSession) {
  var users = getSheetData(ss, SHEETS.USERS);
  var role = activeSession ? activeSession.role : '';
  var sessionSchool = activeSession ? String(activeSession.schoolId || '').trim().toUpperCase() : '';
  var allowed = (activeSession && activeSession.allowedSchoolIds ? activeSession.allowedSchoolIds : []).map(function(s) {
    return String(s).trim().toUpperCase();
  });

  var filtered = users.filter(function(u) {
    var normalizedTargetRole = normalizeUserRoleGas(u.role);
    if (!normalizedTargetRole) return false;

    var uSchool = String(u.schoolId || '').trim().toUpperCase();
    if (role === 'SchoolAdmin') {
      if (normalizedTargetRole === 'SystemAdmin') return false;
      return uSchool === sessionSchool;
    }
    if (role === 'SystemAdmin') {
      if (normalizedTargetRole === 'SystemAdmin') {
        var targetAllowed = parseAllowedSchoolIdsGas(u.allowedSchoolIds);
        for (var ta = 0; ta < targetAllowed.length; ta++) {
          if (allowed.indexOf(targetAllowed[ta]) === -1) return false;
        }
        return true;
      }
      if (!uSchool) return false;
      return allowed.indexOf(uSchool) !== -1;
    }
    if (role === 'Admin') {
      return uSchool === sessionSchool;
    }
    return false;
  });

  return filtered.map(sanitizeUserDTO);
}

/**
 * Checks whether target user can be viewed, updated, reset or deleted by the calling session
 */
function verifyTargetUserAccess(ss, activeSession, targetUserId) {
  if (!targetUserId) {
    return { allowed: false, code: 'TARGET_REQUIRED', message: 'معرف المستخدم المستهدف مطلوب' };
  }
  var users = getSheetData(ss, SHEETS.USERS);
  var target = null;
  var targetStr = String(targetUserId).trim().toLowerCase();
  for (var i = 0; i < users.length; i++) {
    var uId = String(users[i].id || '').trim().toLowerCase();
    var uName = String(users[i].username || '').trim().toLowerCase();
    if (uId === targetStr || uName === targetStr) {
      target = users[i];
      break;
    }
  }
  if (!target) {
    return { allowed: false, code: 'USER_NOT_FOUND', message: 'المستخدم المستهدف غير موجود' };
  }

  var authRole = activeSession ? activeSession.role : '';
  var sessionSchool = activeSession ? String(activeSession.schoolId || '').trim().toUpperCase() : '';

  if (authRole === 'SchoolAdmin') {
    if (target.role === 'SystemAdmin') {
      return { allowed: false, code: 'FORBIDDEN', message: 'غير مصرح بتعديل أو حذف حساب مدير نظام عام' };
    }
    var targetSchool = String(target.schoolId || '').trim().toUpperCase();
    if (targetSchool && targetSchool !== sessionSchool) {
      return { allowed: false, code: 'CROSS_SCHOOL_ACCESS_DENIED', message: 'غير مصرح بالعمليات على مستخدم ينتمي لمدرسة أخرى' };
    }
  } else if (authRole === 'SystemAdmin') {
    var allowedSchools = (activeSession.allowedSchoolIds || []).map(function(s) { return String(s).trim().toUpperCase(); });
    var targetSch = String(target.schoolId || '').trim().toUpperCase();
    if (normalizeUserRoleGas(target.role) === 'SystemAdmin') {
      var targetAllowedSchools = parseAllowedSchoolIdsGas(target.allowedSchoolIds);
      for (var tas = 0; tas < targetAllowedSchools.length; tas++) {
        if (allowedSchools.indexOf(targetAllowedSchools[tas]) === -1) {
          return { allowed: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'مدير النظام المستهدف لديه نطاق مدارس يتجاوز نطاق صلاحياتك' };
        }
      }
    } else if (targetSch && allowedSchools.indexOf(targetSch) === -1) {
      return { allowed: false, code: 'ACCESS_DENIED_SCHOOL_SCOPE', message: 'المستخدم يتبع مدرسة خارج نطاق المدارس المصرح بها' };
    }
  }

  return { allowed: true, targetUser: target };
}

/**
 * Atomic generator for unique sequential login numbers starting at 121
 */
function getNextLoginNumber(ss) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    // If lock times out, continue best-effort
  }

  try {
    var highest = 120;
    var users = getSheetData(ss, SHEETS.USERS);
    for (var i = 0; i < users.length; i++) {
      var num = parseInt(users[i].loginNumber, 10);
      if (!isNaN(num) && num > highest) {
        highest = num;
      }
    }

    var employees = getSheetData(ss, SHEETS.EMPLOYEES);
    for (var j = 0; j < employees.length; j++) {
      var eNum = parseInt(employees[j].loginNumber, 10);
      if (!isNaN(eNum) && eNum > highest) {
        highest = eNum;
      }
    }

    return highest + 1;
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function saveUserSecure(ss, payload, authenticatedUsername, requestId) {
  var salt = Utilities.getUuid().replace(/-/g, '');
  var rawPassword = payload.password;
  var passwordHash = '';
  var iterations = PBKDF2_ITERATIONS;

  if (rawPassword && String(rawPassword).trim().length >= 6) {
    passwordHash = computeSaltedHash(String(rawPassword).trim(), salt, iterations);
  }

  var existingUsers = getSheetData(ss, SHEETS.USERS);
  var existing = null;
  var targetId = payload.id ? String(payload.id).trim() : '';
  var targetUsername = payload.username ? String(payload.username).trim().toLowerCase() : '';
  for (var i = 0; i < existingUsers.length; i++) {
    var euId = String(existingUsers[i].id || '').trim();
    var euName = String(existingUsers[i].username || '').trim().toLowerCase();
    if ((targetId && euId === targetId) || (targetUsername && euName === targetUsername)) {
      existing = existingUsers[i];
      break;
    }
  }

  var loginNumber = payload.loginNumber;
  if (!loginNumber && existing && existing.loginNumber) {
    loginNumber = existing.loginNumber;
  }
  if (!loginNumber) {
    loginNumber = getNextLoginNumber(ss);
  }

  var passwordInitialized = false;
  if (payload.passwordInitialized !== undefined) {
    passwordInitialized = (payload.passwordInitialized === true || payload.passwordInitialized === 'true');
  } else if (passwordHash || (existing && existing.passwordHash)) {
    passwordInitialized = true;
  } else if (existing && existing.passwordInitialized !== undefined) {
    passwordInitialized = (existing.passwordInitialized === true || existing.passwordInitialized === 'true');
  }

  var role = payload.role || (existing ? existing.role : 'Teacher');
  var accessScope = payload.accessScope || (existing ? existing.accessScope : deriveUserAccessScopeGas(role));

  var record = {
    id: payload.id || ('USR_' + Utilities.getUuid().substring(0, 8)),
    username: String(payload.username || (existing ? existing.username : '')).trim().toLowerCase(),
    loginNumber: loginNumber,
    passwordHash: passwordHash || (existing ? existing.passwordHash : ''),
    passwordSalt: passwordHash ? salt : (existing ? existing.passwordSalt : ''),
    passwordAlgorithm: 'PBKDF2-HMAC-SHA256',
    passwordIterations: iterations,
    passwordInitialized: passwordInitialized,
    activationTokenHash: payload.activationTokenHash || (existing ? existing.activationTokenHash : ''),
    activationExpiresAt: payload.activationExpiresAt || (existing ? existing.activationExpiresAt : ''),
    fullName: payload.fullName !== undefined ? payload.fullName : (existing ? existing.fullName : ''),
    role: role,
    accessScope: accessScope,
    schoolId: payload.schoolId !== undefined ? payload.schoolId : (existing ? existing.schoolId : ''),
    allowedSchoolIds: Array.isArray(payload.allowedSchoolIds)
      ? JSON.stringify(payload.allowedSchoolIds)
      : (payload.allowedSchoolIds !== undefined ? payload.allowedSchoolIds : (existing ? existing.allowedSchoolIds : '[]')),
    employeeId: payload.employeeId !== undefined ? payload.employeeId : (existing ? existing.employeeId : ''),
    status: payload.status || (existing ? existing.status : 'Active'),
    department: payload.department !== undefined ? payload.department : (existing ? existing.department : ''),
    email: payload.email || (existing ? existing.email : ''),
    createdAt: existing ? existing.createdAt : getCairoISOString(),
    updatedAt: getCairoISOString(),
    lastLogin: existing ? existing.lastLogin : '',
    passwordChangedAt: passwordHash ? getCairoISOString() : (existing ? existing.passwordChangedAt : '')
  };

  upsertRecord(ss, SHEETS.USERS, 'id', record);

  return sanitizeUserDTO(record);
}

/**
 * MIG_SCOPE_015: First-Login & Activation System Permanently Decommissioned
 */
function handleFirstLoginPasswordSetup(ss, payload, requestId) {
  return {
    success: false,
    code: 'FIRST_LOGIN_DECOMMISSIONED',
    message: 'تم إلغاء نظام أول دخول وأكواد التفعيل نهائياً. يتم إنشاء وتعيين كلمات المرور مباشرة عبر إدارة النظام.'
  };
}

function issueUserActivationTokenSecure(ss, targetUserId, authenticatedUsername, requestId) {
  return {
    success: false,
    code: 'ACTIVATION_DECOMMISSIONED',
    message: 'تم إلغاء نظام أكواد التفعيل نهائياً. يتم تعيين كلمة المرور مباشرة عبر إدارة النظام.'
  };
}

function revokeAllUserSessions(ss, targetUserId) {
  var sessionsSheet = ss.getSheetByName(SHEETS.SESSIONS);
  if (sessionsSheet && sessionsSheet.getLastRow() > 1) {
    var sData = sessionsSheet.getDataRange().getValues();
    var sHeaders = sData[0];
    var uIdCol = sHeaders.indexOf('userId');
    var statusCol = sHeaders.indexOf('status');
    if (uIdCol >= 0 && statusCol >= 0) {
      for (var s = 1; s < sData.length; s++) {
        if (sData[s][uIdCol] === targetUserId) {
          sessionsSheet.getRange(s + 1, statusCol + 1).setValue('REVOKED');
        }
      }
    }
  }

  var teacherSessionsSheet = ss.getSheetByName(SHEETS.TEACHER_SESSIONS);
  if (teacherSessionsSheet && teacherSessionsSheet.getLastRow() > 1) {
    var tsData = teacherSessionsSheet.getDataRange().getValues();
    var tsHeaders = tsData[0];
    var tIdCol = tsHeaders.indexOf('teacherId');
    var tStatusCol = tsHeaders.indexOf('status');
    if (tIdCol >= 0 && tStatusCol >= 0) {
      for (var ts = 1; ts < tsData.length; ts++) {
        if (tsData[ts][tIdCol] === targetUserId) {
          teacherSessionsSheet.getRange(ts + 1, tStatusCol + 1).setValue('REVOKED');
        }
      }
    }
  }
}

function toggleUserStatusSecure(ss, targetUserId, newStatus) {
  var usersSheet = ss.getSheetByName(SHEETS.USERS);
  if (!usersSheet) return { success: false, message: 'جدول المستخدمين غير متوفر' };

  var data = usersSheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('id');
  var statusCol = headers.indexOf('status');

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === targetUserId) {
      var desired = newStatus || (data[i][statusCol] === 'Active' ? 'Suspended' : 'Active');
      usersSheet.getRange(i + 1, statusCol + 1).setValue(desired);
      if (desired !== 'Active') {
        revokeAllUserSessions(ss, targetUserId);
      }
      return { success: true, status: desired, message: 'تم تحديث حالة الحساب إلى ' + desired };
    }
  }
  return { success: false, message: 'المستخدم غير موجود' };
}

function getPublicClassSchedule(ss, gradeIdentifier, classroomIdentifier) {
  var cleanGrade = String(gradeIdentifier || '').trim().toLowerCase();
  var cleanClass = String(classroomIdentifier || '').trim().toLowerCase();

  if (!cleanGrade || !cleanClass) {
    return {
      success: false,
      code: 'PARAMETERS_REQUIRED',
      message: 'يرجى تحديد الصف الدراسي والفصل'
    };
  }

  var allSchedule = getSheetData(ss, SHEETS.SCHEDULE);

  var matching = allSchedule.filter(function(s) {
    var status = String(s.status || '').trim().toLowerCase();
    if (status !== 'published') return false;
    if (s.isActive === false || s.isActive === 'false') return false;
    if (s.isCancelled === true || s.isCancelled === 'true') return false;

    var sGrade = String(s.grade || s.gradeName || s.gradeId || '').trim().toLowerCase();
    var gradeMatches = (sGrade === cleanGrade);
    if (!gradeMatches) {
      gradeMatches = sGrade.indexOf(cleanGrade) !== -1 || cleanGrade.indexOf(sGrade) !== -1;
    }

    var sClass = String(s.classroom || s.classroomName || s.classroomId || '').trim().toLowerCase();
    var classMatches = (sClass === cleanClass);
    if (!classMatches) {
      classMatches = sClass.indexOf(cleanClass) !== -1 || cleanClass.indexOf(sClass) !== -1;
    }

    return gradeMatches && classMatches;
  });

  var dayWeights = { 'الأحد': 1, 'الإثنين': 2, 'الاثنين': 2, 'الثلاثاء': 3, 'الأربعاء': 4, 'الاربعاء': 4, 'الخميس': 5 };
  matching.sort(function(a, b) {
    var dayA = dayWeights[a.dayOfWeek || a.dayName] || 9;
    var dayB = dayWeights[b.dayOfWeek || b.dayName] || 9;
    if (dayA !== dayB) return dayA - dayB;
    return parseInt(a.periodNumber || 0, 10) - parseInt(b.periodNumber || 0, 10);
  });

  var safeLessons = matching.map(function(s) {
    return {
      dayOfWeek: String(s.dayOfWeek || s.dayName || '').trim(),
      periodNumber: parseInt(s.periodNumber || '0', 10),
      startTime: String(s.startTime || '').trim(),
      endTime: String(s.endTime || '').trim(),
      subjectName: String(s.subject || s.subjectName || '').trim(),
      teacherDisplayName: String(s.teacherName || 'معلم المادة').trim(),
      roomName: String(s.room || s.roomId || '').trim()
    };
  });

  return {
    success: true,
    gradeName: gradeIdentifier,
    classroomName: classroomIdentifier,
    schedule: safeLessons
  };
}

function resetUserPasswordSecure(ss, userId, newPassword, authenticatedUsername, requestId) {
  if (!newPassword || newPassword.length < 8) {
    return { success: false, code: 'PASSWORD_TOO_WEAK', message: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف' };
  }

  var usersSheet = ss.getSheetByName(SHEETS.USERS);
  if (!usersSheet) return { success: false, message: 'جدول المستخدمين غير متوفر' };

  var data = usersSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: 'مستخدم غير موجود' };
  var headers = data[0];
  var idCol = headers.indexOf('id');
  var hashCol = headers.indexOf('passwordHash');
  var saltCol = headers.indexOf('passwordSalt');
  var algoCol = headers.indexOf('passwordAlgorithm');
  var iterCol = headers.indexOf('passwordIterations');
  var changedCol = headers.indexOf('passwordChangedAt');

  var salt = Utilities.getUuid().replace(/-/g, '');
  var newHash = computeSaltedHash(newPassword, salt, PBKDF2_ITERATIONS);

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === userId) {
      usersSheet.getRange(i + 1, hashCol + 1).setValue(newHash);
      usersSheet.getRange(i + 1, saltCol + 1).setValue(salt);
      if (algoCol >= 0) usersSheet.getRange(i + 1, algoCol + 1).setValue('PBKDF2-HMAC-SHA256');
      if (iterCol >= 0) usersSheet.getRange(i + 1, iterCol + 1).setValue(PBKDF2_ITERATIONS);
      if (changedCol >= 0) usersSheet.getRange(i + 1, changedCol + 1).setValue(getCairoISOString());

      return { success: true, message: 'تمت إعادة تعيين وتشفير كلمة المرور بنجاح' };
    }
  }

  return { success: false, message: 'المستخدم غير موجود' };
}

function updateUserPasswordColumns(ss, rowIndex, hash, salt, algo, iter) {
  var sheet = ss.getSheetByName(SHEETS.USERS);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var hashCol = headers.indexOf('passwordHash') + 1;
  var saltCol = headers.indexOf('passwordSalt') + 1;
  var algoCol = headers.indexOf('passwordAlgorithm') + 1;
  var iterCol = headers.indexOf('passwordIterations') + 1;

  if (hashCol > 0) sheet.getRange(rowIndex, hashCol).setValue(hash);
  if (saltCol > 0) sheet.getRange(rowIndex, saltCol).setValue(salt);
  if (algoCol > 0) sheet.getRange(rowIndex, algoCol).setValue(algo);
  if (iterCol > 0) sheet.getRange(rowIndex, iterCol).setValue(iter);
}

// -------------------------------------------------------------
// CRYPTOGRAPHIC & TIME HELPERS
// -------------------------------------------------------------

function hashStringSHA256(text) {
  if (!text) return '';
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytesToHex(raw);
}

function computeSaltedHash(password, salt, iterations) {
  var key = password + salt;
  var digest = Utilities.computeHmacSha256Signature(key, salt);
  for (var i = 1; i < iterations; i++) {
    digest = Utilities.computeHmacSha256Signature(digest, salt);
  }
  return bytesToHex(digest);
}

function generateSecureRandomToken(length) {
  var len = length || 32;
  // Cryptographically secure token generation using multiple UUIDs + high-res timestamp hashed with SHA-256
  var entropySource = Utilities.getUuid() + '-' + Utilities.getUuid() + '-' + new Date().getTime() + '-' + Utilities.getUuid();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, entropySource);
  var hex = bytesToHex(digest);
  while (hex.length < len) {
    var extra = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + '-' + hex);
    hex += bytesToHex(extra);
  }
  return hex.substring(0, len);
}

function bytesToHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var byteHex = b.toString(16);
    if (byteHex.length === 1) byteHex = '0' + byteHex;
    hex += byteHex;
  }
  return hex;
}

function getCairoISOString() {
  return Utilities.formatDate(new Date(), 'Africa/Cairo', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
}

function getCairoDateString() {
  return Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd');
}

function getCairoDayName(dateStr) {
  var d = new Date(dateStr + 'T12:00:00Z');
  var days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return days[d.getDay()] || 'الأحد';
}

function getCairoWeekRange(dateStr) {
  var d = new Date(dateStr + 'T12:00:00Z');
  var day = d.getDay(); // 0 = Sunday
  var sun = new Date(d);
  sun.setDate(d.getDate() - day);
  var sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  var fmt = function(dt) { return dt.toISOString().split('T')[0]; };
  return { start: fmt(sun), end: fmt(sat) };
}

function recordAuthoritativeAudit(ss, requestId, username, role, action, entity, targetId, details) {
  try {
    var sheet = ss.getSheetByName(SHEETS.AUDIT_LOGS);
    if (!sheet) return;

    var logId = 'AUD_' + Utilities.getUuid().substring(0, 10);
    var nowStr = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd HH:mm:ss');
    var row = [
      logId,
      nowStr,
      username || 'SYSTEM',
      role || 'System',
      action || 'UNKNOWN',
      entity || 'GENERAL',
      targetId || '',
      details || '',
      requestId || ''
    ];
    sheet.appendRow(row);
  } catch (auditErr) {}
}

function getSettingsDataClean(ss) {
  var sheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (!sheet) return {};
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return {};

  var obj = {};
  for (var i = 1; i < data.length; i++) {
    var k = data[i][0];
    var v = data[i][1];
    if (k) {
      try {
        obj[k] = JSON.parse(v);
      } catch (e) {
        obj[k] = v;
      }
    }
  }
  return obj;
}

function saveSettingsDataClean(ss, settingsObj) {
  var sheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (!sheet) return;

  sheet.clearContents();
  var headers = ['key', 'value', 'updatedAt'];
  sheet.appendRow(headers);
  var now = getCairoISOString();

  for (var k in settingsObj) {
    var val = typeof settingsObj[k] === 'object' ? JSON.stringify(settingsObj[k]) : String(settingsObj[k]);
    sheet.appendRow([k, val, now]);
  }
  styleHeaderRow(sheet, headers.length);
}

function executeServerSideArchive(ss, authenticatedUsername, requestId) {
  var retiredSheets = [
    'Payroll',
    'Payroll_Snapshots',
    'Salary_History',
    'Class_Attendance',
    'Samat_Programs',
    'Samat_Competencies',
    'Parent_Portal_Users',
    'Parent_Day'
  ];

  var archiveTimestamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyyMMdd_HHmmss');
  var totalRowsArchived = 0;
  var archivedEntities = [];

  for (var i = 0; i < retiredSheets.length; i++) {
    var sheetName = retiredSheets[i];
    var s = ss.getSheetByName(sheetName);
    if (s) {
      var rowCount = s.getLastRow();
      if (rowCount > 1) {
        var archiveSheetName = 'Archive_' + sheetName + '_' + archiveTimestamp;
        s.setName(archiveSheetName);
        archivedEntities.push({ sheet: sheetName, rows: rowCount - 1, archivedTo: archiveSheetName });
        totalRowsArchived += (rowCount - 1);
      } else {
        ss.deleteSheet(s);
      }
    }
  }

  return {
    archivedAt: getCairoISOString(),
    archivedBy: authenticatedUsername,
    archivedEntities: archivedEntities,
    totalRowsArchived: totalRowsArchived
  };
}

// -------------------------------------------------------------
// SPREADSHEET SCHEMA & INITIALIZATION
// -------------------------------------------------------------

function ensureProductionStaffSheetsExist(ss) {
  var sheetDefinitions = {
    Master_Schools: ['schoolId', 'schoolCode', 'schoolName', 'spreadsheetId', 'status', 'createdAt', 'updatedAt'],
    Users: ['id', 'username', 'passwordHash', 'passwordSalt', 'passwordAlgorithm', 'passwordIterations', 'fullName', 'role', 'status', 'department', 'email', 'schoolId', 'allowedSchoolIds', 'employeeId', 'createdAt', 'lastLogin', 'passwordChangedAt'],
    Sessions: ['sessionId', 'tokenHash', 'userId', 'username', 'fullName', 'role', 'schoolId', 'email', 'accessScope', 'allowedSchoolIds', 'activeSchoolId', 'employeeId', 'createdAt', 'expiresAt', 'status'],
    Employees: ['id', 'employeeNumber', 'name', 'nationalId', 'department', 'jobTitle', 'teacherCode', 'hireDate', 'workingHours', 'workStartTime', 'workEndTime', 'daysOff', 'status', 'phone', 'email'],
    Attendance: ['id', 'employeeId', 'employeeName', 'department', 'date', 'dayName', 'checkIn', 'checkOut', 'workingHours', 'lateMinutes', 'earlyLeaveMinutes', 'overtimeHours', 'status', 'notes', 'checkInTimestamp', 'checkOutTimestamp', 'updatedAt'],
    Leaves: ['id', 'employeeId', 'employeeName', 'department', 'leaveType', 'startDate', 'endDate', 'daysCount', 'status', 'reason', 'createdAt', 'approvedBy'],
    Permissions: ['id', 'employeeId', 'employeeName', 'department', 'date', 'permissionFrom', 'permissionTo', 'durationMinutes', 'permissionType', 'reason', 'status', 'createdAt'],
    Settings: ['key', 'value', 'updatedAt'],
    Audit_Logs: ['id', 'timestamp', 'username', 'userRole', 'action', 'entity', 'targetId', 'details', 'requestId'],
    Students: ['id', 'studentCode', 'name', 'nationalId', 'grade', 'classroom', 'gender', 'birthDate', 'religion', 'parentName', 'parentPhone', 'parentJob', 'status', 'createdAt'],
    Student_Attendance: ['id', 'studentId', 'studentCode', 'studentName', 'grade', 'classroom', 'date', 'dayName', 'status', 'lateMinutes', 'excused', 'notes', 'recordedBy', 'recordedAt'],
    Behavior_Violations: ['id', 'studentId', 'studentName', 'grade', 'classroom', 'violationType', 'level', 'actionTaken', 'pointsDeducted', 'date', 'recordedBy', 'notes'],
    Behavior_Cases: ['id', 'studentId', 'studentName', 'grade', 'classroom', 'caseType', 'status', 'socialSpecialistNotes', 'actionPlan', 'openedDate', 'closedDate'],
    Positive_Behavior_Types: ['id', 'title', 'category', 'points', 'description'],
    Academic_Years: ['id', 'name', 'startDate', 'endDate', 'isActive', 'status'],
    Student_Enrollments: ['id', 'studentId', 'academicYearId', 'grade', 'classroom', 'status', 'enrollmentDate'],
    Parent_Communications: ['id', 'studentId', 'studentName', 'parentName', 'parentPhone', 'type', 'reason', 'notes', 'staffMember', 'date'],
    Locations: ['id', 'name', 'type', 'capacity', 'building', 'floor'],
    Archive_Metrics: ['id', 'archivedAt', 'archivedBy', 'reason', 'archivedSheetsCount', 'payloadJson'],

    // Timetable System Sheets
    Teacher_Teaching_Assignments: ['id', 'teacherId', 'teacherCode', 'teacherName', 'subjectId', 'subjectName', 'gradeId', 'classroomId', 'classroomName', 'requiredPeriodsPerWeek', 'academicYearId', 'termId', 'isActive', 'createdAt', 'updatedAt'],
    Schedule: ['id', 'dayOfWeek', 'periodNumber', 'classroomId', 'classroom', 'gradeId', 'grade', 'subjectId', 'subject', 'teacherId', 'teacherCode', 'teacherName', 'room', 'status', 'academicYearId', 'termId', 'version', 'isActive', 'createdAt', 'updatedAt'],
    Schedule_Breaks: ['id', 'name', 'afterPeriod', 'startTime', 'endTime', 'durationMinutes', 'isActive'],
    Teacher_Availability: ['id', 'teacherId', 'dayOfWeek', 'periodNumber', 'availabilityStatus', 'notes'],
    Reserve_Assignments: ['id', 'date', 'dayOfWeek', 'periodNumber', 'classroom', 'classroomId', 'grade', 'subject', 'originalTeacherId', 'originalTeacherName', 'substituteTeacherId', 'substituteTeacherName', 'substituteTeacherCode', 'status', 'assignedBy', 'assignedAt', 'reason', 'notes'],
    Supervision_Locations: ['id', 'name', 'building', 'floor', 'description', 'isActive'],
    Supervision_Assignments: ['id', 'date', 'dayOfWeek', 'periodNumber', 'timeSlot', 'shift', 'locationId', 'locationName', 'teacherId', 'teacherName', 'teacherCode', 'status', 'notes', 'assignedBy', 'assignedAt'],
    Homework: ['id', 'title', 'description', 'subject', 'grade', 'classroom', 'classroomId', 'teacherId', 'teacherName', 'assignedDate', 'dueDate', 'status', 'createdAt', 'updatedAt'],
    Teacher_Resources: ['id', 'title', 'topic', 'subject', 'classroom', 'classroomId', 'teacherId', 'teacherName', 'studentResourceUrl', 'presentationUrl', 'preparationNotesUrl', 'visibility', 'createdAt', 'updatedAt'],
    Exam_Schedules: ['id', 'academicYearId', 'termId', 'examType', 'subjectId', 'subjectName', 'gradeId', 'gradeName', 'classroomId', 'classroomName', 'examDate', 'startTime', 'durationMinutes', 'roomId', 'roomName', 'chiefInvigilatorId', 'chiefInvigilatorName', 'instructions', 'status', 'createdAt', 'updatedAt'],
    Student_Access_Tokens: ['id', 'studentId', 'studentCode', 'tokenHash', 'issuedAt', 'expiresAt', 'revokedAt', 'status', 'lastAccessedAt', 'createdBy'],
    Teacher_Sessions: ['sessionId', 'tokenHash', 'teacherId', 'employeeId', 'teacherCode', 'teacherName', 'schoolId', 'createdAt', 'expiresAt', 'status'],
    Teacher_Credentials: ['id', 'employeeId', 'teacherCode', 'username', 'usernameNormalized', 'passwordHash', 'passwordSalt', 'passwordAlgorithm', 'passwordIterations', 'status', 'mustChangePassword', 'failedLoginAttempts', 'lockedUntil', 'lastLoginAt', 'createdAt', 'updatedAt', 'teacherId', 'pinHash', 'salt']
  };

  for (var name in sheetDefinitions) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      var headers = sheetDefinitions[name];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      styleHeaderRow(sheet, headers.length);
    } else {
      var lastCol = sheet.getLastColumn();
      var lastRow = sheet.getLastRow();
      if (lastCol === 0 || lastRow === 0) {
        var h = sheetDefinitions[name];
        sheet.getRange(1, 1, 1, h.length).setValues([h]);
        styleHeaderRow(sheet, h.length);
      }
    }
  }

  // Idempotent migration MIG_SCOPE_013: safely retire legacy PIN support from Teacher_Credentials
  runMigrationScope013RetireTeacherPin(ss);

  // Idempotent migration MIG_SCOPE_015: multi-school isolation & decommission activation
  runMigrationScope015MultiSchoolAndDecommissionActivation(ss);
}

function getSheetData(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var result = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var h = headers[j];
      if (h) {
        obj[h] = row[j];
      }
    }
    result.push(obj);
  }
  return result;
}

function upsertRecord(ss, sheetName, keyColumn, record) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var keyColIndex = headers.indexOf(keyColumn);
  if (keyColIndex === -1) return;

  var keyValue = record[keyColumn];
  var targetRow = -1;

  if (lastRow > 1) {
    var keyValues = sheet.getRange(2, keyColIndex + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keyValues.length; i++) {
      if (String(keyValues[i][0]).toLowerCase() === String(keyValue).toLowerCase()) {
        targetRow = i + 2;
        break;
      }
    }
  }

  var rowData = headers.map(function(h) {
    var val = record[h];
    return val !== undefined ? val : '';
  });

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

function deleteRecord(ss, sheetName, keyColumn, keyValue) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return;

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var keyColIndex = headers.indexOf(keyColumn);
  if (keyColIndex === -1) return;

  var keyValues = sheet.getRange(2, keyColIndex + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < keyValues.length; i++) {
    if (String(keyValues[i][0]).toLowerCase() === String(keyValue).toLowerCase()) {
      sheet.deleteRow(i + 2);
      break;
    }
  }
}

function styleHeaderRow(sheet, numCols) {
  try {
    var range = sheet.getRange(1, 1, 1, numCols);
    range.setBackground('#008e8b');
    range.setFontColor('#FFFFFF');
    range.setFontWeight('bold');
    range.setFontSize(10);
    sheet.setFrozenRows(1);
  } catch (e) {}
}

function createJsonResponse(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// -------------------------------------------------------------
// BATCH ATTENDANCE & SECURE TEACHER ACCOUNT HELPERS
// -------------------------------------------------------------

function findStudentRecordById(records, id) {
  var targetId = String(id || '').trim().toLowerCase();
  if (!targetId) return null;
  for (var i = 0; i < records.length; i++) {
    if (String(records[i].id || records[i].studentId || '').trim().toLowerCase() === targetId) {
      return records[i];
    }
  }
  return null;
}

function validateManagedStudentUniqueness(students, studentId, studentCode, nationalId) {
  var ownId = String(studentId || '').trim().toLowerCase();
  var code = String(studentCode || '').trim().toLowerCase();
  var nid = String(nationalId || '').trim();

  for (var i = 0; i < students.length; i++) {
    var currentId = String(students[i].id || students[i].studentId || '').trim().toLowerCase();
    if (ownId && currentId === ownId) continue;

    if (code && String(students[i].studentCode || '').trim().toLowerCase() === code) {
      return { success: false, code: 'DUPLICATE_STUDENT_CODE', message: 'كود الطالب مستخدم بالفعل داخل المدرسة.' };
    }
    if (nid && String(students[i].nationalId || '').trim() === nid) {
      return { success: false, code: 'DUPLICATE_STUDENT_NATIONAL_ID', message: 'الرقم القومي مستخدم بالفعل لطالب آخر داخل المدرسة.' };
    }
  }

  return { success: true };
}

function normalizeManagedStudentPayload(payload, existing, effectiveSchoolId) {
  payload = payload || {};
  existing = existing || {};

  var name = String(payload.name !== undefined ? payload.name : existing.name || '').trim();
  var stage = String(payload.stage !== undefined ? payload.stage : existing.stage || '').trim();
  var grade = String(payload.grade !== undefined ? payload.grade : existing.grade || '').trim();
  var classroom = String(payload.classroom !== undefined ? payload.classroom : existing.classroom || '').trim();
  var studentCode = String(payload.studentCode !== undefined ? payload.studentCode : existing.studentCode || '').trim();

  if (!name || !grade || !classroom) {
    return {
      success: false,
      code: 'INVALID_STUDENT_PAYLOAD',
      message: 'اسم الطالب والصف والفصل حقول مطلوبة.'
    };
  }

  if (!studentCode) {
    studentCode = 'STD-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
  }

  var status = String(existing.status || 'نشط').trim();
  if (!existing.id) status = 'نشط';

  return {
    success: true,
    student: {
      id: String(existing.id || '').trim(),
      schoolId: String(effectiveSchoolId || '').trim().toUpperCase(),
      studentCode: studentCode,
      name: name,
      nationalId: String(payload.nationalId !== undefined ? payload.nationalId : existing.nationalId || '').trim(),
      gender: String(payload.gender !== undefined ? payload.gender : existing.gender || '').trim(),
      religion: String(payload.religion !== undefined ? payload.religion : existing.religion || '').trim(),
      studentStatus: String(payload.studentStatus !== undefined ? payload.studentStatus : existing.studentStatus || '').trim(),
      birthDate: String(payload.birthDate !== undefined ? payload.birthDate : existing.birthDate || '').trim(),
      stage: stage,
      stageId: String(payload.stageId !== undefined ? payload.stageId : existing.stageId || '').trim(),
      grade: grade,
      gradeId: String(payload.gradeId !== undefined ? payload.gradeId : existing.gradeId || '').trim(),
      gradeName: String(payload.gradeName !== undefined ? payload.gradeName : existing.gradeName || grade).trim(),
      classroom: classroom,
      classroomId: String(payload.classroomId !== undefined ? payload.classroomId : existing.classroomId || '').trim(),
      classroomNumber: String(payload.classroomNumber !== undefined ? payload.classroomNumber : existing.classroomNumber || '').trim(),
      section: String(payload.section !== undefined ? payload.section : existing.section || '').trim(),
      academicYear: String(payload.academicYear !== undefined ? payload.academicYear : existing.academicYear || '').trim(),
      academicYearId: String(payload.academicYearId !== undefined ? payload.academicYearId : existing.academicYearId || '').trim(),
      status: status,
      enrollmentDate: String(payload.enrollmentDate !== undefined ? payload.enrollmentDate : existing.enrollmentDate || '').trim(),
      phone: String(payload.phone !== undefined ? payload.phone : existing.phone || '').trim(),
      parentId: String(payload.parentId !== undefined ? payload.parentId : existing.parentId || '').trim(),
      parentName: String(payload.parentName !== undefined ? payload.parentName : existing.parentName || '').trim(),
      relationship: String(payload.relationship !== undefined ? payload.relationship : existing.relationship || '').trim(),
      parentPhone: String(payload.parentPhone !== undefined ? payload.parentPhone : existing.parentPhone || '').trim(),
      parentEmail: String(payload.parentEmail !== undefined ? payload.parentEmail : existing.parentEmail || '').trim().toLowerCase(),
      address: String(payload.address !== undefined ? payload.address : existing.address || '').trim(),
      initialBehaviorScore: payload.initialBehaviorScore !== undefined
        ? Number(payload.initialBehaviorScore)
        : (existing.initialBehaviorScore !== undefined ? Number(existing.initialBehaviorScore) : 100),
      notes: String(payload.notes !== undefined ? payload.notes : existing.notes || '').trim()
    }
  };
}

function upsertManagedStudentEnrollment(ss, student, enrollmentContext, actorUsername) {
  enrollmentContext = enrollmentContext || {};
  var academicYearId = String(enrollmentContext.academicYearId || student.academicYearId || '').trim();
  if (!academicYearId) return null;

  var academicYears = getSheetData(ss, SHEETS.ACADEMIC_YEARS);
  var matchedYear = null;
  for (var i = 0; i < academicYears.length; i++) {
    if (String(academicYears[i].id || '').trim() === academicYearId) {
      matchedYear = academicYears[i];
      break;
    }
  }

  var academicYearName = String(
    (matchedYear && matchedYear.name) ||
    enrollmentContext.academicYearName ||
    student.academicYear ||
    ''
  ).trim();

  var now = getCairoISOString();
  var enrollments = getSheetData(ss, SHEETS.STUDENT_ENROLLMENTS);
  var existingEnrollment = null;
  for (var e = 0; e < enrollments.length; e++) {
    if (
      String(enrollments[e].studentId || '').trim() === String(student.id || '').trim() &&
      String(enrollments[e].academicYearId || '').trim() === academicYearId
    ) {
      existingEnrollment = enrollments[e];
      break;
    }
  }

  var enrollment = {
    id: String((existingEnrollment && existingEnrollment.id) || ('ENR-' + student.id + '-' + academicYearId)).trim(),
    studentId: student.id,
    studentCode: student.studentCode,
    studentName: student.name,
    academicYearId: academicYearId,
    academicYearName: academicYearName,
    gradeId: student.gradeId || '',
    grade: student.grade,
    classroomId: student.classroomId || '',
    classroom: student.classroom,
    section: student.section || '',
    stage: student.stage || '',
    enrollmentStatus: student.status === 'نشط' || student.status === 'Active' ? 'نشط' : 'موقوف',
    status: 'ACTIVE',
    promotionStatus: (existingEnrollment && existingEnrollment.promotionStatus) || 'ENROLLED',
    enrollmentDate: String(
      (existingEnrollment && existingEnrollment.enrollmentDate) ||
      (matchedYear && matchedYear.startDate) ||
      enrollmentContext.enrollmentDate ||
      student.enrollmentDate ||
      ''
    ).trim(),
    createdBy: String((existingEnrollment && existingEnrollment.createdBy) || actorUsername || '').trim(),
    createdAt: String((existingEnrollment && existingEnrollment.createdAt) || now).trim(),
    updatedAt: now
  };

  upsertRecord(ss, SHEETS.STUDENT_ENROLLMENTS, 'id', enrollment);
  return enrollment;
}

function createManagedStudentRecord(ss, payload, effectiveSchoolId, actorUsername, actorRole, requestId) {
  var normalized = normalizeManagedStudentPayload(payload, {}, effectiveSchoolId);
  if (!normalized.success) return normalized;

  var students = getSheetData(ss, SHEETS.STUDENTS);
  var uniqueness = validateManagedStudentUniqueness(
    students,
    '',
    normalized.student.studentCode,
    normalized.student.nationalId
  );
  if (!uniqueness.success) return uniqueness;

  var now = getCairoISOString();
  normalized.student.id = 'STU-' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
  normalized.student.studentId = normalized.student.id;
  normalized.student.createdAt = now;
  normalized.student.updatedAt = now;

  upsertRecord(ss, SHEETS.STUDENTS, 'id', normalized.student);
  var enrollment = upsertManagedStudentEnrollment(
    ss,
    normalized.student,
    payload.enrollmentContext || {},
    actorUsername
  );

  recordAuthoritativeAudit(
    ss,
    requestId,
    actorUsername,
    actorRole,
    'STUDENT_CREATED',
    'STUDENTS',
    normalized.student.id,
    'إنشاء سجل طالب معتمد'
  );

  return {
    success: true,
    message: 'تم إنشاء الطالب بنجاح.',
    student: normalized.student,
    enrollment: enrollment
  };
}

function updateManagedStudentRecord(ss, payload, effectiveSchoolId, actorUsername, actorRole, requestId) {
  var studentId = String(payload.id || '').trim();
  if (!studentId) {
    return { success: false, code: 'STUDENT_ID_REQUIRED', message: 'معرف الطالب مطلوب للتعديل.' };
  }

  var students = getSheetData(ss, SHEETS.STUDENTS);
  var existing = findStudentRecordById(students, studentId);
  if (!existing) {
    return { success: false, code: 'RESOURCE_NOT_FOUND', message: 'سجل الطالب غير موجود.', httpStatus: 404 };
  }

  if (
    existing.schoolId &&
    String(existing.schoolId).trim().toUpperCase() !== String(effectiveSchoolId || '').trim().toUpperCase()
  ) {
    return { success: false, code: 'CROSS_SCHOOL_ACCESS_DENIED', message: 'الطالب خارج نطاق المدرسة الحالية.', httpStatus: 403 };
  }

  var normalized = normalizeManagedStudentPayload(payload, existing, effectiveSchoolId);
  if (!normalized.success) return normalized;

  var uniqueness = validateManagedStudentUniqueness(
    students,
    studentId,
    normalized.student.studentCode,
    normalized.student.nationalId
  );
  if (!uniqueness.success) return uniqueness;

  normalized.student.id = String(existing.id || studentId).trim();
  normalized.student.studentId = normalized.student.id;
  normalized.student.status = String(existing.status || 'نشط').trim();
  normalized.student.createdAt = String(existing.createdAt || getCairoISOString()).trim();
  normalized.student.updatedAt = getCairoISOString();

  upsertRecord(ss, SHEETS.STUDENTS, 'id', normalized.student);
  var enrollment = upsertManagedStudentEnrollment(
    ss,
    normalized.student,
    payload.enrollmentContext || {},
    actorUsername
  );

  recordAuthoritativeAudit(
    ss,
    requestId,
    actorUsername,
    actorRole,
    'STUDENT_UPDATED',
    'STUDENTS',
    normalized.student.id,
    'تعديل سجل طالب معتمد'
  );

  return {
    success: true,
    message: 'تم تحديث بيانات الطالب بنجاح.',
    student: normalized.student,
    enrollment: enrollment
  };
}

function setManagedStudentStatus(ss, payload, effectiveSchoolId, actorUsername, actorRole, requestId) {
  var studentId = String(payload.id || '').trim();
  var requestedStatus = String(payload.status || '').trim();

  var allowedStatuses = ['نشط', 'غير نشط', 'موقوف', 'منقول', 'متخرج', 'Active', 'Inactive'];
  if (!studentId || allowedStatuses.indexOf(requestedStatus) === -1) {
    return { success: false, code: 'INVALID_STUDENT_STATUS_REQUEST', message: 'معرف الطالب وحالة صالحة مطلوبان.' };
  }

  var students = getSheetData(ss, SHEETS.STUDENTS);
  var existing = findStudentRecordById(students, studentId);
  if (!existing) {
    return { success: false, code: 'RESOURCE_NOT_FOUND', message: 'سجل الطالب غير موجود.', httpStatus: 404 };
  }

  if (
    existing.schoolId &&
    String(existing.schoolId).trim().toUpperCase() !== String(effectiveSchoolId || '').trim().toUpperCase()
  ) {
    return { success: false, code: 'CROSS_SCHOOL_ACCESS_DENIED', message: 'الطالب خارج نطاق المدرسة الحالية.', httpStatus: 403 };
  }

  existing.schoolId = String(effectiveSchoolId || '').trim().toUpperCase();
  existing.status = requestedStatus === 'Active' ? 'نشط' : requestedStatus === 'Inactive' ? 'غير نشط' : requestedStatus;
  existing.updatedAt = getCairoISOString();

  upsertRecord(ss, SHEETS.STUDENTS, 'id', existing);

  var enrollments = getSheetData(ss, SHEETS.STUDENT_ENROLLMENTS);
  for (var i = 0; i < enrollments.length; i++) {
    if (String(enrollments[i].studentId || '').trim() === studentId) {
      enrollments[i].enrollmentStatus = existing.status === 'نشط' ? 'نشط' : 'موقوف';
      enrollments[i].updatedAt = getCairoISOString();
      upsertRecord(ss, SHEETS.STUDENT_ENROLLMENTS, 'id', enrollments[i]);
    }
  }

  recordAuthoritativeAudit(
    ss,
    requestId,
    actorUsername,
    actorRole,
    'STUDENT_STATUS_CHANGED',
    'STUDENTS',
    studentId,
    'تغيير حالة الطالب إلى: ' + existing.status
  );

  return {
    success: true,
    message: existing.status === 'نشط' ? 'تم تفعيل الطالب.' : 'تم أرشفة الطالب كغير نشط.',
    student: existing
  };
}

function saveDailyStudentAttendanceBatch(ss, payload, authUsername, authRole, requestId) {
  payload = payload || {};
  var date = String(payload.date || '').trim();
  var gradeScope = String(payload.gradeId || '').trim();
  var classroomScope = String(payload.classroomId || '').trim();
  var records = payload.records;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !records || !Array.isArray(records) || records.length === 0) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'تاريخ صالح وسجلات حضور الطلاب مطلوبة' };
  }

  var parsedDate = new Date(date + 'T12:00:00Z');
  if (isNaN(parsedDate.getTime())) {
    return { success: false, code: 'INVALID_ATTENDANCE_DATE', message: 'تاريخ حضور الطلاب غير صالح' };
  }

  var sheet = ss.getSheetByName(SHEETS.STUDENT_ATTENDANCE);
  if (!sheet) {
    return { success: false, code: 'SHEET_NOT_FOUND', message: 'جدول حضور الطلاب غير موجود' };
  }

  var students = getSheetData(ss, SHEETS.STUDENTS);
  var studentMap = {};
  for (var s = 0; s < students.length; s++) {
    var studentKey = String(students[s].id || students[s].studentId || '').trim().toLowerCase();
    if (studentKey) studentMap[studentKey] = students[s];
  }

  var allowedStatuses = {
    'حاضر': 'حاضر',
    'متأخر': 'متأخر',
    'غائب': 'غائب',
    'غائب بعذر': 'غائب بعذر',
    'غائب بدون عذر': 'غائب بدون عذر',
    'مأذون': 'مأذون',
    'مريض': 'مريض',
    'نشاط / رحلة': 'نشاط / رحلة',
    'موقوف': 'موقوف',
    'هروب': 'هروب',
    'لم يسجل': 'لم يسجل',
    'عطلة': 'عطلة',
    'Present': 'حاضر',
    'Late': 'متأخر',
    'Absent': 'غائب',
    'Excused': 'مأذون'
  };

  function matchesScope(valueA, valueB, scopeValue) {
    if (!scopeValue) return true;
    var scope = String(scopeValue).trim().toLowerCase();
    return String(valueA || '').trim().toLowerCase() === scope ||
      String(valueB || '').trim().toLowerCase() === scope;
  }

  // Pre-validate the complete batch before any persistence.
  var validated = [];
  var seenStudentIds = {};
  for (var v = 0; v < records.length; v++) {
    var input = records[v] || {};
    var studentId = String(input.studentId || '').trim();
    var studentKey = studentId.toLowerCase();

    if (!studentId) {
      return { success: false, code: 'STUDENT_ID_REQUIRED', message: 'معرف الطالب مطلوب لكل سجل حضور' };
    }

    var student = studentMap[studentKey];
    if (!student) {
      return {
        success: false,
        code: 'ATTENDANCE_STUDENT_NOT_FOUND',
        message: 'تعذر حفظ الحضور: الطالب غير موجود في المدرسة النشطة: ' + studentId
      };
    }

    var studentStatus = String(student.status || student.studentStatus || '').trim().toLowerCase();
    if (studentStatus && studentStatus !== 'نشط' && studentStatus !== 'active') {
      return {
        success: false,
        code: 'ATTENDANCE_STUDENT_INACTIVE',
        message: 'تعذر حفظ الحضور لطالب غير نشط: ' + studentId
      };
    }

    if (seenStudentIds[studentKey]) {
      return {
        success: false,
        code: 'DUPLICATE_STUDENT_IN_BATCH',
        message: 'يوجد أكثر من سجل لنفس الطالب داخل دفعة الحضور: ' + studentId
      };
    }
    seenStudentIds[studentKey] = true;

    var suppliedDate = String(input.date || '').trim();
    if (suppliedDate && suppliedDate !== date) {
      return {
        success: false,
        code: 'STUDENT_ATTENDANCE_DATE_MISMATCH',
        message: 'تاريخ أحد سجلات الطلاب لا يطابق تاريخ الدفعة المعتمد'
      };
    }

    if (!matchesScope(student.gradeId, student.grade || student.gradeName, gradeScope)) {
      return {
        success: false,
        code: 'STUDENT_OUTSIDE_GRADE_SCOPE',
        message: 'الطالب خارج نطاق الصف المحدد للدفعة: ' + studentId
      };
    }

    if (!matchesScope(student.classroomId, student.classroom || student.classroomNumber, classroomScope)) {
      return {
        success: false,
        code: 'STUDENT_OUTSIDE_CLASSROOM_SCOPE',
        message: 'الطالب خارج نطاق الفصل المحدد للدفعة: ' + studentId
      };
    }

    var rawStatus = String(input.status || '').trim();
    var canonicalStatus = allowedStatuses[rawStatus];
    if (!canonicalStatus) {
      return {
        success: false,
        code: 'INVALID_STUDENT_ATTENDANCE_STATUS',
        message: 'حالة حضور غير معتمدة للطالب: ' + studentId
      };
    }

    var lateMinutes = parseInt(input.lateMinutes || 0, 10) || 0;
    if (lateMinutes < 0 || lateMinutes > 1440) {
      return {
        success: false,
        code: 'INVALID_LATE_MINUTES',
        message: 'عدد دقائق التأخير غير صالح للطالب: ' + studentId
      };
    }
    if (canonicalStatus !== 'متأخر') lateMinutes = 0;

    validated.push({
      input: input,
      student: student,
      studentId: studentId,
      status: canonicalStatus,
      lateMinutes: lateMinutes
    });
  }

  var existing = getSheetData(ss, SHEETS.STUDENT_ATTENDANCE);
  var existingMap = {};
  for (var i = 0; i < existing.length; i++) {
    var item = existing[i];
    var itemKey = String(item.date || '').trim() + '_' + String(item.studentId || '').trim().toLowerCase();
    existingMap[itemKey] = item;
  }

  var dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var canonicalDayName = dayNames[parsedDate.getUTCDay()] || '';
  var savedRecords = [];

  for (var r = 0; r < validated.length; r++) {
    var entry = validated[r];
    var inputRecord = entry.input;
    var studentRecord = entry.student;
    var key = date + '_' + entry.studentId.toLowerCase();
    var prev = existingMap[key];

    var canonicalGrade = String(studentRecord.grade || studentRecord.gradeName || '').trim();
    var canonicalClassroom = String(studentRecord.classroom || studentRecord.classroomNumber || '').trim();
    var canonicalStage = String(studentRecord.stage || '').trim();

    var finalRecord = {
      id: (prev && prev.id) || ('STATT_' + date.replace(/-/g, '') + '_' + entry.studentId),
      studentId: entry.studentId,
      studentCode: String(studentRecord.studentCode || studentRecord.schoolStudentCode || '').trim(),
      studentName: String(studentRecord.name || '').trim(),
      stage: canonicalStage,
      grade: canonicalGrade,
      gradeId: String(studentRecord.gradeId || '').trim(),
      classroom: canonicalClassroom,
      classroomId: String(studentRecord.classroomId || '').trim(),
      academicYearId: String(studentRecord.academicYearId || '').trim(),
      date: date,
      dayName: canonicalDayName,
      status: entry.status,
      lateMinutes: entry.lateMinutes,
      excused: entry.status === 'مأذون' || entry.status === 'غائب بعذر' || entry.status === 'مريض',
      notes: String(inputRecord.notes || (prev && prev.notes) || '').trim(),
      recordedBy: authUsername || 'System',
      recordedAt: getCairoISOString(),
      updatedAt: getCairoISOString()
    };

    upsertRecord(ss, SHEETS.STUDENT_ATTENDANCE, 'id', finalRecord);
    savedRecords.push(finalRecord);
  }

  recordAuthoritativeAudit(
    ss,
    requestId,
    authUsername,
    authRole,
    'ATTENDANCE_BATCH_SAVE',
    'STUDENT_ATTENDANCE',
    date,
    'حفظ حضور وغياب دفعة طلاب - التاريخ: ' + date + ' - العدد: ' + savedRecords.length
  );

  return {
    success: true,
    message: 'تم حفظ حضور وغياب الطلاب بنجاح (' + savedRecords.length + ' طالب)',
    savedCount: savedRecords.length,
    records: savedRecords
  };
}

function saveDailyStaffAttendanceBatch(ss, payload, authUsername, authRole, requestId) {
  var date = String(payload.date || '').trim();
  var records = payload.records;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !records || !Array.isArray(records) || records.length === 0) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'تاريخ صالح وسجلات الحضور والغياب مطلوبة' };
  }

  var parsedDate = new Date(date + 'T12:00:00Z');
  if (isNaN(parsedDate.getTime())) {
    return { success: false, code: 'INVALID_ATTENDANCE_DATE', message: 'تاريخ الحضور غير صالح' };
  }

  var sheet = ss.getSheetByName(SHEETS.ATTENDANCE);
  if (!sheet) {
    return { success: false, code: 'SHEET_NOT_FOUND', message: 'جدول حضور العاملين غير موجود' };
  }

  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var employeeMap = {};
  for (var e = 0; e < employees.length; e++) {
    var employeeIdKey = String(employees[e].id || '').trim().toLowerCase();
    if (employeeIdKey) employeeMap[employeeIdKey] = employees[e];
  }

  var allowedStatuses = {
    'حاضر': 'حاضر',
    'متأخر': 'متأخر',
    'غائب': 'غائب',
    'مأذونية': 'مأذونية',
    'إذن عمل': 'إذن عمل',
    'إجازة': 'إجازة',
    'عطلة أسبوعية': 'عطلة أسبوعية',
    'راحة': 'راحة',
    'نصف يوم': 'نصف يوم',
    'Present': 'حاضر',
    'Late': 'متأخر',
    'Absent': 'غائب',
    'Excused': 'مأذونية'
  };

  // Pre-validate the entire batch before any writes to avoid partial persistence.
  var validated = [];
  var seenEmployeeIds = {};
  for (var v = 0; v < records.length; v++) {
    var input = records[v] || {};
    var empId = String(input.employeeId || '').trim();
    var empKey = empId.toLowerCase();

    if (!empId) {
      return { success: false, code: 'EMPLOYEE_ID_REQUIRED', message: 'رقم الموظف مطلوب لكل سجل حضور' };
    }
    if (!employeeMap[empKey]) {
      return {
        success: false,
        code: 'ATTENDANCE_EMPLOYEE_NOT_FOUND',
        message: 'تعذر حفظ الحضور: الموظف غير موجود في المدرسة النشطة: ' + empId
      };
    }
    if (seenEmployeeIds[empKey]) {
      return {
        success: false,
        code: 'DUPLICATE_EMPLOYEE_IN_BATCH',
        message: 'يوجد أكثر من سجل لنفس الموظف داخل دفعة الحضور: ' + empId
      };
    }
    seenEmployeeIds[empKey] = true;

    var suppliedDate = String(input.date || '').trim();
    if (suppliedDate && suppliedDate !== date) {
      return {
        success: false,
        code: 'ATTENDANCE_DATE_MISMATCH',
        message: 'تاريخ أحد سجلات الحضور لا يطابق تاريخ الدفعة المعتمد'
      };
    }

    var rawStatus = String(input.status || '').trim();
    var canonicalStatus = allowedStatuses[rawStatus];
    if (!canonicalStatus) {
      return {
        success: false,
        code: 'INVALID_ATTENDANCE_STATUS',
        message: 'حالة حضور غير معتمدة للموظف: ' + empId
      };
    }

    validated.push({
      input: input,
      employee: employeeMap[empKey],
      employeeId: empId,
      status: canonicalStatus
    });
  }

  var existing = getSheetData(ss, SHEETS.ATTENDANCE);
  var existingMap = {};
  for (var i = 0; i < existing.length; i++) {
    var item = existing[i];
    var itemKey = String(item.date || '').trim() + '_' + String(item.employeeId || '').trim().toLowerCase();
    existingMap[itemKey] = item;
  }

  var dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var canonicalDayName = dayNames[parsedDate.getUTCDay()] || '';
  var savedRecords = [];

  for (var r = 0; r < validated.length; r++) {
    var entry = validated[r];
    var rec = entry.input;
    var emp = entry.employee;
    var key = date + '_' + entry.employeeId.toLowerCase();
    var prev = existingMap[key];

    var isWorkingStatus = entry.status === 'حاضر' || entry.status === 'متأخر' || entry.status === 'نصف يوم';
    var scheduledStart = String(emp.workStartTime || '08:00').trim();
    var scheduledEnd = String(emp.workEndTime || '14:30').trim();

    var checkIn = isWorkingStatus
      ? String(rec.checkIn || (prev && prev.checkIn) || scheduledStart).trim()
      : '';
    var checkOut = isWorkingStatus
      ? String(rec.checkOut || (prev && prev.checkOut) || scheduledEnd).trim()
      : '';

    var checkInMinutes = parseTeacherSelfTime(checkIn);
    var checkOutMinutes = parseTeacherSelfTime(checkOut);
    var scheduledStartMinutes = parseTeacherSelfTime(scheduledStart);
    var scheduledEndMinutes = parseTeacherSelfTime(scheduledEnd);

    if ((checkIn && checkInMinutes === null) || (checkOut && checkOutMinutes === null)) {
      return {
        success: false,
        code: 'INVALID_ATTENDANCE_TIME',
        message: 'وقت الحضور أو الانصراف غير صالح للموظف: ' + entry.employeeId
      };
    }
    if (isWorkingStatus && checkInMinutes !== null && checkOutMinutes !== null && checkOutMinutes < checkInMinutes) {
      return {
        success: false,
        code: 'INVALID_ATTENDANCE_TIME_RANGE',
        message: 'وقت الانصراف يجب ألا يسبق وقت الحضور للموظف: ' + entry.employeeId
      };
    }

    var workingHours = 0;
    if (isWorkingStatus && checkInMinutes !== null && checkOutMinutes !== null) {
      workingHours = Math.round(((checkOutMinutes - checkInMinutes) / 60) * 100) / 100;
    }

    var lateMinutes = 0;
    if (isWorkingStatus && checkInMinutes !== null && scheduledStartMinutes !== null) {
      lateMinutes = Math.max(0, checkInMinutes - scheduledStartMinutes);
    }

    var earlyLeaveMinutes = 0;
    var overtimeHours = 0;
    if (isWorkingStatus && checkOutMinutes !== null && scheduledEndMinutes !== null) {
      earlyLeaveMinutes = Math.max(0, scheduledEndMinutes - checkOutMinutes);
      overtimeHours = Math.round((Math.max(0, checkOutMinutes - scheduledEndMinutes) / 60) * 100) / 100;
    }

    var finalRecord = {
      id: (prev && prev.id) || ('EMPATT_' + date.replace(/-/g, '') + '_' + entry.employeeId),
      schoolId: String(emp.schoolId || '').trim(),
      employeeId: entry.employeeId,
      employeeName: String(emp.name || emp.fullName || '').trim(),
      department: String(emp.department || emp.specialization || emp.jobTitle || '').trim(),
      date: date,
      dayName: canonicalDayName,
      checkIn: checkIn,
      checkOut: checkOut,
      workingHours: workingHours,
      lateMinutes: lateMinutes,
      earlyLeaveMinutes: earlyLeaveMinutes,
      overtimeHours: overtimeHours,
      status: entry.status,
      notes: String(rec.notes || (prev && prev.notes) || '').trim(),
      checkInTimestamp: checkIn ? getCairoISOString() : '',
      checkOutTimestamp: checkOut ? getCairoISOString() : '',
      updatedAt: getCairoISOString()
    };

    upsertRecord(ss, SHEETS.ATTENDANCE, 'id', finalRecord);
    savedRecords.push(finalRecord);
  }

  recordAuthoritativeAudit(
    ss,
    requestId,
    authUsername,
    authRole,
    'ATTENDANCE_BATCH_SAVE',
    'ATTENDANCE',
    date,
    'حفظ حضور وغياب دفعة المعلمين والعاملين - التاريخ: ' + date + ' - العدد: ' + savedRecords.length
  );

  return {
    success: true,
    message: 'تم حفظ حضور وغياب العاملين بنجاح (' + savedRecords.length + ' موظف)',
    savedCount: savedRecords.length,
    records: savedRecords
  };
}

function validateUsernamePolicy(username) {
  var clean = String(username || '').trim();
  if (clean.length < 4 || clean.length > 40) {
    return { valid: false, message: 'اسم المستخدم يجب أن يكون بين 4 و 40 حرفاً' };
  }
  if (/\s/.test(clean)) {
    return { valid: false, message: 'اسم المستخدم لا يمكن أن يحتوي على مسافات' };
  }
  var regex = /^[a-zA-Z0-9._-]+$/;
  if (!regex.test(clean)) {
    return { valid: false, message: 'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية، أرقام، أو الرموز (. - _)' };
  }
  return { valid: true, cleanUsername: clean };
}

function validatePasswordPolicy(password, username) {
  var cleanPass = String(password || '').trim();
  if (cleanPass.length < 8) {
    return { valid: false, message: 'كلمة المرور يجب ألا تقل عن 8 أحرف' };
  }
  var weak = ['12345678', 'password', 'teacher123', 'admin123', '123456789', 'ntss1234'];
  if (weak.indexOf(cleanPass.toLowerCase()) !== -1) {
    return { valid: false, message: 'كلمة المرور ضعيفة وشائعة، يرجى اختيار كلمة مرور أقوى' };
  }
  if (username && cleanPass.toLowerCase() === String(username).trim().toLowerCase()) {
    return { valid: false, message: 'كلمة المرور لا يمكن أن تطابق اسم المستخدم' };
  }
  return { valid: true, cleanPassword: cleanPass };
}

function createTeacherAccount(ss, payload, authUsername, authRole, requestId) {
  var employeeId = String(payload.employeeId || '').trim();
  var rawUsername = String(payload.username || '').trim();
  var rawPassword = String(payload.temporaryPassword || payload.password || '').trim();

  if (!employeeId || !rawUsername || !rawPassword) {
    return { success: false, code: 'MISSING_FIELDS', message: 'يرجى إدخال الموظف، اسم المستخدم، وكلمة المرور' };
  }

  // Validate employee exists and is teaching staff
  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var emp = employees.find(function(e) { return e.id === employeeId; });
  if (!emp) {
    return { success: false, code: 'EMPLOYEE_NOT_FOUND', message: 'الموظف غير موجود في السجلات' };
  }

  var isTeacher = (emp.isTeacher === true || emp.isTeacher === 'true' || emp.isTeachingStaff === true || emp.isTeachingStaff === 'true');
  var isJobTeacher = emp.jobTitle && (emp.jobTitle.indexOf('معلم') !== -1 || emp.jobTitle.indexOf('مدرس') !== -1);
  var isDeptTeacher = emp.department && emp.department.indexOf('تعليم') !== -1;
  if (!isTeacher && !isJobTeacher && !isDeptTeacher) {
    return { success: false, code: 'NOT_TEACHING_STAFF', message: 'هذا الموظف غير مصنف كعضو هيئة تعليمية' };
  }

  // Validate username
  var userVal = validateUsernamePolicy(rawUsername);
  if (!userVal.valid) {
    return { success: false, code: 'INVALID_USERNAME', message: userVal.message };
  }
  var cleanUsername = userVal.cleanUsername;
  var normalizedUsername = cleanUsername.toLowerCase();

  // Validate password
  var passVal = validatePasswordPolicy(rawPassword, cleanUsername);
  if (!passVal.valid) {
    return { success: false, code: 'INVALID_PASSWORD', message: passVal.message };
  }

  // Case-insensitive uniqueness check against Teacher_Credentials and Users
  var creds = getSheetData(ss, SHEETS.TEACHER_CREDENTIALS);
  for (var i = 0; i < creds.length; i++) {
    var c = creds[i];
    var cNorm = String(c.usernameNormalized || c.username || '').trim().toLowerCase();
    if (cNorm === normalizedUsername) {
      return { success: false, code: 'USERNAME_TAKEN', message: 'اسم المستخدم مسجل بالفعل لمعلم آخر' };
    }
  }

  var users = getSheetData(ss, SHEETS.USERS);
  for (var u = 0; u < users.length; u++) {
    var uNorm = String(users[u].username || '').trim().toLowerCase();
    if (uNorm === normalizedUsername) {
      return { success: false, code: 'USERNAME_TAKEN', message: 'اسم المستخدم مسجل بالفعل لمستخدم في النظام' };
    }
  }

  var salt = generateSecureRandomToken(16);
  var hash = computeSaltedHash(passVal.cleanPassword, salt, PBKDF2_ITERATIONS);

  var teacherCode = emp.teacherCode || emp.id;
  var credRecord = {
    id: 'TAC_' + emp.id,
    employeeId: emp.id,
    teacherId: emp.id,
    teacherCode: teacherCode,
    username: cleanUsername,
    usernameNormalized: normalizedUsername,
    passwordHash: hash,
    passwordSalt: salt,
    passwordAlgorithm: 'PBKDF2-HMAC-SHA256',
    passwordIterations: PBKDF2_ITERATIONS,
    status: 'Active',
    accountStatus: 'Active',
    legacyPinRetired: true,
    migrationVersion: 'MIG_SCOPE_013',
    mustChangePassword: true,
    failedLoginAttempts: 0,
    lockedUntil: '',
    lastLoginAt: '',
    createdAt: getCairoISOString(),
    updatedAt: getCairoISOString()
  };

  upsertRecord(ss, SHEETS.TEACHER_CREDENTIALS, 'employeeId', credRecord);

  // Safe Audit (NO passwords or hashes logged)
  recordAuthoritativeAudit(
    ss,
    requestId,
    authUsername,
    authRole,
    'CREATE_TEACHER_ACCOUNT',
    'TEACHER_CREDENTIALS',
    emp.id,
    'إنشاء حساب بوابة المعلم للموظف: ' + emp.name + ' - اسم المستخدم: ' + cleanUsername
  );

  return {
    success: true,
    message: 'تم إنشاء حساب بوابة المعلم بنجاح',
    data: {
      id: credRecord.id,
      employeeId: credRecord.employeeId,
      teacherCode: credRecord.teacherCode,
      username: credRecord.username,
      status: credRecord.status,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: '',
      lastLoginAt: '',
      createdAt: credRecord.createdAt,
      updatedAt: credRecord.updatedAt
    }
  };
}

function resetTeacherPassword(ss, payload, authUsername, authRole, requestId) {
  var employeeId = String(payload.employeeId || '').trim();
  var rawPassword = String(payload.temporaryPassword || payload.newPassword || '').trim();

  if (!employeeId || !rawPassword) {
    return { success: false, code: 'MISSING_FIELDS', message: 'الموظف وكلمة المرور المؤقتة مطلوبتان' };
  }

  var creds = getSheetData(ss, SHEETS.TEACHER_CREDENTIALS);
  var cred = creds.find(function(c) { return c.employeeId === employeeId || c.teacherId === employeeId; });
  if (!cred) {
    return { success: false, code: 'ACCOUNT_NOT_FOUND', message: 'حساب المعلم غير موجود' };
  }

  var passVal = validatePasswordPolicy(rawPassword, cred.username || '');
  if (!passVal.valid) {
    return { success: false, code: 'INVALID_PASSWORD', message: passVal.message };
  }

  var salt = generateSecureRandomToken(16);
  var hash = computeSaltedHash(passVal.cleanPassword, salt, PBKDF2_ITERATIONS);

  cred.passwordHash = hash;
  cred.passwordSalt = salt;
  cred.passwordAlgorithm = 'PBKDF2-HMAC-SHA256';
  cred.passwordIterations = PBKDF2_ITERATIONS;
  cred.status = 'Active';
  cred.accountStatus = 'Active';
  cred.legacyPinRetired = true;
  cred.migrationVersion = 'MIG_SCOPE_013';
  delete cred.pinHash;
  delete cred.pinSalt;
  delete cred.salt;
  delete cred.pin;
  delete cred.legacyPin;
  cred.mustChangePassword = true;
  cred.failedLoginAttempts = 0;
  cred.lockedUntil = '';
  cred.updatedAt = getCairoISOString();

  upsertRecord(ss, SHEETS.TEACHER_CREDENTIALS, 'employeeId', cred);

  // Revoke any active teacher sessions
  revokeTeacherSessions(ss, employeeId);

  recordAuthoritativeAudit(
    ss,
    requestId,
    authUsername,
    authRole,
    'RESET_TEACHER_PASSWORD',
    'TEACHER_CREDENTIALS',
    employeeId,
    'إعادة تعيين كلمة مرور بوابة المعلم للموظف: ' + (cred.username || employeeId)
  );

  return { success: true, message: 'تمت إعادة تعيين كلمة المرور بنجاح وتفعيل إلزام تغييرها عند الدخول' };
}

function setTeacherAccountStatus(ss, payload, authUsername, authRole, requestId) {
  var employeeId = String(payload.employeeId || '').trim();
  var status = String(payload.status || '').trim();

  if (!employeeId || (status !== 'Active' && status !== 'Suspended' && status !== 'Inactive')) {
    return { success: false, code: 'INVALID_PARAMETERS', message: 'الموظف وحالة الحساب مطلوبة (Active أو Suspended)' };
  }

  var creds = getSheetData(ss, SHEETS.TEACHER_CREDENTIALS);
  var cred = creds.find(function(c) { return c.employeeId === employeeId || c.teacherId === employeeId; });
  if (!cred) {
    return { success: false, code: 'ACCOUNT_NOT_FOUND', message: 'حساب المعلم غير موجود' };
  }

  cred.status = status;
  cred.updatedAt = getCairoISOString();
  upsertRecord(ss, SHEETS.TEACHER_CREDENTIALS, 'employeeId', cred);

  if (status !== 'Active') {
    revokeTeacherSessions(ss, employeeId);
  }

  recordAuthoritativeAudit(
    ss,
    requestId,
    authUsername,
    authRole,
    status === 'Active' ? 'ENABLE_TEACHER_ACCOUNT' : 'DISABLE_TEACHER_ACCOUNT',
    'TEACHER_CREDENTIALS',
    employeeId,
    'تعديل حالة حساب المعلم إلى: ' + status
  );

  return { success: true, message: 'تم تحديث حالة حساب المعلم إلى ' + status };
}

function revokeTeacherSessions(ss, employeeId) {
  var tSheet = ss.getSheetByName(SHEETS.TEACHER_SESSIONS);
  if (!tSheet) return;
  var data = tSheet.getDataRange().getValues();
  if (data.length <= 1) return;

  var headers = data[0];
  var tIdCol = headers.indexOf('teacherId');
  var empIdCol = headers.indexOf('employeeId');
  var statusCol = headers.indexOf('status');
  if (statusCol === -1) return;

  for (var i = 1; i < data.length; i++) {
    var match = (tIdCol >= 0 && data[i][tIdCol] === employeeId) || (empIdCol >= 0 && data[i][empIdCol] === employeeId);
    if (match) {
      tSheet.getRange(i + 1, statusCol + 1).setValue('REVOKED');
    }
  }
}

function getTeacherAccountsSafeList(ss) {
  var creds = getSheetData(ss, SHEETS.TEACHER_CREDENTIALS);
  return creds.map(function(c) {
    return {
      id: c.id || ('TAC_' + (c.employeeId || c.teacherId)),
      employeeId: c.employeeId || c.teacherId,
      teacherCode: c.teacherCode || '',
      username: c.username || '',
      status: c.status || 'Active',
      mustChangePassword: c.mustChangePassword === true || c.mustChangePassword === 'true',
      failedLoginAttempts: parseInt(c.failedLoginAttempts || 0, 10),
      lockedUntil: c.lockedUntil || '',
      lastLoginAt: c.lastLoginAt || '',
      createdAt: c.createdAt || '',
      updatedAt: c.updatedAt || ''
    };
  });
}

function changeTeacherPassword(masterSs, teacherSessionToken, newPassword, requestId) {
  if (!teacherSessionToken || !newPassword) {
    return { success: false, code: 'PARAMETERS_REQUIRED', message: 'جلسة العمل وكلمة المرور الجديدة مطلوبتان' };
  }

  var tokenHash = hashStringSHA256(teacherSessionToken);
  var sessions = getSheetData(masterSs, SHEETS.TEACHER_SESSIONS);
  var session = null;
  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i].tokenHash === tokenHash && String(sessions[i].status || '').toUpperCase() === 'ACTIVE') {
      session = sessions[i];
      break;
    }
  }

  if (!session) {
    return { success: false, code: 'INVALID_SESSION', message: 'جلسة المعلم منتهية أو غير صالحة، يرجى تسجيل الدخول مجدداً' };
  }

  var teacherSchoolId = String(session.schoolId || '').trim().toUpperCase();
  if (!teacherSchoolId) {
    recordAuthoritativeAudit(masterSs, requestId, session.teacherCode || '', 'Teacher', 'PASSWORD_CHANGE_FAILED', 'TEACHER_AUTH', session.teacherId || session.employeeId || '', 'فشل تغيير كلمة المرور: سياق المدرسة مفقود في الجلسة');
    return { success: false, code: 'SCHOOL_CONTEXT_REQUIRED', message: 'سياق المدرسة غير محدد في جلسة العمل الحالية.' };
  }

  var schoolCtx = resolveSchoolContext(teacherSchoolId, masterSs);
  if (!schoolCtx || String(schoolCtx.status || 'Active').trim() !== 'Active') {
    return { success: false, code: schoolCtx ? 'SCHOOL_INACTIVE' : 'SCHOOL_NOT_FOUND', message: 'مدرسة المعلم غير متاحة حالياً.' };
  }

  var targetSs;
  try {
    targetSs = getSchoolSpreadsheet(teacherSchoolId, masterSs);
  } catch (schoolErr) {
    return { success: false, code: 'SCHOOL_DATA_UNAVAILABLE', message: 'تعذر الوصول إلى قاعدة بيانات مدرسة المعلم.' };
  }
  if (!targetSs) {
    return { success: false, code: 'SCHOOL_DATA_UNAVAILABLE', message: 'تعذر الوصول إلى قاعدة بيانات مدرسة المعلم.' };
  }

  var teacherId = session.teacherId || session.employeeId;
  var credentials = getSheetData(targetSs, SHEETS.TEACHER_CREDENTIALS);
  var cred = null;
  for (var j = 0; j < credentials.length; j++) {
    if (credentials[j].employeeId === teacherId || credentials[j].teacherId === teacherId) {
      cred = credentials[j];
      break;
    }
  }

  if (!cred) {
    return { success: false, code: 'ACCOUNT_NOT_FOUND', message: 'حساب المعلم غير موجود' };
  }

  var passVal = validatePasswordPolicy(newPassword, cred.username || '');
  if (!passVal.valid) {
    return { success: false, code: 'INVALID_PASSWORD_POLICY', message: passVal.message };
  }

  var salt = generateSecureRandomToken(16);
  var hash = computeSaltedHash(passVal.cleanPassword, salt, PBKDF2_ITERATIONS);

  cred.passwordHash = hash;
  cred.passwordSalt = salt;
  cred.passwordAlgorithm = 'PBKDF2-HMAC-SHA256';
  cred.passwordIterations = PBKDF2_ITERATIONS;
  cred.status = 'Active';
  cred.accountStatus = 'Active';
  cred.legacyPinRetired = true;
  cred.migrationVersion = 'MIG_SCOPE_013';
  delete cred.pinHash;
  delete cred.pinSalt;
  delete cred.salt;
  delete cred.pin;
  delete cred.legacyPin;
  cred.mustChangePassword = false;
  cred.failedLoginAttempts = 0;
  cred.lockedUntil = '';
  cred.updatedAt = getCairoISOString();

  upsertRecord(targetSs, SHEETS.TEACHER_CREDENTIALS, 'employeeId', cred);

  // Revoke both school-local sessions and the master mirror.
  revokeTeacherSessions(targetSs, teacherId);
  if (masterSs.getId() !== targetSs.getId()) {
    revokeTeacherSessions(masterSs, teacherId);
  }

  var newToken = generateSecureRandomToken(48);
  var newTokenHash = hashStringSHA256(newToken);
  var now = new Date();
  var expiresAt = new Date(now.getTime() + (TEACHER_SESSION_DURATION_HOURS * 60 * 60 * 1000));
  var nowStr = now.toISOString();
  var expiresStr = expiresAt.toISOString();

  var teacherSessionRecord = {
    sessionId: 'TSESS_' + Utilities.getUuid().substring(0, 10),
    tokenHash: newTokenHash,
    teacherId: teacherId,
    employeeId: session.employeeId || teacherId,
    teacherCode: session.teacherCode || '',
    teacherName: session.teacherName || '',
    schoolId: teacherSchoolId,
    createdAt: nowStr,
    expiresAt: expiresStr,
    status: 'ACTIVE'
  };

  var schoolSessionSheet = targetSs.getSheetByName(SHEETS.TEACHER_SESSIONS);
  if (schoolSessionSheet) {
    ensureTeacherSessionHeaders(schoolSessionSheet);
    appendRecordByHeaders(schoolSessionSheet, teacherSessionRecord);
  }

  if (masterSs.getId() !== targetSs.getId()) {
    var masterSessionSheet = masterSs.getSheetByName(SHEETS.TEACHER_SESSIONS);
    if (masterSessionSheet) {
      ensureTeacherSessionHeaders(masterSessionSheet);
      appendRecordByHeaders(masterSessionSheet, teacherSessionRecord);
    }
  }

  recordAuthoritativeAudit(targetSs, requestId, cred.username || session.teacherCode, 'Teacher', 'PASSWORD_CHANGE', 'TEACHER_CREDENTIALS', teacherId, 'تغيير كلمة مرور حساب المعلم بنجاح');

  return {
    success: true,
    message: 'تم تغيير كلمة المرور بنجاح',
    teacherSessionToken: newToken,
    expiresAt: expiresStr
  };
}

/**
 * Idempotent Migration: MIG_SCOPE_013_RETIRE_TEACHER_PIN
 * Safely retires legacy PIN support from Teacher_Credentials.
 */
function runMigrationScope013RetireTeacherPin(ss) {
  var creds = getSheetData(ss, SHEETS.TEACHER_CREDENTIALS);
  if (!creds || creds.length === 0) {
    return { success: true, count: 0, message: 'No teacher credentials to migrate' };
  }

  var updatedCount = 0;
  for (var i = 0; i < creds.length; i++) {
    var c = creds[i];
    var empId = c.employeeId || c.teacherId;
    if (!empId) continue;

    var hasPassword = Boolean(c.passwordHash && c.passwordSalt);
    var hasLegacyPin = Boolean(c.pinHash || c.salt || c.pin || c.legacyPin);

    if (hasPassword) {
      if (hasLegacyPin || !c.legacyPinRetired || c.migrationVersion !== 'MIG_SCOPE_013') {
        delete c.pinHash;
        delete c.pinSalt;
        delete c.salt;
        delete c.pin;
        delete c.legacyPin;
        c.legacyPinRetired = true;
        c.migrationVersion = 'MIG_SCOPE_013';
        c.migratedAt = c.migratedAt || getCairoISOString();
        c.accountStatus = c.accountStatus || c.status || 'Active';
        upsertRecord(ss, SHEETS.TEACHER_CREDENTIALS, 'employeeId', c);
        updatedCount++;
      }
    } else {
      if (hasLegacyPin || !c.legacyPinRetired || c.migrationVersion !== 'MIG_SCOPE_013') {
        var hasUsername = Boolean(c.username && String(c.username).trim());
        c.mustChangePassword = true;
        c.legacyPinRetired = true;
        c.migrationVersion = 'MIG_SCOPE_013';
        c.migratedAt = c.migratedAt || getCairoISOString();

        if (!hasUsername) {
          c.accountStatus = 'Needs Setup';
          c.status = 'Needs Setup';
        } else {
          c.accountStatus = 'PasswordResetRequired';
          c.status = 'PasswordResetRequired';
        }

        revokeTeacherSessions(ss, empId);

        delete c.pinHash;
        delete c.pinSalt;
        delete c.salt;
        delete c.pin;
        delete c.legacyPin;

        upsertRecord(ss, SHEETS.TEACHER_CREDENTIALS, 'employeeId', c);
        updatedCount++;
      }
    }
  }

  return {
    success: true,
    count: updatedCount,
    message: 'Migration MIG_SCOPE_013_RETIRE_TEACHER_PIN completed for ' + updatedCount + ' accounts'
  };
}

/**
 * Ensures a column header exists in a sheet. If missing, appends it.
 * Returns 1-based column index.
 */
function ensureHeaderColumn(sheet, columnName) {
  if (!sheet) return -1;
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.getRange(1, 1).setValue(columnName);
    return 1;
  }
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colIdx = headers.indexOf(columnName);
  if (colIdx !== -1) return colIdx + 1;
  sheet.getRange(1, lastCol + 1).setValue(columnName);
  return lastCol + 1;
}

/**
 * Appends a record to a sheet safely by matching header names.
 * Strictly avoids positional column index assumptions.
 */
function appendRecordByHeaders(sheet, record) {
  if (!sheet || !record) return;
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var rowData = headers.map(function(h) {
    var val = record[h];
    return val !== undefined && val !== null ? val : '';
  });
  sheet.appendRow(rowData);
}

/**
 * Ensures all required canonical session headers exist in the Sessions sheet.
 */
function ensureSessionHeaders(sheet) {
  if (!sheet) return;
  var requiredHeaders = [
    'sessionId',
    'tokenHash',
    'userId',
    'username',
    'fullName',
    'role',
    'schoolId',
    'email',
    'accessScope',
    'allowedSchoolIds',
    'activeSchoolId',
    'employeeId',
    'createdAt',
    'expiresAt',
    'status'
  ];
  for (var i = 0; i < requiredHeaders.length; i++) {
    ensureHeaderColumn(sheet, requiredHeaders[i]);
  }
}

/**
 * Ensures all required canonical teacher session headers exist in Teacher_Sessions sheet.
 */
function ensureTeacherSessionHeaders(sheet) {
  if (!sheet) return;
  var requiredHeaders = [
    'sessionId',
    'tokenHash',
    'teacherId',
    'employeeId',
    'teacherCode',
    'teacherName',
    'schoolId',
    'createdAt',
    'expiresAt',
    'status'
  ];
  for (var i = 0; i < requiredHeaders.length; i++) {
    ensureHeaderColumn(sheet, requiredHeaders[i]);
  }
}

/**
 * Idempotent Migration: MIG_SCOPE_015_MULTI_SCHOOL_AND_DECOMMISSION_ACTIVATION
 * 1. Ensures Master_Schools registry exists with headers only (Zero fake school seeds).
 * 2. Ensures Sessions and Teacher_Sessions contain schoolId column (No fake backfill).
 * 3. Decommissions activation token columns from Users sheet.
 */
function runMigrationScope015MultiSchoolAndDecommissionActivation(ss) {
  var masterSheet = ss.getSheetByName(SHEETS.MASTER_SCHOOLS);
  if (!masterSheet) {
    masterSheet = ss.insertSheet(SHEETS.MASTER_SCHOOLS);
    var mHeaders = ['schoolId', 'schoolCode', 'schoolName', 'spreadsheetId', 'status', 'createdAt', 'updatedAt'];
    masterSheet.getRange(1, 1, 1, mHeaders.length).setValues([mHeaders]);
    styleHeaderRow(masterSheet, mHeaders.length);
  }

  // Ensure Sessions has schoolId column without guessing/backfilling schoolId
  var sessionsSheet = ss.getSheetByName(SHEETS.SESSIONS);
  if (sessionsSheet) {
    ensureHeaderColumn(sessionsSheet, 'schoolId');
  }

  // Ensure Teacher_Sessions has schoolId column without guessing/backfilling schoolId
  var teacherSessionsSheet = ss.getSheetByName(SHEETS.TEACHER_SESSIONS);
  if (teacherSessionsSheet) {
    ensureHeaderColumn(teacherSessionsSheet, 'schoolId');
  }

  // Clear legacy activation tokens from Users sheet
  var usersSheet = ss.getSheetByName(SHEETS.USERS);
  if (usersSheet && usersSheet.getLastRow() > 1) {
    var uData = usersSheet.getDataRange().getValues();
    var uHeaders = uData[0];
    var actTokenCol = uHeaders.indexOf('activationTokenHash');
    var actExpCol = uHeaders.indexOf('activationExpiresAt');
    if (actTokenCol >= 0) {
      for (var ur = 1; ur < uData.length; ur++) {
        if (uData[ur][actTokenCol]) {
          usersSheet.getRange(ur + 1, actTokenCol + 1).setValue('');
        }
      }
    }
    if (actExpCol >= 0) {
      for (var ur2 = 1; ur2 < uData.length; ur2++) {
        if (uData[ur2][actExpCol]) {
          usersSheet.getRange(ur2 + 1, actExpCol + 1).setValue('');
        }
      }
    }
  }

  return { success: true, message: 'Migration MIG_SCOPE_015 completed successfully' };
}

/**
 * Returns public active schools list from Master_Schools registry.
 * Strictly Fail-Closed: returns [] if registry is empty or missing.
 * Zero fallback objects.
 * @param {Spreadsheet} ss
 * @returns {Array<Object>}
 */
function getPublicActiveSchools(ss) {
  var masterSheet = ss.getSheetByName(SHEETS.MASTER_SCHOOLS);
  if (!masterSheet) {
    return [];
  }
  var masterSchoolsList = getSheetData(ss, SHEETS.MASTER_SCHOOLS);
  if (!masterSchoolsList || masterSchoolsList.length === 0) {
    return [];
  }
  return masterSchoolsList
    .filter(function(s) { return String(s.status || 'Active').trim() === 'Active'; })
    .map(function(s) {
      return {
        schoolId: String(s.schoolId || '').trim(),
        schoolCode: String(s.schoolCode || '').trim(),
        schoolName: String(s.schoolName || '').trim(),
        status: 'Active'
      };
    });
}

/**
 * Resolves a school context from Master_Schools in masterSs.
 * Strictly Fail-Closed: returns null if Master_Schools is missing or empty.
 * Never runs migrations or creates schools automatically.
 * @param {string|Object} schoolIdOrSession
 * @param {string|Spreadsheet} requestedSchoolIdOrMasterSs
 * @returns {Object|null}
 */
function resolveSchoolContext(schoolIdOrSession, requestedSchoolIdOrMasterSs) {
  var session = null;
  var schoolId = null;
  var masterSs = null;

  if (schoolIdOrSession && typeof schoolIdOrSession === 'object' && schoolIdOrSession.sessionToken) {
    session = schoolIdOrSession;
    var requestedId = (requestedSchoolIdOrMasterSs && typeof requestedSchoolIdOrMasterSs === 'string') ? requestedSchoolIdOrMasterSs.trim() : null;
    masterSs = SpreadsheetApp.getActiveSpreadsheet();

    if (session.accessScope === 'GLOBAL') {
      if (requestedId) {
        var allowed = (session.allowedSchoolIds || []).map(function(id) { return String(id).trim().toUpperCase(); });
        if (allowed.indexOf(requestedId.toUpperCase()) === -1) {
          return null;
        }
        schoolId = requestedId;
      } else {
        schoolId = session.activeSchoolId || session.schoolId || '';
      }
    } else {
      if (requestedId && requestedId.toUpperCase() !== String(session.schoolId || '').trim().toUpperCase()) {
        return null;
      }
      schoolId = session.schoolId || '';
    }
  } else {
    schoolId = schoolIdOrSession;
    masterSs = requestedSchoolIdOrMasterSs || SpreadsheetApp.getActiveSpreadsheet();
  }

  if (!schoolId) return null;
  var cleanId = String(schoolId).trim().toUpperCase();
  var masterSheet = masterSs.getSheetByName(SHEETS.MASTER_SCHOOLS);
  if (!masterSheet) {
    return null;
  }

  var schools = getSheetData(masterSs, SHEETS.MASTER_SCHOOLS);
  if (!schools || schools.length === 0) {
    return null;
  }

  for (var i = 0; i < schools.length; i++) {
    var s = schools[i];
    if (
      String(s.schoolId || '').trim().toUpperCase() === cleanId ||
      String(s.schoolCode || '').trim().toUpperCase() === cleanId
    ) {
      return {
        schoolId: String(s.schoolId || '').trim(),
        schoolCode: String(s.schoolCode || '').trim(),
        schoolName: String(s.schoolName || '').trim(),
        spreadsheetId: String(s.spreadsheetId || '').trim(),
        status: String(s.status || 'Active').trim(),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      };
    }
  }

  return null;
}

/**
 * Returns the isolated Google Spreadsheet instance for a given school.
 * Strictly Fail-Closed:
 * - If school context not found or spreadsheetId is blank: returns null.
 * - If spreadsheetId is explicitly registered and equals masterSs.getId(): returns masterSs.
 * - If SpreadsheetApp.openById fails: returns null (Zero fallback to masterSs).
 * @param {string} schoolId
 * @param {Spreadsheet} masterSs
 * @returns {Spreadsheet|null}
 */
function getSchoolSpreadsheet(schoolId, masterSs) {
  var ctx = resolveSchoolContext(schoolId, masterSs);
  if (!ctx || !ctx.spreadsheetId || !String(ctx.spreadsheetId).trim()) {
    return null;
  }

  var targetSpreadsheetId = String(ctx.spreadsheetId).trim();
  if (masterSs && masterSs.getId && targetSpreadsheetId === masterSs.getId()) {
    return masterSs;
  }

  try {
    var opened = SpreadsheetApp.openById(targetSpreadsheetId);
    if (!opened) return null;
    return opened;
  } catch (err) {
    console.error('Failed to open spreadsheet for school ' + schoolId + ': ' + err);
    return null;
  }
}

/**
 * Manual, server-only idempotent provisioning function.
 * Strictly forbidden from public invocation: NOT called from doGet or doPost.
 * Must be executed manually in Google Apps Script Editor by project owner.
 *
 * Reads:
 * - INITIAL_ADMIN_EMAIL
 * - INITIAL_ADMIN_PASSWORD
 * - BADR_SPREADSHEET_ID
 * - DAMIETTA_SPREADSHEET_ID
 * - INITIAL_ADMIN_FULL_NAME (optional)
 *
 * Validates spreadsheets, creates/updates Master_Schools, creates/updates SystemAdmin,
 * deletes password property from ScriptProperties, sets INITIAL_SYSTEM_PROVISIONED=true,
 * records safe audit log without sensitive data.
 *
 * @returns {Object} { success: boolean, message: string, ... }
 */
function provisionInitialSystemFromScriptProperties() {
  var props = PropertiesService.getScriptProperties();
  if (!props) {
    Logger.log('[PROVISIONING_ERROR] PropertiesService not available');
    return { success: false, code: 'PROPERTIES_UNAVAILABLE', message: 'Script Properties are not available.' };
  }

  var adminEmail = props.getProperty('INITIAL_ADMIN_EMAIL');
  var adminPassword = props.getProperty('INITIAL_ADMIN_PASSWORD');
  var badrSpreadsheetId = props.getProperty('BADR_SPREADSHEET_ID');
  var damiettaSpreadsheetId = props.getProperty('DAMIETTA_SPREADSHEET_ID');
  var adminFullName = props.getProperty('INITIAL_ADMIN_FULL_NAME');

  var cleanEmail = String(adminEmail || '').trim().toLowerCase();
  var cleanPassword = String(adminPassword || '').trim();
  var cleanBadrId = String(badrSpreadsheetId || '').trim();
  var cleanDamiettaId = String(damiettaSpreadsheetId || '').trim();
  var cleanFullName = String(adminFullName || '').trim() || 'مدير النظام';

  // Check if already provisioned and properties were already deleted
  var alreadyProvisioned = props.getProperty('INITIAL_SYSTEM_PROVISIONED') === 'true';

  if (!cleanEmail || !cleanPassword || !cleanBadrId || !cleanDamiettaId) {
    if (alreadyProvisioned) {
      Logger.log('[PROVISIONING] System was already provisioned and initial credentials were safely removed.');
      return {
        success: true,
        alreadyProvisioned: true,
        message: 'System was already provisioned and initial credentials were removed from Script Properties.'
      };
    }
    Logger.log('[PROVISIONING_ERROR] Missing required Script Properties. Fail-Closed.');
    return {
      success: false,
      code: 'MISSING_PROPERTIES',
      message: 'Missing required Script Properties: INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD, BADR_SPREADSHEET_ID, DAMIETTA_SPREADSHEET_ID.'
    };
  }

  // 1. Verify reachability of both spreadsheets before modifying any data (Fail-Closed)
  try {
    var badrSs = SpreadsheetApp.openById(cleanBadrId);
    if (!badrSs) {
      Logger.log('[PROVISIONING_ERROR] Could not open BADR spreadsheet: ' + cleanBadrId);
      return { success: false, code: 'INVALID_SPREADSHEET_ID', message: 'Could not access Badr spreadsheet.' };
    }
  } catch (errBadr) {
    Logger.log('[PROVISIONING_ERROR] Failed to open BADR spreadsheet: ' + errBadr);
    return { success: false, code: 'INVALID_SPREADSHEET_ID', message: 'Failed to access Badr spreadsheet: ' + errBadr };
  }

  try {
    var damiettaSs = SpreadsheetApp.openById(cleanDamiettaId);
    if (!damiettaSs) {
      Logger.log('[PROVISIONING_ERROR] Could not open DAMIETTA spreadsheet: ' + cleanDamiettaId);
      return { success: false, code: 'INVALID_SPREADSHEET_ID', message: 'Could not access Damietta spreadsheet.' };
    }
  } catch (errDamietta) {
    Logger.log('[PROVISIONING_ERROR] Failed to open DAMIETTA spreadsheet: ' + errDamietta);
    return { success: false, code: 'INVALID_SPREADSHEET_ID', message: 'Failed to access Damietta spreadsheet: ' + errDamietta };
  }

  var masterSs = SpreadsheetApp.getActiveSpreadsheet();
  ensureProductionStaffSheetsExist(masterSs);

  var nowIso = getCairoISOString();
  var masterSheet = masterSs.getSheetByName(SHEETS.MASTER_SCHOOLS);
  if (!masterSheet) {
    masterSheet = masterSs.insertSheet(SHEETS.MASTER_SCHOOLS);
    var mHeaders = ['schoolId', 'schoolCode', 'schoolName', 'spreadsheetId', 'status', 'createdAt', 'updatedAt'];
    masterSheet.getRange(1, 1, 1, mHeaders.length).setValues([mHeaders]);
    styleHeaderRow(masterSheet, mHeaders.length);
  }

  // 2. Real Master Schools Registry (Idempotent Update/Insert)
  var targetSchools = [
    {
      schoolId: 'SCH-BADR',
      schoolCode: 'BADR',
      schoolName: 'مدرسة إبدأ الوطنية للعلوم التقنية - بدر',
      spreadsheetId: cleanBadrId,
      status: 'Active'
    },
    {
      schoolId: 'SCH-DAMIETTA',
      schoolCode: 'DAMIETTA',
      schoolName: 'مدرسة إبدأ الوطنية للعلوم التقنية - دمياط',
      spreadsheetId: cleanDamiettaId,
      status: 'Active'
    }
  ];

  var existingSchools = getSheetData(masterSs, SHEETS.MASTER_SCHOOLS);
  var schoolHeaders = masterSheet.getRange(1, 1, 1, masterSheet.getLastColumn()).getValues()[0];
  var sIdCol = schoolHeaders.indexOf('schoolId');
  var sCodeCol = schoolHeaders.indexOf('schoolCode');
  var sNameCol = schoolHeaders.indexOf('schoolName');
  var sSsCol = schoolHeaders.indexOf('spreadsheetId');
  var sStatusCol = schoolHeaders.indexOf('status');
  var sUpdatedCol = schoolHeaders.indexOf('updatedAt');

  for (var t = 0; t < targetSchools.length; t++) {
    var target = targetSchools[t];
    var rowIndex = -1;
    for (var r = 0; r < existingSchools.length; r++) {
      if (
        String(existingSchools[r].schoolId || '').trim().toUpperCase() === target.schoolId.toUpperCase() ||
        String(existingSchools[r].schoolCode || '').trim().toUpperCase() === target.schoolCode.toUpperCase()
      ) {
        rowIndex = r + 2; // 1-indexed header + 1
        break;
      }
    }

    if (rowIndex > 1) {
      // Update existing row
      if (sNameCol >= 0) masterSheet.getRange(rowIndex, sNameCol + 1).setValue(target.schoolName);
      if (sSsCol >= 0) masterSheet.getRange(rowIndex, sSsCol + 1).setValue(target.spreadsheetId);
      if (sStatusCol >= 0) masterSheet.getRange(rowIndex, sStatusCol + 1).setValue(target.status);
      if (sUpdatedCol >= 0) masterSheet.getRange(rowIndex, sUpdatedCol + 1).setValue(nowIso);
    } else {
      // Append new row
      masterSheet.appendRow([
        target.schoolId,
        target.schoolCode,
        target.schoolName,
        target.spreadsheetId,
        target.status,
        nowIso,
        nowIso
      ]);
    }
  }

  // 3. System Admin Account (Idempotent by normalized email)
  var usersSheet = masterSs.getSheetByName(SHEETS.USERS);
  var usersData = usersSheet.getDataRange().getValues();
  var uHeaders = usersData[0];
  var uEmailCol = uHeaders.indexOf('email');
  var uRoleCol = uHeaders.indexOf('role');
  var uStatusCol = uHeaders.indexOf('status');
  var uAllowedCol = uHeaders.indexOf('allowedSchoolIds');
  var uHashCol = uHeaders.indexOf('passwordHash');
  var uSaltCol = uHeaders.indexOf('passwordSalt');
  var uAlgoCol = uHeaders.indexOf('passwordAlgorithm');
  var uIterCol = uHeaders.indexOf('passwordIterations');
  var uPassChangeCol = uHeaders.indexOf('passwordChangedAt');
  var uFullNameCol = uHeaders.indexOf('fullName');

  // Compute password hash
  var salt = generateSecureRandomToken(16);
  var hash = computeSaltedHash(cleanPassword, salt, PBKDF2_ITERATIONS);
  var allowedSchoolsJson = JSON.stringify(['SCH-BADR', 'SCH-DAMIETTA']);

  var userRowIndex = -1;
  for (var u = 1; u < usersData.length; u++) {
    var rowEmail = String(usersData[u][uEmailCol] || '').trim().toLowerCase();
    if (rowEmail === cleanEmail) {
      userRowIndex = u + 1; // 1-indexed
      break;
    }
  }

  if (userRowIndex > 1) {
    // Update existing user safely
    if (uRoleCol >= 0) usersSheet.getRange(userRowIndex, uRoleCol + 1).setValue('SystemAdmin');
    if (uStatusCol >= 0) usersSheet.getRange(userRowIndex, uStatusCol + 1).setValue('Active');
    if (uAllowedCol >= 0) usersSheet.getRange(userRowIndex, uAllowedCol + 1).setValue(allowedSchoolsJson);
    if (uHashCol >= 0) usersSheet.getRange(userRowIndex, uHashCol + 1).setValue(hash);
    if (uSaltCol >= 0) usersSheet.getRange(userRowIndex, uSaltCol + 1).setValue(salt);
    if (uAlgoCol >= 0) usersSheet.getRange(userRowIndex, uAlgoCol + 1).setValue('PBKDF2-HMAC-SHA256');
    if (uIterCol >= 0) usersSheet.getRange(userRowIndex, uIterCol + 1).setValue(PBKDF2_ITERATIONS);
    if (uPassChangeCol >= 0) usersSheet.getRange(userRowIndex, uPassChangeCol + 1).setValue(nowIso);
    if (uFullNameCol >= 0 && cleanFullName) usersSheet.getRange(userRowIndex, uFullNameCol + 1).setValue(cleanFullName);
  } else {
    // Insert new user
    var newUserId = 'usr-admin-' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
    var newUserRow = [];
    for (var h = 0; h < uHeaders.length; h++) {
      var headerName = uHeaders[h];
      switch (headerName) {
        case 'id': newUserRow.push(newUserId); break;
        case 'username': newUserRow.push('systemadmin'); break;
        case 'passwordHash': newUserRow.push(hash); break;
        case 'passwordSalt': newUserRow.push(salt); break;
        case 'passwordAlgorithm': newUserRow.push('PBKDF2-HMAC-SHA256'); break;
        case 'passwordIterations': newUserRow.push(PBKDF2_ITERATIONS); break;
        case 'fullName': newUserRow.push(cleanFullName); break;
        case 'role': newUserRow.push('SystemAdmin'); break;
        case 'status': newUserRow.push('Active'); break;
        case 'department': newUserRow.push('إدارة النظام'); break;
        case 'email': newUserRow.push(cleanEmail); break;
        case 'schoolId': newUserRow.push(''); break;
        case 'allowedSchoolIds': newUserRow.push(allowedSchoolsJson); break;
        case 'employeeId': newUserRow.push(''); break;
        case 'createdAt': newUserRow.push(nowIso); break;
        case 'lastLogin': newUserRow.push(''); break;
        case 'passwordChangedAt': newUserRow.push(nowIso); break;
        default: newUserRow.push('');
      }
    }
    usersSheet.appendRow(newUserRow);
  }

  // 4. One-Time Safety: purge password and sensitive initial setup properties from ScriptProperties
  props.deleteProperty('INITIAL_ADMIN_PASSWORD');
  props.deleteProperty('INITIAL_ADMIN_EMAIL');
  props.deleteProperty('INITIAL_ADMIN_FULL_NAME');
  props.deleteProperty('BADR_SPREADSHEET_ID');
  props.deleteProperty('DAMIETTA_SPREADSHEET_ID');
  props.setProperty('INITIAL_SYSTEM_PROVISIONED', 'true');

  // 5. Authoritative Audit Log (Zero sensitive fields)
  recordAuthoritativeAudit(
    masterSs,
    'PROVISION_' + Utilities.getUuid().substring(0, 8),
    cleanEmail,
    'SystemAdmin',
    'SYSTEM_INITIAL_PROVISIONING',
    'SYSTEM',
    'SYSTEM',
    'تهيئة النظام الأولي بنجاح: SCH-BADR, SCH-DAMIETTA'
  );

  Logger.log('[PROVISIONING_SUCCESS] Initial system and schools provisioned successfully for ' + cleanEmail);
  return {
    success: true,
    alreadyProvisioned: false,
    message: 'Initial system, schools, and SystemAdmin account provisioned successfully.'
  };
}

/**
 * Manual verification helper function.
 * Strictly non-public: logs verification findings to Logger without revealing secrets.
 *
 * @returns {Object} Safe status summary
 */
function verifyInitialSystemProvisioning() {
  var masterSs = SpreadsheetApp.getActiveSpreadsheet();
  var users = getSheetData(masterSs, SHEETS.USERS);
  var schools = getSheetData(masterSs, SHEETS.MASTER_SCHOOLS);

  var sysAdmin = null;
  for (var u = 0; u < users.length; u++) {
    if (String(users[u].role || '').trim() === 'SystemAdmin') {
      sysAdmin = users[u];
      break;
    }
  }

  var badr = null;
  var damietta = null;
  for (var s = 0; s < schools.length; s++) {
    var sid = String(schools[s].schoolId || '').trim().toUpperCase();
    if (sid === 'SCH-BADR') badr = schools[s];
    if (sid === 'SCH-DAMIETTA') damietta = schools[s];
  }

  var badrReachable = false;
  if (badr && badr.spreadsheetId) {
    try {
      badrReachable = !!SpreadsheetApp.openById(badr.spreadsheetId);
    } catch (e) {
      badrReachable = false;
    }
  }

  var damiettaReachable = false;
  if (damietta && damietta.spreadsheetId) {
    try {
      damiettaReachable = !!SpreadsheetApp.openById(damietta.spreadsheetId);
    } catch (e) {
      damiettaReachable = false;
    }
  }

  var result = {
    systemAdminExists: !!sysAdmin,
    email: sysAdmin ? String(sysAdmin.email || '') : 'NONE',
    role: sysAdmin ? String(sysAdmin.role || '') : 'NONE',
    accountStatus: sysAdmin ? String(sysAdmin.status || '') : 'NONE',
    allowedSchoolIds: sysAdmin ? (sysAdmin.allowedSchoolIds || '[]') : '[]',
    badrRegistered: !!badr,
    damiettaRegistered: !!damietta,
    badrSpreadsheetReachable: badrReachable,
    damiettaSpreadsheetReachable: damiettaReachable
  };

  Logger.log('=== INITIAL SYSTEM PROVISIONING VERIFICATION ===');
  Logger.log('SystemAdmin exists: ' + (result.systemAdminExists ? 'YES' : 'NO'));
  Logger.log('Email: ' + result.email);
  Logger.log('Role: ' + result.role);
  Logger.log('Account status: ' + result.accountStatus);
  Logger.log('Allowed school IDs: ' + result.allowedSchoolIds);
  Logger.log('SCH-BADR registered: ' + (result.badrRegistered ? 'YES' : 'NO'));
  Logger.log('SCH-DAMIETTA registered: ' + (result.damiettaRegistered ? 'YES' : 'NO'));
  Logger.log('Badr spreadsheet reachable: ' + (result.badrSpreadsheetReachable ? 'YES' : 'NO'));
  Logger.log('Damietta spreadsheet reachable: ' + (result.damiettaSpreadsheetReachable ? 'YES' : 'NO'));
  Logger.log('================================================');

  return result;
}

/**
 * Phase 3C-A14.1.1: Server-only manual school spreadsheet binding function.
 * Strictly NOT exposed via doGet or doPost (cannot be invoked by clients or browsers).
 * Must be executed manually in Google Apps Script Editor by System Owner / Cloud Operator.
 *
 * Reads spreadsheet ID from Script Properties using conventional naming:
 * e.g. "SCHOOL_SPREADSHEET_ID__SCH_BADR", "SCHOOL_SPREADSHEET_ID__<CLEAN_SCHOOL_ID>"
 * or "SCHOOL_SPREADSHEET__<CLEAN_SCHOOL_ID>"
 *
 * Steps:
 * 1. Locates school in Master_Schools sheet.
 * 2. Reads spreadsheet ID from Script Properties.
 * 3. Validates reachability via SpreadsheetApp.openById(cleanSsId).
 *    If fails: throws Error with code INVALID_SCHOOL_SPREADSHEET (without leaking ID).
 * 4. Binds valid spreadsheetId to Master_Schools row.
 * 5. Optionally activates the school if optActivate === true.
 * 6. Records authoritative audit (SCHOOL_SPREADSHEET_BOUND, and SCHOOL_ACTIVATED if activated).
 *    NEVER logs spreadsheetId, properties, or secrets.
 *
 * @param {string} schoolId - The immutable schoolId to bind.
 * @param {boolean} [optActivate=false] - Explicit flag to activate school upon binding.
 * @returns {Object} Result { success: boolean, schoolId: string, status: string, message: string }
 */
function bindSchoolSpreadsheetFromScriptProperties(schoolId, optActivate) {
  var cleanSchoolId = String(schoolId || '').trim().toUpperCase();
  if (!cleanSchoolId) {
    throw new Error('INVALID_SCHOOL_ID: schoolId is required for binding.');
  }

  var props = PropertiesService.getScriptProperties();
  if (!props) {
    throw new Error('PROPERTIES_UNAVAILABLE: Script Properties are not accessible.');
  }

  var normalizedKeySuffix = cleanSchoolId.replace(/[^A-Z0-9]/g, '_');
  var propKey1 = 'SCHOOL_SPREADSHEET_ID__' + normalizedKeySuffix;
  var propKey2 = 'SCHOOL_SPREADSHEET_ID__' + cleanSchoolId;
  var propKey3 = 'SCHOOL_SPREADSHEET__' + normalizedKeySuffix;

  var boundSsId = props.getProperty(propKey1) || props.getProperty(propKey2) || props.getProperty(propKey3);
  var cleanSsId = String(boundSsId || '').trim();

  if (!cleanSsId) {
    throw new Error('SPREADSHEET_PROPERTY_NOT_FOUND: No Script Property found for school ' + cleanSchoolId);
  }

  // Validate reachability via SpreadsheetApp.openById (Fail-Closed)
  try {
    var opened = SpreadsheetApp.openById(cleanSsId);
    if (!opened) {
      throw new Error('INVALID_SCHOOL_SPREADSHEET: Unable to access spreadsheet.');
    }
  } catch (err) {
    throw new Error('INVALID_SCHOOL_SPREADSHEET: Spreadsheet is unreachable or invalid.');
  }

  var masterSs = SpreadsheetApp.getActiveSpreadsheet();
  var existingSchools = getSheetData(masterSs, SHEETS.MASTER_SCHOOLS);
  var target = null;
  for (var i = 0; i < existingSchools.length; i++) {
    if (String(existingSchools[i].schoolId || '').trim().toUpperCase() === cleanSchoolId) {
      target = existingSchools[i];
      break;
    }
  }

  if (!target) {
    throw new Error('SCHOOL_NOT_FOUND: School ' + cleanSchoolId + ' not found in Master_Schools registry.');
  }

  target.spreadsheetId = cleanSsId;
  target.updatedAt = getCairoISOString();
  var wasActivated = false;
  if (optActivate === true) {
    target.status = 'Active';
    wasActivated = true;
  }
  upsertRecord(masterSs, SHEETS.MASTER_SCHOOLS, 'schoolId', target);

  var reqId = 'manual-bind-' + Utilities.getUuid();
  recordAuthoritativeAudit(
    masterSs,
    reqId,
    'SYSTEM_SERVER_OPERATOR',
    'SystemAdmin',
    'SCHOOL_SPREADSHEET_BOUND',
    'MASTER_SCHOOLS',
    cleanSchoolId,
    JSON.stringify({ bindingStatus: 'SUCCESS' })
  );

  if (wasActivated) {
    recordAuthoritativeAudit(
      masterSs,
      reqId,
      'SYSTEM_SERVER_OPERATOR',
      'SystemAdmin',
      'SCHOOL_ACTIVATED',
      'MASTER_SCHOOLS',
      cleanSchoolId,
      JSON.stringify({ status: { from: 'Inactive', to: 'Active' } })
    );
  }

  Logger.log('[SERVER_BINDING_SUCCESS] School ' + cleanSchoolId + ' bound successfully. Status: ' + target.status);
  return {
    success: true,
    schoolId: cleanSchoolId,
    status: target.status,
    message: 'School spreadsheet bound successfully.'
  };
}

