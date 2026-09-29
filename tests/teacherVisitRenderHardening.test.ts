import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Teacher Visit render hardening', () => {
  it('guards nullable numeric scores and missing standard score arrays', () => {
    const source = fs.readFileSync('src/components/quality/TeacherVisitReportSection.tsx', 'utf8');
    expect(source).toContain('Number(rep.earnedScore ?? 0).toFixed(1)');
    expect(source).toContain('Number(rep.totalScore ?? 0).toFixed(1)');
    expect(source).toContain('Number(rep.percentage ?? 0).toFixed(1)');
    expect(source).toContain('(viewingReport.standardScores ?? []).map');
    expect(source).toContain('Number(viewingReport.percentage ?? 0).toFixed(1)');
  });
});
