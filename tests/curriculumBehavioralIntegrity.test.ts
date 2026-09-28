import { beforeEach, describe, expect, it } from 'vitest';
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string,string>();
  (globalThis as any).localStorage = { getItem:(k:string)=>store.get(k)??null, setItem:(k:string,v:string)=>store.set(k,String(v)), removeItem:(k:string)=>store.delete(k), clear:()=>store.clear(), key:(i:number)=>Array.from(store.keys())[i]??null, get length(){return store.size;} };
}
import { curriculumPlanService } from '../src/services/curriculumPlanService';
import { storageService } from '../src/services/storageService';
import type { CurriculumMasterPlan, ScheduleItem, User } from '../src/types';

const teacher: User = { id:'USR-T1', employeeId:'EMP-T1', fullName:'Teacher One', role:'Teacher', schoolId:'SCH-1', activeSchoolId:'SCH-1', sessionToken:'authoritative-test-token', status:'Active', isActive:true };
const plan=(id:string,subject:string,grade:string,classroom:string):CurriculumMasterPlan=>({
  id,schoolId:'SCH-1',academicYear:'2026-2027',term:'T1',grade,classroom,subject,version:1,status:'Approved',uploadedBy:'EMP-T1',uploadedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  items:[{id:id+'-I1',planId:id,week:1,unit:'U',lessonTitle:'L',estimatedPeriods:1,order:1}]
  it('can cancel a stale distribution after its timetable slot is deleted',()=>{
    const p=plan('STALE','Math','G1','A');
    localStorage.setItem('ntss_curriculum_plans_v3',JSON.stringify([p]));
    storageService.saveSchedule([slot('OLD','الأحد')]);
    const linked=curriculumPlanService.linkPlanItemToSchedule({planId:'STALE',planItemId:'STALE-I1',scheduleItemId:'OLD',user:teacher});
    expect(linked.success).toBe(true);
    storageService.saveSchedule([]);
    const cancelled=storageService.saveCurriculumDistribution({...linked.distribution!,status:'Cancelled'},teacher);
    expect(cancelled.success).toBe(true);
    expect(storageService.getCurriculumDistributions('SCH-1').find(d=>d.id===linked.distribution!.id)?.status).toBe('Cancelled');
  });

});
const slot=(id:string,dayOfWeek:string,subject='Math',grade='G1',classroom='A'):ScheduleItem=>({
  id,academicYear:'2026-2027',grade,classroom,dayOfWeek,periodNumber:1,startTime:'08:00',endTime:'08:50',subject,teacherId:'EMP-T1',teacherName:'Teacher One',isActive:true
});

describe('Curriculum behavioral integrity',()=>{
  beforeEach(()=>{localStorage.clear();storageService.setCurrentUser(teacher);storageService.saveSchedule([slot('S1','الأحد'),slot('S2','الإثنين','Science','G2','B')]);});

  it('does not mix independently assigned subjects and classes',()=>{
    localStorage.setItem('ntss_curriculum_plans_v3',JSON.stringify([plan('P1','Math','G1','A'),plan('P2','Science','G2','B'),plan('P3','Math','G2','B'),plan('P4','Math','G1','B')]));
    expect(curriculumPlanService.getAuthorizedPlansForUser(teacher).map(p=>p.id)).toEqual(['P1','P2']);
  });

  it('calculates progress from requested classroom plans only',()=>{
    localStorage.setItem('ntss_curriculum_plans_v3',JSON.stringify([plan('PA','Math','G1','A'),plan('PB','Math','G1','B')]));
    const result=curriculumPlanService.calculateProgress({schoolId:'SCH-1',subject:'Math',grade:'G1',classroom:'A',term:'T1'});
    expect(result.totalItems).toBe(1);expect(result.unassignedCount).toBe(1);
  });

  it('keeps approved plans immutable for administrators',()=>{
    localStorage.setItem('ntss_curriculum_plans_v3',JSON.stringify([plan('LOCK','Math','G1','A')]));
    const admin:User={...teacher,id:'ADMIN',employeeId:'ADMIN',role:'Admin',fullName:'Admin'};storageService.setCurrentUser(admin);
    const result=storageService.saveCurriculumPlan({...plan('LOCK','Math','G1','A'),subject:'Changed'},admin);
    expect(result.success).toBe(false);expect(result.message).toContain('مقفلة');
  });

  it('creates estimated periods and relinks only the selected period',()=>{
    const p=plan('MULTI','Math','G1','A');p.items[0].estimatedPeriods=3;
    localStorage.setItem('ntss_curriculum_plans_v3',JSON.stringify([p]));
    storageService.saveSchedule([slot('M1','الأحد'),slot('M2','الإثنين'),slot('M3','الثلاثاء'),slot('M4','الأربعاء')]);
    const linked=curriculumPlanService.autoLinkPlanWeekToSchedule({planId:'MULTI',week:1,user:teacher});expect(linked.linked).toBe(3);
    const before=storageService.getCurriculumDistributions('SCH-1').filter(d=>d.status!=='Cancelled');expect(before).toHaveLength(3);
    const second=before.find(d=>d.scheduleItemId==='M2');expect(second).toBeTruthy();
    const moved=curriculumPlanService.linkPlanItemToSchedule({planId:'MULTI',planItemId:'MULTI-I1',scheduleItemId:'M4',user:teacher,replaceExisting:true,replaceDistributionId:second!.id});
    expect(moved.success).toBe(true);
    const after=storageService.getCurriculumDistributions('SCH-1').filter(d=>d.status!=='Cancelled');expect(after).toHaveLength(3);
    expect(new Set(after.map(d=>d.scheduleItemId))).toEqual(new Set(['M1','M3','M4']));
  });
});
