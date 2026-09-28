import {
  CurriculumMasterPlan,
  CurriculumPlanItem,
  CurriculumLessonDistribution,
  CurriculumProgressSummary,
  ScheduleItem,
  User,
  Employee,
} from '../types';
import { storageService } from './storageService';
import { timetableService } from './timetableService';

export class CurriculumPlanService {
  /**
   * Parse uploaded plan document (PDF, DOCX, XLSX text or sheet structure)
   * into structured Plan Items without assuming a rigid layout if the file doesn't have it.
   */
  public parseDocumentToPlanItems(content: {
    rawText?: string;
    tableRows?: Array<Record<string, any>>;
  }): CurriculumPlanItem[] {
    const items: CurriculumPlanItem[] = [];

    // 1. Structured table rows (from XLSX / CSV)
    if (content.tableRows && content.tableRows.length > 0) {
      content.tableRows.forEach((row, index) => {
        const week =
          Number(
            row['الأسبوع'] ||
              row['الاسبوع'] ||
              row['Week'] ||
              row['week'] ||
              Math.ceil((index + 1) / 3)
          ) || 1;
        const unit =
          String(
            row['الوحدة'] ||
              row['المحور'] ||
              row['Unit'] ||
              row['unit'] ||
              `الوحدة ${Math.ceil((index + 1) / 4)}`
          ).trim();
        const lessonTitle =
          String(
            row['عنوان الدرس'] ||
              row['الدرس'] ||
              row['الموضوع'] ||
              row['Lesson'] ||
              row['Topic'] ||
              row['title'] ||
              `موضوع الدرس ${index + 1}`
          ).trim();
        const objectives = row['الأهداف'] || row['الاهداف'] || row['Objectives'] || '';
        const resources = row['المصادر'] || row['الوسائل'] || row['Resources'] || '';
        const assessment = row['التقويم'] || row['Assessment'] || '';
        const estimatedPeriods =
          Number(row['عدد الحصص'] || row['الحصص'] || row['Periods'] || 1) || 1;
        const notes = row['ملاحظات'] || row['Notes'] || '';

        items.push({
          id: `ITEM-${Date.now()}-${index + 1}`,
          planId: '',
          week,
          unit,
          lessonTitle,
          objectives: objectives ? String(objectives).trim() : undefined,
          resources: resources ? String(resources).trim() : undefined,
          assessment: assessment ? String(assessment).trim() : undefined,
          estimatedPeriods,
          notes: notes ? String(notes).trim() : undefined,
          order: index + 1,
        });
      });
      return items;
    }

    // 2. Raw Text parsing (from PDF / DOCX text extracts)
    if (content.rawText) {
      const lines = content.rawText
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

      let currentWeek = 1;
      let currentUnit = 'الوحدة الأولى';
      let order = 1;

      lines.forEach(line => {
        // Look for week pattern: الأسبوع 1 or Week 1
        const weekMatch = line.match(/(?:الأسبوع|الاسبوع|Week)\s*(\d{1,2})/i);
        if (weekMatch) {
          currentWeek = Number(weekMatch[1]);
          return;
        }

        // Look for Unit pattern: الوحدة الأولى or Unit 1
        const unitMatch = line.match(/(?:الوحدة|المحور|Unit)\s*([\u0621-\u064A\w\s]+)/i);
        if (unitMatch && line.length < 50) {
          currentUnit = unitMatch[0].trim();
          return;
        }

        // If line contains lesson or topic content
        if (line.length >= 3 && !line.startsWith('#') && !line.startsWith('---')) {
          items.push({
            id: `ITEM-${Date.now()}-${order}`,
            planId: '',
            week: currentWeek,
            unit: currentUnit,
            lessonTitle: line.replace(/^[\d\-.*•\s]+/, '').trim(),
            estimatedPeriods: 1,
            order,
          });
          order++;
        }
      });
    }

    return items;
  }

  /**
   * Filter curriculum plans according to teacher assignments:
   * A Teacher only sees plans for subjects and classes they are scheduled to teach.
   * Curriculum Admin / Admin sees all school plans.
   */
  public getAuthorizedPlansForUser(user: User | null, teacher?: Employee | null): CurriculumMasterPlan[] {
    const allPlans = storageService.getCurriculumPlans(user?.schoolId);
    if (!user) return [];

    const isSupervisor =
      user.role === 'Admin' ||
      user.role === 'SchoolDirector' ||
      user.role === 'TeacherAffairs' ||
      (user.permissions && user.permissions.includes('settings.manage' as any));

    if (isSupervisor) {
      return allPlans;
    }

    // Identify teacher's assigned subjects & grades from active schedule
    const teacherId = user.employeeId || teacher?.id || user.id;
    const teacherSchedule = timetableService.getTeacherWeeklySchedule(teacherId);

    const assignedSubjects = new Set<string>();
    const assignedGrades = new Set<string>();

    teacherSchedule.forEach(item => {
      if (item.subject) assignedSubjects.add(item.subject.trim().toLowerCase());
      if (item.grade) assignedGrades.add(item.grade.trim().toLowerCase());
    });

    // Also match teacher subject if present on employee record
    if (teacher?.specialization) {
      assignedSubjects.add(teacher.specialization.trim().toLowerCase());
    }

    return allPlans.filter(plan => {
      const planSub = plan.subject.trim().toLowerCase();
      const planGrade = plan.grade.trim().toLowerCase();
      return assignedSubjects.has(planSub) && assignedGrades.has(planGrade);
    });
  }

