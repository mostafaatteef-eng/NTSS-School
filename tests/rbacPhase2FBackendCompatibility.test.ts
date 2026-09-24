import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { storageService } from '../src/services/storageService';
import { CANONICAL_BACKEND_SOURCE, CANONICAL_BACKEND_VERSION } from '../src/services/googleSheetsAppScript';
import { SecurityAuditTestSuite } from '../src/services/securityAuditTest';

describe('RBAC Phase 2F-C — Backend Version Compatibility', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. Version and source match returns compatible = true', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        serviceAvailable: true,
        canonicalSource: CANONICAL_BACKEND_SOURCE,
        version: CANONICAL_BACKEND_VERSION,
        systemMode: 'PRODUCTION_RBAC',
      }),
    } as any);

    const result = await storageService.checkBackendCompatibility('https://script.google.com/test');
    expect(result.compatible).toBe(true);
    expect(result.code).toBeUndefined();
    expect(result.details?.version).toBe(CANONICAL_BACKEND_VERSION);
  });

  it('2. Version mismatch returns compatible = false with BACKEND_VERSION_MISMATCH', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        serviceAvailable: true,
        canonicalSource: CANONICAL_BACKEND_SOURCE,
        version: '4.0.0-PROD-STAFF-ONLY', // Stale version
      }),
    } as any);

    const result = await storageService.checkBackendCompatibility('https://script.google.com/test');
    expect(result.compatible).toBe(false);
    expect(result.code).toBe('BACKEND_VERSION_MISMATCH');
    expect(result.message).toContain('إصدار الخادم الخلفي غير متوافق');
    expect(result.details?.actual).toBe('4.0.0-PROD-STAFF-ONLY');
  });

  it('3. Canonical source mismatch returns compatible = false with BACKEND_SOURCE_MISMATCH', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        serviceAvailable: true,
        canonicalSource: 'rogue-script/UnauthorizedBackend.gs',
        version: CANONICAL_BACKEND_VERSION,
      }),
    } as any);

    const result = await storageService.checkBackendCompatibility('https://script.google.com/test');
    expect(result.compatible).toBe(false);
    expect(result.code).toBe('BACKEND_SOURCE_MISMATCH');
    expect(result.message).toContain('مصدر الخادم الخلفي غير متطابق أمنياً');
  });

  it('4. Network failure or unavailable service returns compatible = false with AUTH_SERVICE_UNAVAILABLE', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (offline)'));

    const result = await storageService.checkBackendCompatibility('https://script.google.com/test');
    expect(result.compatible).toBe(false);
    expect(result.code).toBe('AUTH_SERVICE_UNAVAILABLE');
  });

  it('4a. Strict health check: status="success" but serviceAvailable=false returns AUTH_SERVICE_UNAVAILABLE', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        serviceAvailable: false,
        canonicalSource: CANONICAL_BACKEND_SOURCE,
        version: CANONICAL_BACKEND_VERSION,
      }),
    } as any);

    const result = await storageService.checkBackendCompatibility('https://script.google.com/test');
    expect(result.compatible).toBe(false);
    expect(result.code).toBe('AUTH_SERVICE_UNAVAILABLE');
  });

  it('4b. Strict health check: status="error" but serviceAvailable=true returns AUTH_SERVICE_UNAVAILABLE', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'error',
        serviceAvailable: true,
        canonicalSource: CANONICAL_BACKEND_SOURCE,
        version: CANONICAL_BACKEND_VERSION,
      }),
    } as any);

    const result = await storageService.checkBackendCompatibility('https://script.google.com/test');
    expect(result.compatible).toBe(false);
    expect(result.code).toBe('AUTH_SERVICE_UNAVAILABLE');
  });

  it('5. Login does not proceed if compatibility pre-check fails (Fail-Closed)', async () => {
    // Health check returns version mismatch
    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('action=health')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            serviceAvailable: true,
            canonicalSource: CANONICAL_BACKEND_SOURCE,
            version: '4.9.0-OUTDATED',
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          user: { id: 'USR-1', role: 'SchoolAdmin' },
        }),
      };
    });
    global.fetch = fetchSpy as any;

    const loginRes = await storageService.login('admin@badr.edu.eg', 'SecretPassword123!');
    expect(loginRes.success).toBe(false);
    expect(loginRes.code).toBe('BACKEND_VERSION_MISMATCH');

    // Crucial: Only health check was called; POST with password credentials was NEVER invoked
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toContain('action=health');
  });

  it('6. SecurityAudit mock uses 5.2.0-AUTH-MULTISCHOOL and BOOTSTRAP_PUBLIC_ROUTE_RETIRED', async () => {
    const report = await SecurityAuditTestSuite.runSuite();
    expect(report.totalTests).toBeGreaterThanOrEqual(16);

    const testO = report.results.find(r => r.id === 'TEST_O');
    expect(testO?.passed).toBe(true);

    const testP = report.results.find(r => r.id === 'TEST_P');
    expect(testP?.passed).toBe(true);
    expect(testP?.expectedStatus).toBe('BOOTSTRAP_PUBLIC_ROUTE_RETIRED');
    expect(testP?.actualStatus).toBe('BOOTSTRAP_PUBLIC_ROUTE_RETIRED');

    // Confirm no stale 4.0.0-PROD-STAFF-ONLY in securityAuditTest.ts
    const auditFilePath = path.resolve(process.cwd(), 'src/services/securityAuditTest.ts');
    const content = fs.readFileSync(auditFilePath, 'utf-8');
    expect(content).not.toContain('4.0.0-PROD-STAFF-ONLY');
    expect(content).toContain('5.2.0-AUTH-MULTISCHOOL');
    expect(content).toContain('BOOTSTRAP_PUBLIC_ROUTE_RETIRED');
  });

  it('7. Code.gs health action returns only safe metadata without leaking sensitive data', () => {
    const codeGs = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf-8');
    expect(codeGs).toContain("action === 'health'");
    expect(codeGs).toContain('serviceAvailable: true');
    expect(codeGs).toContain('canonicalSource: CANONICAL_BACKEND_SOURCE');
    expect(codeGs).toContain('version: CANONICAL_BACKEND_VERSION');
    expect(codeGs).toContain("systemMode: 'PRODUCTION_RBAC'");
  });
});
