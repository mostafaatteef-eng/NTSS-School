import React from 'react';
import {
  QualityMetricOverview,
  DailyQualityReport,
  TeacherVisitReport,
  ComprehensiveEvaluation,
  CorrectiveAction,
  QualityStandard,
} from '../../types';
import {
  Award,
  TrendingUp,
  FileText,
  UserCheck,
  Layers,
  CheckSquare,
  AlertTriangle,
  Clock,
  Sparkles,
  BarChart2,
  PieChart as PieIcon,
} from 'lucide-react';

interface Props {
  metrics: QualityMetricOverview;
  dailyReports: DailyQualityReport[];
  teacherVisits: TeacherVisitReport[];
  evaluations: ComprehensiveEvaluation[];
  actions: CorrectiveAction[];
  standards: QualityStandard[];
  onNavigateTab: (tab: string) => void;
}

export const QualityDashboardSection: React.FC<Props> = ({
  metrics,
  dailyReports,
  teacherVisits,
  evaluations,
  actions,
  standards,
  onNavigateTab,
}) => {
  // Overdue actions
  const overdueActionsCount = actions.filter(
    (a) => a.status !== 'RESOLVED' && a.status !== 'CLOSED' && new Date(a.dueDate) < new Date()
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Welcome / Status Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/30 text-indigo-200 text-xs font-semibold backdrop-blur-sm border border-indigo-400/20 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              نظام إدارة وضمان الجودة المدرسية الشاملة
            </div>
            <h1 className="text-2xl font-black tracking-tight">
              لوحة مؤشرات الجودة والأداء المؤسسي
            </h1>
            <p className="text-sm text-indigo-200 mt-1 max-w-xl">
              متابعة حية لمؤشرات إتقان، تقارير الرصد الميداني، زيارات المعلمين الصفية، ومعدلات إغلاق الإجراءات التصحيحية.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15 text-center min-w-[160px]">
            <span className="text-xs font-medium text-indigo-200 block">معدل التقييم العام</span>
            <div className="text-3xl font-black text-amber-300 mt-0.5">
              {metrics.overallQualityScore.toFixed(1)}%
            </div>
            <span className="text-[11px] text-indigo-200 block mt-1">
              محسوب وفق أوزان إتقان
            </span>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Daily Reports KPI */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">التقارير اليومية</span>
            <div className="text-2xl font-black text-slate-900">{metrics.totalDailyReports}</div>
            <div className="text-xs text-indigo-600 font-semibold mt-1 flex items-center gap-1">
              <span>المتوسط: {metrics.averageDailyScore.toFixed(1)}%</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Teacher Visits KPI */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">الزيارات الصفية</span>
            <div className="text-2xl font-black text-slate-900">{metrics.totalTeacherVisits}</div>
            <div className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
              <span>المتوسط: {metrics.averageTeacherVisitScore.toFixed(1)}%</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Comprehensive Evals KPI */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">التقييم الشامل</span>
            <div className="text-2xl font-black text-slate-900">{metrics.totalComprehensiveEvaluations}</div>
            <div className="text-xs text-purple-600 font-semibold mt-1 flex items-center gap-1">
              <span>المتوسط: {metrics.averageComprehensiveScore.toFixed(1)}%</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* Corrective Actions KPI */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-1">الإجراءات التصحيحية</span>
            <div className="text-2xl font-black text-slate-900">
              {metrics.resolvedActionsCount} / {metrics.totalActionsCount}
            </div>
            <div className="text-xs font-semibold mt-1">
              {overdueActionsCount > 0 ? (
                <span className="text-rose-600 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {overdueActionsCount} إجراء متأخر
                </span>
              ) : (
                <span className="text-emerald-600 font-medium">نسبة الإنجاز: {metrics.actionsResolutionRate.toFixed(1)}%</span>
              )}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <CheckSquare className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Domain Performance Breakdown */}
      {metrics.domainAverages && metrics.domainAverages.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-indigo-600" />
              مؤشرات الأداء حسب مجالات معايير إتقان
            </h3>
            <span className="text-xs text-slate-400">
              متوسط النسبة المئوية الموزونة للمجال
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {metrics.domainAverages.map((da, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{da.domain}</span>
                  <span
                    className={`text-xs font-black ${
                      da.averagePercentage >= 85
                        ? 'text-emerald-700'
                        : da.averagePercentage >= 70
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {da.averagePercentage.toFixed(1)}%
                  </span>
                </div>

                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      da.averagePercentage >= 85
                        ? 'bg-emerald-500'
                        : da.averagePercentage >= 70
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, da.averagePercentage))}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-500 flex justify-between">
                  <span>إجمالي المعايير المقيمة: {da.count}</span>
                  <span>
                    {da.averagePercentage >= 85
                      ? 'متميز'
                      : da.averagePercentage >= 70
                      ? 'جيد جداً'
                      : 'يحتاج تحسين'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two Columns: Recent Visits & Active Corrective Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Teacher Visits */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-indigo-600" />
              أحدث الزيارات الصفية المنفذة
            </h3>
            <button
              onClick={() => onNavigateTab('visits')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
            >
              عرض الكل ({teacherVisits.length})
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {teacherVisits.slice(0, 4).map((tv) => (
              <div key={tv.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-sm text-slate-800">{tv.teacherName}</div>
                  <div className="text-xs text-slate-500">
                    {tv.subject} • {tv.grade} • {tv.visitDate}
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      tv.percentage >= 85
                        ? 'bg-emerald-100 text-emerald-800'
                        : tv.percentage >= 70
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {tv.percentage.toFixed(1)}%
                  </span>
                  <span className="block text-[10px] text-slate-400 mt-1">
                    {tv.status === 'APPROVED' ? 'معتمد' : 'بانتظار الاعتماد'}
                  </span>
                </div>
              </div>
            ))}
            {teacherVisits.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-xs">
                لا توجد زيارات صفية مسجلة بعد.
              </div>
            )}
          </div>
        </div>

        {/* Priority Corrective Actions */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-amber-600" />
              إجراءات تصحيحية تتطلب المتابعة
            </h3>
            <button
              onClick={() => onNavigateTab('actions')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold"
            >
              سجل الإجراءات ({actions.length})
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {actions
              .filter((a) => a.status !== 'RESOLVED' && a.status !== 'CLOSED')
              .slice(0, 4)
              .map((act) => {
                const isOverdue = new Date(act.dueDate) < new Date();
                return (
                  <div key={act.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-sm text-slate-800">{act.title}</div>
                      <div className="text-xs text-slate-500">
                        المسؤول: {act.assignedToName} • الاستحقاق: {act.dueDate}
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-2">
                      {isOverdue && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800">
                          متأخر
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-1 text-xs font-bold rounded-md ${
                          act.priority === 'CRITICAL'
                            ? 'bg-rose-100 text-rose-800'
                            : act.priority === 'HIGH'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {act.priority === 'CRITICAL'
                          ? 'حرجة'
                          : act.priority === 'HIGH'
                          ? 'عالية'
                          : 'متوسطة'}
                      </span>
                    </div>
                  </div>
                );
              })}

            {actions.filter((a) => a.status !== 'RESOLVED' && a.status !== 'CLOSED').length ===
              0 && (
              <div className="py-8 text-center text-slate-400 text-xs">
                ممتاز! لا توجد إجراءات تصحيحية معلقة حالياً.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
