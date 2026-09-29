import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Quality dashboard RBAC', () => {
  it('never grants dashboard access through an unconditional true fallback', () => {
    const source = fs.readFileSync('src/components/quality/QualityModule.tsx', 'utf8');
    const start = source.indexOf('const canViewDashboard');
    const end = source.indexOf('// Load all Quality module data', start);
    const policy = source.slice(start, end);
    expect(policy).not.toMatch(/\|\|\s*true/);
    expect(policy).toContain("hasPermission(currentUser, 'quality.viewDashboard')");
    expect(policy).toContain("currentUser?.role === 'SchoolDirector'");
    expect(policy).toContain("currentUser?.role === 'Supervisor'");
  });
});
