import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Curriculum timetable authority', () => {
  const source = fs.readFileSync('api/index.ts', 'utf8');

  it('requires every active curriculum distribution to reference an authoritative schedule slot', () => {
    expect(source).toContain("if(!isCancellation&&!scheduleItemId)return respond({status: 'error',code:'SCHEDULE_LINK_REQUIRED'");
    expect(source).toContain("SELECT teacher_id,grade,classroom,weekday,period_no,payload FROM schedule WHERE id=$1 AND school_id=$2");
    expect(source).toContain("code:'SCHEDULE_TEACHER_MISMATCH'");
    expect(source).toContain("code:'SCHEDULE_PLAN_MISMATCH'");
  });

  it('uses canonical request context for schedule tenant scope', () => {
    const route = source.slice(source.indexOf("path === '/schedule/manage'"), source.indexOf("path === '/curriculum/manage'"));
    expect(route).toContain('const requestContext = buildRequestContext(user);');
    expect(route).toContain('body.schoolId || requestContext.activeSchoolId');
    expect(route).not.toContain("body.schoolId || user.active_school_id || user.school_id");
  });
});
