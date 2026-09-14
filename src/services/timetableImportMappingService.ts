import { ClassroomItem, Employee, GradeItem, SubjectItem } from '../types';

export type ImportMappingBucket = 'teacher' | 'subject' | 'classroom' | 'grade' | 'day';
export type ImportMappingMemory = Partial<Record<ImportMappingBucket, Record<string, string>>>;

// Keep v3 so the aliases already learned by the browser are not lost.
const IMPORT_MAPPING_MEMORY_KEY = 'ntss_timetable_import_mapping_memory_v3';

// Optional fixed aliases. Use ONLY real teacher codes from your system.
const TEACHER_ALIAS_TO_CODE: Record<string, string> = {
  // khaled: 'T-014',
  // 'a hamdy': 'T-031',
  // eman: 'T-025',
};

export function normalizeImportValue(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[._\-\/\\()\[\],:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueMatch<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  const matches = items.filter(predicate);
  return matches.length === 1 ? matches[0] : undefined;
}

function extractStandaloneNumber(value: string): number | undefined {
  const match = String(value || '').match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function gradeOrdinalFromSource(value: string): number | undefined {
  const normalized = normalizeImportValue(value);
  if (!normalized) return undefined;

  const named: Array<[RegExp, number]> = [
    [/(?:الصف\s*)?(?:الاول|اول|first|grade\s*1|g\s*1)/i, 1],
    [/(?:الصف\s*)?(?:الثاني|ثاني|second|grade\s*2|g\s*2)/i, 2],
    [/(?:الصف\s*)?(?:الثالث|ثالث|third|grade\s*3|g\s*3)/i, 3],
  ];

  for (const [pattern, ordinal] of named) {
    if (pattern.test(normalized)) return ordinal;
  }

  const direct = extractStandaloneNumber(normalized);
  if (direct && direct > 0) return direct;
  return undefined;
}

export function resolveGradeAuto(sourceValue: string, grades: GradeItem[]): GradeItem | undefined {
  const normalized = normalizeImportValue(sourceValue);
  if (!normalized) return undefined;

  const exact = uniqueMatch(
    grades,
    grade =>
      normalizeImportValue(grade.name) === normalized ||
      normalizeImportValue(grade.shortName || '') === normalized ||
      normalizeImportValue(grade.id) === normalized
  );
  if (exact) return exact;

  const ordinal = gradeOrdinalFromSource(sourceValue);
  if (!ordinal) return undefined;

  return uniqueMatch(grades, grade => {
    const withOrder = grade as GradeItem & { order?: number };
    return (
      Number(withOrder.order) === ordinal ||
      gradeOrdinalFromSource(grade.name) === ordinal ||
      gradeOrdinalFromSource(grade.shortName || '') === ordinal ||
      gradeOrdinalFromSource(grade.id) === ordinal
    );
  });
}

function activeTeachersWithCodes(teachers: Employee[]): Employee[] {
  return teachers.filter(
    teacher => teacher.status === 'Active' && Boolean(String(teacher.teacherCode || '').trim())
  );
}

function teacherDisplayName(teacher: Employee): string {
  return String(teacher.fullName || teacher.name || '');
}

export function resolveTeacherAuto(
  sourceCode: string,
  sourceName: string,
  teachers: Employee[]
): { teacher?: Employee; reason?: string } {
  const activeTeachers = activeTeachersWithCodes(teachers);

  const code = normalizeImportValue(sourceCode);
  if (code) {
    const teacher = uniqueMatch(
      activeTeachers,
      item => normalizeImportValue(item.teacherCode || '') === code
    );
    return teacher ? { teacher, reason: 'مطابقة مؤكدة بكود المعلم' } : {};
  }

  const name = normalizeImportValue(sourceName);
  if (!name) return {};

  // Saved/static alias -> official teacher code.
  const aliasCode = TEACHER_ALIAS_TO_CODE[name];
  if (aliasCode) {
    const teacher = uniqueMatch(
      activeTeachers,
      item => normalizeImportValue(item.teacherCode || '') === normalizeImportValue(aliasCode)
    );
    if (teacher) return { teacher, reason: 'مطابقة تلقائية من Alias إلى Teacher Code معتمد' };
  }

  // Exact unique full-name match.
  const exact = uniqueMatch(
    activeTeachers,
    teacher => normalizeImportValue(teacherDisplayName(teacher)) === name
  );
  if (exact) {
    return { teacher: exact, reason: 'مطابقة تلقائية آمنة باسم فريد + Teacher Code' };
  }

  // Unique single-token match, e.g. KHALED -> Khaled Ahmed Mohamed.
  if (name.length >= 3 && !name.includes(' ')) {
    const tokenMatches = activeTeachers.filter(teacher =>
      normalizeImportValue(teacherDisplayName(teacher)).split(' ').filter(Boolean).includes(name)
    );
    if (tokenMatches.length === 1) {
      return {
        teacher: tokenMatches[0],
        reason: 'مطابقة تلقائية باسم مختصر فريد + Teacher Code',
      };
    }
  }

  // Unique normalized prefix match, e.g. A-hamdy -> A hamdy ...
  if (name.length >= 4) {
    const prefixMatches = activeTeachers.filter(teacher => {
      const candidate = normalizeImportValue(teacherDisplayName(teacher));
      return candidate === name || candidate.startsWith(`${name} `);
    });
    if (prefixMatches.length === 1) {
      return { teacher: prefixMatches[0], reason: 'مطابقة تلقائية باسم فريد' };
    }
  }

  return {};
}

export function parseCompositeClassroom(
  value: string
): { gradeOrdinal: number; classroomNumber: string } | undefined {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})\s*[\/\\-]\s*(\d{1,2})$/);
  if (!match) return undefined;

  return {
    gradeOrdinal: Number(match[1]),
    classroomNumber: String(Number(match[2])),
  };
}

