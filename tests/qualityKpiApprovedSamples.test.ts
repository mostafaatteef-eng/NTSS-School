import { describe, expect, it } from 'vitest';
import { storageService } from '../src/services/storageService';

describe('Quality KPI approved-sample integrity', () => {
  it('returns no KPI when only draft or pending reports exist', () => {
    const metrics = storageService.getQualityMetricOverview('SCH-1', {
      daily: [{ id:'D1', schoolId:'SCH-1', status:'DRAFT', percentage:91 } as any],
      visits: [{ id:'V1', schoolId:'SCH-1', status:'PENDING', percentage:88 } as any],
      evals: [{ id:'E1', schoolId:'SCH-1', status:'REJECTED', percentage:84 } as any],
      actions: [],
      standards: [],
    });
    expect(metrics.overallQualityScore).toBeNull();
    expect(metrics.averageDailyScore).toBeNull();
    expect(metrics.averageTeacherVisitScore).toBeNull();
    expect(metrics.averageComprehensiveScore).toBeNull();
    expect(metrics.overallQualityKpi).toEqual({ value: null, sampleSize: 0, period: null, status: 'N/A' });
  });

  it('calculates KPI from approved samples only', () => {
    const metrics = storageService.getQualityMetricOverview('SCH-1', {
      daily: [
        { id:'D1', schoolId:'SCH-1', status:'APPROVED', percentage:80 } as any,
        { id:'D2', schoolId:'SCH-1', status:'DRAFT', percentage:10 } as any,
      ],
      visits: [],
      evals: [],
      actions: [],
      standards: [],
    });
    expect(metrics.averageDailyScore).toBe(80);
    expect(metrics.overallQualityScore).toBe(80);
    expect(metrics.overallQualityKpi).toEqual({ value: 80, sampleSize: 1, period: null, status: 'AVAILABLE' });
  });
});
