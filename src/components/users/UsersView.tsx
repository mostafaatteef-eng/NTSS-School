import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { CanonicalStaffRole, School, User } from '../../types';
import { hasPermission, ROLE_DISPLAY_NAMES } from '../../utils/permissions';
import { schoolAdminService } from '../../services/schoolAdminService';
import { userAdminService } from '../../services/userAdminService';
import { TeacherAccountsManager } from './TeacherAccountsManager';

interface UsersViewProps {
  users: User[];
  currentUser: User | null;
}

type FormState = {
  fullName: string;
  email: string;
  username: string;
  role: CanonicalStaffRole;
  schoolId: string;
  allowedSchoolIds: string[];
  department: string;
  password: string;
};

const EMPTY_FORM: FormState = {
  fullName: '',
  email: '',
  username: '',
  role: 'TeacherAffairs',
  schoolId: '',
  allowedSchoolIds: [],
  department: '',
  password: '',
};

const ADMINISTRATIVE_ROLES: CanonicalStaffRole[] = [
  'SystemAdmin',
  'SchoolAdmin',
  'SchoolDirector',
  'StudentAffairs',
  'TeacherAffairs',
  'QualityOfficer',
  'TrainingOfficer',
  'SocialSpecialist',
  'AdministrativeEmployee',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const UsersView: React.FC<UsersViewProps> = ({ currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<'staff' | 'teachers'>('staff');
  const [managedUsers, setManagedUsers] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [modalError, setModalError] = useState('');

  const isSystemAdmin = currentUser?.role === 'SystemAdmin' && currentUser?.accessScope === 'GLOBAL';
  const isSchoolAdmin = currentUser?.role === 'SchoolAdmin' && currentUser?.accessScope === 'SCHOOL';
  const canView = hasPermission(currentUser, 'users.view');
  const canCreate = hasPermission(currentUser, 'users.create');
  const canEdit = hasPermission(currentUser, 'users.edit');
  const canDisable = hasPermission(currentUser, 'users.disable');
  const canReset = hasPermission(currentUser, 'users.resetPassword');
  const canManageRoles = hasPermission(currentUser, 'users.manageRoles');
  const canDelete = hasPermission(currentUser, 'users.manage');

  const loadUsers = useCallback(async () => {
    if (!canView || !currentUser) {
      setManagedUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setPageError('');
    const res = await userAdminService.getUsers(currentUser);
    if (res.success) {
      setManagedUsers(res.data || []);
    } else {
      setManagedUsers([]);
      setPageError(res.message || 'تعذر تحميل حسابات المستخدمين.');
    }
    setLoading(false);
  }, [canView, currentUser]);

  const loadSchools = useCallback(async () => {
    if (!isSystemAdmin || !currentUser) {
      setSchools([]);
      return;
    }
    const res = await schoolAdminService.getManagedSchools(currentUser);
    if (res.success) {
      const allowed = new Set((currentUser.allowedSchoolIds || []).map(id => id.trim().toUpperCase()));
      setSchools((res.data || []).filter(s => allowed.has(s.schoolId.toUpperCase())));
    }
  }, [currentUser, isSystemAdmin]);

  useEffect(() => {
    void loadUsers();
    void loadSchools();
  }, [loadUsers, loadSchools]);

  const schoolName = useCallback((schoolId?: string) => {
    if (!schoolId) return 'مركزي';
    const school = schools.find(s => s.schoolId === schoolId);
    if (school) return school.schoolName;
    if (isSchoolAdmin && schoolId === currentUser?.schoolId) return schoolId;
    return schoolId;
  }, [currentUser?.schoolId, isSchoolAdmin, schools]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return managedUsers.filter(user => {
      const matchesSearch =
        !q ||
        String(user.fullName || '').toLowerCase().includes(q) ||
        String(user.email || '').toLowerCase().includes(q) ||
        String(user.username || '').toLowerCase().includes(q);
      const matchesRole = !roleFilter || user.role === roleFilter;
      const matchesStatus = !statusFilter || (user.status || 'Active') === statusFilter;
      const matchesSchool = !schoolFilter || user.schoolId === schoolFilter;
      return matchesSearch && matchesRole && matchesStatus && matchesSchool;
    });
  }, [managedUsers, roleFilter, schoolFilter, search, statusFilter]);

  const activeCount = managedUsers.filter(u => (u.status || 'Active') === 'Active').length;
  const disabledCount = managedUsers.length - activeCount;

  const allowedRoleOptions = useMemo(
    () => ADMINISTRATIVE_ROLES.filter(role => role !== 'SystemAdmin' || (isSystemAdmin && canManageRoles)),
    [canManageRoles, isSystemAdmin]
  );

  const openAdd = () => {
    const defaultSchool = isSchoolAdmin ? String(currentUser?.schoolId || '') : '';
    setEditingUser(null);
    setForm({ ...EMPTY_FORM, schoolId: defaultSchool });
    setModalError('');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const openEdit = (user: User) => {
    const role = ADMINISTRATIVE_ROLES.includes(user.role as CanonicalStaffRole)
      ? (user.role as CanonicalStaffRole)
      : 'TeacherAffairs';
    setEditingUser(user);
    setForm({
      fullName: user.fullName || '',
      email: user.email || '',
      username: user.username || '',
      role,
      schoolId: user.schoolId || '',
      allowedSchoolIds: user.allowedSchoolIds || [],
      department: user.department || '',
      password: '',
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const validateForm = () => {
    if (!form.fullName.trim() || !form.username.trim()) return 'الاسم الكامل واسم المستخدم مطلوبان.';
    if (!editingUser) {
      const email = form.email.trim().toLowerCase();
      if (!email) return 'البريد الإلكتروني مطلوب.';
      if (!EMAIL_RE.test(email)) return 'صيغة البريد الإلكتروني غير صالحة.';
      if (form.password.length < 8) return 'كلمة المرور يجب ألا تقل عن 8 أحرف.';
    }
    if (form.role !== 'SystemAdmin') {
      const targetSchool = isSchoolAdmin ? currentUser?.schoolId : form.schoolId;
      if (!targetSchool) return 'يجب اختيار المدرسة للحساب المدرسي.';
    }
    if (form.role === 'SystemAdmin' && form.allowedSchoolIds.length === 0) {
      return 'حدد مدرسة واحدة على الأقل ضمن نطاق مدير النظام.';
    }
    return '';
  };

  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser) return;
    const validation = validateForm();
    if (validation) {
      setModalError(validation);
      return;
    }
    setSaving(true);
    setModalError('');
    setNotice('');

    const targetSchoolId =
      form.role === 'SystemAdmin'
        ? undefined
        : isSchoolAdmin
          ? currentUser.schoolId
          : form.schoolId;

    const result = editingUser
      ? await userAdminService.updateUser({
          id: editingUser.id,
          username: form.username,
          fullName: form.fullName,
          role: canManageRoles ? form.role : undefined,
          department: form.department,
          schoolId: editingUser.schoolId,
          allowedSchoolIds: form.role === 'SystemAdmin' ? form.allowedSchoolIds : undefined,
        }, currentUser)
      : await userAdminService.createUser({
          email: form.email,
          username: form.username,
          fullName: form.fullName,
          role: form.role,
          password: form.password,
          department: form.department,
          schoolId: targetSchoolId,
          allowedSchoolIds: form.role === 'SystemAdmin' ? form.allowedSchoolIds : undefined,
        }, currentUser);

    setSaving(false);
    if (!result.success) {
      setModalError(result.message || 'تعذر حفظ المستخدم.');
      return;
    }

    setForm(EMPTY_FORM);
    setIsModalOpen(false);
    setNotice(editingUser ? 'تم تحديث حساب المستخدم بنجاح.' : 'تم إنشاء حساب المستخدم بنجاح.');
    await loadUsers();
  };

  const mutateAndRefresh = async (operation: () => Promise<{ success: boolean; message?: string }>, successMessage: string) => {
    setSaving(true);
    setPageError('');
    setNotice('');
    const res = await operation();
    setSaving(false);
    if (!res.success) {
      setPageError(res.message || 'تعذر تنفيذ العملية.');
      return;
    }
    setNotice(successMessage);
    await loadUsers();
  };

  const handleDelete = async (user: User) => {
    if (!currentUser || !window.confirm(`هل تريد حذف حساب ${user.fullName}؟`)) return;
    await mutateAndRefresh(() => userAdminService.deleteUser(user.id, currentUser), 'تم حذف الحساب بنجاح.');
  };

  const handleStatus = async (user: User) => {
    if (!currentUser) return;
    const active = (user.status || 'Active') === 'Active';
    const next = active ? 'Suspended' : 'Active';
    if (!window.confirm(`هل تريد ${active ? 'تعطيل' : 'تنشيط'} حساب ${user.fullName}؟`)) return;
    await mutateAndRefresh(
      () => userAdminService.setStatus(user.id, next, currentUser),
      `تم ${active ? 'تعطيل' : 'تنشيط'} الحساب بنجاح.`
    );
  };

  const handleRevoke = async (user: User) => {
    if (!currentUser || !window.confirm(`هل تريد إنهاء جميع جلسات ${user.fullName}؟`)) return;
    await mutateAndRefresh(() => userAdminService.revokeSessions(user.id, currentUser), 'تم إنهاء الجلسات بنجاح.');
  };

  const openReset = (user: User) => {
    setResetTarget(user);
    setNewPassword('');
    setModalError('');
    setShowPassword(false);
    setIsResetModalOpen(true);
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser || !resetTarget) return;
    if (newPassword.trim().length < 8) {
      setModalError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.');
      return;
    }
    setSaving(true);
    const res = await userAdminService.resetPassword(resetTarget.id, newPassword, currentUser);
    setSaving(false);
    setNewPassword('');
    if (!res.success) {
      setModalError(res.message || 'تعذر إعادة تعيين كلمة المرور.');
      return;
    }
    setIsResetModalOpen(false);
    setResetTarget(null);
    setNotice('تمت إعادة تعيين كلمة المرور بنجاح.');
    await loadUsers();
  };

  const toggleAllowedSchool = (schoolId: string) => {
    setForm(prev => ({
      ...prev,
      allowedSchoolIds: prev.allowedSchoolIds.includes(schoolId)
        ? prev.allowedSchoolIds.filter(id => id !== schoolId)
        : [...prev.allowedSchoolIds, schoolId],
    }));
  };

  const statusBadge = (status?: string) => {
    const active = (status || 'Active') === 'Active';
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}>
        {active ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
        {active ? 'نشط' : 'معطل'}
      </span>
    );
  };

  if (activeSubTab === 'teachers') {
    return (
      <div className="space-y-5" dir="rtl">
        <SubTabs active={activeSubTab} setActive={setActiveSubTab} />
        <TeacherAccountsManager currentUserRole={currentUser?.role as string | undefined} />
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <SubTabs active={activeSubTab} setActive={setActiveSubTab} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <ShieldCheck className="h-5 w-5 text-[#008e8b]" />
              إدارة مستخدمي النظام
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              إدارة الحسابات تتم من خلال الخادم المعتمد مع تطبيق الصلاحيات ونطاق المدرسة.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadUsers()}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
            {canCreate && (
              <button
                id="btn-add-system-user"
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-2 rounded-xl bg-[#008e8b] px-4 py-2 text-xs font-bold text-white hover:bg-[#007875]"
              >
                <Plus className="h-4 w-4" />
                إضافة مستخدم
              </button>
            )}
          </div>
        </div>
      </section>

      {!canView && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          لا تملك صلاحية عرض أو إدارة حسابات المستخدمين.
        </div>
      )}

      {pageError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{pageError}</span>
          <button type="button" onClick={() => void loadUsers()} className="font-bold underline">إعادة المحاولة</button>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />{notice}
        </div>
      )}

      {canView && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard label="إجمالي المستخدمين" value={managedUsers.length} />
            <SummaryCard label="النشطون" value={activeCount} />
            <SummaryCard label="المعطلون" value={disabledCount} />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <label className="relative lg:col-span-1">
                <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="بحث بالاسم أو البريد أو اسم المستخدم"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pr-9 pl-3 text-sm outline-none focus:border-[#008e8b]"
                />
              </label>
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="">كل الأدوار</option>
                {ADMINISTRATIVE_ROLES.map(r => <option key={r} value={r}>{ROLE_DISPLAY_NAMES[r]}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="">كل الحالات</option>
                <option value="Active">نشط</option>
                <option value="Inactive">غير نشط</option>
                <option value="Suspended">معطل</option>
              </select>
              {isSystemAdmin ? (
                <select value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                  <option value="">كل المدارس</option>
                  {schools.map(s => <option key={s.schoolId} value={s.schoolId}>{s.schoolName}</option>)}
                </select>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                  المدرسة: {currentUser?.schoolId || '—'}
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex min-h-48 items-center justify-center text-sm text-slate-500">
                <RefreshCw className="ml-2 h-4 w-4 animate-spin" /> جارٍ تحميل المستخدمين...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center text-sm text-slate-500">
                لا توجد حسابات مستخدمين ضمن نطاق الصلاحية الحالي.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-right text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3">الاسم</th>
                      <th className="px-4 py-3">البريد الإلكتروني</th>
                      <th className="px-4 py-3">اسم المستخدم</th>
                      <th className="px-4 py-3">الدور</th>
                      <th className="px-4 py-3">المدرسة / النطاق</th>
                      <th className="px-4 py-3">الحالة</th>
                      <th className="px-4 py-3">آخر دخول</th>
                      <th className="px-4 py-3">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map(user => (
                      <tr key={user.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-bold text-slate-800">{user.fullName}</td>
                        <td className="px-4 py-3 text-slate-600">{user.email || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{user.username || '—'}</td>
                        <td className="px-4 py-3 text-slate-700">{ROLE_DISPLAY_NAMES[user.role as keyof typeof ROLE_DISPLAY_NAMES] || String(user.role)}</td>
                        <td className="px-4 py-3 text-slate-600">{user.accessScope === 'GLOBAL' ? 'مركزي' : schoolName(user.schoolId)}</td>
                        <td className="px-4 py-3">{statusBadge(user.status)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{user.lastLogin || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {canEdit && (
                              <button type="button" onClick={() => openEdit(user)} title="تعديل" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><Edit2 className="h-4 w-4" /></button>
                            )}
                            {canReset && (
                              <button type="button" onClick={() => openReset(user)} title="إعادة تعيين كلمة المرور" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><KeyRound className="h-4 w-4" /></button>
                            )}
                            {canDisable && (
                              <button type="button" onClick={() => void handleStatus(user)} title="تغيير الحالة" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
                                {(user.status || 'Active') === 'Active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                              </button>
                            )}
                            {canDelete && (
                              <button type="button" onClick={() => void handleRevoke(user)} title="إنهاء الجلسات" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><LogOut className="h-4 w-4" /></button>
                            )}
                            {canDelete && (
                              <button type="button" onClick={() => void handleDelete(user)} title="حذف" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={saveUser} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{editingUser ? 'تعديل حساب مستخدم' : 'إضافة مستخدم جديد'}</h3>
                <p className="mt-1 text-xs text-slate-500">الصلاحيات ونطاق المدرسة يتحقق منهما الخادم بشكل نهائي.</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            {modalError && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{modalError}</div>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="الاسم الكامل">
                <input value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} className="input-base" required />
              </Field>
              <Field label="البريد الإلكتروني">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value.toLowerCase() }))}
                  className="input-base disabled:bg-slate-100"
                  required={!editingUser}
                  readOnly={Boolean(editingUser)}
                  disabled={Boolean(editingUser)}
                />
              </Field>
              <Field label="اسم المستخدم">
                <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase() }))} className="input-base" required />
              </Field>
              <Field label="الدور">
                <select
                  value={form.role}
                  onChange={e => setForm(p => ({ ...p, role: e.target.value as CanonicalStaffRole, schoolId: e.target.value === 'SystemAdmin' ? '' : p.schoolId }))}
                  className="input-base"
                  disabled={Boolean(editingUser && !canManageRoles)}
                >
                  {allowedRoleOptions.map(r => <option key={r} value={r}>{ROLE_DISPLAY_NAMES[r]}</option>)}
                </select>
              </Field>

              {form.role === 'SystemAdmin' && isSystemAdmin ? (
                <div className="sm:col-span-2">
                  <div className="mb-2 text-xs font-bold text-slate-700">المدارس المسموح بها</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {schools.map(s => (
                      <label key={s.schoolId} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm">
                        <input type="checkbox" checked={form.allowedSchoolIds.includes(s.schoolId)} onChange={() => toggleAllowedSchool(s.schoolId)} />
                        <span>{s.schoolName}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <Field label="المدرسة">
                  {editingUser || isSchoolAdmin ? (
                    <div className="input-base bg-slate-50 text-slate-600">{schoolName(editingUser?.schoolId || currentUser?.schoolId)}</div>
                  ) : (
                    <select value={form.schoolId} onChange={e => setForm(p => ({ ...p, schoolId: e.target.value }))} className="input-base" required>
                      <option value="">اختر المدرسة</option>
                      {schools.map(s => <option key={s.schoolId} value={s.schoolId}>{s.schoolName}</option>)}
                    </select>
                  )}
                </Field>
              )}

              <Field label="القسم">
                <input value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="input-base" />
              </Field>

              {!editingUser && (
                <Field label="كلمة المرور">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      className="input-base pl-10"
                      autoComplete="new-password"
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute left-3 top-2.5 text-slate-400">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">إلغاء</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-[#008e8b] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                {saving ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isResetModalOpen && resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={resetPassword} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">إعادة تعيين كلمة المرور</h3>
                <p className="mt-1 text-xs text-slate-500">{resetTarget.fullName}</p>
              </div>
              <button type="button" onClick={() => { setIsResetModalOpen(false); setNewPassword(''); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            {modalError && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{modalError}</div>}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="input-base pl-10"
                placeholder="كلمة المرور الجديدة"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute left-3 top-2.5 text-slate-400">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setIsResetModalOpen(false); setNewPassword(''); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">إلغاء</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-[#008e8b] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {saving ? 'جارٍ التنفيذ...' : 'تأكيد'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-xs font-bold text-slate-500">{label}</div>
    <div className="mt-2 text-2xl font-black text-slate-900">{value.toLocaleString('ar-EG')}</div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="space-y-1.5">
    <span className="text-xs font-bold text-slate-700">{label}</span>
    {children}
  </label>
);

const SubTabs: React.FC<{
  active: 'staff' | 'teachers';
  setActive: (value: 'staff' | 'teachers') => void;
}> = ({ active, setActive }) => (
  <div className="flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 text-xs font-bold">
    <button type="button" onClick={() => setActive('staff')} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${active === 'staff' ? 'bg-white text-[#008e8b] shadow-sm' : 'text-slate-600'}`}>
      <Users className="h-4 w-4" /> مستخدمو النظام الإداري
    </button>
    <button type="button" onClick={() => setActive('teachers')} className={`flex items-center gap-2 rounded-xl px-4 py-2 ${active === 'teachers' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'}`}>
      <GraduationCap className="h-4 w-4" /> حسابات المعلمين
    </button>
  </div>
);
