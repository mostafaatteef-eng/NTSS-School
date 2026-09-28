import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PHASE 3C-A16.5 — Final Teacher Portal local-authority freeze', () => {
  const portal = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/timetable/TeacherPortalView.tsx'),
    'utf8'
  );
  const curriculum = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/timetable/CurriculumPlansView.tsx'),
    'utf8'
  );

  it('teacher portal operational reads do not fall back to local schedule/content caches', () => {
    expect(portal).not.toContain('timetableService.getTeacherWeeklySchedule');
    expect(portal).not.toContain('timetableService.calculateTeacherLoad');
    expect(portal).not.toContain('storageService.getHomeworks()');
    expect(portal).not.toContain('timetableService.getTeacherLessonResources');
    expect(portal).not.toContain('timetableService.getExamSchedules');
    expect(portal).not.toContain("import { timetableService }");
    expect(portal).toContain('validateTeacherPortalSession');
  });

  it('teacher portal mounts curriculum workflow for the authenticated teacher', () => {
    expect(portal).toContain('<CurriculumPlansView currentUser={teacherPortalUser} />');
    expect(portal).not.toContain('<CurriculumPlansView currentUser={teacherPortalUser} readOnly />');
  });

  it('curriculum view has structural read-only mutation guards', () => {
    expect(curriculum).toContain('readOnly?: boolean');
    expect(curriculum).toContain('readOnly = false');
    expect(curriculum).toContain('if (readOnly || !linkingItem || !selectedScheduleId) return;');
    expect(curriculum).toContain('if (readOnly) return;');
    expect(curriculum).toContain('{linkingItem && !readOnly && (');
    expect(curriculum).toContain('{isUploadModalOpen && !readOnly && (');
    expect(curriculum).toContain('canUploadPlan');
  });

  it('teacher curriculum workflow supports upload while preserving explicit read-only mode', () => {
    expect(curriculum).toContain("const isTeacher = currentUser?.role === 'Teacher'");
    expect(curriculum).toContain('const canUploadPlan = !readOnly && (isTeacher ||');
    expect(curriculum).toContain("isTeacher ? 'رفع خطة منهج جديدة' : 'رفع وتوثيق خطة منهج جديدة'");
    expect(curriculum).toContain("readOnly ? 'استعراض فقط' : 'لا توجد صلاحية لرفع خطط المناهج'");
    expect(curriculum).toContain("selectedPlan.status === 'Approved'");
  });
});
