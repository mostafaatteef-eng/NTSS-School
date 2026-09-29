import type { BehaviorScoreLedger, SamatStudentLevel } from '../../types';
import { SAMAT_STUDENT_LEVELS } from '../../data/initialData';

export interface SamatScoreSummary {
  score: number;
  credits: number;
  debits: number;
  level: SamatStudentLevel;
}

export function getSamatStudentLevel(score: number): SamatStudentLevel {
  const normalized=Math.max(0,Math.min(100,Number(score)||0));
  const level=SAMAT_STUDENT_LEVELS.find(item=>normalized>=item.min&&normalized<=item.max);
  return (level?.name || 'قيد التأسيس') as SamatStudentLevel;
}

export function calculateSamatScore(
  initialScore: number,
  ledger: BehaviorScoreLedger[],
): SamatScoreSummary {
  const numericInitial = Number(initialScore);
  const base = Math.max(0, Math.min(100, Number.isFinite(numericInitial) ? numericInitial : 100));
  let credits=0;
  let debits=0;
  for(const entry of ledger){
    const points=Math.abs(Number(entry.pointsAwarded ?? entry.points ?? 0));
    if(!Number.isFinite(points)) continue;
    const isCredit=entry.type==='credit'||entry.type==='POSITIVE'||entry.type==='RESTORE'||entry.sourceType==='positive_behavior';
    if(isCredit) credits+=points;
    else debits+=points;
  }
  const score=Math.max(0,Math.min(100,base+credits-debits));
  return {score,credits,debits,level:getSamatStudentLevel(score)};
}
