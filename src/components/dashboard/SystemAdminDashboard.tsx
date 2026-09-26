import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  School as SchoolIcon,
  Users,
  ShieldCheck,
  ArrowLeft,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { School, User } from '../../types';
import { schoolAdminService } from '../../services/schoolAdminService';
import { storageService } from '../../services/storageService';
import { canAccessTab } from '../../utils/navigation';

interface SystemAdminDashboardProps {
  currentUser?: User | null;
  onNavigate?: (tab: string, params?: any) => void;
}

export const SystemAdminDashboard: React.FC<SystemAdminDashboardProps> = ({
  currentUser,
  onNavigate,
}) => {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingSchoolId, setSwitchingSchoolId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switchSuccess, setSwitchSuccess] = useState<string | null>(null);

  const effectiveUser = currentUser !== undefined ? currentUser : storageService.getCurrentUser();
  const [currentActiveSchoolId, setCurrentActiveSchoolId] = useState<string>(
    effectiveUser?.activeSchoolId || storageService.getActiveSchoolId() || ''
  );

  const allowedSchoolIds = Array.isArray(effectiveUser?.allowedSchoolIds)
    ? effectiveUser.allowedSchoolIds
    : [];

  const fetchSchools = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await schoolAdminService.getManagedSchools(effectiveUser);
      if (res.success && Array.isArray(res.data)) {
        setSchools(res.data);
      } else {
        setError(res.message || 'تعذر تحميل سجل المدارس المعتمد.');
      }
    } catch {
      setError('تعذر تحميل سجل المدارس المعتمد.');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveUser]);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  // Keep active school ID in sync if effectiveUser updates
  useEffect(() => {
    const active = effectiveUser?.activeSchoolId || storageService.getActiveSchoolId() || '';
    setCurrentActiveSchoolId(active);
  }, [effectiveUser?.activeSchoolId]);

  const handleSwitchSchool = async (school: School) => {
    if (school.status !== 'Active') return;
    if (!allowedSchoolIds.includes(school.schoolId)) return;

    setSwitchingSchoolId(school.schoolId);
    setSwitchError(null);
    setSwitchSuccess(null);

    try {
      const res = await storageService.switchActiveSchool(school.schoolId);
      if (res.success) {
        setCurrentActiveSchoolId(school.schoolId);
        setSwitchSuccess(`تم التبديل بنجاح إلى: ${school.schoolName}`);
      } else {
        setSwitchError(res.message || 'تعذر التبديل إلى المدرسة المحددة.');
      }
    } catch (err: any) {
      setSwitchError(err?.message || 'حدث خطأ أثناء الاتصال بالخادم للتبديل.');
    } finally {
      setSwitchingSchoolId(null);
    }
  };

  const totalCount = schools ? schools.length : 0;
  const activeCount = schools ? schools.filter(s => s.status === 'Active').length : 0;
  const inactiveCount = schools ? schools.filter(s => s.status === 'Inactive').length : 0;

  // Active School Name descriptor
  const activeSchoolRecord = schools?.find(s => s.schoolId === currentActiveSchoolId);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#008e8b] shrink-0 shadow-xs">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">لوحة إدارة النظام المركزي</h1>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              نظرة عامة على المدارس وإدارة منظومة NTSS
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-stretch md:self-auto justify-end">
          {currentActiveSchoolId ? (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
              <span>المدرسة الحالية:</span>
              <span className="font-extrabold text-[#008e8b]">
                {activeSchoolRecord ? activeSchoolRecord.schoolName : currentActiveSchoolId}
              </span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              <span>نطاق الإدارة: شامل (بدون مدرسة نشطة)</span>
            </div>
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

      {/* Switch Feedback Banners */}
      {switchSuccess && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{switchSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setSwitchSuccess(null)}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {switchError && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs font-bold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{switchError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSwitchError(null)}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Central Metrics Summary */}
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

      {/* Quick Central Management Actions */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <h2 className="text-sm font-black text-slate-800 mb-3.5 flex items-center gap-2">
          <span>الإجراءات الإدارية السريعة</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {canAccessTab(effectiveUser, 'schools') && (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('schools')}
              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 hover:border-teal-300 bg-slate-50/50 hover:bg-teal-50/30 transition-all text-right cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-[#008e8b] group-hover:scale-105 transition-transform">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-[#008e8b] transition-colors">
                    إدارة المدارس
                  </div>
                  <div className="text-[11px] text-slate-400">سجل المدارس، إنشاء وتعديل</div>
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-[#008e8b] -translate-x-0 group-hover:-translate-x-1 transition-all" />
            </button>
          )}

          {canAccessTab(effectiveUser, 'users') && (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('users')}
              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 hover:border-teal-300 bg-slate-50/50 hover:bg-teal-50/30 transition-all text-right cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                    إدارة المستخدمين
                  </div>
                  <div className="text-[11px] text-slate-400">إدارة حسابات وصلاحيات النظام</div>
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-blue-600 -translate-x-0 group-hover:-translate-x-1 transition-all" />
            </button>
          )}

          {canAccessTab(effectiveUser, 'audit') && (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('audit')}
              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 hover:border-teal-300 bg-slate-50/50 hover:bg-teal-50/30 transition-all text-right cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                    سجل العمليات
                  </div>
                  <div className="text-[11px] text-slate-400">سجل الأنشطة والأمان المركزي</div>
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 -translate-x-0 group-hover:-translate-x-1 transition-all" />
            </button>
          )}
        </div>
      </div>

      {/* Schools Central List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SchoolIcon className="w-4 h-4 text-[#008e8b]" />
            <h2 className="text-sm font-black text-slate-800">قائمة المدارس المسجلة</h2>
          </div>
          {canAccessTab(effectiveUser, 'schools') && (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('schools')}
              className="text-xs font-bold text-[#008e8b] hover:text-[#007977] flex items-center gap-1 cursor-pointer"
            >
              <span>فتح سجل المدارس الكامل</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isLoading ? (
          /* Loading */
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#008e8b] mb-4">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">جارٍ تحميل بيانات المنظومة المركزية...</h3>
            <p className="text-xs text-slate-400 mt-1">يتم استرجاع سجل المدارس المعتمد من الخادم</p>
          </div>
        ) : error ? (
          /* Error */
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">{error}</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              تعذر الاتصال بالخادم الرئيسي، يرجى إعادة المحاولة.
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
          /* Empty */
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
                  <th className="py-3.5 px-4 font-bold">الحالة</th>
                  <th className="py-3.5 px-4 font-bold text-center">السياق الإجرائي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {schools.map(school => {
                  const isActive = school.status === 'Active';
                  const isCurrentActive = school.schoolId === currentActiveSchoolId;
                  const isAllowed = allowedSchoolIds.includes(school.schoolId);
                  const isSwitching = switchingSchoolId === school.schoolId;

                  return (
                    <tr
                      key={school.schoolId}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        isCurrentActive ? 'bg-teal-50/30' : ''
                      }`}
                      data-school-id={school.schoolId}
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100/70 flex items-center justify-center text-[#008e8b] shrink-0">
                            <SchoolIcon className="w-3.5 h-3.5" />
                          </div>
                          <span>{school.schoolName}</span>
                          {isCurrentActive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[10px] font-black">
                              <Check className="w-3 h-3" />
                              المدرسة الحالية
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                          {school.schoolCode}
                        </span>
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

                      <td className="py-3.5 px-4 text-center">
                        {isCurrentActive ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-teal-50 text-[#008e8b] font-bold text-xs">
                            <Check className="w-3 h-3" />
                            المدرسة الحالية
                          </span>
                        ) : isActive && isAllowed ? (
                          <button
                            type="button"
                            onClick={() => handleSwitchSchool(school)}
                            disabled={isSwitching}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-[#008e8b] border border-teal-200/60 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isSwitching ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-[#008e8b]" />
                            ) : (
                              <ExternalLink className="w-3 h-3" />
                            )}
                            <span>الدخول إلى المدرسة</span>
                          </button>
                        ) : !isActive ? (
                          <span className="text-[11px] text-slate-400 font-semibold">
                            غير متاحة للدخول (معطلة)
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-semibold">
                            غير مصرح بالتبديل
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
