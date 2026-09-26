import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  School as SchoolIcon,
  Plus,
  Edit2,
  Power,
  PowerOff,
  X,
} from 'lucide-react';
import { School, User } from '../../types';
import { schoolAdminService } from '../../services/schoolAdminService';
import { storageService } from '../../services/storageService';
import { hasEffectivePermission } from '../../utils/permissions';
import { ACTIVE_SCHOOL_KEY } from '../../services/migrationScope014MultiSchool';

interface SchoolsManagementViewProps {
  currentUser?: User | null;
}

export const SchoolsManagementView: React.FC<SchoolsManagementViewProps> = ({ currentUser }) => {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [createId, setCreateId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Edit Modal State
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editStatus, setEditStatus] = useState<'Active' | 'Inactive'>('Active');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Deactivate Confirmation Modal State
  const [deactivatingSchool, setDeactivatingSchool] = useState<School | null>(null);
  const [isSubmittingDeactivate, setIsSubmittingDeactivate] = useState(false);

  // Row Action Loading State
  const [pendingActionSchoolId, setPendingActionSchoolId] = useState<string | null>(null);

  // Effective user & permission check
  const effectiveUser = currentUser !== undefined ? currentUser : storageService.getCurrentUser();
  const canManageSchools = Boolean(
    effectiveUser &&
    effectiveUser.role === 'SystemAdmin' &&
    effectiveUser.accessScope === 'GLOBAL' &&
    hasEffectivePermission(effectiveUser, 'schools.manage')
  );

  const fetchSchools = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await schoolAdminService.getManagedSchools(effectiveUser);
      if (res.success && Array.isArray(res.data)) {
        setSchools(res.data);
      } else {
        setError(res.message || 'تعذر تحميل سجل المدارس.');
      }
    } catch {
      setError('تعذر تحميل سجل المدارس.');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUser]);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  const formatDate = (isoStr?: string): string => {
    if (!isoStr || !isoStr.trim()) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoStr || '—';
    }
  };

  const getSafeActivationErrorMessage = (code?: string, message?: string): string => {
    const c = (code || '').toUpperCase();
    const m = (message || '').toUpperCase();
    if (
      c.includes('NOT_BOUND') ||
      c.includes('SPREADSHEET') ||
      c.includes('BIND') ||
      m.includes('NOT_BOUND') ||
      m.includes('SPREADSHEET_NOT_BOUND') ||
      m.includes('SPREADSHEET_INVALID') ||
      m.includes('ربط')
    ) {
      return 'لا يمكن تفعيل المدرسة قبل استكمال ربطها بجدول البيانات المعتمد من الخادم.';
    }
    return message || 'فشل تفعيل المدرسة.';
  };

  // --- Create Handlers ---
  const handleOpenCreateModal = () => {
    setCreateName('');
    setCreateCode('');
    setCreateId('');
    setCreateError(null);
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    if (isSubmittingCreate) return;
    setIsCreateModalOpen(false);
    setCreateError(null);
  };

  const handleCreateCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setCreateCode(val);
    if (!createId || createId.startsWith('SCH-')) {
      setCreateId(val ? `SCH-${val}` : '');
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const trimmedName = createName.trim();
    const trimmedCode = createCode.trim().toUpperCase();
    const trimmedId = createId.trim().toUpperCase();

    if (!trimmedName) {
      setCreateError('يرجى إدخال اسم المدرسة.');
      return;
    }
    if (!trimmedCode) {
      setCreateError('يرجى إدخال رمز المدرسة.');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const res = await schoolAdminService.createSchool(
        {
          schoolName: trimmedName,
          schoolCode: trimmedCode,
          schoolId: trimmedId || undefined,
        },
        effectiveUser
      );

      if (res.success) {
        setIsCreateModalOpen(false);
        setActionFeedback({
          type: 'success',
          message: 'تم تسجيل المدرسة بنجاح. تظهر المدرسة في حالة غير نشطة بانتظار ربط جدول البيانات من الخادم.',
        });
        await fetchSchools();
      } else {
        setCreateError(res.message || 'فشل إنشاء المدرسة من قبل الخادم.');
      }
    } catch (err: any) {
      setCreateError(err?.message || 'حدث خطأ في الاتصال أثناء تسجيل المدرسة.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // --- Edit Handlers ---
  const handleOpenEditModal = (school: School) => {
    setEditingSchool(school);
    setEditName(school.schoolName || '');
    setEditCode(school.schoolCode || '');
    setEditStatus(school.status);
    setEditError(null);
  };

  const handleCloseEditModal = () => {
    if (isSubmittingEdit) return;
    setEditingSchool(null);
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchool) return;

    setEditError(null);
    const trimmedName = editName.trim();
    const trimmedCode = editCode.trim().toUpperCase();

    if (!trimmedName) {
      setEditError('اسم المدرسة لا يمكن أن يكون فارغاً.');
      return;
    }
    if (!trimmedCode) {
      setEditError('رمز المدرسة لا يمكن أن يكون فارغاً.');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const res = await schoolAdminService.updateSchool(
        editingSchool.schoolId,
        {
          schoolName: trimmedName,
          schoolCode: trimmedCode,
          status: editStatus,
        },
        effectiveUser
      );

      if (res.success) {
        // If current active school was deactivated, fail closed / clear active school
        if (editStatus === 'Inactive' && effectiveUser?.activeSchoolId === editingSchool.schoolId) {
          const user = storageService.getCurrentUser();
          if (user && user.activeSchoolId === editingSchool.schoolId) {
            storageService.setCurrentUser({ ...user, activeSchoolId: '' });
            localStorage.removeItem(ACTIVE_SCHOOL_KEY);
            storageService.clearSchoolScopedCaches();
            storageService.notifyChange();
          }
        }

        setEditingSchool(null);
        setActionFeedback({
          type: 'success',
          message: 'تم تحديث بيانات المدرسة بنجاح.',
        });
        await fetchSchools();
      } else {
        const safeMsg = editStatus === 'Active' && editingSchool.status === 'Inactive'
          ? getSafeActivationErrorMessage(res.code, res.message)
          : (res.message || 'فشل تحديث بيانات المدرسة.');
        setEditError(safeMsg);
      }
    } catch (err: any) {
      setEditError(err?.message || 'حدث خطأ في الاتصال أثناء تحديث المدرسة.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // --- Direct Status Toggle Handlers ---
  const handleActivateSchool = async (school: School) => {
    setPendingActionSchoolId(school.schoolId);
    setActionFeedback(null);
    try {
      const res = await schoolAdminService.updateSchool(
        school.schoolId,
        { status: 'Active' },
        effectiveUser
      );

      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: `تم تفعيل ${school.schoolName} بنجاح.`,
        });
        await fetchSchools();
      } else {
        const safeMsg = getSafeActivationErrorMessage(res.code, res.message);
        setActionFeedback({
          type: 'error',
          message: safeMsg,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err?.message || 'حدث خطأ أثناء تفعيل المدرسة.',
      });
    } finally {
      setPendingActionSchoolId(null);
    }
  };

  const handleOpenDeactivateConfirm = (school: School) => {
    setDeactivatingSchool(school);
  };

  const handleCloseDeactivateConfirm = () => {
    if (isSubmittingDeactivate) return;
    setDeactivatingSchool(null);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivatingSchool) return;

    setIsSubmittingDeactivate(true);
    setActionFeedback(null);
    try {
      const res = await schoolAdminService.updateSchool(
        deactivatingSchool.schoolId,
        { status: 'Inactive' },
        effectiveUser
      );

      if (res.success) {
        // Edge Case: SystemAdmin activeSchoolId matches deactivated school
        if (effectiveUser?.activeSchoolId === deactivatingSchool.schoolId) {
          const user = storageService.getCurrentUser();
          if (user && user.activeSchoolId === deactivatingSchool.schoolId) {
            storageService.setCurrentUser({ ...user, activeSchoolId: '' });
            localStorage.removeItem(ACTIVE_SCHOOL_KEY);
            storageService.clearSchoolScopedCaches();
            storageService.notifyChange();
          }
        }

        setDeactivatingSchool(null);
        setActionFeedback({
          type: 'success',
          message: `تم تعطيل ${deactivatingSchool.schoolName} بنجاح.`,
        });
        await fetchSchools();
      } else {
        setActionFeedback({
          type: 'error',
          message: res.message || 'فشل تعطيل المدرسة.',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err?.message || 'حدث خطأ أثناء تعطيل المدرسة.',
      });
    } finally {
      setIsSubmittingDeactivate(false);
    }
  };

  const totalCount = schools ? schools.length : 0;
  const activeCount = schools ? schools.filter(s => s.status === 'Active').length : 0;
  const inactiveCount = schools ? schools.filter(s => s.status === 'Inactive').length : 0;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto" dir="rtl">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#008e8b] shrink-0 shadow-xs">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">إدارة المدارس</h1>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              السجل المركزي للمدارس التابعة للنظام
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
          {canManageSchools && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#008e8b] hover:bg-[#007977] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مدرسة</span>
            </button>
          )}

          <button
            type="button"
            onClick={fetchSchools}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#008e8b]' : 'text-slate-500'}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold transition-all ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Schools */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500">إجمالي المدارس</div>
            <div className="text-2xl font-black text-slate-800 mt-1">
              {isLoading && schools === null ? '—' : totalCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <SchoolIcon className="w-5 h-5" />
          </div>
        </div>

        {/* Active Schools */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-emerald-600">المدارس النشطة</div>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              {isLoading && schools === null ? '—' : activeCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Inactive Schools */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500">المدارس غير النشطة</div>
            <div className="text-2xl font-black text-slate-600 mt-1">
              {isLoading && schools === null ? '—' : inactiveCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
            <XCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          /* Loading State */
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#008e8b] mb-4">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">جارٍ تحميل سجل المدارس...</h3>
            <p className="text-xs text-slate-400 mt-1">يتم جلب البيانات المعتمدة من الخادم المركزي</p>
          </div>
        ) : error ? (
          /* Error State */
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">{error}</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              تعذر الاتصال بالخادم الرئيسي لجلب السجل المعتمد، يرجى المحاولة مرة أخرى.
            </p>
            <button
              type="button"
              onClick={fetchSchools}
              className="mt-4 px-5 py-2 rounded-xl bg-[#008e8b] hover:bg-[#007977] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : !schools || schools.length === 0 ? (
          /* Empty State */
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">لا توجد مدارس مسجلة حتى الآن.</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              لم يتم العثور على أي مدارس مسجلة في السجل المركزي للنظام.
            </p>
          </div>
        ) : (
          /* Schools Table */
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-bold">
                <tr>
                  <th className="py-3.5 px-4 font-bold">اسم المدرسة</th>
                  <th className="py-3.5 px-4 font-bold">كود المدرسة</th>
                  <th className="py-3.5 px-4 font-bold">معرف المدرسة</th>
                  <th className="py-3.5 px-4 font-bold">الحالة</th>
                  <th className="py-3.5 px-4 font-bold">تاريخ الإنشاء</th>
                  <th className="py-3.5 px-4 font-bold">آخر تحديث</th>
                  {canManageSchools && (
                    <th className="py-3.5 px-4 font-bold text-center">الإجراءات</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {schools.map(school => {
                  const isActive = school.status === 'Active';
                  const isPending = pendingActionSchoolId === school.schoolId;

                  return (
                    <tr
                      key={school.schoolId}
                      className="hover:bg-slate-50/60 transition-colors"
                      data-school-id={school.schoolId}
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100/70 flex items-center justify-center text-[#008e8b] shrink-0">
                            <SchoolIcon className="w-3.5 h-3.5" />
                          </div>
                          <span>{school.schoolName}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                          {school.schoolCode}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                        {school.schoolId}
                      </td>
                      <td className="py-3.5 px-4">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            نشطة
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            غير نشطة
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {formatDate(school.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {formatDate(school.updatedAt)}
                      </td>

                      {/* Management Actions */}
                      {canManageSchools && (
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(school)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                              title="تعديل بيانات المدرسة"
                            >
                              <Edit2 className="w-3 h-3 text-slate-500" />
                              <span>تعديل</span>
                            </button>

                            {isActive ? (
                              <button
                                type="button"
                                onClick={() => handleOpenDeactivateConfirm(school)}
                                disabled={isPending}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                title="تعطيل المدرسة"
                              >
                                <PowerOff className="w-3 h-3 text-amber-600" />
                                <span>تعطيل</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleActivateSchool(school)}
                                disabled={isPending}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                title="تفعيل المدرسة"
                              >
                                {isPending ? (
                                  <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                                ) : (
                                  <Power className="w-3 h-3 text-emerald-600" />
                                )}
                                <span>تفعيل</span>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create School */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          dir="rtl"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#008e8b]">
                  <Building2 className="w-4 h-4" />
                </div>
                <h2 className="text-base font-black text-slate-800">إضافة مدرسة جديدة</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                disabled={isSubmittingCreate}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              {createError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  اسم المدرسة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="مثال: مدرسة التكنولوجيا المتقدمة"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-[#008e8b] focus:ring-1 focus:ring-[#008e8b]"
                  disabled={isSubmittingCreate}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  رمز المدرسة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={createCode}
                  onChange={handleCreateCodeChange}
                  placeholder="مثال: TECH"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 uppercase focus:outline-hidden focus:border-[#008e8b] focus:ring-1 focus:ring-[#008e8b]"
                  disabled={isSubmittingCreate}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  معرف المدرسة (schoolId)
                </label>
                <input
                  type="text"
                  value={createId}
                  onChange={(e) => setCreateId(e.target.value.toUpperCase())}
                  placeholder="تلقائي: SCH-CODE"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 uppercase focus:outline-hidden focus:border-[#008e8b] focus:ring-1 focus:ring-[#008e8b]"
                  disabled={isSubmittingCreate}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  يتم اشتقاق المعرف تلقائياً من رمز المدرسة في حال تركه فارغاً.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  disabled={isSubmittingCreate}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2 rounded-xl bg-[#008e8b] hover:bg-[#007977] text-white text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                >
                  {isSubmittingCreate && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>حفظ وإنشاء</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit School */}
      {editingSchool && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          dir="rtl"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#008e8b]">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h2 className="text-base font-black text-slate-800">تعديل بيانات المدرسة</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={isSubmittingEdit}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              {editError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  معرف المدرسة (غير قابل للتعديل)
                </label>
                <input
                  type="text"
                  value={editingSchool.schoolId}
                  readOnly
                  disabled
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-xs font-mono text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  اسم المدرسة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-[#008e8b] focus:ring-1 focus:ring-[#008e8b]"
                  disabled={isSubmittingEdit}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  رمز المدرسة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 uppercase focus:outline-hidden focus:border-[#008e8b] focus:ring-1 focus:ring-[#008e8b]"
                  disabled={isSubmittingEdit}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  الحالة
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'Active' | 'Inactive')}
                  disabled={isSubmittingEdit}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-[#008e8b]"
                >
                  <option value="Active">نشطة (Active)</option>
                  <option value="Inactive">غير نشطة (Inactive)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2 rounded-xl bg-[#008e8b] hover:bg-[#007977] text-white text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                >
                  {isSubmittingEdit && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>حفظ التعديلات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Deactivation */}
      {deactivatingSchool && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          dir="rtl"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-3">
                <PowerOff className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-black text-slate-800">هل تريد تعطيل هذه المدرسة؟</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                سيؤدي تعطيل المدرسة (<span className="font-bold text-slate-900">{deactivatingSchool.schoolName}</span>) إلى إيقاف إمكانية التبديل إليها أو استخدامها في النظام حتى يتم إعادة تفعيلها من قبل مدير النظام.
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                لن يتم حذف أي بيانات تابعة للمدرسة.
              </p>
            </div>

            <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCloseDeactivateConfirm}
                disabled={isSubmittingDeactivate}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={isSubmittingDeactivate}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                {isSubmittingDeactivate && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>تأكيد التعطيل</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
