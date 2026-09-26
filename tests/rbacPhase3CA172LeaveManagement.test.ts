import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PHASE 3C-A17.2 — Authoritative leave management freeze', () => {
  const gas = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');
  const storage = fs.readFileSync(path.resolve(process.cwd(), 'src/services/storageService.ts'), 'utf8');
  const view = fs.readFileSync(path.resolve(process.cwd(), 'src/components/leaves/LeavesView.tsx'), 'utf8');

  it('maps management actions to distinct create/view/approve/reject permissions', () => {
    expect(gas).toContain("getLeaveManagementData: 'leaves.manage.view'");
    expect(gas).toContain("createManagedLeave: 'leaves.create'");
    expect(gas).toContain("createManagedPermission: 'leaves.create'");
    expect(gas).toContain("approveManagedLeave: 'leaves.manage.approve'");
    expect(gas).toContain("rejectManagedLeave: 'leaves.manage.reject'");
    expect(gas).toContain("approveManagedPermission: 'leaves.manage.approve'");
    expect(gas).toContain("rejectManagedPermission: 'leaves.manage.reject'");
  });

  it('manager role matrices include explicit manage view/approve/reject capabilities', () => {
    const baseStart = gas.indexOf('var BASE_ADMIN_PERMISSIONS');
    const baseEnd = gas.indexOf('var CANONICAL_ROLE_PERMISSIONS', baseStart);
    const base = gas.slice(baseStart, baseEnd);
    expect(base).toContain("'leaves.manage.view': true");
    expect(base).toContain("'leaves.manage.approve': true");
    expect(base).toContain("'leaves.manage.reject': true");

    const directorStart = gas.indexOf('SchoolDirector: {');
    const directorEnd = gas.indexOf('StudentAffairs:', directorStart);
    const director = gas.slice(directorStart, directorEnd);
    expect(director).toContain("'leaves.manage.approve': true");
    expect(director).toContain("'leaves.manage.reject': true");

    const affairsStart = gas.indexOf('TeacherAffairs: {');
    const affairsEnd = gas.indexOf('SocialSpecialist:', affairsStart);
    const affairs = gas.slice(affairsStart, affairsEnd);
    expect(affairs).toContain("'leaves.manage.approve': true");
    expect(affairs).toContain("'leaves.manage.reject': true");
  });

  it('managed creates are server-owned pending records with server calculations and employee lookup', () => {
    const leaveStart = gas.indexOf('function createManagedLeaveRequest');
    const permStart = gas.indexOf('function createManagedPermissionRequest', leaveStart);
    const statusStart = gas.indexOf('function findRecordById', permStart);
    const leave = gas.slice(leaveStart, permStart);
    const permission = gas.slice(permStart, statusStart);

    expect(leave).toContain('getManagedEmployeeProfile(ss, payload.employeeId)');
    expect(leave).toContain("id: 'LEV_' + Utilities.getUuid()");
    expect(leave).toContain("status: 'معلقة'");
    expect(leave).toContain('daysCount: Math.floor');

    expect(permission).toContain('getManagedEmployeeProfile(ss, payload.employeeId)');
    expect(permission).toContain("id: 'PERM_' + Utilities.getUuid()");
    expect(permission).toContain("status: 'معلقة'");
    expect(permission).toContain('durationHours: Math.round');
  });

  it('approval and rejection use server actor identity and explicit status actions', () => {
    const leaveStart = gas.indexOf('function setManagedLeaveStatus');
    const permStart = gas.indexOf('function setManagedPermissionStatus', leaveStart);
    const staffStart = gas.indexOf('Staff self-service profile', permStart);
    const leave = gas.slice(leaveStart, permStart);
    const permission = gas.slice(permStart, staffStart);

    expect(leave).toContain("leave.status = status");
    expect(leave).toContain('session.fullName || session.username');
    expect(leave).toContain("LEAVE_APPROVED");
    expect(leave).toContain("LEAVE_REJECTED");

    expect(permission).toContain("permission.status = status");
    expect(permission).toContain('session.fullName || session.username');
    expect(permission).toContain("PERMISSION_APPROVED");
    expect(permission).toContain("PERMISSION_REJECTED");
  });

  it('LeavesView is server-first and has no legacy local management authority', () => {
    expect(view).toContain('getLeaveManagementDataAuthoritative');
    expect(view).toContain('createManagedLeaveAuthoritative');
    expect(view).toContain('createManagedPermissionAuthoritative');
    expect(view).toContain('setManagedLeaveStatusAuthoritative');
    expect(view).toContain('setManagedPermissionStatusAuthoritative');
    expect(view).toContain('deleteManagedLeaveAuthoritative');
    expect(view).toContain('deleteManagedPermissionAuthoritative');
    expect(view).toContain("hasPermission(currentUser, 'leaves.manage.approve')");
    expect(view).toContain("hasPermission(currentUser, 'leaves.manage.reject')");
    expect(view).not.toContain('HRPayrollService.');
    expect(view).not.toContain('storageService.saveLeave(');
    expect(view).not.toContain('storageService.deleteLeave(');
  });

  it('management client does not send status or approver in create payloads', () => {
    const start = storage.indexOf('private async postLeaveManagementAction');
    const end = storage.indexOf('public async getStaffSelfRequestsAuthoritative', start);
    const section = storage.slice(start, end);

    expect(section).toContain("action: 'createManagedLeave'");
    expect(section).toContain("action: 'createManagedPermission'");
    expect(section).toContain("action: 'approveManagedLeave'");
    expect(section).toContain("action: 'rejectManagedLeave'");
    expect(section).not.toContain('approvedBy:');
    expect(section).not.toContain('status: input.status');
  });
});
