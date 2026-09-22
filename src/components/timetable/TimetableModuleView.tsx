import React, { useEffect, useState } from 'react';
import {
  Calendar,
  FileSpreadsheet,
  BookOpen,
  UserCheck,
  Clock,
  Shield,
  Building,
  Award,
  Settings as SettingsIcon,
  FileText,
  GraduationCap,
  Eye,
  Layers,
} from 'lucide-react';
import { User } from '../../types';
import { TimetableWeeklyMatrixView } from './TimetableWeeklyMatrixView';
import { TimetableImportWizardView } from './TimetableImportWizardView';
import { CurriculumCoverageView } from './CurriculumCoverageView';
import { TeacherLoadView } from './TeacherLoadView';
import { ReserveManagementView } from './ReserveManagementView';
import { SupervisionView } from './SupervisionView';
import { SupervisionLocationsView } from './SupervisionLocationsView';
import { ExamScheduleView } from './ExamScheduleView';
import { TimetableSettingsView } from './TimetableSettingsView';
import { TimetableReportsView } from './TimetableReportsView';
import { TeacherPortalView } from './TeacherPortalView';
import { StudentScheduleAccessView } from './StudentScheduleAccessView';
import { CurriculumPlansView } from './CurriculumPlansView';

export type TimetableSubTab =
  | 'weekly'
  | 'import'
  | 'curriculum_plans'
  | 'coverage'
  | 'load'
  | 'reserve'
  | 'supervision'
  | 'locations'
  | 'exams'
  | 'settings'
  | 'reports'
  | 'teacher_portal'
  | 'student_access';

interface TimetableModuleViewProps {
  currentUser?: User | null;
  initialTab?: TimetableSubTab;
}

export const TimetableModuleView: React.FC<TimetableModuleViewProps> = ({
  currentUser,
  initialTab = 'weekly',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<TimetableSubTab>(initialTab);

  useEffect(() => {
    setActiveSubTab(initialTab);
  }, [initialTab]);

  const isAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'SchoolDirector';

  const navTabs = [
    { id: 'weekly', label: 'الجدول الأسبوعي', icon: Calendar },
    { id: 'import', label: 'استيراد aSc والجدول', icon: FileSpreadsheet, adminOnly: true },
    { id: 'curriculum_plans', label: 'خطط المناهج وتوزيع الحصص', icon: Layers },
    { id: 'coverage', label: 'مطابقة الخطة (39 حصة)', icon: BookOpen },
    { id: 'load', label: 'أنصبة المعلمين (30 حصة)', icon: UserCheck },
    { id: 'reserve', label: 'حصص الاحتياطي', icon: Clock },
    { id: 'supervision', label: 'جدول الإشراف', icon: Shield },
    { id: 'locations', label: 'أماكن الإشراف', icon: Building, adminOnly: true },
    { id: 'exams', label: 'جدول الامتحانات', icon: Award },
    { id: 'reports', label: 'تقارير الجدول', icon: FileText },
    { id: 'settings', label: 'إعدادات وفترات الجدول', icon: SettingsIcon, adminOnly: true },
    { id: 'teacher_portal', label: 'بوابة المعلم', icon: GraduationCap },
    { id: 'student_access', label: 'وصول الطلاب (QR)', icon: Eye },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Module Subnav */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {navTabs.map(tab => {
            if (tab.adminOnly && !isAdmin) return null;
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;

            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as TimetableSubTab)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panels */}
      <div>
        {activeSubTab === 'weekly' && <TimetableWeeklyMatrixView currentUser={currentUser} />}
        {activeSubTab === 'import' && <TimetableImportWizardView />}
        {activeSubTab === 'curriculum_plans' && <CurriculumPlansView currentUser={currentUser || null} />}
        {activeSubTab === 'coverage' && <CurriculumCoverageView />}
        {activeSubTab === 'load' && <TeacherLoadView />}
        {activeSubTab === 'reserve' && <ReserveManagementView />}
        {activeSubTab === 'supervision' && <SupervisionView />}
        {activeSubTab === 'locations' && <SupervisionLocationsView />}
        {activeSubTab === 'exams' && <ExamScheduleView />}
        {activeSubTab === 'settings' && <TimetableSettingsView />}
        {activeSubTab === 'reports' && <TimetableReportsView />}
        {activeSubTab === 'teacher_portal' && <TeacherPortalView currentUser={currentUser} />}
        {activeSubTab === 'student_access' && <StudentScheduleAccessView />}
      </div>
    </div>
  );
};
