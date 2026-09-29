import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
if(typeof globalThis.localStorage==='undefined'){const s=new Map<string,string>();(globalThis as any).localStorage={getItem:(k:string)=>s.get(k)??null,setItem:(k:string,v:string)=>s.set(k,String(v)),removeItem:(k:string)=>s.delete(k),clear:()=>s.clear(),key:(i:number)=>Array.from(s.keys())[i]??null,get length(){return s.size;}};}
import { storageService } from '../src/services/storageService';
import type { User } from '../src/types';
const admin:User={id:'A1',fullName:'Admin',role:'Admin',schoolId:'SCH-1',activeSchoolId:'SCH-1',sessionToken:'valid-admin-token',status:'Active',isActive:true};
const teacher:User={id:'T1',fullName:'Teacher',role:'Teacher',schoolId:'SCH-1',activeSchoolId:'SCH-1',sessionToken:'valid-teacher-token',status:'Active',isActive:true};
describe('Teacher Visit workflow integrity',()=>{
 beforeEach(()=>{localStorage.clear();storageService.setCurrentUser(admin);});
 it('blocks unauthorized teacher creation',()=>{const r=storageService.saveTeacherVisitReport({teacherId:'EMP1',teacherName:'X',classroom:'1/1',subject:'Math',lessonTopic:'L',status:'DRAFT'},teacher);expect(r.success).toBe(false);});
 it('requires Submitted before approval and locks Approved reports',()=>{
  const created=storageService.saveTeacherVisitReport({teacherId:'EMP1',teacherName:'X',classroom:'1/1',subject:'Math',lessonTopic:'L',status:'DRAFT'},admin);expect(created.success).toBe(true);
  expect(storageService.approveTeacherVisitReport(created.data!.id,admin).success).toBe(false);
  const submitted=storageService.saveTeacherVisitReport({...created.data!,status:'SUBMITTED'},admin);expect(submitted.success).toBe(true);
  expect(storageService.approveTeacherVisitReport(created.data!.id,admin).success).toBe(true);
  expect(storageService.saveTeacherVisitReport({...submitted.data!,lessonTopic:'Changed',status:'APPROVED'},admin).success).toBe(false);
 });
 it('only deletes drafts',()=>{
  const r=storageService.saveTeacherVisitReport({teacherId:'EMP1',teacherName:'X',classroom:'1/1',subject:'Math',lessonTopic:'L',status:'SUBMITTED'},admin);expect(r.success).toBe(true);
  expect(storageService.deleteTeacherVisitReport(r.data!.id,admin).success).toBe(false);
 });
 it('preserves reports from other schools when approving one report',()=>{
  const other={id:'OTHER',schoolId:'SCH-2',teacherId:'E2',teacherName:'Other',classroom:'2/1',subject:'Science',lessonTopic:'Other lesson',status:'SUBMITTED',date:'2026-09-28',visitDate:'2026-09-28',period:1,periodNumber:1};
  localStorage.setItem('ntss_teacher_visit_reports_v1',JSON.stringify([other]));
  const created=storageService.saveTeacherVisitReport({teacherId:'EMP1',teacherName:'X',classroom:'1/1',subject:'Math',lessonTopic:'L',status:'SUBMITTED'},admin);expect(created.success).toBe(true);
  expect(storageService.approveTeacherVisitReport(created.data!.id,admin).success).toBe(true);
  const all=JSON.parse(localStorage.getItem('ntss_teacher_visit_reports_v1')||'[]');
  expect(all.find((r:any)=>r.id==='OTHER')?.schoolId).toBe('SCH-2');
  expect(all.find((r:any)=>r.id===created.data!.id)?.status).toBe('APPROVED');
 });
 it('calculates weighted visit score without losing visit fields',()=>{
  localStorage.setItem('ntss_quality_standards_v1',JSON.stringify([
   {id:'S1',schoolId:'SCH-1',code:'1',domain:'Teaching',standard:'A',indicator:'A1',weight:3,evaluationScale:4},
   {id:'S2',schoolId:'SCH-1',code:'2',domain:'Teaching',standard:'B',indicator:'B1',weight:1,evaluationScale:4}
  ]));
  const r=storageService.saveTeacherVisitReport({teacherId:'EMP1',teacherName:'X',classroom:'1/1',subject:'Math',lessonTopic:'Fractions',visitDate:'2026-09-28',periodNumber:3,status:'DRAFT',standardScores:[{standardId:'S1',score:4},{standardId:'S2',score:0}] as any},admin);
  expect(r.success).toBe(true);expect(r.data?.percentage).toBe(75);expect(r.data?.overallScore).toBe(75);expect(r.data?.lessonTopic).toBe('Fractions');expect(r.data?.periodNumber).toBe(3);
 });

 it('does not dereference viewingReport inside the new-visit modal',()=>{
  const source=readFileSync('src/components/quality/TeacherVisitReportSection.tsx','utf8');
  const newModalStart=source.indexOf('{isModalOpen && (');
  const viewModalStart=source.indexOf('{viewingReport && (',newModalStart);
  expect(newModalStart).toBeGreaterThan(-1);
  expect(viewModalStart).toBeGreaterThan(newModalStart);
  const newModal=source.slice(newModalStart,viewModalStart);
  expect(newModal).not.toContain('viewingReport.');
 });
});