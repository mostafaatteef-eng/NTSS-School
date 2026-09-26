import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Paperclip,
  FileText,
  CalendarDays,
  PlusCircle,
  Eye,
  History,
  Info,
  ChevronLeft,
} from 'lucide-react';
import { User, Employee, LeaveRecord, LeaveType } from '../../types';
import { EmployeePermissionRecord } from '../../types_extended';
import { storageService } from '../../services/storageService';
import { HRPayrollService } from '../../services/hrService';
import { MasterDataService } from '../../services/masterDataService';
import { getCairoCurrentDate } from '../../utils/egyptianTime';

interface MyRequestsViewProps {
  currentUser: User | null;
  authMode?: 'staff' | 'teacher';
}

export const MyRequestsView: React.FC<MyRequestsViewProps> = ({ currentUser, authMode = 'staff' }) => {
  const [activeTab, setActiveTab] = useState<'leaves' | 'permissions'>('leaves');

  // Leaves state
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>('سنوية');
  const [leaveStartDate, setLeaveStartDate] = useState(getCairoCurrentDate());
  const [leaveEndDate, setLeaveEndDate] = useState(getCairoCurrentDate());
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveNotes, setLeaveNotes] = useState('');
  const [leaveAttachment, setLeaveAttachment] = useState('');
  const [leaveError, setLeaveError] = useState('');
  const [leaveSuccess, setLeaveSuccess] = useState('');

  // Permissions state
  const [permissions, setPermissions] = useState<EmployeePermissionRecord[]>([]);
  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [permDate, setPermDate] = useState(getCairoCurrentDate());
  const [permType, setPermType] = useState('إذن خروج مؤقت');
  const [permStartTime, setPermStartTime] = useState('10:00');
  const [permEndTime, setPermEndTime] = useState('12:00');
  const [permReason, setPermReason] = useState('');
  const [permNotes, setPermNotes] = useState('');
  const [permAttachment, setPermAttachment] = useState('');
  const [permError, setPermError] = useState('');
  const [permSuccess, setPermSuccess] = useState('');

  // View Details Modal
  const [viewingLeave, setViewingLeave] = useState<LeaveRecord | null>(null);
  const [viewingPerm, setViewingPerm] = useState<EmployeePermissionRecord | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<{
    employeeId: string;
    employeeName: string;
    department: string;
    teacherCode?: string;
  } | null>(null);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState<'leave' | 'permission' | null>(null);

  // Teacher mode is authorized exclusively by TeacherSession.
  // Staff mode retains the existing ERP self-service path until its own hardening phase.
  const ownEmpId = currentUser?.employeeId || currentUser?.id || '';
  const ownEmployee: Employee | undefined = useMemo(() => {
    if (authMode === 'teacher') return undefined;
    return storageService.getEmployees().find(e => e.id === ownEmpId || e.employeeNumber === ownEmpId);
  }, [authMode, ownEmpId]);

  const loadData = async () => {
    if (!currentUser) return;

    if (authMode === 'teacher') {
      setRequestsLoading(true);
      setRequestsError('');
      const result = await storageService.getTeacherSelfRequestsAuthoritative();
      setRequestsLoading(false);

      if (!result.success) {
        setLeaves([]);
        setPermissions([]);
        setTeacherProfile(null);
        setRequestsError(result.message || 'تعذر تحميل طلباتك من الخادم.');
        return;
      }

      setTeacherProfile(result.profile || null);
      setLeaves(result.leaves || []);
      setPermissions(result.permissions || []);
      return;
    }

    const targetEmpId = currentUser.employeeId || currentUser.id;
    const allLeaves = storageService.getLeaves();
    setLeaves(allLeaves.filter(l => l.employeeId === targetEmpId));
    setPermissions(HRPayrollService.getPermissions({ employeeId: targetEmpId }));
  };

  useEffect(() => {
    void loadData();
    if (authMode === 'teacher') return;

    const unsub = storageService.subscribe(() => {
      void loadData();
    });
    return () => unsub();
  }, [currentUser, authMode]);

  // Dynamic leave types
  const dynamicLeaveTypes = useMemo(() => {
    const mdItems = MasterDataService.getMasterData('HR', 'LEAVE_TYPES');
    if (mdItems.length > 0) {
      return mdItems.map(m => m.nameAr);
    }
    return ['سنوية', 'مرضية', 'عارضة', 'بدون راتب', 'أمومة/أبوة', 'أخرى'];
  }, []);

  const permissionTypes = [
    'إذن خروج مؤقت',
    'إذن تأخير صباحي',
    'إذن انصراف مبكر',
    'مهمة عمل رسمية',
    'ظرف طارئ',
  ];

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 1;
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 1;
  };

  const daysCount = calculateDays(leaveStartDate, leaveEndDate);

  // Handle file conversion to DataURL
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('حجم الملف يجب ألا يتجاوز 2 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setter(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Submit Leave
  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveError('');
    setLeaveSuccess('');

    if (!leaveReason.trim()) {
      setLeaveError('يرجى كتابة سبب طلب الإجازة');
      return;
    }

    if (new Date(leaveEndDate) < new Date(leaveStartDate)) {
      setLeaveError('تاريخ النهاية يجب ألا يسبق تاريخ البداية');
      return;
    }

    if (authMode === 'teacher') {
      setRequestSubmitting('leave');
      const result = await storageService.createTeacherLeaveRequestAuthoritative({
        leaveType,
        startDate: leaveStartDate,
        endDate: leaveEndDate,
        reason: leaveReason,
        notes: leaveNotes,
        attachment: leaveAttachment,
      });
      setRequestSubmitting(null);

      if (!result.success) {
        setLeaveError(result.message || 'تعذر إرسال طلب الإجازة');
        return;
      }

      setLeaveSuccess(result.message || 'تم إرسال طلب الإجازة بنجاح، وهو الآن قيد المراجعة والاعتماد.');
      setLeaveReason('');
      setLeaveNotes('');
      setLeaveAttachment('');
      await loadData();
      setTimeout(() => {
        setIsLeaveModalOpen(false);
        setLeaveSuccess('');
      }, 700);
      return;
    }

    const res = storageService.saveLeave(
      {
        id: `LEV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        employeeId: ownEmpId,
        employeeName: ownEmployee?.name || currentUser?.fullName || 'الموظف',
        department: ownEmployee?.department || 'هيئة التدريس',
        leaveType,
        startDate: leaveStartDate,
        endDate: leaveEndDate,
        daysCount,
        reason: leaveReason,
        notes: leaveNotes,
        attachment: leaveAttachment,
        status: 'معلقة',
        createdAt: getCairoCurrentDate(),
      },
      currentUser
    );

    if (res.success) {
      setLeaveSuccess('تم إرسال طلب الإجازة بنجاح، وهو الآن قيد المراجعة والاعتماد.');
      setLeaveReason('');
      setLeaveNotes('');
      setLeaveAttachment('');
      setTimeout(() => {
        setIsLeaveModalOpen(false);
        setLeaveSuccess('');
      }, 1200);
      void loadData();
    } else {
      setLeaveError(res.message || 'تعذر إرسال الطلب');
    }
  };

  // Calculate duration in hours
  const calculateDuration = (start: string, end: string) => {
    try {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const diffMinutes = (eh * 60 + em) - (sh * 60 + sm);
      const hours = diffMinutes / 60;
      return hours > 0 ? parseFloat(hours.toFixed(1)) : 1;
    } catch {
      return 1;
    }
  };

  // Submit Permission
  const handleSubmitPerm = async (e: React.FormEvent) => {
    e.preventDefault();
    setPermError('');
    setPermSuccess('');

    if (!permReason.trim()) {
      setPermError('يرجى كتابة سبب الإذن');
      return;
    }

    const durationHours = calculateDuration(permStartTime, permEndTime);
    if (durationHours <= 0) {
      setPermError('وقت الانتهاء يجب أن يكون بعد وقت البدء');
      return;
    }

    if (authMode === 'teacher') {
      setRequestSubmitting('permission');
      const result = await storageService.createTeacherPermissionRequestAuthoritative({
        date: permDate,
        permissionType: permType,
        startTime: permStartTime,
        endTime: permEndTime,
        reason: permReason,
        notes: permNotes,
        attachment: permAttachment,
      });
      setRequestSubmitting(null);

      if (!result.success) {
        setPermError(result.message || 'تعذر إرسال طلب الإذن');
        return;
      }

      setPermSuccess(result.message || 'تم إرسال طلب الإذن بنجاح وهو الآن قيد المراجعة.');
      setPermReason('');
      setPermNotes('');
      setPermAttachment('');
      await loadData();
      setTimeout(() => {
        setIsPermModalOpen(false);
        setPermSuccess('');
      }, 700);
      return;
    }

    const res = HRPayrollService.savePermission(
      {
        id: `PERM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        employeeId: ownEmpId,
        date: permDate,
        permissionType: permType,
        startTime: permStartTime,
        endTime: permEndTime,
        durationHours,
        reason: permReason,
        notes: permNotes,
        attachment: permAttachment,
      },
      currentUser
    );

    if (res.success) {
      setPermSuccess('تم إرسال طلب الإذن بنجاح وهو الآن قيد المراجعة.');
      setPermReason('');
      setPermNotes('');
      setPermAttachment('');
      setTimeout(() => {
        setIsPermModalOpen(false);
        setPermSuccess('');
      }, 1200);
      void loadData();
    } else {
      setPermError(res.message || 'تعذر إرسال طلب الإذن');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'مقبولة':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            معتمد ومقبول
          </span>
        );
      case 'معلقة':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-xs font-bold">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            قيد المراجعة
          </span>
        );
      case 'مرفوضة':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-xs font-bold">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            مرفوض
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  return (
    <div className="space-y-6" dir="rtl" id="my_requests_module">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs mb-1">
            <History className="w-4 h-4" />
            <span>الخدمة الذاتية للمعلمين والعاملين (Self-Service)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            إجازاتي وأذوناتي
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            تقديم ومتابعة طلبات الإجازات الاعتيادية والمرضية وأذونات الخروج الشخصية
            الخاصة بك مباشرة مع الإدارة المدرسية.
          </p>
        </div>

        {/* User Identity Card */}
        <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-sm border border-indigo-200">
            {(teacherProfile?.employeeName || currentUser?.fullName)?.charAt(0) || 'م'}
          </div>
          <div>
            <div className="font-bold text-xs text-slate-900">{teacherProfile?.employeeName || currentUser?.fullName}</div>
            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <span>الكود: {teacherProfile?.teacherCode || teacherProfile?.employeeId || ownEmployee?.employeeNumber || currentUser?.employeeId || currentUser?.id}</span>
              <span>•</span>
              <span>{teacherProfile?.department || ownEmployee?.department || 'هيئة التدريس'}</span>
            </div>
          </div>
        </div>
      </div>

      {authMode === 'teacher' && requestsError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {requestsError}
          </span>
          <button type="button" onClick={() => void loadData()} className="underline">
            إعادة المحاولة
          </button>
        </div>
      )}

      {authMode === 'teacher' && requestsLoading && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">
          جارٍ تحميل طلباتك من الخادم المعتمد...
        </div>
      )}

      {/* Tabs & Action buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'leaves'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>طلبات إجازاتي ({leaves.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'permissions'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>طلبات أذوناتي ({permissions.length})</span>
          </button>
        </div>

        <div>
          {activeTab === 'leaves' ? (
            <button
              onClick={() => {
                setLeaveError('');
                setLeaveSuccess('');
                setIsLeaveModalOpen(true);
              }}
              className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>طلب إجازة جديدة</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setPermError('');
                setPermSuccess('');
                setIsPermModalOpen(true);
              }}
              className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>طلب إذن جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Leaves Tab Content */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          {leaves.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">لا توجد طلبات إجازة مسجلة</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                لم تقم بتقديم أي طلبات إجازة حتى الآن. يمكنك النقر على زر "طلب إجازة جديدة" لتقديم طلب رسمي.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">نوع الإجازة</th>
                      <th className="p-3.5">الفترة</th>
                      <th className="p-3.5">عدد الأيام</th>
                      <th className="p-3.5">السبب</th>
                      <th className="p-3.5">المرفق</th>
                      <th className="p-3.5">الحالة</th>
                      <th className="p-3.5 text-center">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaves.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50/60 transition">
                        <td className="p-3.5 font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          <span>{l.leaveType}</span>
                        </td>
                        <td className="p-3.5 text-slate-600 font-mono text-[11px]">
                          من {l.startDate} إلى {l.endDate}
                        </td>
                        <td className="p-3.5 font-bold text-slate-800">
                          {l.daysCount} {l.daysCount === 1 ? 'يوم' : 'أيام'}
                        </td>
                        <td className="p-3.5 text-slate-600 max-w-xs truncate" title={l.reason}>
                          {l.reason || '—'}
                        </td>
                        <td className="p-3.5">
                          {l.attachment ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                              <Paperclip className="w-3 h-3" />
                              مرفق
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">لا يوجد</span>
                          )}
                        </td>
                        <td className="p-3.5">{getStatusBadge(l.status)}</td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => setViewingLeave(l)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                            title="عرض التفاصيل"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Permissions Tab Content */}
      {activeTab === 'permissions' && (
        <div className="space-y-4">
          {permissions.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-dashed border-slate-200">
              <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">لا توجد أذونات مسجلة</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                لم تقم بتقديم أي أذونات خروج أو تأخير. يمكنك النقر على زر "طلب إذن جديد" لتقديم طلب فوري.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">نوع الإذن</th>
                      <th className="p-3.5">التاريخ</th>
                      <th className="p-3.5">الوقت والتوقيت</th>
                      <th className="p-3.5">المدة</th>
                      <th className="p-3.5">السبب</th>
                      <th className="p-3.5">المرفق</th>
                      <th className="p-3.5">الحالة</th>
                      <th className="p-3.5 text-center">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {permissions.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition">
                        <td className="p-3.5 font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-500" />
                          <span>{p.permissionType}</span>
                        </td>
                        <td className="p-3.5 text-slate-600 font-mono text-[11px]">{p.date}</td>
                        <td className="p-3.5 text-slate-600 font-mono text-[11px]">
                          من {p.startTime} إلى {p.endTime}
                        </td>
                        <td className="p-3.5 font-bold text-slate-800">
                          {p.durationHours} ساعة
                        </td>
                        <td className="p-3.5 text-slate-600 max-w-xs truncate" title={p.reason}>
                          {p.reason || '—'}
                        </td>
                        <td className="p-3.5">
                          {p.attachment ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded">
                              <Paperclip className="w-3 h-3" />
                              مرفق
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">لا يوجد</span>
                          )}
                        </td>
                        <td className="p-3.5">{getStatusBadge(p.status)}</td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => setViewingPerm(p)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                            title="عرض التفاصيل"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Leave Request Modal */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-indigo-600" />
                تقديم طلب إجازة رسمي
              </h3>
              <button
                onClick={() => setIsLeaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {leaveError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{leaveError}</span>
              </div>
            )}

            {leaveSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{leaveSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSubmitLeave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نوع الإجازة *</label>
                  <select
                    value={leaveType}
                    onChange={e => setLeaveType(e.target.value as LeaveType)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    {dynamicLeaveTypes.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">عدد الأيام المحسوبة</label>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-indigo-700">
                    {daysCount} {daysCount === 1 ? 'يوم' : 'أيام'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">من تاريخ *</label>
                  <input
                    type="date"
                    value={leaveStartDate}
                    onChange={e => setLeaveStartDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">إلى تاريخ *</label>
                  <input
                    type="date"
                    value={leaveEndDate}
                    onChange={e => setLeaveEndDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">سبب الإجازة *</label>
                <textarea
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  placeholder="اكتب سبب طلب الإجازة بالتفصيل..."
                  rows={2}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ملاحظات إضافية (اختياري)</label>
                <textarea
                  value={leaveNotes}
                  onChange={e => setLeaveNotes(e.target.value)}
                  placeholder="أي تفاصيل أو ترتيبات خاصة بالعمل أو البدلاء..."
                  rows={2}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  المرفق (تقرير طبي أو مستند رسمي - اختياري)
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => handleFileUpload(e, setLeaveAttachment)}
                  className="w-full border border-slate-300 rounded-xl p-2 text-xs file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {leaveAttachment && (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    تم إرفاق المستند بنجاح
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={requestSubmitting !== null}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{requestSubmitting === 'leave' ? 'جارٍ الإرسال...' : 'إرسال الطلب'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permission Request Modal */}
      {isPermModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                تقديم طلب إذن خروج / تأخير
              </h3>
              <button
                onClick={() => setIsPermModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {permError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{permError}</span>
              </div>
            )}

            {permSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{permSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSubmitPerm} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">نوع الإذن *</label>
                  <select
                    value={permType}
                    onChange={e => setPermType(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    {permissionTypes.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاريخ الإذن *</label>
                  <input
                    type="date"
                    value={permDate}
                    onChange={e => setPermDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">من الساعة *</label>
                  <input
                    type="time"
                    value={permStartTime}
                    onChange={e => setPermStartTime(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">إلى الساعة *</label>
                  <input
                    type="time"
                    value={permEndTime}
                    onChange={e => setPermEndTime(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">المدة التقديرية</label>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-indigo-700">
                    {calculateDuration(permStartTime, permEndTime)} ساعة
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">السبب *</label>
                <textarea
                  value={permReason}
                  onChange={e => setPermReason(e.target.value)}
                  placeholder="سبب الخروج أو التأخير..."
                  rows={2}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ملاحظات (اختياري)</label>
                <textarea
                  value={permNotes}
                  onChange={e => setPermNotes(e.target.value)}
                  placeholder="أي ملاحظات أخرى للإدارة..."
                  rows={2}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  المرفق (إن وجد - اختياري)
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => handleFileUpload(e, setPermAttachment)}
                  className="w-full border border-slate-300 rounded-xl p-2 text-xs file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {permAttachment && (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    تم إرفاق المستند بنجاح
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setIsPermModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={requestSubmitting !== null}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{requestSubmitting === 'permission' ? 'جارٍ الإرسال...' : 'إرسال طلب الإذن'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Leave Details Modal */}
      {viewingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                تفاصيل طلب الإجازة
              </h3>
              <button
                onClick={() => setViewingLeave(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">حالة الطلب:</span>
                <div>{getStatusBadge(viewingLeave.status)}</div>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">نوع الإجازة:</span>
                <span className="font-bold text-slate-800">{viewingLeave.leaveType}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">الفترة:</span>
                <span className="font-mono text-slate-800">
                  من {viewingLeave.startDate} إلى {viewingLeave.endDate} ({viewingLeave.daysCount} أيام)
                </span>
              </div>
              <div className="py-1 border-b border-slate-100">
                <span className="text-slate-500 block mb-1">السبب:</span>
                <p className="bg-slate-50 p-2.5 rounded-lg text-slate-800 font-medium">
                  {viewingLeave.reason || 'لا يوجد'}
                </p>
              </div>
              {viewingLeave.notes && (
                <div className="py-1 border-b border-slate-100">
                  <span className="text-slate-500 block mb-1">ملاحظات مقدم الطلب:</span>
                  <p className="bg-slate-50 p-2.5 rounded-lg text-slate-700">
                    {viewingLeave.notes}
                  </p>
                </div>
              )}
              {viewingLeave.approvedBy && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">تم الاعتماد بواسطة:</span>
                  <span className="font-bold text-emerald-700">{viewingLeave.approvedBy}</span>
                </div>
              )}
              {viewingLeave.rejectionReason && (
                <div className="py-1 border-b border-slate-100">
                  <span className="text-rose-600 font-bold block mb-1">سبب الرفض:</span>
                  <p className="bg-rose-50 text-rose-700 p-2.5 rounded-lg font-medium">
                    {viewingLeave.rejectionReason}
                  </p>
                </div>
              )}
              {viewingLeave.attachment && (
                <div className="py-1">
                  <span className="text-slate-500 block mb-1">المرفق:</span>
                  <a
                    href={viewingLeave.attachment}
                    download="leave_attachment"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold"
                  >
                    <Paperclip className="w-4 h-4" />
                    تحميل / معاينة المرفق
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button
                onClick={() => setViewingLeave(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Permission Details Modal */}
      {viewingPerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                تفاصيل طلب الإذن
              </h3>
              <button
                onClick={() => setViewingPerm(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">حالة الطلب:</span>
                <div>{getStatusBadge(viewingPerm.status)}</div>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">نوع الإذن:</span>
                <span className="font-bold text-slate-800">{viewingPerm.permissionType}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">التاريخ:</span>
                <span className="font-mono text-slate-800">{viewingPerm.date}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">التوقيت والمدة:</span>
                <span className="font-mono text-slate-800">
                  من {viewingPerm.startTime} إلى {viewingPerm.endTime} ({viewingPerm.durationHours} ساعة)
                </span>
              </div>
              <div className="py-1 border-b border-slate-100">
                <span className="text-slate-500 block mb-1">السبب:</span>
                <p className="bg-slate-50 p-2.5 rounded-lg text-slate-800 font-medium">
                  {viewingPerm.reason || 'لا يوجد'}
                </p>
              </div>
              {viewingPerm.notes && (
                <div className="py-1 border-b border-slate-100">
                  <span className="text-slate-500 block mb-1">ملاحظات:</span>
                  <p className="bg-slate-50 p-2.5 rounded-lg text-slate-700">
                    {viewingPerm.notes}
                  </p>
                </div>
              )}
              {viewingPerm.approvedBy && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">تم الاعتماد بواسطة:</span>
                  <span className="font-bold text-emerald-700">{viewingPerm.approvedBy}</span>
                </div>
              )}
              {viewingPerm.rejectionReason && (
                <div className="py-1 border-b border-slate-100">
                  <span className="text-rose-600 font-bold block mb-1">سبب الرفض:</span>
                  <p className="bg-rose-50 text-rose-700 p-2.5 rounded-lg font-medium">
                    {viewingPerm.rejectionReason}
                  </p>
                </div>
              )}
              {viewingPerm.attachment && (
                <div className="py-1">
                  <span className="text-slate-500 block mb-1">المرفق:</span>
                  <a
                    href={viewingPerm.attachment}
                    download="permission_attachment"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold"
                  >
                    <Paperclip className="w-4 h-4" />
                    تحميل / معاينة المرفق
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button
                onClick={() => setViewingPerm(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
