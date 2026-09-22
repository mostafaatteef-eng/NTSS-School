import React, { useState } from 'react';
import {
  DailyQualityReport,
  QualityStandard,
  StandardScore,
  User,
  CorrectiveAction,
} from '../../types';
import { storageService } from '../../services/storageService';
import {
  FileText,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  Send,
  Eye,
  Trash2,
  Sparkles,
  AlertTriangle,
  Building,
  UserCheck,
} from 'lucide-react';

interface Props {
  currentUser: User | null;
  standards: QualityStandard[];
  reports: DailyQualityReport[];
  onRefresh: () => void;
  canCreate: boolean;
  canApprove: boolean;
}

export const DailyQualityReportSection: React.FC<Props> = ({
  currentUser,
  standards,
  reports,
  onRefresh,
  canCreate,
  canApprove,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<DailyQualityReport | null>(null);

  // Applicable standards for Daily Reports
  const dailyStandards = standards.filter(
    (s) => s.isActive && s.applicableTo?.includes('DAILY_REPORT')
  );

  // Form state
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [positiveObservations, setPositiveObservations] = useState('');
  const [improvementAreas, setImprovementAreas] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [dailyScores, setDailyScores] = useState<Record<string, { score: number; notes: string }>>({});

  // Corrective action sub-form
  const [includeAction, setIncludeAction] = useState(false);
  const [actionTitle, setActionTitle] = useState('');
  const [actionDesc, setActionDesc] = useState('');
  const [actionAssignedTo, setActionAssignedTo] = useState('');
  const [actionDueDate, setActionDueDate] = useState('');
  const [actionPriority, setActionPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');

  const handleOpenNew = () => {
    setViewingReport(null);
    setReportDate(new Date().toISOString().split('T')[0]);
    setExecutiveSummary('');
    setPositiveObservations('');
    setImprovementAreas('');
    setRecommendations('');
    setGeneralNotes('');

    // Initialize scores
    const initScores: Record<string, { score: number; notes: string }> = {};
    dailyStandards.forEach((s) => {
      initScores[s.id] = { score: s.evaluationScale || 4, notes: '' };
    });
    setDailyScores(initScores);
    setIncludeAction(false);
    setIsModalOpen(true);
  };

  const handleScoreChange = (standardId: string, score: number) => {
    setDailyScores((prev) => ({
      ...prev,
      [standardId]: {
        ...(prev[standardId] || { notes: '' }),
        score,
      },
    }));
  };

  const handleNotesChange = (standardId: string, notes: string) => {
    setDailyScores((prev) => ({
      ...prev,
      [standardId]: {
        ...(prev[standardId] || { score: 4 }),
        notes,
      },
    }));
  };

  const handleSaveReport = (asDraft: boolean) => {
    if (!reportDate) {
      alert('يرجى تحديد تاريخ التقرير.');
      return;
    }

    const standardScores: StandardScore[] = (
      Object.entries(dailyScores) as [string, { score: number; notes: string }][]
    ).map(([standardId, data]) => {
      const std = standards.find((s) => s.id === standardId);
      return {
        standardId,
        standardCode: std?.code || '',
        score: data.score,
        maxScore: std?.evaluationScale || 4,
        weight: std?.weight || 10,
        notes: data.notes,
      };
    });

    const calcResult = storageService.calculateWeightedScore(standardScores, standards);

    const newReport: Partial<DailyQualityReport> = {
      date: reportDate,
      reportDate,
      evaluatorId: currentUser?.id || 'USR-01',
      evaluatorName: currentUser?.name || 'مسؤول الجودة',
      status: asDraft ? 'DRAFT' : 'SUBMITTED',
      standardScores,
      totalScore: calcResult.totalScore,
      earnedScore: calcResult.earnedScore,
      percentage: calcResult.percentage,
      executiveSummary: executiveSummary.trim(),
      positiveObservations: positiveObservations
        ? positiveObservations.split('\n').filter(Boolean)
        : [],
      improvementAreas: improvementAreas
        ? improvementAreas.split('\n').filter(Boolean)
        : [],
      recommendations: recommendations
        ? recommendations.split('\n').filter(Boolean)
        : [],
      generalNotes: generalNotes.trim(),
    };

    const res = storageService.saveDailyQualityReport(newReport, currentUser);

    if (res.success) {
      // If corrective action was added
      if (includeAction && actionTitle.trim() && res.data?.id) {
        storageService.saveCorrectiveAction(
          {
            sourceType: 'DAILY_REPORT',
            sourceId: res.data.id,
            title: actionTitle.trim(),
            description: actionDesc.trim() || actionTitle.trim(),
            ownerEmployeeId: currentUser?.id || 'STAFF',
            ownerName: actionAssignedTo.trim() || 'الإدارة المدرسية',
            assignedToName: actionAssignedTo.trim() || 'الإدارة المدرسية',
            dueDate: actionDueDate || reportDate,
            priority: actionPriority,
            status: 'OPEN',
          },
          currentUser
        );
      }

      setIsModalOpen(false);
      onRefresh();
    } else {
      alert(res.message);
    }
  };

  const handleApprove = (report: DailyQualityReport) => {
    if (!window.confirm('هل ترغب في اعتماد تقرير الجودة اليومي هذا؟')) return;
    const res = storageService.approveDailyQualityReport(report.id, currentUser);
    if (res.success) {
      onRefresh();
      if (viewingReport && viewingReport.id === report.id) {
        setViewingReport({ ...viewingReport, status: 'APPROVED' });
      }
    } else {
      alert(res.message);
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التقرير؟')) return;
    const res = storageService.deleteDailyQualityReport(id, currentUser);
    if (res.success) {
      onRefresh();
      if (viewingReport?.id === id) setViewingReport(null);
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-600" />
            تقارير الجودة اليومية (Daily Quality Reports)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            رصد وتقييم العمليات اليومية في المدرسة وفق معايير إتقان المعتمدة.
          </p>
        </div>

        {canCreate && (
          <button
            id="create-daily-quality-report-btn"
            onClick={handleOpenNew}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            تسجيل تقرير جودة يومي جديد
          </button>
        )}
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs">
                <th className="p-3.5">تاريخ التقرير</th>
                <th className="p-3.5">المُعد / الراصد</th>
                <th className="p-3.5 text-center">الدرجة الموزونة</th>
                <th className="p-3.5 text-center">النسبة المئوية</th>
                <th className="p-3.5 text-center">الحالة</th>
                <th className="p-3.5">الملخص التنفيذي</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    لا توجد تقارير جودة يومية مسجلة حتى الآن.
                  </td>
                </tr>
              ) : (
                reports.map((rep) => (
                  <tr key={rep.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                      {rep.reportDate}
                    </td>
                    <td className="p-3.5 text-slate-700">{rep.observerName}</td>
                    <td className="p-3.5 text-center font-bold text-slate-900">
                      {rep.earnedScore.toFixed(1)} / {rep.totalScore.toFixed(1)}
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                          rep.percentage >= 85
                            ? 'bg-emerald-100 text-emerald-800'
                            : rep.percentage >= 70
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {rep.percentage.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      {rep.status === 'APPROVED' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> معتمد
                        </span>
                      ) : rep.status === 'SUBMITTED' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Clock className="w-3.5 h-3.5" /> بانتظار الاعتماد
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded">
                          مسودة
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-600 max-w-xs truncate">
                      {rep.executiveSummary || 'لا يوجد ملخص'}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setViewingReport(rep)}
                          className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition-colors flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> عرض
                        </button>
                        {canApprove && rep.status === 'SUBMITTED' && (
                          <button
                            onClick={() => handleApprove(rep)}
                            className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium transition-colors"
                          >
                            اعتماد
                          </button>
                        )}
                        {canCreate && rep.status === 'DRAFT' && (
                          <button
                            onClick={() => handleDelete(rep.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Daily Report */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                تسجيل تقرير جودة مدرسي يومي
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تاريخ التقرير *
                  </label>
                  <input
                    type="date"
                    required
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المُعد / المشرف
                  </label>
                  <input
                    type="text"
                    disabled
                    value={currentUser?.name || 'مسؤول الجودة'}
                    className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-medium"
                  />
                </div>
              </div>

              {/* Dynamic Standards Scoring Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    تقييم معايير إتقان الميدانية ({dailyStandards.length} معيار)
                  </h4>
                  <span className="text-xs text-slate-400">
                    الوزن والدرجات تُحسب تلقائياً وفق المعايير المسجلة
                  </span>
                </div>

                {dailyStandards.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                    لم يتم العثور على معايير مطبقة على تقرير الجودة اليومي. يرجى تفعيل أو إضافة معايير من تبويب "معايير إتقان".
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dailyStandards.map((std) => {
                      const curScore = dailyScores[std.id]?.score ?? 4;
                      const curNotes = dailyScores[std.id]?.notes ?? '';
                      return (
                        <div
                          key={std.id}
                          className="p-3.5 border border-slate-200 rounded-xl bg-slate-50 space-y-2"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                  {std.code}
                                </span>
                                <span className="text-sm font-bold text-slate-800">
                                  {std.standard}
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 mt-1">{std.indicator}</div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-slate-500">
                                الوزن: {std.weight}
                              </span>
                              <div className="flex items-center gap-1">
                                {[...Array(std.evaluationScale || 4)].map((_, i) => {
                                  const val = i + 1;
                                  return (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={() => handleScoreChange(std.id, val)}
                                      className={`w-7 h-7 text-xs font-bold rounded-md transition-colors ${
                                        curScore === val
                                          ? 'bg-indigo-600 text-white shadow-sm'
                                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                      }`}
                                    >
                                      {val}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <input
                            type="text"
                            value={curNotes}
                            onChange={(e) => handleNotesChange(std.id, e.target.value)}
                            placeholder="ملاحظات الرصد الميداني لهذا المعيار..."
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Narrative Sections */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الملخص التنفيذي لليوم الدراسي
                  </label>
                  <textarea
                    rows={2}
                    value={executiveSummary}
                    onChange={(e) => setExecutiveSummary(e.target.value)}
                    placeholder="نبذة عامة عن سير اليوم الدراسي وجاهزية الفصول والمرافق..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-emerald-800 mb-1">
                      الملاحظات الإيجابية ونقاط التميز (سطر لكل نقطة)
                    </label>
                    <textarea
                      rows={3}
                      value={positiveObservations}
                      onChange={(e) => setPositiveObservations(e.target.value)}
                      placeholder="انضباط في الطابور الصباحي&#10;نظافة متكاملة للفناء"
                      className="w-full px-3 py-2 text-sm border border-emerald-200 bg-emerald-50/30 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-800 mb-1">
                      فرص التحسين والملاحظات السلبية (سطر لكل نقطة)
                    </label>
                    <textarea
                      rows={3}
                      value={improvementAreas}
                      onChange={(e) => setImprovementAreas(e.target.value)}
                      placeholder="تأخر نسبي في تسليم كشوف الغياب&#10;حاجة لصيانة إضاءة أحد المعامل"
                      className="w-full px-3 py-2 text-sm border border-amber-200 bg-amber-50/30 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    التوصيات المباشرة
                  </label>
                  <textarea
                    rows={2}
                    value={recommendations}
                    onChange={(e) => setRecommendations(e.target.value)}
                    placeholder="التوجيه الفوري لمعالجة الملاحظات..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Corrective Action Section */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={includeAction}
                    onChange={(e) => setIncludeAction(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  إصدار إجراء تصحيحي (Corrective Action) مرتبط بهذا التقرير
                </label>

                {includeAction && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <input
                        type="text"
                        placeholder="عنوان الإجراء التصحيحي المطلوب..."
                        value={actionTitle}
                        onChange={(e) => setActionTitle(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="المسؤول عن التنفيذ"
                        value={actionAssignedTo}
                        onChange={(e) => setActionAssignedTo(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                      <input
                        type="date"
                        value={actionDueDate}
                        onChange={(e) => setActionDueDate(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                      <select
                        value={actionPriority}
                        onChange={(e) => setActionPriority(e.target.value as any)}
                        className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="LOW">أولوية منخفضة</option>
                        <option value="MEDIUM">أولوية متوسطة</option>
                        <option value="HIGH">أولوية عالية</option>
                        <option value="CRITICAL">حرجة / عاجلة</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium"
                >
                  إلغاء
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveReport(true)}
                    className="px-4 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg transition-colors font-semibold"
                  >
                    حفظ كمسودة
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveReport(false)}
                    className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-semibold shadow-sm flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    تقديم التقرير للاعتماد
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Report Details */}
      {viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  تفاصيل تقرير الجودة اليومي - {viewingReport.reportDate}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  الراصد: {viewingReport.observerName}
                </p>
              </div>
              <button
                onClick={() => setViewingReport(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Score Highlight Banner */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-indigo-800">الدرجة الموزونة الإجمالية</div>
                  <div className="text-2xl font-black text-indigo-950 mt-0.5">
                    {viewingReport.earnedScore.toFixed(1)}{' '}
                    <span className="text-sm font-normal text-indigo-600">
                      / {viewingReport.totalScore.toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-indigo-800">مستوى الأداء</div>
                  <span
                    className={`inline-block px-3 py-1 text-sm font-bold rounded-full mt-1 ${
                      viewingReport.percentage >= 85
                        ? 'bg-emerald-100 text-emerald-800'
                        : viewingReport.percentage >= 70
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {viewingReport.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Standard breakdown */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  نتائج تقييم المعايير
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 font-semibold text-slate-700">
                      <tr>
                        <th className="p-2.5">الكود</th>
                        <th className="p-2.5">المعيار</th>
                        <th className="p-2.5 text-center">الدرجة</th>
                        <th className="p-2.5 text-center">الوزن</th>
                        <th className="p-2.5">الملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingReport.standardScores.map((sc, i) => (
                        <tr key={i}>
                          <td className="p-2.5 font-mono font-bold text-indigo-600">{sc.standardCode}</td>
                          <td className="p-2.5 text-slate-800">
                            {standards.find((s) => s.id === sc.standardId)?.standard || 'معيار'}
                          </td>
                          <td className="p-2.5 text-center font-bold">
                            {sc.score} / {sc.maxScore}
                          </td>
                          <td className="p-2.5 text-center">{sc.weight}</td>
                          <td className="p-2.5 text-slate-600">{sc.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Observations */}
              {viewingReport.executiveSummary && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-1">الملخص التنفيذي</h4>
                  <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    {viewingReport.executiveSummary}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {viewingReport.positiveObservations?.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <h5 className="text-xs font-bold text-emerald-900 mb-2">نقاط التميز والرصد الإيجابي</h5>
                    <ul className="list-disc list-inside text-xs text-emerald-800 space-y-1">
                      {viewingReport.positiveObservations.map((obs, idx) => (
                        <li key={idx}>{obs}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {viewingReport.improvementAreas?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h5 className="text-xs font-bold text-amber-900 mb-2">نقاط وفرص التحسين</h5>
                    <ul className="list-disc list-inside text-xs text-amber-800 space-y-1">
                      {viewingReport.improvementAreas.map((area, idx) => (
                        <li key={idx}>{area}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Recommendations */}
              {viewingReport.recommendations?.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-1">التوصيات</h4>
                  <ul className="list-disc list-inside text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                    {viewingReport.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewingReport(null)}
                  className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium"
                >
                  إغلاق
                </button>

                {canApprove && viewingReport.status === 'SUBMITTED' && (
                  <button
                    type="button"
                    onClick={() => handleApprove(viewingReport)}
                    className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-semibold shadow-sm flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    اعتماد التقرير رسمياً
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
