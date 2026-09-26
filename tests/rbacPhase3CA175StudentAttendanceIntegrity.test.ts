import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PHASE 3C-A17.5 — Student attendance integrity freeze', () => {
  const gas = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');
  const storage = fs.readFileSync(path.resolve(process.cwd(), 'src/services/storageService.ts'), 'utf8');
  const view = fs.readFileSync(path.resolve(process.cwd(), 'src/components/students/StudentAttendanceView.tsx'), 'utf8');

  it('pre-validates the complete student batch before any writes', () => {
    const start = gas.indexOf('function saveDailyStudentAttendanceBatch');
    const end = gas.indexOf('function saveDailyStaffAttendanceBatch', start);
    const section = gas.slice(start, end);
    const firstUpsert = section.indexOf('upsertRecord(ss, SHEETS.STUDENT_ATTENDANCE');

    expect(section).toContain('// Pre-validate the complete batch before any persistence.');
    expect(section.indexOf('ATTENDANCE_STUDENT_NOT_FOUND')).toBeGreaterThan(-1);
    expect(section.indexOf('ATTENDANCE_STUDENT_INACTIVE')).toBeGreaterThan(-1);
    expect(section.indexOf('DUPLICATE_STUDENT_IN_BATCH')).toBeGreaterThan(-1);
    expect(section.indexOf('STUDENT_ATTENDANCE_DATE_MISMATCH')).toBeGreaterThan(-1);
    expect(section.indexOf('STUDENT_OUTSIDE_GRADE_SCOPE')).toBeGreaterThan(-1);
    expect(section.indexOf('STUDENT_OUTSIDE_CLASSROOM_SCOPE')).toBeGreaterThan(-1);
    expect(section.indexOf('INVALID_STUDENT_ATTENDANCE_STATUS')).toBeGreaterThan(-1);
    expect(section.indexOf('// Pre-validate the complete batch')).toBeLessThan(firstUpsert);
  });

  it('derives student identity metadata and record id from server data', () => {
    const start = gas.indexOf('function saveDailyStudentAttendanceBatch');
    const end = gas.indexOf('function saveDailyStaffAttendanceBatch', start);
    const section = gas.slice(start, end);

    expect(section).toContain('getSheetData(ss, SHEETS.STUDENTS)');
    expect(section).toContain("studentName: String(studentRecord.name || '').trim()");
    expect(section).toContain("studentCode: String(studentRecord.studentCode");
    expect(section).toContain("grade: canonicalGrade");
    expect(section).toContain("classroom: canonicalClassroom");
    expect(section).toContain("id: (prev && prev.id) || ('STATT_'");
    expect(section).not.toContain('studentName: inputRecord.studentName');
    expect(section).not.toContain('grade: inputRecord.grade');
    expect(section).not.toContain('classroom: inputRecord.classroom');
    expect(section).not.toContain('id: inputRecord.id');
  });

  it('normalizes status, late minutes, day name and recorder server-side', () => {
    const start = gas.indexOf('function saveDailyStudentAttendanceBatch');
    const end = gas.indexOf('function saveDailyStaffAttendanceBatch', start);
    const section = gas.slice(start, end);

    expect(section).toContain("'Present': 'حاضر'");
    expect(section).toContain("'Late': 'متأخر'");
    expect(section).toContain("'Absent': 'غائب'");
    expect(section).toContain("'Excused': 'مأذون'");
    expect(section).toContain("if (canonicalStatus !== 'متأخر') lateMinutes = 0");
    expect(section).toContain('dayName: canonicalDayName');
    expect(section).toContain("recordedBy: authUsername || 'System'");
  });

  it('returns canonical student records from backend dispatch', () => {
    expect(gas).toContain('records: savedRecords');
    expect(gas).toContain('output.records = stdBatchRes.records || []');
  });

  it('client never treats backend failure as success and never caches client student metadata', () => {
    const start = storage.indexOf('public async saveDailyStudentAttendanceBatchToBackend');
    const end = storage.indexOf('public async saveDailyStaffAttendanceBatchToBackend', start);
    const section = storage.slice(start, end);

    expect(section).not.toContain('backendRes.success || true');
    expect(section).not.toContain('saveStudentSchoolAttendanceBatch(records)');
    expect(section).toContain('const requestRecords = records.map');
    expect(section).toContain('Array.isArray(backendRes.records)');
    expect(section).toContain('canonicalRecords.forEach');
    expect(section).toContain('cacheUpdated: false');
    expect(section).toContain('cacheUpdated: true');

    expect(section).not.toContain('studentName: rec.studentName');
    expect(section).not.toContain('grade: rec.grade');
    expect(section).not.toContain('classroom: rec.classroom');
    expect(section).not.toContain('id: rec.id');
    expect(section).not.toContain('recordedBy: rec.recordedBy');
  });

  it('StudentAttendanceView checks backend result before showing success', () => {
    const callIndex = view.indexOf('saveDailyStudentAttendanceBatchToBackend');
    const errorCheckIndex = view.indexOf('if (!res.success)', callIndex);
    const successIndex = view.indexOf('setSaveSuccess(true)', callIndex);

    expect(callIndex).toBeGreaterThan(-1);
    expect(errorCheckIndex).toBeGreaterThan(callIndex);
    expect(successIndex).toBeGreaterThan(errorCheckIndex);
    expect(view).toContain('if (res.cacheUpdated)');
  });
});
