import React, { useState } from 'react';
import {
  ComprehensiveEvaluation,
  QualityStandard,
  StandardScore,
  DomainScore,
  User,
  EvaluationScope,
} from '../../types';
import { storageService } from '../../services/storageService';
import {
  Award,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  Send,
  Eye,
  Trash2,
  Sparkles,
  PieChart,
  Layers,
  ChevronDown,
  Building,
} from 'lucide-react';

interface Props {
  currentUser: User | null;
  standards: QualityStandard[];
  evaluations: ComprehensiveEvaluation[];
  onRefresh: () => void;
  canCreate: boolean;
  canApprove: boolean;
}

export const ComprehensiveEvaluationSection: React.FC<Props> = ({
  currentUser,
  standards,
  evaluations,
  onRefresh,
  canCreate,
  canApprove,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingEval, setViewingEval] = useState<ComprehensiveEvaluation | null>(null);

  // Applicable standards
  const compStandards = standards.filter(
    (s) => s.isActive && s.applicableTo?.includes('COMPREHENSIVE_EVALUATION')
  );

  // Form states
  const [evaluationDate, setEvaluationDate] = useState(new Date().toISOString().split('T')[0]);
  const [academicYear, setAcademicYear] = useState('2024-2025');
  const [term, setTerm] = useState('الفصل الدراسي الثاني');
  const [scope, setScope] = useState<EvaluationScope>('SCHOOL_WIDE');
  const [targetEntityName, setTargetEntityName] = useState('المدرسة بالكامل');
  const [leadEvaluatorName, setLeadEvaluatorName] = useState(currentUser?.name || 'رئيس لجنة الجودة');
  const [committeeMembers, setCommitteeMembers] = useState('');
  const [strengths, setStrengths] = useState('');
  const [areasForImprovement, setAreasForImprovement] = useState('');
  const [strategicRecommendations, setStrategicRecommendations] = useState('');
  const [scores, setScores] = useState<Record<string, { score: number; notes: string }>>({});

  const handleOpenNew = () => {
    setViewingEval(null);
    setEvaluationDate(new Date().toISOString().split('T')[0]);
    setAcademicYear('2024-2025');
    setTerm('الفصل الدراسي الثاني');
    setScope('SCHOOL_WIDE');
    setTargetEntityName('المدرسة بالكامل');
    setLeadEvaluatorName(currentUser?.name || 'رئيس لجنة الجودة');
    setCommitteeMembers('لجنة التقييم والاعتماد المدرسي');
    setStrengths('');
    setAreasForImprovement('');
    setStrategicRecommendations('');

    const initScores: Record<string, { score: number; notes: string }> = {};
    compStandards.forEach((s) => {
      initScores[s.id] = { score: s.evaluationScale || 4, notes: '' };
    });
    setScores(initScores);
    setIsModalOpen(true);
  };

  const handleScoreChange = (stdId: string, val: number) => {
    setScores((prev) => ({
      ...prev,
      [stdId]: {
        ...(prev[stdId] || { notes: '' }),
        score: val,
      },
    }));
  };

  const handleNotesChange = (stdId: string, txt: string) => {
    setScores((prev) => ({
      ...prev,
      [stdId]: {
        ...(prev[stdId] || { score: 4 }),
        notes: txt,
      },
    }));
  };

  const handleSaveEvaluation = (asDraft: boolean) => {
    if (!targetEntityName) {
      alert('يرجى تحديد الجهة / القسم المستهدف بالتقييم.');
      return;
    }

    const standardScores: StandardScore[] = (
      Object.entries(scores) as [string, { score: number; notes: string }][]
    ).map(([stdId, data]) => {
      const std = standards.find((s) => s.id === stdId);
      return {
        standardId: stdId,
        standardCode: std?.code || '',
        score: data.score,
        maxScore: std?.evaluationScale || 4,
        weight: std?.weight || 10,
        notes: data.notes,
      };
    });

    const calcResult = storageService.calculateWeightedScore(standardScores, standards);

    const newEval: Partial<ComprehensiveEvaluation> = {
      academicYear,
      term,
      evaluationDate,
      scope,
      targetEntityName,
      leadEvaluatorId: currentUser?.id || 'USR-01',
      leadEvaluatorName,
      committeeMembers: committeeMembers.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
      status: asDraft ? 'DRAFT' : 'SUBMITTED',
      standardScores,
      domainScores: calcResult.domainScores,
      totalScore: calcResult.totalScore,
      earnedScore: calcResult.earnedScore,
      percentage: calcResult.percentage,
      strengths: strengths ? strengths.split('\n').filter(Boolean) : [],
      areasForImprovement: areasForImprovement ? areasForImprovement.split('\n').filter(Boolean) : [],
      strategicRecommendations: strategicRecommendations
        ? strategicRecommendations.split('\n').filter(Boolean)
        : [],
    };

    const res = storageService.saveComprehensiveEvaluation(newEval, currentUser);

    if (res.success) {
      setIsModalOpen(false);
      onRefresh();
    } else {
      alert(res.message);
    }
  };

  const handleApprove = (item: ComprehensiveEvaluation) => {
    if (!window.confirm('هل ترغب في اعتماد هذا التقييم الشامل رسمياً؟')) return;
    const res = storageService.approveComprehensiveEvaluation(item.id, currentUser);
    if (res.success) {
      onRefresh();
      if (viewingEval && viewingEval.id === item.id) {
        setViewingEval({ ...viewingEval, status: 'APPROVED' });
      }
    } else {
      alert(res.message);
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا التقييم؟')) return;
    const res = storageService.deleteComprehensiveEvaluation(id, currentUser);
    if (res.success) {
      onRefresh();
      if (viewingEval?.id === id) setViewingEval(null);
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
            <Layers className="w-6 h-6 text-indigo-600" />
            التقييم المؤسسي الشامل (Comprehensive Evaluation)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            تقييم دوري شامل للأداء المدرسي والأقسام التعليمية وفق أوزان ومجالات معايير إتقان.
          </p>
        </div>

        {canCreate && (
          <button
            id="create-comprehensive-eval-btn"
            onClick={handleOpenNew}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            إجراء تقييم شامل جديد
          </button>
        )}
      </div>

      {/* Evaluations Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs">
                <th className="p-3.5">العام الدراسي والفصل</th>
                <th className="p-3.5">الجهة / النطاق المستهدف</th>
                <th className="p-3.5">رئيس اللجنة</th>
                <th className="p-3.5 text-center">الدرجة الموزونة</th>
                <th className="p-3.5 text-center">النسبة المئوية</th>
                <th className="p-3.5 text-center">المجالات المنجزة</th>
                <th className="p-3.5 text-center">الحالة</th>
                <th className="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evaluations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">
                    لا توجد تقييمات شاملة مسجلة بعد.
                  </td>
                </tr>
              ) : (
                evaluations.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                      {ev.academicYear}
                      <span className="block text-[11px] text-slate-400 font-normal">
                        {ev.term}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-800">{ev.targetEntityName}</div>
                      <div className="text-[11px] text-slate-400">
                        {ev.scope === 'SCHOOL_WIDE'
                          ? 'مدرسي شامل'
                          : ev.scope === 'DEPARTMENT'
                          ? 'قسم أكاديمي'
                          : 'مرحلة تعليمية'}
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-700">{ev.leadEvaluatorName}</td>
                    <td className="p-3.5 text-center font-bold text-slate-900">
                      {ev.earnedScore.toFixed(1)} / {ev.totalScore.toFixed(1)}
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                          ev.percentage >= 85
                            ? 'bg-emerald-100 text-emerald-800'
                            : ev.percentage >= 70
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {ev.percentage.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded font-medium">
                        {ev.domainScores?.length || 0} مجالات
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      {ev.status === 'APPROVED' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> معتمد
                        </span>
                      ) : ev.status === 'SUBMITTED' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Clock className="w-3.5 h-3.5" /> بانتظار الاعتماد
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded">
                          مسودة
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setViewingEval(ev)}
                          className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition-colors flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> عرض
                        </button>
                        {canApprove && ev.status === 'SUBMITTED' && (
                          <button
                            onClick={() => handleApprove(ev)}
                            className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium transition-colors"
                          >
                            اعتماد
                          </button>
                        )}
                        {canCreate && ev.status === 'DRAFT' && (
                          <button
                            onClick={() => handleDelete(ev.id)}
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

      {/* Modal: New Comprehensive Evaluation */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                إجراء تقييم مؤسسي شامل جديد
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* General metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    العام الدراسي *
                  </label>
                  <input
                    type="text"
                    required
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الفصل الدراسي *
                  </label>
                  <select
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="الفصل الدراسي الأول">الفصل الدراسي الأول</option>
                    <option value="الفصل الدراسي الثاني">الفصل الدراسي الثاني</option>
                    <option value="الفصل الدراسي الثالث">الفصل الدراسي الثالث</option>
                    <option value="التقويم السنوي الختامي">التقويم السنوي الختامي</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تاريخ التقييم *
                  </label>
                  <input
                    type="date"
                    required
                    value={evaluationDate}
                    onChange={(e) => setEvaluationDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نطاق التقييم *
                  </label>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as EvaluationScope)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="SCHOOL_WIDE">شامل لكامل المدرسة والمرافق</option>
                    <option value="DEPARTMENT">قسم أكاديمي / إداري محدد</option>
                    <option value="GRADE_LEVEL">مرحلة تعليمية معينة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم الجهة / الكيان المستهدف *
                  </label>
                  <input
                    type="text"
                    required
                    value={targetEntityName}
                    onChange={(e) => setTargetEntityName(e.target.value)}
                    placeholder="مثال: المدرسة بالكامل، قسم العلوم، المرحلة المتوسطة..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رئيس لجنة التقييم *
                  </label>
                  <input
                    type="text"
                    required
                    value={leadEvaluatorName}
                    onChange={(e) => setLeadEvaluatorName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    أعضاء اللجنة المشاركين
                  </label>
                  <input
                    type="text"
                    value={committeeMembers}
                    onChange={(e) => setCommitteeMembers(e.target.value)}
                    placeholder="أدخل الأسماء مفصولة بفواصل..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Standards scoring */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    تقييم معايير إتقان الشاملة ({compStandards.length} معيار)
                  </h4>
                  <span className="text-xs text-slate-400">
                    يتم تجميع المؤشرات وفق مجالات التقييم تلقائياً
                  </span>
                </div>

                {compStandards.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                    لم يتم العثور على معايير مطبقة على التقييم الشامل. يرجى تفعيل أو إضافة معايير من تبويب "معايير إتقان".
                  </div>
                ) : (
                  <div className="space-y-3">
                    {compStandards.map((std) => {
                      const curScore = scores[std.id]?.score ?? 4;
                      const curNotes = scores[std.id]?.notes ?? '';
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
                                <span className="text-xs font-medium text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                                  {std.domain}
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
                            placeholder="الشواهد والأدلة الوثائقية المعتمدة لهذا المعيار..."
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Qualitative Sections */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-emerald-800 mb-1">
                    أبرز نقاط التميز والقوة المؤسسية (سطر لكل نقطة)
                  </label>
                  <textarea
                    rows={3}
                    value={strengths}
                    onChange={(e) => setStrengths(e.target.value)}
                    placeholder="التزام عالي بتطبيق معايير السلامة&#10;مؤشرات تحصيل دراسي متميزة"
                    className="w-full px-3 py-2 text-sm border border-emerald-200 bg-emerald-50/30 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-800 mb-1">
                    أبرز فجوات وفرص التحسين المؤسسي (سطر لكل نقطة)
                  </label>
                  <textarea
                    rows={3}
                    value={areasForImprovement}
                    onChange={(e) => setAreasForImprovement(e.target.value)}
                    placeholder="تفعيل أوسع لمختبرات التقنية&#10;استكمال خطط التدريب المهني"
                    className="w-full px-3 py-2 text-sm border border-amber-200 bg-amber-50/30 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  التوصيات الاستراتيجية والقرارات التصحيحية
                </label>
                <textarea
                  rows={2}
                  value={strategicRecommendations}
                  onChange={(e) => setStrategicRecommendations(e.target.value)}
                  placeholder="التوصيات المعتمدة للرفع للإدارة العامة ومتابعة الأثر..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
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
                    onClick={() => handleSaveEvaluation(true)}
                    className="px-4 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg transition-colors font-semibold"
                  >
                    حفظ كمسودة
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEvaluation(false)}
                    className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-semibold shadow-sm flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    تقديم التقييم للاعتماد
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Details */}
      {viewingEval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  تقرير التقييم المؤسسي الشامل - {viewingEval.targetEntityName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  العام الدراسي: {viewingEval.academicYear} | {viewingEval.term} | تاريخ: {viewingEval.evaluationDate}
                </p>
              </div>
              <button
                onClick={() => setViewingEval(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Score Highlight */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-indigo-800">الدرجة الموزونة المؤسسية</div>
                  <div className="text-2xl font-black text-indigo-950 mt-0.5">
                    {viewingEval.earnedScore.toFixed(1)}{' '}
                    <span className="text-sm font-normal text-indigo-600">
                      / {viewingEval.totalScore.toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-indigo-800">النسبة المئوية الإجمالية</div>
                  <span
                    className={`inline-block px-3 py-1 text-sm font-bold rounded-full mt-1 ${
                      viewingEval.percentage >= 85
                        ? 'bg-emerald-100 text-emerald-800'
                        : viewingEval.percentage >= 70
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {viewingEval.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Domain Breakdown Cards */}
              {viewingEval.domainScores && viewingEval.domainScores.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    مؤشرات الأداء حسب المجالات الرئيسية
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {viewingEval.domainScores.map((ds, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">{ds.domain}</span>
                          <span className="text-xs font-bold text-indigo-700">
                            {ds.percentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              ds.percentage >= 85
                                ? 'bg-emerald-500'
                                : ds.percentage >= 70
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, ds.percentage))}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-500 flex justify-between">
                          <span>الدرجة: {ds.earnedScore.toFixed(1)} / {ds.totalScore.toFixed(1)}</span>
                          <span>الوزن النسبي: {ds.weight}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Standards Breakdown Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  نتائج تقييم المعايير التفصيلية
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 font-semibold text-slate-700 sticky top-0">
                      <tr>
                        <th className="p-2.5">الكود</th>
                        <th className="p-2.5">المعيار والمؤشر</th>
                        <th className="p-2.5 text-center">الدرجة</th>
                        <th className="p-2.5 text-center">الوزن</th>
                        <th className="p-2.5">الملاحظات والشواهد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingEval.standardScores.map((sc, i) => (
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

              {/* Strengths & Recommendations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {viewingEval.strengths?.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <h5 className="text-xs font-bold text-emerald-900 mb-2">نقاط التميز والقوة</h5>
                    <ul className="list-disc list-inside text-xs text-emerald-800 space-y-1">
                      {viewingEval.strengths.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {viewingEval.areasForImprovement?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h5 className="text-xs font-bold text-amber-900 mb-2">فرص وفجوات التحسين</h5>
                    <ul className="list-disc list-inside text-xs text-amber-800 space-y-1">
                      {viewingEval.areasForImprovement.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Strategic Recommendations */}
              {viewingEval.strategicRecommendations?.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-1">التوصيات الاستراتيجية</h4>
                  <ul className="list-disc list-inside text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                    {viewingEval.strategicRecommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewingEval(null)}
                  className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium"
                >
                  إغلاق
                </button>

                {canApprove && viewingEval.status === 'SUBMITTED' && (
                  <button
                    type="button"
                    onClick={() => handleApprove(viewingEval)}
                    className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-semibold shadow-sm flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    اعتماد التقييم المؤسسي
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
