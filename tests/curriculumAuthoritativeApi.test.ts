import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
const api=fs.readFileSync('api/index.ts','utf8');
describe('Authoritative curriculum API guards',()=>{
 it('allows cancellation cleanup without requiring a live schedule slot',()=>{
   expect(api).toContain("const isCancellation=String(data.status||'Planned')==='Cancelled'");
   expect(api).toContain("if(scheduleItemId&&!isCancellation)");
 });
 it('protects official plans from authoritative deletion',()=>{
   expect(api).toContain("if(action==='deletePlan')");
   expect(api).toContain("['Submitted','Approved'].includes(String(existing.rows[0].status))");
   expect(api).toContain("code:'PLAN_DELETE_LOCKED'");
 });
 it('requires admin role for authoritative plan deletion',()=>{
   const start=api.indexOf("if(action==='deletePlan')");
   const end=api.indexOf("if(action==='savePlan')",start);
   expect(api.slice(start,end)).toContain("if(!isAdmin)");
 });
});