import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PHASE 3C-A17.6 — Authoritative student management freeze', () => {
  const gas = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');
  const storage = fs.readFileSync(path.resolve(process.cwd(), 'src/services/storageService.ts'), 'utf8');
  const view = fs.readFileSync(path.resolve(process.cwd(), 'src/components/students/StudentsView.tsx'), 'utf8');
  const importer = fs.readFileSync(path.resolve(process.cwd(), 'src/services/importCenterService.ts'), 'utf8');

  it('maps student management actions to explicit canonical permissions', () => {
    expect(gas).toContain("createManagedStudent: 'students.create'");
    expect(gas).toContain("updateManagedStudent: 'students.edit'");
    expect(gas).toContain("setManagedStudentStatus: 'students.edit'");
    expect(gas).toContain("transferManagedStudent: 'students.edit'");
    expect(gas).toContain("importManagedStudents: 'students.import'");
  });

  it('server owns new student id, school, status and timestamps', () => {
    const start = gas.indexOf('function createManagedStudentRecord');
    const end = gas.indexOf('function updateManagedStudentRecord', start);
    const section = gas.slice(start, end);

    expect(section).toContain("normalized.student.id = 'STU-' + Utilities.getUuid()");
    expect(section).toContain('normalized.student.studentId = normalized.student.id');
    expect(section).toContain('normalized.student.createdAt = now');
    expect(section).toContain('normalized.student.updatedAt = now');
    expect(section).toContain('upsertManagedStudentEnrollment');
    expect(section).not.toContain('payload.id');
  });

  it('student payload normalization pins school and does not accept lifecycle status as generic edit data', () => {
    const start = gas.indexOf('function normalizeManagedStudentPayload');
    const end = gas.indexOf('function upsertManagedStudentEnrollment', start);
    const section = gas.slice(start, end);

    expect(section).toContain("schoolId: String(effectiveSchoolId");
    expect(section).toContain("var status = String(existing.status || 'نشط').trim()");
    expect(section).toContain("if (!existing.id) status = 'نشط'");
    expect(section).not.toContain('status: payload.status');
    expect(section).not.toContain('schoolId: payload.schoolId');
    expect(section).not.toContain('createdAt: payload.createdAt');
  });

  it('enforces school-wide studentCode and nationalId uniqueness', () => {
    const start = gas.indexOf('function validateManagedStudentUniqueness');
    const end = gas.indexOf('function normalizeManagedStudentPayload', start);
    const section = gas.slice(start, end);

    expect(section).toContain('DUPLICATE_STUDENT_CODE');
    expect(section).toContain('DUPLICATE_STUDENT_NATIONAL_ID');
    expect(section).toContain('if (ownId && currentId === ownId) continue');
  });

  it('update preserves immutable id, lifecycle state and createdAt', () => {
    const start = gas.indexOf('function updateManagedStudentRecord');
    const end = gas.indexOf('function setManagedStudentStatus', start);
    const section = gas.slice(start, end);

    expect(section).toContain('normalized.student.id = String(existing.id || studentId).trim()');
    expect(section).toContain('normalized.student.studentId = normalized.student.id');
    expect(section).toContain("normalized.student.status = String(existing.status || 'نشط').trim()");
    expect(section).toContain('normalized.student.createdAt = String(existing.createdAt');
    expect(section).toContain('normalized.student.updatedAt = getCairoISOString()');
  });

  it('status mutation is isolated to a dedicated action with a closed status whitelist', () => {
    const start = gas.indexOf('function setManagedStudentStatus');
    const end = gas.indexOf('function transferManagedStudentRecord', start);
    const section = gas.slice(start, end);

    expect(section).toContain("var allowedStatuses = ['نشط', 'غير نشط', 'موقوف', 'منقول', 'متخرج', 'Active', 'Inactive']");
    expect(section).toContain('INVALID_STUDENT_STATUS_REQUEST');
    expect(section).toContain('STUDENT_STATUS_CHANGED');
  });

  it('current enrollment is generated from canonical student data in the same backend flow', () => {
    const start = gas.indexOf('function upsertManagedStudentEnrollment');
    const end = gas.indexOf('function createManagedStudentRecord', start);
    const section = gas.slice(start, end);

    expect(section).toContain('studentId: student.id');
    expect(section).toContain('studentCode: student.studentCode');
    expect(section).toContain('studentName: student.name');
    expect(section).toContain('grade: student.grade');
    expect(section).toContain('classroom: student.classroom');
    expect(section).toContain("upsertRecord(ss, SHEETS.STUDENT_ENROLLMENTS, 'id', enrollment)");
  });

  it('transfer is server-owned and persists canonical transfer history', () => {
    expect(gas).toContain("STUDENT_TRANSFERS: 'Student_Transfers'");
    const start = gas.indexOf('function transferManagedStudentRecord');
    const end = gas.indexOf('function importManagedStudents', start);
    const section = gas.slice(start, end);

    expect(section).toContain('var fromGrade = String(student.grade');
    expect(section).toContain('student.grade = toGrade');
    expect(section).toContain('student.classroom = toClassroom');
    expect(section).toContain("id: 'TRF-' + Utilities.getUuid()");
    expect(section).toContain('performedBy: String(actorUsername');
    expect(section).toContain("upsertRecord(ss, SHEETS.STUDENT_TRANSFERS, 'id', transfer)");
  });

  it('import routes NEW and UPDATE rows through authoritative student helpers', () => {
    const start = gas.indexOf('function importManagedStudents');
    const end = gas.indexOf('function saveDailyStudentAttendanceBatch', start);
    const section = gas.slice(start, end);

    expect(section).toContain('createManagedStudentRecord(');
    expect(section).toContain('updateManagedStudentRecord(');
    expect(section).toContain('STUDENTS_IMPORTED');
    expect(section).not.toContain("upsertRecord(ss, SHEETS.STUDENTS, 'id', op");
  });

  it('StudentsView has no direct student, enrollment or transfer local mutations', () => {
    expect(view).toContain('getStudentManagementDataAuthoritative');
    expect(view).toContain('createManagedStudentAuthoritative');
    expect(view).toContain('updateManagedStudentAuthoritative');
    expect(view).toContain('setManagedStudentStatusAuthoritative');
    expect(view).toContain('transferManagedStudentAuthoritative');

    expect(view).not.toContain('storageService.saveStudent(');
    expect(view).not.toContain('storageService.saveStudentEnrollment(');
    expect(view).not.toContain('storageService.saveStudentTransfer(');
  });

  it('Import Center never writes student rows locally', () => {
    expect(importer).toContain('importManagedStudentsAuthoritative');
    expect(importer).toContain('getStudentManagementDataAuthoritative');
    expect(importer).not.toContain('storageService.saveStudent(');
  });

  it('student management client strips backend-owned fields from generic create/update input', () => {
    const start = storage.indexOf('private sanitizeStudentManagementInput');
    const end = storage.indexOf('private cacheCanonicalStudentEnrollment', start);
    const section = storage.slice(start, end);

    expect(section).toContain('studentCode:');
    expect(section).toContain('name:');
    expect(section).toContain('grade:');
    expect(section).toContain('classroom:');
    expect(section).not.toContain('schoolId:');
    expect(section).not.toContain('createdAt:');
    expect(section).not.toContain('updatedAt:');
    expect(section).not.toContain('id:');
    expect(section).not.toContain('status:');
  });

  it('authoritative student reads replace UX cache only after backend success', () => {
    const start = storage.indexOf('public async getStudentManagementDataAuthoritative');
    const end = storage.indexOf('public async createManagedStudentAuthoritative', start);
    const section = storage.slice(start, end);

    expect(section).toContain("postStudentManagementAction('getStudents')");
    expect(section).toContain("localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students))");
    expect(section.indexOf('if (!result.success) return result')).toBeLessThan(
      section.indexOf('localStorage.setItem')
    );
  });
});
