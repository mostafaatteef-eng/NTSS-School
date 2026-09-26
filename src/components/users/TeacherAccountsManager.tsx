import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { TeacherAccount, User } from '../../types';
import { hasPermission } from '../../utils/permissions';
import {
  SafeTeachingEmployee,
  teacherAccountAdminService,
} from '../../services/teacherAccountAdminService';

interface TeacherAccountsManagerProps {
  currentUser: User | null;
}

type CredentialSummary = {
  teacherName: string;
  username: string;
  temporaryPassword: string;
};

const generateTemporaryPassword = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789#!@$%';
  const values = new Uint32Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i++) values[i] = Math.floor(Math.random() * 100000);
  }
  return Array.from(values, (value, index) => {
    if (index === 0) return 'A';
    if (index === 1) return 'a';
    if (index === 2) return '7';
    if (index === 3) return '#';
    return alphabet[value % alphabet.length];
  }).join('');
};

export const TeacherAccountsManager: React.FC<TeacherAccountsManagerProps> = ({ currentUser }) => {
  const [accounts, setAccounts] = useState<TeacherAccount[]>([]);
  const [teachingStaff, setTeachingStaff] = useState<SafeTeachingEmployee[]>([]);
  const [effectiveSchoolId, setEffectiveSchoolId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState('');
  const [notification, setNotification] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [username, setUsername] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<TeacherAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [modalError, setModalError] = useState('');
  const [credentialSummary, setCredentialSummary] = useState<CredentialSummary | null>(null);

  const canManage = hasPermission(currentUser, 'teacherAccounts.manage');
  const isSystemAdmin = currentUser?.role === 'SystemAdmin' && currentUser?.accessScope === 'GLOBAL';

  const loadData = useCallback(async () => {
    if (!currentUser || !canManage) {
      setAccounts([]);
      setTeachingStaff([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setPageError('');
    const result = await teacherAccountAdminService.getBundle(currentUser);

    if (!result.success || !result.data) {
      setAccounts([]);
      setTeachingStaff([]);
      setEffectiveSchoolId('');
      setPageError(result.message || 'تعذر تحميل حسابات المعلمين.');
      setLoading(false);
      return;
    }

    setAccounts(result.data.accounts);
    setTeachingStaff(result.data.teachingStaff);
    setEffectiveSchoolId(result.data.effectiveSchoolId);
    setLoading(false);
  }, [canManage, currentUser]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const accountEmployeeIds = useMemo(
    () => new Set(accounts.map(account => account.employeeId)),
    [accounts]
  );

  const availableTeachers = useMemo(
    () => teachingStaff.filter(employee => !accountEmployeeIds.has(employee.id)),
    [accountEmployeeIds, teachingStaff]
  );

  const filteredAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter(account =>
      String(account.teacherName || '').toLowerCase().includes(query) ||
      String(account.username || '').toLowerCase().includes(query) ||
      String(account.teacherCode || '').toLowerCase().includes(query) ||
      String(account.department || '').toLowerCase().includes(query)
    );
  }, [accounts, searchQuery]);

  const activeCount = accounts.filter(account => account.status === 'Active').length;
  const disabledCount = accounts.filter(account => account.status !== 'Active').length;
  const lockedCount = accounts.filter(account => {
    if (!account.lockedUntil) return false;
    return new Date(account.lockedUntil).getTime() > Date.now();
  }).length;

  const openCreate = () => {
    setSelectedEmployeeId('');
    setUsername('');
    setTemporaryPassword(generateTemporaryPassword());
    setShowPassword(false);
    setModalError('');
    setIsCreateOpen(true);
  };

  const selectTeacher = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    const employee = teachingStaff.find(item => item.id === employeeId);
    const source = employee?.teacherCode || employee?.id || '';
    const safe = source.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    setUsername(safe ? `t_${safe}` : '');
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser) return;

    if (!selectedEmployeeId || !username.trim() || temporaryPassword.trim().length < 8) {
      setModalError('اختر المعلم وأدخل اسم مستخدم وكلمة مرور لا تقل عن 8 أحرف.');
      return;
    }

    const employee = teachingStaff.find(item => item.id === selectedEmployeeId);
    setSaving(true);
    setModalError('');
    setNotification('');

    const result = await teacherAccountAdminService.createAccount(
      selectedEmployeeId,
      username,
      temporaryPassword,
      currentUser
    );

    setSaving(false);
    if (!result.success) {
      setModalError(result.message || 'تعذر إنشاء حساب المعلم.');
      return;
    }

    setCredentialSummary({
      teacherName: employee?.name || selectedEmployeeId,
      username: username.trim().toLowerCase(),
      temporaryPassword,
    });
    setTemporaryPassword('');
    setIsCreateOpen(false);
    setNotification('تم إنشاء حساب المعلم بنجاح من خلال الخادم المعتمد.');
    await loadData();
  };

  const openReset = (account: TeacherAccount) => {
    setResetTarget(account);
    setResetPassword(generateTemporaryPassword());
    setShowPassword(false);
    setModalError('');
    setIsResetOpen(true);
  };

  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser || !resetTarget) return;

    if (resetPassword.trim().length < 8) {
      setModalError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.');
      return;
    }

    const passwordForSummary = resetPassword;
    setSaving(true);
    setModalError('');

    const result = await teacherAccountAdminService.resetPassword(
      resetTarget.employeeId,
      resetPassword,
      currentUser
    );

    setSaving(false);
    setResetPassword('');

    if (!result.success) {
      setModalError(result.message || 'تعذر إعادة تعيين كلمة المرور.');
      return;
    }

    setCredentialSummary({
      teacherName: resetTarget.teacherName,
      username: resetTarget.username,
      temporaryPassword: passwordForSummary,
    });
    setIsResetOpen(false);
    setResetTarget(null);
    setNotification('تمت إعادة تعيين كلمة المرور وإلغاء الجلسات السابقة بنجاح.');
    await loadData();
  };

  const changeStatus = async (account: TeacherAccount) => {
    if (!currentUser) return;
    const isActive = account.status === 'Active';
    const nextStatus = isActive ? 'Suspended' : 'Active';
    const verb = isActive ? 'تعطيل' : 'تنشيط';

    if (!window.confirm(`هل تريد ${verb} حساب المعلم ${account.teacherName}؟`)) return;

    setSaving(true);
    setPageError('');
    setNotification('');

    const result = await teacherAccountAdminService.setStatus(
      account.employeeId,
      nextStatus,
      currentUser
    );

    setSaving(false);
    if (!result.success) {
      setPageError(result.message || 'تعذر تعديل حالة الحساب.');
      return;
    }

    setNotification(`تم ${verb} حساب المعلم بنجاح.`);
    await loadData();
  };

  if (!canManage) {
    return (
      <div dir="rtl" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        لا تملك صلاحية إدارة حسابات المعلمين.
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
                <GraduationCap className="h-5 w-5" />
              </span>
              <h2 className="text-base font-bold text-slate-900">حسابات بوابة المعلمين</h2>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              الحسابات والبيانات تُقرأ وتُعدّل من خلال الخادم المعتمد داخل نطاق المدرسة الحالية فقط.
            </p>
            <div className="mt-2 text-[11px] font-bold text-slate-500">
              نطاق المدرسة: {effectiveSchoolId || (isSystemAdmin ? currentUser?.activeSchoolId || 'لم يتم اختيار مدرسة' : currentUser?.schoolId || '—')}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
            <button
              id="btn-add-teacher-account"
              type="button"
              onClick={openCreate}
              disabled={loading || saving || !effectiveSchoolId}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              إنشاء حساب معلم
            </button>
          </div>
        </div>
      </section>

      {pageError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {pageError}
          </span>
          <button type="button" onClick={() => void loadData()} className="font-bold underline">
            إعادة المحاولة
          </button>
        </div>
      )}

      {notification && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          {notification}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="إجمالي الحسابات" value={accounts.length} />
        <Summary label="الحسابات النشطة" value={activeCount} />
        <Summary label="الحسابات المعطلة" value={disabledCount} />
        <Summary label="المجمدة مؤقتًا" value={lockedCount} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative w-full sm:max-w-sm">
            <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="بحث بالاسم أو اسم المستخدم أو كود المعلم"
              className="w-full rounded-xl border border-slate-200 py-2.5 pr-9 pl-3 text-sm outline-none focus:border-indigo-500"
            />
          </label>
          <div className="text-xs font-bold text-slate-500">
            معلمون بدون حساب: {availableTeachers.length}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center text-sm text-slate-500">
            <RefreshCw className="ml-2 h-4 w-4 animate-spin" />
            جارٍ تحميل حسابات المعلمين...
          </div>
        ) : !pageError && filteredAccounts.length === 0 ? (
          <div className="flex min-h-52 items-center justify-center text-sm text-slate-500">
            لا توجد حسابات معلمين ضمن المدرسة الحالية.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">المعلم</th>
                  <th className="px-4 py-3">اسم المستخدم</th>
                  <th className="px-4 py-3">كود المعلم</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">آخر دخول</th>
                  <th className="px-4 py-3">المحاولات الفاشلة</th>
                  <th className="px-4 py-3">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map(account => {
                  const locked = account.lockedUntil
                    ? new Date(account.lockedUntil).getTime() > Date.now()
                    : false;
                  return (
                    <tr key={account.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{account.teacherName}</div>
                        <div className="text-[11px] text-slate-400">{account.department || 'هيئة التدريس'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{account.username || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{account.teacherCode || account.employeeId}</td>
                      <td className="px-4 py-3">
                        <AccountStatus account={account} locked={locked} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{account.lastLoginAt || '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-600">{account.failedLoginAttempts || 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="إعادة تعيين كلمة المرور"
                            onClick={() => openReset(account)}
                            disabled={saving}
                            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="تغيير حالة الحساب"
                            onClick={() => void changeStatus(account)}
                            disabled={saving}
                            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                          >
                            {account.status === 'Active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isCreateOpen && (
        <Modal title="إنشاء حساب معلم" onClose={() => { setTemporaryPassword(''); setIsCreateOpen(false); }}>
          <form onSubmit={createAccount} className="space-y-4">
            {modalError && <ErrorBox>{modalError}</ErrorBox>}
            <Field label="المعلم">
              <select
                value={selectedEmployeeId}
                onChange={event => selectTeacher(event.target.value)}
                className="input-base"
                required
              >
                <option value="">اختر المعلم</option>
                {availableTeachers.map(employee => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} — {employee.teacherCode}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="اسم المستخدم">
              <input
                value={username}
                onChange={event => setUsername(event.target.value.toLowerCase())}
                className="input-base"
                dir="ltr"
                required
              />
            </Field>
            <Field label="كلمة المرور المؤقتة">
              <PasswordInput
                value={temporaryPassword}
                onChange={setTemporaryPassword}
                visible={showPassword}
                onToggle={() => setShowPassword(value => !value)}
              />
              <button
                type="button"
                onClick={() => setTemporaryPassword(generateTemporaryPassword())}
                className="mt-2 text-xs font-bold text-indigo-600"
              >
                توليد كلمة مرور جديدة
              </button>
            </Field>
            <ModalActions saving={saving} onCancel={() => { setTemporaryPassword(''); setIsCreateOpen(false); }} />
          </form>
        </Modal>
      )}

      {isResetOpen && resetTarget && (
        <Modal title="إعادة تعيين كلمة المرور" onClose={() => { setResetPassword(''); setIsResetOpen(false); }}>
          <form onSubmit={submitReset} className="space-y-4">
            <p className="text-sm text-slate-600">{resetTarget.teacherName}</p>
            {modalError && <ErrorBox>{modalError}</ErrorBox>}
            <Field label="كلمة المرور المؤقتة الجديدة">
              <PasswordInput
                value={resetPassword}
                onChange={setResetPassword}
                visible={showPassword}
                onToggle={() => setShowPassword(value => !value)}
              />
            </Field>
            <ModalActions saving={saving} onCancel={() => { setResetPassword(''); setIsResetOpen(false); }} />
          </form>
        </Modal>
      )}

      {credentialSummary && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-2 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="font-bold">بيانات مؤقتة للتسليم</h3>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              تظهر كلمة المرور في هذه النافذة فقط ولا يتم حفظها في قائمة الحسابات أو التخزين المحلي.
            </p>
            <CredentialRow label="المعلم" value={credentialSummary.teacherName} />
            <CredentialRow label="اسم المستخدم" value={credentialSummary.username} />
            <CredentialRow label="كلمة المرور المؤقتة" value={credentialSummary.temporaryPassword} />
            <button
              type="button"
              onClick={() => setCredentialSummary(null)}
              className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"
            >
              إغلاق وحذف العرض المؤقت
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Summary: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-[11px] font-bold text-slate-500">{label}</div>
    <div className="mt-2 text-2xl font-black text-slate-900">{value.toLocaleString('ar-EG')}</div>
  </div>
);

const AccountStatus: React.FC<{ account: TeacherAccount; locked: boolean }> = ({ account, locked }) => {
  if (locked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700">
        <Lock className="h-3.5 w-3.5" /> مجمد مؤقتًا
      </span>
    );
  }

  const active = account.status === 'Active';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
      active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
    }`}>
      {active ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
      {active ? 'نشط' : 'معطل'}
    </span>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-bold text-slate-900">{title}</h3>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-bold text-slate-700">{label}</span>
    {children}
  </label>
);

const ErrorBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{children}</div>
);

const PasswordInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
}> = ({ value, onChange, visible, onToggle }) => (
  <div className="relative">
    <input
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="input-base pl-10"
      autoComplete="new-password"
      required
    />
    <button type="button" onClick={onToggle} className="absolute left-3 top-2.5 text-slate-400">
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  </div>
);

const ModalActions: React.FC<{ saving: boolean; onCancel: () => void }> = ({ saving, onCancel }) => (
  <div className="flex justify-end gap-2 pt-2">
    <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">
      إلغاء
    </button>
    <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
      {saving ? 'جارٍ التنفيذ...' : 'حفظ'}
    </button>
  </div>
);

const CredentialRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="text-[10px] font-bold text-slate-500">{label}</div>
    <div className="mt-1 break-all font-mono text-sm font-bold text-slate-900">{value}</div>
  </div>
);
