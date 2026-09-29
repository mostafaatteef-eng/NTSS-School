import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Resolved request tenant scope', () => {
  const source=fs.readFileSync('api/index.ts','utf8');

  it('resolves allowed schools from PostgreSQL by access scope',()=>{
    expect(source).toContain('async function resolveAllowedSchoolIds');
    expect(source).toContain("user?.role === 'Student' && user?.access_scope === 'SELF'");
    expect(source).toContain("user?.access_scope === 'GLOBAL'");
    expect(source).toContain('FROM user_school_access usa JOIN schools s ON s.id=usa.school_id');
  });

  it('normalizes active school to an actually allowed tenant',()=>{
    expect(source).toContain('async function resolveRequestContext');
    expect(source).toContain('allowedSchoolIds.includes(context.activeSchoolId)');
    expect(source).toContain('allowedSchoolIds.includes(context.homeSchoolId)');
  });

  it('rejects cross-school quality access from the resolved context',()=>{
    const start=source.indexOf("path === '/quality/manage'");
    const end=source.indexOf("path === '/schedule/manage'",start);
    const route=source.slice(start,end);
    expect(route).toContain('const requestContext=await resolveRequestContext(user);');
    expect(route).toContain('!requestContext.allowedSchoolIds.includes(schoolId)');
    expect(route).not.toContain('await canAccessSchool(user,schoolId)');
  });
});
