import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PHASE 3C-A16.3 — Teacher portal authoritative write freeze', () => {
  const portalPath = path.resolve(process.cwd(), 'src/components/timetable/TeacherPortalView.tsx');
  const storagePath = path.resolve(process.cwd(), 'src/services/storageService.ts');
  const gasPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');

  const portal = fs.readFileSync(portalPath, 'utf8');
  const storage = fs.readFileSync(storagePath, 'utf8');
  const gas = fs.readFileSync(gasPath, 'utf8');

  it('portal uses authoritative teacher draft services and has no legacy optimistic write calls', () => {
    expect(portal).toContain('saveTeacherHomeworkDraftAuthoritative');
    expect(portal).toContain('saveTeacherResourceDraftAuthoritative');
    expect(portal).not.toContain('storageService.saveHomework(hw)');
    expect(portal).not.toContain('timetableService.saveTeacherLessonResource(resItem)');
    expect(portal).not.toContain('حفظ ونشر الواجب');
    expect(portal).toContain('حفظ كمسودة');
  });

  it('client draft requests do not send teacher identity, school authority, or publish state', () => {
    const hwStart = storage.indexOf('public async saveTeacherHomeworkDraftAuthoritative');
    const resStart = storage.indexOf('public async saveTeacherResourceDraftAuthoritative');
    const sessionMarker = storage.indexOf('Teacher Session Management', resStart);

    const homeworkSection = storage.slice(hwStart, resStart);
    const resourceSection = storage.slice(resStart, sessionMarker);

    expect(homeworkSection).toContain("action: 'saveTeacherHomeworkDraft'");
    expect(resourceSection).toContain("action: 'saveTeacherResourceDraft'");
    expect(homeworkSection).toContain('teacherSessionToken: session.teacherSessionToken');
    expect(resourceSection).toContain('teacherSessionToken: session.teacherSessionToken');

    expect(homeworkSection).not.toContain('teacherId:');
    expect(homeworkSection).not.toContain('teacherName:');
    expect(homeworkSection).not.toContain('status:');
    expect(homeworkSection).not.toContain('schoolId:');

    expect(resourceSection).not.toContain('teacherId:');
    expect(resourceSection).not.toContain('teacherName:');
    expect(resourceSection).not.toContain('visibility:');
    expect(resourceSection).not.toContain('schoolId:');
  });

  it('backend owns teacher identity, classroom authorization, and Draft state', () => {
    const hwStart = gas.indexOf('function saveTeacherHomeworkDraft');
    const resStart = gas.indexOf('function saveTeacherResourceDraft');
    const reserveStart = gas.indexOf('function handleSaveReserveAssignment', resStart);

    const homeworkSection = gas.slice(hwStart, resStart);
    const resourceSection = gas.slice(resStart, reserveStart);

    expect(homeworkSection).toContain('TEACHER_NOT_ASSIGNED_TO_CLASSROOM');
    expect(homeworkSection).toContain('teacherId: tSession.teacherId');
    expect(homeworkSection).toContain("status: 'Draft'");

    expect(resourceSection).toContain('TEACHER_NOT_ASSIGNED_TO_CLASSROOM');
    expect(resourceSection).toContain('teacherId: tSession.teacherId');
    expect(resourceSection).toContain("visibility: 'Draft'");
  });
});
