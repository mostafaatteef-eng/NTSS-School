import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  KeyRound,
  Lock,
  Unlock,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  UserX,
  UserCheck,
  GraduationCap,
  Sparkles,
  Clock,
  Printer
} from 'lucide-react';
import { Employee, TeacherAccount } from '../../types';
import { storageService } from '../../services/storageService';

interface TeacherAccountsManagerProps {
  currentUserRole?: string;
}

export const TeacherAccountsManager: React.FC<TeacherAccountsManagerProps> = ({ currentUserRole }) => {
  const [accounts, setAccounts] = useState<TeacherAccount[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createTempPassword, setCreateTempPassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // Success Created Modal
  const [createdSummary, setCreatedSummary] = useState<{
    teacherName: string;
    username: string;
    tempPassword: string;
  } | null>(null);

  // Reset Password Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetTargetAccount, setResetTargetAccount] = useState<TeacherAccount | null>(null);
  const [resetTempPassword, setResetTempPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isAdmin = currentUserRole === 'Admin' || currentUserRole === 'TeacherAffairs';

  const loadData = () => {
    const accs = storageService.getTeacherAccounts();
    const emps = storageService.getEmployees();
    setAccounts(accs);
    setEmployees(emps);
  };

  useEffect(() => {
    loadData();
    const unsubscribe = storageService.subscribe(() => {
      loadData();
    });
    return () => unsubscribe();
  }, []);

  const generateRandomPassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '#!@$%';
    let pass = '';
    pass += upper[Math.floor(Math.random() * upper.length)];
    pass += lower[Math.floor(Math.random() * lower.length)];
    pass += digits[Math.floor(Math.random() * digits.length)];
    pass += special[Math.floor(Math.random() * special.length)];
    const all = upper + lower + digits + special;
    for (let i = 0; i < 6; i++) {
      pass += all[Math.floor(Math.random() * all.length)];
    }
    return pass;
  };

  const openCreateModal = () => {
    setIsCreateModalOpen(true);
    setSelectedEmployeeId('');
    setCreateUsername('');
    setCreateTempPassword(generateRandomPassword());
    setShowCreatePassword(false);
  };

  const handleSelectEmployee = (empId: string) => {
    setSelectedEmployeeId(empId);
    const emp = employees.find(e => e.id === empId);
    if (emp) {
      // Auto suggest username (case-insensitive clean)
      const transliterated = (emp.teacherCode || emp.id)
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
      const suggested = `t_${transliterated || Math.floor(1000 + Math.random() * 9000)}`;
      setCreateUsername(suggested);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId || !createUsername.trim() || !createTempPassword.trim()) {
      setNotification({ type: 'error', message: 'يرجى ملء جميع الحقول المطلوبة' });
      return;
    }

    if (createTempPassword.trim().length < 8) {
      setNotification({ type: 'error', message: 'كلمة المرور المؤقتة يجب ألا تقل عن 8 خانات' });
      return;
    }

    setIsLoading(true);
    try {
      const emp = employees.find(e => e.id === selectedEmployeeId);
      const res = await storageService.createTeacherAccount(
        selectedEmployeeId,
        createUsername.trim(),
        createTempPassword.trim()
      );

      if (res.success) {
        setCreatedSummary({
          teacherName: emp?.name || 'المعلم',
          username: createUsername.trim().toLowerCase(),
          tempPassword: createTempPassword.trim(),
        });
        setIsCreateModalOpen(false);
        setNotification({ type: 'success', message: 'تم إنشاء حساب المعلم وتشفير كلمة المرور في الخادم بنجاح' });
      } else {
        setNotification({ type: 'error', message: res.message || 'تعذر إنشاء حساب المعلم' });
      }
    } catch {
      setNotification({ type: 'error', message: 'حدث خطأ أثناء الاتصال بالخادم' });
    } finally {
      setIsLoading(false);
    }
  };

  const openResetModal = (account: TeacherAccount) => {
    setResetTargetAccount(account);
    setResetTempPassword(generateRandomPassword());
    setShowResetPassword(false);
    setIsResetModalOpen(true);
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetAccount || !resetTempPassword.trim()) return;

    if (resetTempPassword.trim().length < 8) {
      setNotification({ type: 'error', message: 'كلمة المرور الجديدة يجب ألا تقل عن 8 خانات' });
      return;
    }

    setIsLoading(true);
    try {
      const res = await storageService.resetTeacherPassword(
        resetTargetAccount.employeeId,
        resetTempPassword.trim()
      );

      if (res.success) {
        setCreatedSummary({
          teacherName: resetTargetAccount.teacherName,
          username: resetTargetAccount.username,
          tempPassword: resetTempPassword.trim(),
        });
        setIsResetModalOpen(false);
        setNotification({
          type: 'success',
          message: 'تمت إعادة تعيين كلمة المرور بنجاح وإلغاء كافة الجلسات النشطة للمعلم'
        });
      } else {
        setNotification({ type: 'error', message: res.message || 'فشلت إعادة تعيين كلمة المرور' });
      }
    } catch {
      setNotification({ type: 'error', message: 'حدث خطأ أثناء إعادة التعيين' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (account: TeacherAccount) => {
    const isCurrentlyActive = account.status === 'Active' && account.isActive !== false;
    const nextStatus = isCurrentlyActive ? 'Disabled' : 'Active';
    const actionLabel = nextStatus === 'Active' ? 'تنشيط' : 'تعطيل';

    if (!window.confirm(`هل أنت متأكد من ${actionLabel} حساب المعلم (${account.teacherName})؟ ${nextStatus === 'Disabled' ? 'سيتم فوراً إبطال أي جلسة مفتوحة.' : ''}`)) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await storageService.setTeacherAccountStatus(account.employeeId, nextStatus);
      if (res.success) {
        setNotification({
          type: 'success',
          message: `تم ${actionLabel} حساب المعلم (${account.teacherName}) بنجاح.`
        });
      } else {
        setNotification({ type: 'error', message: res.message || 'فشل تعديل حالة الحساب' });
      }
    } catch {
      setNotification({ type: 'error', message: 'حدث خطأ أثناء تعديل حالة الحساب' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlockAccount = async (account: TeacherAccount) => {
    setIsLoading(true);
    try {
      const res = await storageService.resetTeacherPassword(
        account.employeeId,
        generateRandomPassword()
      );
      if (res.success) {
        setNotification({
          type: 'success',
          message: `تم إلغاء تجميد الحساب وإعادة تعيين المحاولات للمعلم (${account.teacherName}) بنجاح.`
        });
      }
    } catch {
      setNotification({ type: 'error', message: 'حدث خطأ أثناء إلغاء التجميد' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Teaching staff without accounts
  const teachingStaff = employees.filter(e => e.isTeachingStaff || e.jobTitle?.includes('معلم') || e.department === 'هيئة التدريس');
  const staffWithoutAccounts = teachingStaff.filter(
    e => !accounts.some(a => a.employeeId === e.id)
  );

  // Filtered accounts
  const filteredAccounts = accounts.filter(a => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      a.teacherName.toLowerCase().includes(q) ||
      a.username.toLowerCase().includes(q) ||
      (a.teacherCode && a.teacherCode.toLowerCase().includes(q)) ||
      (a.department && a.department.toLowerCase().includes(q))
    );
  });

  const activeCount = accounts.filter(a => a.status === 'Active' && a.isActive !== false).length;
  const disabledCount = accounts.filter(a => a.status === 'Disabled' || a.status === 'Suspended').length;
  const lockedCount = accounts.filter(a => {
    if (!a.lockedUntil) return false;
    return new Date(a.lockedUntil).getTime() > Date.now();
  }).length;

  return (
    <div dir="rtl" className="space-y-6">
      {/* Top Banner & Action */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <GraduationCap className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-slate-900">
              إدارة حسابات المعلمين وبوابة المعلم المستقلة
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            إنشاء وإدارة حسابات المعلمين المستقلة، كلمات المرور المؤقتة، وإعادة التعيين مع عزل كامل عن نظام ERP الإداري.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>إنشاء حساب معلم جديد</span>
          </button>
        )}
      </div>

      {/* Security Policies Box */}
      <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 text-xs text-indigo-950 space-y-2">
        <div className="font-bold flex items-center gap-2 text-indigo-900">
          <ShieldCheck className="w-4 h-4 text-indigo-700" />
          <span>قواعد الأمان الصارمة لحسابات المعلمين (Strict Security Policies)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] text-indigo-900/80">
          <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
            <span className="font-bold block text-indigo-950">اسم المستخدم (Username)</span>
            فريد وحصري دون حساسية للأحرف، بدون استخدام رموز PIN.
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
            <span className="font-bold block text-indigo-950">التشفير والملح (Salt + Hash)</span>
            الخادم فقط يتولى تشفير كلمة المرور عبر PBKDF2، ولا تُخزن كنص واضح.
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
            <span className="font-bold block text-indigo-950">تجميد الحساب (Lockout)</span>
            5 محاولات فاشلة تؤدي تلقائياً لقفل الحساب لمدة 15 دقيقة لحمايته من التخمين.
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
            <span className="font-bold block text-indigo-950">إلغاء الجلسات (Revocation)</span>
            إعادة تعيين كلمة المرور أو التعطيل يبطل فوراً كافة الجلسات المفتوحة (Sessions).
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl border text-xs font-bold flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-bold block">إجمالي حسابات المعلمين</span>
          <span className="text-xl font-bold text-slate-800 font-mono mt-1 block">
            {accounts.length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-emerald-600 font-bold block">الحسابات النشطة</span>
          <span className="text-xl font-bold text-emerald-700 font-mono mt-1 block">
            {activeCount}
          </span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-bold block">الحسابات المعطلة</span>
          <span className="text-xl font-bold text-slate-600 font-mono mt-1 block">
            {disabledCount}
          </span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-rose-600 font-bold block">الحسابات المجمدة (15 دقيقة)</span>
          <span className="text-xl font-bold text-rose-700 font-mono mt-1 block">
            {lockedCount}
          </span>
        </div>
      </div>

      {/* Search and Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="البحث بالاسم أو اسم المستخدم..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
            />
          </div>

          <span className="text-xs text-slate-500 font-bold">
            عدد الحسابات: {filteredAccounts.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">المعلم</th>
                <th className="p-3.5">اسم المستخدم (Username)</th>
                <th className="p-3.5">كود المعلم</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">محاولات الدخول</th>
                <th className="p-3.5 text-center">الإجراءات الأمنية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    لا توجد حسابات معلمين مطابقة لبحثك.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map(account => {
                  const isLocked = account.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now();
                  const isActive = account.status === 'Active' && account.isActive !== false;

                  return (
                    <tr key={account.id} className="hover:bg-slate-50/50 transition">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{account.teacherName}</div>
                        <div className="text-[10px] text-slate-400">{account.department || 'هيئة التدريس'}</div>
                      </td>
                      <td className="p-3.5 font-mono text-indigo-700 font-bold text-xs">
                        @{account.username}
                      </td>
                      <td className="p-3.5 font-mono text-slate-600">
                        {account.teacherCode || '-'}
                      </td>
                      <td className="p-3.5">
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                            <Clock className="w-3 h-3" />
                            <span>مجمد 15 دقيقة</span>
                          </span>
                        ) : isActive ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                            <UserCheck className="w-3 h-3" />
                            <span>نشط</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                            <UserX className="w-3 h-3" />
                            <span>معطل</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono">
                        <span className={account.failedLoginAttempts ? 'text-rose-600 font-bold' : 'text-slate-400'}>
                          {account.failedLoginAttempts || 0} / 5
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-2">
                          {isLocked && (
                            <button
                              type="button"
                              onClick={() => handleUnlockAccount(account)}
                              className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-bold rounded-lg transition"
                              title="إلغاء تجميد الحساب فوراً"
                            >
                              إلغاء التجميد
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openResetModal(account)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-200 transition"
                            title="إعادة تعيين كلمة المرور وإلغاء كل الجلسات"
                          >
                            <KeyRound className="w-3 h-3 text-amber-600" />
                            <span>Reset Password</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleStatus(account)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${
                              isActive
                                ? 'bg-slate-50 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border-slate-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {isActive ? (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>تعطيل</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>تنشيط</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE TEACHER ACCOUNT MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </span>
                <h3 className="text-base font-bold text-slate-900">إنشاء حساب جديد للمعلم</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  اختر المعلم من السجلات المدرسية
                </label>
                <select
                  required
                  value={selectedEmployeeId}
                  onChange={e => handleSelectEmployee(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="">-- اختر المعلم --</option>
                  {staffWithoutAccounts.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.specialization || emp.department || 'هيئة التدريس'})
                    </option>
                  ))}
                </select>
                {staffWithoutAccounts.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    جميع المعلمين المسجلين لديهم حسابات بالفعل.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  اسم المستخدم للمعلم (Username فريد)
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-2.5 text-slate-400 font-mono">@</span>
                  <input
                    type="text"
                    required
                    value={createUsername}
                    onChange={e => setCreateUsername(e.target.value)}
                    placeholder="مثال: ahmed.hassan"
                    className="w-full pr-8 pl-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  غير حساس لحالة الأحرف (Case-insensitive) وخاص ببوابة المعلم فقط.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700">
                    كلمة المرور المؤقتة (Temporary Password)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreateTempPassword(generateRandomPassword())}
                    className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>توليد كلمة عشوائية</span>
                  </button>
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    required
                    value={createTempPassword}
                    onChange={e => setCreateTempPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pr-3 pl-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute left-3 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  يتم تشفير كلمة المرور في الخادم عبر PBKDF2 فور الإنشاء، ولن تظهر في المتصفح بعد إغلاق النافذة.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !selectedEmployeeId}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <span>جاري التشفير والإنشاء...</span>
                  ) : (
                    <span>إنشاء الحساب وتشفيره</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {isResetModalOpen && resetTargetAccount && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <KeyRound className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">إعادة تعيين كلمة المرور</h3>
                  <p className="text-xs text-slate-500">{resetTargetAccount.teacherName} (@{resetTargetAccount.username})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <span className="font-bold block">إجراء أمني إجباري:</span>
              <span>سيتم فوراً إبطال وإلغاء كافة الجلسات المفتوحة (Sessions) لهذا المعلم وإلغاء أي تجميد نشط.</span>
            </div>

            <form onSubmit={handleResetSubmit} className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-slate-700">
                    كلمة المرور المؤقتة الجديدة
                  </label>
                  <button
                    type="button"
                    onClick={() => setResetTempPassword(generateRandomPassword())}
                    className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>توليد كلمة عشوائية</span>
                  </button>
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    value={resetTempPassword}
                    onChange={e => setResetTempPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pr-3 pl-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute left-3 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <span>جاري التعيين وإلغاء الجلسات...</span>
                  ) : (
                    <span>تأكيد إعادة التعيين</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREDENTIALS SUMMARY / PRINT POPUP */}
      {createdSummary && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">بيانات دخول المعلم المعتمدة</h3>
              <p className="text-xs text-slate-500">
                يرجى تسليم هذه البيانات للمعلم للدخول عبر بوابة المعلم. لن تظهر كلمة المرور مرة أخرى.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500 font-bold">المعلم:</span>
                <span className="text-slate-900 font-bold">{createdSummary.teacherName}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500 font-bold">اسم المستخدم:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-indigo-700">@{createdSummary.username}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(createdSummary.username, 'usr')}
                    className="p-1 text-slate-400 hover:text-slate-600"
                    title="نسخ"
                  >
                    {copiedField === 'usr' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">كلمة المرور المؤقتة:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300">
                    {createdSummary.tempPassword}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(createdSummary.tempPassword, 'pwd')}
                    className="p-1 text-slate-400 hover:text-slate-600"
                    title="نسخ"
                  >
                    {copiedField === 'pwd' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الإشعار</span>
              </button>
              <button
                type="button"
                onClick={() => setCreatedSummary(null)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
              >
                تم الحفظ والإغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
