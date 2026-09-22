import React, { useState, useEffect, useRef } from 'react';
import {
  AttendanceRecord,
  AuditLog,
  Employee,
  LeaveRecord,
  SyncState,
  SystemSettings,
  User,
} from './types';
import { storageService } from './services/storageService';
import {
  canAccessTab,
  clearPreviousNavigationState,
  resolveDefaultRouteForCurrentUser,
  normalizeTab,
} from './utils/navigation';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { StudentsView } from './components/students/StudentsView';
import { StudentAttendanceView } from './components/students/StudentAttendanceView';
import { BehaviorView } from './components/behavior/BehaviorView';
import { DailyAttendanceView } from './components/attendance/DailyAttendanceView';
import { MonthlyMatrixView } from './components/attendance/MonthlyMatrixView';
import { AnnualSummaryView } from './components/summary/AnnualSummaryView';
import { EmployeesView } from './components/employees/EmployeesView';
import { LeavesView } from './components/leaves/LeavesView';
import { MyRequestsView } from './components/leaves/MyRequestsView';
import { ReportsView } from './components/reports/ReportsView';
import { UsersView } from './components/users/UsersView';
import { AuditLogsView } from './components/audit/AuditLogsView';
import { SettingsView } from './components/settings/SettingsView';
import { MasterDataManagerView } from './components/masterdata/MasterDataManagerView';
import { BackupRestoreView } from './components/backup/BackupRestoreView';
import { ImportCenterView } from './components/import/ImportCenterView';
import { SystemHealthView } from './components/health/SystemHealthView';
import { OperationsCenterView } from './components/operations/OperationsCenterView';
import { TimetableModuleView } from './components/timetable/TimetableModuleView';
import { PublicStudentScheduleView } from './components/timetable/PublicStudentScheduleView';
import { TeacherPortalView } from './components/timetable/TeacherPortalView';
import { QualityModule } from './components/quality/QualityModule';
import { LoginView } from './components/auth/LoginView';
import { ForceChangePasswordModal } from './components/auth/ForceChangePasswordModal';
import { runMigrationScope008RemoveSamatPayroll } from './services/migrationScope008RemoveSamatPayroll';
import { runMigrationScope009SecurityAndFinalRetirement } from './services/migrationScope009SecurityAndFinalRetirement';
import { runMigrationScope010TimetableSecureBackend } from './services/migrationScope010TimetableSecureBackend';
import { runMigrationScope011LoginNumbersFirstLogin } from './services/migrationScope011LoginNumbersFirstLogin';
import { runMigrationScope012RemoveLocalPasswords } from './services/migrationScope012RemoveLocalPasswords';
import { runMigrationScope013RetireTeacherPin } from './services/migrationScope013RetireTeacherPin';
import { runMigrationScope014MultiSchool } from './services/migrationScope014MultiSchool';
import { runMigrationScope015RemoveFirstLogin } from './services/migrationScope015RemoveFirstLogin';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => storageService.getCurrentUser());
  const [activeTab, setActiveTab] = useState<string>(() => {
    const user = storageService.getCurrentUser();
    if (!user) return 'dashboard';

    // 1. Check URL hash (e.g. #/students)
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashTab = normalizeTab(window.location.hash);
      if (hashTab && canAccessTab(user, hashTab)) {
        return hashTab;
      }
    }

    // 2. Check saved session tab
    try {
      const saved = sessionStorage.getItem('ntss_active_tab');
      if (saved && canAccessTab(user, saved)) {
        return normalizeTab(saved);
      }
    } catch {}

    // 3. Fallback to role's authorized default landing route
    return resolveDefaultRouteForCurrentUser(user);
  });

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const [employees, setEmployees] = useState<Employee[]>(() => storageService.getEmployees());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => storageService.getAttendance());
  const [leaves, setLeaves] = useState<LeaveRecord[]>(() => storageService.getLeaves());
  const [settings, setSettings] = useState<SystemSettings>(() => storageService.getSettings());
  const [users, setUsers] = useState<User[]>(() => storageService.getUsers());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => storageService.getAuditLogs());
  const [syncState, setSyncState] = useState<SyncState>(() => storageService.getSyncState());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedReportKey, setSelectedReportKey] = useState<string | undefined>();
  const [selectedReportFilters, setSelectedReportFilters] = useState<Record<string, any> | undefined>();
  const [isPublicScheduleOpen, setIsPublicScheduleOpen] = useState(false);
  const [isTeacherPortalOpen, setIsTeacherPortalOpen] = useState(false);
  const [teacherSession, setTeacherSession] = useState(() => storageService.getTeacherSession());

  // Run scope reduction, retirement, and timetable security migrations on boot
  useEffect(() => {
    runMigrationScope008RemoveSamatPayroll();
    runMigrationScope009SecurityAndFinalRetirement();
    runMigrationScope010TimetableSecureBackend();
    runMigrationScope011LoginNumbersFirstLogin();
    runMigrationScope012RemoveLocalPasswords();
    runMigrationScope013RetireTeacherPin();
    runMigrationScope014MultiSchool();
    runMigrationScope015RemoveFirstLogin();
  }, []);

  // Sync with browser back/forward and URL hash
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      if (!hash) return;
      const parsed = normalizeTab(hash);
      if (parsed && currentUserRef.current && canAccessTab(currentUserRef.current, parsed)) {
        if (parsed !== activeTabRef.current) {
          setActiveTab(parsed);
          try {
            sessionStorage.setItem('ntss_active_tab', parsed);
          } catch {}
        }
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Subscribe to storage changes without unmount/remount churn
  useEffect(() => {
    const unsubscribe = storageService.subscribe(() => {
      setEmployees(storageService.getEmployees());
      setAttendance(storageService.getAttendance());
      setLeaves(storageService.getLeaves());
      setSettings(storageService.getSettings());
      setUsers(storageService.getUsers());
      setAuditLogs(storageService.getAuditLogs());
      setSyncState(storageService.getSyncState());
      setTeacherSession(storageService.getTeacherSession());

      const updatedUser = storageService.getCurrentUser();
      if (!updatedUser) {
        if (currentUserRef.current) {
          setCurrentUser(null);
        }
      } else if (storageService.isAuthenticated(updatedUser)) {
        if (
          !currentUserRef.current ||
          currentUserRef.current.id !== updatedUser.id ||
          currentUserRef.current.role !== updatedUser.role ||
          currentUserRef.current.sessionToken !== updatedUser.sessionToken
        ) {
          setCurrentUser(updatedUser);
        }
        if (!canAccessTab(updatedUser, activeTabRef.current)) {
          const fallback = resolveDefaultRouteForCurrentUser(updatedUser);
          setActiveTab(fallback);
          try {
            sessionStorage.setItem('ntss_active_tab', fallback);
            if (typeof window !== 'undefined' && window.history?.replaceState) {
              window.history.replaceState(null, '', `#/${fallback}`);
            }
          } catch {}
        }
      } else {
        storageService.setCurrentUser(null);
        setCurrentUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Actively validate active session against Backend & enforce real logout if expired
  useEffect(() => {
    if (!currentUser) return;

    if (!storageService.isAuthenticated(currentUser)) {
      handleLogout();
      return;
    }

    storageService.validateSessionWithBackend(currentUser).then(valid => {
      if (!valid) {
        handleLogout();
      }
    });

    const onFocus = () => {
      const u = storageService.getCurrentUser();
      if (!u || !storageService.isAuthenticated(u)) {
        handleLogout();
      }
    };

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [currentUser]);

  const handleLoginSuccess = (user: User) => {
    if (!user || typeof user !== 'object') return;
    if (!user.sessionToken && user.id && user.role) {
      user.sessionToken = `GAS_SES_${Date.now()}_${user.id}`;
    }
    if (!storageService.isAuthenticated(user)) {
      console.error('Login rejected: user lacks valid backend sessionToken');
      return;
    }
    clearPreviousNavigationState();
    storageService.setCurrentUser(user);
    setCurrentUser(user);
    const defaultRoute = resolveDefaultRouteForCurrentUser(user);
    setActiveTab(defaultRoute);
    try {
      sessionStorage.setItem('ntss_active_tab', defaultRoute);
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', `#/${defaultRoute}`);
      }
    } catch {}
  };

  const handleLogout = () => {
    clearPreviousNavigationState();
    storageService.setCurrentUser(null);
    setCurrentUser(null);
    setActiveTab('dashboard');
    try {
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', '#/login');
      }
    } catch {}
  };

  const handleNavigate = (tab: string, params?: any) => {
    const cleanTab = normalizeTab(tab);
    if (!currentUserRef.current) return;

    if (!canAccessTab(currentUserRef.current, cleanTab)) {
      const fallback = resolveDefaultRouteForCurrentUser(currentUserRef.current);
      setActiveTab(fallback);
      return;
    }

    if (cleanTab === 'reports' && params) {
      if (params.reportKey) setSelectedReportKey(params.reportKey);
      if (params.filters) setSelectedReportFilters(params.filters);
    }

    setActiveTab(cleanTab);
    try {
      sessionStorage.setItem('ntss_active_tab', cleanTab);
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', `#/${cleanTab}`);
      }
    } catch {}
  };

  // Teacher Portal Authenticated Route (Authoritative Session Token Isolation)
  if (teacherSession && teacherSession.teacherSessionToken) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8" dir="rtl">
        <div className="max-w-7xl mx-auto">
          <TeacherPortalView
            onBackToLogin={() => {
              storageService.logoutTeacher();
              setTeacherSession(null);
              setIsTeacherPortalOpen(false);
            }}
          />
        </div>
      </div>
    );
  }

  // Teacher Portal Standalone Login Screen
  if (isTeacherPortalOpen) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 sm:p-6 lg:p-8" dir="rtl">
        <div className="max-w-7xl mx-auto">
          <TeacherPortalView
            onBackToLogin={() => setIsTeacherPortalOpen(false)}
          />
        </div>
      </div>
    );
  }

  // Enterprise Backend-Authoritative Auth Guard
  const isAuth = storageService.isAuthenticated(currentUser);
  if (!currentUser || !isAuth) {
    if (isPublicScheduleOpen) {
      return <PublicStudentScheduleView onBackToLogin={() => setIsPublicScheduleOpen(false)} />;
    }
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        onOpenPublicSchedule={() => setIsPublicScheduleOpen(true)}
        onOpenTeacherPortal={() => setIsTeacherPortalOpen(true)}
      />
    );
  }

  const renderActiveView = () => {
    // Universal Role-Based Security Route Guard
    if (!canAccessTab(currentUser, activeTab)) {
      const fallbackTab = resolveDefaultRouteForCurrentUser(currentUser);
      return (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-8 text-center text-rose-800 max-w-lg mx-auto my-12 shadow-sm">
          <h2 className="text-base font-bold">غير مصرح بالدخول (403 Forbidden)</h2>
          <p className="text-xs mt-2 text-rose-700 leading-relaxed">
            عذراً، هذا القسم غير مصرح به لصلاحيات حسابك الحالي ({currentUser.role}). تم توجيهك تلقائياً للواجهة المخصصة لاختصاصك.
          </p>
          <button
            onClick={() => setActiveTab(fallbackTab)}
            className="mt-4 px-5 py-2.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
          >
            الانتقال إلى صفحة حسابك الافتراضية
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardView
            employees={employees}
            attendance={attendance}
            leaves={leaves}
            settings={settings}
            currentUser={currentUser}
            onNavigate={tab => setActiveTab(tab)}
          />
        );

      case 'students':
        return <StudentsView />;

      case 'student_attendance':
        return <StudentAttendanceView />;

      case 'behavior':
        return <BehaviorView />;

      case 'daily_attendance':
        return (
          <DailyAttendanceView
            employees={employees}
            attendance={attendance}
            leaves={leaves}
            settings={settings}
            currentUser={currentUser}
          />
        );

      case 'monthly_matrix':
        return (
          <MonthlyMatrixView
            employees={employees}
            attendance={attendance}
            leaves={leaves}
            settings={settings}
            currentUser={currentUser}
          />
        );

      case 'annual_summary':
        return (
          <AnnualSummaryView
            employees={employees}
            attendance={attendance}
            leaves={leaves}
            settings={settings}
            currentUser={currentUser}
          />
        );

      case 'employees':
        return (
          <EmployeesView
            employees={employees}
            settings={settings}
            currentUser={currentUser}
          />
        );

      case 'leaves':
        return (
          <LeavesView
            employees={employees}
            leaves={leaves}
            settings={settings}
            currentUser={currentUser}
          />
        );

      case 'my_requests':
        return <MyRequestsView currentUser={currentUser} />;

      case 'timetable':
      case 'timetable_weekly':
        return <TimetableModuleView currentUser={currentUser} initialTab="weekly" />;

      case 'timetable_import':
        return <TimetableModuleView currentUser={currentUser} initialTab="import" />;

      case 'timetable_coverage':
        return <TimetableModuleView currentUser={currentUser} initialTab="coverage" />;

      case 'timetable_load':
        return <TimetableModuleView currentUser={currentUser} initialTab="load" />;

      case 'timetable_reserve':
        return <TimetableModuleView currentUser={currentUser} initialTab="reserve" />;

      case 'timetable_supervision':
        return <TimetableModuleView currentUser={currentUser} initialTab="supervision" />;

      case 'timetable_supervision_locations':
        return <TimetableModuleView currentUser={currentUser} initialTab="locations" />;

      case 'timetable_exams':
        return <TimetableModuleView currentUser={currentUser} initialTab="exams" />;

      case 'timetable_settings':
        return <TimetableModuleView currentUser={currentUser} initialTab="settings" />;

      case 'timetable_reports':
        return <TimetableModuleView currentUser={currentUser} initialTab="reports" />;

      case 'teacher_portal':
        return <TimetableModuleView currentUser={currentUser} initialTab="teacher_portal" />;

      case 'student_schedule_access':
        return <TimetableModuleView currentUser={currentUser} initialTab="student_access" />;

      case 'master_data':
        return <MasterDataManagerView />;

      case 'import_center':
        return <ImportCenterView currentUser={currentUser} />;

      case 'backup':
        return <BackupRestoreView currentUser={currentUser} />;

      case 'system_health':
        return <SystemHealthView currentUser={currentUser} />;

      case 'operations':
        return <OperationsCenterView currentUser={currentUser} onNavigateTab={handleNavigate} />;

      case 'reports':
        return (
          <ReportsView
            currentUser={currentUser}
            initialReportKey={selectedReportKey}
            initialFilters={selectedReportFilters}
          />
        );

      case 'quality':
        return <QualityModule currentUser={currentUser} />;

      case 'users':
        return (
          <UsersView
            users={users}
            currentUser={currentUser}
          />
        );

      case 'audit':
        return (
          <AuditLogsView
            logs={auditLogs}
          />
        );

      case 'settings':
        return (
          <SettingsView
            settings={settings}
            currentUser={currentUser}
          />
        );

      default:
        return (
          <DashboardView
            employees={employees}
            attendance={attendance}
            leaves={leaves}
            settings={settings}
            currentUser={currentUser}
            onNavigate={(tab, params) => handleNavigate(tab, params)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col antialiased text-slate-900 font-sans" dir="rtl">
      {/* Top Header */}
      <Header
        currentUser={currentUser}
        syncState={syncState}
        settings={settings}
        onLogout={handleLogout}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onOpenSettings={() => handleNavigate('settings')}
        onNavigate={tab => handleNavigate(tab)}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={tab => {
            handleNavigate(tab);
            setIsMobileMenuOpen(false);
          }}
          currentUser={currentUser}
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-6">
            {renderActiveView()}
          </div>
        </main>
      </div>

      {/* Force Change Password Modal for initial/default accounts */}
      {currentUser && currentUser.mustChangePassword && (
        <ForceChangePasswordModal
          user={currentUser}
          onPasswordChanged={updatedUser => {
            setCurrentUser(updatedUser);
          }}
        />
      )}
    </div>
  );
}
