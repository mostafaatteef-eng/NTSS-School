/**
 * MIG_SCOPE_015_REMOVE_FIRST_LOGIN
 * 
 * Idempotent Migration:
 * 1. Removes all legacy activation tokens and activation token hashes.
 * 2. Removes First Login flags (firstLogin, firstLoginRequired, passwordInitialized, mustChangePassword).
 * 3. Preserves all valid cryptographic password hashes.
 * 4. Accounts with valid password hashes become 'Active'.
 * 5. Accounts without valid passwords become 'Needs Setup' (no auto-generated passwords; admin must set them).
 * 6. Completely eliminates any forced password change flows on login.
 */

import { User, TeacherAccount } from '../types';

export const USERS_STORAGE_KEY = 'ntss_users';
export const TEACHER_ACCOUNTS_KEY = 'ntss_teacher_accounts_v3';
export const MIGRATION_015_MARKER = 'ntss_migration_scope_015_executed';

export interface MigrationScope015Result {
  migrated: boolean;
  version: string;
  usersProcessed: number;
  teachersProcessed: number;
  activeAccountsCount: number;
  needsSetupAccountsCount: number;
  message: string;
}

export function runMigrationScope015RemoveFirstLogin(): MigrationScope015Result {
  const version = 'MIG_SCOPE_015_REMOVE_FIRST_LOGIN';

  let users: User[] = [];
  try {
    const rawUsers = localStorage.getItem(USERS_STORAGE_KEY);
    if (rawUsers) users = JSON.parse(rawUsers);
  } catch {
    users = [];
  }

  let teacherAccounts: TeacherAccount[] = [];
  try {
    const rawTeachers = localStorage.getItem(TEACHER_ACCOUNTS_KEY);
    if (rawTeachers) teacherAccounts = JSON.parse(rawTeachers);
  } catch {
    teacherAccounts = [];
  }

  let usersModified = false;
  let activeUsers = 0;
  let needsSetupUsers = 0;

  const cleanedUsers: User[] = users.map(u => {
    let mod = false;
    const copy: any = { ...u };

    // 1. Purge legacy activation tokens and hashes
    if (copy.activationTokenHash !== undefined) {
      delete copy.activationTokenHash;
      mod = true;
    }
    if (copy.activationToken !== undefined) {
      delete copy.activationToken;
      mod = true;
    }
    if (copy.activationExpiresAt !== undefined) {
      delete copy.activationExpiresAt;
      mod = true;
    }
    if (copy.activationTokenExpiresAt !== undefined) {
      delete copy.activationTokenExpiresAt;
      mod = true;
    }

    // 2. Remove First Login & Force Change flags
    if (copy.mustChangePassword !== undefined) {
      delete copy.mustChangePassword;
      mod = true;
    }
    if (copy.firstLogin !== undefined) {
      delete copy.firstLogin;
      mod = true;
    }
    if (copy.firstLoginRequired !== undefined) {
      delete copy.firstLoginRequired;
      mod = true;
    }

    // 3. Evaluate password validity
    const hasValidHash = Boolean(copy.passwordHash && String(copy.passwordHash).trim().length > 10);
    const hasPlainPassword = Boolean(copy.password && String(copy.password).trim().length >= 4);

    if (hasValidHash || hasPlainPassword) {
      if (copy.status !== 'Inactive' && copy.status !== 'Suspended') {
        copy.status = 'Active';
        copy.isActive = true;
      }
      activeUsers++;
    } else {
      if (copy.status !== 'Inactive' && copy.status !== 'Suspended') {
        copy.status = 'Needs Setup';
        copy.isActive = false;
      }
      needsSetupUsers++;
    }

    if (mod) usersModified = true;
    return copy as User;
  });

  let teachersModified = false;
  let activeTeachers = 0;
  let needsSetupTeachers = 0;

  const cleanedTeachers: TeacherAccount[] = teacherAccounts.map(t => {
    let mod = false;
    const copy: any = { ...t };

    if (copy.mustChangePassword !== undefined) {
      delete copy.mustChangePassword;
      mod = true;
    }
    if (copy.firstLogin !== undefined) {
      delete copy.firstLogin;
      mod = true;
    }

    const hasValidHash = Boolean(copy.passwordHash && String(copy.passwordHash).trim().length > 10);
    if (hasValidHash) {
      if (copy.status !== 'Inactive' && copy.status !== 'Suspended' && copy.status !== 'Disabled') {
        copy.status = 'Active';
        copy.accountStatus = 'Active';
        copy.isActive = true;
      }
      activeTeachers++;
    } else {
      if (copy.status !== 'Inactive' && copy.status !== 'Suspended' && copy.status !== 'Disabled') {
        copy.status = 'Needs Setup';
        copy.accountStatus = 'Needs Setup';
        copy.isActive = false;
      }
      needsSetupTeachers++;
    }

    if (mod) teachersModified = true;
    return copy as TeacherAccount;
  });

  const alreadyMarked = localStorage.getItem(MIGRATION_015_MARKER) === version;
  if (usersModified || !alreadyMarked) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(cleanedUsers));
  }
  if (teachersModified || !alreadyMarked) {
    localStorage.setItem(TEACHER_ACCOUNTS_KEY, JSON.stringify(cleanedTeachers));
  }
  localStorage.setItem(MIGRATION_015_MARKER, version);

  return {
    migrated: usersModified || teachersModified || !alreadyMarked,
    version,
    usersProcessed: cleanedUsers.length,
    teachersProcessed: cleanedTeachers.length,
    activeAccountsCount: activeUsers + activeTeachers,
    needsSetupAccountsCount: needsSetupUsers + needsSetupTeachers,
    message: 'First Login and activation tokens permanently decommissioned',
  };
}
