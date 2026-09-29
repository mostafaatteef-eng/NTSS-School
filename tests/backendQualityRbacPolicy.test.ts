import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Backend quality RBAC policy', () => {
  it('centralizes quality read, write and approve permissions', () => {
    const source = fs.readFileSync('api/index.ts', 'utf8');
    expect(source).toContain('const BACKEND_ROLE_POLICIES = {');
    expect(source).toContain('QUALITY_READ:');
    expect(source).toContain('QUALITY_WRITE:');
    expect(source).toContain('QUALITY_APPROVE:');
    expect(source).toContain("hasBackendPermission(requestContext,'QUALITY_READ')");
    expect(source).toContain("hasBackendPermission(requestContext,'QUALITY_WRITE')");
    expect(source).toContain("hasBackendPermission(requestContext,'QUALITY_APPROVE')");
  });

  it('does not recreate ad-hoc quality role sets inside the route', () => {
    const source = fs.readFileSync('api/index.ts', 'utf8');
    expect(source).not.toContain('const canRead=new Set');
    expect(source).not.toContain('const canWrite=new Set');
    expect(source).not.toContain('const canApprove=new Set');
  });
});
