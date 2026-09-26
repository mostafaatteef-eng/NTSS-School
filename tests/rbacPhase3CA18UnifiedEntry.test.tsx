// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LoginView } from '../src/components/auth/LoginView';
import { PublicStudentScheduleView } from '../src/components/timetable/PublicStudentScheduleView';
import { storageService } from '../src/services/storageService';
import { User } from '../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('PHASE 3C-A18 — Unified Multi-Portal Entry & School-Aware Public Schedule', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('entry page exposes four clear portals before showing administrative credentials', async () => {
    await act(async () => {
      root.render(<LoginView onLoginSuccess={() => {}} onOpenTeacherPortal={() => {}} onOpenPublicSchedule={() => {}} />);
    });

    expect(container.querySelector('[data-testid="entry-system"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="entry-staff"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="entry-teacher"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="entry-student"]')).not.toBeNull();
    expect(container.querySelector('#input-email')).toBeNull();
    expect(container.querySelector('#input-password')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
  });

  it('system portal shows email/password without asking for school or role', async () => {
    await act(async () => {
      root.render(<LoginView onLoginSuccess={() => {}} onOpenTeacherPortal={() => {}} onOpenPublicSchedule={() => {}} />);
    });

    await act(async () => {
      (container.querySelector('[data-testid="entry-system"]') as HTMLButtonElement).click();
    });

    expect(container.querySelector('#input-email')).not.toBeNull();
    expect(container.querySelector('#input-password')).not.toBeNull();
    expect(container.querySelector('select')).toBeNull();
    expect(container.textContent || '').toContain('دخول مدير النظام');
    expect(container.textContent || '').not.toContain('اختر دورك');
  });

  it('teacher and student cards open their dedicated portals directly', async () => {
    const teacher = vi.fn();
    const student = vi.fn();

    await act(async () => {
      root.render(<LoginView onLoginSuccess={() => {}} onOpenTeacherPortal={teacher} onOpenPublicSchedule={student} />);
    });

    await act(async () => {
      (container.querySelector('[data-testid="entry-teacher"]') as HTMLButtonElement).click();
      (container.querySelector('[data-testid="entry-student"]') as HTMLButtonElement).click();
    });

    expect(teacher).toHaveBeenCalledTimes(1);
    expect(student).toHaveBeenCalledTimes(1);
  });

  it('system portal rejects a school-bound staff account and revokes the created session', async () => {
    const schoolAdmin: User = {
      id: 'SA-1',
      fullName: 'School Admin',
      role: 'SchoolAdmin',
      accessScope: 'SCHOOL',
      schoolId: 'SCH-BADR',
      allowedSchoolIds: ['SCH-BADR'],
      sessionToken: 'school-session',
    };
    vi.spyOn(storageService, 'login').mockResolvedValue({ success: true, user: schoolAdmin });
    const logout = vi.spyOn(storageService, 'logoutStaffSession').mockResolvedValue();
    const success = vi.fn();

    await act(async () => {
      root.render(<LoginView onLoginSuccess={success} />);
      (container.querySelector('[data-testid="entry-system"]') as HTMLButtonElement).click();
    });

    const email = container.querySelector('#input-email') as HTMLInputElement;
    const password = container.querySelector('#input-password') as HTMLInputElement;
    await act(async () => {
      email.value = 'school.admin@example.edu';
      email.dispatchEvent(new Event('input', { bubbles: true }));
      password.value = 'password-value';
      password.dispatchEvent(new Event('input', { bubbles: true }));
      (container.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(success).not.toHaveBeenCalled();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(container.textContent || '').toContain('ليس حساب مدير نظام مركزي');
  });

  it('staff portal rejects SystemAdmin and keeps system administration on its own entry path', async () => {
    const systemAdmin: User = {
      id: 'SYS-1',
      fullName: 'System Admin',
      role: 'SystemAdmin',
      accessScope: 'GLOBAL',
      allowedSchoolIds: ['SCH-BADR', 'SCH-DAMIETTA'],
      activeSchoolId: '',
      sessionToken: 'system-session',
    };
    vi.spyOn(storageService, 'login').mockResolvedValue({ success: true, user: systemAdmin });
    const logout = vi.spyOn(storageService, 'logoutStaffSession').mockResolvedValue();

    await act(async () => {
      root.render(<LoginView onLoginSuccess={() => {}} />);
      (container.querySelector('[data-testid="entry-staff"]') as HTMLButtonElement).click();
    });

    const email = container.querySelector('#input-email') as HTMLInputElement;
    const password = container.querySelector('#input-password') as HTMLInputElement;
    await act(async () => {
      email.value = 'system.admin@example.edu';
      email.dispatchEvent(new Event('input', { bubbles: true }));
      password.value = 'password-value';
      password.dispatchEvent(new Event('input', { bubbles: true }));
      (container.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(logout).toHaveBeenCalledTimes(1);
    expect(container.textContent || '').toContain('بوابة إدارة النظام المركزي');
  });

  it('public student schedule starts with school selection and loads grade/class options from that school', async () => {
    vi.spyOn(storageService, 'getPublicSchools').mockResolvedValue({
      success: true,
      schools: [
        { schoolId: 'SCH-BADR', schoolCode: 'BADR', schoolName: 'مدرسة إبدأ - بدر' },
        { schoolId: 'SCH-DAMIETTA', schoolCode: 'DAMIETTA', schoolName: 'مدرسة إبدأ - دمياط' },
      ],
    });
    const options = vi.spyOn(storageService, 'getPublicScheduleOptions').mockResolvedValue({
      success: true,
      school: { schoolId: 'SCH-BADR', schoolCode: 'BADR', schoolName: 'مدرسة إبدأ - بدر' },
      grades: [{ id: 'G1', name: 'الصف الأول الثانوي' }],
      classrooms: [{ id: 'C1', name: '1/1', gradeId: 'G1', gradeName: 'الصف الأول الثانوي' }],
    });

    await act(async () => {
      root.render(<PublicStudentScheduleView />);
      await Promise.resolve();
    });

    const schoolSelect = container.querySelector('#select-public-school') as HTMLSelectElement;
    expect(schoolSelect).not.toBeNull();

    await act(async () => {
      schoolSelect.value = 'SCH-BADR';
      schoolSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(options).toHaveBeenCalledWith('SCH-BADR');
    expect(container.querySelector('#select-public-grade')).not.toBeNull();
    expect(container.querySelector('#select-public-classroom')).not.toBeNull();
  });

  it('public schedule backend exposes safe school metadata and blocks inactive school schedules', () => {
    const gas = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');

    const schoolsStart = gas.indexOf('function getPublicSchoolsSafe');
    const optionsStart = gas.indexOf('function getPublicScheduleOptionsSafe', schoolsStart);
    const schoolsSection = gas.slice(schoolsStart, optionsStart);
    expect(schoolsSection).toContain("String(s.status || '').trim() === 'Active'");
    expect(schoolsSection).toContain('schoolId:');
    expect(schoolsSection).toContain('schoolCode:');
    expect(schoolsSection).toContain('schoolName:');
    expect(schoolsSection).not.toContain('spreadsheetId:');

    const publicActionStart = gas.indexOf("if (action === 'getPublicClassSchedule')");
    const publicActionEnd = gas.indexOf('// First Login Password Setup', publicActionStart);
    const publicAction = gas.slice(publicActionStart, publicActionEnd);
    expect(publicAction).toContain("String(publicScheduleCtx.status || '').trim() !== 'Active'");
  });

  it('SystemAdmin credential rotation is server-only and deletes plaintext password property after success', () => {
    const gas = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');
    const fnStart = gas.indexOf('function configureSystemAdminFromScriptProperties');
    const verifyStart = gas.indexOf('function verifyInitialSystemProvisioning', fnStart);
    const fn = gas.slice(fnStart, verifyStart);

    expect(fn).toContain("props.getProperty('SYSTEM_ADMIN_EMAIL')");
    expect(fn).toContain("props.getProperty('SYSTEM_ADMIN_PASSWORD')");
    expect(fn).toContain("configuredUser.role = 'SystemAdmin'");
    expect(fn).toContain("configuredUser.schoolId = ''");
    expect(fn).toContain("configuredUser.employeeId = ''");
    expect(fn).toContain("props.deleteProperty('SYSTEM_ADMIN_PASSWORD')");
    expect(fn).toContain("accessScope: 'GLOBAL'");

    const doPostStart = gas.indexOf('function doPost');
    const helperStart = gas.indexOf('function configureSystemAdminFromScriptProperties');
    const publicDispatch = gas.slice(doPostStart, helperStart);
    expect(publicDispatch).not.toContain("action === 'configureSystemAdminFromScriptProperties'");
  });
});
