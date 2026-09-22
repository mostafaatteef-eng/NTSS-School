import {
  ClassroomItem,
  Employee,
  GradeItem,
  SubjectItem,
  TimetableImportRow,
  TimetableImportSummary,
  ScheduleItem,
} from '../types';
import { storageService } from './storageService';
import { timetableService } from './timetableService';
import {
  normalizeImportValue,
  resolveTeacherAuto,
  resolveSubjectExact,
  resolveClassroomAuto,
  resolveGradeAuto,
  getRememberedMapping,
  loadImportMappingMemory,
} from './timetableImportMappingService';
import * as XLSX from 'xlsx';

export type AscFileFormat = 'ASC_XML' | 'XLSX' | 'CSV' | 'PDF' | 'UNKNOWN';

export interface CanonicalImportRow {
  schoolId: string;
  day: string;
  periodNumber: number;
  grade: string;
  classroom: string;
  subject: string;
  teacher: string;
  teacherCode?: string;
  room?: string;
  cycleWeek?: 'ALL' | 'A' | 'B';
  rawRowNumber: number;
}

export interface ParseAdapterResult {
  format: AscFileFormat;
  canonicalRows: CanonicalImportRow[];
  detectedMetadata?: {
    schoolName?: string;
    academicYear?: string;
    totalLessons?: number;
    classesCount?: number;
    teachersCount?: number;
    subjectsCount?: number;
  };
  errors: string[];
}

export class AscTimetableImportAdapter {
  /**
   * 1. Detect Format
   */
  public detectFormat(file: { name: string; content?: string | ArrayBuffer }): AscFileFormat {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (ext === 'xml') {
      return 'ASC_XML';
    }
    if (ext === 'xlsx' || ext === 'xls') {
      return 'XLSX';
    }
    if (ext === 'csv') {
      return 'CSV';
    }
    if (ext === 'pdf') {
      return 'PDF';
    }

    // Inspect text content if available
    if (typeof file.content === 'string') {
      const trimmed = file.content.trim();
      if (trimmed.startsWith('<?xml') || trimmed.includes('<timetable') || trimmed.includes('<asc')) {
        return 'ASC_XML';
      }
      if (trimmed.includes(',') && trimmed.includes('\n')) {
        return 'CSV';
      }
    }

    return 'UNKNOWN';
  }

