import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  Hash,
  School as SchoolIcon,
} from 'lucide-react';
import { School, User } from '../../types';
import { schoolAdminService } from '../../services/schoolAdminService';

interface SchoolsManagementViewProps {
  currentUser?: User | null;
}

export const SchoolsManagementView: React.FC<SchoolsManagementViewProps> = ({ currentUser }) => {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchools = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await schoolAdminService.getManagedSchools(currentUser);
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
  }, [currentUser]);

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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {schools.map(school => {
                  const isActive = school.status === 'Active';
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
