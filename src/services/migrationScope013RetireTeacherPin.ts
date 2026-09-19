/**
 * ==============================================================================
 * Migration: MIG_SCOPE_013_RETIRE_TEACHER_PIN
 * Enterprise Security Hardening: Completely Retire Teacher Portal PIN Authentication
 * ==============================================================================
 *
 * Idempotent migration to:
 * 1. Read Teacher_Credentials / Teacher Accounts from storage.
 * 2. For accounts with valid password credentials (passwordHash + passwordSalt):
 *    - Retain account and purge any legacy pinHash, pinSalt, pin, legacyPin.
 * 3. For accounts with only legacy pinHash / salt (no passwordHash):
 *    - Do NOT delete the account.
 *    - Do NOT guess/convert pinHash to passwordHash.
 *    - Set mustChangePassword = true.
 *    - Set legacyPinRetired = true.
 *    - Set accountStatus / status = (!username ? 'Needs Setup' : 'PasswordResetRequired').
 *    - Revoke all active teacher sessions.
 *    - Preserve employeeId, teacherCode, username, status, failedLoginAttempts, lockedUntil.
 *    - Empty/purge pinHash, pinSalt, pin, legacyPin.
 * 4. Add migrationVersion = 'MIG_SCOPE_013_RETIRE_TEACHER_PIN' and migratedAt.
 * 5. Sanitize teacher portal access storage.
 * 6. Idempotent and safe to rerun.
 */

import { STORAGE_KEYS } from './masterDataDefaults';
import { TeacherAccount, TeacherSession } from '../types';

export const MIGRATION_013_FLAG_KEY = 'ntss_mig_scope_013_done';
export const MIGRATION_013_VERSION = 'MIG_SCOPE_013_RETIRE_TEACHER_PIN';

export interface MigrationScope013Result {
  alreadyApplied: boolean;
  migratedCount: number;
  passwordAccountsRetained: number;
  pinOnlyAccountsConverted: number;
  sessionsRevokedCount: number;
  message: string;
}

