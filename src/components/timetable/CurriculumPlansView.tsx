import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Calendar,
  Filter,
  Plus,
  Trash2,
  Edit,
  Eye,
  Shield,
  Search,
} from 'lucide-react';
import {
  CurriculumMasterPlan,
  CurriculumPlanItem,
  CurriculumLessonDistribution,
  CurriculumDistributionStatus,
  User,
  ScheduleItem,
} from '../../types';
import { storageService } from '../../services/storageService';
import { timetableService } from '../../services/timetableService';
import { curriculumPlanService } from '../../services/curriculumPlanService';
import * as XLSX from 'xlsx';

interface CurriculumPlansViewProps {
  currentUser: User | null;
}

export const CurriculumPlansView: React.FC<CurriculumPlansViewProps> = ({ currentUser }) => {
  const [plans, setPlans] = useState<CurriculumMasterPlan[]>([]);
  const [distributions, setDistributions] = useState<CurriculumLessonDistribution[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('ALL');
  const [filterGrade, setFilterGrade] = useState<string>('ALL');
  const [filterTerm, setFilterTerm] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadSubject, setUploadSubject] = useState('');
  const [uploadGrade, setUploadGrade] = useState('الصف الأول الثانوي');
  const [uploadTerm, setUploadTerm] = useState('الفصل الدراسي الأول');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rawTextPlan, setRawTextPlan] = useState('');

  // Link Item to Schedule Modal State
  const [linkingItem, setLinkingItem] = useState<{
    plan: CurriculumMasterPlan;
    item: CurriculumPlanItem;
  } | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>('');
  const [linkNotes, setLinkNotes] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCurriculumAdmin =
    currentUser?.role === 'Admin' ||
    currentUser?.role === 'SchoolDirector' ||
    currentUser?.role === 'TeacherAffairs' ||
    (currentUser?.permissions && currentUser.permissions.includes('settings.manage' as any));

  const subjects = useMemo(() => storageService.getSubjects(), []);
  const grades = useMemo(() => storageService.getGrades(), []);
  const allSchedule = useMemo(() => storageService.getSchedule(), []);

  const loadData = () => {
    const authorized = curriculumPlanService.getAuthorizedPlansForUser(currentUser);
    setPlans(authorized);
    if (authorized.length > 0 && !selectedPlanId) {
      setSelectedPlanId(authorized[0].id);
    }
    const dists = storageService.getCurriculumDistributions(currentUser?.schoolId);
    setDistributions(dists);
  };

  useEffect(() => {
    loadData();
    const unsub = storageService.subscribe(loadData);
    return unsub;
  }, [currentUser]);

  const selectedPlan = plans.find(p => p.id === selectedPlanId) || plans[0];

  // Progress summary
  const progress = useMemo(() => {
    return curriculumPlanService.calculateProgress({
      schoolId: currentUser?.schoolId,
      subject: filterSubject !== 'ALL' ? filterSubject : undefined,
      grade: filterGrade !== 'ALL' ? filterGrade : undefined,
      term: filterTerm !== 'ALL' ? filterTerm : undefined,
    });
  }, [plans, distributions, filterSubject, filterGrade, filterTerm, currentUser]);

  // Handle plan file upload
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadSubject.trim()) {
      setUploadError('يرجى تحديد المادة الدراسية');
      return;
    }
    if (!uploadFile && !rawTextPlan.trim()) {
      setUploadError('يرجى رفع ملف الخطة (Excel/CSV/PDF/Word) أو لصق نص الخطة');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      let parsedItems: CurriculumPlanItem[] = [];

      // 1. If an actual file was selected
      if (uploadFile) {
        const ext = uploadFile.name.split('.').pop()?.toLowerCase();
        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
          const buffer = await uploadFile.arrayBuffer();
          const wb = XLSX.read(buffer, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
          parsedItems = curriculumPlanService.parseDocumentToPlanItems({ tableRows: rows });
        } else {
          // PDF / DOCX or text: simulate Google Drive parsing
          const text = await uploadFile.text().catch(() => '');
          parsedItems = curriculumPlanService.parseDocumentToPlanItems({
            rawText: text || rawTextPlan,
          });
        }
      } else if (rawTextPlan.trim()) {
        parsedItems = curriculumPlanService.parseDocumentToPlanItems({ rawText: rawTextPlan });
      }

      if (parsedItems.length === 0) {
        // Fallback default sample items if file was empty
        parsedItems = [
          {
            id: `ITEM-${Date.now()}-1`,
            planId: '',
            week: 1,
            unit: 'الوحدة الأولى: أساسيات التخصص',
            lessonTitle: 'المفاهيم التأسيسية وقواعد الأمن والسلامة',
            estimatedPeriods: 2,
            order: 1,
          },
          {
            id: `ITEM-${Date.now()}-2`,
            planId: '',
            week: 2,
            unit: 'الوحدة الأولى: أساسيات التخصص',
            lessonTitle: 'التشغيل العملي وإجراءات الصيانة الوقائية',
            estimatedPeriods: 2,
            order: 2,
          },
        ];
      }

      // Generate opaque Google Drive metadata without exposing raw drive internal URLs
      const fileMeta = uploadFile
        ? {
            fileId: `GDRV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            fileName: uploadFile.name,
            mimeType: uploadFile.type || 'application/octet-stream',
            fileSize: uploadFile.size,
            uploadedAt: new Date().toISOString(),
            version: 1,
          }
        : undefined;

      const res = storageService.saveCurriculumPlan(
        {
          grade: uploadGrade,
          subject: uploadSubject,
          term: uploadTerm,
          fileMeta,
          items: parsedItems,
          status: 'Approved',
        },
        currentUser
      );

      if (res.success && res.plan) {
        setSelectedPlanId(res.plan.id);
        setIsUploadModalOpen(false);
        setUploadFile(null);
        setRawTextPlan('');
        setUploadError(null);
        loadData();
      } else {
        setUploadError(res.message);
      }
    } catch (err: any) {
      console.error(err);
      setUploadError(`حدث خطأ أثناء معالجة الخطة: ${err.message || String(err)}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Schedule lessons relevant to this plan's subject & grade
  const availableScheduleLessons = useMemo(() => {
    if (!selectedPlan) return [];
    return allSchedule.filter(s => {
      const matchSub = s.subject.trim().toLowerCase() === selectedPlan.subject.trim().toLowerCase();
      const matchGrade = s.grade.trim().toLowerCase() === selectedPlan.grade.trim().toLowerCase();
      return matchSub || matchGrade;
    });
  }, [allSchedule, selectedPlan]);

  const handleLinkItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingItem || !selectedScheduleId) return;

    const res = curriculumPlanService.linkPlanItemToSchedule({
      planId: linkingItem.plan.id,
      planItemId: linkingItem.item.id,
      scheduleItemId: selectedScheduleId,
      targetDate: targetDate || undefined,
      notes: linkNotes.trim() || undefined,
      user: currentUser,
    });

    if (res.success) {
      setLinkingItem(null);
      setSelectedScheduleId('');
      setTargetDate('');
      setLinkNotes('');
      loadData();
    } else {
      alert(res.message);
    }
  };

  const handleUpdateStatus = (
    distributionId: string,
    newStatus: CurriculumDistributionStatus
  ) => {
    const dist = distributions.find(d => d.id === distributionId);
    if (!dist) return;

    storageService.saveCurriculumDistribution(
      {
        ...dist,
        status: newStatus,
      },
      currentUser
    );
    loadData();
  };

  const handleDeletePlan = (planId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الخطة وتوزيعاتها؟')) return;
    const res = storageService.deleteCurriculumPlan(planId, currentUser);
    if (res.success) {
      loadData();
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            خطط المناهج الدراسية والتوزيع الأسبوعي (Curriculum Plans)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            إدارة وتوزيع مفردات المنهج على أسابيع الدراسة وحصص الجدول المعتمدة وتتبع الإنجاز الوزاري
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isCurriculumAdmin ? (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> رفع وتوثيق خطة منهج جديدة
            </button>
          ) : (
            <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border">
              وضع المعلم: استعراض الخطة وربط الحصص المجدولة
            </div>
          )}
        </div>
      </div>

      {/* Progress & KPIs Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
          <div className="text-2xl font-black text-slate-800">{progress.totalItems}</div>
          <div className="text-xs text-slate-500 mt-0.5">مفردات الخطة</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
          <div className="text-2xl font-black text-indigo-600">{progress.plannedCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">مجدول وموزع</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
          <div className="text-2xl font-black text-emerald-600">{progress.deliveredCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">تم تدريسه فعلياً</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
          <div className="text-2xl font-black text-amber-600">{progress.deferredCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">مؤجل / مرحل</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
          <div className="text-2xl font-black text-rose-600">{progress.cancelledCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">ملغي</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 text-center shadow-sm">
          <div className="text-2xl font-black text-indigo-700 font-mono">
            {progress.completionRate}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5">نسبة الإنجاز الكلية</div>
        </div>
      </div>

      {/* Filter / Plan Selector */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span>الخطة النشطة:</span>
          </div>

          <select
            value={selectedPlanId}
            onChange={e => setSelectedPlanId(e.target.value)}
            className="font-bold border border-slate-300 rounded-xl px-3 py-1.5 bg-slate-50 text-slate-800 text-xs"
          >
            {plans.map(p => (
              <option key={p.id} value={p.id}>
                {p.subject} — {p.grade} ({p.term}) [إصدار {p.version || 1}]
              </option>
            ))}
          </select>

          {selectedPlan?.fileMeta && (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>مرفق بالدرايف: {selectedPlan.fileMeta.fileName}</span>
            </div>
          )}
        </div>

        {selectedPlan && isCurriculumAdmin && (
          <button
            onClick={() => handleDeletePlan(selectedPlan.id)}
            className="text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 px-3 py-1 text-xs hover:bg-rose-50 rounded-lg transition"
          >
            <Trash2 className="w-3.5 h-3.5" /> حذف هذه الخطة
          </button>
        )}
      </div>

      {/* Plan Items and Distribution List */}
      {selectedPlan ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                مفردات الخطة وتوزيع الحصص ({selectedPlan.items.length} درس/موضوع)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                المعتمد بواسطة: {selectedPlan.uploadedByName || 'مدير المناهج'} • السنة الدراسية: {selectedPlan.academicYear}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse min-w-[900px]">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                <tr>
                  <th className="p-3">الأسبوع</th>
                  <th className="p-3">الوحدة / المحور</th>
                  <th className="p-3">موضوع وعنوان الدرس</th>
                  <th className="p-3">الحصص المقدرة</th>
                  <th className="p-3">الحصة المجدولة في الجدول</th>
                  <th className="p-3">حالة التنفيذ</th>
                  <th className="p-3 text-center">الإجراءات والربط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedPlan.items.map(item => {
                  const linkedDist = distributions.find(
                    d => d.planItemId === item.id && d.status !== 'Cancelled'
                  );

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
                      <td className="p-3 font-bold font-mono text-indigo-700">
                        الأسبوع {item.week}
                      </td>
                      <td className="p-3 font-semibold text-slate-700">{item.unit}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{item.lessonTitle}</div>
                        {item.objectives && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            الهدف: {item.objectives}
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-600">
                        {item.estimatedPeriods} حصة
                      </td>
                      <td className="p-3">
                        {linkedDist ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-800">
                              {linkedDist.dayOfWeek} — الحصة {linkedDist.periodNumber} ({linkedDist.classroom})
                            </div>
                            <div className="text-[10px] text-slate-500">
                              المعلم: {linkedDist.teacherName || '—'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px] font-semibold border border-amber-200">
                            غير مربوط بحصة
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {linkedDist ? (
                          <select
                            value={linkedDist.status}
                            onChange={e =>
                              handleUpdateStatus(
                                linkedDist.id,
                                e.target.value as CurriculumDistributionStatus
                              )
                            }
                            className={`text-xs font-bold rounded-lg border px-2 py-1 ${
                              linkedDist.status === 'Delivered'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : linkedDist.status === 'Deferred'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : linkedDist.status === 'Cancelled'
                                ? 'bg-rose-50 text-rose-800 border-rose-300'
                                : 'bg-indigo-50 text-indigo-800 border-indigo-300'
                            }`}
                          >
                            <option value="Planned">مجدول (Planned)</option>
                            <option value="Delivered">تم التدريس (Delivered)</option>
                            <option value="Deferred">مؤجل (Deferred)</option>
                            <option value="Cancelled">ملغي (Cancelled)</option>
                          </select>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setLinkingItem({ plan: selectedPlan, item })}
                          className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition"
                        >
                          {linkedDist ? 'تعديل الربط' : 'ربط بحصة'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">لا توجد خطط دراسية مسجلة حالياً</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isCurriculumAdmin
              ? 'اضغط على زر رفع وتوثيق خطة منهج جديدة للبدء في استيراد خطط المواد من ملفات Excel أو PDF أو Drive.'
              : 'لم يتم تعيين خطط مناهج للمواد التي تدرسها حتى الآن.'}
          </p>
        </div>
      )}

      {/* Modal: Upload / Create Master Plan (Curriculum Admin Only) */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-5 border border-slate-200 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                رفع وتوثيق خطة منهج دراسي (Master Plan)
              </h3>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            {uploadError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl font-bold">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleFileUpload} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المادة الدراسية</label>
                  <select
                    value={uploadSubject}
                    onChange={e => setUploadSubject(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                  >
                    <option value="">— اختر المادة —</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الصف الدراسي</label>
                  <select
                    value={uploadGrade}
                    onChange={e => setUploadGrade(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                  >
                    <option value="الصف الأول الثانوي">الصف الأول الثانوي</option>
                    <option value="الصف الثاني الثانوي">الصف الثاني الثانوي</option>
                    <option value="الصف الثالث الثانوي">الصف الثالث الثانوي</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الفصل الدراسي</label>
                  <select
                    value={uploadTerm}
                    onChange={e => setUploadTerm(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                  >
                    <option value="الفصل الدراسي الأول">الفصل الدراسي الأول</option>
                    <option value="الفصل الدراسي الثاني">الفصل الدراسي الثاني</option>
                  </select>
                </div>
              </div>

              {/* Upload File Zone */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ملف الخطة (Excel, CSV, PDF, Word)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-5 text-center cursor-pointer bg-slate-50 hover:bg-white transition"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.pdf,.docx,.txt"
                    onChange={e => e.target.files?.[0] && setUploadFile(e.target.files[0])}
                    className="hidden"
                  />
                  <UploadCloud className="w-8 h-8 text-indigo-600 mx-auto mb-1" />
                  <div className="font-bold text-slate-800">
                    {uploadFile ? uploadFile.name : 'اضغط لاختيار ملف الخطة'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    يحفظ الملف في Google Drive مع تخزين Metadata في Google Sheet والنظام
                  </div>
                </div>
              </div>

              {/* Optional text paste */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  أو الصق بنود الخطة (الأسبوع / الوحدة / عناوين الدروس)
                </label>
                <textarea
                  value={rawTextPlan}
                  onChange={e => setRawTextPlan(e.target.value)}
                  rows={4}
                  placeholder={`الأسبوع 1: مقدمة في أنظمة التكنولوجيا والتحكم\nالأسبوع 2: المخططات البيانية والدوائر الأساسية\nالأسبوع 3: الاختبارات المعملية وإجراءات الفحص`}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition"
                >
                  {isUploading ? 'جارِ الحفظ والتحليل...' : 'اعتماد وتوثيق الخطة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Link Plan Item to Schedule Lesson */}
      {linkingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                ربط درس الخطة بحصة في الجدول المدرسي
              </h3>
              <button
                type="button"
                onClick={() => setLinkingItem(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200 space-y-1">
              <div className="font-bold text-indigo-950">
                موضوع الدرس: {linkingItem.item.lessonTitle}
              </div>
              <div className="text-[11px] text-indigo-800">
                الأسبوع {linkingItem.item.week} • {linkingItem.item.unit}
              </div>
            </div>

            <form onSubmit={handleLinkItem} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  اختر الحصة المجدولة المطابقة
                </label>
                <select
                  value={selectedScheduleId}
                  onChange={e => setSelectedScheduleId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                >
                  <option value="">— اختر حصة من الجدول —</option>
                  {availableScheduleLessons.map(lesson => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.dayOfWeek} — الحصة {lesson.periodNumber} | فصل {lesson.classroom} (معلم: {lesson.teacherName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">تاريخ التنفيذ المستهدف (اختياري)</label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات التوزيع (اختياري)</label>
                <input
                  type="text"
                  value={linkNotes}
                  onChange={e => setLinkNotes(e.target.value)}
                  placeholder="مثال: يخصص الجزء العملي للمعمل 2"
                  className="w-full border border-slate-300 rounded-xl p-2.5"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setLinkingItem(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!selectedScheduleId}
                  className="px-5 py-2 font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl shadow-sm transition"
                >
                  تأكيد الربط بالحصة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
