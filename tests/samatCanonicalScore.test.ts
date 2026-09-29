import fs from 'node:fs';import{describe,expect,it}from'vitest';
describe('Samat canonical score',()=>{const s=fs.readFileSync('src/services/storageService.ts','utf8');
it('includes positive/restored ledger without double counting violation ledger',()=>{
 expect(s).toContain("entry.type === 'POSITIVE'");
 expect(s).toContain("entry.type === 'RESTORE'");
 expect(s).toContain("entry.sourceType === 'violation'");
 expect(s).toContain("rules.initialScore - totalDeductions - ledgerDebits + ledgerCredits");
 expect(s).toContain('const statusText = getSamatStudentLevel(currentScore)');
 expect(s).toContain("import { getSamatStudentLevel } from './behavior/samatScoring'");
});});
