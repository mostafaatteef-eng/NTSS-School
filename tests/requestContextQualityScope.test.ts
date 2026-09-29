import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('API request context', () => {
  it('uses a canonical authenticated context for quality school scope', () => {
    const source = fs.readFileSync('api/index.ts', 'utf8');
    expect(source).toContain('type RequestContext = {');
    expect(source).toContain('function buildRequestContext(user: any): RequestContext');
    expect(source).toContain('const requestContext=buildRequestContext(user);');
    expect(source).toContain('const schoolId=String(body.schoolId||requestContext.activeSchoolId).trim();');
    expect(source).toContain('if(!(await canAccessSchool(user,schoolId)))');
  });
});
