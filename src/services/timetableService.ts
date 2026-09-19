import {
  CurriculumSubjectCoverage,
  ClassroomCoverageReport,
  CurriculumWeeklyRequirement,
  DEFAULT_TEACHER_LOAD_POLICY,
  Employee,
  ExamSchedule,
  Homework,
  ReserveCandidate,
  ScheduleBreak,
  ScheduleItem,
  ScheduleSubstitution,
  Student,
  StudentAccessToken,
  SupervisionAssignment,
  SupervisionLocation,
  TeacherAvailability,
  TeacherLessonResource,
  TeacherLoadCalculation,
  TeacherLoadPolicy,
  TeacherPortalAccess,
  TeacherTeachingAssignment,
  TimetableImportRow,
  TimetableImportSummary,
  User,
} from '../types';
import { STORAGE_KEYS } from './masterDataDefaults';
import { storageService } from './storageService';
import { getCairoCurrentDate, getCairoNowISO } from '../utils/egyptianTime';
import { generateSecureId } from '../utils/cryptoUtils';

/**
 * Hash PIN using Web Crypto SHA-256 with salt
 */
async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateRandomToken(len = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = new Uint8Array(len);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues)
    .map(n => chars[n % chars.length])
    .join('');
}

/**
 * Central Timetable, Teacher Load, Reserve, Supervision, and Portal Engine
 */
class TimetableService {
  // ============================================================================
  // 1. TEACHER CODE & IDENTITY MANAGEMENT
  // ============================================================================

