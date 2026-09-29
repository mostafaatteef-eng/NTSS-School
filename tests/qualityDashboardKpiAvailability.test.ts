import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Quality dashboard KPI availability', () => {
  it('shows N/A when there are no approved KPI samples', () => {
    const source = fs.readFileSync('src/components/quality/QualityDashboardSection.tsx', 'utf8');
    expect(source).toContain("metrics.overallQualityKpi.status === 'N/A' ? 'N/A'");
    expect(source).toContain('لا توجد تقارير معتمدة بعد');
    expect(source).toContain('metrics.overallQualityKpi.sampleSize');
  });

  it('guards nullable visit percentages in recent-visit rendering', () => {
    const source = fs.readFileSync('src/components/quality/QualityDashboardSection.tsx', 'utf8');
    expect(source).toContain('Number(tv.percentage ?? 0).toFixed(1)');
  });
});