export function resolveClassroomAuto(
  sourceValue: string,
  sourceGradeValue: string,
  classrooms: ClassroomItem[],
  grades: GradeItem[]
): { classroom?: ClassroomItem; reason?: string } {
  const normalized = normalizeImportValue(sourceValue);
  if (!normalized) return {};

  const direct = uniqueMatch(
    classrooms,
    classroom =>
      normalizeImportValue(classroom.displayName || '') === normalized ||
      normalizeImportValue(classroom.id) === normalized
  );
  if (direct) return { classroom: direct, reason: 'مطابقة فصل مؤكدة' };

  const composite = parseCompositeClassroom(sourceValue);
  if (composite) {
    const grade = uniqueMatch(grades, item => {
      const withOrder = item as GradeItem & { order?: number };
      return (
        Number(withOrder.order) === composite.gradeOrdinal ||
        gradeOrdinalFromSource(item.name) === composite.gradeOrdinal ||
        gradeOrdinalFromSource(item.shortName || '') === composite.gradeOrdinal ||
        gradeOrdinalFromSource(item.id) === composite.gradeOrdinal
      );
    });

    if (grade) {
      const classroom = uniqueMatch(
        classrooms,
        item =>
          item.gradeId === grade.id &&
          normalizeImportValue(item.classroomNumber) === normalizeImportValue(composite.classroomNumber)
      );
      if (classroom) {
        return {
          classroom,
          reason: `تم تحليل ${sourceValue} إلى الصف ${composite.gradeOrdinal} / الفصل ${composite.classroomNumber}`,
        };
      }
    }
  }

  const grade = resolveGradeAuto(sourceGradeValue, grades);
  if (grade) {
    const classroom = uniqueMatch(
      classrooms,
      item => item.gradeId === grade.id && normalizeImportValue(item.classroomNumber) === normalized
    );
    if (classroom) {
      return { classroom, reason: 'مطابقة الفصل باستخدام الصف الدراسي + رقم الفصل' };
    }
  }

  const numberOnly = extractStandaloneNumber(sourceValue);
  if (grade && numberOnly) {
    const classroom = uniqueMatch(
      classrooms,
      item => item.gradeId === grade.id && Number(item.classroomNumber) === numberOnly
    );
    if (classroom) {
      return { classroom, reason: 'مطابقة الفصل باستخدام الصف الدراسي + الرقم المستخرج' };
    }
  }

  return {};
}

