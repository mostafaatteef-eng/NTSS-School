import React, { useState } from 'react';
import {
  QualityStandard,
  QualityApplicableTo,
  User,
} from '../../types';
import { storageService } from '../../services/storageService';
import {
  Award,
  Download,
  FileSpreadsheet,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  UploadCloud,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
  currentUser: User | null;
  standards: QualityStandard[];
  onRefresh: () => void;
  canManage: boolean;
}

export const EtqanStandardsManager: React.FC<Props> = ({
  currentUser,
  standards,
  onRefresh,
  canManage,
}) => {
  const [activeDomainFilter, setActiveDomainFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStandard, setEditingStandard] = useState<QualityStandard | null>(null);

  // Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<Partial<QualityStandard>[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<QualityStandard>>({
    code: '',
    domain: 'البيئة المدرسية والتعليمية',
    standard: '',
    indicator: '',
    description: '',
    weight: 10,
    evaluationScale: 4,
    evidenceRequired: true,
    applicableTo: ['DAILY_REPORT', 'TEACHER_VISIT', 'COMPREHENSIVE_EVALUATION'],
    isActive: true,
  });

  const domains = Array.from(new Set(standards.map(s => s.domain).filter(Boolean)));

  const filteredStandards = standards.filter(std => {
    if (activeDomainFilter !== 'ALL' && std.domain !== activeDomainFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = std.code?.toLowerCase().includes(q);
      const matchStandard = std.standard?.toLowerCase().includes(q);
      const matchIndicator = std.indicator?.toLowerCase().includes(q);
      const matchDomain = std.domain?.toLowerCase().includes(q);
      if (!matchCode && !matchStandard && !matchIndicator && !matchDomain) return false;
    }
    return true;
  });

  const handleOpenNew = () => {
    setEditingStandard(null);
    setFormData({
      code: `STD-${standards.length + 1}`,
      domain: 'التدريس والتعلم الفعّال',
      standard: '',
      indicator: '',
      description: '',
      weight: 10,
      evaluationScale: 4,
      evidenceRequired: true,
      applicableTo: ['DAILY_REPORT', 'TEACHER_VISIT', 'COMPREHENSIVE_EVALUATION'],
      isActive: true,
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (std: QualityStandard) => {
    setEditingStandard(std);
    setFormData({ ...std });
    setIsFormOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.domain || !formData.standard || !formData.indicator) {
      alert('يرجى ملء جميع الحقول المطلوبة للمعيار والمؤشر.');
      return;
    }

    const res = storageService.saveQualityStandard(
      {
        ...formData,
        id: editingStandard ? editingStandard.id : undefined,
      },
      currentUser
    );

    if (res.success) {
      setIsFormOpen(false);
      onRefresh();
    } else {
      alert(res.message);
    }
  };

  const handleDelete = (std: QualityStandard) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف المعيار [${std.code}]؟`)) return;
    const res = storageService.deleteQualityStandard(std.id, currentUser);
    if (res.success) {
      onRefresh();
    } else {
      alert(res.message);
    }
  };

  // --- XLSX / CSV Import Handling ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (!json || json.length === 0) {
          setImportError('الملف فارغ أو لم يتم العثور على صفوف صالحة.');
          return;
        }

        // Map columns dynamically
        const parsedList: Partial<QualityStandard>[] = json.map((row, index) => {
          const code = row['الكود'] || row['code'] || row['Code'] || `ETQ-${index + 1}`;
          const domain = row['المجال'] || row['domain'] || row['Domain'] || 'عام';
          const standard = row['المعيار'] || row['standard'] || row['Standard'] || '';
          const indicator = row['المؤشر'] || row['indicator'] || row['Indicator'] || '';
          const description = row['الوصف'] || row['description'] || row['Description'] || '';
          const weight = parseFloat(row['الوزن'] || row['weight'] || row['Weight']) || 10;
          const evaluationScale = parseInt(row['مقياس التقييم'] || row['evaluationScale'] || row['Scale'] || '4', 10);
          const evidenceRequired = String(row['يتطلب أدلة'] || row['evidenceRequired'] || 'true').toLowerCase() === 'true';

          let applicableTo: QualityApplicableTo[] = ['DAILY_REPORT', 'TEACHER_VISIT', 'COMPREHENSIVE_EVALUATION'];
          const rawApplicable = row['يطبق على'] || row['applicableTo'];
          if (rawApplicable && typeof rawApplicable === 'string') {
            const splitted = rawApplicable.split(/[,;\s]+/).map(s => s.trim().toUpperCase());
            const filtered = splitted.filter((s): s is QualityApplicableTo =>
              ['DAILY_REPORT', 'TEACHER_VISIT', 'COMPREHENSIVE_EVALUATION'].includes(s)
            );
            if (filtered.length > 0) applicableTo = filtered;
          }

          return {
            code: String(code).trim(),
            domain: String(domain).trim(),
            standard: String(standard).trim(),
            indicator: String(indicator).trim(),
            description: String(description).trim(),
            weight,
            evaluationScale,
            evidenceRequired,
            applicableTo,
            isActive: true,
          };
        }).filter(item => item.indicator && item.standard);

        if (parsedList.length === 0) {
          setImportError('لم يتم العثور على معايير صالحة. تأكد من وجود أعمدة: المعيار، المؤشر، المجال، الكود.');
          return;
        }

        setImportPreviewData(parsedList);
      } catch (err: any) {
        setImportError(`خطأ أثناء قراءة الملف: ${err.message || 'صيغة غير مدعومة'}`);
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleConfirmImport = () => {
    if (importPreviewData.length === 0) return;
    const res = storageService.importQualityStandards(importPreviewData, currentUser);
    if (res.success) {
      setIsImportModalOpen(false);
      setImportPreviewData([]);
      onRefresh();
      alert(res.message);
    } else {
      alert(res.message);
    }
  };

  const handleExportTemplate = () => {
    const templateData = [
      {
        'الكود': 'ETQ-LRN-01',
        'المجال': 'التدريس والتعلم الفعّال',
        'المعيار': 'التخطيط الفعّال للدرس وتكامل الأهداف',
        'المؤشر': 'صياغة أهداف سلوكية قابلة للقياس واستخدام استراتيجيات تعلم نشط',
        'الوصف': 'يُظهر المعلم في دفتر تحضيره وممارسته الصفية مراعاة الفروق الفردية وربط الدرس بالحياة',
        'الوزن': 15,
        'مقياس التقييم': 4,
        'يتطلب أدلة': 'true',
        'يطبق على': 'DAILY_REPORT, TEACHER_VISIT, COMPREHENSIVE_EVALUATION',
      },
      {
        'الكود': 'ETQ-ENV-02',
        'المجال': 'البيئة المدرسية والانضباط',
        'المعيار': 'تأمين بيئة تعليمية آمنة وصحية ومحفزة',
        'المؤشر': 'نظافة الفصول وجاهزية الإضاءة والتهوية ووسائل السلامة وتوافر الوسائل',
        'الوصف': 'فحص دوري لمرافق المدرسة وسلامة المقاعد وطفايات الحريق ومخارج الطوارئ',
        'الوزن': 10,
        'مقياس التقييم': 4,
        'يتطلب أدلة': 'true',
        'يطبق على': 'DAILY_REPORT, COMPREHENSIVE_EVALUATION',
      },
      {
        'الكود': 'ETQ-MNG-03',
        'المجال': 'القيادة والإدارة المدرسية',
        'المعيار': 'متابعة الخطط التشغيلية وتوثيق المؤشرات',
        'المؤشر': 'اكتمال سجلات المتابعة الإدارية وتفعيل اللجان المدرسية',
        'الوصف': 'التزام الكادر الإداري بتنفيذ التوصيات ومتابعة نتائج الطلاب',
        'الوزن': 20,
        'مقياس التقييم': 5,
        'يتطلب أدلة': 'true',
        'يطبق على': 'COMPREHENSIVE_EVALUATION',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'معايير إتقان');
    XLSX.writeFile(wb, 'نموذج_استيراد_معايير_إتقان.xlsx');
  };

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-6 h-6 text-indigo-600" />
            دليل ومعايير إتقان (Master Data)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            إدارة المعايير والمؤشرات المعتمدة لتقييم الجودة والزيارات الصفية والتقييم الشامل لكل مدرسة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            id="export-etqan-template-btn"
            onClick={handleExportTemplate}
            className="px-3.5 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            تحميل نموذج Excel
          </button>

          {canManage && (
            <>
              <button
                id="import-etqan-modal-open-btn"
                onClick={() => {
                  setImportPreviewData([]);
                  setImportError(null);
                  setIsImportModalOpen(true);
                }}
                className="px-3.5 py-2 text-sm bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium rounded-lg flex items-center gap-2 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" />
                استيراد معايير إتقان (XLSX / CSV)
              </button>

              <button
                id="create-new-standard-btn"
                onClick={handleOpenNew}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg flex items-center gap-2 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                إضافة معيار جديد
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">المجال:</span>
          <button
            onClick={() => setActiveDomainFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeDomainFilter === 'ALL'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            الكل ({standards.length})
          </button>
          {domains.map(d => (
            <button
              key={d}
              onClick={() => setActiveDomainFilter(d)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeDomainFilter === d
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="w-full md:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالرمز أو المعيار أو المؤشر..."
            className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Standards Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs">
                <th className="p-3.5">الكود</th>
                <th className="p-3.5">المجال</th>
                <th className="p-3.5">المعيار الرئيسي</th>
                <th className="p-3.5">المؤشر المطلوب</th>
                <th className="p-3.5 text-center">الوزن (Weight)</th>
                <th className="p-3.5 text-center">المقياس</th>
                <th className="p-3.5 text-center">يطبق على</th>
                <th className="p-3.5 text-center">الحالة</th>
                {canManage && <th className="p-3.5 text-center">إجراءات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStandards.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="text-center py-10 text-slate-400">
                    لا توجد معايير مسجلة في هذا المجال. قم بإضافة معيار أو استيراد معايير إتقان.
                  </td>
                </tr>
              ) : (
                filteredStandards.map((std) => (
                  <tr key={std.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-indigo-700">{std.code}</td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {std.domain}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-900 max-w-xs">{std.standard}</td>
                    <td className="p-3.5 text-slate-600 max-w-sm">
                      <div>{std.indicator}</div>
                      {std.description && (
                        <div className="text-xs text-slate-400 mt-0.5">{std.description}</div>
                      )}
                    </td>
                    <td className="p-3.5 text-center font-bold text-slate-800">{std.weight}</td>
                    <td className="p-3.5 text-center">
                      <span className="px-2 py-0.5 text-xs rounded bg-indigo-50 text-indigo-700 font-semibold">
                        1 - {std.evaluationScale}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex flex-wrap justify-center gap-1">
                        {std.applicableTo.map((app) => (
                          <span
                            key={app}
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                              app === 'DAILY_REPORT'
                                ? 'bg-amber-100 text-amber-800'
                                : app === 'TEACHER_VISIT'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {app === 'DAILY_REPORT'
                              ? 'يومي'
                              : app === 'TEACHER_VISIT'
                              ? 'زيارة معلم'
                              : 'شامل'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3.5 text-center">
                      {std.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 className="w-4 h-4" /> نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                          <XCircle className="w-4 h-4" /> معطل
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(std)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                            title="تعديل المعيار"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(std)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="حذف المعيار"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add/Edit Standard */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-indigo-600" />
                {editingStandard ? 'تعديل معيار إتقان' : 'إضافة معيار إتقان جديد'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كود المعيار (Code) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="مثال: ETQ-LRN-01"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المجال (Domain) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.domain || ''}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    placeholder="مثال: التدريس والتعلم الفعّال"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المعيار الرئيسي (Standard) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.standard || ''}
                  onChange={(e) => setFormData({ ...formData, standard: e.target.value })}
                  placeholder="مثال: التخطيط الفعّال للدرس والأنشطة الصفية"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المؤشر المطلوب (Indicator) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={formData.indicator || ''}
                  onChange={(e) => setFormData({ ...formData, indicator: e.target.value })}
                  placeholder="مثال: صياغة أهداف قابلة للقياس واستخدام استراتيجيات متطورة"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  وصف إضافي وملاحظات التحقق
                </label>
                <textarea
                  rows={2}
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="ملاحظات فنية تدعم المقيم أثناء الرصد الميداني..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الوزن النسبي (Weight) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={formData.weight || 10}
                    onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 1 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">يُستخدم لحساب الدرجة الموزونة في التقييم الشامل</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    مقياس التقييم (Evaluation Scale) *
                  </label>
                  <select
                    value={formData.evaluationScale || 4}
                    onChange={(e) => setFormData({ ...formData, evaluationScale: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={4}>رباعي (1 - 4: متميز، جيد جداً، مرضي، يحتاج تحسين)</option>
                    <option value={5}>خماسي (1 - 5)</option>
                    <option value={3}>ثلاثي (1 - 3: محقق، محقق جزئياً، غير محقق)</option>
                    <option value={100}>مئوي (0 - 100%)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  يطبق على التقارير التالية:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'DAILY_REPORT', label: 'تقرير الجودة اليومي' },
                      { key: 'TEACHER_VISIT', label: 'تقرير زيارة معلم' },
                      { key: 'COMPREHENSIVE_EVALUATION', label: 'التقييم الشامل' },
                    ] as const
                  ).map((item) => {
                    const isChecked = (formData.applicableTo || []).includes(item.key);
                    return (
                      <label
                        key={item.key}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs font-medium transition-colors ${
                          isChecked
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const current = formData.applicableTo || [];
                            if (e.target.checked) {
                              setFormData({ ...formData, applicableTo: [...current, item.key] });
                            } else {
                              setFormData({
                                ...formData,
                                applicableTo: current.filter((k) => k !== item.key),
                              });
                            }
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        {item.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.evidenceRequired ?? true}
                    onChange={(e) => setFormData({ ...formData, evidenceRequired: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  يتطلب إرفاق أدلة وثائقية / شواهد
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.isActive ?? true}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  المعيار نشط في التقييمات
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-semibold shadow-sm"
                >
                  حفظ المعيار
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Import Standards (XLSX / CSV) with Preview */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                استيراد معايير إتقان من ملف (XLSX / CSV)
              </h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* File selector */}
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-indigo-400 transition-colors bg-slate-50">
                <UploadCloud className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  اختر ملف معايير إتقان بتنسيق XLSX أو CSV
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  يجب أن يحتوي الملف على أعمدة: الكود، المجال، المعيار، المؤشر، الوزن، مقياس التقييم
                </p>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
                {importFileName && (
                  <div className="mt-3 text-xs font-semibold text-emerald-700">
                    تم تحميل الملف: {importFileName}
                  </div>
                )}
              </div>

              {importError && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-800 text-sm">
                  <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Preview Table */}
              {importPreviewData.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      معاينة المعايير المستخرجة قبل الحفظ ({importPreviewData.length} معيار)
                    </h4>
                    <span className="text-xs text-slate-500">
                      سيتم حفظ المعايير لحساب المدرسة الحالي فقط
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 sticky top-0">
                        <tr>
                          <th className="p-2.5">الكود</th>
                          <th className="p-2.5">المجال</th>
                          <th className="p-2.5">المعيار</th>
                          <th className="p-2.5">المؤشر</th>
                          <th className="p-2.5 text-center">الوزن</th>
                          <th className="p-2.5 text-center">المقياس</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreviewData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-mono font-semibold text-indigo-700">{row.code}</td>
                            <td className="p-2 text-slate-600">{row.domain}</td>
                            <td className="p-2 font-medium text-slate-900">{row.standard}</td>
                            <td className="p-2 text-slate-600">{row.indicator}</td>
                            <td className="p-2 text-center font-bold">{row.weight}</td>
                            <td className="p-2 text-center">{row.evaluationScale}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  id="confirm-save-etqan-import-btn"
                  disabled={importPreviewData.length === 0}
                  onClick={handleConfirmImport}
                  className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors font-semibold shadow-sm flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  اعتماد وحفظ المعايير المستوردة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
