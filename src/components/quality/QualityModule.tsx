import React, { useState, useEffect } from 'react';
import {
  User,
  QualityStandard,
  DailyQualityReport,
  TeacherVisitReport,
  ComprehensiveEvaluation,
  CorrectiveAction,
  QualityMetricOverview,
  Employee,
} from '../../types';
import { storageService } from '../../services/storageService';
import { hasPermission } from '../../utils/permissions';
import { EtqanStandardsManager } from './EtqanStandardsManager';
import { DailyQualityReportSection } from './DailyQualityReportSection';
import { TeacherVisitReportSection } from './TeacherVisitReportSection';
import { ComprehensiveEvaluationSection } from './ComprehensiveEvaluationSection';
import { CorrectiveActionsSection } from './CorrectiveActionsSection';
import { QualityDashboardSection } from './QualityDashboardSection';
import { PageHeader } from '../common/UiStates';
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
  // Quality is school-scoped. Never fall back to a fabricated/default tenant:
  // SystemAdmin must explicitly select a school and school users must carry one.
  const schoolId = currentUser?.role === 'SystemAdmin'
    ? (currentUser?.activeSchoolId || activeSchool?.schoolId || '')
    : (currentUser?.schoolId || activeSchool?.schoolId || '');

  // State data
  const [standards, setStandards] = useState<QualityStandard[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyQualityReport[]>([]);
  const [teacherVisits, setTeacherVisits] = useState<TeacherVisitReport[]>([]);
  const [evaluations, setEvaluations] = useState<ComprehensiveEvaluation[]>([]);
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [metrics, setMetrics] = useState<QualityMetricOverview | null>(null);
  const [teachers, setTeachers] = useState<Employee[]>([]);

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
  const loadData = async () => {
    if (!schoolId) {
      setStandards([]);
      setDailyReports([]);
      setTeacherVisits([]);
      setEvaluations([]);
      setActions([]);
      setMetrics(null);
      setTeachers([]);
      return;
    }
    let stds: QualityStandard[] = [];
    let daily: DailyQualityReport[] = [];
    let visits: TeacherVisitReport[] = [];
    let evals: ComprehensiveEvaluation[] = [];
    let acts: CorrectiveAction[] = [];
    try {
      const [serverStds,serverDaily,serverVisits,serverEvals,serverActs,employeeResult]=await Promise.all([
        storageService.getAuthoritativeQualityRecords('QUALITY_STANDARD',schoolId),
        storageService.getAuthoritativeQualityRecords('DAILY_REPORT',schoolId),
        storageService.getAuthoritativeQualityRecords('TEACHER_VISIT',schoolId),
        storageService.getAuthoritativeQualityRecords('COMPREHENSIVE_EVALUATION',schoolId),
        storageService.getAuthoritativeQualityRecords('CORRECTIVE_ACTION',schoolId),
        storageService.getEmployeeManagementDataAuthoritative(),
      ]);
      stds=serverStds as QualityStandard[]; daily=serverDaily as DailyQualityReport[]; visits=serverVisits as TeacherVisitReport[];
      evals=serverEvals as ComprehensiveEvaluation[]; acts=serverActs as CorrectiveAction[];
      const employees=employeeResult.success && Array.isArray(employeeResult.employees) ? employeeResult.employees : [];
      setTeachers(employees.filter((employee) => employee.employeeType === 'Teacher' && employee.status !== 'Inactive'));
    } catch (error) {
      console.error('Authoritative quality load failed',error);
      // Fail closed: never present stale browser records as authoritative Production data.
      stds=[]; daily=[]; visits=[]; evals=[]; acts=[]; setTeachers([]);
    }
    const met = storageService.getQualityMetricOverview(schoolId,{ daily,visits,evals,actions:acts,standards:stds });

    setStandards(stds);
    setDailyReports(daily);
    setTeacherVisits(visits);
    setEvaluations(evals);
    setActions(acts);
    setMetrics(met);
  };

  useEffect(() => {
    void loadData();
  }, [schoolId]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="منظومة الجودة والاعتماد المدرسي"
        description={<>إتقان • المدرسة الحالية: <span className="font-bold text-slate-700">{activeSchool?.schoolName || 'مدرسة التميز النموذجية'}</span> • <span className="font-mono text-[#008e8b]">عزل بيانات المدرسة ({schoolId})</span></>}
        icon={<span className="rounded-xl bg-teal-50 p-2 text-[#008e8b]"><Award className="h-5 w-5" /></span>}
        actions={<button onClick={loadData} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" title="تحديث البيانات"><RefreshCw className="h-4 w-4" />تحديث</button>}
      />

      {!schoolId && currentUser?.role === 'SystemAdmin' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          اختر مدرسة من مبدّل المدارس أولاً لعرض بيانات الجودة وزيارات المعلمين.
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          id="tab-quality-dashboard"
          onClick={() => setActiveSubTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeSubTab === 'dashboard'
              ? 'bg-[#008e8b] text-white'
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
              ? 'bg-[#008e8b] text-white'
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
              ? 'bg-[#008e8b] text-white'
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
              ? 'bg-[#008e8b] text-white'
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
              ? 'bg-[#008e8b] text-white'
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
              ? 'bg-[#008e8b] text-white'
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
          teachers={teachers}
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
