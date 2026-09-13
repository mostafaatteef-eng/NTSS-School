import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Layers,
  RefreshCw,
  RotateCcw,
  School,
  UploadCloud,
  UserRound,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { TimetableImportSummary } from '../../types';
import { storageService } from '../../services/storageService';
import { timetableService } from '../../services/timetableService';

type RawImportRow = Record<string, unknown>;
type MappingBucket = 'teacher' | 'subject' | 'classroom' | 'grade' | 'day';

type SelectionState = Record<MappingBucket, Record<string, string>>;

interface MappingEntry {
  key: string;
  sourceValue: string;
  count: number;
  autoTargetId?: string;
  suggestedTargetId?: string;
  suggestionReason?: string;
}

const FIELD_KEYS = {
  day: ['اليوم', 'Day', 'dayOfWeek', 'day'],
  grade: ['الصف', 'Grade', 'grade', 'gradeName'],
  classroom: ['الفصل', 'Classroom', 'classroom', 'classroomName'],
  subject: ['المادة', 'Subject', 'subject', 'subjectName'],
  teacherCode: ['كود المعلم', 'TeacherCode', 'teacherCode'],
  teacherName: ['اسم المعلم', 'TeacherName', 'teacherName'],
};

const EMPTY_SELECTIONS: SelectionState = {
  teacher: {},
  subject: {},
  classroom: {},
  grade: {},
  day: {},
};

