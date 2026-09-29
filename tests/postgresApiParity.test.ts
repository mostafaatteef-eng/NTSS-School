import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('Postgres API canonical architecture', () => {
  it('keeps functions/api.ts as a thin compatibility adapter to the canonical handler', () => {
    const worker = fs.readFileSync('functions/api.ts', 'utf8');
    expect(worker).toContain("from '../api/index.ts'");
    expect(worker).toContain('ntssHandler');
    expect(worker).not.toContain('new Pool');
    expect(worker).not.toContain('CREATE TABLE');
    expect(worker).not.toContain('SELECT ');
    expect(worker).not.toContain('INSERT ');
    expect(worker).not.toContain('UPDATE ');
  });

  it('keeps the canonical business implementation in api/index.ts', () => {
    const canonical = fs.readFileSync('api/index.ts', 'utf8');
    expect(canonical).toContain('export const ntssHandler');
    expect(canonical).toContain('async fetch(request: Request)');
  });
});
