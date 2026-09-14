/**
 * ==============================================================================
 * Migration: MIG_SCOPE_011_LOGIN_NUMBERS_FIRST_LOGIN
 * Enterprise Security Overhaul: Login Numbers, First-Login Flow & Teacher Binding
 * ==============================================================================
 *
 * Idempotent migration to:
 * 1. Assign permanent, unique sequential login numbers starting at 121 for all staff and teachers.
 * 2. Never alter or regenerate existing login numbers.
 * 3. Mark accounts with valid salted password hashes as passwordInitialized = true.
 * 4. Mark uninitialized accounts as passwordInitialized = false (forcing First Login setup).
 * 5. Ensure all employees have explicit employeeId, teacherId, and isTeachingStaff attributes.
 * 6. Bind existing schedule items to registered employees (employeeId, teacherCode, loginNumber).
 * 7. Store archive snapshot in 'ntss_archive_login_numbers_first_login_v1'.
 */

import { STORAGE_KEYS } from './masterDataDefaults';
import { User, Employee, ScheduleItem } from '../types';

export interface Scope011ArchivePayload {
  migratedAt: string;
  migrationVersion: 'MIG_SCOPE_011_LOGIN_NUMBERS_FIRST_LOGIN';
  reason: 'Login Numbers & First Login Password Setup Security Normalization';
  usersAssignedCount: number;
  teachersAssignedCount: number;
  schedulesBoundCount: number;
}

const ARCHIVE_STORAGE_KEY = 'ntss_archive_login_numbers_first_login_v1';
const MIGRATION_FLAG_KEY = 'ntss_mig_scope_011_applied';
export const BASE_LOGIN_NUMBER_SEQUENCE = 121;

export function runMigrationScope011LoginNumbersFirstLogin(): {
  alreadyApplied: boolean;
  usersAssignedCount: number;
  teachersAssignedCount: number;
  schedulesBoundCount: number;
  message: string;
} {
  const storage =
    typeof globalThis !== 'undefined' && (globalThis as any).localStorage
      ? (globalThis as any).localStorage
      : typeof window !== 'undefined'
      ? window.localStorage
      : null;

  if (!storage) {
    return {
      alreadyApplied: false,
      usersAssignedCount: 0,
      teachersAssignedCount: 0,
      schedulesBoundCount: 0,
      message: 'Storage unavailable',
    };
  }

  const existingFlag = storage.getItem(MIGRATION_FLAG_KEY);
  if (existingFlag) {
    return {
      alreadyApplied: true,
      usersAssignedCount: 0,
      teachersAssignedCount: 0,
      schedulesBoundCount: 0,
      message: 'Already applied',
    };
  }

  let usersAssignedCount = 0;
  let teachersAssignedCount = 0;
  let schedulesBoundCount = 0;

  try {
    // 1. Read existing users and employees
    const rawUsers = storage.getItem(STORAGE_KEYS.USERS);
    const users: User[] = rawUsers ? JSON.parse(rawUsers) : [];

    const rawEmployees = storage.getItem(STORAGE_KEYS.EMPLOYEES);
    const employees: Employee[] = rawEmployees ? JSON.parse(rawEmployees) : [];

    // Find highest used login number
    let highestUsed = BASE_LOGIN_NUMBER_SEQUENCE - 1; // 120

    users.forEach(u => {
      const num = Number(u.loginNumber);
      if (Number.isFinite(num) && num > highestUsed) {
        highestUsed = num;
      }
    });

    employees.forEach(e => {
      const num = Number(e.loginNumber);
      if (Number.isFinite(num) && num > highestUsed) {
        highestUsed = num;
      }
    });

    let nextSequence = highestUsed + 1;

    // 2. Process Users: assign sequential loginNumber if missing and set passwordInitialized
    const updatedUsers = users.map(u => {
      let loginNumber = u.loginNumber;
      if (!loginNumber) {
        loginNumber = nextSequence++;
        usersAssignedCount++;
      }

      // If user has a valid passwordHash, consider initialized; otherwise false
      const hasPassword = Boolean(u.passwordHash && u.passwordHash.trim().length > 10);
      const passwordInitialized = u.passwordInitialized !== undefined ? u.passwordInitialized : hasPassword;

      return {
        ...u,
        loginNumber,
        passwordInitialized,
      };
    });

    // 3. Process Employees: assign sequential loginNumber if missing and normalize employeeId / teacherId
    const updatedEmployees = employees.map(e => {
      let loginNumber = e.loginNumber;
      if (!loginNumber) {
        // If employee has matching user with loginNumber, use it; otherwise assign new sequence
        const matchingUser = updatedUsers.find(
          u => u.employeeId === e.id || u.username.toLowerCase() === (e.email || '').toLowerCase()
        );
        if (matchingUser && matchingUser.loginNumber) {
          loginNumber = matchingUser.loginNumber;
        } else {
          loginNumber = nextSequence++;
          teachersAssignedCount++;
        }
      }

      const isTeacher = Boolean(e.isTeacher || e.teacherCode || e.isTeachingStaff);

      return {
        ...e,
        employeeId: e.employeeId || e.id,
        teacherId: isTeacher ? (e.teacherId || e.id) : e.teacherId,
        fullName: e.fullName || e.name,
        loginNumber,
        isTeachingStaff: isTeacher,
        isTeacher,
      };
    });

    // 4. Bind Schedule Items to registered Employees
    const rawSchedule = storage.getItem(STORAGE_KEYS.SCHEDULE);
    const schedules: ScheduleItem[] = rawSchedule ? JSON.parse(rawSchedule) : [];

    const updatedSchedules = schedules.map(s => {
      // Find matching employee by teacherId or teacherCode
      const emp = updatedEmployees.find(
        e => (s.teacherId && e.id === s.teacherId) ||
             (s.teacherCode && e.teacherCode && e.teacherCode.toUpperCase() === s.teacherCode.toUpperCase())
      );

      if (emp) {
        schedulesBoundCount++;
        return {
          ...s,
          employeeId: emp.id,
          teacherId: emp.id,
          teacherCode: emp.teacherCode || s.teacherCode,
          teacherName: emp.name || s.teacherName,
          loginNumber: emp.loginNumber || s.loginNumber,
        };
      }

      return s;
    });

    // Save back to storage
    storage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    storage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(updatedEmployees));
    storage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(updatedSchedules));

    // Archive snapshot
    const archivePayload: Scope011ArchivePayload = {
      migratedAt: new Date().toISOString(),
      migrationVersion: 'MIG_SCOPE_011_LOGIN_NUMBERS_FIRST_LOGIN',
      reason: 'Login Numbers & First Login Password Setup Security Normalization',
      usersAssignedCount,
      teachersAssignedCount,
      schedulesBoundCount,
    };
    storage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archivePayload));
    storage.setItem(MIGRATION_FLAG_KEY, 'true');

    return {
      alreadyApplied: false,
      usersAssignedCount,
      teachersAssignedCount,
      schedulesBoundCount,
      message: `Migration Scope 011 applied: ${usersAssignedCount} users, ${teachersAssignedCount} employees, ${schedulesBoundCount} schedules updated.`,
    };
  } catch (error: any) {
    console.error('Migration Scope 011 failed:', error);
    return {
      alreadyApplied: false,
      usersAssignedCount: 0,
      teachersAssignedCount: 0,
      schedulesBoundCount: 0,
      message: `Migration failed: ${error?.message || String(error)}`,
    };
  }
}