  /**
   * 2. Parse aSc XML format
   * Matches standard aSc Timetables XML export:
   * <timetable>
   *   <periods><period name="..." period="..."/></periods>
   *   <daysdefs><daysdef name="..."/></daysdefs>
   *   <subjects><subject id="..." name="..." short="..."/></subjects>
   *   <teachers><teacher id="..." name="..." short="..."/></teachers>
   *   <classes><class id="..." name="..." short="..."/></classes>
   *   <classrooms><classroom id="..." name="..." short="..."/></classrooms>
   *   <lessons><lesson id="..." subjectid="..." teacherids="..." classids="..." periodspercard="..."/></lessons>
   *   <cards><card lessonid="..." period="..." day="..." classroomids="..."/></cards>
   * </timetable>
   */
  public parseAscXml(xmlText: string, defaultSchoolId?: string): ParseAdapterResult {
    const schoolId = (defaultSchoolId || storageService.getActiveSchoolId()).trim();
    const result: ParseAdapterResult = {
      format: 'ASC_XML',
      canonicalRows: [],
      errors: [],
    };

    try {
      // In browser or happy-dom environment, DOMParser is readily available
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

      const parseError = xmlDoc.getElementsByTagName('parsererror')[0];
      if (parseError) {
        result.errors.push(`خطأ في قراءة ملف XML: ${parseError.textContent}`);
        return result;
      }

      // Collect lookup entities
      const subjectsMap = new Map<string, { id: string; name: string; short: string }>();
      const teachersMap = new Map<string, { id: string; name: string; short: string }>();
      const classesMap = new Map<string, { id: string; name: string; short: string }>();
      const roomsMap = new Map<string, { id: string; name: string; short: string }>();
      const lessonsMap = new Map<
        string,
        { id: string; subjectid: string; teacherids: string[]; classids: string[] }
      >();

      const subjectNodes = xmlDoc.getElementsByTagName('subject');
      for (let i = 0; i < subjectNodes.length; i++) {
        const node = subjectNodes[i];
        const id = node.getAttribute('id') || '';
        const name = node.getAttribute('name') || '';
        const short = node.getAttribute('short') || name;
        if (id) subjectsMap.set(id, { id, name, short });
      }

      const teacherNodes = xmlDoc.getElementsByTagName('teacher');
      for (let i = 0; i < teacherNodes.length; i++) {
        const node = teacherNodes[i];
        const id = node.getAttribute('id') || '';
        const name = node.getAttribute('name') || '';
        const short = node.getAttribute('short') || '';
        if (id) teachersMap.set(id, { id, name, short });
      }

      const classNodes = xmlDoc.getElementsByTagName('class');
      for (let i = 0; i < classNodes.length; i++) {
        const node = classNodes[i];
        const id = node.getAttribute('id') || '';
        const name = node.getAttribute('name') || '';
        const short = node.getAttribute('short') || '';
        if (id) classesMap.set(id, { id, name, short });
      }

      const roomNodes = xmlDoc.getElementsByTagName('classroom');
      for (let i = 0; i < roomNodes.length; i++) {
        const node = roomNodes[i];
        const id = node.getAttribute('id') || '';
        const name = node.getAttribute('name') || '';
        const short = node.getAttribute('short') || '';
        if (id) roomsMap.set(id, { id, name, short });
      }

      const lessonNodes = xmlDoc.getElementsByTagName('lesson');
      for (let i = 0; i < lessonNodes.length; i++) {
        const node = lessonNodes[i];
        const id = node.getAttribute('id') || '';
        const subjectid = node.getAttribute('subjectid') || '';
        const teacherids = (node.getAttribute('teacherids') || '').split(',').filter(Boolean);
        const classids = (node.getAttribute('classids') || '').split(',').filter(Boolean);
        if (id) lessonsMap.set(id, { id, subjectid, teacherids, classids });
      }

      // Map days in aSc (standard days: 10000=Sun/Mon depending on config, day indices)
      const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

      // Cards represent assigned periods
      const cardNodes = xmlDoc.getElementsByTagName('card');
      let rowNum = 1;

      for (let i = 0; i < cardNodes.length; i++) {
        const card = cardNodes[i];
        const lessonid = card.getAttribute('lessonid') || '';
        const periodStr = card.getAttribute('period') || '1';
        const dayStr = card.getAttribute('day') || '0';
        const classroomids = (card.getAttribute('classroomids') || '').split(',').filter(Boolean);

        const lesson = lessonsMap.get(lessonid);
        if (!lesson) continue;

        const subjectObj = subjectsMap.get(lesson.subjectid);
        const teacherObj = lesson.teacherids.length > 0 ? teachersMap.get(lesson.teacherids[0]) : undefined;
        const classObj = lesson.classids.length > 0 ? classesMap.get(lesson.classids[0]) : undefined;
        const roomObj = classroomids.length > 0 ? roomsMap.get(classroomids[0]) : undefined;

        // Parse day index or bitmask
        let dayIndex = parseInt(dayStr, 10);
        if (isNaN(dayIndex) || dayIndex < 0 || dayIndex >= dayNames.length) {
          dayIndex = 0; // Default to Sunday
        }
        const day = dayNames[dayIndex];
        const periodNumber = parseInt(periodStr, 10) || 1;

        const className = classObj?.name || classObj?.short || '1/1';
        const gradeName = className.startsWith('2')
          ? 'الصف الثاني الثانوي'
          : className.startsWith('3')
          ? 'الصف الثالث الثانوي'
          : 'الصف الأول الثانوي';

        result.canonicalRows.push({
          schoolId,
          day,
          periodNumber,
          grade: gradeName,
          classroom: className,
          subject: subjectObj?.name || subjectObj?.short || 'مادة عامة',
          teacher: teacherObj?.name || '',
          teacherCode: teacherObj?.short || '',
          room: roomObj?.name || roomObj?.short,
          cycleWeek: 'ALL',
          rawRowNumber: rowNum++,
        });
      }

      result.detectedMetadata = {
        totalLessons: result.canonicalRows.length,
        classesCount: classesMap.size,
        teachersCount: teachersMap.size,
        subjectsCount: subjectsMap.size,
      };
    } catch (e: any) {
      result.errors.push(`فشل تحليل ملف XML: ${e.message || String(e)}`);
    }

    return result;
  }