  /**
   * Link Plan Item to a Schedule Lesson
   */
  public linkPlanItemToSchedule(params: {
    planId: string;
    planItemId: string;
    scheduleItemId: string;
    targetDate?: string;
    notes?: string;
    user?: User | null;
  }): { success: boolean; distribution?: CurriculumLessonDistribution; message: string } {
    const plan = storageService.getCurriculumPlanById(params.planId);
    if (!plan) return { success: false, message: 'خطة المنهج غير موجودة' };

    if (plan.status !== 'Approved') {
      return { success: false, message: 'لا يمكن ربط الحصص إلا بخطة منهج معتمدة.' };
    }

    const planItem = plan.items.find(i => i.id === params.planItemId);
    if (!planItem) return { success: false, message: 'عنصر الخطة غير موجود' };

    const schedule = storageService.getSchedule();
    const lesson = schedule.find(s => s.id === params.scheduleItemId);
    if (!lesson) return { success: false, message: 'حصة الجدول المحددة غير موجودة' };

    const normalize = (value?: string) => String(value || '').trim().toLowerCase();
    if (normalize(lesson.subject) !== normalize(plan.subject) || normalize(lesson.grade) !== normalize(plan.grade)) {
      return { success: false, message: 'لا يمكن ربط الخطة بهذه الحصة: المادة أو الصف لا يطابقان خطة المنهج.' };
    }
    if (params.user?.schoolId && plan.schoolId && params.user.schoolId !== plan.schoolId) {
      return { success: false, message: 'لا يمكن ربط خطة تابعة لمدرسة أخرى.' };
    }
    if (params.user?.role === 'Teacher') {
      const actorTeacherId = params.user.employeeId || params.user.id;
      if (!lesson.teacherId || lesson.teacherId !== actorTeacherId) {
        return { success: false, message: 'لا يمكن للمعلم ربط الخطة بحصة مسندة إلى معلم آخر.' };
      }
    }

    const teacherId = lesson.teacherId || params.user?.employeeId || params.user?.id;
    if (!teacherId) return { success: false, message: 'لا يمكن ربط الخطة بحصة بدون معلم مسند.' };
    const teacherName = lesson.teacherName || params.user?.fullName || params.user?.username;

    // Check if item is already linked to this schedule slot
    const existingDists = storageService.getCurriculumDistributions(plan.schoolId);
    const alreadyLinked = existingDists.find(
      d =>
        d.planItemId === params.planItemId &&
        d.scheduleItemId === params.scheduleItemId &&
        d.status !== 'Cancelled'
    );

    if (alreadyLinked) {
      return {
        success: true,
        distribution: alreadyLinked,
        message: 'عنصر الخطة مرتبط بالفعل بهذه الحصة',
      };
    }

    const occupiedByAnotherItem = existingDists.find(
      d => d.scheduleItemId === params.scheduleItemId && d.status !== 'Cancelled'
    );
    if (occupiedByAnotherItem) {
      return {
        success: false,
        distribution: occupiedByAnotherItem,
        message: 'هذه الحصة مرتبطة بالفعل بموضوع آخر من خطة المنهج. ألغِ الربط الحالي أولاً.',
      };
    }

    const res = storageService.saveCurriculumDistribution(
      {
        schoolId: plan.schoolId,
        planId: plan.id,
        planItemId: planItem.id,
        scheduleItemId: lesson.id,
        teacherId,
        teacherName,
        grade: lesson.grade,
        classroom: lesson.classroom,
        subject: lesson.subject,
        dayOfWeek: lesson.dayOfWeek,
        periodNumber: lesson.periodNumber,
        targetDate: params.targetDate,
        status: 'Planned',
        notes: params.notes,
      },
      params.user
    );

    return {
      success: res.success,
      distribution: res.data,
      message: res.message,
    };
  }

