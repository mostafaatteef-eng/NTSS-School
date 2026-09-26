import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  LogIn,
  Mail,
  School,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { User } from '../../types';
import { storageService } from '../../services/storageService';
import { NTSSLogo } from '../common/NTSSLogo';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
  onOpenPublicSchedule?: () => void;
  onOpenTeacherPortal?: () => void;
}

type LoginPortal = 'home' | 'system' | 'staff';

const STAFF_PORTAL_ROLES = new Set([
  'SchoolAdmin',
  'SchoolDirector',
  'StudentAffairs',
  'TeacherAffairs',
  'QualityOfficer',
  'TrainingOfficer',
  'SocialSpecialist',
  'AdministrativeEmployee',
]);

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onOpenPublicSchedule,
  onOpenTeacherPortal,
}) => {
  const [portal, setPortal] = useState<LoginPortal>('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setErrorMessage('');
  };

  const openPortal = (next: LoginPortal) => {
    resetForm();
    setPortal(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (portal !== 'system' && portal !== 'staff') return;

    if (!email.trim()) {
      setErrorMessage('يرجى إدخال البريد الإلكتروني');
      return;
    }

    if (!password) {
      setErrorMessage('يرجى إدخال كلمة المرور');
      return;
    }

    setIsLoading(true);
    try {
      const result = await storageService.login(email.trim(), password);

      if (!result.success || !result.user) {
        setErrorMessage(result.message || 'بيانات الدخول غير صحيحة.');
        return;
      }

      const user = result.user;
      const isSystemAdmin = user.role === 'SystemAdmin' && user.accessScope === 'GLOBAL';

      if (portal === 'system' && !isSystemAdmin) {
        await storageService.logoutStaffSession();
        setErrorMessage('هذا الحساب ليس حساب مدير نظام مركزي. استخدم بوابة إدارة المدرسة والعاملين.');
        return;
      }

      if (portal === 'staff' && !STAFF_PORTAL_ROLES.has(user.role)) {
        await storageService.logoutStaffSession();
        if (user.role === 'SystemAdmin') {
          setErrorMessage('حساب مدير النظام يدخل من بوابة إدارة النظام المركزي.');
        } else if (user.role === 'Teacher') {
          setErrorMessage('حساب المعلم يدخل من بوابة المعلم.');
        } else {
          setErrorMessage('هذا الحساب غير مصرح له بالدخول من بوابة إدارة المدرسة والعاملين.');
        }
        return;
      }

      onLoginSuccess(user);
    } catch {
      setErrorMessage('حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  const portalCards = [
    {
      id: 'system',
      title: 'إدارة النظام المركزي',
      description: 'إدارة المدارس والمستخدمين والمتابعة المركزية والتنقل بين المدارس المصرح بها.',
      action: 'دخول مدير النظام',
      icon: ShieldCheck,
      className: 'border-[#008e8b]/30 bg-[#008e8b]/[0.04] hover:border-[#008e8b]/60',
      iconClass: 'bg-[#008e8b]/10 text-[#008e8b]',
      onClick: () => openPortal('system'),
    },
    {
      id: 'staff',
      title: 'إدارة المدرسة والعاملون',
      description: 'مدير المدرسة والإدارات وشؤون الطلاب والمعلمين والجودة والتدريب والعاملون.',
      action: 'دخول العاملين',
      icon: Building2,
      className: 'border-sky-200 bg-sky-50/50 hover:border-sky-300',
      iconClass: 'bg-sky-100 text-sky-700',
      onClick: () => openPortal('staff'),
    },
    {
      id: 'teacher',
      title: 'بوابة المعلم',
      description: 'الجدول والفصول والواجبات والموارد والطلبات باستخدام حساب المعلم المستقل.',
      action: 'دخول المعلمين',
      icon: GraduationCap,
      className: 'border-indigo-200 bg-indigo-50/50 hover:border-indigo-300',
      iconClass: 'bg-indigo-100 text-indigo-700',
      onClick: onOpenTeacherPortal,
    },
    {
      id: 'student',
      title: 'جدول الطلاب',
      description: 'اختيار المدرسة ثم الصف والفصل لعرض الجدول الدراسي المنشور بدون حساب.',
      action: 'اختيار المدرسة وعرض الجدول',
      icon: CalendarDays,
      className: 'border-amber-200 bg-amber-50/50 hover:border-amber-300',
      iconClass: 'bg-amber-100 text-amber-700',
      onClick: onOpenPublicSchedule,
    },
  ] as const;

  const formTitle = portal === 'system' ? 'دخول مدير النظام' : 'دخول إدارة المدرسة والعاملين';
  const formDescription =
    portal === 'system'
      ? 'يتم تحديد صلاحية GLOBAL والمدارس المسموح بها من الخادم بعد تسجيل الدخول.'
      : 'لا تحتاج لاختيار المدرسة؛ حسابك مرتبط بمدرستك وصلاحياتك من الخادم.';

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full bg-slate-50 text-slate-900 antialiased selection:bg-[#008e8b]/20 selection:text-[#006d6b]"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-slate-200/80 pb-4">
          <NTSSLogo variant="full" size="md" />
          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-[#008e8b]" />
            وصول آمن ومفصول حسب المدرسة والصلاحية
          </div>
        </header>

        <main className="flex flex-1 items-center py-8 sm:py-10">
          {portal === 'home' ? (
            <div className="grid w-full gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
              <section className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#008e8b]/20 bg-[#008e8b]/[0.06] px-3 py-1.5 text-xs font-bold text-[#007775]">
                  <School className="h-4 w-4" />
                  منظومة مدارس إبدأ
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">
                    بوابة واحدة،
                    <br />
                    <span className="text-[#008e8b]">ودخول مناسب لكل مستخدم.</span>
                  </h1>
                  <p className="max-w-xl text-sm leading-7 text-slate-500 sm:text-base">
                    اختر نوع البوابة فقط. النظام لا يطلب منك اختيار دورك أو مدرستك عند تسجيل الدخول؛
                    الخادم يحدد الصلاحية والمدرسة المصرح بها تلقائيًا.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1 text-xs text-slate-500">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="font-extrabold text-slate-800">مدير النظام</div>
                    <div className="mt-1 leading-5">صلاحية مركزية GLOBAL واختيار المدرسة بعد الدخول.</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="font-extrabold text-slate-800">إدارة المدرسة</div>
                    <div className="mt-1 leading-5">مدرسة ثابتة مرتبطة بالحساب ولا يمكن تبديلها.</div>
                  </div>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                {portalCards.map(card => {
                  const Icon = card.icon;
                  const disabled = !card.onClick;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={card.onClick}
                      disabled={disabled}
                      data-testid={`entry-${card.id}`}
                      className={`group min-h-[190px] rounded-3xl border p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${card.className}`}
                    >
                      <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-2xl ${card.iconClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="text-base font-black text-slate-900">{card.title}</div>
                      <p className="mt-2 min-h-[44px] text-xs leading-6 text-slate-500">{card.description}</p>
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                        <span>{card.action}</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
                      </div>
                    </button>
                  );
                })}
              </section>
            </div>
          ) : (
            <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <section className="space-y-5">
                <button
                  type="button"
                  onClick={() => openPortal('home')}
                  className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-slate-900"
                >
                  <ArrowRight className="h-4 w-4" />
                  العودة لاختيار البوابة
                </button>
                <div className="space-y-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                    portal === 'system'
                      ? 'bg-[#008e8b]/10 text-[#008e8b]'
                      : 'bg-sky-100 text-sky-700'
                  }`}>
                    {portal === 'system' ? <ShieldCheck className="h-6 w-6" /> : <UsersRound className="h-6 w-6" />}
                  </div>
                  <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">{formTitle}</h1>
                  <p className="max-w-lg text-sm leading-7 text-slate-500">{formDescription}</p>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)] sm:p-8">
                {errorMessage && (
                  <div className="mb-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <div className="flex-1 leading-relaxed">{errorMessage}</div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="input-email" className="block text-xs font-bold text-slate-700">
                      البريد الإلكتروني
                    </label>
                    <div className="relative flex items-center">
                      <Mail className="pointer-events-none absolute right-3.5 h-4 w-4 text-slate-400" />
                      <input
                        id="input-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="name@school.edu.eg"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-10 text-left text-sm font-medium outline-none transition focus:border-[#008e8b] focus:bg-white focus:ring-2 focus:ring-[#008e8b]/15"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="input-password" className="block text-xs font-bold text-slate-700">
                      كلمة المرور
                    </label>
                    <div className="relative flex items-center">
                      <Lock className="pointer-events-none absolute right-3.5 h-4 w-4 text-slate-400" />
                      <input
                        id="input-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-10 text-sm font-medium outline-none transition focus:border-[#008e8b] focus:bg-white focus:ring-2 focus:ring-[#008e8b]/15"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(value => !value)}
                        className="absolute left-3 rounded-lg p-1 text-slate-400 transition hover:text-slate-700"
                        title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    id="btn-login-submit"
                    type="submit"
                    disabled={isLoading}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#008e8b] px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#007775] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        جارٍ التحقق من الحساب...
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        تسجيل الدخول
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#008e8b]" />
                  <span>
                    نوع الحساب والمدرسة والصلاحيات لا يتم تحديدها من هذه الشاشة؛ يتم اعتمادها من الخادم بعد التحقق من بيانات الدخول.
                  </span>
                </div>
              </section>
            </div>
          )}
        </main>

        <footer className="border-t border-slate-200/80 pt-4 text-center text-[11px] font-medium text-slate-400">
          نظام إدارة مدارس إبدأ المتعدد &copy; {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
};
