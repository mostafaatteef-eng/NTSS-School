import React, { useRef, useEffect, useState } from 'react';
import {
  Activity,
  Award,
  BookOpen,
  Building,
  Calendar,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  Clock,
  Database,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HeartHandshake,
  History,
  LayoutDashboard,
  Server,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  UploadCloud,
  UserCheck,
  Users,
} from 'lucide-react';
import { PermissionKey, User } from '../../types';
import { hasPermission } from '../../utils/permissions';
import {
  canAccessTab,
  normalizeTab,
  isSystemAdmin,
  isSchoolAdmin,
  isLegacyAdmin,
} from '../../utils/navigation';
import { NTSSLogo } from '../common/NTSSLogo';

export type ActiveTab =
  | 'dashboard'
  | 'students'
  | 'student_attendance'
  | 'behavior'
  | 'daily_attendance'
  | 'monthly_matrix'
  | 'annual_summary'
  | 'employees'
  | 'leaves'
  | 'my_requests'
  | 'timetable'
  | 'timetable_weekly'
  | 'timetable_import'
  | 'timetable_coverage'
  | 'timetable_load'
  | 'timetable_reserve'
  | 'timetable_supervision'
  | 'timetable_supervision_locations'
  | 'timetable_exams'
  | 'timetable_settings'
  | 'timetable_reports'
  | 'teacher_portal'
  | 'student_schedule_access'
  | 'master_data'
  | 'import_center'
  | 'backup'
  | 'system_health'
  | 'reports'
  | 'quality'
  | 'operations'
  | 'users'
  | 'settings'
  | 'audit';

interface SidebarProps {
  activeTab: string;
  setActiveTab?: (tab: string) => void;
  onSelectTab?: (tab: any) => void;
  currentUser: User | null;
  isMobileMenuOpen?: boolean;
  isOpenMobile?: boolean;
  setIsMobileMenuOpen?: (open: boolean) => void;
  onCloseMobile?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
  permission?: PermissionKey;
  adminOnly?: boolean;
  hideForRoles?: string[];
  showForRoles?: string[];
}

