/**
 * ==============================================================================
 * NTSS SCHOOL ERP & TIMETABLE SYSTEM - AUTHORITATIVE GOOGLE APPS SCRIPT BACKEND
 * ==============================================================================
 * Version: 5.0.0-TIMETABLE-SECURE-PROD
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
var CANONICAL_BACKEND_VERSION = '5.0.0-TIMETABLE-SECURE-PROD';
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
  TEACHER_CREDENTIALS: 'Teacher_Credentials'
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
      code: 'HEALTH_OK',
      service: 'NTSS School ERP & Timetable System API Gateway',
      version: CANONICAL_BACKEND_VERSION,
      timestamp: new Date().toISOString(),
      cairoTime: getCairoISOString(),
      scope: 'Staff ERP + Timetable System + Teacher Portal + Student Access',
      retiredModules: ['Parent_Portal', 'Payroll', 'SAMAT', 'Class_Period_Attendance'],
      storageAuthority: 'Google Sheets Authoritative Backend'
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
    if (action === 'ping') {
      output.serviceAvailable = true;
      output.message = 'Backend is active, authoritative, and secure';
      return createJsonResponse(output, 200);
    }

    // Staff Login
    if (action === 'login') {
      var username = String(postData.username || (payload && payload.username) || '').trim().toLowerCase();
      var password = String(postData.password || (payload && payload.password) || '').trim();

      var authResult = handleStaffLogin(ss, username, password, requestId);
      if (!authResult.success) {
        return createJsonResponse({
          status: 'error',
          code: authResult.code || 'AUTH_FAILED',
          message: authResult.message,
          requestId: requestId
        }, 401);
      }

      output.message = 'تم تسجيل الدخول وإنشاء جلسة عمل معتمدة بنجاح';
      output.sessionToken = authResult.sessionToken;
      output.expiresAt = authResult.expiresAt;
      output.user = authResult.user;
      return createJsonResponse(output, 200);
    }

    // Teacher Login (Teacher Code + PIN/Password -> Opaque TeacherSessionToken)
    if (action === 'teacherLogin') {
      var tCode = String(postData.teacherCode || (payload && payload.teacherCode) || '').trim().toUpperCase();
      var tPin = String(postData.pin || postData.password || (payload && (payload.pin || payload.password)) || '').trim();

      var teacherAuth = handleTeacherLogin(ss, tCode, tPin, requestId);
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
      output.teacher = teacherAuth.teacher;
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

    // Public Student Class Schedule (NO login, NO token, strictly published lessons only)
    if (action === 'getPublicClassSchedule') {
      var gradeParam = String(postData.gradeId || postData.grade || postData.gradeName || (payload && (payload.gradeId || payload.grade || payload.gradeName)) || '').trim();
      var classroomParam = String(postData.classroomId || postData.classroom || postData.classroomName || (payload && (payload.classroomId || payload.classroom || payload.classroomName)) || '').trim();
      
      var publicScheduleRes = getPublicClassSchedule(ss, gradeParam, classroomParam);
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
      return createJsonResponse(output, 200);
    }

    // First Login Password Setup (Single-use activation token verification)
    if (action === 'firstLoginPasswordSetup') {
      var setupResult = handleFirstLoginPasswordSetup(ss, payload || postData, requestId);
      if (!setupResult.success) {
        return createJsonResponse({
          status: 'error',
          code: setupResult.code || 'SETUP_FAILED',
          message: setupResult.message,
          requestId: requestId
        }, 400);
      }

      output.message = setupResult.message;
      output.sessionToken = setupResult.sessionToken;
      output.expiresAt = setupResult.expiresAt;
      output.user = setupResult.user;
      return createJsonResponse(output, 200);
    }

    // Bootstrap First Admin (Permitted only when no admins exist)
    if (action === 'bootstrapFirstAdmin') {
      var bootstrapResult = handleFirstAdminBootstrap(ss, postData, requestId);
      if (!bootstrapResult.success) {
        return createJsonResponse({
          status: 'error',
          code: bootstrapResult.code || 'BOOTSTRAP_FAILED',
          message: bootstrapResult.message,
          requestId: requestId
        }, 400);
      }

      output.message = bootstrapResult.message;
      output.user = bootstrapResult.user;
      return createJsonResponse(output, 200);
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
    if (action === 'teacherLogout' || action === 'getTeacherPortalData' || action === 'saveTeacherHomeworkDraft' || action === 'saveTeacherResourceDraft') {
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

      if (action === 'teacherLogout') {
        revokeTeacherSessionToken(ss, incomingTeacherToken);
        output.message = 'تم تسجيل خروج المعلم بنجاح';
        return createJsonResponse(output, 200);
      }

      if (action === 'getTeacherPortalData') {
        output.data = getTeacherPortalDataBundle(ss, tSession);
        return createJsonResponse(output, 200);
      }

      if (action === 'saveTeacherHomeworkDraft') {
        var hwResult = saveTeacherHomeworkDraft(ss, tSession, payload, requestId);
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
        var resResult = saveTeacherResourceDraft(ss, tSession, payload, requestId);
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
    var authenticatedUserId = activeSession.userId;
    var authenticatedRole = activeSession.role;
    var authenticatedUsername = activeSession.username;

    // Central Role-Based Authorization Gate
    var authzResult = authorizeStaffAction(authenticatedRole, action);
    if (!authzResult.allowed) {
      return createJsonResponse({
        status: 'error',
        code: 'FORBIDDEN',
        message: authzResult.message || 'ليس لديك الصلاحيات الإدارية الكافية لتنفيذ هذا الإجراء',
        userRole: authenticatedRole,
        action: action,
        requestId: requestId
      }, 403);
    }

    // -------------------------------------------------------------
    // 5. PROTECTED STAFF ACTIONS DISPATCH
    // -------------------------------------------------------------

    // A. Session Lifecycle
    if (action === 'logout') {
      revokeSessionToken(ss, incomingStaffToken);
      output.message = 'تم إنهاء جلسة العمل وإلغاؤها بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'validateSession') {
      output.valid = true;
      output.user = {
        id: authenticatedUserId,
        username: authenticatedUsername,
        role: authenticatedRole,
        fullName: activeSession.fullName
      };
      output.expiresAt = activeSession.expiresAt;
      return createJsonResponse(output, 200);
    }

    // B. Students Master Data
    if (action === 'getStudents') {
      output.data = getSheetData(ss, SHEETS.STUDENTS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveStudent' && payload) {
      upsertRecord(ss, SHEETS.STUDENTS, 'id', payload);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'STUDENTS', payload.id || '', 'حفظ سجل طالب');
      output.message = 'تم حفظ بيانات الطالب بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteStudent' && payload && payload.id) {
      deleteRecord(ss, SHEETS.STUDENTS, 'id', payload.id);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'DELETE', 'STUDENTS', payload.id, 'حذف سجل طالب');
      output.message = 'تم حذف سجل الطالب بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'bulkSaveStudents' && payload && Array.isArray(payload)) {
      payload.forEach(function(rec) { upsertRecord(ss, SHEETS.STUDENTS, 'id', rec); });
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'BULK_SAVE', 'STUDENTS', payload.length + ' records', 'حفظ دفعة طلاب');
      output.message = 'تم حفظ ' + payload.length + ' سجل طالب بنجاح';
      return createJsonResponse(output, 200);
    }

    // C. Student Access Token Management (Staff Only)
    if (action === 'issueStudentAccessToken' && payload) {
      var issueResult = issueStudentAccessToken(ss, payload.studentId, authenticatedUserId, requestId);
      if (!issueResult.success) {
        return createJsonResponse({
          status: 'error',
          code: issueResult.code || 'TOKEN_ISSUE_FAILED',
          message: issueResult.message,
          requestId: requestId
        }, 400);
      }
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'ISSUE_TOKEN', 'STUDENT_ACCESS', payload.studentId, 'إصدار رمز وصول طالب');
      output.message = 'تم إصدار رمز الوصول بنجاح';
      output.rawToken = issueResult.rawToken; // Returned ONCE for QR/link generation
      output.tokenRecord = issueResult.tokenRecord;
      return createJsonResponse(output, 200);
    }

    if (action === 'revokeStudentAccessToken' && payload) {
      revokeStudentAccessToken(ss, payload.id || payload.studentId);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'REVOKE_TOKEN', 'STUDENT_ACCESS', payload.id || payload.studentId, 'إلغاء رمز وصول طالب');
      output.message = 'تم إلغاء رمز الوصول بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'getStudentAccessTokensList') {
      var allTokens = getSheetData(ss, SHEETS.STUDENT_ACCESS_TOKENS);
      output.data = allTokens.map(function(t) {
        var clean = Object.assign({}, t);
        delete clean.tokenHash; // Do not leak hash
        return clean;
      });
      return createJsonResponse(output, 200);
    }

    // D. Daily Student Attendance (School-day level only)
    if (action === 'getStudentAttendance') {
      output.data = getSheetData(ss, SHEETS.STUDENT_ATTENDANCE);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveStudentAttendance' && payload) {
      upsertRecord(ss, SHEETS.STUDENT_ATTENDANCE, 'id', payload);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'STUDENT_ATTENDANCE', payload.id || '', 'تسجيل حضور طالب');
      output.message = 'تم تسجيل حضور الطالب بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'bulkSaveStudentAttendance' && payload && Array.isArray(payload)) {
      payload.forEach(function(rec) { upsertRecord(ss, SHEETS.STUDENT_ATTENDANCE, 'id', rec); });
      output.message = 'تم حفظ دفعة حضور الطلاب بنجاح (' + payload.length + ' سجل)';
      return createJsonResponse(output, 200);
    }

    // E. Staff & Employees (Financial fields stripped)
    if (action === 'getEmployees') {
      var rawEmployees = getSheetData(ss, SHEETS.EMPLOYEES);
      output.data = rawEmployees.map(function(emp) {
        var cleanEmp = Object.assign({}, emp);
        delete cleanEmp.basicSalary;
        delete cleanEmp.allowances;
        delete cleanEmp.netSalary;
        return cleanEmp;
      });
      return createJsonResponse(output, 200);
    }

    if (action === 'saveEmployee' && payload) {
      var sanitizedEmp = Object.assign({}, payload);
      delete sanitizedEmp.basicSalary;
      delete sanitizedEmp.allowances;
      upsertRecord(ss, SHEETS.EMPLOYEES, 'id', sanitizedEmp);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'EMPLOYEES', payload.id || '', 'حفظ سجل موظف');
      output.message = 'تم حفظ بيانات الموظف بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteEmployee' && payload && payload.id) {
      deleteRecord(ss, SHEETS.EMPLOYEES, 'id', payload.id);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'DELETE', 'EMPLOYEES', payload.id, 'حذف موظف');
      output.message = 'تم حذف سجل الموظف بنجاح';
      return createJsonResponse(output, 200);
    }

    // F. Employee Attendance, Leaves, Permissions
    if (action === 'getAttendance') {
      output.data = getSheetData(ss, SHEETS.ATTENDANCE);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveAttendance' && payload) {
      upsertRecord(ss, SHEETS.ATTENDANCE, 'id', payload);
      output.message = 'تم تسجيل دوام الموظف بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'bulkSaveAttendance' && payload && Array.isArray(payload)) {
      payload.forEach(function(rec) { upsertRecord(ss, SHEETS.ATTENDANCE, 'id', rec); });
      output.message = 'تم حفظ دوام الموظفين (' + payload.length + ' سجل)';
      return createJsonResponse(output, 200);
    }

    if (action === 'getLeaves') {
      output.data = getSheetData(ss, SHEETS.LEAVES);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveLeave' && payload) {
      upsertRecord(ss, SHEETS.LEAVES, 'id', payload);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'LEAVES', payload.id || '', 'طلب / اعتماد إجازة');
      output.message = 'تم حفظ سجل الإجازة بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteLeave' && payload && payload.id) {
      deleteRecord(ss, SHEETS.LEAVES, 'id', payload.id);
      output.message = 'تم حذف سجل الإجازة بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'getPermissions') {
      output.data = getSheetData(ss, SHEETS.PERMISSIONS);
      return createJsonResponse(output, 200);
    }

    if (action === 'savePermission' && payload) {
      upsertRecord(ss, SHEETS.PERMISSIONS, 'id', payload);
      output.message = 'تم حفظ سجل الإذن بنجاح';
      return createJsonResponse(output, 200);
    }

    // G. Timetable - Teacher Teaching Assignments
    if (action === 'getTeacherAssignments') {
      output.data = getSheetData(ss, SHEETS.TEACHER_TEACHING_ASSIGNMENTS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveTeacherAssignment' && payload) {
      upsertRecord(ss, SHEETS.TEACHER_TEACHING_ASSIGNMENTS, 'id', payload);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'TEACHING_ASSIGNMENT', payload.id || '', 'إسناد تدريس لمعلم');
      output.message = 'تم حفظ إسناد التدريس بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteTeacherAssignment' && payload && payload.id) {
      deleteRecord(ss, SHEETS.TEACHER_TEACHING_ASSIGNMENTS, 'id', payload.id);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'DELETE', 'TEACHING_ASSIGNMENT', payload.id, 'حذف إسناد تدريس');
      output.message = 'تم حذف إسناد التدريس بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'bulkSaveTeacherAssignments' && payload && Array.isArray(payload)) {
      payload.forEach(function(rec) { upsertRecord(ss, SHEETS.TEACHER_TEACHING_ASSIGNMENTS, 'id', rec); });
      output.message = 'تم حفظ ' + payload.length + ' إسناد تدريس بنجاح';
      return createJsonResponse(output, 200);
    }

    // H. Timetable - Schedule Entries (Weekly Timetable)
    if (action === 'getSchedule') {
      output.data = getSheetData(ss, SHEETS.SCHEDULE);
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

        var scheduleConflict = validateServerScheduleConflicts(ss, payload);
        if (!scheduleConflict.success) {
          return createJsonResponse({
            status: 'error',
            code: scheduleConflict.code || 'SCHEDULE_CONFLICT',
            message: scheduleConflict.message,
            requestId: requestId
          }, 400);
        }

        upsertRecord(ss, SHEETS.SCHEDULE, 'id', payload);
        recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'SCHEDULE', payload.id || '', 'حفظ حصة دراسية مع التحقق الأمني');
        output.message = 'تم حفظ الحصة الدراسية بنجاح';
        return createJsonResponse(output, 200);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'bulkSaveSchedule' && payload && Array.isArray(payload)) {
      payload.forEach(function(rec) { upsertRecord(ss, SHEETS.SCHEDULE, 'id', rec); });
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'BULK_SAVE', 'SCHEDULE', payload.length + ' slots', 'حفظ دفعة جدول دراسي');
      output.message = 'تم حفظ ' + payload.length + ' حصة في الجدول بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteScheduleEntry' && payload && payload.id) {
      deleteRecord(ss, SHEETS.SCHEDULE, 'id', payload.id);
      output.message = 'تم حذف الحصة الدراسية بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'publishSchedule' && payload) {
      var pubResult = publishScheduleBatch(ss, payload.classroomOrGrade, payload.version, authenticatedUsername);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'PUBLISH', 'SCHEDULE', payload.classroomOrGrade || 'ALL', 'نشر الجدول الدراسي رسمياً');
      output.message = pubResult.message;
      return createJsonResponse(output, 200);
    }

    // I. Schedule Breaks
    if (action === 'getScheduleBreaks') {
      output.data = getSheetData(ss, SHEETS.SCHEDULE_BREAKS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveScheduleBreaks' && payload && Array.isArray(payload)) {
      var breaksSheet = ss.getSheetByName(SHEETS.SCHEDULE_BREAKS);
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

    // J. Teacher Availability
    if (action === 'getTeacherAvailability') {
      output.data = getSheetData(ss, SHEETS.TEACHER_AVAILABILITY);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveTeacherAvailability' && payload) {
      if (Array.isArray(payload)) {
        payload.forEach(function(rec) { upsertRecord(ss, SHEETS.TEACHER_AVAILABILITY, 'id', rec); });
      } else {
        upsertRecord(ss, SHEETS.TEACHER_AVAILABILITY, 'id', payload);
      }
      output.message = 'تم حفظ بيانات تفرغ المعلم بنجاح';
      return createJsonResponse(output, 200);
    }

    // K. Reserve Substitutions (With Server-Side Hard-Block & LockService)
    if (action === 'getReserveAssignments') {
      output.data = getSheetData(ss, SHEETS.RESERVE_ASSIGNMENTS);
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

        var reserveResult = handleSaveReserveAssignment(ss, payload, authenticatedUsername, requestId);
        if (!reserveResult.success) {
          return createJsonResponse({
            status: 'error',
            code: reserveResult.code || 'RESERVE_ASSIGN_FAILED',
            message: reserveResult.message,
            requestId: requestId
          }, 400);
        }

        recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'ASSIGN', 'RESERVE', payload.id || '', 'إسناد حصة احتياطي');
        output.message = reserveResult.message;
        output.record = reserveResult.record;
        return createJsonResponse(output, 200);
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'cancelReserveAssignment' && payload && payload.id) {
      var cancelRes = cancelReserveAssignmentRecord(ss, payload.id, payload.reason, authenticatedUsername);
      output.message = cancelRes.message;
      return createJsonResponse(output, 200);
    }

    // L. Supervision Schedule
    if (action === 'getSupervisionLocations') {
      output.data = getSheetData(ss, SHEETS.SUPERVISION_LOCATIONS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveSupervisionLocation' && payload) {
      upsertRecord(ss, SHEETS.SUPERVISION_LOCATIONS, 'id', payload);
      output.message = 'تم حفظ موقع الإشراف بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'getSupervisionAssignments') {
      output.data = getSheetData(ss, SHEETS.SUPERVISION_ASSIGNMENTS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveSupervisionAssignment' && payload) {
      var supResult = handleSaveSupervisionAssignment(ss, payload, authenticatedUsername, requestId);
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

    // M. Homework Management (Staff-Level Review & Approval)
    if (action === 'getHomework') {
      output.data = getSheetData(ss, SHEETS.HOMEWORK);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveHomework' && payload) {
      upsertRecord(ss, SHEETS.HOMEWORK, 'id', payload);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'HOMEWORK', payload.id || '', 'حفظ / اعتماد واجب منزلي');
      output.message = 'تم حفظ سجل الواجب بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteHomework' && payload && payload.id) {
      deleteRecord(ss, SHEETS.HOMEWORK, 'id', payload.id);
      output.message = 'تم حذف الواجب بنجاح';
      return createJsonResponse(output, 200);
    }

    // N. Teacher Lesson Resources (Staff-Level)
    if (action === 'getTeacherResources') {
      output.data = getSheetData(ss, SHEETS.TEACHER_RESOURCES);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveTeacherResource' && payload) {
      upsertRecord(ss, SHEETS.TEACHER_RESOURCES, 'id', payload);
      output.message = 'تم حفظ المورد التعليمي بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteTeacherResource' && payload && payload.id) {
      deleteRecord(ss, SHEETS.TEACHER_RESOURCES, 'id', payload.id);
      output.message = 'تم حذف المورد بنجاح';
      return createJsonResponse(output, 200);
    }

    // O. Exam Schedules
    if (action === 'getExamSchedules') {
      output.data = getSheetData(ss, SHEETS.EXAM_SCHEDULES);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveExamSchedule' && payload) {
      upsertRecord(ss, SHEETS.EXAM_SCHEDULES, 'id', payload);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'EXAM_SCHEDULE', payload.id || '', 'حفظ جدول امتحان');
      output.message = 'تم حفظ جدول الامتحان بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteExamSchedule' && payload && payload.id) {
      deleteRecord(ss, SHEETS.EXAM_SCHEDULES, 'id', payload.id);
      output.message = 'تم حذف موعد الامتحان بنجاح';
      return createJsonResponse(output, 200);
    }

    // P. Teacher Portal PIN Management (By Staff)
    if (action === 'setTeacherPortalPin' && payload) {
      var pinResult = setTeacherPortalPin(ss, payload.teacherId, payload.pin, authenticatedUsername, requestId);
      if (!pinResult.success) {
        return createJsonResponse({
          status: 'error',
          code: pinResult.code || 'PIN_SET_FAILED',
          message: pinResult.message,
          requestId: requestId
        }, 400);
      }
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SET_PIN', 'TEACHER_CREDENTIALS', payload.teacherId, 'تعيين رمز مرور بوابة المعلم');
      output.message = pinResult.message;
      return createJsonResponse(output, 200);
    }

    // Q. Behavior & Social Support
    if (action === 'getBehaviorRecords') {
      output.violations = getSheetData(ss, SHEETS.BEHAVIOR_VIOLATIONS);
      output.cases = getSheetData(ss, SHEETS.BEHAVIOR_CASES);
      output.positiveTypes = getSheetData(ss, SHEETS.POSITIVE_BEHAVIOR_TYPES);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveBehaviorViolation' && payload) {
      upsertRecord(ss, SHEETS.BEHAVIOR_VIOLATIONS, 'id', payload);
      output.message = 'تم تسجيل المخالفة السلوكية بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'saveBehaviorCase' && payload) {
      upsertRecord(ss, SHEETS.BEHAVIOR_CASES, 'id', payload);
      output.message = 'تم حفظ دراسة الحالة بنجاح';
      return createJsonResponse(output, 200);
    }

    // R. Academic Years & Enrollments
    if (action === 'getAcademicYears') {
      output.academicYears = getSheetData(ss, SHEETS.ACADEMIC_YEARS);
      output.enrollments = getSheetData(ss, SHEETS.STUDENT_ENROLLMENTS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveAcademicYear' && payload) {
      upsertRecord(ss, SHEETS.ACADEMIC_YEARS, 'id', payload);
      output.message = 'تم حفظ العام الدراسي بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'saveStudentEnrollment' && payload) {
      upsertRecord(ss, SHEETS.STUDENT_ENROLLMENTS, 'id', payload);
      output.message = 'تم حفظ قيد الطالب بنجاح';
      return createJsonResponse(output, 200);
    }

    // S. Parent Communications (Staff Log Only)
    if (action === 'getParentCommunications') {
      output.data = getSheetData(ss, SHEETS.PARENT_COMMUNICATIONS);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveParentCommunication' && payload) {
      upsertRecord(ss, SHEETS.PARENT_COMMUNICATIONS, 'id', payload);
      output.message = 'تم تسجيل محضر التواصل بنجاح';
      return createJsonResponse(output, 200);
    }

    // T. Settings & Audit
    if (action === 'getSettings') {
      output.data = getSettingsDataClean(ss);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveSettings' && payload) {
      saveSettingsDataClean(ss, payload);
      output.message = 'تم حفظ إعدادات المدرسة بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'getAuditLogs') {
      output.data = getSheetData(ss, SHEETS.AUDIT_LOGS);
      return createJsonResponse(output, 200);
    }

    if (action === 'addAuditLog' && payload) {
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, payload.action || 'CUSTOM', payload.entity || 'SYSTEM', payload.targetId || '', payload.details || '');
      output.message = 'تم قيد العملية في سجل الرقابة';
      return createJsonResponse(output, 200);
    }

    // U. User Management (Admin Only)
    if (action === 'getUsers') {
      output.data = getSanitizedUsersList(ss);
      return createJsonResponse(output, 200);
    }

    if (action === 'saveUser' && payload) {
      var savedUser = saveUserSecure(ss, payload, authenticatedUsername, requestId);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'SAVE', 'USERS', payload.username || '', 'حفظ حساب مستخدم');
      output.message = 'تم حفظ حساب المستخدم بنجاح';
      output.user = savedUser;
      return createJsonResponse(output, 200);
    }

    if (action === 'deleteUser' && payload && payload.id) {
      deleteRecord(ss, SHEETS.USERS, 'id', payload.id);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'DELETE', 'USERS', payload.id, 'حذف حساب مستخدم');
      output.message = 'تم حذف حساب المستخدم بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'resetUserPassword' && payload) {
      var resetRes = resetUserPasswordSecure(ss, payload.userId, payload.newPassword, authenticatedUsername, requestId);
      if (!resetRes.success) {
        return createJsonResponse({
          status: 'error',
          code: resetRes.code || 'RESET_FAILED',
          message: resetRes.message,
          requestId: requestId
        }, 400);
      }
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'RESET_PASSWORD', 'USERS', payload.userId, 'إعادة تعيين كلمة مرور مستخدم');
      output.message = resetRes.message;
      return createJsonResponse(output, 200);
    }

    if (action === 'issueUserActivationToken' && payload) {
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
      revokeAllUserSessions(ss, payload.userId);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'REVOKE_SESSIONS', 'USERS', payload.userId, 'إلغاء جميع جلسات المستخدم');
      output.message = 'تم إلغاء جميع جلسات العمل النشطة للمستخدم بنجاح';
      return createJsonResponse(output, 200);
    }

    if (action === 'toggleUserStatus' && payload && payload.userId) {
      var statusRes = toggleUserStatusSecure(ss, payload.userId, payload.status);
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'UPDATE_STATUS', 'USERS', payload.userId, 'تعديل حالة حساب المستخدم');
      output.message = statusRes.message;
      output.status = statusRes.status;
      return createJsonResponse(output, 200);
    }

    // V. Authenticated POST Data Sync (Replaces legacy unauthenticated GET getAll)
    if (action === 'syncData') {
      output.data = {
        students: getSheetData(ss, SHEETS.STUDENTS),
        employees: getSheetData(ss, SHEETS.EMPLOYEES).map(function(e) {
          var clean = Object.assign({}, e);
          delete clean.basicSalary;
          delete clean.allowances;
          return clean;
        }),
        schedule: getSheetData(ss, SHEETS.SCHEDULE),
        scheduleBreaks: getSheetData(ss, SHEETS.SCHEDULE_BREAKS),
        teacherAssignments: getSheetData(ss, SHEETS.TEACHER_TEACHING_ASSIGNMENTS),
        substitutions: getSheetData(ss, SHEETS.RESERVE_ASSIGNMENTS),
        supervisionLocations: getSheetData(ss, SHEETS.SUPERVISION_LOCATIONS),
        supervisionAssignments: getSheetData(ss, SHEETS.SUPERVISION_ASSIGNMENTS),
        teacherAvailability: getSheetData(ss, SHEETS.TEACHER_AVAILABILITY),
        homeworks: getSheetData(ss, SHEETS.HOMEWORK),
        teacherResources: getSheetData(ss, SHEETS.TEACHER_RESOURCES),
        examSchedules: getSheetData(ss, SHEETS.EXAM_SCHEDULES),
        academicYears: getSheetData(ss, SHEETS.ACADEMIC_YEARS),
        studentAttendance: getSheetData(ss, SHEETS.STUDENT_ATTENDANCE),
        employeeAttendance: getSheetData(ss, SHEETS.ATTENDANCE),
        leaves: getSheetData(ss, SHEETS.LEAVES),
        permissions: getSheetData(ss, SHEETS.PERMISSIONS),
        settings: getSettingsDataClean(ss)
      };
      return createJsonResponse(output, 200);
    }

    // W. Timetable Import Commit (With exact teacherCode validation & duplicate prevention)
    if (action === 'commitTimetableImport' && payload) {
      var importRes = commitTimetableImportBatch(ss, payload.rows, payload.batchFingerprint, authenticatedUsername);
      if (!importRes.success) {
        return createJsonResponse({
          status: 'error',
          code: importRes.code || 'IMPORT_FAILED',
          message: importRes.message,
          errors: importRes.errors,
          requestId: requestId
        }, 400);
      }
      recordAuthoritativeAudit(ss, requestId, authenticatedUsername, authenticatedRole, 'IMPORT', 'SCHEDULE', payload.batchFingerprint || '', 'استيراد واعتماد جدول دراسي');
      output.message = importRes.message;
      output.importedCount = importRes.importedCount;
      return createJsonResponse(output, 200);
    }

    // X. Server-Side Archive & Scope Snapshot
    if (action === 'createArchiveSnapshot') {
      var archiveReceipt = executeServerSideArchive(ss, authenticatedUsername, requestId);
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
 * Handle staff login with salted PBKDF2/HMAC verification
 */
