import { describe,expect,it } from 'vitest';
import { calculateSamatScore,getSamatStudentLevel } from '../src/services/behavior/samatScoring';

describe('Samat scoring',()=>{
  it('balances positive and negative behavior without exceeding 0..100',()=>{
    const summary=calculateSamatScore(100,[
      {id:'1',studentId:'S1',type:'VIOLATION',sourceType:'violation',points:30,date:'2026-09-01',reason:'x'},
      {id:'2',studentId:'S1',type:'POSITIVE',sourceType:'positive_behavior',points:10,date:'2026-09-02',reason:'y'},
      {id:'3',studentId:'S1',type:'RESTORE',sourceType:'adjustment',points:5,date:'2026-09-03',reason:'z'},
    ]);
    expect(summary).toMatchObject({score:85,credits:15,debits:30,level:'قدوة حسنة'});
  });
  it('maps the five Samat student levels',()=>{
    expect(getSamatStudentLevel(49)).toBe('قيد التأسيس');
    expect(getSamatStudentLevel(50)).toBe('مبتدئ');
    expect(getSamatStudentLevel(66)).toBe('متمكن');
    expect(getSamatStudentLevel(81)).toBe('قدوة حسنة');
    expect(getSamatStudentLevel(91)).toBe('المحترف');
  });
  it('preserves an explicit zero initial score', () => {
    const result = calculateSamatScore(0, []);
    expect(result.score).toBe(0);
  });
});
