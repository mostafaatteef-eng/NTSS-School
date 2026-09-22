import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileCode,
  FileType,
  Layers,
  RefreshCw,
  RotateCcw,
  School,
  Trash2,
  UploadCloud,
  UserRound,
  WandSparkles,
  XCircle,
  PlusCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  ClassroomItem,
  Employee,
  GradeItem,
  SubjectItem,
  TimetableImportSummary,
} from '../../types';
import { storageService } from '../../services/storageService';
import { timetableService } from '../../services/timetableService';
import {
  clearImportMappingMemory,
  getRememberedMapping,
  ImportMappingBucket,
  loadImportMappingMemory,
  normalizeImportValue,
  rememberImportMapping,
  resolveClassroomAuto,
  resolveGradeAuto,
  resolveSubjectExact,
  resolveTeacherAuto,
  suggestSubjectAlias,
} from '../../services/timetableImportMappingService';
import {
  ascTimetableImportAdapter,
  AscFileFormat,
  CanonicalImportRow,
} from '../../services/ascTimetableImportAdapter';

type MappingBucket = ImportMappingBucket;
type SelectionState = Record<MappingBucket, Record<string, string>>;

interface MappingEntry {
  key: string;
  sourceValue: string;
  count: number;
  autoTargetId?: string;
  suggestedTargetId?: string;
  suggestionReason?: string;
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

function emptySelections(): SelectionState {
  return { teacher: {}, subject: {}, classroom: {}, grade: {}, day: {} };
}

export const TimetableImportWizardView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<AscFileFormat>('UNKNOWN');
  const [canonicalRows, setCanonicalRows] = useState<CanonicalImportRow[]>([]);
  const [detectedMeta, setDetectedMeta] = useState<{
    totalLessons?: number;
    classesCount?: number;
    teachersCount?: number;
    subjectsCount?: number;
  }>({});
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [selections, setSelections] = useState<SelectionState>(emptySelections);
  const [memoryRevision, setMemoryRevision] = useState(0);
  const [summary, setSummary] = useState<TimetableImportSummary | null>(null);
  const [autoCreateAssignments, setAutoCreateAssignments] = useState(true);
  const [commitResult, setCommitResult] = useState<{
    success: boolean;
    importedCount: number;
    message: string;
  } | null>(null);

  // Admin confirmed new classrooms modal/state
  const [adminConfirmedNewClassrooms, setAdminConfirmedNewClassrooms] = useState<string[]>([]);
  const [newClassroomToConfirm, setNewClassroomToConfirm] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const teachers = useMemo<Employee[]>(
    () => timetableService.getTeachingStaff().filter(t => t.status === 'Active'),
    [canonicalRows]
  );
  const subjects = useMemo<SubjectItem[]>(
    () => storageService.getSubjects().filter(s => s.isActive !== false),
    [canonicalRows]
  );
  const classrooms = useMemo<ClassroomItem[]>(
    () => storageService.getClassrooms().filter(c => c.isActive !== false),
    [canonicalRows]
  );
  const grades = useMemo<GradeItem[]>(
    () => storageService.getGrades().filter(g => g.isActive !== false),
    [canonicalRows]
  );
  const studyDays = useMemo<string[]>(
    () => storageService.getScheduleConfig().studyDays || [],
    [canonicalRows]
  );