export function resolveSubjectExact(
  sourceValue: string,
  subjects: SubjectItem[]
): SubjectItem | undefined {
  const normalized = normalizeImportValue(sourceValue);
  if (!normalized) return undefined;

  return uniqueMatch(
    subjects,
    subject =>
      normalizeImportValue(subject.name) === normalized ||
      normalizeImportValue(subject.shortName || '') === normalized ||
      normalizeImportValue(subject.id) === normalized
  );
}

const SUBJECT_ALIAS_HINTS: Record<string, string[]> = {
  math: ['رياضيات', 'mathematics', 'math'],
  physics: ['فيزياء', 'physics'],
  ar: ['عربي', 'العربيه', 'arabic'],
  arabic: ['عربي', 'العربيه', 'arabic'],
  social: ['دراسات', 'اجتماعيه', 'social'],
  dt: ['تحول رقمي', 'رقمي', 'digital'],
  english: ['انجليزي', 'الانجليزيه', 'english'],
  'a english': ['انجليزي', 'الانجليزيه', 'english'],
  'b english': ['انجليزي', 'الانجليزيه', 'english'],
};

export function suggestSubjectAlias(
  sourceValue: string,
  subjects: SubjectItem[]
): SubjectItem | undefined {
  const normalized = normalizeImportValue(sourceValue);
  const hints = SUBJECT_ALIAS_HINTS[normalized];
  if (!hints?.length) return undefined;

  return uniqueMatch(subjects, subject => {
    const searchable = [
      normalizeImportValue(subject.name),
      normalizeImportValue(subject.shortName || ''),
      normalizeImportValue(subject.id),
    ].join(' ');

    return hints.some(hint => searchable.includes(normalizeImportValue(hint)));
  });
}

export function loadImportMappingMemory(): ImportMappingMemory {
  if (typeof localStorage === 'undefined') return {};

  try {
    const raw = localStorage.getItem(IMPORT_MAPPING_MEMORY_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getRememberedMapping(
  memory: ImportMappingMemory,
  bucket: ImportMappingBucket,
  sourceValue: string
): string | undefined {
  return memory[bucket]?.[normalizeImportValue(sourceValue)];
}

export function rememberImportMapping(
  bucket: ImportMappingBucket,
  sourceValue: string,
  targetId: string
): void {
  if (typeof localStorage === 'undefined') return;

  const sourceKey = normalizeImportValue(sourceValue);
  if (!sourceKey) return;

  const memory = loadImportMappingMemory();
  const bucketMemory = { ...(memory[bucket] || {}) };

  if (targetId) bucketMemory[sourceKey] = targetId;
  else delete bucketMemory[sourceKey];

  const next: ImportMappingMemory = {
    ...memory,
    [bucket]: bucketMemory,
  };

  localStorage.setItem(IMPORT_MAPPING_MEMORY_KEY, JSON.stringify(next));
}

export function clearTeacherImportMappingMemory(): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const memory = loadImportMappingMemory();
    const next: ImportMappingMemory = { ...memory, teacher: {} };
    localStorage.setItem(IMPORT_MAPPING_MEMORY_KEY, JSON.stringify(next));
  } catch {
    // UX-only memory; no authentication/security data is stored here.
  }
}

export function clearImportMappingMemory(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(IMPORT_MAPPING_MEMORY_KEY);
}