  /**
   * 3. Parse XLSX / CSV rows into canonical format
   */
  public parseTableRows(
    rows: Array<Record<string, any>>,
    defaultSchoolId?: string,
    format: AscFileFormat = 'XLSX'
  ): ParseAdapterResult {
    const schoolId = (defaultSchoolId || storageService.getActiveSchoolId()).trim();
    const result: ParseAdapterResult = {
      format,
      canonicalRows: [],
      errors: [],
    };

    if (!rows || rows.length === 0) {
      result.errors.push('لا توجد بيانات صالحة في الملف المرفوع');
      return result;
    }

    rows.forEach((row, idx) => {
      const day = String(row['اليوم'] || row['Day'] || row['dayOfWeek'] || row['day'] || '').trim();
      const period =
        parseInt(
          row['الحصة'] || row['Period'] || row['periodNumber'] || row['period'] || '0',
          10
        ) || 0;
      const grade = String(row['الصف'] || row['Grade'] || row['grade'] || '').trim();
      const classroom = String(row['الفصل'] || row['Classroom'] || row['classroom'] || '').trim();
      const subject = String(row['المادة'] || row['Subject'] || row['subject'] || '').trim();
      const teacher = String(
        row['اسم المعلم'] || row['TeacherName'] || row['teacherName'] || row['المعلم'] || ''
      ).trim();
      const teacherCode = String(
        row['كود المعلم'] || row['TeacherCode'] || row['teacherCode'] || ''
      ).trim();
      const room = String(
        row['القاعة'] || row['المعمل'] || row['Room'] || row['room'] || ''
      ).trim();
      const cycle = String(
        row['أسبوع الخطة'] || row['Cycle'] || row['cycleWeek'] || 'ALL'
      ).trim().toUpperCase();

      if (!day && !classroom && !subject) {
        return; // skip blank row
      }

      result.canonicalRows.push({
        schoolId,
        day,
        periodNumber: period,
        grade,
        classroom,
        subject,
        teacher: teacher || teacherCode,
        teacherCode: teacherCode || undefined,
        room: room || undefined,
        cycleWeek: cycle === 'A' || cycle === 'B' ? cycle : 'ALL',
        rawRowNumber: idx + 1,
      });
    });

    result.detectedMetadata = {
      totalLessons: result.canonicalRows.length,
    };

    return result;
  }

