import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Users,
  RefreshCw,
  HelpCircle,
  Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { TimetableImportSummary } from '../../types';
import { timetableService } from '../../services/timetableService';

export const TimetableImportWizardView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<TimetableImportSummary | null>(null);
  const [autoCreateAssignments, setAutoCreateAssignments] = useState(true);
  const [commitResult, setCommitResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawData = XLSX.utils.sheet_to_json(ws);

        if (rawData.length === 0) {
          alert('الملف فارغ أو لا يحتوي على صفوف صالحة');
          setIsLoading(false);
          return;
        }

        const validation = timetableService.parseAndValidateImportData(rawData);
        setSummary(validation);
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء قراءة الملف، يرجى التأكد من صيغة Excel الصحيحة');
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(uploadedFile);
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
      {
        اليوم: 'الأحد',
        الحصة: 2,
        الصف: 'الصف الأول الثانوي',
        الفصل: '1/1',
        المادة: 'العلوم التقنية التخصصية (نظري)',
        'كود المعلم': 'T-002',
        'اسم المعلم': 'سامح خيري محمود',
        القاعة: 'معمل حاسب 1',
        'أسبوع الخطة': 'ALL',
      },
      {
        اليوم: 'الأحد',
        الحصة: 3,
        الصف: 'الصف الأول الثانوي',
        الفصل: '1/1',
        المادة: 'الإرشاد والتوجيه المهني',
        'كود المعلم': 'T-003',
        'اسم المعلم': 'مروة عبد الرحمن السيد',
        القاعة: 'قاعة 101',
        'أسبوع الخطة': 'A',
      },
      {
        اليوم: 'الأحد',
        الحصة: 3,
        الصف: 'الصف الأول الثانوي',
        الفصل: '1/1',
        المادة: 'ريادة الأعمال والابتكار',
        'كود المعلم': 'T-004',
        'اسم المعلم': 'محمود عبد الفتاح شحاتة',
        القاعة: 'قاعة 101',
        'أسبوع الخطة': 'B',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'نموذج الجدول');
    XLSX.writeFile(wb, 'نموذج_استيراد_الجدول_المدرسي_NTSS.xlsx');
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            معالج استيراد ومطابقة الجدول المدرسي
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            استيراد ملفات Excel/CSV مع التحقق التلقائي، مطابقة كود المعلم، وكشف التعارضات وتجاوز النصاب
          </p>
        </div>

        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition"
        >
          <Download className="w-4 h-4" />
          تحميل نموذج استيراد Excel
        </button>
      </div>

      {/* Upload Box */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-8 bg-white hover:bg-slate-50/50 transition cursor-pointer text-center space-y-3"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          className="hidden"
        />
        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <UploadCloud className="w-6 h-6" />
        </div>
        <div>
          <div className="text-sm font-bold text-slate-800">
            {file ? file.name : 'اضغط لاختيار ملف Excel أو اسحب الملف وأفلته هنا'}
          </div>
          <p className="text-xs text-slate-500 mt-1">يدعم ملفات .xlsx, .xls, .csv</p>
        </div>
        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-semibold pt-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            جارِ معالجة ومطابقة البيانات...
          </div>
        )}
      </div>

      {/* Success / Result alert */}
      {commitResult && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            commitResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {commitResult.success ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
          ) : (
            <XCircle className="w-6 h-6 text-rose-600 flex-shrink-0" />
          )}
          <div className="text-sm font-bold">{commitResult.message}</div>
        </div>
      )}

      {/* Validation Summary */}
      {summary && (
        <div className="space-y-6">
          {/* Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <div className="text-2xl font-black text-slate-800">{summary.totalRows}</div>
              <div className="text-xs text-slate-500 mt-1">إجمالي الصفوف</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <div className="text-2xl font-black text-emerald-600">{summary.validRowsCount}</div>
              <div className="text-xs text-slate-500 mt-1">صفوف صالحة</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <div className="text-2xl font-black text-rose-600">{summary.invalidRowsCount}</div>
              <div className="text-xs text-slate-500 mt-1">صفوف بها أخطاء</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <div className="text-2xl font-black text-amber-600">{summary.unknownTeacherCodes.length}</div>
              <div className="text-xs text-slate-500 mt-1">معلم غير معروف</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <div className="text-2xl font-black text-indigo-600">{summary.conflictsFound}</div>
              <div className="text-xs text-slate-500 mt-1">تعارضات مكتشفة</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <div className="text-2xl font-black text-purple-600">{summary.loadWarningsFound}</div>
              <div className="text-xs text-slate-500 mt-1">تنبيهات النصاب</div>
            </div>
          </div>

          {/* Unknown Teachers Alert */}
          {summary.unknownTeacherCodes.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-rose-800">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                أكواد معلمين غير مسجلة بقاعدة بيانات المدرسة:
              </div>
              <p className="text-xs text-rose-700">
                قاعدة النظام: "كود المعلم هو المرجع الأساسي للمطابقة، ولا يتم إنشاء معلمين وهميين تلقائياً". يرجى تسجيل
                المعلمين بهيكل العاملين وتعيين أكوادهم، أو تعديل الكود في الملف:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {summary.unknownTeacherCodes.map(code => (
                  <span key={code} className="px-2.5 py-1 rounded bg-white border border-rose-300 text-rose-800 text-xs font-mono font-bold">
                    {code}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Table Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                معاينة الصفوف وحالة التدقيق
              </h3>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCreateAssignments}
                    onChange={e => setAutoCreateAssignments(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  إنشاء وتحديث إسناد الحصص للمعلمين تلقائياً (TeacherTeachingAssignments)
                </label>
                <button
                  disabled={summary.validRowsCount === 0 || isLoading}
                  onClick={handleCommit}
                  className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl shadow-sm transition flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  اعتماد واستيراد ({summary.validRowsCount}) حصة صالحة
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-right text-xs border-collapse">
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
                    <th className="p-2.5">ملاحظات التدقيق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.rows.map(r => (
                    <tr key={r.rowNumber} className={`hover:bg-slate-50 ${!r.isValid ? 'bg-rose-50/40' : ''}`}>
                      <td className="p-2.5 font-mono text-slate-400">{r.rowNumber}</td>
                      <td className="p-2.5">
                        {r.isValid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> صالح
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                            <XCircle className="w-3.5 h-3.5" /> مرفوض
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 font-medium text-slate-800">{r.dayOfWeek}</td>
                      <td className="p-2.5 font-bold text-slate-700">{r.periodNumber}</td>
                      <td className="p-2.5 text-slate-600">
                        {r.gradeName} - {r.classroomName}
                      </td>
                      <td className="p-2.5 font-semibold text-slate-800">{r.subjectName}</td>
                      <td className="p-2.5 font-mono font-bold text-indigo-700">{r.teacherCode}</td>
                      <td className="p-2.5 text-slate-700">{r.teacherName || '—'}</td>
                      <td className="p-2.5 text-slate-500">{r.roomName || '—'}</td>
                      <td className="p-2.5">
                        {r.errors.length > 0 && (
                          <div className="text-rose-600 font-semibold space-y-0.5">
                            {r.errors.map((err, i) => (
                              <div key={i}>• {err}</div>
                            ))}
                          </div>
                        )}
                        {r.warnings.length > 0 && (
                          <div className="text-amber-600 space-y-0.5 mt-0.5">
                            {r.warnings.map((w, i) => (
                              <div key={i}>⚠ {w}</div>
                            ))}
                          </div>
                        )}
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
