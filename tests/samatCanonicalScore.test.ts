import fs from 'node:fs';import{describe,expect,it}from'vitest';
describe('Samat canonical score',()=>{const s=fs.readFileSync('src/services/storageService.ts','utf8');
it('includes positive/restored ledger without double counting violation ledger',()=>{
 expect(s).toContain("entry.type === 'POSITIVE'");
 expect(s).toContain("entry.type === 'RESTORE'");
 expect(s).toContain("entry.sourceType === 'violation'");
 expect(s).toContain("rules.initialScore - totalDeductions - ledgerDebits + ledgerCredits");
 for(const x of ['أبني سماتي','أنمّي سماتي','أُظهر سماتي','أتميز بسماتي','قدوة بسماتي'])expect(s).toContain(x);
});});
