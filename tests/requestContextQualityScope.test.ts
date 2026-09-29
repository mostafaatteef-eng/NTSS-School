import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('API request context', () => {
  it('uses a canonical authenticated context for quality school scope', () => {
    const source = fs.readFileSync('api/index.ts', 'utf8');
    expect(source).toContain('type RequestContext = {');
    expect(source).toContain('function buildRequestContext(user: any): RequestContext');
    expect(source).toContain('allowedSchoolIds: string[];');
    expect(source).toContain('permissions: string[];');
    expect(source).toContain('const requestContext=await resolveRequestContext(user);');
    expect(source).toContain('const schoolId=String(body.schoolId||requestContext.activeSchoolId).trim();');
    expect(source).toContain('!requestContext.allowedSchoolIds.includes(schoolId)');
  });
});
