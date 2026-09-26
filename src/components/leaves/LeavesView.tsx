import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  Filter,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
  XCircle,
} from 'lucide-react';
import { Employee, EmployeePermissionRecord, LeaveRecord, LeaveStatus, LeaveType, SystemSettings, User } from '../../types';
import { storageService } from '../../services/storageService';
import { ExportService } from '../../services/exportService';
import { MasterDataService } from '../../services/masterDataService';
import { hasPermission } from '../../utils/permissions';

interface LeavesViewProps {
  employees: Employee[];
  leaves: LeaveRecord[];
  settings: SystemSettings;
  currentUser: User | null;
}

export const LeavesView: React.FC<LeavesViewProps> = ({
  employees,
  currentUser,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'leaves' | 'permissions'>('leaves');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('الكل');
  const [typeFilter, setTypeFilter] = useState<string>('الكل');

  // Leave Form State
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveEmpId, setLeaveEmpId] = useState(employees[0]?.id || '');
  const [leaveType, setLeaveType] = useState<LeaveType>('سنوية');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveErrorMessage, setLeaveErrorMessage] = useState('');

  // Authoritative management data
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [permissions, setPermissions] = useState<EmployeePermissionRecord[]>([]);
  const [managementLoading, setManagementLoading] = useState(true);
  const [managementError, setManagementError] = useState('');
  const [managementAction, setManagementAction] = useState<string | null>(null);

  // Permission Form State
  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [permEmpId, setPermEmpId] = useState(employees[0]?.id || '');
  const [permDate, setPermDate] = useState(new Date().toISOString().split('T')[0]);
  const [permType, setPermType] = useState('إذن خروج مؤقت');
  const [permStartTime, setPermStartTime] = useState('10:00');
  const [permEndTime, setPermEndTime] = useState('12:00');
  const [permDurationHours, setPermDurationHours] = useState(2);
  const [permReason, setPermReason] = useState('');
  const [permErrorMessage, setPermErrorMessage] = useState('');

  const canCreate = hasPermission(currentUser, 'leaves.create');
  const canApprove = hasPermission(currentUser, 'leaves.manage.approve');
  const canReject = hasPermission(currentUser, 'leaves.manage.reject');
  const canDelete = hasPermission(currentUser, 'leaves.delete');
  const canManageActions = canApprove || canReject || canDelete;

  // Dynamic Leave Types from Master Data & Settings
  const dynamicLeaveTypes = useMemo(() => {
    const mdItems = MasterDataService.getMasterData('HR', 'LEAVE_TYPES');
    if (mdItems.length > 0) {
      return mdItems.map(m => m.nameAr);
    }
    return ['سنوية', 'مرضية', 'عارضة', 'بدون راتب', 'أخرى'];
  }, []);

  const permissionTypes = ['إذن خروج مؤقت', 'إذن تأخير صباحي', 'مهمة عمل رسمية', 'إذن انصراف مبكر'];

  const loadManagementData = async () => {
    setManagementLoading(true);
    setManagementError('');
    const result = await storageService.getLeaveManagementDataAuthoritative();
    setManagementLoading(false);

    if (!result.success) {
      setLeaves([]);
      setPermissions([]);
      setManagementError(result.message || 'تعذر تحميل بيانات الإجازات والأذونات من الخادم.');
      return false;
    }

    setLeaves(result.leaves || []);
    setPermissions(result.permissions || []);
    return true;
  };

  useEffect(() => {
    void loadManagementData();
  }, [currentUser?.sessionToken, currentUser?.activeSchoolId, currentUser?.schoolId]);

  const calculateDaysCount = (start: string, end: string) => {
    if (!start || !end) return 1;
    const s = new Date(start);
    const e = new Date(end);
    const diffTime = e.getTime() - s.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 1;
  };

  const daysCount = calculateDaysCount(startDate, endDate);

  const filteredLeaves = useMemo(() => {
    return leaves.filter(l => {
      const matchStatus = statusFilter === 'الكل' || l.status === statusFilter;
      const matchType = typeFilter === 'الكل' || l.leaveType === typeFilter;
      const q = (searchQuery || '').trim().toLowerCase();
      const matchSearch =
        !q ||
        (l.employeeName || '').toLowerCase().includes(q) ||
        (l.employeeId || '').toLowerCase().includes(q) ||
        (l.department || '').toLowerCase().includes(q) ||
        (l.leaveType || '').toLowerCase().includes(q) ||
        (l.reason || '').toLowerCase().includes(q);
      return matchStatus && matchType && matchSearch;
    });
  }, [leaves, statusFilter, typeFilter, searchQuery]);

  const filteredPermissions = useMemo(() => {
    return permissions.filter(p => {
      const matchStatus = statusFilter === 'الكل' || p.status === statusFilter;
      const matchType = typeFilter === 'الكل' || p.permissionType === typeFilter;
      const q = (searchQuery || '').trim().toLowerCase();
      const matchSearch =
        !q ||
        (p.employeeName || '').toLowerCase().includes(q) ||
        (p.employeeId || '').toLowerCase().includes(q) ||
        (p.department || '').toLowerCase().includes(q) ||
        (p.permissionType || '').toLowerCase().includes(q) ||
        (p.reason || '').toLowerCase().includes(q);
      return matchStatus && matchType && matchSearch;
    });
  }, [permissions, statusFilter, typeFilter, searchQuery]);

  const handleOpenLeaveModal = () => {
    const defaultEmp = canApprove
      ? employees[0]?.id || ''
      : currentUser?.employeeId || currentUser?.id || employees[0]?.id || '';
    setLeaveEmpId(defaultEmp);
    setLeaveType('سنوية');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
    setLeaveReason('');
    setLeaveErrorMessage('');
    setIsLeaveModalOpen(true);
  };

  const handleOpenPermModal = () => {
    const defaultEmp = canApprove
      ? employees[0]?.id || ''
      : currentUser?.employeeId || currentUser?.id || employees[0]?.id || '';
    setPermEmpId(defaultEmp);
    setPermDate(new Date().toISOString().split('T')[0]);
    setPermType('إذن خروج مؤقت');
    setPermStartTime('10:00');
    setPermEndTime('12:00');
    setPermDurationHours(2);
    setPermReason('');
    setPermErrorMessage('');
    setIsPermModalOpen(true);
  };

  const handleSaveLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveErrorMessage('');

    if (!leaveEmpId) {
      setLeaveErrorMessage('الموظف غير محدد');
      return;
    }
    if (endDate < startDate) {
      setLeaveErrorMessage('تاريخ نهاية الإجازة لا يمكن أن يكون قبل تاريخ البداية');
      return;
    }

    setManagementAction('create-leave');
    const result = await storageService.createManagedLeaveAuthoritative({
      employeeId: leaveEmpId,
      leaveType,
      startDate,
      endDate,
      reason: leaveReason,
    });
    setManagementAction(null);

    if (!result.success) {
      setLeaveErrorMessage(result.message || 'حدث خطأ أثناء حفظ الإجازة');
      return;
    }

    setIsLeaveModalOpen(false);
    await loadManagementData();
  };

  const handleSavePermission = async (e: React.FormEvent) => {
    e.preventDefault();
    setPermErrorMessage('');

    if (!permEmpId) {
      setPermErrorMessage('الموظف غير محدد');
      return;
    }

    setManagementAction('create-permission');
    const result = await storageService.createManagedPermissionAuthoritative({
      employeeId: permEmpId,
      date: permDate,
      permissionType: permType,
      startTime: permStartTime,
      endTime: permEndTime,
      reason: permReason,
    });
    setManagementAction(null);

    if (!result.success) {
      setPermErrorMessage(result.message || 'حدث خطأ أثناء حفظ الإذن');
      return;
    }

    setIsPermModalOpen(false);
    await loadManagementData();
  };

  const handleApprovePerm = async (permId: string) => {
    setManagementAction(`approve-perm:${permId}`);
    const result = await storageService.setManagedPermissionStatusAuthoritative(permId, 'مقبولة');
    setManagementAction(null);
    if (!result.success) {
      setManagementError(result.message || 'تعذر اعتماد الإذن.');
      return;
    }
    await loadManagementData();
  };

  const handleRejectPerm = async (permId: string) => {
    const reason = window.prompt('يرجى كتابة سبب رفض الإذن:');
    if (reason === null) return;

    setManagementAction(`reject-perm:${permId}`);
    const result = await storageService.setManagedPermissionStatusAuthoritative(
      permId,
      'مرفوضة',
      reason || 'لم يتم استيفاء شروط الإذن'
    );
    setManagementAction(null);
    if (!result.success) {
      setManagementError(result.message || 'تعذر رفض الإذن.');
      return;
    }
    await loadManagementData();
  };

  const handleDeletePerm = async (permId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف سجل الإذن؟')) return;

    setManagementAction(`delete-perm:${permId}`);
    const result = await storageService.deleteManagedPermissionAuthoritative(permId);
    setManagementAction(null);
    if (!result.success) {
      setManagementError(result.message || 'تعذر حذف الإذن.');
      return;
    }
    await loadManagementData();
  };

  const handleUpdateLeaveStatus = async (leave: LeaveRecord, newStatus: LeaveStatus) => {
    const status = newStatus === 'مقبولة' ? 'مقبولة' : 'مرفوضة';
    let reason = '';
    if (status === 'مرفوضة') {
      const enteredReason = window.prompt('يرجى كتابة سبب رفض الإجازة:');
      if (enteredReason === null) return;
      reason = enteredReason || 'لم يتم استيفاء شروط الإجازة';
    }

    setManagementAction(`${status === 'مقبولة' ? 'approve' : 'reject'}-leave:${leave.id}`);
    const result = await storageService.setManagedLeaveStatusAuthoritative(leave.id, status, reason);
    setManagementAction(null);
    if (!result.success) {
      setManagementError(result.message || 'تعذر تحديث حالة الإجازة.');
      return;
    }
    await loadManagementData();
  };

  const handleDeleteLeave = async (leaveId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟')) return;

    setManagementAction(`delete-leave:${leaveId}`);
    const result = await storageService.deleteManagedLeaveAuthoritative(leaveId);
    setManagementAction(null);
    if (!result.success) {
      setManagementError(result.message || 'تعذر حذف الإجازة.');
      return;
    }
    await loadManagementData();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'مقبولة':
        return (
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
            مقبولة ومعتمدة
          </span>
        );
      case 'معلقة':
        return (
          <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
            معلقة للمراجعة
          </span>
        );
      case 'مرفوضة':
        return (
          <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
            مرفوضة
          </span>
        );
      default:
        return null;
    }
  };

  // KPIs
  const pendingLeaves = leaves.filter(l => l.status === 'معلقة').length;
  const approvedLeaves = leaves.filter(l => l.status === 'مقبولة').length;
  const pendingPerms = permissions.filter(p => p.status === 'معلقة').length;
  const approvedPerms = permissions.filter(p => p.status === 'مقبولة').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#008e8b]/10 text-[#008e8b] flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <span>إدارة الإجازات والأذونات (Leaves & Permissions Workflow)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            متابعة واعتماد طلبات الإجازات الرسمية والأذونات وتصاريح العمل وربطها التلقائي بالحضور والرواتب
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (activeSubTab === 'leaves' ? (
            <button
              onClick={handleOpenLeaveModal}
              className="text-xs font-bold bg-[#008e8b] hover:bg-teal-700 text-white px-4 py-2.5 rounded-2xl shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>تقديم طلب إجازة</span>
            </button>
          ) : (
            <button
              onClick={handleOpenPermModal}
              className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-2xl shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>تقديم طلب إذن / تصريح</span>
            </button>
          ))}

          <button
            onClick={() => ExportService.exportLeavesToExcel(leaves)}
            className="text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-2xl transition-colors flex items-center gap-1.5 border border-slate-200 shadow-xs"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>تصدير السجلات</span>
          </button>
        </div>
      </div>

      {managementError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {managementError}
          </span>
          <button type="button" onClick={() => void loadManagementData()} className="underline">
            إعادة المحاولة
          </button>
        </div>
      )}

      {managementLoading && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">
          جارٍ تحميل بيانات الإجازات والأذونات من الخادم المعتمد...
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-400 block mb-1">إجازات معتمدة</span>
          <div className="text-xl font-bold font-mono text-emerald-600">{approvedLeaves}</div>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-400 block mb-1">إجازات قيد المراجعة</span>
          <div className="text-xl font-bold font-mono text-amber-600">{pendingLeaves}</div>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-400 block mb-1">أذونات وتصاريح معتمدة</span>
          <div className="text-xl font-bold font-mono text-indigo-600">{approvedPerms}</div>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-400 block mb-1">أذونات قيد المراجعة</span>
          <div className="text-xl font-bold font-mono text-amber-600">{pendingPerms}</div>
        </div>
      </div>

      {/* Sub-Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveSubTab('leaves')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === 'leaves'
              ? 'bg-[#008e8b] text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>سجل الإجازات الرسمية ({leaves.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('permissions')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === 'permissions'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>سجل الأذونات والتصاريح ({permissions.length})</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-80 relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="بحث بالاسم، الكود، أو السبب..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-slate-900 focus:outline-hidden focus:border-[#008e8b]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-700">
          <div className="flex items-center gap-1.5">
            <span className="font-bold">حالة الطلب:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden"
            >
              <option value="الكل">الكل</option>
              <option value="معلقة">معلقة للمراجعة</option>
              <option value="مقبولة">مقبولة ومعتمدة</option>
              <option value="مرفوضة">مرفوضة</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content View Based on Sub-tab */}
      {activeSubTab === 'leaves' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">رقم السجل</th>
                  <th className="py-3.5 px-4">الموظف / المعلم</th>
                  <th className="py-3.5 px-4">نوع الإجازة</th>
                  <th className="py-3.5 px-4">الفترة</th>
                  <th className="py-3.5 px-4">عدد الأيام</th>
                  <th className="py-3.5 px-4">السبب / الملاحظات</th>
                  <th className="py-3.5 px-4">الحالة</th>
                  {canManageActions && <th className="py-3.5 px-4 text-center">إجراءات الاعتماد</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredLeaves.length === 0 ? (
                  <tr>
                    <td colSpan={canManageActions ? 8 : 7} className="py-12 text-center text-slate-400">
                      لا توجد سجلات إجازات تطابق البحث
                    </td>
                  </tr>
                ) : (
                  filteredLeaves.map(leave => (
                    <tr key={leave.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700">{leave.id}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{leave.employeeName}</div>
                        <div className="text-[10px] text-slate-400">{leave.department}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px]">
                          {leave.leaveType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                        {leave.startDate} ⬅ {leave.endDate}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">{leave.daysCount} يوم</td>
                      <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">{leave.reason || '-'}</td>
                      <td className="py-3.5 px-4">{getStatusBadge(leave.status)}</td>
                      {canManageActions && (
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {leave.status === 'معلقة' && canApprove && (
                              <button
                                disabled={managementAction !== null}
                                onClick={() => void handleUpdateLeaveStatus(leave, 'مقبولة')}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-40"
                                title="قبول واعتماد"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {leave.status === 'معلقة' && canReject && (
                              <button
                                disabled={managementAction !== null}
                                onClick={() => void handleUpdateLeaveStatus(leave, 'مرفوضة')}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                                title="رفض"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                disabled={managementAction !== null}
                                onClick={() => void handleDeleteLeave(leave.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">رقم الإذن</th>
                  <th className="py-3.5 px-4">الموظف / المعلم</th>
                  <th className="py-3.5 px-4">نوع الإذن</th>
                  <th className="py-3.5 px-4">تاريخ الإذن</th>
                  <th className="py-3.5 px-4">الفترة الزمنية</th>
                  <th className="py-3.5 px-4">المدة</th>
                  <th className="py-3.5 px-4">السبب</th>
                  <th className="py-3.5 px-4">الحالة</th>
                  {canManageActions && <th className="py-3.5 px-4 text-center">إجراءات الاعتماد</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredPermissions.length === 0 ? (
                  <tr>
                    <td colSpan={canManageActions ? 9 : 8} className="py-12 text-center text-slate-400">
                      لا توجد طلبات أذونات تطابق البحث
                    </td>
                  </tr>
                ) : (
                  filteredPermissions.map(perm => (
                    <tr key={perm.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700">{perm.id}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{perm.employeeName}</div>
                        <div className="text-[10px] text-slate-400">{perm.department}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-[11px]">
                          {perm.permissionType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">{perm.date}</td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                        {perm.startTime} - {perm.endTime}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">{perm.durationHours} ساعة</td>
                      <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">{perm.reason || '-'}</td>
                      <td className="py-3.5 px-4">{getStatusBadge(perm.status)}</td>
                      {canManageActions && (
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {perm.status === 'معلقة' && canApprove && (
                              <button
                                disabled={managementAction !== null}
                                onClick={() => void handleApprovePerm(perm.id)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-40"
                                title="قبول واعتماد"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {perm.status === 'معلقة' && canReject && (
                              <button
                                disabled={managementAction !== null}
                                onClick={() => void handleRejectPerm(perm.id)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                                title="رفض"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                disabled={managementAction !== null}
                                onClick={() => void handleDeletePerm(perm.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leave Modal */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-8">
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#008e8b]" />
                <span>تقديم طلب إجازة رسمي</span>
              </h3>
              <button onClick={() => setIsLeaveModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLeave} className="p-6 space-y-4">
              {leaveErrorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{leaveErrorMessage}</span>
                </div>
              )}

              <div className="space-y-4 text-xs">
                {canApprove ? (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">اختر الموظف / المعلم *</label>
                    <select
                      value={leaveEmpId}
                      onChange={e => setLeaveEmpId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium"
                    >
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.id} - {emp.department})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <label className="font-bold text-slate-500 block text-[11px] mb-1">مقدم الطلب (صاحب الحساب الحالي)</label>
                    <div className="font-bold text-slate-800 text-sm">
                      {currentUser?.fullName || employees.find(e => e.id === leaveEmpId)?.name || 'المعلم الحالي'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      الكود الوظيفي: {leaveEmpId || currentUser?.employeeId || currentUser?.id} • القسم: {employees.find(e => e.id === leaveEmpId)?.department || 'هيئة التدريس'}
                    </div>
                  </div>
                )}

                <div>
                  <label className="font-bold text-slate-700 block mb-1">نوع الإجازة *</label>
                  <select
                    value={leaveType}
                    onChange={e => setLeaveType(e.target.value as LeaveType)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium"
                  >
                    {dynamicLeaveTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">تاريخ البداية *</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">تاريخ النهاية *</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800"
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 flex items-center justify-between">
                  <span>إجمالي عدد الأيام المحتسبة:</span>
                  <span className="font-bold text-[#008e8b] font-mono text-sm">{daysCount} يوم</span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">سبب الإجازة / الملاحظات</label>
                  <textarea
                    value={leaveReason}
                    onChange={e => setLeaveReason(e.target.value)}
                    rows={3}
                    placeholder="اكتب سبب الإجازة إن وجد..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-800"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 -mx-6 -mb-6 mt-4">
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#008e8b] hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  حفظ الطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permission Modal */}
      {isPermModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-8">
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <span>تقديم طلب إذن / تصريح عمل</span>
              </h3>
              <button onClick={() => setIsPermModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePermission} className="p-6 space-y-4">
              {permErrorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{permErrorMessage}</span>
                </div>
              )}

              <div className="space-y-4 text-xs">
                {canApprove ? (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">اختر الموظف / المعلم *</label>
                    <select
                      value={permEmpId}
                      onChange={e => setPermEmpId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium"
                    >
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.id} - {emp.department})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <label className="font-bold text-slate-500 block text-[11px] mb-1">مقدم طلب التصريح / الإذن</label>
                    <div className="font-bold text-slate-800 text-sm">
                      {currentUser?.fullName || employees.find(e => e.id === permEmpId)?.name || 'المعلم الحالي'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      الكود الوظيفي: {permEmpId || currentUser?.employeeId || currentUser?.id} • القسم: {employees.find(e => e.id === permEmpId)?.department || 'هيئة التدريس'}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">نوع التصريح *</label>
                    <select
                      value={permType}
                      onChange={e => setPermType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-medium"
                    >
                      {permissionTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">تاريخ الإذن *</label>
                    <input
                      type="date"
                      required
                      value={permDate}
                      onChange={e => setPermDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">من الساعة *</label>
                    <input
                      type="time"
                      value={permStartTime}
                      onChange={e => setPermStartTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">إلى الساعة *</label>
                    <input
                      type="time"
                      value={permEndTime}
                      onChange={e => setPermEndTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">المدة (ساعات)</label>
                    <input
                      type="number"
                      value={permDurationHours}
                      onChange={e => setPermDurationHours(Number(e.target.value))}
                      min={0.5}
                      step={0.5}
                      max={8}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">سبب الإذن / المهمة الرسمية *</label>
                  <textarea
                    required
                    value={permReason}
                    onChange={e => setPermReason(e.target.value)}
                    rows={3}
                    placeholder="اكتب سبب طلب الإذن أو جهة المهمة الرسمية..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-800"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 -mx-6 -mb-6 mt-4">
                <button
                  type="button"
                  onClick={() => setIsPermModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  حفظ وتقديم الإذن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
