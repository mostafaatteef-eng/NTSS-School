import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Employee, EmployeeType } from '../../types';
import { storageService } from '../../services/storageService';

interface StaffImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type RowStatus = 'new' | 'update' | 'duplicate' | 'invalid' | 'manual_review';

interface AnalyzedStaffRow {
  rowNumber: number;
  id?: string;
  name: string;
  employeeType: EmployeeType;
  jobTitle: string;
  specialization: string;
  teacherCode?: string;
  nationalId?: string;
  phone?: string;
  email?: string;
  hireDate?: string;
  status: 'Active' | 'Inactive';
  statusType: RowStatus;
  statusMessage: string;
  matchedExistingId?: string;
}

export const StaffImportModal: React.FC<StaffImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [analyzedRows, setAnalyzedRows] = useState<AnalyzedStaffRow[]>([]);
  const [importOnlyValid, setImportOnlyValid] = useState(true);
  const [securityWarning, setSecurityWarning] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<{ added: number; updated: number; skipped: number }>({
    added: 0,
    updated: 0,
    skipped: 0,
  });

  if (!isOpen) return null;

  // Download Sample Template for Staff
  const downloadSampleTemplate = () => {
    const sampleData = [
      {
        'الاسم': 'محمد أحمد حسن عبد الرحيم',
        'نوع الموظف': 'معلم',
        'المسمى الوظيفي': 'معلم أول رياضيات',
        'التخصص': 'رياضيات',
        'كود المعلم': 'T-101',
        'الرقم القومي': '28509140101234',
        'الهاتف': '01012345678',
        'البريد الإلكتروني': 'mohamed.ahmed@school.edu.eg',
        'تاريخ التعيين': '2022-09-01',
        'الحالة': 'نشط',
      },
      {
        'الاسم': 'أحمد إبراهيم السيد محمود',
        'نوع الموظف': 'إداري',
        'المسمى الوظيفي': 'أخصائي شؤون طلاب',
        'التخصص': 'شؤون طلاب',
        'كود المعلم': '',
        'الرقم القومي': '29003150109876',
        'الهاتف': '01123456789',
        'البريد الإلكتروني': 'ahmed.sayed@school.edu.eg',
        'تاريخ التعيين': '2023-10-15',
        'الحالة': 'نشط',
      },
      {
        'الاسم': 'سارة مصطفى علي إبراهيم',
        'نوع الموظف': 'معلم',
        'المسمى الوظيفي': 'معلم لغة إنجليزية',
        'التخصص': 'لغة إنجليزية',
        'كود المعلم': 'T-102',
        'الرقم القومي': '29511200105432',
        'الهاتف': '01234567890',
        'البريد الإلكتروني': 'sara.mostafa@school.edu.eg',
        'تاريخ التعيين': '2024-02-01',
        'الحالة': 'نشط',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'العاملين_والمعلمين');
    XLSX.writeFile(wb, 'نموذج_استيراد_بيانات_العاملين_NTSS.xlsx');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSecurityWarning(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (!rawData || rawData.length <= 1) {
          alert('الملف فارغ أو لا يحتوي على صفوف بيانات.');
          return;
        }

        const headers = (rawData[0] || []).map(h => String(h || '').trim());

        // Forbidden columns detection: Salary, Password, Password Hash
        const forbiddenFound: string[] = [];
        headers.forEach(h => {
          const lower = h.toLowerCase();
          if (
            lower.includes('salary') ||
            lower.includes('راتب') ||
            lower.includes('مرتب') ||
            lower.includes('wage') ||
            lower.includes('password') ||
            lower.includes('كلمة السر') ||
            lower.includes('كلمة المرور') ||
            lower.includes('hash')
          ) {
            forbiddenFound.push(h);
          }
        });

        if (forbiddenFound.length > 0) {
          setSecurityWarning(
            `تنبيه أمني: تم اكتشاف أعمدة محظورة استيرادها (${forbiddenFound.join(', ')}). تم حجب وتجاهل هذه البيانات تلقائياً عملاً بضوابط الخصوصية والأمان.`
          );
        }

        // Map column indexes
        const colMap: Record<string, number> = {};
        headers.forEach((h, idx) => {
          const clean = h.trim();
          if (clean === 'الاسم' || clean === 'اسم الموظف' || clean === 'اسم المعلم' || clean.toLowerCase() === 'name') colMap['name'] = idx;
          else if (clean === 'نوع الموظف' || clean === 'النوع الوظيفي' || clean.toLowerCase() === 'type') colMap['type'] = idx;
          else if (clean === 'المسمى الوظيفي' || clean === 'الوظيفة' || clean.toLowerCase() === 'jobtitle') colMap['jobTitle'] = idx;
          else if (clean === 'التخصص' || clean === 'المادة' || clean.toLowerCase() === 'specialization') colMap['specialization'] = idx;
          else if (clean === 'كود المعلم' || clean.toLowerCase() === 'teachercode') colMap['teacherCode'] = idx;
          else if (clean === 'رقم الموظف' || clean === 'كود الموظف' || clean.toLowerCase() === 'id' || clean.toLowerCase() === 'employeeid') colMap['id'] = idx;
          else if (clean === 'الرقم القومي' || clean.toLowerCase() === 'nationalid') colMap['nationalId'] = idx;
          else if (clean === 'الهاتف' || clean === 'رقم الهاتف' || clean.toLowerCase() === 'phone') colMap['phone'] = idx;
          else if (clean === 'البريد الإلكتروني' || clean.toLowerCase() === 'email') colMap['email'] = idx;
          else if (clean === 'تاريخ التعيين' || clean.toLowerCase() === 'hiredate') colMap['hireDate'] = idx;
          else if (clean === 'الحالة' || clean.toLowerCase() === 'status') colMap['status'] = idx;
        });

        const existingEmployees = storageService.getEmployees();
        const analyzed: AnalyzedStaffRow[] = [];
        const seenNationalIdsInFile = new Set<string>();
        const seenIdsInFile = new Set<string>();

        const dataRows = rawData.slice(1);
        dataRows.forEach((row, rIdx) => {
          // Skip completely empty rows
          if (!row || !row.some((cell: any) => cell !== undefined && String(cell).trim() !== '')) return;

          const rowNum = rIdx + 2;
          const rawName = colMap['name'] !== undefined ? String(row[colMap['name']] || '').trim() : '';
          const rawType = colMap['type'] !== undefined ? String(row[colMap['type']] || '').trim() : '';
          const rawJob = colMap['jobTitle'] !== undefined ? String(row[colMap['jobTitle']] || '').trim() : '';
          const rawSpec = colMap['specialization'] !== undefined ? String(row[colMap['specialization']] || '').trim() : '';
          const rawTeacherCode = colMap['teacherCode'] !== undefined ? String(row[colMap['teacherCode']] || '').trim() : '';
          const rawId = colMap['id'] !== undefined ? String(row[colMap['id']] || '').trim() : '';
          const rawNationalId = colMap['nationalId'] !== undefined ? String(row[colMap['nationalId']] || '').trim() : '';
          const rawPhone = colMap['phone'] !== undefined ? String(row[colMap['phone']] || '').trim() : '';
          const rawEmail = colMap['email'] !== undefined ? String(row[colMap['email']] || '').trim() : '';
          const rawHireDate = colMap['hireDate'] !== undefined ? String(row[colMap['hireDate']] || '').trim() : '';
          const rawStatus = colMap['status'] !== undefined ? String(row[colMap['status']] || '').trim() : '';

          // Determine employee type
          let employeeType: EmployeeType = 'Administrative';
          if (
            rawType === 'معلم' ||
            rawType.toLowerCase() === 'teacher' ||
            rawJob.includes('معلم') ||
            rawJob.includes('مدرس') ||
            rawTeacherCode !== ''
          ) {
            employeeType = 'Teacher';
          }

          const status: 'Active' | 'Inactive' = rawStatus === 'غير نشط' || rawStatus === 'Inactive' || rawStatus === 'معطل' ? 'Inactive' : 'Active';

          // Validation
          let statusType: RowStatus = 'new';
          let statusMessage = 'سجل صالح وجديد';
          let matchedExistingId: string | undefined = undefined;

          if (!rawName) {
            statusType = 'invalid';
            statusMessage = 'خطأ: اسم الموظف مطلوب ولا يمكن تركه فارغاً';
          } else if (employeeType === 'Teacher' && !rawTeacherCode && !rawId) {
            // Teacher code is required for teachers unless it will be generated
            // Prompt: "Teacher code required for teachers only"
            statusType = 'invalid';
            statusMessage = 'خطأ: كود المعلم مطلوب للمعلمين';
          } else if (rawNationalId && !/^\d{14}$/.test(rawNationalId)) {
            statusType = 'invalid';
            statusMessage = 'خطأ: الرقم القومي يجب أن يتكون من 14 رقماً';
          } else if (rawId && seenIdsInFile.has(rawId)) {
            statusType = 'duplicate';
            statusMessage = 'خطأ: كود الموظف مكرر أكثر من مرة في نفس الملف';
          } else if (rawNationalId && seenNationalIdsInFile.has(rawNationalId)) {
            statusType = 'duplicate';
            statusMessage = 'خطأ: الرقم القومي مكرر أكثر من مرة في نفس الملف';
          } else {
            // Check Matching against existing employees in database
            // Strategy: 1) immutable id if present, 2) unique nationalId if present.
            // Do NOT rely on name alone for automatic update (similar name -> Manual Review).
            let matchedEmp: Employee | undefined = undefined;

            if (rawId) {
              matchedEmp = existingEmployees.find(e => e.id === rawId || e.employeeId === rawId);
            }
            if (!matchedEmp && rawNationalId) {
              matchedEmp = existingEmployees.find(e => e.nationalId && e.nationalId.trim() === rawNationalId);
            }

            if (matchedEmp) {
              statusType = 'update';
              statusMessage = `تحديث موظف موجود (${matchedEmp.name})`;
              matchedExistingId = matchedEmp.id;
            } else {
              // Check for similar name to prevent blind accidental overwriting
              const similarNameEmp = existingEmployees.find(e => {
                const n1 = e.name.trim().replace(/\s+/g, ' ');
                const n2 = rawName.trim().replace(/\s+/g, ' ');
                return n1 === n2;
              });

              if (similarNameEmp) {
                statusType = 'manual_review';
                statusMessage = `مراجعة يدوية: يوجد موظف مسجل بنفس الاسم (${similarNameEmp.id}) لكن بدون تطابق كود أو رقم قومي`;
              }
            }
          }

          if (rawId) seenIdsInFile.add(rawId);
          if (rawNationalId) seenNationalIdsInFile.add(rawNationalId);

          analyzed.push({
            rowNumber: rowNum,
            id: rawId || undefined,
            name: rawName,
            employeeType,
            jobTitle: rawJob || (employeeType === 'Teacher' ? 'معلم' : 'إداري'),
            specialization: rawSpec || (employeeType === 'Teacher' ? 'تعليم عام' : 'إدارة عامة'),
            teacherCode: rawTeacherCode || undefined,
            nationalId: rawNationalId || undefined,
            phone: rawPhone || undefined,
            email: rawEmail || undefined,
            hireDate: rawHireDate || new Date().toISOString().split('T')[0],
            status,
            statusType,
            statusMessage,
            matchedExistingId,
          });
        });

        setAnalyzedRows(analyzed);
        setStep('preview');
      } catch (err) {
        console.error('Error parsing staff excel:', err);
        alert('حدث خطأ أثناء قراءة الملف، يرجى التأكد من اختيار ملف Excel أو CSV صالح.');
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleExecuteImport = async () => {
    setIsProcessing(true);

    try {
      // Filter records: do NOT save any invalid row automatically!
      // Only rows with status 'new' or 'update' are saved.
      const rowsToSave = analyzedRows.filter(r => {
        if (importOnlyValid) {
          return r.statusType === 'new' || r.statusType === 'update';
        }
        return r.statusType !== 'invalid' && r.statusType !== 'duplicate';
      });

      if (rowsToSave.length === 0) {
        alert('لا توجد سجلات صالحة للاستيراد!');
        setIsProcessing(false);
        return;
      }

      const payload: Partial<Employee>[] = rowsToSave.map(r => ({
        id: r.matchedExistingId || r.id,
        name: r.name,
        employeeType: r.employeeType,
        jobTitle: r.jobTitle,
        specialization: r.specialization,
        teacherCode: r.employeeType === 'Teacher' ? r.teacherCode : undefined,
        nationalId: r.nationalId,
        phone: r.phone,
        email: r.email,
        hireDate: r.hireDate,
        status: r.status,
      }));

      const res = storageService.bulkSaveEmployees(payload);
      setStats({
        added: res.added,
        updated: res.updated,
        skipped: analyzedRows.length - (res.added + res.updated),
      });

      setStep('result');
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      console.error('Error executing staff import:', err);
      alert('حدث خطأ أثناء حفظ بيانات الاستيراد');
    } finally {
      setIsProcessing(false);
    }
  };

  const countNew = analyzedRows.filter(r => r.statusType === 'new').length;
  const countUpdate = analyzedRows.filter(r => r.statusType === 'update').length;
  const countDuplicate = analyzedRows.filter(r => r.statusType === 'duplicate').length;
  const countInvalid = analyzedRows.filter(r => r.statusType === 'invalid').length;
  const countReview = analyzedRows.filter(r => r.statusType === 'manual_review').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl overflow-hidden my-6">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                استيراد بيانات العاملين والمعلمين (Excel / CSV)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                استيراد موحد وآمن لكادر المدرسة مع فحص التكرار والمطابقة الذكية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {securityWarning && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed font-medium">{securityWarning}</p>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-6">
              {/* Guidelines & Download template */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <HelpCircle className="w-4 h-4 text-teal-600" />
                    <span>تعليمات وضوابط استيراد العاملين:</span>
                  </div>
                  <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                    <li>الملفات المدعومة: <code className="text-teal-700 bg-teal-50 px-1 py-0.5 rounded font-mono">.xlsx</code>, <code className="text-teal-700 bg-teal-50 px-1 py-0.5 rounded font-mono">.xls</code>, <code className="text-teal-700 bg-teal-50 px-1 py-0.5 rounded font-mono">.csv</code></li>
                    <li>الأعمدة المطلوبة: الاسم، نوع الموظف (معلم / إداري)، المسمى الوظيفي، التخصص</li>
                    <li><strong>كود المعلم مطلوب فقط للمعلمين</strong> لربط الجدول الدراسي وحصص التدريس</li>
                    <li><strong className="text-rose-600">محظور استيراد:</strong> الرواتب، كلمات المرور أو التجزئة المشفرة عملاً بسياسة الأمان المعتمدة</li>
                  </ul>
                </div>
                <button
                  onClick={downloadSampleTemplate}
                  className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white border border-teal-200 text-teal-700 hover:bg-teal-50 font-bold text-xs rounded-xl shadow-xs transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل النموذج الاسترشادي Excel</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-3xl p-10 text-center transition-all bg-slate-50/50 hover:bg-teal-50/20">
                <input
                  type="file"
                  id="staff-file-upload-input"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="staff-file-upload-input"
                  className="cursor-pointer flex flex-col items-center justify-center gap-3"
                >
                  <div className="w-16 h-16 rounded-3xl bg-white shadow-md text-teal-600 flex items-center justify-center">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-800">
                      اضغط هنا لاختيار ملف بيانات العاملين أو اسحبه إلى هنا
                    </p>
                    <p className="text-xs text-slate-500">
                      يدعم بصيغة Excel أو CSV بحد أقصى 5MB
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-5">
              {/* Summary Stats Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
                  <div className="text-lg font-bold text-emerald-700">{countNew}</div>
                  <div className="text-xs text-emerald-600 font-medium">جديد (إضافة)</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-center">
                  <div className="text-lg font-bold text-blue-700">{countUpdate}</div>
                  <div className="text-xs text-blue-600 font-medium">تحديث بيانات</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center">
                  <div className="text-lg font-bold text-amber-700">{countReview}</div>
                  <div className="text-xs text-amber-600 font-medium">مراجعة يدوية</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 text-center">
                  <div className="text-lg font-bold text-purple-700">{countDuplicate}</div>
                  <div className="text-xs text-purple-600 font-medium">مكرر بالملف</div>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-center">
                  <div className="text-lg font-bold text-rose-700">{countInvalid}</div>
                  <div className="text-xs text-rose-600 font-medium">غير صالح</div>
                </div>
              </div>

              {/* Toggle to import only valid */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-3 px-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={importOnlyValid}
                    onChange={(e) => setImportOnlyValid(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>استيراد السجلات الصالحة فقط (الجديدة والمحدثة تلقائياً)، واستبعاد الأخطاء والمكررات</span>
                </label>
                <div className="text-xs text-slate-500">
                  إجمالي الصفوف: <strong>{analyzedRows.length}</strong>
                </div>
              </div>

              {/* Table Preview */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[380px] overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/75 text-slate-600 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">الحالة والمطابقة</th>
                      <th className="p-3">الاسم</th>
                      <th className="p-3">نوع الموظف</th>
                      <th className="p-3">المسمى الوظيفي</th>
                      <th className="p-3">التخصص</th>
                      <th className="p-3">كود المعلم</th>
                      <th className="p-3">الرقم القومي</th>
                      <th className="p-3">الهاتف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analyzedRows.map((r) => {
                      let badge = (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> جديد
                        </span>
                      );

                      if (r.statusType === 'update') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <RefreshCw className="w-3.5 h-3.5" /> تحديث
                          </span>
                        );
                      } else if (r.statusType === 'manual_review') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200" title={r.statusMessage}>
                            <AlertTriangle className="w-3.5 h-3.5" /> مراجعة
                          </span>
                        );
                      } else if (r.statusType === 'duplicate') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200" title={r.statusMessage}>
                            <Copy className="w-3.5 h-3.5" /> مكرر
                          </span>
                        );
                      } else if (r.statusType === 'invalid') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200" title={r.statusMessage}>
                            <AlertCircle className="w-3.5 h-3.5" /> غير صالح
                          </span>
                        );
                      }

                      return (
                        <tr key={r.rowNumber} className={r.statusType === 'invalid' ? 'bg-rose-50/30' : r.statusType === 'manual_review' ? 'bg-amber-50/20' : ''}>
                          <td className="p-3 font-mono text-slate-400">{r.rowNumber}</td>
                          <td className="p-3 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              {badge}
                              <span className="text-[10px] text-slate-500 max-w-[180px] truncate" title={r.statusMessage}>
                                {r.statusMessage}
                              </span>
                            </div>
                          </td>
                          <td className="p-3 font-bold text-slate-800">{r.name}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${r.employeeType === 'Teacher' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                              {r.employeeType === 'Teacher' ? 'معلم' : 'إداري'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-700">{r.jobTitle}</td>
                          <td className="p-3 text-slate-700">{r.specialization}</td>
                          <td className="p-3 font-mono text-slate-600">{r.teacherCode || '-'}</td>
                          <td className="p-3 font-mono text-slate-600">{r.nationalId || '-'}</td>
                          <td className="p-3 font-mono text-slate-600">{r.phone || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'result' && (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">
                تم استيراد وحفظ بيانات العاملين بنجاح!
              </h3>
              <div className="flex justify-center gap-4 text-xs font-bold pt-2">
                <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
                  تمت الإضافة: {stats.added}
                </span>
                <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-200">
                  تم التحديث: {stats.updated}
                </span>
                <span className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl border border-slate-200">
                  تم الاستبعاد / التخطي: {stats.skipped}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          {step === 'upload' && (
            <div className="flex items-center justify-end w-full gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                إلغاء
              </button>
            </div>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('upload')}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <ArrowRight className="w-4 h-4" />
                <span>اختيار ملف آخر</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  id="btn-confirm-import-staff"
                  onClick={handleExecuteImport}
                  disabled={isProcessing || (countNew === 0 && countUpdate === 0)}
                  className="px-5 py-2.5 text-xs font-bold bg-[#008e8b] hover:bg-teal-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>تأكيد وحفظ الاستيراد ({countNew + countUpdate} سجل)</span>
                </button>
              </div>
            </>
          )}

          {step === 'result' && (
            <div className="flex justify-end w-full">
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-xs font-bold bg-[#008e8b] hover:bg-teal-700 text-white rounded-xl shadow-xs transition-colors"
              >
                إغلاق
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