  /**
   * Automatically link the requested curriculum week to matching timetable slots.
   * Existing links are preserved and only exact school/subject/grade matches are used.
   */
  public autoLinkPlanWeekToSchedule(params: {
    planId: string;
    week: number;
    user?: User | null;
  }): { success: boolean; linked: number; skipped: number; message: string } {
    const plan = storageService.getCurriculumPlanById(params.planId);
    if (!plan) return { success: false, linked: 0, skipped: 0, message: 'خطة المنهج غير موجودة' };
    if (plan.status !== 'Approved') {
      return { success: false, linked: 0, skipped: 0, message: 'يجب اعتماد خطة المنهج قبل الربط التلقائي بالجدول.' };
    }
    if (!Number.isInteger(params.week) || params.week <= 0) {
      return { success: false, linked: 0, skipped: 0, message: 'رقم الأسبوع غير صالح' };
    }
    if (params.user?.schoolId && plan.schoolId && params.user.schoolId !== plan.schoolId) {
      return { success: false, linked: 0, skipped: 0, message: 'لا يمكن الوصول إلى خطة تابعة لمدرسة أخرى.' };
    }

    const normalize = (value?: string) => String(value || '').trim().toLowerCase();
    const actorTeacherId =
      params.user?.role === 'Teacher' ? (params.user.employeeId || params.user.id) : undefined;
    const existingDistributions = storageService
      .getCurriculumDistributions(plan.schoolId)
      .filter(d => d.status !== 'Cancelled');
    const occupiedScheduleIds = new Set(existingDistributions.map(d => d.scheduleItemId));
    const schoolWeekOrder = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayRank = (value?: string) => {
      const index = schoolWeekOrder.indexOf(String(value || '').trim());
      return index >= 0 ? index : schoolWeekOrder.length;
    };

    const slots = storageService.getSchedule()
      .filter(s =>
        s.isActive !== false &&
        !s.isCancelled &&
        !occupiedScheduleIds.has(s.id) &&
        (!plan.schoolId || !s.schoolId || s.schoolId === plan.schoolId) &&
        normalize(s.subject) === normalize(plan.subject) &&
        normalize(s.grade) === normalize(plan.grade) &&
        (!actorTeacherId || s.teacherId === actorTeacherId)
      )
      .sort((a, b) =>
        dayRank(a.dayOfWeek || a.dayName) - dayRank(b.dayOfWeek || b.dayName) ||
        Number(a.periodNumber || 0) - Number(b.periodNumber || 0)
      );

    const weekItems = plan.items
      .filter(i => Number(i.week) === params.week)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    if (weekItems.length === 0) {
      return { success: false, linked: 0, skipped: 0, message: 'لا توجد موضوعات مسجلة لهذا الأسبوع في خطة المنهج.' };
    }
    if (slots.length === 0) {
      return { success: false, linked: 0, skipped: 0, message: 'لا توجد حصص مطابقة للمادة والصف في الجدول الدراسي.' };
    }

    let linked = 0;
    let skipped = 0;
    let slotIndex = 0;
    for (const item of weekItems) {
      const requestedPeriods = Math.max(1, Number(item.estimatedPeriods || 1));
      for (let n = 0; n < requestedPeriods; n++) {
        const slot = slots[slotIndex++];
        if (!slot) {
          skipped += requestedPeriods - n;
          break;
        }
        const result = this.linkPlanItemToSchedule({
          planId: plan.id,
          planItemId: item.id,
          scheduleItemId: slot.id,
          user: params.user,
        });
        if (result.success) linked++; else skipped++;
      }
    }

    return {
      success: linked > 0,
      linked,
      skipped,
      message: skipped > 0
        ? `تم ربط ${linked} حصة، وتعذر ربط ${skipped} حصة لعدم كفاية الحصص المطابقة في الجدول.`
        : `تم ربط خطة الأسبوع تلقائيًا بـ ${linked} حصة في الجدول.`,
    };
  }

  /**
   * Calculate Progress Summary
   */
  public calculateProgress(filters?: {
    schoolId?: string;
    subject?: string;
    grade?: string;
    teacherId?: string;
    classroom?: string;
    term?: string;
  }): CurriculumProgressSummary {
    const plans = storageService.getCurriculumPlans(filters?.schoolId).filter(p => {
      if (filters?.subject && p.subject !== filters.subject) return false;
      if (filters?.grade && p.grade !== filters.grade) return false;
      if (filters?.term && p.term !== filters.term) return false;
      return true;
    });

    let totalItems = 0;
    const allItemIds = new Set<string>();
    plans.forEach(p => {
      p.items.forEach(item => {
        totalItems++;
        allItemIds.add(item.id);
      });
    });

    const dists = storageService.getCurriculumDistributions(filters?.schoolId).filter(d => {
      if (filters?.subject && d.subject !== filters.subject) return false;
      if (filters?.grade && d.grade !== filters.grade) return false;
      if (filters?.teacherId && d.teacherId !== filters.teacherId) return false;
      if (filters?.classroom && d.classroom !== filters.classroom) return false;
      return true;
    });

    const plannedCount = dists.filter(d => d.status === 'Planned').length;
    const deliveredCount = dists.filter(d => d.status === 'Delivered').length;
    const deferredCount = dists.filter(d => d.status === 'Deferred').length;
    const cancelledCount = dists.filter(d => d.status === 'Cancelled').length;

    const assignedItemIds = new Set(dists.filter(d => d.status !== 'Cancelled').map(d => d.planItemId));
    const unassignedCount = Math.max(0, totalItems - assignedItemIds.size);

    const completionRate = totalItems > 0 ? Math.round((deliveredCount / totalItems) * 100) : 0;

    return {
      totalItems,
      plannedCount,
      deliveredCount,
      deferredCount,
      cancelledCount,
      unassignedCount,
      completionRate,
    };
  }
}

export const curriculumPlanService = new CurriculumPlanService();
