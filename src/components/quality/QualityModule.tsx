import React, { useState, useEffect } from 'react';
import {
  User,
  QualityStandard,
  DailyQualityReport,
  TeacherVisitReport,
  ComprehensiveEvaluation,
  CorrectiveAction,
  QualityMetricOverview,
} from '../../types';
import { storageService } from '../../services/storageService';
import { hasPermission } from '../../utils/permissions';
import { EtqanStandardsManager } from './EtqanStandardsManager';
import { DailyQualityReportSection } from './DailyQualityReportSection';
import { TeacherVisitReportSection } from './TeacherVisitReportSection';
import { ComprehensiveEvaluationSection } from './ComprehensiveEvaluationSection';
import { CorrectiveActionsSection } from './CorrectiveActionsSection';
import { QualityDashboardSection } from './QualityDashboardSection';
import {
  Award,
  FileText,
  UserCheck,
  Layers,
  CheckSquare,
  BarChart2,
  Building,
  RefreshCw,
} from 'lucide-react';

interface QualityModuleProps {
  currentUser: User | null;
}

type QualitySubTab =
  | 'dashboard'
  | 'daily'
  | 'visits'
  | 'comprehensive'
  | 'standards'
  | 'actions';

export const QualityModule: React.FC<QualityModuleProps> = ({ currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<QualitySubTab>('dashboard');

  // School isolation
  const activeSchool = storageService.getActiveSchool();
  const schoolId = activeSchool?.schoolId || currentUser?.schoolId || 'SCH-01';

  // State data
  const [standards, setStandards] = useState<QualityStandard[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyQualityReport[]>([]);
  const [teacherVisits, setTeacherVisits] = useState<TeacherVisitReport[]>([]);
  const [evaluations, setEvaluations] = useState<ComprehensiveEvaluation[]>([]);
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [metrics, setMetrics] = useState<QualityMetricOverview | null>(null);

  // Permissions check
  const canManageStandards =
    hasPermission(currentUser, 'quality.manageStandards') ||
    currentUser?.role === 'Admin' ||
    currentUser?.role === 'SchoolDirector' ||
    currentUser?.role === 'QualityOfficer';

  const canCreate =
    hasPermission(currentUser, 'quality.create') ||
    hasPermission(currentUser, 'quality.evaluate') ||
    currentUser?.role === 'Admin' ||
    currentUser?.role === 'SchoolDirector' ||
    currentUser?.role === 'QualityOfficer' ||
    currentUser?.role === 'Supervisor';

  const canApprove =
    hasPermission(currentUser, 'quality.approve') ||
    currentUser?.role === 'Admin' ||
    currentUser?.role === 'SchoolDirector';

  const canViewDashboard =
    hasPermission(currentUser, 'quality.viewDashboard') ||
    hasPermission(currentUser, 'quality.view') ||
    true;

  // Load all Quality module data for current school
  const loadData = () => {
    const stds = storageService.getQualityStandards(schoolId);
    const daily = storageService.getDailyQualityReports(schoolId);
    const visits = storageService.getTeacherVisitReports(schoolId);
    const evals = storageService.getComprehensiveEvaluations(schoolId);
    const acts = storageService.getCorrectiveActions(schoolId);
    const met = storageService.getQualityMetricOverview(schoolId);

    setStandards(stds);
    setDailyReports(daily);
    setTeacherVisits(visits);
    setEvaluations(evals);
    setActions(acts);
    setMetrics(met);
  };

  useEffect(() => {
    loadData();
  }, [schoolId]);

  return (
    <div className="space-y-6 pb-12">
      {/* School isolation Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900">
                منظومة الجودة والاعتماد المدرسي
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                إتقان
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              المدرسة الحالية: <span className="font-bold text-slate-700">{activeSchool?.schoolName || 'مدرسة التميز النموذجية'}</span>
              <span className="text-slate-300">•</span>
              <span className="text-[11px] text-indigo-600 font-mono">عزل كامل لبيانات المدرسة ({schoolId})</span>
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
          title="تحديث البيانات"
        >
          <RefreshCw className="w-4 h-4" />
          <span>تحديث</span>
        </button>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          id="tab-quality-dashboard"
          onClick={() => setActiveSubTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeSubTab === 'dashboard'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          لوحة مؤشرات الجودة
        </button>

        <button
          id="tab-quality-daily"
          onClick={() => setActiveSubTab('daily')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeSubTab === 'daily'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          تقرير الجودة اليومي ({dailyReports.length})
        </button>

        <button
          id="tab-quality-visits"
          onClick={() => setActiveSubTab('visits')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeSubTab === 'visits'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          تقرير زيارة معلم ({teacherVisits.length})
        </button>

        <button
          id="tab-quality-comprehensive"
          onClick={() => setActiveSubTab('comprehensive')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeSubTab === 'comprehensive'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          التقييم الشامل ({evaluations.length})
        </button>

        <button
          id="tab-quality-actions"
          onClick={() => setActiveSubTab('actions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeSubTab === 'actions'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          الإجراءات التصحيحية ({actions.length})
        </button>

        <button
          id="tab-quality-standards"
          onClick={() => setActiveSubTab('standards')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeSubTab === 'standards'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Award className="w-4 h-4" />
          معايير إتقان (Master Data) ({standards.length})
        </button>
      </div>

      {/* Sub-tab Views */}
      {activeSubTab === 'dashboard' && metrics && (
        <QualityDashboardSection
          metrics={metrics}
          dailyReports={dailyReports}
          teacherVisits={teacherVisits}
          evaluations={evaluations}
          actions={actions}
          standards={standards}
          onNavigateTab={(tab) => {
            if (tab === 'visits') setActiveSubTab('visits');
            if (tab === 'actions') setActiveSubTab('actions');
            if (tab === 'daily') setActiveSubTab('daily');
          }}
        />
      )}

      {activeSubTab === 'daily' && (
        <DailyQualityReportSection
          currentUser={currentUser}
          standards={standards}
          reports={dailyReports}
          onRefresh={loadData}
          canCreate={canCreate}
          canApprove={canApprove}
        />
      )}

      {activeSubTab === 'visits' && (
        <TeacherVisitReportSection
          currentUser={currentUser}
          standards={standards}
          reports={teacherVisits}
          onRefresh={loadData}
          canCreate={canCreate}
          canApprove={canApprove}
        />
      )}

      {activeSubTab === 'comprehensive' && (
        <ComprehensiveEvaluationSection
          currentUser={currentUser}
          standards={standards}
          evaluations={evaluations}
          onRefresh={loadData}
          canCreate={canCreate}
          canApprove={canApprove}
        />
      )}

      {activeSubTab === 'actions' && (
        <CorrectiveActionsSection
          currentUser={currentUser}
          actions={actions}
          onRefresh={loadData}
          canCreate={canCreate}
          canManage={canManageStandards || canCreate}
        />
      )}

      {activeSubTab === 'standards' && (
        <EtqanStandardsManager
          currentUser={currentUser}
          standards={standards}
          onRefresh={loadData}
          canManage={canManageStandards}
        />
      )}
    </div>
  );
};
