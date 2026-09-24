/**
 * MIG_SCOPE_014_MULTI_SCHOOL
 * 
 * Multi-School ERP Migration (Idempotent & Fail-Closed):
 * 1. Strictly stops all fake school seeding (zero auto-added schools).
 * 2. Preserves existing schools in Master School Registry cache without alteration.
 * 3. Does NOT set a default active school: if not set, activeSchoolId is ''.
 * 4. Deduplicates existing records by schoolId cleanly.
 */

import { School } from '../types';

export const MASTER_SCHOOLS_KEY = 'ntss_master_schools_registry_v1';
export const ACTIVE_SCHOOL_KEY = 'ntss_active_school_id_v1';

export interface MigrationScope014Result {
  migrated: boolean;
  version: string;
  schoolsCount: number;
  activeSchoolId: string;
  message: string;
}

export function runMigrationScope014MultiSchool(): MigrationScope014Result {
  const version = 'MIG_SCOPE_014_MULTI_SCHOOL_FAIL_CLOSED';
  const migrationMarkerKey = 'ntss_migration_scope_014_executed';

  let schools: School[] = [];
  try {
    const raw = localStorage.getItem(MASTER_SCHOOLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        schools = parsed;
      }
    }
  } catch {
    schools = [];
  }

  let modified = false;

  // Deduplicate existing cached schools by schoolId if any exist
  const uniqueMap = new Map<string, School>();
  for (const s of schools) {
    if (s && s.schoolId && !uniqueMap.has(s.schoolId)) {
      uniqueMap.set(s.schoolId, s);
    }
  }
  const cleanSchools = Array.from(uniqueMap.values());
  if (cleanSchools.length !== schools.length) {
    modified = true;
  }

  // Persist deduplicated cache if modified or marker missing
  const alreadyExecuted = localStorage.getItem(migrationMarkerKey) === version;
  if (modified || !alreadyExecuted) {
    if (cleanSchools.length > 0) {
      localStorage.setItem(MASTER_SCHOOLS_KEY, JSON.stringify(cleanSchools));
    }
    localStorage.setItem(migrationMarkerKey, version);
  }

  // Fail-Closed: Zero default active school authority.
  // If activeSchoolId is not set or not in known schools, activeSchoolId is ''
  let activeSchoolId = (localStorage.getItem(ACTIVE_SCHOOL_KEY) || '').trim();
  if (cleanSchools.length > 0) {
    if (!cleanSchools.some(s => s.schoolId === activeSchoolId)) {
      activeSchoolId = '';
      localStorage.setItem(ACTIVE_SCHOOL_KEY, '');
    }
  } else {
    activeSchoolId = '';
    localStorage.setItem(ACTIVE_SCHOOL_KEY, '');
  }

  return {
    migrated: modified || !alreadyExecuted,
    version,
    schoolsCount: cleanSchools.length,
    activeSchoolId,
    message: 'Master School Registry migrated idempotently with zero fake seeds',
  };
}
