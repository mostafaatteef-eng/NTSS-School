import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const types=fs.readFileSync('src/types.ts','utf8');
describe('Samat workbook alignment',()=>{
  const data=fs.readFileSync('src/data/initialData.ts','utf8');
  const view=fs.readFileSync('src/components/behavior/BehaviorView.tsx','utf8');
  it('uses Samat identity and trait model',()=>{
    expect(view).toContain('سمات | السلوك والمهارات والانضباط');
    expect(data).toContain('SAMAT_TRAITS');
    expect(data).toContain('SAMAT_STUDENT_LEVELS');
    for(const level of ['قيد التأسيس','مبتدئ','متمكن','قدوة حسنة','المحترف']) expect(data).toContain(level);
  });
  it('preserves workbook discipline weights and representative items',()=>{
    for(const item of ['استخدام الموبايل أثناء الحصة','التنمر','التحرش','السرقة','عدم ارتداء أدوات السلامة أو الإجراءات الاحترازية']){
      expect(data).toContain(item);
    }
    for(const points of ['points: 5','points: 10','points: 15','points: 30']) expect(data).toContain(points);
  });
it('keeps the TypeScript level union synchronized with workbook Scale',()=>{for(const level of ['قيد التأسيس','مبتدئ','متمكن','قدوة حسنة','المحترف'])expect(types).toContain(level);for(const legacy of ['أبني سماتي','أنمّي سماتي','أُظهر سماتي','أتميز بسماتي','قدوة بسماتي'])expect(types).not.toContain(legacy);});});