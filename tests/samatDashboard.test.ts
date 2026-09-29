import fs from 'node:fs';import{describe,expect,it}from'vitest';
describe('Samat dashboard',()=>{const s=fs.readFileSync('src/components/behavior/BehaviorView.tsx','utf8');
it('shows school trait indicators and student journey labels',()=>{
 for(const x of ['مؤشرات سمات المدرسة','سجل المواقف السلوكية','إدارة مواقف سمات وأوزانها','ملف الطالب ومستوى سمات','ملف سمات للطلاب'])expect(s).toContain(x);
 expect(s).toContain('traitStats');
});});
