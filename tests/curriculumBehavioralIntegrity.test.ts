import { beforeEach, describe, expect, it } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

import { curriculumPlanService } from '../src/services/curriculumPlanService';
import { storageService } from '../src/services/storageService';
import type { CurriculumMasterPlan, ScheduleItem, User } from '../src/types';

const teacher: User = {
  id: 'USR-T1', employeeId: 'EMP-T1', fullName: 'Teacher One', role: 'Teacher',
  schoolId: 'SCH-1', activeSchoolId: 'SCH-1', sessionToken: 'authoritative-test-token',
  status: 'Active', isActive: true,
};

const plan = (id: string, subject: string, grade: string, classroom: string): CurriculumMasterPlan => ({
  id, schoolId: 'SCH-1', academicYear: '2026-2027', term: 'T1', grade, classroom, subject,
  version: 1, status: 'Approved', uploadedBy: 'EMP-T1', uploadedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(), items: [{ id: id+'-I1', planId: id, week: 1, unit: 'U', lessonTitle: 'L', estimatedPeriods: 1, order: 1 }],
});

describe('Curriculum behavioral authorization and classroom coverage', () => {
  beforeEach(() => {
    localStorage.clear();
    storageService.setCurrentUser(teacher);
    const schedule: ScheduleItem[] = [
      { id:'S1', academicYear:'2026-2027', grade:'G1', classroom:'A', dayOfWeek:'الأحد', periodNumber:1, startTime:'08:00', endTime:'08:50', subject:'Math', teacherId:'EMP-T1', teacherName:'Teacher One', isActive:true },
      { id:'S2', academicYear:'2026-2027', grade:'G2', classroom:'B', dayOfWeek:'الإثنين', periodNumber:1, startTime:'08:00', endTime:'08:50', subject:'Science', teacherId:'EMP-T1', teacherName:'Teacher One', isActive:true },
    ];
    storageService.saveSchedule(schedule);
  });

  it('does not create authorization by mixing independently assigned subjects and classes', () => {
    const plans = [plan('P1','Math','G1','A'), plan('P2','Science','G2','B'), plan('P3','Math','G2','B'), plan('P4','Math','G1','B')];
    localStorage.setItem('ntss_curriculum_plans_v3', JSON.stringify(plans));
    const visible = curriculumPlanService.getAuthorizedPlansForUser(teacher).map(p => p.id);
    expect(visible).toEqual(['P1','P2']);
  });

  it('calculates progress from plans belonging to the requested classroom only', () => {
    localStorage.setItem('ntss_curriculum_plans_v3', JSON.stringify([plan('PA','Math','G1','A'), plan('PB','Math','G1','B')]));
    const result = curriculumPlanService.calculateProgress({ schoolId:'SCH-1', subject:'Math', grade:'G1', classroom:'A', term:'T1' });
    expect(result.totalItems).toBe(1);
    expect(result.unassignedCount).toBe(1);
  });

  it('keeps approved plans immutable even for curriculum administrators', () => {
    localStorage.setItem('ntss_curriculum_plans_v3', JSON.stringify([plan('LOCK','Math','G1','A')]));
    const admin: User = { ...teacher, id:'ADMIN', employeeId:'ADMIN', role:'Admin', fullName:'Admin' };
    storageService.setCurrentUser(admin);
    const result = storageService.saveCurriculumPlan({ ...plan('LOCK','Math','G1','A'), subject:'Changed' }, admin);
    expect(result.success).toBe(false);
    expect(result.message).toContain('مقفلة');
  });
});
