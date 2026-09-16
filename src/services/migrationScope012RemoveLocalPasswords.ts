/**
 * ==============================================================================
 * Migration: MIG_SCOPE_012_REMOVE_LOCAL_PASSWORDS
 * Enterprise Security Hardening: Remove Any Cached Plaintext Passwords and Hashes
 * ==============================================================================
 *
 * Idempotent migration to:
 * 1. Scan localStorage and sessionStorage for any cached user or credential records.
 * 2. Sanitize and purge password, passwordHash, passwordSalt, activationTokenHash,
 *    and temporaryPassword from all cached users.
 * 3. Mark migration as applied with flag 'ntss_mig_scope_012_done'.
 */

const MIGRATION_FLAG_KEY = 'ntss_mig_scope_012_done';

function sanitizeObject(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  let modified = false;
  const sensitiveFields = [
    'password',
    'passwordHash',
    'passwordSalt',
    'passwordAlgorithm',
    'passwordIterations',
    'activationTokenHash',
    'activationToken',
    'temporaryPassword'
  ];

  for (const field of sensitiveFields) {
    if (field in obj) {
      delete obj[field];
      modified = true;
    }
  }

  return modified;
}

function processStorage(storage: Storage): number {
  let cleanedCount = 0;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;

      if (
        key.includes('user') ||
        key.includes('employee') ||
        key.includes('credential') ||
        key.includes('account') ||
        key.startsWith('ntss_')
      ) {
        try {
          const raw = storage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);

          if (Array.isArray(parsed)) {
            let listModified = false;
            parsed.forEach(item => {
              if (sanitizeObject(item)) listModified = true;
            });
            if (listModified) {
              storage.setItem(key, JSON.stringify(parsed));
              cleanedCount++;
            }
          } else if (typeof parsed === 'object' && parsed !== null) {
            if (sanitizeObject(parsed)) {
              storage.setItem(key, JSON.stringify(parsed));
              cleanedCount++;
            }
          }
        } catch {
          // Non-JSON entries ignored safely
        }
      }
    }
  } catch (err) {
    console.warn('Error processing storage in migration 012:', err);
  }
  return cleanedCount;
}

export function runMigrationScope012RemoveLocalPasswords(): {
  alreadyApplied: boolean;
  cleanedCount: number;
  message: string;
} {
  const local =
    typeof globalThis !== 'undefined' && (globalThis as any).localStorage
      ? (globalThis as any).localStorage
      : typeof window !== 'undefined'
      ? window.localStorage
      : null;

  const session =
    typeof globalThis !== 'undefined' && (globalThis as any).sessionStorage
      ? (globalThis as any).sessionStorage
      : typeof window !== 'undefined'
      ? window.sessionStorage
      : null;

  if (!local) {
    return {
      alreadyApplied: false,
      cleanedCount: 0,
      message: 'Storage unavailable',
    };
  }

  const existingFlag = local.getItem(MIGRATION_FLAG_KEY);
  if (existingFlag) {
    return {
      alreadyApplied: true,
      cleanedCount: 0,
      message: 'Migration 012 already applied',
    };
  }

  let totalCleaned = 0;
  totalCleaned += processStorage(local);
  if (session) {
    totalCleaned += processStorage(session);
  }

  local.setItem(MIGRATION_FLAG_KEY, 'true');

  return {
    alreadyApplied: false,
    cleanedCount: totalCleaned,
    message: `Migration 012 applied successfully. Sanitized ${totalCleaned} storage entries.`,
  };
}