function readValue(row: RawImportRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function normalize(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[._\-\/\\()\[\],:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeUniqueEntries(bucket: MappingBucket, values: string[]): MappingEntry[] {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.entries()).map(([sourceValue, count]) => ({
    key: `${bucket}:${sourceValue}`,
    sourceValue,
    count,
  }));
}

function findUnique<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  const matches = items.filter(predicate);
  return matches.length === 1 ? matches[0] : undefined;
}

function teacherSource(row: RawImportRow) {
  const code = readValue(row, FIELD_KEYS.teacherCode);
  const name = readValue(row, FIELD_KEYS.teacherName);
  return {
    code,
    name,
    value: code || name,
    key: code ? `teacher:CODE:${code}` : `teacher:NAME:${name}`,
  };
}

const DAY_ALIASES: Record<string, string> = {
  sunday: 'الأحد',
  sun: 'الأحد',
  الاحد: 'الأحد',
  الأحد: 'الأحد',
  monday: 'الإثنين',
  mon: 'الإثنين',
  الاثنين: 'الإثنين',
  الإثنين: 'الإثنين',
  tuesday: 'الثلاثاء',
  tue: 'الثلاثاء',
  tues: 'الثلاثاء',
  الثلاثاء: 'الثلاثاء',
  wednesday: 'الأربعاء',
  wed: 'الأربعاء',
  الاربعاء: 'الأربعاء',
  الأربعاء: 'الأربعاء',
  thursday: 'الخميس',
  thu: 'الخميس',
  thur: 'الخميس',
  thurs: 'الخميس',
  الخميس: 'الخميس',
  friday: 'الجمعة',
  fri: 'الجمعة',
  الجمعه: 'الجمعة',
  الجمعة: 'الجمعة',
  saturday: 'السبت',
  sat: 'السبت',
  السبت: 'السبت',
};

export const TimetableImportWizardView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<RawImportRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<TimetableImportSummary | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [selections, setSelections] = useState<SelectionState>(EMPTY_SELECTIONS);
  const [autoCreateAssignments, setAutoCreateAssignments] = useState(true);
  const [commitResult, setCommitResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const teachers = useMemo(
    () => storageService.getEmployees().filter(e => e.status === 'Active' && !!e.teacherCode),
    [rawRows]
  );
  const subjects = useMemo(() => storageService.getSubjects().filter(s => s.isActive !== false), [rawRows]);
  const classrooms = useMemo(() => storageService.getClassrooms().filter(c => c.isActive !== false), [rawRows]);
  const grades = useMemo(() => storageService.getGrades().filter(g => g.isActive !== false), [rawRows]);
  const studyDays = useMemo(() => storageService.getScheduleConfig().studyDays || [], [rawRows]);

  const catalog = useMemo(() => {
    const teacherCounts = new Map<string, { sourceValue: string; count: number; code: string; name: string }>();
    rawRows.forEach(row => {
      const source = teacherSource(row);
      if (!source.value) return;
      const current = teacherCounts.get(source.key);
      teacherCounts.set(source.key, {
        sourceValue: source.value,
        count: (current?.count || 0) + 1,
        code: source.code,
        name: source.name,
      });
    });

    const teacherEntries: MappingEntry[] = Array.from(teacherCounts.entries()).map(([key, source]) => {
      if (source.code) {
        const exact = findUnique(teachers, t => normalize(t.teacherCode || '') === normalize(source.code));
        return {
          key,
          sourceValue: source.sourceValue,
          count: source.count,
          autoTargetId: exact?.id,
          suggestionReason: exact ? 'مطابقة مؤكدة بكود المعلم' : undefined,
        };
      }

      const exactByName = findUnique(teachers, t => normalize(t.name) === normalize(source.name));
      return {
        key,
        sourceValue: source.sourceValue,
        count: source.count,
        suggestedTargetId: exactByName?.id,
        suggestionReason: exactByName ? 'تطابق اسم فريد — يحتاج تأكيد يدوي' : undefined,
      };
    });

    const subjectEntries = makeUniqueEntries('subject', rawRows.map(r => readValue(r, FIELD_KEYS.subject))).map(entry => {
      const exact = findUnique(
        subjects,
        subject =>
          normalize(subject.name) === normalize(entry.sourceValue) ||
          normalize(subject.shortName || '') === normalize(entry.sourceValue) ||
          normalize(subject.id) === normalize(entry.sourceValue)
      );
      return { ...entry, autoTargetId: exact?.id, suggestionReason: exact ? 'مطابقة مادة مؤكدة' : undefined };
    });

    const classroomEntries = makeUniqueEntries('classroom', rawRows.map(r => readValue(r, FIELD_KEYS.classroom))).map(entry => {
      const exact = findUnique(
        classrooms,
        classroom =>
          normalize(classroom.classroomNumber) === normalize(entry.sourceValue) ||
          normalize(classroom.displayName || '') === normalize(entry.sourceValue) ||
          normalize(classroom.id) === normalize(entry.sourceValue)
      );
      return { ...entry, autoTargetId: exact?.id, suggestionReason: exact ? 'مطابقة فصل مؤكدة' : undefined };
    });

    const gradeEntries = makeUniqueEntries('grade', rawRows.map(r => readValue(r, FIELD_KEYS.grade))).map(entry => {
      const exact = findUnique(
        grades,
        grade =>
          normalize(grade.name) === normalize(entry.sourceValue) ||
          normalize(grade.shortName || '') === normalize(entry.sourceValue) ||
          normalize(grade.id) === normalize(entry.sourceValue)
      );
      return { ...entry, autoTargetId: exact?.id, suggestionReason: exact ? 'مطابقة صف مؤكدة' : undefined };
    });

    const dayEntries = makeUniqueEntries('day', rawRows.map(r => readValue(r, FIELD_KEYS.day))).map(entry => {
      const alias = DAY_ALIASES[normalize(entry.sourceValue)];
      const exact = studyDays.find(day => normalize(day) === normalize(entry.sourceValue));
      const canonical = exact || (alias && studyDays.includes(alias) ? alias : undefined);
      return {
        ...entry,
        autoTargetId: canonical,
        suggestionReason: canonical ? 'تم توحيد اليوم حسب أيام الدراسة' : undefined,
      };
    });

    return {
      teacher: teacherEntries,
      subject: subjectEntries,
      classroom: classroomEntries,
      grade: gradeEntries,
      day: dayEntries,
    };
  }, [rawRows, teachers, subjects, classrooms, grades, studyDays]);

  useEffect(() => {
    if (!rawRows.length) {
      setSelections(EMPTY_SELECTIONS);
      return;
    }

    const next: SelectionState = {
      teacher: {},
      subject: {},
      classroom: {},
      grade: {},
      day: {},
    };

    (Object.keys(catalog) as MappingBucket[]).forEach(bucket => {
      catalog[bucket].forEach(entry => {
        if (entry.autoTargetId) next[bucket][entry.key] = entry.autoTargetId;
      });
    });
    setSelections(next);
  }, [rawRows, catalog]);

  const progress = useMemo(() => {
    const calculate = (bucket: MappingBucket) => {
      const entries = catalog[bucket];
      const resolved = entries.filter(entry => !!selections[bucket][entry.key]).length;
      return { total: entries.length, resolved };
    };
    return {
      teacher: calculate('teacher'),
      subject: calculate('subject'),
      classroom: calculate('classroom'),
      grade: calculate('grade'),
      day: calculate('day'),
    };
  }, [catalog, selections]);

  const hasBlockingMappings =
    progress.teacher.resolved < progress.teacher.total ||
    progress.subject.resolved < progress.subject.total ||
    progress.classroom.resolved < progress.classroom.total ||
    progress.grade.resolved < progress.grade.total ||
    progress.day.resolved < progress.day.total;

  const updateSelection = (bucket: MappingBucket, key: string, targetId: string) => {
    setSelections(prev => ({
      ...prev,
      [bucket]: {
        ...prev[bucket],
        [key]: targetId,
      },
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFile(files[0]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsLoading(true);
    setCommitResult(null);
    setSummary(null);

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json<RawImportRow>(ws);

        if (data.length === 0) {
          alert('الملف فارغ أو لا يحتوي على صفوف صالحة');
          return;
        }

        setRawRows(data);
        setMappingOpen(true);
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء قراءة الملف، يرجى التأكد من صيغة Excel الصحيحة');
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(uploadedFile);
  };

  const applyMappingsAndValidate = () => {
    if (!rawRows.length) return;
    if (hasBlockingMappings) {
      alert('يجب حل جميع المطابقات المطلوبة قبل الانتقال إلى التحقق النهائي.');
      return;
    }

    setIsLoading(true);
    try {
      const mappedRows = rawRows.map(row => {
        const mapped: RawImportRow = { ...row };

        const teacherSrc = teacherSource(row);
        const teacherId = selections.teacher[teacherSrc.key];
        if (teacherId) {
          const teacher = teachers.find(t => t.id === teacherId);
          if (teacher?.teacherCode) {
            mapped.teacherCode = teacher.teacherCode;
            mapped.TeacherCode = teacher.teacherCode;
            mapped['كود المعلم'] = teacher.teacherCode;
            mapped.teacherName = teacher.name;
            mapped.TeacherName = teacher.name;
            mapped['اسم المعلم'] = teacher.name;
          }
        }

        const subjectSource = readValue(row, FIELD_KEYS.subject);
        const subjectEntry = catalog.subject.find(entry => entry.sourceValue === subjectSource);
        const subjectId = subjectEntry ? selections.subject[subjectEntry.key] : undefined;
        if (subjectId) {
          const subject = subjects.find(s => s.id === subjectId);
          if (subject) {
            mapped.subject = subject.name;
            mapped.Subject = subject.name;
            mapped['المادة'] = subject.name;
          }
        }

        const classSource = readValue(row, FIELD_KEYS.classroom);
        const classEntry = catalog.classroom.find(entry => entry.sourceValue === classSource);
        const classroomId = classEntry ? selections.classroom[classEntry.key] : undefined;
        if (classroomId) {
          const classroom = classrooms.find(c => c.id === classroomId);
          if (classroom) {
            const classLabel = classroom.classroomNumber || classroom.displayName || classroom.id;
            mapped.classroom = classLabel;
            mapped.Classroom = classLabel;
            mapped['الفصل'] = classLabel;
          }
        }

        const gradeSource = readValue(row, FIELD_KEYS.grade);
        const gradeEntry = catalog.grade.find(entry => entry.sourceValue === gradeSource);
        const gradeId = gradeEntry ? selections.grade[gradeEntry.key] : undefined;
        if (gradeId) {
          const grade = grades.find(g => g.id === gradeId);
          if (grade) {
            mapped.grade = grade.name;
            mapped.Grade = grade.name;
            mapped['الصف'] = grade.name;
          }
        }

        const daySource = readValue(row, FIELD_KEYS.day);
        const dayEntry = catalog.day.find(entry => entry.sourceValue === daySource);
        const day = dayEntry ? selections.day[dayEntry.key] : undefined;
        if (day) {
          mapped.dayOfWeek = day;
          mapped.Day = day;
          mapped['اليوم'] = day;
        }

        return mapped;
      });

      setSummary(timetableService.parseAndValidateImportData(mappedRows));
      setMappingOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = () => {
    if (!summary) return;
    setIsLoading(true);
    const result = timetableService.commitImportBatch(summary, {
      createAssignments: autoCreateAssignments,
    });
    setCommitResult(result);
    setIsLoading(false);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        اليوم: 'الأحد',
        الحصة: 1,
        الصف: 'الصف الأول الثانوي',
        الفصل: '1/1',
        المادة: 'اللغة العربية والتربية الإسلامية',
        'كود المعلم': 'T-001',
        'اسم المعلم': 'أحمد إبراهيم الشناوي',
        القاعة: 'قاعة 101',
        'أسبوع الخطة': 'ALL',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'نموذج الجدول');
    XLSX.writeFile(wb, 'نموذج_استيراد_الجدول_المدرسي_NTSS.xlsx');
  };

  const renderMappingSection = (
    bucket: MappingBucket,
    title: string,
    icon: React.ReactNode,
    options: Array<{ id: string; label: string; secondary?: string; teacherCode?: string }>
  ) => {
    const entries = catalog[bucket];
    if (!entries.length) return null;

    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            {icon}
            {title}
          </div>
          <span className="text-xs font-bold text-slate-500">
            {progress[bucket].resolved}/{progress[bucket].total} محلول
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          {entries.map(entry => {
            const selectedId = selections[bucket][entry.key] || '';
            const suggestedOption = entry.suggestedTargetId
              ? options.find(option => option.id === entry.suggestedTargetId)
              : undefined;
            return (
              <div key={entry.key} className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.7fr_auto] gap-3 items-center p-4">
                <div>
                  <div className="text-xs font-bold text-slate-900">{entry.sourceValue}</div>
                  <div className="text-[11px] text-slate-500 mt-1">يظهر في {entry.count} صف</div>
                </div>
                <div>
                  <select
                    value={selectedId}
                    onChange={e => updateSelection(bucket, entry.key, e.target.value)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-xs font-semibold outline-none ${
                      selectedId ? 'border-emerald-300 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/40'
                    }`}
                  >
                    <option value="">— اختر المطابقة المعتمدة —</option>
                    {options.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                        {option.teacherCode ? ` — ${option.teacherCode}` : ''}
                        {option.secondary ? ` — ${option.secondary}` : ''}
                      </option>
                    ))}
                  </select>
                  {!selectedId && suggestedOption && (
                    <button
                      type="button"
                      onClick={() => updateSelection(bucket, entry.key, suggestedOption.id)}
                      className="mt-2 text-[11px] font-bold text-indigo-700 hover:text-indigo-900"
                    >
                      استخدام الاقتراح: {suggestedOption.label}
                      {suggestedOption.teacherCode ? ` (${suggestedOption.teacherCode})` : ''}
                    </button>
                  )}
                  {entry.suggestionReason && (
                    <div className="mt-1 text-[10px] text-slate-500">{entry.suggestionReason}</div>
                  )}
                </div>
                <div>
                  {selectedId ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> تم الربط
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5" /> يحتاج مراجعة
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const teacherOptions = teachers.map(t => ({
    id: t.id,
    label: t.name,
    secondary: t.department || t.jobTitle || '',
    teacherCode: t.teacherCode,
  }));
  const subjectOptions = subjects.map(s => ({ id: s.id, label: s.name, secondary: s.shortName || '' }));
  const classroomOptions = classrooms.map(c => ({
    id: c.id,
    label: c.displayName || c.classroomNumber,
    secondary: c.gradeName || '',
  }));
  const gradeOptions = grades.map(g => ({ id: g.id, label: g.name, secondary: g.shortName || '' }));
  const dayOptions = studyDays.map(day => ({ id: day, label: day }));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            معالج استيراد ومطابقة الجدول المدرسي
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            مطابقة القيم المتكررة مرة واحدة ثم إعادة التحقق من كل الصفوف مع الحفاظ على شرط كود المعلم.
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition"
        >
          <Download className="w-4 h-4" />
          تحميل نموذج الاستيراد
        </button>
      </div>

      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-7 bg-white hover:bg-slate-50/50 transition cursor-pointer text-center space-y-3"
      >
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
          <UploadCloud className="w-6 h-6" />
        </div>
        <div className="text-sm font-bold text-slate-800">
          {file ? file.name : 'اضغط لاختيار ملف Excel أو اسحب الملف هنا'}
        </div>
        <p className="text-xs text-slate-500">يدعم .xlsx و .xls و .csv</p>
        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-semibold">
            <RefreshCw className="w-4 h-4 animate-spin" /> جارِ المعالجة...
          </div>
        )}
      </div>

      {rawRows.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-xs font-bold">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 text-center">1. رفع الملف ✓</div>
          <div className={`rounded-xl border p-3 text-center ${mappingOpen ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            2. مطابقة البيانات {mappingOpen ? '' : '✓'}
          </div>
          <div className={`rounded-xl border p-3 text-center ${!mappingOpen && summary ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
            3. التحقق والاعتماد
          </div>
        </div>
      )}

      {mappingOpen && rawRows.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-base font-black text-slate-900">
                  <WandSparkles className="w-5 h-5 text-indigo-600" />
                  المطابقة الذكية قبل التدقيق
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  النظام يجمع القيم المتكررة؛ لو اسم KHALED موجود 38 مرة ستربطه بمعلم واحد مرة واحدة فقط. اسم المعلم مجرد اقتراح، والاعتماد النهائي يظل بكود المعلم المسجل.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelections(EMPTY_SELECTIONS)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600"
              >
                <RotateCcw className="w-4 h-4" /> إعادة ضبط المطابقة
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([
              ['teacher', 'المعلمون'],
              ['subject', 'المواد'],
              ['classroom', 'الفصول'],
              ['grade', 'الصفوف'],
              ['day', 'الأيام'],
            ] as Array<[MappingBucket, string]>).map(([bucket, label]) => (
              <div key={bucket} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                <div className={`text-xl font-black ${progress[bucket].resolved === progress[bucket].total ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {progress[bucket].resolved}/{progress[bucket].total}
                </div>
                <div className="text-[11px] font-bold text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          {renderMappingSection('teacher', 'مطابقة المعلمين', <UserRound className="w-4 h-4 text-indigo-600" />, teacherOptions)}
          {renderMappingSection('subject', 'مطابقة المواد', <BookOpen className="w-4 h-4 text-indigo-600" />, subjectOptions)}
          {renderMappingSection('classroom', 'مطابقة الفصول', <School className="w-4 h-4 text-indigo-600" />, classroomOptions)}
          {renderMappingSection('grade', 'مطابقة الصفوف الدراسية', <Layers className="w-4 h-4 text-indigo-600" />, gradeOptions)}
          {renderMappingSection('day', 'توحيد أيام الدراسة', <CalendarDays className="w-4 h-4 text-indigo-600" />, dayOptions)}

          <div className="sticky bottom-3 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur p-4 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              {hasBlockingMappings ? (
                <span className="font-bold text-amber-700">يوجد Mapping غير مكتمل. أكمل القيم المعلّمة قبل التحقق.</span>
              ) : (
                <span className="font-bold text-emerald-700">كل القيم الأساسية تم ربطها. يمكنك إعادة التحقق من {rawRows.length} صف.</span>
              )}
            </div>
            <button
              type="button"
              disabled={hasBlockingMappings || isLoading}
              onClick={applyMappingsAndValidate}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 px-5 py-2.5 text-sm font-bold text-white"
            >
              <CheckCircle2 className="w-4 h-4" /> تطبيق المطابقة وإعادة التحقق
            </button>
          </div>
        </div>
      )}

      {commitResult && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 ${commitResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {commitResult.success ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
          <div className="text-sm font-bold">{commitResult.message}</div>
        </div>
      )}

      {!mappingOpen && summary && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setMappingOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700"
            >
              <WandSparkles className="w-4 h-4" /> تعديل المطابقة
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center"><div className="text-2xl font-black">{summary.totalRows}</div><div className="text-xs text-slate-500">إجمالي الصفوف</div></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center"><div className="text-2xl font-black text-emerald-600">{summary.validRowsCount}</div><div className="text-xs text-slate-500">صالحة</div></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center"><div className="text-2xl font-black text-rose-600">{summary.invalidRowsCount}</div><div className="text-xs text-slate-500">أخطاء</div></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center"><div className="text-2xl font-black text-amber-600">{summary.unknownTeacherCodes.length}</div><div className="text-xs text-slate-500">معلم غير معروف</div></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center"><div className="text-2xl font-black text-indigo-600">{summary.conflictsFound}</div><div className="text-xs text-slate-500">تعارضات</div></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center"><div className="text-2xl font-black text-purple-600">{summary.loadWarningsFound}</div><div className="text-xs text-slate-500">تنبيهات نصاب</div></div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" /> معاينة الصفوف وحالة التدقيق
              </h3>
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={autoCreateAssignments} onChange={e => setAutoCreateAssignments(e.target.checked)} />
                  إنشاء/تحديث إسناد الحصص تلقائياً
                </label>
                <button
                  disabled={summary.validRowsCount === 0 || isLoading}
                  onClick={handleCommit}
                  className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> اعتماد واستيراد ({summary.validRowsCount}) حصة صالحة
                </button>
              </div>
            </div>

            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full text-right text-xs border-collapse min-w-[1100px]">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold border-b">
                  <tr>
                    <th className="p-2.5">#</th><th className="p-2.5">الحالة</th><th className="p-2.5">اليوم</th><th className="p-2.5">الحصة</th><th className="p-2.5">الصف / الفصل</th><th className="p-2.5">المادة</th><th className="p-2.5">كود المعلم</th><th className="p-2.5">اسم المعلم</th><th className="p-2.5">القاعة</th><th className="p-2.5">ملاحظات التدقيق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.rows.map(r => (
                    <tr key={r.rowNumber} className={`hover:bg-slate-50 ${!r.isValid ? 'bg-rose-50/40' : ''}`}>
                      <td className="p-2.5 font-mono text-slate-400">{r.rowNumber}</td>
                      <td className="p-2.5">{r.isValid ? <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> صالح</span> : <span className="inline-flex items-center gap-1 text-rose-700 font-bold"><XCircle className="w-3.5 h-3.5" /> مرفوض</span>}</td>
                      <td className="p-2.5 font-medium">{r.dayOfWeek}</td>
                      <td className="p-2.5 font-bold">{r.periodNumber}</td>
                      <td className="p-2.5">{r.gradeName} - {r.classroomName}</td>
                      <td className="p-2.5 font-semibold">{r.subjectName}</td>
                      <td className="p-2.5 font-mono font-bold text-indigo-700">{r.teacherCode}</td>
                      <td className="p-2.5">{r.teacherName || '—'}</td>
                      <td className="p-2.5 text-slate-500">{r.roomName || '—'}</td>
                      <td className="p-2.5">
                        {r.errors.map((err, i) => <div key={`e-${i}`} className="text-rose-600 font-semibold">• {err}</div>)}
                        {r.warnings.map((warning, i) => <div key={`w-${i}`} className="text-amber-600">⚠ {warning}</div>)}
                        {r.isValid && r.warnings.length === 0 && <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
