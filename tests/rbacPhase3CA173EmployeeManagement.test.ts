import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PHASE 3C-A17.3 — Authoritative employee management freeze', () => {
  const gas = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');
  const backendAuth = fs.readFileSync(path.resolve(process.cwd(), 'src/services/backendAuthService.ts'), 'utf8');
  const storage = fs.readFileSync(path.resolve(process.cwd(), 'src/services/storageService.ts'), 'utf8');
  const view = fs.readFileSync(path.resolve(process.cwd(), 'src/components/employees/EmployeesView.tsx'), 'utf8');
  const staffImport = fs.readFileSync(path.resolve(process.cwd(), 'src/components/employees/StaffImportModal.tsx'), 'utf8');
  const importWizard = fs.readFileSync(path.resolve(process.cwd(), 'src/components/import/ImportWizardModal.tsx'), 'utf8');

  it('maps employee create/edit/status/import actions to distinct permissions in both canonical maps', () => {
    for (const source of [gas, backendAuth]) {
      expect(source).toContain("createManagedEmployee: 'employees.create'");
      expect(source).toContain("updateManagedEmployee: 'employees.edit'");
      expect(source).toContain("setManagedEmployeeStatus: 'employees.edit'");
      expect(source).toContain("importManagedEmployees: 'employees.import'");
      expect(source).toContain("deleteEmployee: 'employees.delete'");
      expect(source).toContain("getEmployees: 'employees.view'");
    }
  });

  it('server owns school binding and login-number allocation and strips financial/auth secrets', () => {
    const buildStart = gas.indexOf('function buildManagedEmployeeRecord');
    const createStart = gas.indexOf('function createManagedEmployeeRecord', buildStart);
    const build = gas.slice(buildStart, createStart);

    expect(build).toContain('getNextLoginNumber(ss)');
    expect(build).toContain("schoolId: String(effectiveSchoolId");
    expect(build).toContain('delete record.basicSalary');
    expect(build).toContain('delete record.salary');
    expect(build).toContain('delete record.password');
    expect(build).toContain('delete record.passwordHash');
    expect(build).toContain('delete record.passwordSalt');
  });

  it('create cannot silently become edit and update requires an existing immutable employee id', () => {
    const createStart = gas.indexOf('function createManagedEmployeeRecord');
    const updateStart = gas.indexOf('function updateManagedEmployeeRecord', createStart);
    const statusStart = gas.indexOf('function setManagedEmployeeStatusRecord', updateStart);
    const create = gas.slice(createStart, updateStart);
    const update = gas.slice(updateStart, statusStart);

    expect(create).toContain('EMPLOYEE_ALREADY_EXISTS');
    expect(create).toContain('httpStatus: 409');
    expect(update).toContain('RESOURCE_NOT_FOUND');
    expect(update).toContain('buildManagedEmployeeRecord(ss, payload, effectiveSchoolId, existing)');
  });

  it('server validates unique national id and teacher code', () => {
    const start = gas.indexOf('function validateManagedEmployeeUniqueness');
    const end = gas.indexOf('function buildManagedEmployeeRecord', start);
    const section = gas.slice(start, end);

    expect(section).toContain('EMPLOYEE_NATIONAL_ID_CONFLICT');
    expect(section).toContain('TEACHER_CODE_CONFLICT');
  });

  it('authoritative employee read also strips historical password and salary fields', () => {
    const start = gas.indexOf("if (action === 'getEmployees')");
    const end = gas.indexOf("if (action === 'createManagedEmployee')", start);
    const section = gas.slice(start, end);

    expect(section).toContain('delete cleanEmp.basicSalary');
    expect(section).toContain('delete cleanEmp.salary');
    expect(section).toContain('delete cleanEmp.password');
    expect(section).toContain('delete cleanEmp.passwordHash');
    expect(section).toContain('delete cleanEmp.passwordSalt');
  });

  it('EmployeesView is server-first and permission-aware with no legacy local mutations', () => {
    expect(view).toContain('getEmployeeManagementDataAuthoritative');
    expect(view).toContain('createManagedEmployeeAuthoritative');
    expect(view).toContain('updateManagedEmployeeAuthoritative');
    expect(view).toContain('setManagedEmployeeStatusAuthoritative');
    expect(view).toContain('deleteManagedEmployeeAuthoritative');
    expect(view).toContain("hasPermission(currentUser, 'employees.create')");
    expect(view).toContain("hasPermission(currentUser, 'employees.edit')");
    expect(view).toContain("hasPermission(currentUser, 'employees.delete')");
    expect(view).toContain("hasPermission(currentUser, 'employees.import')");
    expect(view).not.toContain('storageService.saveEmployee(');
    expect(view).not.toContain('storageService.deleteEmployee(');
  });

  it('both employee import surfaces use authoritative import and never legacy bulk local mutation', () => {
    expect(staffImport).toContain('importManagedEmployeesAuthoritative');
    expect(importWizard).toContain('importManagedEmployeesAuthoritative');
    expect(staffImport).not.toContain('storageService.bulkSaveEmployees(');
    expect(importWizard).not.toContain('storageService.bulkSaveEmployees(employeesToImport)');
  });

  it('client sanitizer cannot send login number, school id, salary or password authority', () => {
    const start = storage.indexOf('private sanitizeEmployeeManagementInput');
    const end = storage.indexOf('private async postEmployeeManagementAction', start);
    const section = storage.slice(start, end);

    expect(section).not.toContain('loginNumber:');
    expect(section).not.toContain('schoolId:');
    expect(section).not.toContain('basicSalary:');
    expect(section).not.toContain('salary:');
    expect(section).not.toContain('password:');
    expect(section).not.toContain('passwordHash:');
  });
});
