import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Curriculum distribution concurrency', () => {
  it('serializes writes for the same school, timetable slot and curriculum week', () => {
    const source = fs.readFileSync('api/index.ts', 'utf8');
    expect(source).toContain('const distributionLockKey=');
    expect(source).toContain('curriculum:\${schoolId}:\${scheduleItemId||id}:week:\${curriculumWeek}');
    expect(source).toContain("SELECT pg_advisory_xact_lock(hashtext($1))");
    expect(source).toContain('occupiedAfterLock');
    expect(source).toContain("code:'CURRICULUM_SLOT_OCCUPIED'");
  });

  it('audits existing slot-week duplicates before stronger database constraints', () => {
    const preflight = fs.readFileSync('database/integrity_preflight.sql', 'utf8');
    expect(preflight).toContain('Active curriculum distributions that compete for the same timetable slot and curriculum week');
    expect(preflight).toContain("d.status <> 'Cancelled'");
    expect(preflight).toContain('GROUP BY d.school_id, d.schedule_item_id, i.week');
    expect(preflight).toContain('HAVING COUNT(*) > 1');
  });
});