interface NavSection {
  title: string;
  id: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onSelectTab,
  currentUser,
  isMobileMenuOpen,
  isOpenMobile,
  setIsMobileMenuOpen,
  onCloseMobile,
}) => {
  const isMobileOpen = isMobileMenuOpen ?? isOpenMobile ?? false;
  const navContainerRef = useRef<HTMLDivElement>(null);
  const lastClickTimeRef = useRef<number>(0);

  // Normalized active tab to ensure highlighting always matches current route
  const currentTab = normalizeTab(activeTab);

  // Remember collapsed sections in localStorage for user convenience without jitter
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ntss_sidebar_collapsed_sections');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const updated = { ...prev, [sectionId]: !prev[sectionId] };
      try {
        localStorage.setItem('ntss_sidebar_collapsed_sections', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleCloseMobile = () => {
    if (setIsMobileMenuOpen) setIsMobileMenuOpen(false);
    if (onCloseMobile) onCloseMobile();
  };

  const handleSelect = (tabId: string) => {
    const now = Date.now();
    // Protect against rapid accidental double-clicks on the same active item
    if (tabId === currentTab && now - lastClickTimeRef.current < 400) {
      return;
    }
    lastClickTimeRef.current = now;

    // Trigger tab change in parent application
    if (setActiveTab) setActiveTab(tabId);
    if (onSelectTab) onSelectTab(tabId);

    // On mobile screens: close drawer after selection
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      handleCloseMobile();
    }
    // On desktop: NEVER close the sidebar automatically on navigation
  };

  // Canonical Admin Gate: Identifies administrative authority (SystemAdmin, SchoolAdmin, Legacy Admin)
  const isAdminUser = Boolean(
    isSystemAdmin(currentUser) || isSchoolAdmin(currentUser) || isLegacyAdmin(currentUser)
  );

  const navSections: NavSection[] = [
    {
      id: 'sec_overview',
      title: 'الرئيسية والمتابعة',
      items: [
        {
          id: 'dashboard',
          label: 'لوحة التحكم',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      id: 'sec_students',
      title: 'شئون الطلاب والمدرسة',
      items: [
        {
          id: 'students',
          label: 'سجلات وبيانات الطلاب والقيد',
          icon: GraduationCap,
          permission: 'students.view',
        },
        {
          id: 'student_attendance',
          label: 'رصد حضور وغياب الطلاب',
          icon: UserCheck,
          badge: 'يومي',
          permission: 'studentAttendance.view',
        },
        {
          id: 'behavior',
          label: 'لائحة الانضباط والخدمة الاجتماعية',
          icon: Shield,
          permission: 'behavior.view',
        },
      ],
    },
    {
      id: 'sec_staff',
      title: 'شئون المعلمين والعاملين',
      items: [
        {
          id: 'employees',
          label: 'سجلات المعلمين والعاملين',
          icon: Users,
          permission: 'teachers.view',
        },
        {
          id: 'daily_attendance',
          label: 'دفتر دوام العاملين اليومي',
          icon: Clock,
          permission: 'teacherAttendance.view',
        },
        {
          id: 'monthly_matrix',
          label: 'المصفوفة الشهرية لدوام العاملين',
          icon: CalendarDays,
          permission: 'teacherAttendance.view',
        },
        {
          id: 'leaves',
          label: 'إدارة الإجازات والأذونات الرسمية',
          icon: CalendarRange,
          permission: 'leaves.view',
        },
        {
          id: 'my_requests',
          label: 'إجازاتي وأذوناتي',
          icon: FileCheck,
        },
      ],
    },
    {
      id: 'sec_timetable',
      title: 'الجدول المدرسي والأنصبة',
      items: [
        {
          id: 'timetable_weekly',
          label: 'الجدول الأسبوعي العام',
          icon: Calendar,
          permission: 'schedule.view',
        },
        {
          id: 'timetable_import',
          label: 'استيراد ومطابقة الجدول',
          icon: Upload,
          adminOnly: true,
          permission: 'timetable.import',
          badge: 'استيراد',
        },
        {
          id: 'timetable_coverage',
          label: 'مطابقة الخطة الدراسية (39 حصة)',
          icon: BookOpen,
          permission: 'schedule.view',
          badge: 'خطة',
        },
        {
          id: 'timetable_load',
          label: 'أنصبة وتوزيع المعلمين',
          icon: UserCheck,
          permission: 'schedule.view',
        },
        {
          id: 'timetable_reserve',
          label: 'حصص الاحتياطي والبدلاء',
          icon: Clock,
          permission: 'schedule.view',
          badge: 'بدلاء',
        },
        {
          id: 'timetable_supervision',
          label: 'جدول الإشراف اليومي',
          icon: Shield,
          permission: 'schedule.view',
        },
        {
          id: 'timetable_supervision_locations',
          label: 'أماكن ومواقع الإشراف',
          icon: Building,
          adminOnly: true,
          permission: 'timetable.manage',
        },
        {
          id: 'timetable_exams',
          label: 'جدول الامتحانات والاختبارات',
          icon: Award,
          permission: 'schedule.view',
        },
        {
          id: 'timetable_reports',
          label: 'تقارير الجدول والأنصبة',
          icon: FileText,
          permission: 'schedule.view',
        },
        {
          id: 'timetable_settings',
          label: 'إعدادات وفترات الجدول',
          icon: SettingsIcon,
          adminOnly: true,
          permission: 'timetable.manage',
        },
        {
          id: 'teacher_portal',
          label: 'بوابة المعلم والواجبات',
          icon: GraduationCap,
          badge: 'معلم',
        },
        {
          id: 'student_schedule_access',
          label: 'وصول الطلاب للجدول (QR)',
          icon: Eye,
          badge: 'طلاب',
        },
      ],
    },
    {
      id: 'sec_quality',
      title: 'إدارة الجودة ومعايير إتقان',
      items: [
        {
          id: 'quality',
          label: 'إدارة الجودة الشاملة',
          icon: Award,
          permission: 'quality.view',
          badge: 'إتقان',
        },
      ],
    },
    {
      id: 'sec_system',
      title: 'التقارير والنظام والرقابة',
      items: [
        {
          id: 'reports',
          label: 'مركز التقارير والإحصائيات',
          icon: FileText,
          permission: 'reports.view',
        },
        {
          id: 'import_center',
          label: 'مركز الاستيراد والتحديث الذكي',
          icon: UploadCloud,
          adminOnly: true,
          badge: 'استيراد',
        },
        {
          id: 'system_health',
          label: 'صحة النظام وفحص الأداء',
          icon: Activity,
          adminOnly: true,
          permission: 'audit.view',
        },
        {
          id: 'master_data',
          label: 'إدارة القوائم والتعريفات الوزارية',
          icon: Database,
          adminOnly: true,
          permission: 'schools.manage',
        },
        {
          id: 'backup',
          label: 'النسخ الاحتياطي والأرشفة',
          icon: ShieldCheck,
          adminOnly: true,
          permission: 'settings.manage',
        },
        {
          id: 'operations',
          label: 'مركز التشغيل والجاهزية الفنية',
          icon: Server,
          adminOnly: true,
          permission: 'settings.manage',
        },
        {
          id: 'users',
          label: 'إدارة المستخدمين والصلاحيات',
          icon: ShieldCheck,
          adminOnly: true,
          permission: 'users.manage',
        },
        {
          id: 'audit',
          label: 'سجل العمليات والرقابة الأمنية',
          icon: History,
          permission: 'audit.view',
        },
        {
          id: 'settings',
          label: 'إعدادات النظام والمدرسة',
          icon: SettingsIcon,
          adminOnly: true,
          permission: 'settings.manage',
        },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={handleCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 right-0 bottom-0 z-50 w-72 bg-white border-l border-slate-200/80 flex flex-col transition-transform duration-300 ease-in-out select-none lg:static lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full lg:shadow-none'
        }`}
        dir="rtl"
      >
        {/* =========================================================================
            BRAND HEADER:
            1. Logo/Icon centered at the top
            2. NTSS word directly below
           ========================================================================= */}
        <div className="relative pt-6 pb-5 px-4 border-b border-slate-100 flex flex-col items-center justify-center shrink-0 bg-white">
          {/* Close button for Mobile Drawer (positioned on top-left of RTL sidebar) */}
          <button
            type="button"
            onClick={handleCloseMobile}
            className="lg:hidden absolute top-3.5 left-3.5 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="إغلاق القائمة"
            aria-label="إغلاق القائمة"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Centered Brand Hierarchy */}
          <div className="flex flex-col items-center text-center">
            {/* 1. Logo / Icon at the top in center */}
            <div className="mb-2 flex items-center justify-center transition-transform hover:scale-105 duration-200">
              <NTSSLogo variant="icon" size="lg" />
            </div>

            {/* 2. NTSS word directly below */}
            <div className="text-2xl font-black tracking-wider font-mono text-[#008e8b] leading-tight m-0">
              NTSS
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <div
          ref={navContainerRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-3.5 space-y-5"
        >
          {navSections.map(section => {
            const visibleItems = section.items.filter(item => {
              // 1. Strict canonical route guard (enforces role boundaries, school context, decommissioned tabs, permissions)
              if (!canAccessTab(currentUser, item.id)) return false;

              // 2. Canonical Admin gate: supports SystemAdmin, SchoolAdmin, and Legacy Admin (replaces legacy userRole === 'Admin')
              if (item.adminOnly && !isAdminUser) return false;

              // 3. Permission check if item has explicit permission requirement
              if (item.permission && !hasPermission(currentUser, item.permission)) return false;

              return true;
            });

            if (visibleItems.length === 0) return null;

            // Check if active tab belongs to this section
            const hasActiveChild = visibleItems.some(i => i.id === currentTab);
            const isCollapsed = collapsedSections[section.id] && !hasActiveChild;

            return (
              <div key={section.id} className="space-y-1">
                {/* Section Header */}
                <div
                  onClick={() => toggleSection(section.id)}
                  className="px-3 py-1 flex items-center justify-between text-[11px] font-extrabold tracking-wide text-slate-400 hover:text-slate-600 cursor-pointer rounded-lg transition-colors group"
                  title="طي / فتح القسم"
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${
                      isCollapsed ? 'rotate-90' : ''
                    }`}
                  />
                </div>

                {/* Section Items */}
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {visibleItems.map(item => {
                      const Icon = item.icon;
                      const isActive =
                        currentTab === item.id ||
                        (item.id === 'timetable_weekly' && currentTab === 'timetable');

                      return (
                        <button
                          type="button"
                          key={item.id}
                          id={`sidebar-item-${item.id}`}
                          onClick={() => handleSelect(item.id)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`w-full group flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-bold text-xs transition-colors cursor-pointer select-none text-right outline-none focus-visible:ring-2 focus-visible:ring-[#008e8b] ${
                            isActive
                              ? 'bg-[#008e8b] text-white shadow-xs font-extrabold'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon
                              className={`w-4 h-4 shrink-0 transition-colors ${
                                isActive
                                  ? 'text-white'
                                  : 'text-slate-400 group-hover:text-[#008e8b]'
                              }`}
                            />
                            <span className="truncate leading-tight">{item.label}</span>
                          </div>

                          {item.badge && (
                            <span
                              className={`shrink-0 text-[9px] px-2 py-0.5 rounded-full font-bold transition-colors ${
                                isActive
                                  ? 'bg-white/20 text-white'
                                  : 'bg-teal-50 text-[#008e8b] border border-teal-100/80 group-hover:bg-teal-100'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/70 shrink-0">
          <div className="text-[10.5px] text-slate-400 text-center font-semibold">
            نظام إدارة المدارس والموارد البشرية © 2026
          </div>
        </div>
      </aside>
    </>
  );
};
