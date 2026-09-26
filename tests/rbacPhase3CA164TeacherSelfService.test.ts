import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PHASE 3C-A16.4 — Teacher self-service request freeze', () => {
  const gas = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');
  const view = fs.readFileSync(path.resolve(process.cwd(), 'src/components/leaves/MyRequestsView.tsx'), 'utf8');
  const portal = fs.readFileSync(path.resolve(process.cwd(), 'src/components/timetable/TeacherPortalView.tsx'), 'utf8');

  it('teacher session gate owns self-service read and create actions', () => {
    const gateStart = gas.indexOf('// 3. TEACHER SESSION GATE');
    const gateEnd = gas.indexOf('// 4. STAFF SESSION AUTHENTICATION GATE', gateStart);
    const gate = gas.slice(gateStart, gateEnd);

    expect(gate).toContain("action === 'getTeacherSelfRequests'");
    expect(gate).toContain("action === 'createTeacherLeaveRequest'");
    expect(gate).toContain("action === 'createTeacherPermissionRequest'");
    expect(gate).toContain('validateTeacherSessionToken');
    expect(gate).toContain('teacherSchoolSs');
  });

  it('backend creates leave identity, id, school, duration and pending state server-side', () => {
    const leaveStart = gas.indexOf('function createTeacherLeaveRequest');
    const permissionStart = gas.indexOf('function createTeacherPermissionRequest');
    const portalStart = gas.indexOf('function getTeacherPortalDataBundle', permissionStart);

    const leave = gas.slice(leaveStart, permissionStart);
    const permission = gas.slice(permissionStart, portalStart);

    expect(leave).toContain("id: 'LEV_' + Utilities.getUuid()");
    expect(leave).toContain("schoolId: String(tSession.schoolId");
    expect(leave).toContain('employeeId: profile.employeeId');
    expect(leave).toContain("status: 'معلقة'");
    expect(leave).toContain('daysCount = Math.floor');

    expect(permission).toContain("id: 'PERM_' + Utilities.getUuid()");
    expect(permission).toContain("schoolId: String(tSession.schoolId");
    expect(permission).toContain('employeeId: profile.employeeId');
    expect(permission).toContain("status: 'معلقة'");
    expect(permission).toContain('durationHours = Math.round');
  });

  it('teacher self-request read filters both collections to the session employee', () => {
    const start = gas.indexOf('function getTeacherSelfRequestsBundle');
    const end = gas.indexOf('function parseTeacherSelfDate', start);
    const section = gas.slice(start, end);

    expect(section).toContain('profile.employeeId.toLowerCase()');
    expect(section).toContain('SHEETS.LEAVES');
    expect(section).toContain('SHEETS.PERMISSIONS');
    expect(section.match(/record\.employeeId/g)?.length || 0).toBeGreaterThanOrEqual(2);
  });

  it('teacher-mode UI uses authoritative request APIs while staff mode remains explicitly separate', () => {
    expect(view).toContain("authMode?: 'staff' | 'teacher'");
    expect(view).toContain("if (authMode === 'teacher')");
    expect(view).toContain('getTeacherSelfRequestsAuthoritative');
    expect(view).toContain('createTeacherLeaveRequestAuthoritative');
    expect(view).toContain('createTeacherPermissionRequestAuthoritative');
    expect(portal).toContain('authMode="teacher"');
  });
});
