export function resolveTeacherAuto(
  sourceCode: string,
  sourceName: string,
  teachers: Employee[]
): { teacher?: Employee; reason?: string } {

  const activeTeachers = teachers.filter(
    teacher =>
      teacher.status === 'Active' &&
      !!String(teacher.teacherCode || '').trim()
  );

  // 1) Teacher Code الموجود في الملف هو أقوى تطابق
  const code = normalizeImportValue(sourceCode);

  if (code) {
    const matches = activeTeachers.filter(
      teacher =>
        normalizeImportValue(teacher.teacherCode || '') === code
    );

    if (matches.length === 1) {
      return {
        teacher: matches[0],
        reason: 'مطابقة مؤكدة بكود المعلم',
      };
    }

    return {};
  }

  const name = normalizeImportValue(sourceName);

  if (!name) return {};

  // 2) Alias معتمد -> Teacher Code حقيقي
  const aliasTeacherCode = TEACHER_ALIAS_TO_CODE[name];

  if (aliasTeacherCode) {
    const matches = activeTeachers.filter(
      teacher =>
        normalizeImportValue(teacher.teacherCode || '') ===
        normalizeImportValue(aliasTeacherCode)
    );

    if (matches.length === 1) {
      return {
        teacher: matches[0],
        reason: 'مطابقة تلقائية من اسم محفوظ إلى Teacher Code معتمد',
      };
    }
  }

  // 3) الاسم مطابق تمامًا لمعلم واحد
  const exactMatches = activeTeachers.filter(
    teacher =>
      normalizeImportValue(
        teacher.fullName || teacher.name || ''
      ) === name
  );

  if (exactMatches.length === 1) {
    return {
      teacher: exactMatches[0],
      reason: 'مطابقة تلقائية آمنة باسم فريد + Teacher Code',
    };
  }

  return {};
}