  /**
   * Ensures all teaching staff have unique, indexed teacherCode (e.g. T-001, T-002)
   */
  public ensureTeacherCodes(): void {
    const employees = storageService.getEmployees();
    let updated = false;
    let maxNum = 0;

    employees.forEach(emp => {
      if (emp.teacherCode && emp.teacherCode.startsWith('T-')) {
        const num = parseInt(emp.teacherCode.replace('T-', ''), 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });

    const isTeachingRole = (emp: Employee) =>
      emp.isTeacher ||
      emp.jobTitle?.includes('معلم') ||
      emp.jobTitle?.includes('مدرس') ||
      emp.department?.includes('تعليم') ||
      emp.department?.includes('معلم');

    employees.forEach(emp => {
      if (isTeachingRole(emp) && !emp.teacherCode) {
        maxNum++;
        emp.teacherCode = `T-${String(maxNum).padStart(3, '0')}`;
        emp.isTeacher = true;
        updated = true;
      }
    });

    if (updated) {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    }
  }

  public getTeachingStaff(): Employee[] {
    this.ensureTeacherCodes();
    return storageService
      .getEmployees()
      .filter(
        e =>
          e.status === 'Active' &&
          (e.isTeacher ||
            e.jobTitle?.includes('معلم') ||
            e.jobTitle?.includes('مدرس') ||
            e.department?.includes('تعليم') ||
            e.department?.includes('معلم'))
      );
  }

  public findTeacherByCode(code: string): Employee | undefined {
    if (!code) return undefined;
    const clean = code.trim().toLowerCase();
    this.ensureTeacherCodes();
    return storageService.getEmployees().find(e =>
      (e.teacherCode && e.teacherCode.trim().toLowerCase() === clean) ||
      (e.loginNumber && String(e.loginNumber).trim() === clean) ||
      (e.id && e.id.trim().toLowerCase() === clean) ||
      (e.employeeId && e.employeeId.trim().toLowerCase() === clean)
    );
  }

  public findTeacherById(id: string): Employee | undefined {
    if (!id) return undefined;
    return storageService.getEmployees().find(e => e.id === id);
  }

  // ============================================================================
  // 2. TEACHER LOAD POLICY
  // ============================================================================

  public getTeacherLoadPolicy(): TeacherLoadPolicy {
    const config = storageService.getScheduleConfig();
    return config.teacherLoadPolicy || DEFAULT_TEACHER_LOAD_POLICY;
  }

  public saveTeacherLoadPolicy(policy: TeacherLoadPolicy): { success: boolean } {
    const config = storageService.getScheduleConfig();
    config.teacherLoadPolicy = { ...DEFAULT_TEACHER_LOAD_POLICY, ...policy };
    config.defaultPeriodDurationMinutes = policy.defaultPeriodMinutes || 50;
    storageService.saveScheduleConfig(config);
    return { success: true };
  }

  // ============================================================================
  // 3. TEACHER TEACHING ASSIGNMENTS (ASSIGNED LOAD)
  // ============================================================================

  public getTeacherAssignments(teacherId?: string): TeacherTeachingAssignment[] {
    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_TEACHING_ASSIGNMENTS);
    if (!raw) return [];
    try {
      const list: TeacherTeachingAssignment[] = JSON.parse(raw);
      if (!teacherId) return list;
      return list.filter(a => a.teacherId === teacherId && a.isActive !== false);
    } catch {
      return [];
    }
  }

  public saveTeacherAssignment(assignment: TeacherTeachingAssignment): { success: boolean; message?: string } {
    const list = this.getTeacherAssignments();
    const idx = list.findIndex(a => a.id === assignment.id);
    const now = getCairoNowISO();

    const teacher = this.findTeacherById(assignment.teacherId);
    const prepared: TeacherTeachingAssignment = {
      ...assignment,
      id: assignment.id || `TTA-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      teacherCode: assignment.teacherCode || teacher?.teacherCode,
      teacherName: assignment.teacherName || teacher?.name,
      isActive: assignment.isActive !== false,
      createdAt: assignment.createdAt || now,
      updatedAt: now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.TEACHER_TEACHING_ASSIGNMENTS, JSON.stringify(list));
    return { success: true, message: 'تم حفظ إسناد الحصص التعليمية بنجاح' };
  }

  public deleteTeacherAssignment(id: string): { success: boolean } {
    const list = this.getTeacherAssignments().filter(a => a.id !== id);
    localStorage.setItem(STORAGE_KEYS.TEACHER_TEACHING_ASSIGNMENTS, JSON.stringify(list));
    return { success: true };
  }

  // ============================================================================
  // 4. TEACHER LOAD CALCULATION ENGINE
  // ============================================================================

  /**
   * Calculates Sunday to Saturday date bounds for a given date
   */
  public getWeekDateRange(dateStr?: string): { startOfWeek: string; endOfWeek: string } {
    const now = dateStr ? new Date(dateStr) : new Date();
    // Egyptian school week starts on Sunday (day 0)
    const dayOfWeek = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);

    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);

    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return {
      startOfWeek: fmt(sunday),
      endOfWeek: fmt(saturday),
    };
  }

  public calculateTeacherLoad(teacherId: string, referenceDate?: string): TeacherLoadCalculation {
    const teacher = this.findTeacherById(teacherId);
    const policy = this.getTeacherLoadPolicy();
    const assignments = this.getTeacherAssignments(teacherId);
    const schedule = storageService.getSchedule();

    // 1. Assigned Load from TeacherTeachingAssignment
    const assignedPeriods = assignments.reduce((sum, a) => sum + (Number(a.requiredPeriodsPerWeek) || 0), 0);

    // 2. Scheduled Base Periods in current timetable
    const scheduledBasePeriods = schedule.filter(s => s.teacherId === teacherId && s.isActive !== false && !s.isCancelled).length;

    // 3. Substitutions / Reserve in the current week (Sunday -> Saturday)
    const { startOfWeek, endOfWeek } = this.getWeekDateRange(referenceDate || getCairoCurrentDate());
    const allSubs = storageService.getSubstitutions();

    const reserveThisWeek = allSubs.filter(
      s => s.substituteTeacherId === teacherId && s.status !== 'CANCELLED' && s.date >= startOfWeek && s.date <= endOfWeek
    ).length;

    const historicalReserveCount = allSubs.filter(
      s => s.substituteTeacherId === teacherId && s.status !== 'CANCELLED'
    ).length;

    // 4. Supervision shifts this week
    const supervisions = this.getSupervisionAssignments({
      teacherId,
    }).filter(s => s.status !== 'Cancelled' && s.date >= startOfWeek && s.date <= endOfWeek);

    const countedWeeklyPeriods = scheduledBasePeriods + (policy.reserveCountsTowardLoad ? reserveThisWeek : 0);
    const remainingCapacity = Math.max(0, policy.weeklyPeriodLimit - countedWeeklyPeriods);
    const isOverloaded = countedWeeklyPeriods > policy.weeklyPeriodLimit;

    let loadStatus: 'AVAILABLE' | 'NEAR_LIMIT' | 'FULL' | 'OVERLOAD' = 'AVAILABLE';
    if (isOverloaded) {
      loadStatus = 'OVERLOAD';
    } else if (countedWeeklyPeriods === policy.weeklyPeriodLimit) {
      loadStatus = 'FULL';
    } else if (countedWeeklyPeriods >= policy.weeklyPeriodLimit - 2) {
      loadStatus = 'NEAR_LIMIT';
    }

    const periodDuration = policy.defaultPeriodMinutes || 50;
    const weeklyMinutesLimit = policy.weeklyMinutesLimit || 1500;
    const weeklyPeriodLimit = policy.weeklyPeriodLimit || 30;
    const countedWeeklyMinutes = countedWeeklyPeriods * periodDuration;

    return {
      teacherId,
      teacherCode: teacher?.teacherCode || 'T-???',
      teacherName: teacher?.name || 'معلم غير معروف',
      department: teacher?.department,
      assignedPeriods,
      scheduledBasePeriods,
      reservePeriodsThisWeek: reserveThisWeek,
      countedWeeklyPeriods,
      countedWeeklyMinutes,
      weeklyMinutesLimit,
      defaultPeriodMinutes: periodDuration,
      weeklyPeriodLimit,
      remainingCapacity,
      supervisionCount: supervisions.length,
      historicalReserveCount,
      loadStatus,
      isOverloaded,
    };
  }

  public getAllTeachersLoad(referenceDate?: string): TeacherLoadCalculation[] {
    const teachers = this.getTeachingStaff();
    return teachers.map(t => this.calculateTeacherLoad(t.id, referenceDate));
  }

  // ============================================================================
  // 5. CURRICULUM WEEKLY REQUIREMENTS & COVERAGE ENGINE (39 PERIODS ICT PLAN)
  // ============================================================================

  public getCurriculumRequirements(gradeId?: string): CurriculumWeeklyRequirement[] {
    this.seedDefaultCurriculumRequirementsIfEmpty();
    const raw = localStorage.getItem(STORAGE_KEYS.CURRICULUM_WEEKLY_REQUIREMENTS);
    if (!raw) return [];
    try {
      const list: CurriculumWeeklyRequirement[] = JSON.parse(raw);
      if (!gradeId) return list;
      return list.filter(r => r.gradeId === gradeId && r.isActive !== false);
    } catch {
      return [];
    }
  }

  public saveCurriculumRequirement(req: CurriculumWeeklyRequirement): { success: boolean; message?: string } {
    const list = this.getCurriculumRequirements();
    const idx = list.findIndex(r => r.id === req.id);
    const prepared: CurriculumWeeklyRequirement = {
      ...req,
      id: req.id || `CWR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      isActive: req.isActive !== false,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.push(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.CURRICULUM_WEEKLY_REQUIREMENTS, JSON.stringify(list));
    return { success: true, message: 'تم حفظ الخطة الدراسية بنجاح' };
  }

  public deleteCurriculumRequirement(id: string): { success: boolean } {
    const list = this.getCurriculumRequirements().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEYS.CURRICULUM_WEEKLY_REQUIREMENTS, JSON.stringify(list));
    return { success: true };
  }

  /**
   * Official Egyptian ICT Applied Technology School Curriculum (Total 39 Periods Weekly)
   */
  public seedDefaultCurriculumRequirementsIfEmpty(): void {
    const existing = localStorage.getItem(STORAGE_KEYS.CURRICULUM_WEEKLY_REQUIREMENTS);
    if (existing && existing !== '[]') return;

    const academicYearId = '2026-2027';

    // Grade 1 (الصف الأول - تكنولوجيا تطبيقية صناعية) - 39 Periods
    const grade1Reqs: CurriculumWeeklyRequirement[] = [
      { id: 'CWR-G1-ARB', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-ARABIC', subjectName: 'اللغة العربية والتربية الإسلامية', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G1-ENG', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-ENG', subjectName: 'اللغة الإنجليزية المتقدمة', requiredPeriodsPerWeek: 3, isActive: true },
      { id: 'CWR-G1-MTH', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-MATH', subjectName: 'الرياضيات المتقدمة', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G1-PHY', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-PHYSICS', subjectName: 'الفيزياء التطبيقية', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G1-REL', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-RELIGION', subjectName: 'التربية الدينية', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G1-CIV', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-CIVICS', subjectName: 'التربية الوطنية', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G1-DIG', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-DIGITAL', subjectName: 'التحول الرقمي والحاسب', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G1-PE', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-PE', subjectName: 'التربية البدنية والصحية', requiredPeriodsPerWeek: 1, isActive: true },
      // Bi-weekly cycle subjects (Week A / Week B) -> 0.5 per week
      { id: 'CWR-G1-CAR', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-CAREER', subjectName: 'الإرشاد والتوجيه المهني', requiredPeriodsPerWeek: 0.5, cycleLengthWeeks: 2, requiredPeriodsPerCycle: 1, isActive: true },
      { id: 'CWR-G1-ENT', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-ENTREPRENEUR', subjectName: 'ريادة الأعمال والابتكار', requiredPeriodsPerWeek: 0.5, cycleLengthWeeks: 2, requiredPeriodsPerCycle: 1, isActive: true },
      // Technical Specialization
      { id: 'CWR-G1-THY', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-TECH-TH', subjectName: 'العلوم التقنية التخصصية (نظري)', requiredPeriodsPerWeek: 5, isActive: true },
      { id: 'CWR-G1-PRC', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-TECH-PR', subjectName: 'العلوم التقنية التخصصية (عملي بمعامل المدرسة)', requiredPeriodsPerWeek: 6, isActive: true },
      { id: 'CWR-G1-FLD', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G1', gradeName: 'الصف الأول الثانوي', subjectId: 'SUB-FIELD-TR', subjectName: 'التدريب الميداني والورش الإنتاجية', requiredPeriodsPerWeek: 14, isActive: true },
    ];

    // Grade 2 (الصف الثاني) - 39 Periods
    const grade2Reqs: CurriculumWeeklyRequirement[] = [
      { id: 'CWR-G2-ARB', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-ARABIC', subjectName: 'اللغة العربية والتربية الإسلامية', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G2-ENG', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-ENG', subjectName: 'اللغة الإنجليزية المتقدمة', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G2-MTH', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-MATH', subjectName: 'الرياضيات المتقدمة', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G2-PHY', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-PHYSICS', subjectName: 'الفيزياء التطبيقية', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G2-SOC', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-SOC', subjectName: 'الدراسات الاجتماعية والبيئية', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G2-REL', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-RELIGION', subjectName: 'التربية الدينية', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G2-DIG', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-DIGITAL', subjectName: 'التحول الرقمي والحاسب', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G2-PE', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-PE', subjectName: 'التربية البدنية والصحية', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G2-CAR', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-CAREER', subjectName: 'الإرشاد والتوجيه المهني', requiredPeriodsPerWeek: 0.5, cycleLengthWeeks: 2, requiredPeriodsPerCycle: 1, isActive: true },
      { id: 'CWR-G2-ENT', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-ENTREPRENEUR', subjectName: 'ريادة الأعمال والابتكار', requiredPeriodsPerWeek: 0.5, cycleLengthWeeks: 2, requiredPeriodsPerCycle: 1, isActive: true },
      { id: 'CWR-G2-THY', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-TECH-TH', subjectName: 'العلوم التقنية التخصصية (نظري)', requiredPeriodsPerWeek: 5, isActive: true },
      { id: 'CWR-G2-PRC', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-TECH-PR', subjectName: 'العلوم التقنية التخصصية (عملي بمعامل المدرسة)', requiredPeriodsPerWeek: 6, isActive: true },
      { id: 'CWR-G2-FLD', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G2', gradeName: 'الصف الثاني الثانوي', subjectId: 'SUB-FIELD-TR', subjectName: 'التدريب الميداني والورش الإنتاجية', requiredPeriodsPerWeek: 14, isActive: true },
    ];

    // Grade 3 (الصف الثالث) - 39 Periods
    const grade3Reqs: CurriculumWeeklyRequirement[] = [
      { id: 'CWR-G3-ARB', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-ARABIC', subjectName: 'اللغة العربية والتربية الإسلامية', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G3-ENG', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-ENG', subjectName: 'اللغة الإنجليزية المتقدمة', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G3-MTH', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-MATH', subjectName: 'الرياضيات المتقدمة', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G3-PHY', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-PHYSICS', subjectName: 'الفيزياء التطبيقية', requiredPeriodsPerWeek: 2, isActive: true },
      { id: 'CWR-G3-SOC', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-SOC', subjectName: 'الدراسات الاجتماعية', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G3-ECO', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-ECONOMICS', subjectName: 'الاقتصاد وإدارة المشروعات', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G3-REL', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-RELIGION', subjectName: 'التربية الدينية', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G3-DIG', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-DIGITAL', subjectName: 'التحول الرقمي والحاسب', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G3-PE', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-PE', subjectName: 'التربية البدنية والصحية', requiredPeriodsPerWeek: 1, isActive: true },
      { id: 'CWR-G3-CAR', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-CAREER', subjectName: 'الإرشاد والتوجيه المهني', requiredPeriodsPerWeek: 0.5, cycleLengthWeeks: 2, requiredPeriodsPerCycle: 1, isActive: true },
      { id: 'CWR-G3-ENT', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-ENTREPRENEUR', subjectName: 'ريادة الأعمال والابتكار', requiredPeriodsPerWeek: 0.5, cycleLengthWeeks: 2, requiredPeriodsPerCycle: 1, isActive: true },
      { id: 'CWR-G3-THY', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-TECH-TH', subjectName: 'العلوم التقنية التخصصية (نظري)', requiredPeriodsPerWeek: 5, isActive: true },
      { id: 'CWR-G3-PRC', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-TECH-PR', subjectName: 'العلوم التقنية التخصصية (عملي بمعامل المدرسة)', requiredPeriodsPerWeek: 6, isActive: true },
      { id: 'CWR-G3-FLD', curriculumVersionId: 'V2026', academicYearId, gradeId: 'G3', gradeName: 'الصف الثالث الثانوي', subjectId: 'SUB-FIELD-TR', subjectName: 'التدريب الميداني والورش الإنتاجية', requiredPeriodsPerWeek: 14, isActive: true },
    ];

    const all = [...grade1Reqs, ...grade2Reqs, ...grade3Reqs];
    localStorage.setItem(STORAGE_KEYS.CURRICULUM_WEEKLY_REQUIREMENTS, JSON.stringify(all));
  }

  /**
   * Validates classroom schedule against the official weekly plan (e.g. 39 periods)
   */
  public validateClassroomCurriculumCoverage(classroomId: string, gradeId?: string): ClassroomCoverageReport {
    const allSchedule = storageService.getSchedule();
    const classroomItems = allSchedule.filter(
      s => (s.classroomId === classroomId || s.classroom === classroomId) && s.isActive !== false && !s.isCancelled
    );

    // Identify grade from first schedule item or passed gradeId
    const resolvedGrade = gradeId || classroomItems[0]?.gradeId || classroomItems[0]?.grade || 'G1';
    const gradeName = classroomItems[0]?.grade || 'الصف الدراسي';
    const classroomName = classroomItems[0]?.classroom || classroomId;

    const requirements = this.getCurriculumRequirements(resolvedGrade);

    // Subject breakdown
    const subjectBreakdowns: CurriculumSubjectCoverage[] = requirements.map(req => {
      // Find matching items by subjectId or subject name
      const matched = classroomItems.filter(
        item => (item.subjectId && item.subjectId === req.subjectId) || (item.subject && req.subjectName && item.subject.trim() === req.subjectName.trim())
      );

      // Account for bi-weekly cycle (Week A/B = 0.5 per scheduled item)
      let scheduledCount = 0;
      matched.forEach(item => {
        if (item.cycleWeek === 'A' || item.cycleWeek === 'B') {
          scheduledCount += 0.5;
        } else {
          scheduledCount += 1;
        }
      });

      const diff = scheduledCount - req.requiredPeriodsPerWeek;
      let status: 'COMPLETE' | 'DEFICIT' | 'SURPLUS' = 'COMPLETE';
      if (diff < 0) status = 'DEFICIT';
      else if (diff > 0) status = 'SURPLUS';

      return {
        subjectId: req.subjectId,
        subjectName: req.subjectName || req.subjectId,
        requiredPeriods: req.requiredPeriodsPerWeek,
        scheduledPeriods: scheduledCount,
        difference: diff,
        isBiWeekly: req.cycleLengthWeeks === 2,
        cycleLengthWeeks: req.cycleLengthWeeks,
        status,
      };
    });

    const totalRequired = requirements.reduce((acc, r) => acc + r.requiredPeriodsPerWeek, 0);
    const totalScheduled = subjectBreakdowns.reduce((acc, s) => acc + s.scheduledPeriods, 0);
    const totalDiff = totalScheduled - totalRequired;

    let overallStatus: 'COMPLETE' | 'DEFICIT' | 'SURPLUS' = 'COMPLETE';
    if (totalDiff < 0) overallStatus = 'DEFICIT';
    else if (totalDiff > 0) overallStatus = 'SURPLUS';

    return {
      gradeId: resolvedGrade,
      gradeName,
      classroomId,
      classroomName,
      totalRequiredPeriods: totalRequired,
      totalScheduledPeriods: totalScheduled,
      difference: totalDiff,
      status: overallStatus,
      subjectBreakdowns,
    };
  }

  /**
   * Authoritative validation for the canonical 39 periods per week curriculum standard
   * Accurately supports Week A / Week B cycle alternating for bi-weekly subjects.
   */
  public validateCurriculum39(
    classroomId: string,
    cycleWeek?: 'A' | 'B' | 'ALL'
  ): {
    isValid: boolean;
    classroomId: string;
    totalRequiredPeriods: number;
    totalScheduledPeriods: number;
    difference: number;
    cycleWeek: 'A' | 'B' | 'ALL';
    status: 'COMPLETE' | 'DEFICIT' | 'SURPLUS';
    biWeeklyCoverage: {
      weekAScheduled: number;
      weekBScheduled: number;
      isBalanced: boolean;
    };
    subjectBreakdowns: CurriculumSubjectCoverage[];
    messages: string[];
  } {
    const allSchedule = storageService.getSchedule();
    const classroomItems = allSchedule.filter(
      s => (s.classroomId === classroomId || s.classroom === classroomId) && s.isActive !== false && !s.isCancelled
    );

    const resolvedGrade = classroomItems[0]?.gradeId || classroomItems[0]?.grade || 'G1';
    const requirements = this.getCurriculumRequirements(resolvedGrade);
    const selectedCycle = cycleWeek || 'ALL';

    const weekAItems = classroomItems.filter(s => s.cycleWeek === 'A' || s.cycleWeek === 'ALL' || !s.cycleWeek);
    const weekBItems = classroomItems.filter(s => s.cycleWeek === 'B' || s.cycleWeek === 'ALL' || !s.cycleWeek);

    const weekAScheduled = weekAItems.length;
    const weekBScheduled = weekBItems.length;
    const isBalanced = weekAScheduled === 39 && weekBScheduled === 39;

    const messages: string[] = [];

    const subjectBreakdowns: CurriculumSubjectCoverage[] = requirements.map(req => {
      const isBiWeekly = req.cycleLengthWeeks === 2;
      const matched = classroomItems.filter(
        item => (item.subjectId && item.subjectId === req.subjectId) ||
                (item.subject && req.subjectName && item.subject.trim() === req.subjectName.trim())
      );

      let scheduledPeriods = 0;
      if (selectedCycle === 'A') {
        scheduledPeriods = matched.filter(s => s.cycleWeek === 'A' || s.cycleWeek === 'ALL' || !s.cycleWeek).length;
      } else if (selectedCycle === 'B') {
        scheduledPeriods = matched.filter(s => s.cycleWeek === 'B' || s.cycleWeek === 'ALL' || !s.cycleWeek).length;
      } else {
        // Average cycle representation
        matched.forEach(item => {
          if (item.cycleWeek === 'A' || item.cycleWeek === 'B') {
            scheduledPeriods += 0.5;
          } else {
            scheduledPeriods += 1;
          }
        });
      }

      const requiredForPeriod = selectedCycle === 'ALL'
        ? req.requiredPeriodsPerWeek
        : (isBiWeekly ? (matched.some(m => m.cycleWeek === selectedCycle) ? 1 : 0) : req.requiredPeriodsPerWeek);

      const diff = scheduledPeriods - requiredForPeriod;
      const status: 'COMPLETE' | 'DEFICIT' | 'SURPLUS' = diff === 0 ? 'COMPLETE' : diff < 0 ? 'DEFICIT' : 'SURPLUS';

      return {
        subjectId: req.subjectId,
        subjectName: req.subjectName || req.subjectId,
        requiredPeriods: requiredForPeriod,
        scheduledPeriods,
        difference: diff,
        isBiWeekly,
        cycleLengthWeeks: req.cycleLengthWeeks,
        status,
      };
    });

    const totalRequired = 39;
    const totalScheduled = selectedCycle === 'A'
      ? weekAScheduled
      : selectedCycle === 'B'
      ? weekBScheduled
      : subjectBreakdowns.reduce((acc, s) => acc + s.scheduledPeriods, 0);

    const difference = totalScheduled - totalRequired;
    const isValid = totalScheduled === totalRequired;
    const status: 'COMPLETE' | 'DEFICIT' | 'SURPLUS' = difference === 0 ? 'COMPLETE' : difference < 0 ? 'DEFICIT' : 'SURPLUS';

    if (difference < 0) {
      messages.push(`عجز في الخطة الدراسية للفصل (${classroomId}): المسند ${totalScheduled} من أصل ${totalRequired} حصة أسبوعياً (عجز ${Math.abs(difference)} حصة).`);
    } else if (difference > 0) {
      messages.push(`فائض في الخطة الدراسية للفصل (${classroomId}): المسند ${totalScheduled} متجاوزاً النصاب المعتمد ${totalRequired} حصة أسبوعياً (زيادة ${difference} حصة).`);
    } else {
      messages.push(`الخطة الدراسية للفصل (${classroomId}) مكتملة ومطابقة للمعيار الرسمي (39/39 حصة أسبوعياً).`);
    }

    if (!isBalanced) {
      messages.push(`تنبيه التناوب بين الأسبوعين: أسبوع أ (${weekAScheduled} حصة)، أسبوع ب (${weekBScheduled} حصة).`);
    }

    return {
      isValid,
      classroomId,
      totalRequiredPeriods: totalRequired,
      totalScheduledPeriods: totalScheduled,
      difference,
      cycleWeek: selectedCycle,
      status,
      biWeeklyCoverage: {
        weekAScheduled,
        weekBScheduled,
        isBalanced,
      },
      subjectBreakdowns,
      messages,
    };
  }

  // ============================================================================
  // 6. BREAK MANAGEMENT
  // ============================================================================

  public getScheduleBreaks(): ScheduleBreak[] {
    const config = storageService.getScheduleConfig();
    if (config.breaks && config.breaks.length > 0) {
      return config.breaks;
    }
    // Fallback or seed default breaks
    const defaultBreaks: ScheduleBreak[] = [
      { id: 'BRK-1', name: 'الفسحة الأولى (الصلاة والإفطار)', startTime: '10:20', endTime: '10:40', sortOrder: 1, isActive: true },
      { id: 'BRK-2', name: 'الفسحة الثانية (راحة منتصف اليوم)', startTime: '12:20', endTime: '12:35', sortOrder: 2, isActive: true },
    ];
    return defaultBreaks;
  }

  public saveScheduleBreak(b: ScheduleBreak): { success: boolean; message?: string } {
    const config = storageService.getScheduleConfig();
    const breaks = this.getScheduleBreaks();
    const idx = breaks.findIndex(x => x.id === b.id);
    if (idx >= 0) {
      breaks[idx] = b;
    } else {
      breaks.push(b);
    }
    breaks.sort((x, y) => x.sortOrder - y.sortOrder);
    config.breaks = breaks;
    storageService.saveScheduleConfig(config);
    return { success: true, message: 'تم حفظ الفسحة بنجاح' };
  }

  public deleteScheduleBreak(id: string): { success: boolean } {
    const config = storageService.getScheduleConfig();
    config.breaks = this.getScheduleBreaks().filter(b => b.id !== id);
    storageService.saveScheduleConfig(config);
    return { success: true };
  }

  /**
   * Validates if a lesson interval overlaps with any active configurable break
   * Interval overlap condition: start1 < end2 && end1 > start2
   */
  public validateLessonBreakConflict(
    startTime?: string,
    endTime?: string,
    periodNumber?: number
  ): { hasConflict: boolean; conflictingBreak?: ScheduleBreak; reason?: string } {
    const breaks = this.getScheduleBreaks().filter(b => b.isActive);
    let sTime = startTime;
    let eTime = endTime;

    if ((!sTime || !eTime) && periodNumber) {
      const config = storageService.getScheduleConfig();
      const p = config.periods?.find(x => x.periodNumber === periodNumber);
      if (p) {
        sTime = sTime || p.startTime;
        eTime = eTime || p.endTime;
      }
    }

    if (!sTime || !eTime) {
      return { hasConflict: false };
    }

    for (const b of breaks) {
      if (b.startTime && b.endTime) {
        if (sTime < b.endTime && eTime > b.startTime) {
          return {
            hasConflict: true,
            conflictingBreak: b,
            reason: `تعارض مع الفسحة: وقت الحصة (${sTime} - ${eTime}) يتداخل مع (${b.name}) من ${b.startTime} إلى ${b.endTime}.`,
          };
        }
      }
    }

    return { hasConflict: false };
  }

  // ============================================================================
  // 7. CONFLICT ENGINE (10 CONFLICT TYPES + LOAD OVERLOAD WARNING)
  // ============================================================================

  public validateScheduleConflicts(
    item: ScheduleItem,
    existingSchedule?: ScheduleItem[],
    options?: { ignoreSelfId?: string }
  ): { hasConflict: boolean; conflicts: string[]; warnings: string[] } {
    const conflicts: string[] = [];
    const warnings: string[] = [];
    const schedule = (existingSchedule || storageService.getSchedule()).filter(
      s => s.id !== (options?.ignoreSelfId || item.id) && s.isActive !== false && !s.isCancelled
    );

    const day = item.dayOfWeek || item.dayName;
    const period = item.periodNumber;
    const cycle = item.cycleWeek || 'ALL';

    const cycleOverlaps = (c1?: string, c2?: string) => {
      if (!c1 || !c2 || c1 === 'ALL' || c2 === 'ALL') return true;
      return c1 === c2;
    };

    // 1. Teacher conflict: Same teacher has another class at same day & period
    if (item.teacherId) {
      const teacherConflict = schedule.find(
        s =>
          s.teacherId === item.teacherId &&
          (s.dayOfWeek === day || s.dayName === day) &&
          s.periodNumber === period &&
          cycleOverlaps(s.cycleWeek, cycle)
      );
      if (teacherConflict) {
        conflicts.push(
          `تعارض المعلم: المعلم (${item.teacherName || item.teacherId}) لديه حصة أخرى بالفعل في (${teacherConflict.grade} - ${teacherConflict.classroom}) في نفس التوقيت (حصة ${period}).`
        );
      }
    }

    // 2. Classroom conflict: Same classroom has another lesson at same day & period
    const classId = item.classroomId || item.classroom;
    const classConflict = schedule.find(
      s =>
        (s.classroomId === classId || s.classroom === classId) &&
        (s.dayOfWeek === day || s.dayName === day) &&
        s.periodNumber === period &&
        cycleOverlaps(s.cycleWeek, cycle)
    );
    if (classConflict) {
      conflicts.push(
        `تعارض الفصل: الفصل (${item.classroom || classId}) لديه مادة أخرى (${classConflict.subject}) مسندة لنفس الحصة (${period}).`
      );
    }

    // 3. Room conflict: Same room assigned to another class
    const room = item.roomId || item.room || item.roomNumber;
    if (room) {
      const roomConflict = schedule.find(
        s =>
          (s.roomId === room || s.room === room || s.roomNumber === room) &&
          (s.dayOfWeek === day || s.dayName === day) &&
          s.periodNumber === period &&
          cycleOverlaps(s.cycleWeek, cycle)
      );
      if (roomConflict) {
        conflicts.push(
          `تعارض القاعة/المعمل: القاعة (${room}) مشغولة بالفعل بحصة للفصل (${roomConflict.grade} - ${roomConflict.classroom}).`
        );
      }
    }

    // 4. Supervision conflict: Teacher assigned to supervision at this time
    if (item.teacherId) {
      const supervisions = this.getSupervisionAssignments({ teacherId: item.teacherId }).filter(
        s => s.status !== 'Cancelled' && (s.dayOfWeek === day || s.periodNumber === period)
      );
      if (supervisions.length > 0) {
        warnings.push(`تنبيه إشراف: المعلم مسند إليه نوبة إشراف في (${supervisions[0].locationName || 'الموقع'}) في نفس اليوم.`);
      }
    }

    // 5. Reserve conflict: Teacher is assigned as reserve substitution for this period
    if (item.teacherId) {
      const subs = storageService.getSubstitutions().filter(
        s => s.substituteTeacherId === item.teacherId && s.dayOfWeek === day && s.periodNumber === period && s.status !== 'CANCELLED'
      );
      if (subs.length > 0) {
        conflicts.push(`تعارض الاحتياطي: المعلم مسند إليه حصة احتياطي بالفعل في هذا التوقيت.`);
      }
    }

    // 6. Break conflict: Lesson overlaps with break time
    const breaks = this.getScheduleBreaks().filter(b => b.isActive);
    if (item.startTime && item.endTime) {
      for (const b of breaks) {
        if (
          (item.startTime >= b.startTime && item.startTime < b.endTime) ||
          (item.endTime > b.startTime && item.endTime <= b.endTime) ||
          (item.startTime <= b.startTime && item.endTime >= b.endTime)
        ) {
          conflicts.push(`تعارض مع الفسحة: وقت الحصة يتداخل مع (${b.name}) من ${b.startTime} إلى ${b.endTime}.`);
          break;
        }
      }
    }

    // 7. Teacher load capacity limit warning
    if (item.teacherId) {
      const load = this.calculateTeacherLoad(item.teacherId);
      if (load.countedWeeklyPeriods >= 30) {
        warnings.push(
          `تنبيه النصاب: المعلم وصل إلى الحد الأقصى للنصاب الأسبوعي (${load.countedWeeklyPeriods} / 30 حصة).`
        );
      }
    }

    // 8. Teacher availability conflict
    if (item.teacherId) {
      const avails = this.getTeacherAvailability(item.teacherId);
      const matchAvail = avails.find(a => a.dayOfWeek === day && a.periodNumber === period);
      if (matchAvail && matchAvail.availabilityStatus === 'UNAVAILABLE') {
        conflicts.push(`عدم تفرغ المعلم: تم تحديد هذا التوقيت كفترة غير متاحة للمعلم (${matchAvail.notes || 'غير متاح'}).`);
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
      warnings,
    };
  }

  // ============================================================================
  // 8. TEACHER AVAILABILITY
  // ============================================================================

  public getTeacherAvailability(teacherId: string): TeacherAvailability[] {
    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_AVAILABILITY);
    if (!raw) return [];
    try {
      const list: TeacherAvailability[] = JSON.parse(raw);
      return list.filter(a => a.teacherId === teacherId);
    } catch {
      return [];
    }
  }

  public saveTeacherAvailability(avail: TeacherAvailability): { success: boolean } {
    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_AVAILABILITY);
    let list: TeacherAvailability[] = [];
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch {
        list = [];
      }
    }
    const idx = list.findIndex(
      a => a.teacherId === avail.teacherId && a.dayOfWeek === avail.dayOfWeek && a.periodNumber === avail.periodNumber
    );
    if (idx >= 0) {
      list[idx] = avail;
    } else {
      list.push({ ...avail, id: `AV-${Date.now()}` });
    }
    localStorage.setItem(STORAGE_KEYS.TEACHER_AVAILABILITY, JSON.stringify(list));
    return { success: true };
  }

  // ============================================================================
  // 9. RESERVE / SUBSTITUTION ENGINE (5-LEVEL RANKING & FAIRNESS REPORT)
  // ============================================================================

  public getReserveCandidates(
    date: string,
    periodNumber: number,
    dayOfWeek: string,
    originalTeacherId: string,
    subjectId?: string
  ): ReserveCandidate[] {
    const teachers = this.getTeachingStaff().filter(t => t.id !== originalTeacherId);
    const policy = this.getTeacherLoadPolicy();
    const schedule = storageService.getSchedule();
    const subs = storageService.getSubstitutions({ date });
    const { startOfWeek, endOfWeek } = this.getWeekDateRange(date);

    // Busy teachers at this day and period
    const busyInSchedule = new Set(
      schedule
        .filter(s => (s.dayOfWeek === dayOfWeek || s.dayName === dayOfWeek) && s.periodNumber === periodNumber && s.isActive !== false && !s.isCancelled)
        .map(s => s.teacherId)
    );

    const busyInSubs = new Set(
      subs
        .filter(s => s.periodNumber === periodNumber && s.status !== 'CANCELLED')
        .map(s => s.substituteTeacherId)
    );

    // Busy in supervision
    const supervisions = this.getSupervisionAssignments({ date }).filter(
      s => s.periodNumber === periodNumber && s.status !== 'Cancelled'
    );
    const busyInSupervision = new Set(supervisions.map(s => s.teacherId));

    const candidates: ReserveCandidate[] = [];

    teachers.forEach(teacher => {
      const load = this.calculateTeacherLoad(teacher.id, date);
      const isBusy = busyInSchedule.has(teacher.id) || busyInSubs.has(teacher.id) || busyInSupervision.has(teacher.id);

      // Check teacher availability & leaves
      const leaves = storageService.getLeaves();
      const isOnLeave = leaves.some(
        l => l.employeeId === teacher.id && (l.status === 'مقبولة' || (l.status as string) === 'Approved') && date >= l.startDate && date <= l.endDate
      );

      const avails = this.getTeacherAvailability(teacher.id);
      const isMarkedUnavailable = avails.some(
        a => a.dayOfWeek === dayOfWeek && a.periodNumber === periodNumber && a.availabilityStatus === 'UNAVAILABLE'
      );

      const isInactive = Boolean(teacher.status && teacher.status !== 'Active');
      const isAtLimit = load.countedWeeklyPeriods >= policy.weeklyPeriodLimit;

      // Check subject match
      const teachesSameSubject = Boolean(
        (subjectId && teacher.teachingSubjects?.includes(subjectId)) ||
        (teacher.teachingSubjects && teacher.teachingSubjects.length > 0 && teacher.teachingSubjects.some(s => s === subjectId)) ||
        (teacher.department && teacher.department.includes(subjectId || ''))
      );

      let status: 'ELIGIBLE' | 'NEAR_LIMIT' | 'NOT_ELIGIBLE' = 'ELIGIBLE';
      let reason: string | undefined;

      // Strictly exclude: timetable conflict, reserve conflict, supervision conflict, unavailable, and at 30/30
      if (busyInSchedule.has(teacher.id)) {
        status = 'NOT_ELIGIBLE';
        reason = 'مشغول بحصة دراسية مجدولة في نفس الحصة';
      } else if (busyInSubs.has(teacher.id)) {
        status = 'NOT_ELIGIBLE';
        reason = 'مسند إليه حصة احتياطي أخرى في نفس الحصة';
      } else if (busyInSupervision.has(teacher.id)) {
        status = 'NOT_ELIGIBLE';
        reason = 'مسند إليه نوبة إشراف في نفس الحصة';
      } else if (isOnLeave) {
        status = 'NOT_ELIGIBLE';
        reason = 'المعلم في إجازة رسمية معتمدة';
      } else if (isMarkedUnavailable) {
        status = 'NOT_ELIGIBLE';
        reason = 'المعلم غير متفرغ في هذا التوقيت';
      } else if (isInactive) {
        status = 'NOT_ELIGIBLE';
        reason = 'حالة المعلم غير نشط';
      } else if (isAtLimit) {
        status = 'NOT_ELIGIBLE';
        reason = `وصل للحد الأقصى للنصاب الأسبوعي (${load.countedWeeklyPeriods} / ${policy.weeklyPeriodLimit} حصة)`;
      } else if (load.remainingCapacity <= 2) {
        status = 'NEAR_LIMIT';
      }

      // Ranking Score calculation (5-tier hierarchy)
      let score = 0;
      if (status !== 'NOT_ELIGIBLE') {
        if (teachesSameSubject) score += 10000;
        score += load.remainingCapacity * 1000;
        score += Math.max(0, 10 - load.reservePeriodsThisWeek) * 100;
        score += Math.max(0, policy.weeklyPeriodLimit - load.scheduledBasePeriods) * 10;
        score += Math.max(0, 100 - load.historicalReserveCount);
      } else {
        score = -100000;
      }

      candidates.push({
        teacher,
        teacherId: teacher.id,
        teacherCode: teacher.teacherCode || 'T-???',
        basePeriods: load.scheduledBasePeriods,
        reserveThisWeek: load.reservePeriodsThisWeek,
        totalCounted: load.countedWeeklyPeriods,
        periodLimit: policy.weeklyPeriodLimit,
        remainingCapacity: load.remainingCapacity,
        teachesSameSubject,
        historicalReserveCount: load.historicalReserveCount,
        rankScore: score,
        status,
        isEligible: status !== 'NOT_ELIGIBLE',
        ineligibilityReason: reason,
      });
    });

    // Sort strictly by 5-tier hierarchy:
    // 1. same subject first
    // 2. more remaining capacity
    // 3. fewer reserve this week
    // 4. lower base load
    // 5. historical reserve only as fairness tie-breaker
    return candidates.sort((a, b) => {
      if (a.isEligible !== b.isEligible) {
        return a.isEligible ? -1 : 1;
      }
      if (!a.isEligible && !b.isEligible) {
        return 0;
      }

      // Tier 1: Same subject first
      if (a.teachesSameSubject !== b.teachesSameSubject) {
        return a.teachesSameSubject ? -1 : 1;
      }

      // Tier 2: More remaining capacity (descending)
      if (a.remainingCapacity !== b.remainingCapacity) {
        return b.remainingCapacity - a.remainingCapacity;
      }

      // Tier 3: Fewer reserve this week (ascending)
      if (a.reserveThisWeek !== b.reserveThisWeek) {
        return a.reserveThisWeek - b.reserveThisWeek;
      }

      // Tier 4: Lower base load (ascending)
      if (a.basePeriods !== b.basePeriods) {
        return a.basePeriods - b.basePeriods;
      }

      // Tier 5: Historical reserve fairness tie-breaker (fewer is preferred)
      return a.historicalReserveCount - b.historicalReserveCount;
    });
  }

  public getEligibleReserveCandidates(
    date: string,
    periodNumber: number,
    dayOfWeek: string,
    originalTeacherId?: string,
    subjectId?: string
  ): ReserveCandidate[] {
    return this.getReserveCandidates(date, periodNumber, dayOfWeek, originalTeacherId, subjectId).filter(c => c.isEligible);
  }

  public getRankedReserveCandidates(
    paramsOrDate:
      | string
      | {
          date: string;
          periodNumber: number;
          dayOfWeek: string;
          absentTeacherId?: string;
          originalTeacherId?: string;
          subjectName?: string;
          subjectId?: string;
          classroomId?: string;
        },
    periodNumber?: number,
    dayOfWeek?: string,
    originalTeacherId?: string,
    subjectId?: string
  ): ReserveCandidate[] {
    if (typeof paramsOrDate === 'object') {
      return this.getReserveCandidates(
        paramsOrDate.date,
        paramsOrDate.periodNumber,
        paramsOrDate.dayOfWeek,
        paramsOrDate.absentTeacherId || paramsOrDate.originalTeacherId || '',
        paramsOrDate.subjectId || paramsOrDate.subjectName
      );
    }
    return this.getReserveCandidates(
      paramsOrDate,
      periodNumber || 1,
      dayOfWeek || 'الأحد',
      originalTeacherId || '',
      subjectId
    );
  }

  public getReserveSubstitutions(filters?: { date?: string; teacherId?: string; status?: string }): ScheduleSubstitution[] {
    return storageService.getSubstitutions(filters);
  }

  public saveReserveSubstitution(sub: ScheduleSubstitution): { success: boolean; message?: string } {
    if (!sub.substituteTeacherId) {
      return { success: false, message: 'يجب تحديد المعلم البديل لحصة الاحتياطي' };
    }

    const policy = this.getTeacherLoadPolicy();
    const load = this.calculateTeacherLoad(sub.substituteTeacherId, sub.date);

    // Check existing substitutions to see if this is an update to an existing record
    const existingSubs = storageService.getSubstitutions();
    const existing = existingSubs.find(s => s.id === sub.id);

    // If it's a new assignment or re-assignment to this teacher
    const isNewAssignment = !existing || existing.substituteTeacherId !== sub.substituteTeacherId || existing.status === 'CANCELLED';

    if (isNewAssignment) {
      const projectedLoad = load.countedWeeklyPeriods + 1;
      if (projectedLoad > policy.weeklyPeriodLimit) {
        return {
          success: false,
          message: `تم رفض إسناد الاحتياطي: المعلم سيصل إلى (${projectedLoad} / ${policy.weeklyPeriodLimit} حصة) متجاوزاً النصاب الأسبوعي الأقصى (${policy.weeklyPeriodLimit} حصة / ${policy.weeklyMinutesLimit || 1500} دقيقة).`,
        };
      }
    }

    return storageService.saveSubstitution(sub);
  }

  public cancelReserveSubstitution(id: string): { success: boolean } {
    const list = storageService.getSubstitutions();
    const item = list.find(s => s.id === id);
    if (item) {
      item.status = 'CANCELLED';
      storageService.saveSubstitution(item);
      return { success: true };
    }
    return storageService.deleteSubstitution(id);
  }

  public getReserveFairnessReport(dateFrom?: string, dateTo?: string): Array<{
    teacher: Employee;
    teacherId: string;
    teacherName: string;
    teacherCode: string;
    weeklyCount: number;
    monthlyCount: number;
    termCount: number;
    annualCount: number;
    averageWeekly: number;
    fairnessIndicator: 'ABOVE_AVERAGE' | 'BELOW_AVERAGE' | 'BALANCED';
  }> {
    const teachers = this.getTeachingStaff();
    const subs = storageService.getSubstitutions();
    const { startOfWeek, endOfWeek } = this.getWeekDateRange(getCairoCurrentDate());

    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM

    return teachers.map(teacher => {
      const teacherSubs = subs.filter(s => s.substituteTeacherId === teacher.id && s.status !== 'CANCELLED');

      const weeklyCount = teacherSubs.filter(s => s.date >= startOfWeek && s.date <= endOfWeek).length;
      const monthlyCount = teacherSubs.filter(s => s.date.startsWith(currentMonth)).length;
      const annualCount = teacherSubs.length;
      const termCount = annualCount; // approximation for single-term data

      const averageWeekly = annualCount > 0 ? parseFloat((annualCount / 12).toFixed(1)) : 0;
      const fairnessIndicator: 'ABOVE_AVERAGE' | 'BELOW_AVERAGE' | 'BALANCED' =
        weeklyCount > 2 ? 'ABOVE_AVERAGE' : weeklyCount === 0 ? 'BELOW_AVERAGE' : 'BALANCED';

      return {
        teacher,
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherCode: teacher.teacherCode || 'T-???',
        weeklyCount,
        monthlyCount,
        termCount,
        annualCount,
        averageWeekly,
        fairnessIndicator,
      };
    });
  }

  // ============================================================================
  // 10. SUPERVISION LOCATIONS & ASSIGNMENTS
  // ============================================================================

  public getSupervisionLocations(): SupervisionLocation[] {
    const raw = localStorage.getItem(STORAGE_KEYS.SUPERVISION_LOCATIONS);
    if (!raw) {
      const defaults: SupervisionLocation[] = [
        { id: 'LOC-GATE', name: 'البوابة الرئيسية والمداخل', code: 'GATE', description: 'استقبال وانصراف الطلاب والتفتيش', isActive: true, sortOrder: 1 },
        { id: 'LOC-YARD', name: 'الفناء المدرسي وطابور الصباح', code: 'YARD', description: 'الإشراف على الطابور والفسحة', isActive: true, sortOrder: 2 },
        { id: 'LOC-FL1', name: 'ممرات الدور الأول', code: 'FL1', description: 'ممرات الفصول والإدارة', isActive: true, sortOrder: 3 },
        { id: 'LOC-FL2', name: 'ممرات الدور الثاني', code: 'FL2', description: 'ممرات الفصول العليا', isActive: true, sortOrder: 4 },
        { id: 'LOC-LABS', name: 'المعامل والورش التخصصية', code: 'LABS', description: 'معامل الحاسب والشبكات والورش', isActive: true, sortOrder: 5 },
        { id: 'LOC-CAF', name: 'الكافتيريا والمقصف', code: 'CAF', description: 'تنظيم حركة الطلاب وقت الفسحة', isActive: true, sortOrder: 6 },
        { id: 'LOC-BUS', name: 'منطقة ركوب حافلات المدرسة', code: 'BUS', description: 'إشراف انصراف وركوب الباصات', isActive: true, sortOrder: 7 },
      ];
      localStorage.setItem(STORAGE_KEYS.SUPERVISION_LOCATIONS, JSON.stringify(defaults));
      return defaults;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveSupervisionLocation(loc: SupervisionLocation): { success: boolean; message?: string } {
    const list = this.getSupervisionLocations();
    const idx = list.findIndex(l => l.id === loc.id);
    const prepared: SupervisionLocation = {
      ...loc,
      id: loc.id || `LOC-${Date.now()}`,
      isActive: loc.isActive !== false,
      sortOrder: loc.sortOrder || list.length + 1,
    };
    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.push(prepared);
    }
    localStorage.setItem(STORAGE_KEYS.SUPERVISION_LOCATIONS, JSON.stringify(list));
    return { success: true, message: 'تم حفظ موقع الإشراف بنجاح' };
  }

  public deleteSupervisionLocation(id: string): { success: boolean } {
    const list = this.getSupervisionLocations().filter(l => l.id !== id);
    localStorage.setItem(STORAGE_KEYS.SUPERVISION_LOCATIONS, JSON.stringify(list));
    return { success: true };
  }

  public getSupervisionAssignments(filters?: {
    date?: string;
    teacherId?: string;
    locationId?: string;
  }): SupervisionAssignment[] {
    const raw = localStorage.getItem(STORAGE_KEYS.SUPERVISION_ASSIGNMENTS);
    if (!raw) return [];
    try {
      const list: SupervisionAssignment[] = JSON.parse(raw);
      if (!filters) return list;
      return list.filter(a => {
        if (filters.date && a.date !== filters.date) return false;
        if (filters.teacherId && a.teacherId !== filters.teacherId) return false;
        if (filters.locationId && a.locationId !== filters.locationId) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  public saveSupervisionAssignment(assignment: SupervisionAssignment): { success: boolean; message?: string } {
    const list = this.getSupervisionAssignments();
    const idx = list.findIndex(a => a.id === assignment.id);
    const now = getCairoNowISO();
    const teacher = this.findTeacherById(assignment.teacherId);
    const locations = this.getSupervisionLocations();
    const loc = locations.find(l => l.id === assignment.locationId);

    // Validate supervision conflicts (double booking, lesson conflict, reserve conflict)
    const conflictCheck = this.validateSupervisionConflict({
      teacherId: assignment.teacherId,
      date: assignment.date,
      shift: assignment.shift,
      timeSlot: assignment.timeSlot,
      periodNumber: assignment.periodNumber,
      dayOfWeek: assignment.dayOfWeek,
    });

    if (conflictCheck.hasConflict) {
      const existing = list.find(a => a.id === assignment.id);
      if (!existing) {
        return { success: false, message: conflictCheck.reason };
      }
    }

    const prepared: SupervisionAssignment = {
      ...assignment,
      id: assignment.id || `SUP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      teacherName: assignment.teacherName || teacher?.name,
      locationName: assignment.locationName || loc?.name,
      status: assignment.status || 'Scheduled',
      createdAt: assignment.createdAt || now,
      updatedAt: now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.SUPERVISION_ASSIGNMENTS, JSON.stringify(list));
    return { success: true, message: 'تم حفظ تكليف الإشراف بنجاح' };
  }

  public deleteSupervisionAssignment(id: string): { success: boolean } {
    const list = this.getSupervisionAssignments().filter(a => a.id !== id);
    localStorage.setItem(STORAGE_KEYS.SUPERVISION_ASSIGNMENTS, JSON.stringify(list));
    return { success: true };
  }

  // ============================================================================
  // 11. TEACHER PORTAL ACCESS & SECURE AUTHENTICATION (TEACHER CODE + PIN)
  // ============================================================================

  public getTeacherPortalAccess(employeeId: string): TeacherPortalAccess | undefined {
    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_PORTAL_ACCESS);
    if (!raw) return undefined;
    try {
      const list: TeacherPortalAccess[] = JSON.parse(raw);
      return list.find(a => a.employeeId === employeeId);
    } catch {
      return undefined;
    }
  }

  /**
   * @deprecated LEGACY PIN SYSTEM RETIRED (MIG_SCOPE_013_RETIRE_TEACHER_PIN)
   * Teacher accounts authenticate strictly via Username + Password.
   */
  public async setTeacherPin(employeeId: string, pin: string): Promise<{ success: boolean; code?: string; message?: string }> {
    return {
      success: false,
      code: 'LEGACY_PIN_RETIRED',
      message: 'تم إيقاف تعيين رمز PIN نهائياً. يرجى إدارة حساب المعلم من شاشة إدارة الحسابات بواسطة اسم المستخدم وكلمة المرور.',
    };
  }

  /**
   * @deprecated LEGACY PIN SYSTEM RETIRED (MIG_SCOPE_013_RETIRE_TEACHER_PIN)
   * Teacher accounts authenticate strictly via Username + Password.
   */
  public async verifyTeacherPin(
    teacherCode: string,
    pin: string
  ): Promise<{ success: boolean; employee?: Employee; token?: string; message?: string; code?: string; loginNumber?: string | number }> {
    return {
      success: false,
      code: 'LEGACY_PIN_RETIRED',
      message: 'تم إيقاف تسجيل الدخول باستخدام PIN نهائياً. يرجى استخدام بوابة المعلم بواسطة اسم المستخدم وكلمة المرور.',
    };
  }

  // ============================================================================
  // 12. HOMEWORK & LESSON RESOURCES
  // ============================================================================

  public getHomeworks(filters?: {
    teacherId?: string;
    classroomId?: string;
    gradeId?: string;
    subjectId?: string;
    status?: string;
  }): Homework[] {
    const raw = localStorage.getItem(STORAGE_KEYS.HOMEWORKS);
    if (!raw) return [];
    try {
      const list: Homework[] = JSON.parse(raw);
      if (!filters) return list;
      return list.filter(h => {
        if (filters.teacherId && h.teacherId !== filters.teacherId) return false;
        if (filters.classroomId && h.classroomId !== filters.classroomId && h.classroom !== filters.classroomId) return false;
        if (filters.gradeId && h.gradeId !== filters.gradeId && h.grade !== filters.gradeId) return false;
        if (filters.subjectId && h.subjectId !== filters.subjectId && h.subject !== filters.subjectId) return false;
        if (filters.status && h.status !== filters.status) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  /**
   * Validates if a teacher is formally assigned to teach this classroom (or scheduled to it)
   */
  public isTeacherAssignedToClass(teacherId: string, classroomId: string, subjectId?: string): boolean {
    if (!teacherId || !classroomId) return false;

    // 1. Check formal TeacherTeachingAssignment
    const assignments = this.getTeacherAssignments(teacherId);
    const hasAssignment = assignments.some(a => {
      const classMatch = a.classroomId === classroomId || a.classroomName === classroomId;
      if (!classMatch) return false;
      if (subjectId) {
        return a.subjectId === subjectId || a.subjectName === subjectId;
      }
      return true;
    });
    if (hasAssignment) return true;

    // 2. Check active schedule items in the timetable
    const schedule = storageService.getSchedule();
    const hasScheduledClass = schedule.some(s => {
      if (s.teacherId !== teacherId || s.isActive === false || s.isCancelled) return false;
      const classMatch = s.classroomId === classroomId || s.classroom === classroomId;
      if (!classMatch) return false;
      if (subjectId) {
        return s.subjectId === subjectId || s.subject === subjectId;
      }
      return true;
    });

    return hasScheduledClass;
  }

  /**
   * Backend authorization guard for teacher classroom actions
   */
  public validateTeacherClassroomAuthorization(
    actor: { role?: string; employeeId?: string; id?: string } | string,
    classroomId: string,
    subjectId?: string
  ): { authorized: boolean; reason?: string } {
    let role = 'Teacher';
    let employeeId = '';

    if (typeof actor === 'object') {
      role = actor.role || 'Teacher';
      employeeId = actor.employeeId || actor.id || '';
    } else {
      employeeId = actor;
    }

    // Admins, SchoolDirectors, and StudentAffairs have school-wide administrative authority
    if (role === 'Admin' || role === 'SchoolDirector' || role === 'StudentAffairs') {
      return { authorized: true };
    }

    if (!employeeId) {
      return { authorized: false, reason: 'غير مصرح: لم يتم التحقق من هوية المعلم أو جلسة الدخول مفقودة.' };
    }

    const assigned = this.isTeacherAssignedToClass(employeeId, classroomId, subjectId);
    if (!assigned) {
      return {
        authorized: false,
        reason: `غير مصرح: لا يجوز للمعلم إنشاء أو تعديل واجبات أو مصادر تعليمية أو امتحانات لفصل غير مسند إليه (${classroomId}).`,
      };
    }

    return { authorized: true };
  }

  public saveHomework(
    hw: Homework,
    actor?: { role?: string; employeeId?: string; id?: string } | string
  ): { success: boolean; message?: string } {
    const classroomId = hw.classroomId || hw.classroom || '';
    if (actor || hw.teacherId) {
      const auth = this.validateTeacherClassroomAuthorization(actor || hw.teacherId, classroomId, hw.subjectId);
      if (!auth.authorized) {
        return { success: false, message: auth.reason };
      }
    }

    const list = this.getHomeworks();
    const idx = list.findIndex(h => h.id === hw.id);
    const now = getCairoNowISO();

    const prepared: Homework = {
      ...hw,
      id: hw.id || `HW-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: hw.createdAt || now,
      updatedAt: now,
      status: hw.status || 'Published',
      isVisibleToStudent: hw.isVisibleToStudent !== false,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.HOMEWORKS, JSON.stringify(list));
    return { success: true, message: 'تم حفظ الواجب المنزلي بنجاح' };
  }

  public deleteHomework(id: string): { success: boolean } {
    const list = this.getHomeworks().filter(h => h.id !== id);
    localStorage.setItem(STORAGE_KEYS.HOMEWORKS, JSON.stringify(list));
    return { success: true };
  }

  public getTeacherLessonResources(filters?: {
    teacherId?: string;
    classroomId?: string;
    subjectId?: string;
  }): TeacherLessonResource[] {
    const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_LESSON_RESOURCES);
    if (!raw) return [];
    try {
      const list: TeacherLessonResource[] = JSON.parse(raw);
      if (!filters) return list;
      return list.filter(r => {
        if (filters.teacherId && r.teacherId !== filters.teacherId) return false;
        if (filters.classroomId && r.classroomId !== filters.classroomId) return false;
        if (filters.subjectId && r.subjectId !== filters.subjectId) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  public saveTeacherLessonResource(
    res: TeacherLessonResource,
    actor?: { role?: string; employeeId?: string; id?: string } | string
  ): { success: boolean; message?: string } {
    const classroomId = res.classroomId || '';
    if (actor || res.teacherId) {
      const auth = this.validateTeacherClassroomAuthorization(actor || res.teacherId, classroomId, res.subjectId);
      if (!auth.authorized) {
        return { success: false, message: auth.reason };
      }
    }

    const list = this.getTeacherLessonResources();
    const idx = list.findIndex(r => r.id === res.id);
    const now = getCairoNowISO();

    const prepared: TeacherLessonResource = {
      ...res,
      id: res.id || `TLR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: res.createdAt || now,
      updatedAt: now,
      visibility: res.visibility || 'Published',
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.TEACHER_LESSON_RESOURCES, JSON.stringify(list));
    return { success: true, message: 'تم حفظ المصادر التعليمية ورابط التحضير بنجاح' };
  }

  public deleteTeacherLessonResource(id: string): { success: boolean } {
    const list = this.getTeacherLessonResources().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEYS.TEACHER_LESSON_RESOURCES, JSON.stringify(list));
    return { success: true };
  }

  // ============================================================================
  // 13. EXAM SCHEDULE FOUNDATION
  // ============================================================================

  public getExamSchedules(filters?: {
    academicYearId?: string;
    gradeId?: string;
    classroomId?: string;
    status?: string;
  }): ExamSchedule[] {
    const raw = localStorage.getItem(STORAGE_KEYS.EXAM_SCHEDULES);
    if (!raw) return [];
    try {
      const list: ExamSchedule[] = JSON.parse(raw);
      // Canonical normalization
      const normalized = list.map(e => ({
        ...e,
        academicYearId: e.academicYearId || e.academicYear || '2026-2027',
        termId: e.termId || e.term || 'TERM-1',
        examDate: e.examDate || e.date || '',
        date: e.examDate || e.date || '',
        academicYear: e.academicYearId || e.academicYear || '2026-2027',
        term: e.termId || e.term || 'TERM-1',
      }));

      if (!filters) return normalized;
      return normalized.filter(e => {
        if (filters.academicYearId && e.academicYearId !== filters.academicYearId) return false;
        if (filters.gradeId && e.gradeId !== filters.gradeId) return false;
        if (filters.classroomId && e.classroomId !== filters.classroomId && e.classroomName !== filters.classroomId) return false;
        if (filters.status && e.status !== filters.status) return false;
        return true;
      });
    } catch {
      return [];
    }
  }

  public saveExamSchedule(
    exam: ExamSchedule,
    actor?: { role?: string; employeeId?: string; id?: string } | string
  ): { success: boolean; message?: string } {
    const classroomId = exam.classroomId || exam.classroomName || '';
    if (actor) {
      const auth = this.validateTeacherClassroomAuthorization(actor, classroomId, exam.subjectId);
      if (!auth.authorized) {
        return { success: false, message: auth.reason };
      }
    }

    const list = this.getExamSchedules();
    const idx = list.findIndex(e => e.id === exam.id);
    const now = getCairoNowISO();

    const canonicalExamDate = exam.examDate || exam.date || '';
    const canonicalAcademicYearId = exam.academicYearId || exam.academicYear || '2026-2027';
    const canonicalTermId = exam.termId || exam.term || 'TERM-1';

    const prepared: ExamSchedule = {
      ...exam,
      id: exam.id || generateSecureId('EXM'),
      academicYearId: canonicalAcademicYearId,
      termId: canonicalTermId,
      examDate: canonicalExamDate,
      date: canonicalExamDate,
      academicYear: canonicalAcademicYearId,
      term: canonicalTermId,
      status: exam.status || 'DRAFT',
      createdAt: exam.createdAt || now,
      updatedAt: now,
    };

    if (idx >= 0) {
      list[idx] = prepared;
    } else {
      list.unshift(prepared);
    }

    localStorage.setItem(STORAGE_KEYS.EXAM_SCHEDULES, JSON.stringify(list));
    return { success: true, message: 'تم حفظ موعد الامتحان بنجاح' };
  }

  public deleteExamSchedule(id: string): { success: boolean } {
    const list = this.getExamSchedules().filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.EXAM_SCHEDULES, JSON.stringify(list));
    return { success: true };
  }

  // ============================================================================
  // 14. STUDENT READ-ONLY ACCESS (SECURE ACCESS TOKEN / QR)
  // ============================================================================

  public getStudentAccessTokens(): StudentAccessToken[] {
    const raw = localStorage.getItem(STORAGE_KEYS.STUDENT_ACCESS_TOKENS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public async revokeStudentAccessToken(studentIdOrToken: string): Promise<{ success: boolean; message?: string }> {
    const tokens = this.getStudentAccessTokens();
    let found = false;
    tokens.forEach(t => {
      if (t.studentId === studentIdOrToken || t.token === studentIdOrToken || t.id === studentIdOrToken) {
        t.isActive = false;
        t.revokedAt = getCairoNowISO();
        found = true;
      }
    });
    if (found) {
      localStorage.setItem(STORAGE_KEYS.STUDENT_ACCESS_TOKENS, JSON.stringify(tokens));
    }

    // Authoritative backend revocation
    try {
      const res = await storageService.pushPostDirect('revokeStudentAccessToken', { studentId: studentIdOrToken });
      return res;
    } catch {
      return { success: true, message: 'تم إيقاف صلاحية رمز الوصول بنجاح' };
    }
  }

  public async issueStudentAccessTokenAuthoritative(studentId: string): Promise<{ success: boolean; token?: string; message?: string }> {
    const students = storageService.getStudents();
    const student = students.find(s => s.id === studentId || s.studentCode === studentId);
    if (!student) {
      return { success: false, message: 'بيانات الطالب غير موجودة' };
    }

    // Try authoritative backend generation
    try {
      const res = await storageService.pushPostDirect('issueStudentAccessToken', { studentId: student.id });
      if (res && res.success && res.rawToken) {
        const tokenHash = await hashPin(res.rawToken, '');
        const newToken: StudentAccessToken = {
          id: `SAT-${Date.now()}`,
          studentId: student.id,
          studentCode: student.studentCode || student.id,
          token: res.rawToken,
          tokenHash,
          isActive: true,
          createdAt: getCairoNowISO(),
        };
        const list = this.getStudentAccessTokens().filter(t => t.studentId !== student.id);
        list.push(newToken);
        localStorage.setItem(STORAGE_KEYS.STUDENT_ACCESS_TOKENS, JSON.stringify(list));
        return { success: true, token: res.rawToken };
      }
    } catch (e) {
      console.warn('Backend issueStudentAccessToken failed, generating with local hash...', e);
    }

    // Fallback generation with local hash
    const local = this.generateStudentAccessToken(student.id, student.studentCode || student.id);
    return { success: true, token: local.token };
  }

  public generateStudentAccessToken(studentId: string, studentCode: string): StudentAccessToken {
    const list = this.getStudentAccessTokens();
    const token = generateRandomToken(36);
    const now = getCairoNowISO();

    const newToken: StudentAccessToken = {
      id: `SAT-${Date.now()}`,
      studentId,
      studentCode,
      token,
      isActive: true,
      createdAt: now,
    };

    // Remove older active token for this student
    const updated = list.filter(t => t.studentId !== studentId);
    updated.push(newToken);
    localStorage.setItem(STORAGE_KEYS.STUDENT_ACCESS_TOKENS, JSON.stringify(updated));
    return newToken;
  }

  public async getStudentPublicPortalData(tokenString: string): Promise<{
    success: boolean;
    student?: any;
    classroom?: string;
    grade?: string;
    schedule?: ScheduleItem[];
    exams?: ExamSchedule[];
    homeworks?: Homework[];
    resources?: TeacherLessonResource[];
    message?: string;
  }> {
    const cleanToken = (tokenString || '').trim();
    if (!cleanToken) {
      return { success: false, message: 'رمز الوصول للجدول المدرسي غير موجود' };
    }

    const settings = storageService.getSettings();
    const scriptUrl = settings.googleAppsScriptUrl;

    // 1. Try Authoritative Backend Public Portal Gateway
    if (scriptUrl && scriptUrl.length > 15 && navigator.onLine) {
      try {
        const response = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'getStudentPublicPortalData',
            token: cleanToken,
          }),
        });

        if (response.ok) {
          const res = await response.json();
          if (res.status === 'success') {
            return {
              success: true,
              student: res.student,
              classroom: res.classroom,
              grade: res.grade,
              schedule: res.schedule || [],
              exams: res.exams || [],
              homeworks: res.homeworks || [],
              resources: res.resources || [],
            };
          } else if (res.status === 'error') {
            return { success: false, message: res.message || 'رمز الدخول غير صالح' };
          }
        }
      } catch (err) {
        console.warn('Backend student public portal request failed, using sanitized local data...', err);
      }
    }

    // 2. Local Fallback Sanitized Data
    return this.getStudentTimetableData(cleanToken);
  }

  public getStudentTimetableData(tokenString: string): {
    success: boolean;
    student?: any;
    classroom?: string;
    grade?: string;
    schedule?: ScheduleItem[];
    exams?: ExamSchedule[];
    homeworks?: Homework[];
    resources?: TeacherLessonResource[];
    message?: string;
  } {
    if (!tokenString) {
      return { success: false, message: 'رمز الوصول للجدول المدرسي غير موجود' };
    }

    const tokens = this.getStudentAccessTokens();
    const match = tokens.find(t => t.token === tokenString && t.isActive);
    if (!match) {
      return { success: false, message: 'رمز الدخول غير صالح أو تم إيقافه' };
    }

    const students = storageService.getStudents();
    const student = students.find(s => s.id === match.studentId || s.studentCode === match.studentCode);
    if (!student) {
      return { success: false, message: 'بيانات الطالب غير موجودة' };
    }

    // Read-only sanitized data: ONLY schedule, published exams, published homework, published student resources
    const allSchedule = storageService.getSchedule();
    const classroom = student.classroom;
    const grade = student.grade;

    const studentSchedule = allSchedule.filter(
      s => (s.classroom === classroom || s.classroomId === classroom) && s.isActive !== false && !s.isCancelled
    );

    const exams = this.getExamSchedules({ status: 'Published' }).filter(
      e => (!e.gradeId || e.gradeId === grade || e.gradeName === grade) &&
           (!e.classroomId || e.classroomId === classroom || e.classroomName === classroom)
    );

    const homeworks = this.getHomeworks({ status: 'Published' }).filter(
      h => (h.classroom === classroom || h.classroomId === classroom) && h.isVisibleToStudent !== false
    );

    const allResources = this.getTeacherLessonResources();
    const resources = allResources
      .filter(r => (r.classroomId === classroom) && r.visibility === 'Published' && r.studentResourceUrl)
      .map(r => ({
        ...r,
        preparationUrl: undefined, // Strip private preparation notes
        teacherNotes: undefined,
      }));

    // Update last access
    match.lastAccessedAt = getCairoNowISO();
    localStorage.setItem(STORAGE_KEYS.STUDENT_ACCESS_TOKENS, JSON.stringify(tokens));

    return {
      success: true,
      student: {
        id: student.id,
        studentCode: student.studentCode,
        fullName: student.name,
        grade: student.grade,
        classroom: student.classroom,
      },
      classroom,
      grade,
      schedule: studentSchedule,
      exams,
      homeworks,
      resources,
    };
  }

  public verifyStudentAccessToken(tokenString: string): StudentAccessToken | null {
    const tokens = this.getStudentAccessTokens();
    const match = tokens.find(t => t.token === tokenString && t.isActive);
    return match || null;
  }

  public getOrCreateStudentToken(student: Student): StudentAccessToken {
    const tokens = this.getStudentAccessTokens();
    const existing = tokens.find(t => t.studentId === student.id && t.isActive);
    if (existing) return existing;
    return this.generateStudentAccessToken(student.id, student.studentCode || student.id);
  }

  public getAllTeachersLoadCalculations(): TeacherLoadCalculation[] {
    const teachers = this.getTeachingStaff();
    return teachers.map(t => this.calculateTeacherLoad(t.id));
  }

  public getAllTeacherAssignments(): TeacherTeachingAssignment[] {
    return this.getTeacherAssignments();
  }

  public getTeacherWeeklySchedule(teacherId: string): ScheduleItem[] {
    const all = storageService.getSchedule();
    return all.filter(s => s.teacherId === teacherId && s.isActive !== false);
  }

  public validateSupervisionConflict(
    teacherIdOrParams:
      | string
      | {
          teacherId: string;
          date: string;
          dayOfWeek?: string;
          timeSlot?: string;
          shift?: string;
          periodNumber?: number;
        },
    dateParam?: string,
    shiftParam?: string,
    periodParam?: number
  ): { hasConflict: boolean; reason?: string } {
    let teacherId = '';
    let date = '';
    let shift = '';
    let timeSlot = '';
    let periodNumber: number | undefined;
    let dayOfWeek = '';

    if (typeof teacherIdOrParams === 'object') {
      teacherId = teacherIdOrParams.teacherId;
      date = teacherIdOrParams.date;
      shift = teacherIdOrParams.shift || '';
      timeSlot = teacherIdOrParams.timeSlot || '';
      periodNumber = teacherIdOrParams.periodNumber;
      dayOfWeek = teacherIdOrParams.dayOfWeek || '';
    } else {
      teacherId = teacherIdOrParams;
      date = dateParam || '';
      shift = shiftParam || '';
      periodNumber = periodParam;
    }

    if (!dayOfWeek && date) {
      const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      const dt = new Date(date);
      if (!isNaN(dt.getTime())) {
        dayOfWeek = days[dt.getDay()];
      }
    }

    // 1. Prevent teacher double booking in supervision
    const list = this.getSupervisionAssignments({ date });
    const match = list.find(
      s =>
        s.teacherId === teacherId &&
        s.status !== 'Cancelled' &&
        ((shift && s.shift === shift) ||
          (timeSlot && s.timeSlot === timeSlot) ||
          (periodNumber && s.periodNumber === periodNumber) ||
          (!shift && !timeSlot && !periodNumber))
    );
    if (match) {
      return {
        hasConflict: true,
        reason: `المعلم معين بالفعل في الإشراف (${match.shift || match.timeSlot || 'نفس اليوم'}) بموقع: ${match.locationName}`,
      };
    }

    // 2. Prevent teacher having lesson at supervision time
    const schedule = storageService.getSchedule();
    const lessonConflict = schedule.find(s => {
      if (s.teacherId !== teacherId || s.isActive === false || s.isCancelled) return false;
      const sameDay = dayOfWeek && (s.dayOfWeek === dayOfWeek || s.dayName === dayOfWeek);
      if (!sameDay) return false;
      if (periodNumber && s.periodNumber === periodNumber) return true;
      if (timeSlot && s.periodNumber && timeSlot.includes(s.periodNumber.toString())) return true;
      return false;
    });
    if (lessonConflict) {
      return {
        hasConflict: true,
        reason: `تعارض مع جدول الحصص: المعلم لديه حصة دراسية مجدولة (${lessonConflict.subject} - ${lessonConflict.classroom}) في نفس توقيت الإشراف.`,
      };
    }

    // 3. Prevent teacher having reserve substitution at supervision time
    const subs = storageService.getSubstitutions();
    const subConflict = subs.find(s => {
      if (s.substituteTeacherId !== teacherId || s.status === 'CANCELLED') return false;
      if (s.date !== date) return false;
      if (periodNumber && s.periodNumber === periodNumber) return true;
      return false;
    });
    if (subConflict) {
      return {
        hasConflict: true,
        reason: `تعارض مع حصص الاحتياطي: المعلم مسند إليه حصة احتياطي بالفصل (${subConflict.classroom}) في نفس توقيت الإشراف.`,
      };
    }

    return { hasConflict: false };
  }

  public saveScheduleBreaks(breaks: ScheduleBreak[]): void {
    localStorage.setItem(STORAGE_KEYS.SCHEDULE_BREAKS, JSON.stringify(breaks));
    storageService.notifyChange();
  }

  // ============================================================================
  // 15. TIMETABLE IMPORT WIZARD & PARSER
  // ============================================================================

  public parseAndValidateImportData(rawRows: any[]): TimetableImportSummary {
    const batchId = `BATCH-${Date.now()}`;
    const rows: TimetableImportRow[] = [];
    const unknownTeacherCodesSet = new Set<string>();
    const unknownSubjectsSet = new Set<string>();
    const unknownClassroomsSet = new Set<string>();
    let conflictsFound = 0;
    let loadWarningsFound = 0;

    const existingSchedule = storageService.getSchedule();
    const subjects = storageService.getSubjects();
    const existingClasses = new Set(existingSchedule.map(s => s.classroom).filter(Boolean));

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const day = (row['اليوم'] || row['Day'] || row['dayOfWeek'] || '').toString().trim();
      const period = parseInt(row['الحصة'] || row['Period'] || row['periodNumber'] || '0', 10);
      const grade = (row['الصف'] || row['Grade'] || row['grade'] || '').toString().trim();
      const classroom = (row['الفصل'] || row['Classroom'] || row['classroom'] || '').toString().trim();
      const subject = (row['المادة'] || row['Subject'] || row['subject'] || '').toString().trim();
      const teacherCode = (row['كود المعلم'] || row['TeacherCode'] || row['teacherCode'] || '').toString().trim();
      const teacherName = (row['اسم المعلم'] || row['TeacherName'] || row['teacherName'] || '').toString().trim();
      const room = (row['القاعة'] || row['المعمل'] || row['Room'] || row['room'] || '').toString().trim();
      const cycle = (row['أسبوع الخطة'] || row['Cycle'] || row['cycleWeek'] || 'ALL').toString().trim().toUpperCase();

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!day) errors.push('اليوم مطلوب');
      if (!period || period < 1 || period > 10) errors.push('رقم الحصة غير صالح');
      if (!classroom) errors.push('الفصل مطلوب');
      if (!subject) errors.push('المادة مطلوبة');
      if (!teacherCode) errors.push('كود المعلم مطلوب للربط والمطابقة');

      // Resolve Teacher
      let teacher: Employee | undefined;
      if (teacherCode) {
        teacher = this.findTeacherByCode(teacherCode);
        if (!teacher) {
          errors.push(`كود المعلم (${teacherCode}) غير مسجل في قاعدة المعلمين`);
          unknownTeacherCodesSet.add(teacherCode);
        }
      }

      // Resolve Subject
      const matchSubject = subjects.find(
        s => s.name.trim().toLowerCase() === subject.toLowerCase() || (s.shortName && s.shortName.toLowerCase() === subject.toLowerCase()) || s.id === subject
      );
      if (!matchSubject) {
        warnings.push(`المادة (${subject}) غير مسجلة في المواد المعيارية`);
        unknownSubjectsSet.add(subject);
      }

      // Check conflict if basic data is present
      if (errors.length === 0 && teacher) {
        const dummyItem: ScheduleItem = {
          id: `TEMP-${rowNum}`,
          grade: grade || 'الصف الأول',
          classroom,
          dayOfWeek: day,
          periodNumber: period,
          startTime: '',
          endTime: '',
          subject,
          teacherId: teacher.id,
          teacherName: teacher.name,
          teacherCode: teacher.teacherCode,
          room,
          cycleWeek: cycle === 'A' || cycle === 'B' ? cycle : 'ALL',
        };

        const conflictRes = this.validateScheduleConflicts(dummyItem, existingSchedule);
        if (conflictRes.hasConflict) {
          conflictsFound += conflictRes.conflicts.length;
          errors.push(...conflictRes.conflicts);
        }
        if (conflictRes.warnings.length > 0) {
          loadWarningsFound += conflictRes.warnings.length;
          warnings.push(...conflictRes.warnings);
        }
      }

      const isValid = errors.length === 0;

      rows.push({
        rowNumber: rowNum,
        dayOfWeek: day,
        periodNumber: period,
        gradeName: grade,
        classroomName: classroom,
        subjectName: subject,
        teacherCode,
        teacherName: teacher?.name || teacherName,
        roomName: room,
        cycleWeek: cycle === 'A' || cycle === 'B' ? cycle : 'ALL',
        isValid,
        errors,
        warnings,
        resolvedTeacherId: teacher?.id,
        resolvedSubjectId: matchSubject?.id,
      });
    });

    const validRowsCount = rows.filter(r => r.isValid).length;
    const invalidRowsCount = rows.length - validRowsCount;

    return {
      batchId,
      totalRows: rows.length,
      validRowsCount,
      invalidRowsCount,
      unknownTeacherCodes: Array.from(unknownTeacherCodesSet),
      unknownSubjects: Array.from(unknownSubjectsSet),
      unknownClassrooms: Array.from(unknownClassroomsSet),
      conflictsFound,
      loadWarningsFound,
      rows,
    };
  }

  public commitImportBatch(
    summary: TimetableImportSummary,
    options?: { createAssignments?: boolean }
  ): { success: boolean; importedCount: number; message: string } {
    const validRows = summary.rows.filter(r => r.isValid);
    if (validRows.length === 0) {
      return { success: false, importedCount: 0, message: 'لا توجد صفوف صالحة للاستيراد' };
    }

    const currentSchedule = storageService.getSchedule();
    const config = storageService.getScheduleConfig();
    const defaultDuration = config.defaultPeriodDurationMinutes || 50;

    let importedCount = 0;

    validRows.forEach(row => {
      const id = `SCH-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const periodTime = config.periods?.find(p => p.periodNumber === row.periodNumber);

      const newItem: ScheduleItem = {
        id,
        academicYear: '2026-2027',
        academicYearId: '2026-2027',
        grade: row.gradeName || 'الصف الأول',
        gradeId: row.resolvedGradeId,
        classroom: row.classroomName,
        classroomId: row.classroomName,
        dayOfWeek: row.dayOfWeek,
        dayName: row.dayOfWeek,
        periodNumber: row.periodNumber,
        startTime: periodTime?.startTime || '08:00',
        endTime: periodTime?.endTime || '08:50',
        subject: row.subjectName,
        subjectId: row.resolvedSubjectId,
        teacherId: row.resolvedTeacherId || '',
        teacherName: row.teacherName,
        teacherCode: row.teacherCode,
        room: row.roomName,
        roomId: row.roomName,
        cycleWeek: row.cycleWeek || 'ALL',
        isActive: true,
        isCancelled: false,
        createdAt: getCairoNowISO(),
      };

      currentSchedule.push(newItem);
      importedCount++;

      // Optionally auto-create teaching assignments
      if (options?.createAssignments && row.resolvedTeacherId) {
        const assignments = this.getTeacherAssignments(row.resolvedTeacherId);
        const existing = assignments.find(
          a => (a.classroomId === row.classroomName || a.classroomName === row.classroomName) &&
               (a.subjectId === row.resolvedSubjectId || a.subjectName === row.subjectName)
        );
        if (!existing) {
          this.saveTeacherAssignment({
            id: `TTA-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            teacherId: row.resolvedTeacherId,
            teacherCode: row.teacherCode,
            teacherName: row.teacherName,
            subjectId: row.resolvedSubjectId || row.subjectName,
            subjectName: row.subjectName,
            gradeId: row.resolvedGradeId || row.gradeName,
            gradeName: row.gradeName,
            classroomId: row.classroomName,
            classroomName: row.classroomName,
            academicYearId: '2026-2027',
            requiredPeriodsPerWeek: row.cycleWeek === 'A' || row.cycleWeek === 'B' ? 0.5 : 1,
            isActive: true,
          });
        }
      }
    });

    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(currentSchedule));
    storageService.notifyChange();

    return {
      success: true,
      importedCount,
      message: `تم استيراد وإدراج ${importedCount} حصة دراسية بنجاح في جدول المدرسة`,
    };
  }
}

export const timetableService = new TimetableService();
