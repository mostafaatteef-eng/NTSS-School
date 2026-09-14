import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit2,
  KeyRound,
  Lock,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
  Eye,
  EyeOff,
  Copy,
  Check,
  LogOut,
  Clock,
  Sparkles,
  Printer,
  RefreshCw
} from 'lucide-react';
import { User, UserRole, CANONICAL_STAFF_ROLES, normalizeStaffRole } from '../../types';
import { storageService } from '../../services/storageService';

interface UsersViewProps {
  users: User[];
  currentUser: User | null;
}

export const UsersView: React.FC<UsersViewProps> = ({ users, currentUser }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isActivationModalOpen, setIsActivationModalOpen] = useState(false);
  const [activationDetails, setActivationDetails] = useState<{
    loginNumber?: number | string;
    activationToken?: string;
    expiresAt?: string;
    userFullName?: string;
  } | null>(null);
  const [isCopiedToken, setIsCopiedToken] = useState(false);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Form Fields
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [role, setRole] = useState<UserRole>('TeacherAffairs');
  const [department, setDepartment] = useState('شؤون المعلمين والعاملين');
  const [isActive, setIsActive] = useState(true);

  const isAdmin = currentUser?.role === 'Admin';

  const openAddModal = () => {
    setEditingUser(null);
    setUsername('');
    setFullName('');
    setPassword('');
    setRole('TeacherAffairs');
    setDepartment('شؤون المعلمين والعاملين');
    setIsActive(true);
    setErrorMessage('');
    setSuccessMessage('');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setUsername(u.username);
    setFullName(u.fullName);
    setPassword('');
    try {
      setRole(normalizeStaffRole(u.role));
    } catch {
      setRole('TeacherAffairs');
    }
    setDepartment(u.department || 'الإدارة المدرسية');
    setIsActive(u.status === 'Active' || u.isActive === true);
    setErrorMessage('');
    setSuccessMessage('');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const openResetPasswordModal = (u: User) => {
    setResetTargetUser(u);
    setNewResetPassword('');
    setErrorMessage('');
    setSuccessMessage('');
    setShowPassword(false);
    setIsResetModalOpen(true);
  };

  const handleRoleChange = (selectedRole: UserRole) => {
    setRole(selectedRole);
    switch (selectedRole) {
      case 'Admin':
      case 'SchoolDirector':
        setDepartment('الإدارة العامة والتوجيه');
        break;
      case 'StudentAffairs':
        setDepartment('شؤون الطلاب والقيد');
        break;
      case 'TeacherAffairs':
        setDepartment('شؤون المعلمين والعاملين');
        break;
      case 'SocialSpecialist':
        setDepartment('الرعاية الاجتماعية والانضباط');
        break;
      case 'TrainingOfficer':
        setDepartment('التدريب والتطوير المهني');
        break;
      case 'QualityOfficer':
        setDepartment('الجودة والتقويم المدرسي');
        break;
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!username.trim() || !fullName.trim()) {
      setErrorMessage('اسم المستخدم والاسم الكامل حقول إجبارية');
      return;
    }

    if (!editingUser && (!password.trim() || password.trim().length < 8)) {
      setErrorMessage('كلمة المرور للمستخدم الجديد يجب ألا تقل عن 8 خانات');
      return;
    }

    if (editingUser && password.trim() && password.trim().length < 8) {
      setErrorMessage('كلمة المرور الجديدة يجب ألا تقل عن 8 خانات');
      return;
    }

    try {
      const canonicalRole = normalizeStaffRole(role);
      const userToSave: User = {
        id: editingUser?.id || `USR-${Date.now()}`,
        username: username.trim().toLowerCase(),
        fullName: fullName.trim(),
        email: editingUser?.email || `${username.trim().toLowerCase()}@ntss-schools.edu.eg`,
        role: canonicalRole,
        department: department.trim() || 'الإدارة المدرسية',
        isActive,
        status: isActive ? 'Active' : 'Inactive',
        createdAt: editingUser?.createdAt || new Date().toISOString().split('T')[0]
      };

      const res = await storageService.saveUserSecure(userToSave, password.trim() || undefined);
      if (res.success) {
        setIsModalOpen(false);
      } else {
        setErrorMessage(res.message || 'حدث خطأ أثناء حفظ المستخدم');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل التحقق من الدور الإداري المعتمد');
    }
  };

  const handleExecutePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setErrorMessage('');
    setSuccessMessage('');

    if (!newResetPassword.trim() || newResetPassword.trim().length < 8) {
      setErrorMessage('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف وأرقام');
      return;
    }

    const res = await storageService.resetUserPassword(resetTargetUser.id, newResetPassword.trim());
    if (res.success) {
      setSuccessMessage('تمت إعادة تعيين وتشفير كلمة المرور بنجاح في الخادم المعتمد');
      setTimeout(() => {
        setIsResetModalOpen(false);
      }, 1200);
    } else {
      setErrorMessage(res.message || 'فشل إعادة تعيين كلمة المرور');
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (u.id === currentUser?.id || u.username === currentUser?.username) {
      alert('إجراء محظور: لا يمكنك حذف حسابك الشخصي المسجل به حالياً.');
      return;
    }

    if (window.confirm(`تأكيد أمني: هل أنت متأكد من رغبتك في حذف حساب المستخدم (${u.fullName} - @${u.username})؟`)) {
      const res = await storageService.deleteUser(u.id);
      if (!res.success) {
        alert(res.message || 'تعذر حذف حساب المستخدم');
      }
    }
  };

  const handleIssueActivationToken = async (u: User) => {
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await storageService.issueUserActivationToken(u.id);
      if (res.success && res.activationToken) {
        setActivationDetails({
          loginNumber: res.loginNumber || u.loginNumber,
          activationToken: res.activationToken,
          expiresAt: res.expiresAt,
          userFullName: u.fullName,
        });
        setIsActivationModalOpen(true);
        setIsCopiedToken(false);
        setSuccessMessage(`تم إصدار كود التفعيل للمستخدم ${u.fullName} بنجاح.`);
      } else {
        setErrorMessage(res.message || 'فشل إصدار كود التفعيل');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطأ أثناء إصدار كود التفعيل');
    }
  };

  const handleResetToPending = async (u: User) => {
    if (u.id === currentUser?.id || u.username === currentUser?.username) {
      alert('لا يمكنك إعادة تعيين حسابك الشخصي النشط حالياً إلى Pending Setup لتفادي قفل المنظومة.');
      return;
    }

    if (!window.confirm(`تأكيد أمني: هل أنت متأكد من إعادة تعيين حساب (${u.fullName}) إلى وضع Pending Setup؟ سيتم فوراً إلغاء كلمة المرور السابقة وإبطال كافة الجلسات المفتوحة.`)) {
      return;
    }
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await storageService.resetUserToPendingSetup(u.id);
      await storageService.revokeUserSessions(u.id);
      if (res.success) {
        setSuccessMessage(`تم تحويل حساب (${u.fullName}) إلى Pending Setup وإبطال جلساته النشطة.`);
      } else {
        setErrorMessage(res.message || 'فشلت عملية إعادة التعيين');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ');
    }
  };

  const handleRevokeSessions = async (u: User) => {
    if (!window.confirm(`هل تريد تسجيل خروج إجباري وإبطال كافة الجلسات المفتوحة للمستخدم (${u.fullName})؟`)) {
      return;
    }
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await storageService.revokeUserSessions(u.id);
      if (res.success) {
        setSuccessMessage(`تم إبطال جميع جلسات المستخدم (${u.fullName}) فوراً.`);
      } else {
        setErrorMessage(res.message || 'فشل إبطال الجلسات');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ');
    }
  };

  const handleToggleStatus = async (u: User) => {
    if (u.id === currentUser?.id || u.username === currentUser?.username) {
      alert('لا يمكنك تعطيل حسابك الشخصي النشط حالياً.');
      return;
    }
    const isCurrentlyActive = u.status === 'Active' || u.isActive === true;
    const nextStatus = isCurrentlyActive ? 'Suspended' : 'Active';
    const actionLabel = nextStatus === 'Active' ? 'تنشيط' : 'تعطيل';

    if (!window.confirm(`هل أنت متأكد من ${actionLabel} حساب (${u.fullName})؟`)) {
      return;
    }
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await storageService.toggleUserStatus(u.id, nextStatus);
      if (res.success) {
        setSuccessMessage(`تم تغيير حالة الحساب إلى ${nextStatus === 'Active' ? 'نشط' : 'معطل'}`);
      } else {
        setErrorMessage(res.message || 'فشل تغيير الحالة');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ');
    }
  };

  const getRoleBadge = (r: UserRole | string) => {
    switch (r as string) {
      case 'Admin':
        return (
          <span className="bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
            مدير نظام (Admin)
          </span>
        );
      case 'SchoolDirector':
        return (
          <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
            مدير المدرسة (SchoolDirector)
          </span>
        );
      case 'StudentAffairs':
        return (
          <span className="bg-sky-100 text-sky-800 border border-sky-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
            شؤون الطلاب والقيد
          </span>
        );
      case 'TeacherAffairs':
        return (
          <span className="bg-teal-100 text-[#008e8b] border border-teal-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
            شؤون المعلمين والعاملين
          </span>
        );
      case 'SocialSpecialist':
        return (
          <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
            أخصائي اجتماعي / رعاية
          </span>
        );
      case 'TrainingOfficer':
        return (
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
            مسؤول التدريب والتطوير
          </span>
        );
      case 'QualityOfficer':
        return (
          <span className="bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
            مسؤول الجودة والتقويم
          </span>
        );
      default:
        return (
          <span className="bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            دور ملغى ({r})
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#008e8b]" />
            إدارة مستخدمي الإدارة المدرسية والصلاحيات المعتمدة
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            إدارة حسابات الطاقم الإداري المدرسي حصراً مع فرض التحقق والتشفير المعتمد (PBKDF2-HMAC-SHA256)
          </p>
        </div>

        {isAdmin && (
          <button
            id="btn-add-system-user"
            onClick={openAddModal}
            className="text-xs font-bold bg-[#008e8b] hover:bg-[#007775] text-white px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة مستخدم إداري جديد</span>
          </button>
        )}
      </div>

      {/* Authoritative Security & Hashing Banner */}
      <div className="bg-teal-50/80 border border-teal-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-teal-950">
        <Shield className="w-5 h-5 text-[#008e8b] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-slate-900 flex items-center gap-2">
            <span>الحماية المعتمدة لكلمات المرور (Server-Side Salted PBKDF2 Hashing)</span>
            <span className="bg-[#008e8b] text-white text-[10px] px-2 py-0.2 rounded-full font-sans">
              Authoritative Security
            </span>
          </div>
          <p className="text-slate-600 leading-relaxed">
            تُحفظ كلمات المرور في قاعدة البيانات كقيم مشفرة عبر خوارزميات التمليح والتكرار (<span className="font-mono font-bold text-[#008e8b]">PBKDF2-HMAC-SHA256</span> بـ 10,000 دورة). لا يتم تخزين أو نقل كلمات المرور كنصوص واضحة في أي جزء من المتصفح، ويتم التحقق والتشفير دائماً عبر الخادم الخلفي المعتمد.
          </p>
        </div>
      </div>

      {/* Canonical Roles Permission Matrix */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xs">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          الأدوار الإدارية المعتمدة نظامياً (7 Canonical Staff Roles)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-800/90 p-3.5 rounded-xl border border-purple-500/30">
            <div className="font-semibold text-purple-300 mb-1">مدير النظام (Admin)</div>
            <p className="text-slate-400 text-[11px]">
              كامل الصلاحيات: إعدادات النظام، تهيئة الحسابات، إدارة الأمان والرقابة.
            </p>
          </div>
          <div className="bg-slate-800/90 p-3.5 rounded-xl border border-indigo-500/30">
            <div className="font-semibold text-indigo-300 mb-1">مدير المدرسة (SchoolDirector)</div>
            <p className="text-slate-400 text-[11px]">
              الإشراف العام، اعتمادات الجداول المدرسية، تقارير الحضور والغياب المعتمدة.
            </p>
          </div>
          <div className="bg-slate-800/90 p-3.5 rounded-xl border border-sky-500/30">
            <div className="font-semibold text-sky-300 mb-1">شؤون الطلاب (StudentAffairs)</div>
            <p className="text-slate-400 text-[11px]">
              سجلات الطلاب، الحضور اليومي، وإصدار وإلغاء رموز الوصول للجدول المدرسي.
            </p>
          </div>
          <div className="bg-slate-800/90 p-3.5 rounded-xl border border-teal-500/30">
            <div className="font-semibold text-teal-300 mb-1">شؤون المعلمين (TeacherAffairs)</div>
            <p className="text-slate-400 text-[11px]">
              الجداول الأسبوعية، حصص الاحتياطي، الإشراف المدرسي، وإسناد التدريس.
            </p>
          </div>
          <div className="bg-slate-800/90 p-3.5 rounded-xl border border-amber-500/30">
            <div className="font-semibold text-amber-300 mb-1">أخصائي اجتماعي (SocialSpecialist)</div>
            <p className="text-slate-400 text-[11px]">
              المخالفات السلوكية، خطط الرعاية، ودراسات الحالات والتواصل مع أولياء الأمور.
            </p>
          </div>
          <div className="bg-slate-800/90 p-3.5 rounded-xl border border-emerald-500/30">
            <div className="font-semibold text-emerald-300 mb-1">مسؤول التدريب (TrainingOfficer)</div>
            <p className="text-slate-400 text-[11px]">
              متابعة برامج التدريب والتطوير المهني ومؤشرات الأداء بدون صلاحية تعديل.
            </p>
          </div>
          <div className="bg-slate-800/90 p-3.5 rounded-xl border border-blue-500/30">
            <div className="font-semibold text-blue-300 mb-1">مسؤول الجودة (QualityOfficer)</div>
            <p className="text-slate-400 text-[11px]">
              تدقيق ومراجعة الالتزام بالمعايير وسجلات المراقبة دون صلاحية حذف.
            </p>
          </div>
          <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/60 flex items-center justify-center text-center">
            <div className="text-[11px] text-slate-400 font-medium">
              حسابات المعلمين والطلاب ملغاة من تسجيل دخول الإدارة، وتعمل عبر بوابات خاصة مستقلة.
            </div>
          </div>
        </div>
      </div>

      {/* Users List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#008e8b]" />
            <span className="text-xs font-bold text-slate-800">قائمة حسابات موظفي الإدارة المسجلين</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
            {users.length} مستخدم
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5">اسم المستخدم</th>
                <th className="p-3.5">رقم الدخول</th>
                <th className="p-3.5">الاسم الكامل</th>
                <th className="p-3.5">القسم</th>
                <th className="p-3.5">الدور المعتمد</th>
                <th className="p-3.5">إعداد كلمة المرور</th>
                <th className="p-3.5">الحالة</th>
                <th className="p-3.5">آخر تسجيل دخول</th>
                {isAdmin && <th className="p-3.5 text-center">إدارة الحساب والأمان</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {users.map(u => {
                const isCurrent = u.id === currentUser?.id || u.username === currentUser?.username;
                const isUserActive = u.status === 'Active' || u.isActive === true;

                return (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#008e8b]/10 text-[#008e8b] font-bold flex items-center justify-center text-xs">
                          {u.fullName ? u.fullName.charAt(0) : u.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 font-mono">
                            @{u.username}
                            {isCurrent && (
                              <span className="text-[10px] bg-teal-100 text-[#008e8b] px-1.5 py-0.2 rounded font-sans">
                                أنت
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-800">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200 text-xs">
                        {u.loginNumber || '—'}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-800">{u.fullName}</td>
                    <td className="p-3.5 text-slate-600">{u.department || '—'}</td>
                    <td className="p-3.5">{getRoleBadge(u.role)}</td>
                    <td className="p-3.5">
                      {u.passwordInitialized ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          مفعلة (Active)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                          <Clock className="w-3 h-3 text-amber-600" />
                          بانتظار الإعداد الأول
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {isUserActive ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                          <UserCheck className="w-3 h-3" />
                          نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                          <UserX className="w-3 h-3" />
                          معطل
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                      {u.lastLogin ? u.lastLogin.split('T')[0] : '—'}
                    </td>
                    {isAdmin && (
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleIssueActivationToken(u)}
                            className="p-1.5 text-[#008e8b] hover:bg-teal-50 rounded-lg transition cursor-pointer"
                            title="إصدار كود تفعيل لمرة واحدة (Issue Activation Code)"
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetToPending(u)}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                            title="إعادة تعيين إلى وضع Pending Setup وإلغاء كلمة المرور"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openResetPasswordModal(u)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                            title="إعادة تعيين كلمة المرور وتشفيرها"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                            title="تعديل بيانات المستخدم والدور"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevokeSessions(u)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="إبطال كافة الجلسات المفتوحة للمستخدم (Force Logout)"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u)}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              isUserActive
                                ? 'text-amber-500 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={isUserActive ? 'تعطيل الحساب' : 'تنشيط الحساب'}
                          >
                            {isUserActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="حذف الحساب نهائياً"
                            >
                              <Trash2 className="w-4 h-4" />
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
      </div>

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#008e8b]/10 text-[#008e8b] flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingUser ? 'تعديل بيانات مستخدم إداري' : 'إضافة مستخدم إداري جديد'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">اسم المستخدم (Username)</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="مثال: mahmoud.affairs"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#008e8b]/20 focus:border-[#008e8b]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">الاسم الكامل</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="مثال: محمود عبد الرحمن"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#008e8b]/20 focus:border-[#008e8b]"
                  />
                </div>
              </div>

              {!editingUser && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">كلمة المرور الأولية (8 خانات كحد أدنى)</label>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="أدخل كلمة مرور قوية"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#008e8b]/20 focus:border-[#008e8b]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">الدور الإداري المعتمد</label>
                  <select
                    value={role}
                    onChange={e => handleRoleChange(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#008e8b]/20 focus:border-[#008e8b]"
                  >
                    <option value="Admin">مدير النظام (Admin) — كامل الصلاحيات</option>
                    <option value="SchoolDirector">مدير المدرسة (SchoolDirector) — إشراف واعتمادات</option>
                    <option value="StudentAffairs">شؤون الطلاب والقيد (StudentAffairs)</option>
                    <option value="TeacherAffairs">شؤون المعلمين (TeacherAffairs) — الجداول والبدلاء</option>
                    <option value="SocialSpecialist">أخصائي اجتماعي (SocialSpecialist) — السلوك والحالات</option>
                    <option value="TrainingOfficer">مسؤول التدريب (TrainingOfficer) — التطوير المهني</option>
                    <option value="QualityOfficer">مسؤول الجودة (QualityOfficer) — المعايير والتقويم</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">القسم / الإدارة</label>
                  <input
                    type="text"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    placeholder="مثال: شؤون المعلمين والعاملين"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#008e8b]/20 focus:border-[#008e8b]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    className="rounded text-[#008e8b] focus:ring-[#008e8b]"
                  />
                  <span>حساب نشط ومصرح له بالدخول للنظام</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#008e8b] hover:bg-[#007775] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  {editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {isResetModalOpen && resetTargetUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  إعادة تعيين كلمة المرور
                </h3>
              </div>
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-4">
              سيتم تشفير كلمة المرور الجديدة عبر خوارزمية <span className="font-mono font-bold text-[#008e8b]">PBKDF2-HMAC-SHA256</span> وحفظها مباشرة في الخادم المعتمد للمستخدم <span className="font-bold text-slate-800">@{resetTargetUser.username}</span>.
            </p>

            {errorMessage && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleExecutePasswordReset} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">كلمة المرور الجديدة (8 خانات كحد أدنى)</label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newResetPassword}
                    onChange={e => setNewResetPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور الجديدة"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#008e8b]/20 focus:border-[#008e8b]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  تشفير وتحديث كلمة المرور
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-Time Activation Token Modal */}
      {isActivationModalOpen && activationDetails && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-[#008e8b] flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    بطاقة كود تفعيل الحساب (One-Time Activation)
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {activationDetails.userFullName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsActivationModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600">رقم الدخول الثابت:</span>
                  <span className="font-mono font-extrabold text-base text-[#008e8b] bg-white px-3 py-1 rounded-xl border border-teal-200 shadow-xs">
                    {activationDetails.loginNumber}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">كود التفعيل (لأول دخول فقط):</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (activationDetails.activationToken) {
                          navigator.clipboard.writeText(
                            `رقم الدخول: ${activationDetails.loginNumber}\nكود التفعيل: ${activationDetails.activationToken}`
                          );
                          setIsCopiedToken(true);
                          setTimeout(() => setIsCopiedToken(false), 2000);
                        }
                      }}
                      className="text-[11px] font-bold text-[#008e8b] hover:text-[#007775] flex items-center gap-1 cursor-pointer"
                    >
                      {isCopiedToken ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">تم النسخ!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ البيانات</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-3 bg-white border-2 border-teal-500 rounded-xl text-center font-mono font-black text-xl tracking-widest text-slate-900 select-all shadow-inner">
                    {activationDetails.activationToken}
                  </div>
                </div>

                {activationDetails.expiresAt && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      <span>صالح لغاية:</span>
                    </span>
                    <span className="font-mono font-semibold text-slate-700">
                      {new Date(activationDetails.expiresAt).toLocaleString('ar-EG')}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>تعليمات تسليم الكود للمستخدم:</span>
                </div>
                <p>
                  سلّم هذا الكود مع رقم الدخول للموظف/المعلم شخصياً. عند دخول النظام يختار <strong>"أول دخول للنظام؟ تفعيل الحساب"</strong> ويقوم بتعيين كلمة مروره الخاصة. يُحرق هذا الكود فور الاستخدام.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة الإشعار</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsActivationModalOpen(false)}
                  className="px-4 py-2 bg-[#008e8b] hover:bg-[#007775] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
