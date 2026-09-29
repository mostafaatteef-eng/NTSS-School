import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Teacher accounts rendering hardening', () => {
  it('does not call locale formatting directly on nullable summary values', () => {
    const source = fs.readFileSync('src/components/users/TeacherAccountsManager.tsx', 'utf8');
    expect(source).toContain("Number.isFinite(Number(value)) ? Number(value).toLocaleString('ar-EG') : '—'");
    expect(source).not.toContain("value === null ? '' : value.toLocaleString('ar-EG')");
  });

  it('uses the canonical teacher account permission', () => {
    const source = fs.readFileSync('src/components/users/TeacherAccountsManager.tsx', 'utf8');
    expect(source).toContain("hasPermission(currentUser, 'teacherAccounts.manage')");
  });
});
