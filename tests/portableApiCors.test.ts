import { describe, expect, it, vi } from 'vitest';

vi.mock('pg', () => ({
  default: {
    Pool: class {
      async query(sql: string) {
        if (/SELECT 1/i.test(sql)) return { rows: [{ '?column?': 1 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }
    }
  }
}));

describe('Portable API CORS contract', () => {
  it('echoes the authorized GitHub Pages origin on credentialed preflight', async () => {
    const { ntssHandler } = await import('../api/index');
    const response = await ntssHandler.fetch(new Request('https://api.example.test/api/schools', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://mostafaatteef-eng.github.io',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://mostafaatteef-eng.github.io');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('allows cache-control and pragma on authenticated browser preflight', async () => {
    const { ntssHandler } = await import('../api/index');
    const response = await ntssHandler.fetch(new Request('https://api.example.test/api/system-overview', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://mostafaatteef-eng.github.io',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,cache-control,pragma',
      },
    }));
    expect(response.status).toBe(204);
    const allowed = response.headers.get('access-control-allow-headers') || '';
    expect(allowed).toContain('authorization');
    expect(allowed).toContain('cache-control');
    expect(allowed).toContain('pragma');
  });

  it('never emits wildcard CORS together with credentials', async () => {
    const { ntssHandler } = await import('../api/index');
    const response = await ntssHandler.fetch(new Request('https://api.example.test/api/health'));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('rejects an untrusted browser origin', async () => {
    const { ntssHandler } = await import('../api/index');
    const response = await ntssHandler.fetch(new Request('https://api.example.test/api/schools', {
      headers: { Origin: 'https://evil.example' },
    }));
    expect(response.status).toBe(403);
  });
});
