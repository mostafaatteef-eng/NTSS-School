import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Loader2,
  Moon,
  Search,
  UserCheck,
  UserX,
  Users,
  X,
  AlertCircle,
  Briefcase,
  FileSpreadsheet,
} from 'lucide-react';
import {
  Employee,
  AttendanceRecord,
  AttendanceStatus,
  LeaveRecord,
  SystemSettings,
  User,
} from '../../types';
import {
  formatDateKey,
  getArabicDayName,
  getArabicFullDate,
  isWeekend,
} from '../../utils/attendanceUtils';
import { storageService } from '../../services/storageService';
import { ExportService } from '../../services/exportService';

interface DailyAttendanceViewProps {
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRecord[];
  settings: SystemSettings;
  currentUser: User | null;
  onNavigateToTab?: (tab: any) => void;
}

export const DailyAttendanceView: React.FC<DailyAttendanceViewProps> = ({
  employees,
  attendance,
  settings,
  currentUser,
}) => {
  const todayKey = formatDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('الكل');
  // Required Filter: النوع: الجميع / معلمين / إداريين
  const [staffTypeFilter, setStaffTypeFilter] = useState<'الجميع' | 'معلمين' | 'إداريين'>('الجميع');

  // In-memory Draft statuses. LocalStorage is NOT updated until Backend succeeds!
  const [draftStatuses, setDraftStatuses] = useState<Record<string, { status: AttendanceStatus; notes?: string }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isToday = selectedDate === todayKey;
  const isSelectedDateWeekend = isWeekend(selectedDate, settings.weekendDays);

  // Active employees
  const activeEmployees = useMemo(() => {
    return employees.filter(e => e.status === 'Active' || !e.status);
  }, [employees]);

  // Attendance records for the selected date mapped by employeeId
  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendance.filter(a => a.date === selectedDate).forEach(a => {
      map.set(a.employeeId, a);
    });
    return map;
  }, [attendance, selectedDate]);

  // Departments List
  const departments = useMemo(() => {
    return ['الكل', ...Array.from(new Set(activeEmployees.map(e => e.department).filter(Boolean)))];
  }, [activeEmployees]);

  // Helper to distinguish teachers vs administrators
  const isTeacher = (emp: Employee): boolean => {
    return !!(
      emp.isTeacher ||
      emp.isTeachingStaff ||
      (emp.jobTitle && (emp.jobTitle.includes('معلم') || emp.jobTitle.includes('أستاذ') || emp.jobTitle.includes('مدرس'))) ||
      emp.department === 'التعليم' ||
      emp.department === 'تدريس' ||
      emp.department === 'معلمين' ||
      emp.department?.includes('لغة') ||
      emp.department?.includes('رياضيات') ||
      emp.department?.includes('علوم')
    );
  };

  // Filtered employees according to Dept, Type, and Search
  const filteredEmployees = useMemo(() => {
    return activeEmployees.filter(emp => {
      // 1. Department filter
      if (deptFilter !== 'الكل' && emp.department !== deptFilter) return false;

      // 2. Staff Type filter: الجميع / معلمين / إداريين
      if (staffTypeFilter === 'معلمين' && !isTeacher(emp)) return false;
      if (staffTypeFilter === 'إداريين' && isTeacher(emp)) return false;

      // 3. Search query
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = (emp.name || '').toLowerCase().includes(q);
        const matchesId = (emp.id || '').toLowerCase().includes(q);
        const matchesDept = (emp.department || '').toLowerCase().includes(q);
        const matchesTitle = (emp.jobTitle || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesDept && !matchesTitle) return false;
      }

      return true;
    });
  }, [activeEmployees, deptFilter, staffTypeFilter, searchQuery]);

  // Get status for an employee: Default is ALWAYS 'حاضر'
  const getEmployeeStatus = (empId: string): { status: AttendanceStatus; notes?: string } => {
    if (draftStatuses[empId]) {
      return draftStatuses[empId];
    }
    const saved = attendanceMap.get(empId);
    if (saved && saved.status) {
      return {
        status: saved.status,
        notes: saved.notes || '',
      };
    }
    // "الكل حاضر افتراضياً"
    return {
      status: 'حاضر',
      notes: '',
    };
  };

  const handleUpdateStatus = (empId: string, status: AttendanceStatus) => {
    const current = getEmployeeStatus(empId);
    setDraftStatuses(prev => ({
      ...prev,
      [empId]: {
        ...current,
        status,
      },
    }));
  };

  const handleUpdateNotes = (empId: string, notes: string) => {
    const current = getEmployeeStatus(empId);
    setDraftStatuses(prev => ({
      ...prev,
      [empId]: {
        ...current,
        notes,
      },
    }));
  };

  // Mark all visible employees as 'حاضر'
  const handleMarkAllPresent = () => {
    const newDraft: Record<string, { status: AttendanceStatus; notes?: string }> = { ...draftStatuses };
    filteredEmployees.forEach(emp => {
      newDraft[emp.id] = {
        status: 'حاضر',
        notes: '',
      };
    });
    setDraftStatuses(newDraft);
  };

  // Date Navigation Handlers
  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(formatDateKey(d));
    setDraftStatuses({});
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(formatDateKey(d));
    setDraftStatuses({});
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSetToday = () => {
    setSelectedDate(todayKey);
    setDraftStatuses({});
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Batch Save to Backend - CRITICAL: "لا يتم تحديث localStorage إلا بعد نجاح Backend"
  const handleBatchSaveToBackend = async () => {
    if (filteredEmployees.length === 0) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const recordsToSave: AttendanceRecord[] = filteredEmployees.map(emp => {
      const draft = getEmployeeStatus(emp.id);
      const existingRec = attendanceMap.get(emp.id);

      const isPresent = draft.status === 'حاضر';
      const isLate = draft.status === 'متأخر';

      return {
        id: existingRec?.id || `EMPATT_${selectedDate.replace(/-/g, '')}_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        date: selectedDate,
        dayName: getArabicDayName(selectedDate),
        checkIn: isPresent
          ? existingRec?.checkIn || emp.workStartTime || '08:00'
          : isLate
          ? '08:20'
          : '',
        checkOut: isPresent ? existingRec?.checkOut || emp.workEndTime || '14:30' : '',
        workingHours: isPresent ? 6.5 : 0,
        lateMinutes: isLate ? (existingRec?.lateMinutes || 20) : 0,
        earlyLeaveMinutes: 0,
        overtimeHours: 0,
        status: draft.status,
        notes: draft.notes || existingRec?.notes || '',
      };
    });

    try {
      const res = await storageService.saveDailyStaffAttendanceBatchToBackend({
        date: selectedDate,
        records: recordsToSave,
      });

      if (res.success) {
        setSuccessMessage(res.message || `تم حفظ دوام العاملين بنجاح (${recordsToSave.length} موظف) وتحديث البيانات المحلية`);
        setDraftStatuses({});
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setErrorMessage(res.message || 'فشل حفظ حضور العاملين في الخادم. لم يتم تعديل البيانات المحلية.');
      }
    } catch (err: any) {
      setErrorMessage(`خطأ اتصال بالخادم: ${err?.message || 'فشلت العملية'}. لم يتم تعديل البيانات المحلية.`);
    } finally {
      setIsSaving(false);
    }
  };

  // KPI Metrics
  const metrics = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let permission = 0;

    filteredEmployees.forEach(emp => {
      const st = getEmployeeStatus(emp.id).status;
      if (st === 'حاضر') present++;
      else if (st === 'غائب') absent++;
      else if (st === 'متأخر') late++;
      else if (st === 'إجازة') leave++;
      else if (st === 'مأذونية' || st === 'إذن عمل') permission++;
      else present++;
    });

    return { total: filteredEmployees.length, present, absent, late, leave, permission };
  }, [filteredEmployees, draftStatuses, attendanceMap, selectedDate]);

  // Export Daily Attendance to Excel
  const handleExportDaily = () => {
    const exportData = filteredEmployees.map((emp, idx) => {
      const st = getEmployeeStatus(emp.id);
      return {
        'م': idx + 1,
        'الرقم الوظيفي': emp.id,
        'اسم الموظف': emp.name,
        'القسم': emp.department,
        'المسمى الوظيفي': emp.jobTitle,
        'نوع الكادر': isTeacher(emp) ? 'معلم' : 'إداري',
        'التاريخ': selectedDate,
        'اليوم': getArabicDayName(selectedDate),
        'حالة الدوام': st.status,
        'ملاحظات': st.notes || '—',
      };
    });

    ExportService.exportToExcel(exportData, `سجل_دوام_العاملين_${selectedDate}`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header & Live Date Navigation Bar */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#008e8b]/10 text-[#008e8b] flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                تسجيل حضور المعلمين والموظفين اليومي
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                رصد الدوام اليومي للمعلمين والإداريين وحفظ الدفعة إلى الخادم مباشرة
              </p>
            </div>
          </div>
        </div>

        {/* Date Navigator & Action Controls */}
        <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto justify-between lg:justify-end">
          {/* Date Navigator Controls */}
          <div className="flex items-center bg-slate-50 p-1 rounded-2xl border border-slate-200">
            <button
              id="staff-attendance-prev-day-btn"
              onClick={handlePrevDay}
              title="اليوم السابق"
              className="p-2 hover:bg-white text-slate-600 hover:text-[#008e8b] rounded-xl transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              id="staff-attendance-today-btn"
              onClick={handleSetToday}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                isToday ? 'bg-[#008e8b] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              اليوم
            </button>

            <button
              id="staff-attendance-next-day-btn"
              onClick={handleNextDay}
              title="اليوم التالي"
              className="p-2 hover:bg-white text-slate-600 hover:text-[#008e8b] rounded-xl transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Native Date Picker */}
          <div className="relative flex items-center">
            <input
              id="staff-attendance-date-picker"
              type="date"
              value={selectedDate}
              onChange={e => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                  setDraftStatuses({});
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }
              }}
              className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-2xl focus:outline-hidden focus:border-[#008e8b]"
            />
          </div>

          {/* Export Button */}
          <button
            id="staff-export-excel-btn"
            onClick={handleExportDaily}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-2xl text-xs font-bold transition shadow-xs"
            title="تصدير كشف الحضور اليومي إلى Excel"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Excel</span>
          </button>

          {/* Single Batch Save to Backend Button */}
          <button
            id="save-staff-attendance-batch-button"
            onClick={handleBatchSaveToBackend}
            disabled={isSaving || filteredEmployees.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#008e8b] hover:bg-teal-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold transition shadow-md cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري الحفظ في الخادم...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>حفظ دوام العاملين (Batch Save)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200 shadow-xs">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Weekend Banner Notice */}
      {isSelectedDateWeekend && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <Moon className="w-4 h-4 text-amber-600 shrink-0" />
            <span>هذا اليوم ({getArabicDayName(selectedDate)}) عطلة راحة أسبوعية.</span>
          </div>
        </div>
      )}

      {/* 2. Filters & Controls: التاريخ، القسم، النوع (الجميع / معلمين / إداريين) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          {/* القسم */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#008e8b]" />
              <span>القسم</span>
            </label>
            <select
              id="staff-dept-filter-select"
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-hidden focus:border-[#008e8b] cursor-pointer"
            >
              {departments.map(d => (
                <option key={d} value={d}>
                  {d === 'الكل' ? '🏢 كل الأقسام' : d}
                </option>
              ))}
            </select>
          </div>

          {/* النوع: الجميع / معلمين / إداريين */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#008e8b]" />
              <span>النوع</span>
            </label>
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
              {(['الجميع', 'معلمين', 'إداريين'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setStaffTypeFilter(type)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition text-center ${
                    staffTypeFilter === type
                      ? 'bg-white text-[#008e8b] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Search bar */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-[#008e8b]" />
              <span>بحث سريع</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم أو الرقم أو التخصص..."
                className="w-full text-xs pr-3 pl-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#008e8b]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Bulk Action Button: تحديد الكل حاضر */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              id="mark-all-staff-present-btn"
              type="button"
              onClick={handleMarkAllPresent}
              className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold rounded-xl text-xs transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <CheckCheck className="w-4 h-4 text-emerald-700" />
              <span>تحديد الكل حاضر</span>
            </button>
            <span className="text-xs text-slate-500 font-medium">
              (الكل حاضر افتراضياً - لا يتم تحديث التخزين المحلي إلا بعد نجاح الخادم)
            </span>
          </div>

          <div className="text-xs text-slate-600 font-bold">
            عدد العاملين المعروضين: <span className="font-mono text-slate-800">{filteredEmployees.length}</span> موظف
          </div>
        </div>
      </div>

      {/* 3. KPI Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs text-center">
          <div className="text-xl font-bold text-slate-800 font-mono">{metrics.total}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-0.5">إجمالي القائمة</div>
        </div>
        <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 shadow-xs text-center">
          <div className="text-xl font-bold text-emerald-700 font-mono">{metrics.present}</div>
          <div className="text-[11px] text-emerald-800 font-semibold mt-0.5">حاضر</div>
        </div>
        <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200 shadow-xs text-center">
          <div className="text-xl font-bold text-rose-700 font-mono">{metrics.absent}</div>
          <div className="text-[11px] text-rose-800 font-semibold mt-0.5">غائب</div>
        </div>
        <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 shadow-xs text-center">
          <div className="text-xl font-bold text-amber-700 font-mono">{metrics.late}</div>
          <div className="text-[11px] text-amber-800 font-semibold mt-0.5">متأخر</div>
        </div>
        <div className="bg-purple-50 p-3.5 rounded-2xl border border-purple-200 shadow-xs text-center">
          <div className="text-xl font-bold text-purple-700 font-mono">{metrics.leave}</div>
          <div className="text-[11px] text-purple-800 font-semibold mt-0.5">إجازة</div>
        </div>
        <div className="bg-sky-50 p-3.5 rounded-2xl border border-sky-200 shadow-xs text-center">
          <div className="text-xl font-bold text-sky-700 font-mono">{metrics.permission}</div>
          <div className="text-[11px] text-sky-800 font-semibold mt-0.5">مأذونية</div>
        </div>
      </div>

      {/* 4. Employee Rows with the 5 Status Buttons: حاضر / غائب / متأخر / إجازة / مأذونية */}
      <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5 w-12 text-center">#</th>
                <th className="p-3.5">الموظف</th>
                <th className="p-3.5">القسم / المسمى</th>
                <th className="p-3.5 text-center">الحالة (5 خيارات)</th>
                <th className="p-3.5">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">لا يوجد موظفون يطابقون خيارات الفلترة الحالية</p>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, idx) => {
                  const empStatus = getEmployeeStatus(emp.id);
                  const st = empStatus.status;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 text-slate-400 font-mono text-center">{idx + 1}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <span>{emp.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                            isTeacher(emp) ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {isTeacher(emp) ? 'معلم' : 'إداري'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">{emp.id}</div>
                      </td>

                      <td className="p-3.5">
                        <span className="text-slate-700 font-medium">{emp.department}</span>
                        <span className="block font-medium text-slate-500 text-[11px]">{emp.jobTitle}</span>
                      </td>

                      {/* 5 Status Buttons: حاضر / غائب / متأخر / إجازة / مأذونية */}
                      <td className="p-3.5 text-center">
                        <div className="inline-flex bg-slate-100 p-1 rounded-2xl border border-slate-200 gap-1 flex-wrap justify-center">
                          {/* 1. حاضر */}
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(emp.id, 'حاضر')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                              st === 'حاضر'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/50'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>حاضر</span>
                          </button>

                          {/* 2. غائب */}
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(emp.id, 'غائب')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                              st === 'غائب'
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50/50'
                            }`}
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>غائب</span>
                          </button>

                          {/* 3. متأخر */}
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(emp.id, 'متأخر')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                              st === 'متأخر'
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'text-slate-600 hover:text-amber-700 hover:bg-amber-50/50'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>متأخر</span>
                          </button>

                          {/* 4. إجازة */}
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(emp.id, 'إجازة')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                              st === 'إجازة'
                                ? 'bg-purple-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-purple-700 hover:bg-purple-50/50'
                            }`}
                          >
                            <Moon className="w-3.5 h-3.5" />
                            <span>إجازة</span>
                          </button>

                          {/* 5. مأذونية */}
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(emp.id, 'مأذونية')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                              st === 'مأذونية' || st === 'إذن عمل'
                                ? 'bg-sky-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-sky-700 hover:bg-sky-50/50'
                            }`}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>مأذونية</span>
                          </button>
                        </div>
                      </td>

                      {/* Notes input */}
                      <td className="p-3.5">
                        <input
                          type="text"
                          placeholder="ملاحظات (اختياري)..."
                          value={empStatus.notes || ''}
                          onChange={e => handleUpdateNotes(emp.id, e.target.value)}
                          className="w-full max-w-xs text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#008e8b]"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
