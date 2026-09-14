import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  User,
  X,
  Eye,
  EyeOff
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { User as UserType } from '../../types';

interface FirstLoginSetupModalProps {
  initialLoginNumber?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserType) => void;
}

export const FirstLoginSetupModal: React.FC<FirstLoginSetupModalProps> = ({
  initialLoginNumber = '',
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [loginNumber, setLoginNumber] = useState(initialLoginNumber);
  const [activationToken, setActivationToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!loginNumber.trim() || !activationToken.trim() || !newPassword.trim()) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage('كلمة المرور يجب أن تتكون من 8 خانات على الأقل');
      return;
    }

    if (!/[A-Za-z\u0600-\u06FF]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setErrorMessage('كلمة المرور يجب أن تحتوي على أحرف وأرقام معاً لضمان الأمان');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }

    setIsLoading(true);

    try {
      const res = await storageService.firstLoginPasswordSetup(
        loginNumber.trim(),
        activationToken.trim(),
        newPassword.trim(),
        confirmPassword.trim()
      );

      if (res.success && res.user) {
        setSuccessMessage('تم إعداد كلمة المرور بنجاح! جاري تسجيل الدخول...');
        setTimeout(() => {
          onSuccess(res.user!);
        }, 1000);
      } else {
        setErrorMessage(res.message || 'فشلت عملية التحقق وتعيين كلمة المرور');
      }
    } catch (err: any) {
      setErrorMessage('تعذر إكمال العملية، يرجى التحقق من اتصالك بالإنترنت');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-teal-700 to-[#008e8b] p-6 text-white relative">
          <button
            onClick={onClose}
            type="button"
            className="absolute left-4 top-4 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-3">
            <ShieldCheck className="w-6 h-6 text-teal-100" />
          </div>
          <h2 className="text-lg font-bold">تفعيل الحساب لأول مرة</h2>
          <p className="text-xs text-teal-100 mt-1 leading-relaxed">
            وفقاً للسياسة الأمنية للنظام، يتطلب الدخول لأول مرة إدخال كود التفعيل الصادر لك من الإدارة وإنشاء كلمة المرور الشخصية.
          </p>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              رقم الدخول أو اسم المستخدم
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={loginNumber}
                onChange={e => setLoginNumber(e.target.value)}
                placeholder="مثال: 121 أو اسم المستخدم"
                className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:border-[#008e8b] focus:ring-2 focus:ring-[#008e8b]/20 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              كود التفعيل لمرة واحدة (Activation Token)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={activationToken}
                onChange={e => setActivationToken(e.target.value.toUpperCase())}
                placeholder="مثال: A7B2C89D"
                className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold tracking-wider text-slate-800 focus:bg-white focus:border-[#008e8b] focus:ring-2 focus:ring-[#008e8b]/20 transition uppercase"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              الكود المطبوع أو المرسل إليك من مسؤول النظام أو شؤون المعلمين.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              كلمة المرور الجديدة
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="8 خانات على الأقل (أحرف وأرقام)"
                className="w-full pr-9 pl-10 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-[#008e8b] focus:ring-2 focus:ring-[#008e8b]/20 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              تأكيد كلمة المرور الجديدة
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="أعد كتابة كلمة المرور"
                className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-[#008e8b] focus:ring-2 focus:ring-[#008e8b]/20 transition"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-[#008e8b] hover:bg-[#007775] disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جارٍ التحقق وتعيين كلمة المرور...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>تعيين كلمة المرور وتفعيل الحساب</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
