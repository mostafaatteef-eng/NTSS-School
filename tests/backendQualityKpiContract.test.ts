import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Backend quality KPI contract', () => {
  const source = fs.readFileSync('api/index.ts', 'utf8');

  it('computes KPI only from approved quality reports', () => {
    expect(source).toContain("if(action==='metrics')");
    expect(source).toContain("upper(status)='APPROVED'");
    expect(source).toContain('record_type=ANY($2::text[])');
    expect(source).toContain('Array.from(reportTypes)');
  });

  it('returns explicit N/A metadata when no approved scored samples exist', () => {
    expect(source).toContain("data:{value,sampleSize:scores.length,period,status:scores.length?'AVAILABLE':'N/A'}");
    expect(source).toContain('const value=scores.length?');
    expect(source).toContain(':null;');
  });

  it('does not use standards, drafts, cached values or defaults as KPI samples', () => {
    const start = source.indexOf("if(action==='metrics')");
    const end = source.indexOf("if(action==='list')", start);
    const block = source.slice(start, end);
    expect(block).not.toContain('QUALITY_STANDARD');
    expect(block).not.toContain('DRAFT');
    expect(block).not.toContain('localStorage');
    expect(block).not.toMatch(/\|\|\s*(70|75|80|85|90|100)/);
  });
});
