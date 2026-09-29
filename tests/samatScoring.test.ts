import { describe,expect,it } from 'vitest';
import { calculateSamatScore,getSamatStudentLevel } from '../src/services/behavior/samatScoring';

describe('Samat scoring',()=>{
  it('balances positive and negative behavior without exceeding 0..100',()=>{
    const summary=calculateSamatScore(100,[
      {id:'1',studentId:'S1',type:'VIOLATION',sourceType:'violation',points:30,date:'2026-09-01',reason:'x'},
      {id:'2',studentId:'S1',type:'POSITIVE',sourceType:'positive_behavior',points:10,date:'2026-09-02',reason:'y'},
      {id:'3',studentId:'S1',type:'RESTORE',sourceType:'adjustment',points:5,date:'2026-09-03',reason:'z'},
    ]);
    expect(summary).toMatchObject({score:85,credits:15,debits:30,level:'أتميز بسماتي'});
  });
  it('maps the five Samat student levels',()=>{
    expect(getSamatStudentLevel(50)).toBe('أبني سماتي');
    expect(getSamatStudentLevel(70)).toBe('أنمّي سماتي');
    expect(getSamatStudentLevel(80)).toBe('أُظهر سماتي');
    expect(getSamatStudentLevel(90)).toBe('أتميز بسماتي');
    expect(getSamatStudentLevel(100)).toBe('قدوة بسماتي');
  });
});
