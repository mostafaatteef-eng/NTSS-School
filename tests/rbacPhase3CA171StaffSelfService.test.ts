import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PHASE 3C-A17.1 — Authoritative staff self-service freeze', () => {
  const gas = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');
  const storage = fs.readFileSync(path.resolve(process.cwd(), 'src/services/storageService.ts'), 'utf8');
  const view = fs.readFileSync(path.resolve(process.cwd(), 'src/components/leaves/MyRequestsView.tsx'), 'utf8');

  it('canonical auth maps staff self-service actions to own permissions', () => {
    expect(gas).toContain("getMyRequests: 'leaves.own.view'");
    expect(gas).toContain("createMyLeaveRequest: 'leaves.own.create'");
    expect(gas).toContain("createMyPermissionRequest: 'leaves.own.create'");
    expect(gas).toContain('getMyRequests: true');
    expect(gas).toContain('createMyLeaveRequest: true');
    expect(gas).toContain('createMyPermissionRequest: true');
  });

  it('staff self-service requires an authoritative employee link and filters reads to that employee', () => {
    const start = gas.indexOf('function getStaffSelfProfile');
    const end = gas.indexOf('function createStaffSelfLeaveRequest', start);
    const section = gas.slice(start, end);

    expect(section).toContain("var employeeId = String((session && session.employeeId) || '').trim()");
    expect(section).toContain("code: 'EMPLOYEE_CONTEXT_REQUIRED'");
    expect(section).toContain('profile.employeeId.toLowerCase()');
    expect(section).toContain('SHEETS.LEAVES');
    expect(section).toContain('SHEETS.PERMISSIONS');
  });

  it('server owns identity, school, ids, pending status, leave days and permission duration', () => {
    const leaveStart = gas.indexOf('function createStaffSelfLeaveRequest');
    const permissionStart = gas.indexOf('function createStaffSelfPermissionRequest', leaveStart);
    const teacherStart = gas.indexOf('Normalize leave/permission status for teacher self-service', permissionStart);

    const leave = gas.slice(leaveStart, permissionStart);
    const permission = gas.slice(permissionStart, teacherStart);

    expect(leave).toContain("id: 'LEV_' + Utilities.getUuid()");
    expect(leave).toContain('schoolId: String(effectiveSchoolId');
    expect(leave).toContain('employeeId: profile.employeeId');
    expect(leave).toContain("status: 'معلقة'");
    expect(leave).toContain('daysCount = Math.floor');

    expect(permission).toContain("id: 'PERM_' + Utilities.getUuid()");
    expect(permission).toContain('schoolId: String(effectiveSchoolId');
    expect(permission).toContain('employeeId: profile.employeeId');
    expect(permission).toContain("status: 'معلقة'");
    expect(permission).toContain('durationHours = Math.round');
  });

  it('MyRequestsView no longer uses local leave/permission stores for either mode', () => {
    expect(view).not.toContain('storageService.getLeaves()');
    expect(view).not.toContain('HRPayrollService.getPermissions');
    expect(view).not.toContain('storageService.saveLeave(');
    expect(view).not.toContain('HRPayrollService.savePermission');
    expect(view).not.toContain('storageService.getEmployees()');

    expect(view).toContain('getStaffSelfRequestsAuthoritative');
    expect(view).toContain('createStaffLeaveRequestAuthoritative');
    expect(view).toContain('createStaffPermissionRequestAuthoritative');
    expect(view).toContain('getTeacherSelfRequestsAuthoritative');
  });

  it('staff client sends session authority but not client-selected employee or school authority', () => {
    const start = storage.indexOf('public async getStaffSelfRequestsAuthoritative');
    const end = storage.indexOf('public async getTeacherSelfRequestsAuthoritative', start);
    const section = storage.slice(start, end);

    expect(section).toContain("action: 'getMyRequests'");
    expect(section).toContain("action: 'createMyLeaveRequest'");
    expect(section).toContain("action: 'createMyPermissionRequest'");
    expect(section).toContain('sessionToken: user.sessionToken');
    expect(section).not.toContain('employeeId: user.employeeId');
    expect(section).not.toContain('schoolId: user.schoolId');
  });
});
