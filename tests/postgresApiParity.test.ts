import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const vercel = fs.readFileSync('api/index.ts','utf8');
const worker = fs.readFileSync('functions/api.ts','utf8');

const normalizeVercel = (source:string) => {
  let value=source.replace(/^\/\/ deployment sync marker:[^\n]*\n/,'').replace(/(?:export )?const ntssHandler = \{/,'export default {');
  const wrapper=value.indexOf('export default async function vercelHandler');
  if(wrapper>=0)value=value.slice(0,wrapper);
  return value.trim();
};

describe('Postgres API parity',()=>{
  it('keeps shared API logic identical between Vercel and worker entrypoints',()=>{
    expect(normalizeVercel(vercel)).toBe(worker.trim());
  });
});
