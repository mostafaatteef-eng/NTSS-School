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
});