import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Protected route school context', () => {
  it('does not derive protected route school scope from scattered raw session fields', () => {
    const source = fs.readFileSync('api/index.ts', 'utf8');
    const raw = "const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();";
    expect(source).not.toContain(raw);
    expect(source.match(/buildRequestContext\(user\)\.activeSchoolId/g)?.length || 0).toBeGreaterThanOrEqual(8);
  });
});