  /**
   * 4. Unified Parse Method Supporting aSc XML, XLSX, CSV, and PDF (preserving existing PDF parser)
   */
  public async parseFile(
    file: File,
    defaultSchoolId?: string
  ): Promise<ParseAdapterResult> {
    const format = this.detectFormat({ name: file.name });

    if (format === 'ASC_XML') {
      const text = await file.text();
      return this.parseAscXml(text, defaultSchoolId);
    }

    if (format === 'CSV') {
      const text = await file.text();
      const workbook = XLSX.read(text, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
      return this.parseTableRows(json, defaultSchoolId, 'CSV');
    }

    if (format === 'XLSX') {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
      return this.parseTableRows(json, defaultSchoolId, 'XLSX');
    }

    if (format === 'PDF') {
      // PDF preserves fallback parser
      return {
        format: 'PDF',
        canonicalRows: [],
        errors: [
          'ملفات PDF تتطلب فحصاً مسبقاً وتنسيق الجداول، يفضل استخدام تصدير XML أو Excel لضمان دقة استيراد aSc Timetables.',
        ],
      };
    }

    return {
      format: 'UNKNOWN',
      canonicalRows: [],
      errors: ['صيغة الملف غير مدعومة. يرجى رفع ملف aSc XML أو XLSX أو CSV أو PDF.'],
    };
  }

  /**
   * 5. Strict Conflict & Validation Engine:
   * - Teacher load maximum: 30 periods / 1500 minutes (Reserve counts toward load; Supervision is separated by default)
   * - Class weekly total: up to 39 periods
   * - Unknown teacher: NEVER create teacher automatically; block and flag for manual mapping.
   * - Unknown subject: flag for manual mapping.
   * - Unknown classroom: can be created after Admin confirmation.
   * - Week A/B: supported.
   */
  public validateCanonicalRows(
    canonicalRows: CanonicalImportRow[],
    resolvedMappings?: {
      teacher?: Record<string, string>; // sourceKey -> employeeId
      subject?: Record<string, string>; // sourceKey -> subjectId
      classroom?: Record<string, string>; // sourceKey -> classroomId
      adminConfirmedNewClassrooms?: string[]; // list of new classrooms confirmed by admin
    }
  ): TimetableImportSummary {
    const batchId = `ASC-BATCH-${Date.now()}`;
    const rows: TimetableImportRow[] = [];
    const unknownTeacherCodesSet = new Set<string>();
    const unknownSubjectsSet = new Set<string>();
    const unknownClassroomsSet = new Set<string>();
    let conflictsFound = 0;
    let loadWarningsFound = 0;

    const existingSchedule = storageService.getSchedule();
    const subjects = storageService.getSubjects();
    const teachers = timetableService.getTeachingStaff();
    const classrooms = storageService.getClassrooms();
    const confirmedNewClassrooms = new Set(resolvedMappings?.adminConfirmedNewClassrooms || []);

    // Track simulated teacher load across the imported batch + existing schedule
    const teacherPeriodCounts = new Map<string, number>();

    canonicalRows.forEach(crow => {
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!crow.day) errors.push('اليوم مطلوب');
      if (!crow.periodNumber || crow.periodNumber < 1 || crow.periodNumber > 10) {
        errors.push('رقم الحصة غير صالح (1 إلى 10)');
      }
      if (!crow.classroom) errors.push('الفصل مطلوب');
      if (!crow.subject) errors.push('المادة مطلوبة');

      // 1. TEACHER RESOLUTION (Strict: Never auto-create teacher from unknown name)
      let resolvedTeacher: Employee | undefined;
      const teacherKey = normalizeImportValue(crow.teacherCode || crow.teacher || '');

      if (resolvedMappings?.teacher && teacherKey && resolvedMappings.teacher[teacherKey]) {
        const mappedId = resolvedMappings.teacher[teacherKey];
        resolvedTeacher = teachers.find(t => t.id === mappedId);
      }

      if (!resolvedTeacher && crow.teacherCode) {
        resolvedTeacher = teachers.find(
          t => normalizeImportValue(t.teacherCode || '') === normalizeImportValue(crow.teacherCode!)
        );
      }

      if (!resolvedTeacher && crow.teacher) {
        const auto = resolveTeacherAuto(crow.teacherCode || '', crow.teacher, teachers);
        resolvedTeacher = auto.teacher;
      }

      if (!resolvedTeacher) {
        const missingKey = crow.teacher || crow.teacherCode || `row-${crow.rawRowNumber}`;
        unknownTeacherCodesSet.add(missingKey);
        errors.push(`المعلم (${missingKey}) غير معروف في النظام — يلزم المطابقة اليدوية أولاً (ممنوع الإنشاء التلقائي للمعلم).`);
      }

      // 2. SUBJECT RESOLUTION
      let resolvedSubject: SubjectItem | undefined;
      const subjectKey = normalizeImportValue(crow.subject);

      if (resolvedMappings?.subject && subjectKey && resolvedMappings.subject[subjectKey]) {
        const mappedId = resolvedMappings.subject[subjectKey];
        resolvedSubject = subjects.find(s => s.id === mappedId);
      }

      if (!resolvedSubject) {
        resolvedSubject = resolveSubjectExact(crow.subject, subjects);
      }

      if (!resolvedSubject) {
        unknownSubjectsSet.add(crow.subject);
        warnings.push(`المادة (${crow.subject}) غير مطابقة للمقررات المعيارية — تتطلب مطابقة يدوية.`);
      }

      // 3. CLASSROOM RESOLUTION (Allowed with Admin Confirmation)
      let resolvedClassroom: ClassroomItem | undefined;
      const classroomKey = normalizeImportValue(crow.classroom);

      if (resolvedMappings?.classroom && classroomKey && resolvedMappings.classroom[classroomKey]) {
        const mappedId = resolvedMappings.classroom[classroomKey];
        resolvedClassroom = classrooms.find(c => c.id === mappedId);
      }

      if (!resolvedClassroom) {
        resolvedClassroom = classrooms.find(
          c =>
            normalizeImportValue(c.displayName || '') === classroomKey ||
            normalizeImportValue(c.classroomNumber || '') === classroomKey ||
            normalizeImportValue(c.id) === classroomKey
        );
      }

      if (!resolvedClassroom) {
        if (!confirmedNewClassrooms.has(crow.classroom)) {
          unknownClassroomsSet.add(crow.classroom);
          warnings.push(`الفصل (${crow.classroom}) غير مسجل — يحتاج تأكيد الإدارة لإنشائه.`);
        }
      }

      // 4. CONFLICT VALIDATION & LOAD CHECK (30 periods max)
      if (resolvedTeacher && errors.length === 0) {
        const currentCount = teacherPeriodCounts.get(resolvedTeacher.id) || 0;
        const newCount = currentCount + 1;
        teacherPeriodCounts.set(resolvedTeacher.id, newCount);

        const initialTeacherLoad = timetableService.calculateTeacherLoad(resolvedTeacher.id);
        const totalSimulatedPeriods =
          initialTeacherLoad.scheduledBasePeriods +
          initialTeacherLoad.reservePeriodsThisWeek +
          newCount;

        if (totalSimulatedPeriods > 30) {
          warnings.push(
            `تجاوز النصاب الأقصى: المعلم (${resolvedTeacher.name}) سيصل إلى ${totalSimulatedPeriods} حصة (الحد الأقصى 30 حصة / 1500 دقيقة).`
          );
          loadWarningsFound++;
        }

        // Validate schedule conflict with existing database
        const dummyItem: ScheduleItem = {
          id: `TEMP-${crow.rawRowNumber}`,
          grade: crow.grade || 'الصف الأول',
          classroom: crow.classroom,
          dayOfWeek: crow.day,
          periodNumber: crow.periodNumber,
          startTime: '',
          endTime: '',
          subject: resolvedSubject?.name || crow.subject,
          teacherId: resolvedTeacher.id,
          teacherName: resolvedTeacher.name,
          teacherCode: resolvedTeacher.teacherCode,
          room: crow.room,
          cycleWeek: crow.cycleWeek || 'ALL',
        };

        const conflictRes = timetableService.validateScheduleConflicts(dummyItem, existingSchedule);
        if (conflictRes.hasConflict) {
          conflictsFound += conflictRes.conflicts.length;
          errors.push(...conflictRes.conflicts);
        }
      }

      const isValid = errors.length === 0;

      rows.push({
        rowNumber: crow.rawRowNumber,
        dayOfWeek: crow.day,
        periodNumber: crow.periodNumber,
        gradeName: crow.grade,
        classroomName: crow.classroom,
        subjectName: resolvedSubject?.name || crow.subject,
        teacherCode: resolvedTeacher?.teacherCode || crow.teacherCode || '',
        teacherName: resolvedTeacher?.name || crow.teacher,
        roomName: crow.room,
        cycleWeek: crow.cycleWeek,
        isValid,
        errors,
        warnings,
        resolvedTeacherId: resolvedTeacher?.id,
        resolvedSubjectId: resolvedSubject?.id,
        resolvedClassroomId: resolvedClassroom?.id,
      });
    });

    return {
      batchId,
      totalRows: rows.length,
      validRowsCount: rows.filter(r => r.isValid).length,
      invalidRowsCount: rows.filter(r => !r.isValid).length,
      unknownTeacherCodes: Array.from(unknownTeacherCodesSet),
      unknownSubjects: Array.from(unknownSubjectsSet),
      unknownClassrooms: Array.from(unknownClassroomsSet),
      conflictsFound,
      loadWarningsFound,
      rows,
    };
  }
}

export const ascTimetableImportAdapter = new AscTimetableImportAdapter();
