import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PostgreSQL browser session transport', () => {
  it('always sends credentialed requests and keeps bearer as an explicit removable fallback', () => {
    const source = fs.readFileSync('src/services/backend/postgresRuntime.ts', 'utf8');
    expect(source).toContain("credentials: 'include'");
    expect(source).toContain('VITE_DISABLE_BEARER_SESSION_FALLBACK');
    expect(source).toContain('if (sessionToken && bearerFallbackEnabled)');
    expect(source).not.toContain("credentials: 'omit'");
  });
});
