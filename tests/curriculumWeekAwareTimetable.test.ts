import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Curriculum week-aware timetable regression guards', () => {
  const service = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/curriculumPlanService.ts'),
    'utf8'
  );
  const storage = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/storageService.ts'),
    'utf8'
  );
  const matrix = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/timetable/TimetableWeeklyMatrixView.tsx'),
    'utf8'
  );

  it('persists curriculum week on every lesson distribution', () => {
    expect(service).toContain('week: planItem.week');
    expect(storage).toContain('week: dist.week');
  });

  it('scopes automatic slot occupancy to the requested curriculum week', () => {
    expect(service).toContain('Number(d.week || 0) === Number(params.week)');
    expect(service).toContain('Number(legacyItem?.week || 0) === Number(params.week)');
  });

  it('scopes manual slot uniqueness to the plan item week', () => {
    expect(service).toContain('existingWeek === Number(planItem.week)');
  });

  it('renders lesson content only for the selected curriculum week', () => {
    expect(matrix).toContain('const [curriculumWeek, setCurriculumWeek] = useState<number>(1)');
    expect(matrix).toContain('if (distributionWeek === curriculumWeek)');
    expect(matrix).toContain('أسبوع المنهج');
  });
});
