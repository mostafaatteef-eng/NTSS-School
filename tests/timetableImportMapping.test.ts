import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearImportMappingMemory,
  getRememberedMapping,
  loadImportMappingMemory,
  parseCompositeClassroom,
  rememberImportMapping,
  resolveClassroomAuto,
  resolveTeacherAuto,
} from '../src/services/timetableImportMappingService';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('Timetable smart import mapping', () => {
  beforeEach(() => localStorage.clear());

  it('auto-matches a unique active teacher name only when a teacherCode exists', () => {
    const teachers = [
      { id: 'EMP-1', name: 'KHALED', teacherCode: 'T-014', status: 'Active' },
      { id: 'EMP-2', name: 'HANAA', teacherCode: 'T-015', status: 'Active' },
    ] as any[];
    const result = resolveTeacherAuto('', 'KHALED', teachers);
    expect(result.teacher?.id).toBe('EMP-1');
    expect(result.teacher?.teacherCode).toBe('T-014');
  });

  it('does not auto-match an ambiguous duplicated teacher name', () => {
    const teachers = [
      { id: 'EMP-1', name: 'ALI', teacherCode: 'T-001' },
      { id: 'EMP-2', name: 'ALI', teacherCode: 'T-002' },
    ] as any[];
    expect(resolveTeacherAuto('', 'ALI', teachers).teacher).toBeUndefined();
  });

  it('parses composite classroom values such as 3/4', () => {
    expect(parseCompositeClassroom('3/4')).toEqual({ gradeOrdinal: 3, classroomNumber: '4' });
  });

  it('resolves 3/4 to grade 3 classroom 4', () => {
    const grades = [
      { id: 'G1', name: 'الصف الأول الثانوي', order: 1 },
      { id: 'G2', name: 'الصف الثاني الثانوي', order: 2 },
      { id: 'G3', name: 'الصف الثالث الثانوي', order: 3 },
    ] as any[];
    const classrooms = [
      { id: 'C31', gradeId: 'G3', classroomNumber: '1', displayName: 'الصف الثالث - فصل 1' },
      { id: 'C34', gradeId: 'G3', classroomNumber: '4', displayName: 'الصف الثالث - فصل 4' },
    ] as any[];
    const result = resolveClassroomAuto('3/4', 'الصف الثالث الثانوي', classrooms, grades);
    expect(result.classroom?.id).toBe('C34');
  });

  it('remembers a manually confirmed subject alias for later imports', () => {
    rememberImportMapping('subject', 'A.ENGLISH', 'SUB-ENG');
    const memory = loadImportMappingMemory();
    expect(getRememberedMapping(memory, 'subject', 'a english')).toBe('SUB-ENG');
    clearImportMappingMemory();
    expect(getRememberedMapping(loadImportMappingMemory(), 'subject', 'A.ENGLISH')).toBeUndefined();
  });
});
