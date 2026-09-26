import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PHASE 3C-A17.4 — Staff attendance integrity freeze', () => {
  const gas = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');
  const storage = fs.readFileSync(path.resolve(process.cwd(), 'src/services/storageService.ts'), 'utf8');

  it('pre-validates the complete staff batch before any writes', () => {
    const start = gas.indexOf('function saveDailyStaffAttendanceBatch');
    const end = gas.indexOf('function validateUsernamePolicy', start);
    const section = gas.slice(start, end);

    const firstUpsert = section.indexOf('upsertRecord(ss, SHEETS.ATTENDANCE');
    expect(section.indexOf('ATTENDANCE_EMPLOYEE_NOT_FOUND')).toBeGreaterThan(-1);
    expect(section.indexOf('ATTENDANCE_DATE_MISMATCH')).toBeGreaterThan(-1);
    expect(section.indexOf('DUPLICATE_EMPLOYEE_IN_BATCH')).toBeGreaterThan(-1);
    expect(section.indexOf('INVALID_ATTENDANCE_STATUS')).toBeGreaterThan(-1);
    expect(section.indexOf('// Pre-validate the entire batch')).toBeLessThan(firstUpsert);
  });

  it('derives employee identity and batch date from server-owned sources', () => {
    const start = gas.indexOf('function saveDailyStaffAttendanceBatch');
    const end = gas.indexOf('function validateUsernamePolicy', start);
    const section = gas.slice(start, end);

    expect(section).toContain('getSheetData(ss, SHEETS.EMPLOYEES)');
    expect(section).toContain("employeeName: String(emp.name || emp.fullName || '').trim()");
    expect(section).toContain("department: String(emp.department || emp.specialization || emp.jobTitle || '').trim()");
    expect(section).toContain('date: date');
    expect(section).not.toContain('employeeName: rec.employeeName');
    expect(section).not.toContain('department: rec.department');
    expect(section).not.toContain('id: rec.id');
  });

  it('normalizes attendance status and calculates time metrics server-side', () => {
    const start = gas.indexOf('function saveDailyStaffAttendanceBatch');
    const end = gas.indexOf('function validateUsernamePolicy', start);
    const section = gas.slice(start, end);

    expect(section).toContain("'Present': 'حاضر'");
    expect(section).toContain("'Late': 'متأخر'");
    expect(section).toContain("'Absent': 'غائب'");
    expect(section).toContain('workingHours = Math.round');
    expect(section).toContain('lateMinutes = Math.max');
    expect(section).toContain('earlyLeaveMinutes = Math.max');
    expect(section).toContain('overtimeHours = Math.round');
  });

  it('returns canonical records from GAS dispatch', () => {
    expect(gas).toContain('records: savedRecords');
    expect(gas).toContain('output.records = staffBatchRes.records || []');
  });

  it('client updates attendance cache only from canonical backend records', () => {
    const start = storage.indexOf('public async saveDailyStaffAttendanceBatchToBackend');
    const end = storage.indexOf('// ---------------- Attendance Exceptions', start);
    const section = storage.slice(start, end);

    expect(section).toContain('Array.isArray(backendRes.records)');
    expect(section).toContain('canonicalRecords.forEach');
    expect(section).not.toContain('records.forEach(rec =>');
    expect(section).toContain('cacheUpdated: false');
    expect(section).toContain('cacheUpdated: true');
  });
});