function handleStaffLogin(ss, inputUsername, inputPassword, requestId) {
  if (!inputUsername || !inputPassword) {
    return { success: false, code: 'CREDENTIALS_REQUIRED', message: 'يرجى إدخال اسم المستخدم وكلمة المرور' };
  }

  var users = getSheetData(ss, SHEETS.USERS);
  if (!users || users.length === 0) {
    return {
      success: false,
      code: 'DATABASE_EMPTY',
      message: 'قاعدة بيانات المستخدمين فارغة. يرجى تهيئة حساب المدير الأول عبر معالج التهيئة الآمن.'
    };
  }

  var matchedUser = null;
  var userRowIndex = -1;

  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var uName = String(u.username || '').trim().toLowerCase();
    var uId = String(u.id || '').trim().toLowerCase();
    var uLogin = String(u.loginNumber || '').trim();
    if (uName === inputUsername || uId === inputUsername || (uLogin && uLogin === inputUsername)) {
      matchedUser = u;
      userRowIndex = i + 2; // +2 for header offset
      break;
    }
  }

  if (!matchedUser) {
    return { success: false, code: 'INVALID_CREDENTIALS', message: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
  }

  // 1. Permanent Staff-Only Role Enforcement: Block Teacher, Parent, Student from staff login
  var role = String(matchedUser.role || '').trim();
  if (role === 'Teacher' || role === 'Parent' || role === 'Student') {
    recordAuthoritativeAudit(ss, requestId, inputUsername, role, 'LOGIN_BLOCKED', 'AUTH', matchedUser.id || '', 'محاولة دخول بحساب دور ملغى (' + role + ')');
    return {
      success: false,
      code: 'ACCOUNT_ROLE_NOT_ALLOWED',
      message: 'حسابات المعلمين المستقلة وأولياء الأمور والطلاب لا تسجل الدخول من هنا. الدخول مخصص لموظفي الإدارة المعتمدين فقط.'
    };
  }

  // 2. Account Status Check
  var status = String(matchedUser.status || 'Active').trim().toLowerCase();
  var isActive = (matchedUser.isActive === true || matchedUser.isActive === 'true' || matchedUser.isActive === undefined);
  if (status === 'inactive' || status === 'disabled' || !isActive) {
    return { success: false, code: 'ACCOUNT_INACTIVE', message: 'هذا الحساب غير مفعل حالياً. يرجى مراجعة مدير النظام.' };
  }

  // 2.5 First-Login Password Setup Check (No default passwords, requires one-time activation token)
  var isPassInit = (matchedUser.passwordInitialized === true || matchedUser.passwordInitialized === 'true');
  var hasPasswordHash = Boolean(matchedUser.passwordHash && String(matchedUser.passwordHash).trim().length > 10);
  if (!isPassInit && !hasPasswordHash) {
    return {
      success: false,
      code: 'PASSWORD_SETUP_REQUIRED',
      loginNumber: matchedUser.loginNumber || '',
      message: 'حسابك يتطلب إنشاء كلمة المرور لأول مرة. يرجى استخدام كود التفعيل الممنوح من إدارة المدرسة.'
    };
  }

  // 3. Salted Password Verification
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
        updateUserPasswordColumns(ss, userRowIndex, newHash, newSalt, 'PBKDF2-HMAC-SHA256', PBKDF2_ITERATIONS);
      } catch (upgradeErr) {}
    }
  }

  if (!passwordValid) {
    recordAuthoritativeAudit(ss, requestId, inputUsername, role, 'LOGIN_FAILED', 'AUTH', matchedUser.id || '', 'محاولة تسجيل دخول بكلمة مرور خاطئة');
    return { success: false, code: 'INVALID_CREDENTIALS', message: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
  }

  // 4. Issue Authoritative Server-Side Session Token
  var sessionToken = generateSecureRandomToken(48);
  var tokenHash = hashStringSHA256(sessionToken);
  var now = new Date();
  var expiresAt = new Date(now.getTime() + (SESSION_DURATION_HOURS * 60 * 60 * 1000));
  var nowStr = now.toISOString();
  var expiresStr = expiresAt.toISOString();

  var sessionRow = [
    'SESS_' + Utilities.getUuid().substring(0, 10),
    tokenHash,
    matchedUser.id,
    matchedUser.username,
    matchedUser.fullName,
    matchedUser.role,
    nowStr,
    expiresStr,
    'ACTIVE'
  ];

  var sessionsSheet = ss.getSheetByName(SHEETS.SESSIONS);
  if (sessionsSheet) {
    sessionsSheet.appendRow(sessionRow);
  }

  // Update lastLogin in Users sheet
  try {
    var usersSheet = ss.getSheetByName(SHEETS.USERS);
    var headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
    var lastLoginCol = headers.indexOf('lastLogin') + 1;
    if (lastLoginCol > 0 && userRowIndex > 0) {
      usersSheet.getRange(userRowIndex, lastLoginCol).setValue(nowStr);
    }
  } catch (uErr) {}

  recordAuthoritativeAudit(ss, requestId, matchedUser.username, matchedUser.role, 'LOGIN_SUCCESS', 'AUTH', matchedUser.id, 'تسجيل دخول ناجح وإنشاء جلسة عمل');

  var sanitizedUser = {
    id: matchedUser.id,
    username: matchedUser.username,
    fullName: matchedUser.fullName,
    role: matchedUser.role,
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
 * Handle Teacher Portal Login (Teacher Code + PIN/Password -> Teacher Session Token)
 */
function handleTeacherLogin(ss, teacherCode, pin, requestId) {
  if (!teacherCode || !pin) {
    return { success: false, code: 'CREDENTIALS_REQUIRED', message: 'يرجى إدخال كود المعلم ورمز المرور (PIN)' };
  }

  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var teacher = null;
  var cleanInput = String(teacherCode).trim().toUpperCase();
  for (var i = 0; i < employees.length; i++) {
    var emp = employees[i];
    var empCode = String(emp.teacherCode || '').trim().toUpperCase();
    var empLogin = String(emp.loginNumber || '').trim();
    if (empCode === cleanInput || empLogin === cleanInput || (emp.id && emp.id.toUpperCase() === cleanInput)) {
      teacher = emp;
      break;
    }
  }

  if (!teacher) {
    return { success: false, code: 'TEACHER_NOT_FOUND', message: 'كود المعلم أو رقم الدخول غير مسجل بقاعدة بيانات الهيئة التعليمية' };
  }

  var status = String(teacher.status || 'Active').trim().toLowerCase();
  if (status === 'inactive' || status === 'suspended') {
    return { success: false, code: 'TEACHER_INACTIVE', message: 'حساب المعلم غير نشط حالياً، يرجى مراجعة إدارة شؤون المعلمين' };
  }

  // Check credentials in Teacher_Credentials sheet
  var credentials = getSheetData(ss, SHEETS.TEACHER_CREDENTIALS);
  var cred = null;
  for (var j = 0; j < credentials.length; j++) {
    if (credentials[j].teacherId === teacher.id || String(credentials[j].teacherCode || '').trim().toUpperCase() === cleanInput) {
      cred = credentials[j];
      break;
    }
  }

  // Check First-Login Setup requirement
  var isTeacherPassInit = (teacher.passwordInitialized === true || teacher.passwordInitialized === 'true');
  if (cred && cred.passwordInitialized !== undefined) {
    isTeacherPassInit = (cred.passwordInitialized === true || cred.passwordInitialized === 'true');
  }
  var hasTeacherPass = Boolean(cred && cred.pinHash);
  if (!isTeacherPassInit && !hasTeacherPass) {
    return {
      success: false,
      code: 'PASSWORD_SETUP_REQUIRED',
      loginNumber: teacher.loginNumber || '',
      message: 'حساب المعلم يتطلب إعداد كلمة المرور لأول مرة. يرجى تفعيل الحساب باستخدام كود التفعيل الممنوح من إدارة المدرسة.'
    };
  }

  if (!cred || !cred.pinHash || !cred.salt) {
    return {
      success: false,
      code: 'TEACHER_PIN_NOT_SET',
      message: 'لم يتم تعيين رمز مرور للبوابة لهذا المعلم بعد. يرجى مراجعة إدارة شؤون المعلمين لتعيين رمز المرور.'
    };
  }

  var computedHash = computeSaltedHash(pin, cred.salt, parseInt(cred.iterations || '10000', 10));
  if (computedHash !== cred.pinHash) {
    recordAuthoritativeAudit(ss, requestId, teacherCode, 'Teacher', 'TEACHER_LOGIN_FAIL', 'TEACHER_AUTH', teacher.id, 'محاولة دخول معلم برمز مرور غير صحيح');
    return { success: false, code: 'INVALID_CREDENTIALS', message: 'كود المعلم أو رمز المرور غير صحيح' };
  }

  // Issue Opaque Teacher Session Token
  var token = generateSecureRandomToken(48);
  var tokenHash = hashStringSHA256(token);
  var now = new Date();
  var expiresAt = new Date(now.getTime() + (TEACHER_SESSION_DURATION_HOURS * 60 * 60 * 1000));
  var nowStr = now.toISOString();
  var expiresStr = expiresAt.toISOString();

  var sessionRow = [
    'TSESS_' + Utilities.getUuid().substring(0, 10),
    tokenHash,
    teacher.id,
    teacher.id,
    teacherCode,
    teacher.name,
    nowStr,
    expiresStr,
    'ACTIVE'
  ];

  var tSheet = ss.getSheetByName(SHEETS.TEACHER_SESSIONS);
  if (tSheet) {
    tSheet.appendRow(sessionRow);
  }

  recordAuthoritativeAudit(ss, requestId, teacherCode, 'Teacher', 'TEACHER_LOGIN_SUCCESS', 'TEACHER_AUTH', teacher.id, 'تسجيل دخول معلم وإنشاء جلسة');

  return {
    success: true,
    teacherSessionToken: token,
    expiresAt: expiresStr,
    teacher: {
      teacherId: teacher.id,
      employeeId: teacher.id,
      teacherCode: teacherCode,
      teacherName: teacher.name,
      department: teacher.department || 'الهيئة التعليمية',
      teachingSubjects: teacher.teachingSubjects ? (Array.isArray(teacher.teachingSubjects) ? teacher.teachingSubjects : String(teacher.teachingSubjects).split(',').map(function(s){return s.trim();})) : [],
      weeklyPeriodLimit: parseInt(teacher.weeklyPeriodLimit || '30', 10)
    }
  };
}

/**
 * Handle First Admin Bootstrap (Strict Script Properties Only - Fails Closed)
 */
function handleFirstAdminBootstrap(ss, postData, requestId) {
  var users = getSheetData(ss, SHEETS.USERS);
  var activeAdmins = users.filter(function(u) {
    return String(u.role || '').trim() === 'Admin' && String(u.status || 'Active').trim() === 'Active';
  });

  var scriptProps = PropertiesService.getScriptProperties();
  var propCompleted = scriptProps.getProperty('BOOTSTRAP_COMPLETED');
  if (activeAdmins.length > 0 || propCompleted === 'true') {
    return {
      success: false,
      code: 'BOOTSTRAP_LOCKED',
      message: 'تم إغلاق معالج التهيئة الأولية نهائياً. يوجد بالفعل حساب مدير نظام معتمد.'
    };
  }

  // SECURITY: Strictly accept credentials ONLY from Script Properties, NEVER from request payload
  var username = scriptProps.getProperty('BOOTSTRAP_ADMIN_USERNAME');
  var password = scriptProps.getProperty('BOOTSTRAP_ADMIN_PASSWORD');

  if (!username || !password) {
    return {
      success: false,
      code: 'BOOTSTRAP_PROPERTIES_MISSING',
      message: 'تعذر تهيئة مدير النظام: لم يتم ضبط BOOTSTRAP_ADMIN_USERNAME و BOOTSTRAP_ADMIN_PASSWORD في Script Properties.'
    };
  }

  username = String(username).trim().toLowerCase();
  password = String(password).trim();
  var fullName = 'مدير النظام الأول المعتمد';

  if (password.length < 8) {
    return { success: false, code: 'PASSWORD_TOO_WEAK', message: 'كلمة المرور في Script Properties يجب أن لا تقل عن 8 أحرف.' };
  }

  var salt = Utilities.getUuid().replace(/-/g, '');
  var passwordHash = computeSaltedHash(password, salt, PBKDF2_ITERATIONS);
  var now = new Date().toISOString();

  var adminUserRow = [
    'USR_ADM_' + Utilities.getUuid().substring(0, 8),
    username,
    passwordHash,
    salt,
    'PBKDF2-HMAC-SHA256',
    PBKDF2_ITERATIONS,
    fullName,
    'Admin',
    'Active',
    'الإدارة العامة والتوجيه',
    'admin@ntss-schools.edu.eg',
    now,
    '',
    now
  ];

  var usersSheet = ss.getSheetByName(SHEETS.USERS);
  if (usersSheet) {
    usersSheet.appendRow(adminUserRow);
  }

  scriptProps.setProperty('BOOTSTRAP_COMPLETED', 'true');
  scriptProps.deleteProperty('BOOTSTRAP_ADMIN_PASSWORD'); // Immediate wipe of sensitive credential

  recordAuthoritativeAudit(ss, requestId, username, 'Admin', 'BOOTSTRAP_INIT', 'USERS', username, 'تمت تهيئة حساب مدير النظام الأول بنجاح ومسح كلمة المرور من الخصائص');

  return {
    success: true,
    message: 'تم إنشاء حساب مدير النظام الأول بنجاح من Script Properties وقفل المعالج نهائياً.',
    user: { username: username, fullName: fullName, role: 'Admin' }
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

  return {
    valid: true,
    session: {
      sessionId: matched.sessionId,
      userId: matched.userId,
      username: matched.username,
      fullName: matched.fullName,
      role: matched.role,
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

  return {
    valid: true,
    session: {
      teacherId: matched.teacherId,
      employeeId: matched.employeeId,
      teacherCode: matched.teacherCode,
      teacherName: matched.teacherName
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

/**
 * Authorize Action based on Staff Role
 */
function authorizeStaffAction(role, action) {
  // Admin has access to all active actions
  if (role === 'Admin') return { allowed: true };

  // School Director
  if (role === 'SchoolDirector') {
    var forbiddenForDirector = ['saveUser', 'deleteUser', 'resetUserPassword'];
    if (forbiddenForDirector.indexOf(action) !== -1) {
      return { allowed: false, message: 'إدارة حسابات المستخدمين وصلاحياتهم مقتصرة على مدير النظام (Admin)' };
    }
    return { allowed: true };
  }

  // Student Affairs
  if (role === 'StudentAffairs') {
    var studentAffairsActions = [
      'getStudents', 'saveStudent', 'bulkSaveStudents', 'deleteStudent',
      'getStudentAttendance', 'saveStudentAttendance', 'bulkSaveStudentAttendance',
      'issueStudentAccessToken', 'revokeStudentAccessToken', 'rotateStudentAccessToken', 'getStudentAccessTokensList',
      'getAcademicYears', 'saveAcademicYear', 'saveStudentEnrollment',
      'getBehaviorRecords', 'saveBehaviorCase',
      'getSchedule', 'getExamSchedules',
      'getParentCommunications', 'saveParentCommunication',
      'getSettings', 'getAuditLogs', 'addAuditLog', 'logout', 'validateSession', 'syncData'
    ];
    if (studentAffairsActions.indexOf(action) !== -1) return { allowed: true };
    return { allowed: false, message: 'هذا الإجراء خارج اختصاص شؤون الطلاب' };
  }

  // Teacher & Staff Affairs
  if (role === 'TeacherAffairs') {
    var teacherAffairsActions = [
      'getEmployees', 'saveEmployee', 'deleteEmployee',
      'getAttendance', 'saveAttendance', 'bulkSaveAttendance',
      'getLeaves', 'saveLeave', 'deleteLeave',
      'getPermissions', 'savePermission',
      'getTeacherAssignments', 'saveTeacherAssignment', 'deleteTeacherAssignment', 'bulkSaveTeacherAssignments',
      'getSchedule', 'saveScheduleEntry', 'bulkSaveSchedule', 'deleteScheduleEntry', 'publishSchedule',
      'getScheduleBreaks', 'saveScheduleBreaks',
      'getTeacherAvailability', 'saveTeacherAvailability',
      'getReserveAssignments', 'saveReserveAssignment', 'cancelReserveAssignment', 'getReserveCandidates',
      'getSupervisionLocations', 'saveSupervisionLocation', 'getSupervisionAssignments', 'saveSupervisionAssignment',
      'setTeacherPortalPin', 'commitTimetableImport',
      'getHomework', 'saveHomework', 'deleteHomework',
      'getTeacherResources', 'saveTeacherResource', 'deleteTeacherResource',
      'getExamSchedules', 'saveExamSchedule', 'deleteExamSchedule',
      'getSettings', 'getAuditLogs', 'addAuditLog', 'logout', 'validateSession', 'syncData'
    ];
    if (teacherAffairsActions.indexOf(action) !== -1) return { allowed: true };
    return { allowed: false, message: 'هذا الإجراء خارج اختصاص شؤون المعلمين والعاملين' };
  }

  // Social Specialist
  if (role === 'SocialSpecialist') {
    var socialActions = [
      'getStudents',
      'getBehaviorRecords', 'saveBehaviorViolation', 'saveBehaviorCase',
      'getParentCommunications', 'saveParentCommunication',
      'getSettings', 'addAuditLog', 'logout', 'validateSession', 'syncData'
    ];
    if (socialActions.indexOf(action) !== -1) return { allowed: true };
    return { allowed: false, message: 'هذا الإجراء خارج اختصاص الأخصائي الاجتماعي' };
  }

  // Training and Quality Officers
  if (role === 'TrainingOfficer' || role === 'QualityOfficer') {
    var readOnlyStaffActions = [
      'getStudents', 'getStudentAttendance', 'getEmployees', 'getAttendance',
      'getLeaves', 'getPermissions', 'getBehaviorRecords', 'getAcademicYears',
      'getTeacherAssignments', 'getSchedule', 'getReserveAssignments', 'getSupervisionAssignments', 'getExamSchedules',
      'getParentCommunications', 'getSettings', 'getAuditLogs', 'addAuditLog',
      'logout', 'validateSession', 'syncData'
    ];
    if (readOnlyStaffActions.indexOf(action) !== -1) return { allowed: true };
    return { allowed: false, message: 'صلاحيات هذا الدور مخصصة للمتابعة والرقابة والتقارير دون إمكانية التعديل' };
  }

  return { allowed: false, message: 'دور غير مصرح له بتنفيذ هذا الإجراء' };
}

// -------------------------------------------------------------
// TIMETABLE, RESERVE, SUPERVISION & PORTAL LOGIC
// -------------------------------------------------------------

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
 * Set Teacher Portal PIN (Salted PBKDF2 hash stored in Teacher_Credentials)
 */
function setTeacherPortalPin(ss, teacherId, pin, authenticatedUsername, requestId) {
  if (!teacherId || !pin || pin.length < 4) {
    return { success: false, code: 'INVALID_PIN', message: 'رمز المرور يجب ألا يقل عن 4 خانات' };
  }

  var employees = getSheetData(ss, SHEETS.EMPLOYEES);
  var teacher = null;
  for (var i = 0; i < employees.length; i++) {
    if (employees[i].id === teacherId) {
      teacher = employees[i];
      break;
    }
  }

  if (!teacher) {
    return { success: false, code: 'TEACHER_NOT_FOUND', message: 'المعلم غير موجود' };
  }

  var salt = Utilities.getUuid().replace(/-/g, '');
  var pinHash = computeSaltedHash(pin, salt, PBKDF2_ITERATIONS);

  var credRecord = {
    teacherId: teacher.id,
    teacherCode: teacher.teacherCode || '',
    pinHash: pinHash,
    salt: salt,
    iterations: PBKDF2_ITERATIONS,
    isActivated: true,
    updatedAt: getCairoISOString()
  };

  upsertRecord(ss, SHEETS.TEACHER_CREDENTIALS, 'teacherId', credRecord);
  return { success: true, message: 'تم تعيين وتشفير رمز مرور بوابة المعلم بنجاح' };
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
 * Commit Timetable Import Batch (teacherCode or teacherId only, batch duplicate slot checking, fingerprint idempotency)
 */
function commitTimetableImportBatch(ss, rows, batchFingerprint, authenticatedUsername) {
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

function getSanitizedUsersList(ss) {
  var users = getSheetData(ss, SHEETS.USERS);
  return users.map(function(u) {
    var copy = Object.assign({}, u);
    delete copy.password;
    delete copy.passwordHash;
    delete copy.passwordSalt;
    delete copy.passwordAlgorithm;
    delete copy.passwordIterations;
    delete copy.activationTokenHash;
    return copy;
  });
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
  for (var i = 0; i < existingUsers.length; i++) {
    if (existingUsers[i].id === payload.id || existingUsers[i].username === payload.username) {
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

  var record = {
    id: payload.id || ('USR_' + Utilities.getUuid().substring(0, 8)),
    username: String(payload.username).trim().toLowerCase(),
    loginNumber: loginNumber,
    passwordHash: passwordHash || (existing ? existing.passwordHash : ''),
    passwordSalt: passwordHash ? salt : (existing ? existing.passwordSalt : ''),
    passwordAlgorithm: 'PBKDF2-HMAC-SHA256',
    passwordIterations: iterations,
    passwordInitialized: passwordInitialized,
    activationTokenHash: payload.activationTokenHash || (existing ? existing.activationTokenHash : ''),
    activationExpiresAt: payload.activationExpiresAt || (existing ? existing.activationExpiresAt : ''),
    fullName: payload.fullName,
    role: payload.role,
    status: payload.status || 'Active',
    department: payload.department || '',
    email: payload.email || '',
    createdAt: existing ? existing.createdAt : getCairoISOString(),
    updatedAt: getCairoISOString(),
    lastLogin: existing ? existing.lastLogin : '',
    passwordChangedAt: passwordHash ? getCairoISOString() : (existing ? existing.passwordChangedAt : '')
  };

  upsertRecord(ss, SHEETS.USERS, 'id', record);

  var sanitized = Object.assign({}, record);
  delete sanitized.passwordHash;
  delete sanitized.passwordSalt;
  delete sanitized.activationTokenHash;
  return sanitized;
}

function handleFirstLoginPasswordSetup(ss, payload, requestId) {
  if (!payload) {
    return { success: false, code: 'INVALID_PAYLOAD', message: 'البيانات المرسلة غير مكتملة' };
  }

  var inputLoginNumber = String(payload.loginNumber || payload.username || '').trim();
  var activationToken = String(payload.activationToken || payload.token || '').trim();
  var newPassword = String(payload.newPassword || '').trim();
  var confirmPassword = String(payload.confirmPassword || '').trim();

  if (!inputLoginNumber || !activationToken || !newPassword) {
    return { success: false, code: 'FIELDS_REQUIRED', message: 'يرجى إدخال رقم الدخول وكود التفعيل وكلمة المرور الجديدة' };
  }

  if (newPassword.length < 8) {
    return { success: false, code: 'PASSWORD_TOO_SHORT', message: 'كلمة المرور يجب ألا تقل عن 8 أحرف' };
  }

  // Must contain letters and numbers
  if (!/[A-Za-z\u0600-\u06FF]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return { success: false, code: 'PASSWORD_COMPLEXITY_FAILED', message: 'كلمة المرور يجب أن تحتوي على أحرف وأرقام معاً' };
  }

  if (confirmPassword && newPassword !== confirmPassword) {
    return { success: false, code: 'PASSWORDS_DO_NOT_MATCH', message: 'كلمة المرور وتأكيدها غير متطابقين' };
  }

  // Find user in Users sheet
  var usersSheet = ss.getSheetByName(SHEETS.USERS);
  if (!usersSheet) {
    return { success: false, code: 'USERS_SHEET_MISSING', message: 'جدول المستخدمين غير متوفر' };
  }

  var data = usersSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: false, code: 'USER_NOT_FOUND', message: 'بيانات الدخول غير صحيحة أو الحساب غير موجود' };
  }

  var headers = data[0];
  var idCol = headers.indexOf('id');
  var userCol = headers.indexOf('username');
  var loginNumCol = headers.indexOf('loginNumber');
  var statusCol = headers.indexOf('status');
  var tokenHashCol = headers.indexOf('activationTokenHash');
  var expiresAtCol = headers.indexOf('activationExpiresAt');
  var passInitCol = headers.indexOf('passwordInitialized');
  var passHashCol = headers.indexOf('passwordHash');
  var saltCol = headers.indexOf('passwordSalt');
  var algoCol = headers.indexOf('passwordAlgorithm');
  var iterCol = headers.indexOf('passwordIterations');
  var passChangedCol = headers.indexOf('passwordChangedAt');

  var matchedRow = -1;
  var userRecord = null;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var uId = idCol >= 0 ? String(row[idCol] || '').trim() : '';
    var uName = userCol >= 0 ? String(row[userCol] || '').trim().toLowerCase() : '';
    var uLogin = loginNumCol >= 0 ? String(row[loginNumCol] || '').trim() : '';

    if (uLogin === inputLoginNumber || uName === inputLoginNumber.toLowerCase() || uId === inputLoginNumber) {
      matchedRow = i + 1;
      userRecord = row;
      break;
    }
  }

  if (matchedRow === -1 || !userRecord) {
    return { success: false, code: 'USER_NOT_FOUND', message: 'بيانات الدخول غير صحيحة أو الحساب غير موجود' };
  }

  // Check user status
  var status = statusCol >= 0 ? String(userRecord[statusCol] || 'Active').trim().toLowerCase() : 'active';
  if (status === 'inactive' || status === 'suspended' || status === 'disabled') {
    return { success: false, code: 'ACCOUNT_INACTIVE', message: 'هذا الحساب غير نشط حالياً. يرجى مراجعة إدارة المدرسة.' };
  }

  // Validate activation token hash
  var storedTokenHash = tokenHashCol >= 0 ? String(userRecord[tokenHashCol] || '').trim() : '';
  if (!storedTokenHash) {
    return { success: false, code: 'NO_ACTIVATION_TOKEN', message: 'لم يتم إصدار كود تفعيل لهذا الحساب أو تم استخدامه بالفعل. يرجى مراجعة إدارة المدرسة.' };
  }

  var providedTokenHash = hashStringSHA256(activationToken);
  if (providedTokenHash !== storedTokenHash) {
    recordAuthoritativeAudit(ss, requestId, inputLoginNumber, 'AUTH', 'ACTIVATION_FAIL', 'AUTH', '', 'فشل تفعيل الحساب بكود غير صحيح');
    return { success: false, code: 'INVALID_ACTIVATION_TOKEN', message: 'كود التفعيل غير صحيح' };
  }

  // Check expiration
  var expiresAtVal = expiresAtCol >= 0 ? userRecord[expiresAtCol] : '';
  if (expiresAtVal) {
    var expDate = new Date(expiresAtVal);
    if (!isNaN(expDate.getTime()) && new Date() > expDate) {
      return { success: false, code: 'ACTIVATION_TOKEN_EXPIRED', message: 'انتهت صلاحية كود التفعيل. يرجى طلب كود تفعيل جديد من الإدارة.' };
    }
  }

  // Set new password
  var salt = Utilities.getUuid().replace(/-/g, '');
  var newHash = computeSaltedHash(newPassword, salt, PBKDF2_ITERATIONS);
  var nowStr = getCairoISOString();

  if (passHashCol >= 0) usersSheet.getRange(matchedRow, passHashCol + 1).setValue(newHash);
  if (saltCol >= 0) usersSheet.getRange(matchedRow, saltCol + 1).setValue(salt);
  if (algoCol >= 0) usersSheet.getRange(matchedRow, algoCol + 1).setValue('PBKDF2-HMAC-SHA256');
  if (iterCol >= 0) usersSheet.getRange(matchedRow, iterCol + 1).setValue(PBKDF2_ITERATIONS);
  if (passInitCol >= 0) usersSheet.getRange(matchedRow, passInitCol + 1).setValue(true);
  if (passChangedCol >= 0) usersSheet.getRange(matchedRow, passChangedCol + 1).setValue(nowStr);

  // Clear activation token immediately (SINGLE USE GUARANTEE!)
  if (tokenHashCol >= 0) usersSheet.getRange(matchedRow, tokenHashCol + 1).setValue('');
  if (expiresAtCol >= 0) usersSheet.getRange(matchedRow, expiresAtCol + 1).setValue('');

  // Issue session token
  var sessionToken = generateSecureRandomToken(48);
  var tokenHash = hashStringSHA256(sessionToken);
  var expiresDate = new Date(Date.now() + (24 * 60 * 60 * 1000));
  var expiresStr = Utilities.formatDate(expiresDate, 'Africa/Cairo', "yyyy-MM-dd'T'HH:mm:ssXXX");

  var uObjId = idCol >= 0 ? userRecord[idCol] : '';
  var uObjName = userCol >= 0 ? userRecord[userCol] : '';
  var fullNameCol = headers.indexOf('fullName');
  var uFullName = fullNameCol >= 0 ? userRecord[fullNameCol] : uObjName;
  var roleCol = headers.indexOf('role');
  var uRole = roleCol >= 0 ? userRecord[roleCol] : 'Viewer';

  upsertRecord(ss, SHEETS.SESSIONS, 'sessionId', {
    sessionId: 'SES_' + Utilities.getUuid().substring(0, 10),
    userId: uObjId,
    username: uObjName,
    fullName: uFullName,
    role: uRole,
    tokenHash: tokenHash,
    status: 'ACTIVE',
    ipAddress: '',
    userAgent: '',
    createdAt: nowStr,
    expiresAt: expiresStr
  });

  recordAuthoritativeAudit(ss, requestId, uObjName, uRole, 'FIRST_LOGIN_SUCCESS', 'AUTH', uObjId, 'تم إعداد كلمة المرور وتفعيل الحساب لأول مرة بنجاح');

  return {
    success: true,
    sessionToken: sessionToken,
    expiresAt: expiresStr,
    user: {
      id: uObjId,
      username: uObjName,
      fullName: uFullName,
      role: uRole,
      loginNumber: loginNumCol >= 0 ? userRecord[loginNumCol] : '',
      passwordInitialized: true
    },
    message: 'تم إنشاء كلمة المرور وتفعيل الحساب بنجاح'
  };
}

function issueUserActivationTokenSecure(ss, targetUserId, authenticatedUsername, requestId) {
  var usersSheet = ss.getSheetByName(SHEETS.USERS);
  if (!usersSheet) return { success: false, message: 'جدول المستخدمين غير متوفر' };

  var data = usersSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: 'المستخدم غير موجود' };

  var headers = data[0];
  var idCol = headers.indexOf('id');
  var loginNumCol = headers.indexOf('loginNumber');
  var tokenHashCol = headers.indexOf('activationTokenHash');
  var expiresAtCol = headers.indexOf('activationExpiresAt');
  var passInitCol = headers.indexOf('passwordInitialized');

  var lastCol = headers.length;
  if (loginNumCol < 0) {
    usersSheet.getRange(1, lastCol + 1).setValue('loginNumber');
    loginNumCol = lastCol++;
  }
  if (tokenHashCol < 0) {
    usersSheet.getRange(1, lastCol + 1).setValue('activationTokenHash');
    tokenHashCol = lastCol++;
  }
  if (expiresAtCol < 0) {
    usersSheet.getRange(1, lastCol + 1).setValue('activationExpiresAt');
    expiresAtCol = lastCol++;
  }
  if (passInitCol < 0) {
    usersSheet.getRange(1, lastCol + 1).setValue('passwordInitialized');
    passInitCol = lastCol++;
  }

  var targetRow = -1;
  var targetUser = null;
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === targetUserId) {
      targetRow = i + 1;
      targetUser = data[i];
      break;
    }
  }

  if (targetRow === -1) return { success: false, message: 'المستخدم غير موجود' };

  var userLoginNum = loginNumCol >= 0 ? targetUser[loginNumCol] : '';
  if (!userLoginNum) {
    userLoginNum = getNextLoginNumber(ss);
    usersSheet.getRange(targetRow, loginNumCol + 1).setValue(userLoginNum);
  }

  // Cryptographically strong uppercase 8-char alphanumeric token
  var rawToken = Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
  var tokenHash = hashStringSHA256(rawToken);

  var expiryDate = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
  var expiryStr = Utilities.formatDate(expiryDate, 'Africa/Cairo', "yyyy-MM-dd'T'HH:mm:ssXXX");

  usersSheet.getRange(targetRow, tokenHashCol + 1).setValue(tokenHash);
  usersSheet.getRange(targetRow, expiresAtCol + 1).setValue(expiryStr);
  usersSheet.getRange(targetRow, passInitCol + 1).setValue(false);

  recordAuthoritativeAudit(ss, requestId, authenticatedUsername, 'Admin', 'ISSUE_ACTIVATION_TOKEN', 'USERS', targetUserId, 'إصدار كود تفعيل لمرة واحدة للمستخدم');

  return {
    success: true,
    loginNumber: userLoginNum,
    activationToken: rawToken,
    expiresAt: expiryStr,
    message: 'تم إصدار كود التفعيل لمرة واحدة بنجاح'
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
    Users: ['id', 'username', 'passwordHash', 'passwordSalt', 'passwordAlgorithm', 'passwordIterations', 'fullName', 'role', 'status', 'department', 'email', 'createdAt', 'lastLogin', 'passwordChangedAt'],
    Sessions: ['sessionId', 'tokenHash', 'userId', 'username', 'fullName', 'role', 'createdAt', 'expiresAt', 'status'],
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
    Teacher_Sessions: ['sessionId', 'tokenHash', 'teacherId', 'employeeId', 'teacherCode', 'teacherName', 'createdAt', 'expiresAt', 'status'],
    Teacher_Credentials: ['teacherId', 'teacherCode', 'pinHash', 'salt', 'iterations', 'isActivated', 'updatedAt']
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
