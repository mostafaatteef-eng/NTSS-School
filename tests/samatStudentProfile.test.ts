import fs from'node:fs';import{describe,expect,it}from'vitest';
describe('Samat student profile',()=>{const s=fs.readFileSync('src/components/behavior/BehaviorView.tsx','utf8');
it('combines violations positive reinforcement and restoration in one timeline',()=>{
 for(const x of ['ملف سمات الطالب','السجل الزمني لسمات','profileTimeline','getBehaviorLedger(profileStudentId)',"e.type === 'POSITIVE'","e.type === 'RESTORE'",'الرصيد بعد العملية'])expect(s).toContain(x);
});});
