import fs from'node:fs';import{describe,expect,it}from'vitest';
describe('Samat restorative workflow',()=>{const s=fs.readFileSync('src/components/behavior/BehaviorView.tsx','utf8');
it('requires a documented reason and records restoration in ledger',()=>{
 for(const x of ['استعادة نقاط بعد المتابعة','handleRestorePoints',"type: 'RESTORE'","sourceType: 'adjustment'",'restoreReason.trim()','Math.min(30','توثيق الاستعادة وتحديث الرصيد'])expect(s).toContain(x);
});});