  // Catalog creation from canonical rows
  const catalog = useMemo(() => {
    const memory = loadImportMappingMemory();

    // 1. Teachers: map unique source combinations (Never auto-create unknown teachers)
    const teacherCounts = new Map<string, { sourceValue: string; count: number; code?: string; name?: string }>();
    canonicalRows.forEach(row => {
      const srcName = (row.teacher || '').trim();
      const srcCode = (row.teacherCode || '').trim();
      const key = normalizeImportValue(srcCode || srcName);
      if (!key) return;

      const current = teacherCounts.get(key);
      teacherCounts.set(key, {
        sourceValue: current?.sourceValue || (srcCode && srcName ? `${srcName} (${srcCode})` : srcName || srcCode),
        count: (current?.count || 0) + 1,
        code: srcCode,
        name: srcName,
      });
    });

    const teacherEntries: MappingEntry[] = Array.from(teacherCounts.entries()).map(([key, source]) => {
      const rememberedId = getRememberedMapping(memory, 'teacher', source.sourceValue);
      const remembered = rememberedId ? teachers.find(t => t.id === rememberedId && !!t.teacherCode) : undefined;
      if (remembered) {
        return {
          key,
          sourceValue: source.sourceValue,
          count: source.count,
          autoTargetId: remembered.id,
          suggestionReason: 'مطابقة محفوظة من استيراد سابق',
        };
      }

      const auto = resolveTeacherAuto(source.code || '', source.name || '', teachers);
      return {
        key,
        sourceValue: source.sourceValue,
        count: source.count,
        autoTargetId: auto.teacher?.id,
        suggestionReason: auto.reason,
      };
    });

    // 2. Subjects
    const subjectCounts = new Map<string, { sourceValue: string; count: number }>();
    canonicalRows.forEach(row => {
      const val = (row.subject || '').trim();
      const key = normalizeImportValue(val);
      if (!key) return;
      const current = subjectCounts.get(key);
      subjectCounts.set(key, {
        sourceValue: current?.sourceValue || val,
        count: (current?.count || 0) + 1,
      });
    });

    const subjectEntries: MappingEntry[] = Array.from(subjectCounts.entries()).map(([key, entry]) => {
      const rememberedId = getRememberedMapping(memory, 'subject', entry.sourceValue);
      const remembered = rememberedId ? subjects.find(s => s.id === rememberedId) : undefined;
      if (remembered) {
        return {
          key,
          sourceValue: entry.sourceValue,
          count: entry.count,
          autoTargetId: remembered.id,
          suggestionReason: 'Alias محفوظ للمادة',
        };
      }

      const exact = resolveSubjectExact(entry.sourceValue, subjects);
      if (exact) {
        return {
          key,
          sourceValue: entry.sourceValue,
          count: entry.count,
          autoTargetId: exact.id,
          suggestionReason: 'مطابقة مادة معتمدة',
        };
      }

      const suggestion = suggestSubjectAlias(entry.sourceValue, subjects);
      return {
        key,
        sourceValue: entry.sourceValue,
        count: entry.count,
        suggestedTargetId: suggestion?.id,
        suggestionReason: suggestion ? 'اقتراح ذكي فقط — يحتاج تأكيد أول مرة' : undefined,
      };
    });

    // 3. Classrooms
    const classroomCounts = new Map<string, { sourceValue: string; count: number }>();
    canonicalRows.forEach(row => {
      const val = (row.classroom || '').trim();
      const key = normalizeImportValue(val);
      if (!key) return;
      const current = classroomCounts.get(key);
      classroomCounts.set(key, {
        sourceValue: current?.sourceValue || val,
        count: (current?.count || 0) + 1,
      });
    });

    const classroomEntries: MappingEntry[] = Array.from(classroomCounts.entries()).map(([key, entry]) => {
      const rememberedId = getRememberedMapping(memory, 'classroom', entry.sourceValue);
      const remembered = rememberedId ? classrooms.find(c => c.id === rememberedId) : undefined;
      if (remembered) {
        return {
          key,
          sourceValue: entry.sourceValue,
          count: entry.count,
          autoTargetId: remembered.id,
          suggestionReason: 'مطابقة فصل محفوظة',
        };
      }

      const relatedRows = canonicalRows.filter(
        r => normalizeImportValue(r.classroom) === key
      );
      const gradeVal = relatedRows[0]?.grade || '';
      const auto = resolveClassroomAuto(entry.sourceValue, gradeVal, classrooms, grades);

      return {
        key,
        sourceValue: entry.sourceValue,
        count: entry.count,
        autoTargetId: auto.classroom?.id,
        suggestionReason: auto.reason,
      };
    });

    // 4. Grades
    const gradeCounts = new Map<string, { sourceValue: string; count: number }>();
    canonicalRows.forEach(row => {
      const val = (row.grade || '').trim();
      const key = normalizeImportValue(val);
      if (!key) return;
      const current = gradeCounts.get(key);
      gradeCounts.set(key, {
        sourceValue: current?.sourceValue || val,
        count: (current?.count || 0) + 1,
      });
    });

    const gradeEntries: MappingEntry[] = Array.from(gradeCounts.entries()).map(([key, entry]) => {
      const rememberedId = getRememberedMapping(memory, 'grade', entry.sourceValue);
      const remembered = rememberedId ? grades.find(g => g.id === rememberedId) : undefined;
      if (remembered) {
        return {
          key,
          sourceValue: entry.sourceValue,
          count: entry.count,
          autoTargetId: remembered.id,
          suggestionReason: 'مطابقة صف محفوظة',
        };
      }

      const exact = resolveGradeAuto(entry.sourceValue, grades);
      return {
        key,
        sourceValue: entry.sourceValue,
        count: entry.count,
        autoTargetId: exact?.id,
        suggestionReason: exact ? 'مطابقة صف مؤكدة' : undefined,
      };
    });

    // 5. Days
    const dayCounts = new Map<string, { sourceValue: string; count: number }>();
    canonicalRows.forEach(row => {
      const val = (row.day || '').trim();
      const key = normalizeImportValue(val);
      if (!key) return;
      const current = dayCounts.get(key);
      dayCounts.set(key, {
        sourceValue: current?.sourceValue || val,
        count: (current?.count || 0) + 1,
      });
    });

    const dayEntries: MappingEntry[] = Array.from(dayCounts.entries()).map(([key, entry]) => {
      const remembered = getRememberedMapping(memory, 'day', entry.sourceValue);
      if (remembered && studyDays.includes(remembered)) {
        return {
          key,
          sourceValue: entry.sourceValue,
          count: entry.count,
          autoTargetId: remembered,
          suggestionReason: 'مطابقة يوم محفوظة',
        };
      }

      const normalized = normalizeImportValue(entry.sourceValue);
      const alias = DAY_ALIASES[normalized];
      const exact = studyDays.find(day => normalizeImportValue(day) === normalized);
      const canonical = exact || (alias && studyDays.includes(alias) ? alias : undefined);

      return {
        key,
        sourceValue: entry.sourceValue,
        count: entry.count,
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
  }, [canonicalRows, teachers, subjects, classrooms, grades, studyDays, memoryRevision]);

  const automaticSelections = useMemo(() => {
    const next = emptySelections();
    (Object.keys(catalog) as MappingBucket[]).forEach(bucket => {
      catalog[bucket].forEach(entry => {
        if (entry.autoTargetId) next[bucket][entry.key] = entry.autoTargetId;
      });
    });
    return next;
  }, [catalog]);

  useEffect(() => {
    if (!canonicalRows.length) {
      setSelections(emptySelections());
      return;
    }
    setSelections(automaticSelections);
  }, [canonicalRows, automaticSelections]);

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

  const updateSelection = (bucket: MappingBucket, entry: MappingEntry, targetId: string) => {
    setSelections(prev => ({
      ...prev,
      [bucket]: { ...prev[bucket], [entry.key]: targetId },
    }));
    rememberImportMapping(bucket, entry.sourceValue, targetId);
    setMemoryRevision(value => value + 1);
  };

  const reapplyAutomaticMappings = () => setSelections(automaticSelections);

  const clearSavedMappings = () => {
    clearImportMappingMemory();
    setMemoryRevision(value => value + 1);
    setSelections(emptySelections());
  };

  // Upload handling via AscTimetableImportAdapter
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    processFile(files[0]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) processFile(e.dataTransfer.files[0]);
  };

  const processFile = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsLoading(true);
    setCommitResult(null);
    setSummary(null);
    setParseErrors([]);

    try {
      const parsed = await ascTimetableImportAdapter.parseFile(uploadedFile);
      setFileFormat(parsed.format);
      setDetectedMeta(parsed.detectedMetadata || {});

      if (parsed.errors.length > 0) {
        setParseErrors(parsed.errors);
      }

      if (parsed.canonicalRows.length === 0) {
        alert(parsed.errors[0] || 'الملف فارغ أو لا يحتوي على حصص صالحة.');
        return;
      }

      setCanonicalRows(parsed.canonicalRows);
      setMappingOpen(true);
    } catch (err: any) {
      console.error(err);
      alert(`خطأ أثناء معالجة الملف: ${err.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Admin Confirmation for Unknown Classrooms
  const handleConfirmNewClassroom = (classroomName: string) => {
    if (!adminConfirmedNewClassrooms.includes(classroomName)) {
      setAdminConfirmedNewClassrooms([...adminConfirmedNewClassrooms, classroomName]);
    }
    setNewClassroomToConfirm(null);
  };

  const applyMappingsAndValidate = () => {
    if (!canonicalRows.length) return;
    if (hasBlockingMappings) {
      alert('يجب حل جميع المطابقات المطلوبة أولاً. (ممنوع إنشاء المعلم تلقائياً بدون مطابقة)');
      return;
    }

    setIsLoading(true);
    try {
      const validation = ascTimetableImportAdapter.validateCanonicalRows(canonicalRows, {
        teacher: selections.teacher,
        subject: selections.subject,
        classroom: selections.classroom,
        adminConfirmedNewClassrooms,
      });

      setSummary(validation);
      setMappingOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = () => {
    if (!summary) return;
    setIsLoading(true);
    try {
      const result = timetableService.commitImportBatch(summary, {
        createAssignments: autoCreateAssignments,
      });
      setCommitResult(result);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        اليوم: 'الأحد',
        الحصة: 1,
        الصف: 'الصف الأول الثانوي',
        الفصل: '1/1',
        المادة: 'العلوم التقنية التخصصية',
        'كود المعلم': 'T-001',
        'اسم المعلم': 'أحمد إبراهيم الشناوي',
        القاعة: 'معمل تخصصي 1',
        'أسبوع الخطة': 'ALL',
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'نموذج الجدول');
    XLSX.writeFile(workbook, 'نموذج_استيراد_الجدول_المدرسي_NTSS.xlsx');
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
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            {icon}
            {title}
          </div>
          <span className="text-xs font-bold text-slate-500">
            {progress[bucket].resolved}/{progress[bucket].total} محلول
          </span>
        </div>

        <div className="p-4 space-y-3">
          {entries.map(entry => {
            const selectedId = selections[bucket][entry.key] || '';
            const suggested = entry.suggestedTargetId
              ? options.find(o => o.id === entry.suggestedTargetId)
              : undefined;

            return (
              <div
                key={entry.key}
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 bg-slate-50/50 transition"
              >
                <div className="min-w-[180px]">
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                    <span>{entry.sourceValue}</span>
                    <span className="text-[10px] text-slate-500 font-mono bg-white px-1.5 py-0.5 rounded border">
                      {entry.count} حصة
                    </span>
                  </div>
                  {bucket === 'teacher' && (
                    <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                      لا يتم إنشاء معلم تلقائياً — يلزم تحديد معلم معتمد بكود
                    </div>
                  )}
                </div>

                <div className="flex-1 max-w-md">
                  <select
                    value={selectedId}
                    onChange={e => updateSelection(bucket, entry, e.target.value)}
                    className={`w-full text-xs font-semibold rounded-xl border px-3 py-2 bg-white ${
                      selectedId
                        ? 'border-emerald-300 text-emerald-900'
                        : 'border-amber-300 text-amber-900 bg-amber-50/40'
                    }`}
                  >
                    <option value="">— اختر المطابقة المعتمدة —</option>
                    {options.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label} {opt.teacherCode ? `(${opt.teacherCode})` : ''} {opt.secondary ? `[${opt.secondary}]` : ''}
                      </option>
                    ))}
                  </select>

                  {suggested && !selectedId && (
                    <button
                      type="button"
                      onClick={() => updateSelection(bucket, entry, suggested.id)}
                      className="mt-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      استخدام الاقتراح: {suggested.label}{suggested.teacherCode ? ` (${suggested.teacherCode})` : ''}
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
                      <AlertTriangle className="w-3.5 h-3.5" /> يحتاج اختيار
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
  const subjectOptions = subjects.map(s => ({
    id: s.id,
    label: s.name,
    secondary: s.shortName || '',
  }));
  const classroomOptions = classrooms.map(c => ({
    id: c.id,
    label: c.displayName || c.classroomNumber || c.id,
    secondary: c.gradeName || '',
  }));
  const gradeOptions = grades.map(g => ({
    id: g.id,
    label: g.name,
    secondary: g.shortName || '',
  }));
  const dayOptions = studyDays.map(day => ({ id: day, label: day }));

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            استيراد جدول aSc Timetables ومطابقة البيانات (Adapter)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            يدعم تلقائياً صيغ aSc XML و XLSX و CSV و PDF، مع التحقق الصارم من أنصبة المعلمين (30 حصة) وخطة الفصول (39 حصة).
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition"
        >
          <Download className="w-4 h-4" /> تحميل نموذج Excel
        </button>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-7 bg-white hover:bg-slate-50/50 transition cursor-pointer text-center space-y-3"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.xlsx,.xls,.csv,.pdf"
          onChange={handleFileUpload}
          className="hidden"
        />
        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
          <UploadCloud className="w-6 h-6" />
        </div>
        <div className="text-sm font-bold text-slate-800">
          {file ? file.name : 'اضغط لاختيار ملف aSc Timetables أو اسحب الملف هنا'}
        </div>
        <div className="flex items-center justify-center gap-3 text-xs text-slate-500 font-semibold">
          <span className="flex items-center gap-1"><FileCode className="w-3.5 h-3.5 text-indigo-600" /> aSc XML</span>
          <span>•</span>
          <span className="flex items-center gap-1"><FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> XLSX</span>
          <span>•</span>
          <span className="flex items-center gap-1"><FileType className="w-3.5 h-3.5 text-sky-600" /> CSV</span>
          <span>•</span>
          <span>PDF</span>
        </div>
        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-semibold">
            <RefreshCw className="w-4 h-4 animate-spin" /> جارِ تحليل وتفكيك الملف بواسطة المحول (Adapter)...
          </div>
        )}
      </div>

      {/* Format Detection Info */}
      {fileFormat !== 'UNKNOWN' && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-indigo-900">الصيغة المكتشفة:</span>
            <span className="font-mono px-2 py-0.5 rounded bg-indigo-200/60 font-black text-indigo-800">
              {fileFormat}
            </span>
            {detectedMeta.classesCount && (
              <span className="text-slate-600 mr-2">
                (فصول: {detectedMeta.classesCount} • معلمين: {detectedMeta.teachersCount} • مواد: {detectedMeta.subjectsCount})
              </span>
            )}
          </div>
          <div className="text-indigo-700 font-bold">
            عدد الحصص المستخرجة: {canonicalRows.length} حصة
          </div>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-1 text-xs text-amber-800">
          <div className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> تنبيهات قراءة الملف:
          </div>
          {parseErrors.map((err, i) => (
            <div key={i}>• {err}</div>
          ))}
        </div>
      )}

      {/* Progress Steps */}
      {!!canonicalRows.length && (
        <div className="grid grid-cols-3 gap-2 text-xs font-bold">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 text-center">
            1. فحص واستخراج البيانات ({canonicalRows.length}) ✓
          </div>
          <div
            className={`rounded-xl border p-3 text-center ${
              mappingOpen
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            2. مطابقة المعلمين والمقررات {mappingOpen ? '' : '✓'}
          </div>
          <div
            className={`rounded-xl border p-3 text-center ${
              !mappingOpen && summary
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-slate-50 text-slate-400'
            }`}
          >
            3. التحقق والاعتماد النهائي
          </div>
        </div>
      )}

      {/* Step 2: Mapping Screen */}
      {mappingOpen && !!canonicalRows.length && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-base font-black text-slate-900">
                  <WandSparkles className="w-5 h-5 text-indigo-600" />
                  مطابقة حقول aSc Timetables مع النظام المدرسي
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  قواعد الأمان: لا يتم إنشاء معلم تلقائياً من اسم غير معروف، بل يجب ربطه بمعلم رسمي معتمد. الفصول غير المسجلة يمكن اعتماد إنشائها من الإدارة.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={reapplyAutomaticMappings}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-white px-3 py-2 text-xs font-bold text-indigo-700 shadow-sm"
                >
                  <WandSparkles className="w-4 h-4" /> مطابقة تلقائية آمنة
                </button>
                <button
                  type="button"
                  onClick={() => setSelections(emptySelections())}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600"
                >
                  <RotateCcw className="w-4 h-4" /> إعادة ضبط
                </button>
                <button
                  type="button"
                  onClick={clearSavedMappings}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600"
                >
                  <Trash2 className="w-4 h-4" /> مسح ذاكرة المطابقة
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(
              [
                ['teacher', 'المعلمون'],
                ['subject', 'المواد'],
                ['classroom', 'الفصول'],
                ['grade', 'الصفوف'],
                ['day', 'الأيام'],
              ] as Array<[MappingBucket, string]>
            ).map(([bucket, label]) => (
              <div key={bucket} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                <div
                  className={`text-xl font-black ${
                    progress[bucket].resolved === progress[bucket].total
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {progress[bucket].resolved}/{progress[bucket].total}
                </div>
                <div className="text-[11px] font-bold text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          {renderMappingSection('teacher', 'مطابقة المعلمين (aSc Teacher → teacherCode)', <UserRound className="w-4 h-4 text-indigo-600" />, teacherOptions)}
          {renderMappingSection('subject', 'مطابقة المواد (aSc Subject → Subject Master)', <BookOpen className="w-4 h-4 text-indigo-600" />, subjectOptions)}
          {renderMappingSection('classroom', 'مطابقة الفصول (aSc Class → Classroom)', <School className="w-4 h-4 text-indigo-600" />, classroomOptions)}
          {renderMappingSection('grade', 'مطابقة الصفوف الدراسية', <Layers className="w-4 h-4 text-indigo-600" />, gradeOptions)}
          {renderMappingSection('day', 'توحيد أيام الدراسة', <CalendarDays className="w-4 h-4 text-indigo-600" />, dayOptions)}

          <div className="sticky bottom-3 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur p-4 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              {hasBlockingMappings ? (
                <span className="font-bold text-amber-700">
                  ما زالت توجد قيم غير مطابقة (يلزم إكمال جميع المعلمين والمواد للمتابعة).
                </span>
              ) : (
                <span className="font-bold text-emerald-700">
                  تم حل جميع المطابقات! اضغط للانتقال إلى فحص التعارض والأنصبة.
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={hasBlockingMappings || isLoading}
              onClick={applyMappingsAndValidate}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition"
            >
              <CheckCircle2 className="w-4 h-4" /> فحص التعارضات والأنصبة والاعتماد
            </button>
          </div>
        </div>
      )}

      {/* Commit Result Message */}
      {commitResult && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            commitResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {commitResult.success ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
          <div className="text-sm font-bold">{commitResult.message}</div>
        </div>
      )}

      {/* Step 3: Conflict Validation & Commit */}
      {!mappingOpen && summary && (
        <div className="space-y-5">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-600 font-semibold">
              تم الانتهاء من تدقيق {summary.totalRows} حصة ضد قواعد الجدول، أنصبة المعلمين (أقصى 30 حصة)، وخطة الفصل (39 حصة).
            </div>
            <button
              type="button"
              onClick={() => setMappingOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700"
            >
              <WandSparkles className="w-4 h-4" /> العودة لشاشة المطابقة
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
              <div className="text-2xl font-black">{summary.totalRows}</div>
              <div className="text-xs text-slate-500">إجمالي الحصص</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
              <div className="text-2xl font-black text-emerald-600">{summary.validRowsCount}</div>
              <div className="text-xs text-slate-500">صالحة للاستيراد</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
              <div className="text-2xl font-black text-rose-600">{summary.invalidRowsCount}</div>
              <div className="text-xs text-slate-500">أخطاء مانعة</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
              <div className="text-2xl font-black text-amber-600">{summary.unknownTeacherCodes.length}</div>
              <div className="text-xs text-slate-500">معلم غير معتمد</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
              <div className="text-2xl font-black text-indigo-600">{summary.conflictsFound}</div>
              <div className="text-xs text-slate-500">تعارضات مجدولة</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
              <div className="text-2xl font-black text-purple-600">{summary.loadWarningsFound}</div>
              <div className="text-xs text-slate-500">تنبيهات نصاب (30+)</div>
            </div>
          </div>

          {/* New Classrooms Confirmation Warning */}
          {summary.unknownClassrooms.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                فصول جديدة تحتاج موافقة الإدارة لإنشائها:
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.unknownClassrooms.map(c => (
                  <div key={c} className="flex items-center gap-2 bg-white px-3 py-1 rounded-xl border border-amber-300 text-xs">
                    <span className="font-bold text-slate-800">{c}</span>
                    <button
                      type="button"
                      onClick={() => handleConfirmNewClassroom(c)}
                      className="text-[11px] text-indigo-700 font-bold hover:underline"
                    >
                      تأكيد إنشاء الفصل
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Table Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" /> معاينة الحصص وحالة التدقيق
              </h3>
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoCreateAssignments}
                    onChange={e => setAutoCreateAssignments(e.target.checked)}
                  />
                  تحديث أنصبة المعلمين وسجلات الحصص تلقائياً
                </label>
                <button
                  disabled={summary.validRowsCount === 0 || isLoading}
                  onClick={handleCommit}
                  className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl flex items-center gap-2 shadow-sm transition"
                >
                  <CheckCircle2 className="w-4 h-4" /> اعتماد واستيراد ({summary.validRowsCount}) حصة صالحة
                </button>
              </div>
            </div>

            <div className="max-h-[34rem] overflow-auto">
              <table className="w-full text-right text-xs border-collapse min-w-[1100px]">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold border-b">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">الحالة</th>
                    <th className="p-2.5">اليوم</th>
                    <th className="p-2.5">الحصة</th>
                    <th className="p-2.5">الصف / الفصل</th>
                    <th className="p-2.5">المادة</th>
                    <th className="p-2.5">كود المعلم</th>
                    <th className="p-2.5">اسم المعلم</th>
                    <th className="p-2.5">القاعة</th>
                    <th className="p-2.5">ملاحظات التدقيق والنصاب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.rows.map(row => (
                    <tr
                      key={row.rowNumber}
                      className={`hover:bg-slate-50 ${!row.isValid ? 'bg-rose-50/40' : ''}`}
                    >
                      <td className="p-2.5 font-mono text-slate-400">{row.rowNumber}</td>
                      <td className="p-2.5">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> صالح
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                            <XCircle className="w-3.5 h-3.5" /> مرفوض
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 font-medium">{row.dayOfWeek}</td>
                      <td className="p-2.5 font-bold">{row.periodNumber}</td>
                      <td className="p-2.5">
                        {row.gradeName} - {row.classroomName}
                      </td>
                      <td className="p-2.5 font-semibold">{row.subjectName}</td>
                      <td className="p-2.5 font-mono font-bold text-indigo-700">
                        {row.teacherCode || '—'}
                      </td>
                      <td className="p-2.5">{row.teacherName || '—'}</td>
                      <td className="p-2.5 text-slate-500">{row.roomName || '—'}</td>
                      <td className="p-2.5">
                        {row.errors.map((error, index) => (
                          <div key={`e-${index}`} className="text-rose-600 font-semibold">
                            • {error}
                          </div>
                        ))}
                        {row.warnings.map((warning, index) => (
                          <div key={`w-${index}`} className="text-amber-600">
                            ⚠ {warning}
                          </div>
                        ))}
                        {row.isValid && row.warnings.length === 0 && <span className="text-slate-400">—</span>}
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
