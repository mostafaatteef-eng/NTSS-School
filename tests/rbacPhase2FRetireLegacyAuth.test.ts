import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { storageService } from '../src/services/storageService';
import { CANONICAL_BACKEND_SOURCE } from '../src/services/googleSheetsAppScript';

describe('RBAC Phase 2F-B — Retire Legacy Auth Paths', () => {
  it('1. storageService.firstLoginPasswordSetup is decommissioned', async () => {
    const res = await storageService.firstLoginPasswordSetup('admin', 'TOKEN123', 'NewPass123!');
    expect(res.success).toBe(false);
    expect(res.code).toBe('FIRST_LOGIN_DECOMMISSIONED');
  });

  it('2. storageService.issueUserActivationToken is decommissioned', async () => {
    const res = await storageService.issueUserActivationToken('user-123');
    expect(res.success).toBe(false);
    expect(res.code).toBe('FIRST_LOGIN_DECOMMISSIONED');
  });

  it('3. storageService.bootstrapFirstAdmin is decommissioned and fails closed', async () => {
    const res = await storageService.bootstrapFirstAdmin('admin', 'Password123!', 'Admin User', 'school-1');
    expect(res.success).toBe(false);
    expect(res.code).toBe('BOOTSTRAP_PUBLIC_ROUTE_RETIRED');
  });

  it('4. Code.gs retired bootstrapFirstAdmin public route', () => {
    const codeGs = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf-8');
    expect(codeGs).toContain("code: 'BOOTSTRAP_PUBLIC_ROUTE_RETIRED'");
    expect(codeGs).not.toContain("scriptProps.setProperty('BOOTSTRAP_COMPLETED', 'true')");
  });

  it('5. No LOCAL_SES_ occurrence exists in src/ directory', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const checkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          expect(content).not.toContain('LOCAL_SES_');
        }
      }
    };
    checkDir(srcDir);
  });

  it('6. googleSheetsAppScript.ts contains only canonical metadata without stale backend code', () => {
    expect(CANONICAL_BACKEND_SOURCE).toBe('google-apps-script/Code.gs');
    const filePath = path.resolve(process.cwd(), 'src/services/googleSheetsAppScript.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('4.0.0-PROD-STAFF-ONLY');
    expect(content.length).toBeLessThan(1000);
  });

  it('7. LoginView does not contain bootstrapFirstAdmin or first admin setup button', () => {
    const loginViewPath = path.resolve(process.cwd(), 'src/components/auth/LoginView.tsx');
    const content = fs.readFileSync(loginViewPath, 'utf-8');
    expect(content).not.toContain('bootstrapFirstAdmin');
    expect(content).not.toContain('isSetupOpen');
    expect(content).not.toContain('First Admin Setup');
  });
});