export function runMigrationScope013RetireTeacherPin(): MigrationScope013Result {
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
      migratedCount: 0,
      passwordAccountsRetained: 0,
      pinOnlyAccountsConverted: 0,
      sessionsRevokedCount: 0,
      message: 'Storage environment unavailable for migration',
    };
  }

  // Idempotency check: if already applied, do not re-apply
  if (local.getItem(MIGRATION_013_FLAG_KEY) === 'true') {
    return {
      alreadyApplied: true,
      migratedCount: 0,
      passwordAccountsRetained: 0,
      pinOnlyAccountsConverted: 0,
      sessionsRevokedCount: 0,
      message: `Migration ${MIGRATION_013_VERSION} was already applied.`,
    };
  }

  const nowIso = new Date().toISOString();
  let migratedCount = 0;
  let passwordAccountsRetained = 0;
  let pinOnlyAccountsConverted = 0;
  let sessionsRevokedCount = 0;

  // 1. Migrate Teacher Accounts in STORAGE_KEYS.TEACHER_ACCOUNTS
  try {
    const rawAccounts = local.getItem(STORAGE_KEYS.TEACHER_ACCOUNTS);
    if (rawAccounts) {
      const parsed: any[] = JSON.parse(rawAccounts);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const revokedEmpIds = new Set<string>();

        const updated = parsed.map((acc: any) => {
          migratedCount++;

          const hasPassword = !!(acc.passwordHash && acc.passwordSalt) || (acc.username && acc.status === 'Active' && !acc.legacyPinRetired);
          const hasOnlyPin = !acc.passwordHash && (acc.pinHash || acc.pin || acc.salt || acc.accountStatus === 'PasswordResetRequired' || acc.status === 'PasswordResetRequired');

          if (hasOnlyPin && !acc.passwordHash) {
            pinOnlyAccountsConverted++;
            revokedEmpIds.add(acc.employeeId);

            const assignedStatus = !acc.username ? 'Needs Setup' : 'PasswordResetRequired';

            const migratedAcc: TeacherAccount = {
              id: acc.id || `TAC_${acc.employeeId}`,
              employeeId: acc.employeeId,
              teacherCode: acc.teacherCode || '',
              teacherName: acc.teacherName || '',
              department: acc.department,
              username: acc.username || '',
              usernameNormalized: acc.username ? acc.username.trim().toLowerCase() : undefined,
              status: assignedStatus,
              accountStatus: assignedStatus,
              isActive: false,
              mustChangePassword: true,
              legacyPinRetired: true,
              failedLoginAttempts: Number(acc.failedLoginAttempts) || 0,
              lockedUntil: acc.lockedUntil || null,
              lastLoginAt: acc.lastLoginAt || '',
              createdAt: acc.createdAt || nowIso,
              updatedAt: nowIso,
              migrationVersion: MIGRATION_013_VERSION,
              migratedAt: acc.migratedAt || nowIso,
            };

            // Purge any legacy PIN fields
            delete (migratedAcc as any).pinHash;
            delete (migratedAcc as any).pinSalt;
            delete (migratedAcc as any).pin;
            delete (migratedAcc as any).legacyPin;
            delete (migratedAcc as any).salt;

            return migratedAcc;
          } else {
            // Password account retained
            passwordAccountsRetained++;
            const sanitizedAcc: TeacherAccount = {
              ...acc,
              migrationVersion: MIGRATION_013_VERSION,
              migratedAt: acc.migratedAt || nowIso,
              updatedAt: nowIso,
            };

            // Purge any residual PIN fields
            delete (sanitizedAcc as any).pinHash;
            delete (sanitizedAcc as any).pinSalt;
            delete (sanitizedAcc as any).pin;
            delete (sanitizedAcc as any).legacyPin;
            delete (sanitizedAcc as any).salt;

            return sanitizedAcc;
          }
        });

        local.setItem(STORAGE_KEYS.TEACHER_ACCOUNTS, JSON.stringify(updated));

        // Revoke active sessions for converted PIN-only accounts
        if (revokedEmpIds.size > 0) {
          const checkAndRevokeSession = (storage: Storage | null) => {
            if (!storage) return;
            try {
              const rawSess = storage.getItem(STORAGE_KEYS.TEACHER_SESSION);
              if (rawSess) {
                const s: TeacherSession = JSON.parse(rawSess);
                if (s && s.employeeId && revokedEmpIds.has(s.employeeId)) {
                  storage.removeItem(STORAGE_KEYS.TEACHER_SESSION);
                  sessionsRevokedCount++;
                }
              }
            } catch {
              // Ignore session parse error
            }
          };

          checkAndRevokeSession(local);
          checkAndRevokeSession(session);
        }
      }
    }
  } catch (err) {
    console.warn('Error processing teacher accounts in migration 013:', err);
  }

  // 2. Sanitize and Purge Legacy Teacher Portal Access (STORAGE_KEYS.TEACHER_PORTAL_ACCESS)
  try {
    const rawAccess = local.getItem(STORAGE_KEYS.TEACHER_PORTAL_ACCESS);
    if (rawAccess) {
      const parsedAccess: any[] = JSON.parse(rawAccess);
      if (Array.isArray(parsedAccess)) {
        const sanitizedAccess = parsedAccess.map((entry: any) => {
          const clean = { ...entry };
          delete clean.pin;
          delete clean.pinHash;
          delete clean.salt;
          delete clean.legacyPin;
          clean.legacyPinRetired = true;
          clean.migrationVersion = MIGRATION_013_VERSION;
          return clean;
        });
        local.setItem(STORAGE_KEYS.TEACHER_PORTAL_ACCESS, JSON.stringify(sanitizedAccess));
      }
    }
  } catch (err) {
    console.warn('Error processing teacher portal access in migration 013:', err);
  }

  // Mark migration applied
  local.setItem(MIGRATION_013_FLAG_KEY, 'true');

  return {
    alreadyApplied: false,
    migratedCount,
    passwordAccountsRetained,
    pinOnlyAccountsConverted,
    sessionsRevokedCount,
    message: `Migration ${MIGRATION_013_VERSION} applied successfully: ${passwordAccountsRetained} password accounts retained, ${pinOnlyAccountsConverted} PIN-only accounts set to PasswordResetRequired/Needs Setup, ${sessionsRevokedCount} sessions revoked.`,
  };
}
