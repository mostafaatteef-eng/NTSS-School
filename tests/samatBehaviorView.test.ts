import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
describe('Samat behavior UI',()=>{
 const source=fs.readFileSync('src/components/behavior/BehaviorView.tsx','utf8');
 it('uses trait progression instead of legacy punitive ranking',()=>{
  expect(source).toContain('getSamatStudentLevel');
  expect(source).toContain('{st.samatLevel}');
  expect(source).toContain('تسجيل موقف سلوكي لطالب');
  expect(source).toContain('الموقف المرصود في منظومة سمات');
  expect(source).not.toContain('مقبول (إنذار أول)');
  expect(source).not.toContain('حرج (استدعاء ولي أمر)');
 });
});
