import React, { useState } from 'react';
import {
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  X,
  Sparkles,
  CalendarDays,
  GraduationCap
} from 'lucide-react';
import { User } from '../../types';
import { storageService } from '../../services/storageService';
import { NTSSLogo } from '../common/NTSSLogo';
import { FirstLoginSetupModal } from './FirstLoginSetupModal';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
  onOpenPublicSchedule?: () => void;
  onOpenTeacherPortal?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onOpenPublicSchedule,
  onOpenTeacherPortal,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDatabaseEmpty, setIsDatabaseEmpty] = useState(false);

  // First Login Setup State
  const [isFirstLoginOpen, setIsFirstLoginOpen] = useState(false);
  const [firstLoginNumber, setFirstLoginNumber] = useState('');

  // Setup / Bootstrap Admin State
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [setupUsername, setSetupUsername] = useState('admin');
  const [setupFullName, setSetupFullName] = useState('مدير النظام الرئيسي');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [setupSuccess, setSetupSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsDatabaseEmpty(false);

    if (!username.trim()) {
      setErrorMessage('يرجى إدخال اسم المستخدم أو رقم الدخول');
      return;
    }

    if (!password) {
      setErrorMessage('يرجى إدخال كلمة المرور');
      return;
    }

    setIsLoading(true);

    try {
      const result = await storageService.login(username.trim(), password);

      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        if (result.code === 'DATABASE_EMPTY') {
          setIsDatabaseEmpty(true);
        } else if (result.code === 'PASSWORD_SETUP_REQUIRED') {
          setFirstLoginNumber(String(result.loginNumber || username.trim()));
          setIsFirstLoginOpen(true);
          setErrorMessage('يتطلب هذا الحساب تفعيل كلمة المرور لأول مرة. تم فتح نافذة التفعيل.');
          return;
        }
        setErrorMessage(result.message || 'بيانات الدخول غير صحيحة.');
      }
    } catch (err: any) {
      setErrorMessage('حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');
    setSetupSuccess('');

    if (!setupUsername.trim() || !setupFullName.trim()) {
      setSetupError('اسم المستخدم والاسم الكامل مطلوبان');
      return;
    }

    if (!setupPassword.trim() || setupPassword.trim().length < 8) {
      setSetupError('كلمة المرور يجب ألا تقل عن 8 خانات');
      return;
    }

    setSetupLoading(true);

    try {
      const res = await storageService.bootstrapFirstAdmin(
        setupUsername.trim(),
        setupPassword.trim(),
        setupFullName.trim()
      );

      if (res.success) {
        setSetupSuccess('تم إنشاء مدير النظام وتشفير كلمة المرور بنجاح في قاعدة البيانات!');
        setTimeout(async () => {
          setIsSetupOpen(false);
          const loginRes = await storageService.login(setupUsername.trim(), setupPassword.trim());
          if (loginRes.success && loginRes.user) {
            onLoginSuccess(loginRes.user);
          }
        }, 1200);
      } else {
        setSetupError(res.message || 'فشلت عملية تهيئة المدير الأول');
      }
    } catch (err: any) {
      setSetupError(err?.message || 'خطأ في عملية التهيئة');
    } finally {
      setSetupLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full bg-[#f8fafc] flex flex-col justify-between items-center p-4 sm:p-6 lg:p-8 antialiased selection:bg-[#008e8b]/20 selection:text-[#008e8b]"
    >
      {/* Top Subtle Brand Anchor */}
      <div className="w-full max-w-md pt-4 sm:pt-8 flex justify-center">
        <NTSSLogo variant="full" size="md" />
      </div>

      {/* Main Login Card (Apple-Inspired Minimalism) */}
      <div className="w-full max-w-md my-auto">
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_10px_35px_rgba(0,0,0,0.03)] border border-slate-200/80 transition-all">
          {/* Header Title */}
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              تسجيل الدخول للنظام
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-normal">
              أدخل بيانات حسابك المعتمد للمتابعة إلى لوحة التحكم
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col gap-2 text-rose-700 text-xs font-semibold animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
              {isDatabaseEmpty && (
                <button
                  type="button"
                  onClick={() => setIsSetupOpen(true)}
                  className="mt-1 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>تهيئة حساب مدير النظام الأول (First Admin Setup)</span>
                </button>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Input */}
            <div className="space-y-1.5 text-right">
              <label
                htmlFor="input-username"
                className="block text-xs font-bold text-slate-700 select-none"
              >
                اسم المستخدم
              </label>
              <div className="relative flex items-center">
                <div className="absolute right-3.5 text-slate-400 pointer-events-none">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  id="input-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="مثال: admin"
                  className="w-full pr-10 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#008e8b]/20 focus:border-[#008e8b] transition-all"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5 text-right">
              <label
                htmlFor="input-password"
                className="block text-xs font-bold text-slate-700 select-none"
              >
                كلمة المرور
              </label>
              <div className="relative flex items-center">
                <div className="absolute right-3.5 text-slate-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="input-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#008e8b]/20 focus:border-[#008e8b] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                id="btn-login-submit"
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-[#008e8b] hover:bg-[#007775] text-white font-bold text-sm rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>جارٍ التحقق من الحساب...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>تسجيل الدخول</span>
                  </>
                )}
              </button>
            </div>
            {/* Action Links: First Login & Public Student Schedule */}
            <div className="pt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setFirstLoginNumber(username.trim());
                  setIsFirstLoginOpen(true);
                }}
                className="w-full py-2.5 px-3 bg-teal-50 hover:bg-teal-100/80 text-[#008e8b] font-bold text-xs rounded-xl border border-teal-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>أول دخول للنظام؟ تفعيل الحساب وإنشاء كلمة المرور</span>
              </button>

              {onOpenPublicSchedule && (
                <button
                  type="button"
                  onClick={onOpenPublicSchedule}
                  className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
                  <span>بوابة جدول الطلاب والفصول (بدون تسجيل دخول)</span>
                </button>
              )}

              {onOpenTeacherPortal && (
                <button
                  type="button"
                  onClick={onOpenTeacherPortal}
                  className="w-full py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                  <span>بوابة المعلم (تسجيل الدخول المستقل)</span>
                </button>
              )}
            </div>
          </form>

          {/* Clean Security Note */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-slate-400 text-[11px] font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-[#008e8b]" />
            <span>نظام تسجيل الدخول المشفر والمؤمن بالكامل</span>
          </div>
        </div>
      </div>

      {/* First Login Password Setup Modal */}
      <FirstLoginSetupModal
        isOpen={isFirstLoginOpen}
        initialLoginNumber={firstLoginNumber}
        onClose={() => setIsFirstLoginOpen(false)}
        onSuccess={user => {
          setIsFirstLoginOpen(false);
          onLoginSuccess(user);
        }}
      />

      {/* Setup First Admin Modal */}
      {isSetupOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  تهيئة حساب مدير النظام الأول
                </h3>
              </div>
              <button
                onClick={() => setIsSetupOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              هذا الإجراء متاح لمرة واحدة فقط عند تهيئة قاعدة البيانات لأول مرة. يتم تشفير كلمة المرور بـ Salted PBKDF2 وحفظها في الخادم ثم يُغلق هذا المسار نهائياً.
            </p>

            {setupError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{setupError}</span>
              </div>
            )}

            {setupSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-700 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{setupSuccess}</span>
              </div>
            )}

            <form onSubmit={handleBootstrapAdmin} className="space-y-3">
              <div className="space-y-1 text-right">
                <label className="text-xs font-bold text-slate-700">اسم المستخدم</label>
                <input
                  type="text"
                  required
                  value={setupUsername}
                  onChange={e => setSetupUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>

              <div className="space-y-1 text-right">
                <label className="text-xs font-bold text-slate-700">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={setupFullName}
                  onChange={e => setSetupFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>

              <div className="space-y-1 text-right">
                <label className="text-xs font-bold text-slate-700">كلمة المرور (8 خانات كحد أدنى)</label>
                <input
                  type="password"
                  required
                  value={setupPassword}
                  onChange={e => setSetupPassword(e.target.value)}
                  placeholder="أدخل كلمة مرور قوية"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSetupOpen(false)}
                  className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={setupLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-70"
                >
                  {setupLoading ? 'جارٍ الإنشاء والتشفير...' : 'إنشاء وتشفير الحساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Footer */}
      <footer className="w-full max-w-md pb-4 text-center text-xs text-slate-400 font-medium">
        نظام إدارة الحضور والانصراف والموارد البشرية &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
};
