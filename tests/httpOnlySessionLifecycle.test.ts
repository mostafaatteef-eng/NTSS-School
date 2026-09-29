import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Canonical API session lifecycle', () => {
  const source = fs.readFileSync('api/index.ts', 'utf8');

  it('issues Secure HttpOnly SameSite=None cookies for staff and student sessions', () => {
    const issueCount = source.match(/ntss_session=\$\{encodeURIComponent\(token\)\}; Path=\/; HttpOnly; Secure; SameSite=None; Max-Age=86400/g)?.length || 0;
    expect(issueCount).toBeGreaterThanOrEqual(2);
  });

  it('validates active non-revoked non-expired sessions and active users', () => {
    expect(source).toContain("s.status='ACTIVE' AND s.revoked_at IS NULL");
    expect(source).toContain('s.expires_at>now()');
    expect(source).toContain("u.is_active=true AND u.status='Active'");
  });

  it('revokes server session and clears browser cookie on logout', () => {
    expect(source).toContain("UPDATE sessions SET status='REVOKED',revoked_at=now()");
    expect(source).toContain("ntss_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0");
  });
});
