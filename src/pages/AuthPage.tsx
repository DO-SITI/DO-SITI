import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/apiClient';
import type { AppRoute, User } from '../types';
import { isValidEmail } from '../utils/format';

interface AuthPageProps {
  mode: 'masuk' | 'daftar';
  onSwitchMode: (mode: 'masuk' | 'daftar') => void;
  onSuccess: (user: User, action: 'login' | 'register') => void;
  onNavigate: (route: AppRoute) => void;
}

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  form?: string;
}

export function AuthPage({
  mode,
  onSwitchMode,
  onSuccess,
  onNavigate,
}: AuthPageProps) {
  const { login, register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetMessages = () => {
    setErrors({});
    setInfoMessage(null);
  };

  const handleModeChange = (nextMode: 'masuk' | 'daftar') => {
    resetMessages();
    onSwitchMode(nextMode);
  };

  const validateLogin = (): boolean => {
    const next: FieldErrors = {};
    if (!email.trim()) {
      next.email = 'Alamat email wajib diisi.';
    } else if (!isValidEmail(email)) {
      next.email = 'Format email tidak valid, contoh: nadia@dositi.id';
    }
    if (!password) {
      next.password = 'Kata sandi wajib diisi.';
    } else if (password.length < 6) {
      next.password = 'Kata sandi minimal 6 karakter.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateRegister = (): boolean => {
    const next: FieldErrors = {};
    if (!name.trim()) {
      next.name = 'Nama lengkap wajib diisi.';
    } else if (name.trim().length < 2) {
      next.name = 'Nama lengkap minimal 2 karakter.';
    }
    if (!email.trim()) {
      next.email = 'Alamat email wajib diisi.';
    } else if (!isValidEmail(email)) {
      next.email = 'Format email tidak valid, contoh: nama@email.com';
    }
    if (!password) {
      next.password = 'Kata sandi wajib diisi.';
    } else if (password.length < 6) {
      next.password = 'Kata sandi minimal 6 karakter.';
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Konfirmasi kata sandi wajib diisi.';
    } else if (confirmPassword !== password) {
      next.confirmPassword = 'Konfirmasi kata sandi tidak sesuai.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    resetMessages();

    if (mode === 'masuk') {
      if (!validateLogin()) return;
      setIsSubmitting(true);
      try {
        const loggedUser = await login({ email: email.trim(), password });
        onSuccess(loggedUser, 'login');
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : 'Gagal masuk. Periksa kembali koneksi atau kredensial Anda.';
        setErrors({ form: msg });
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (!validateRegister()) return;
      setIsSubmitting(true);
      try {
        const result = await register({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
        });

        if (result.requiresEmailVerification || !result.user) {
          setPassword('');
          setConfirmPassword('');
          onSwitchMode('masuk');
          setInfoMessage(result.message);
          return;
        }

        onSuccess(result.user, 'register');
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : 'Gagal mendaftarkan akun. Silakan coba lagi.';
        setErrors({ form: msg });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <div className="max-w-md mx-auto bg-[#FAF4F6] text-[#231A24] rounded-2xl p-6 sm:p-8 shadow-xl">
        {/* Segmented Auth Mode Switch */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#EFE3E8] mb-6">
          <button
            type="button"
            onClick={() => handleModeChange('masuk')}
            className={`py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              mode === 'masuk'
                ? 'bg-white text-[#231A24] shadow-xs'
                : 'text-[#655568] hover:text-[#231A24]'
            }`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('daftar')}
            className={`py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              mode === 'daftar'
                ? 'bg-white text-[#231A24] shadow-xs'
                : 'text-[#655568] hover:text-[#231A24]'
            }`}
          >
            Daftar Akun
          </button>
        </div>

        <div className="mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#231A24]">
            {mode === 'masuk'
              ? 'Selamat datang kembali'
              : 'Buat akun Do-Siti'}
          </h1>
          <p className="text-sm text-[#655568] mt-1.5 leading-relaxed">
            {mode === 'masuk'
              ? 'Masuk untuk memesan donat hangat, melihat riwayat, atau mengelola menu toko.'
              : 'Daftar akun pelanggan baru. Profil Anda akan tersimpan otomatis dengan peran User.'}
          </p>
        </div>

        {infoMessage && (
          <div
            role="status"
            className="mb-5 p-3.5 rounded-xl bg-[#EAF7F0] border border-[#2E8555]/40 text-xs font-medium text-[#1E6B41] flex items-start gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {errors.form && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-[#FDECEF] border border-[#D96B84] text-xs font-medium text-[#9B223E]"
          >
            {errors.form}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {mode === 'daftar' && (
            <div>
              <label
                htmlFor="auth-name"
                className="block text-xs font-semibold text-[#231A24] mb-1.5"
              >
                Nama Lengkap <span className="text-[#A6344B]">*</span>
              </label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Aulia Rahmawati"
                autoComplete="name"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24] placeholder:text-[#98879B]"
              />
              {errors.name && (
                <p className="text-xs text-[#A6344B] mt-1 font-medium">
                  {errors.name}
                </p>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-semibold text-[#231A24] mb-1.5"
            >
              Alamat Email <span className="text-[#A6344B]">*</span>
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              autoComplete="email"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24] placeholder:text-[#98879B]"
            />
            {errors.email && (
              <p className="text-xs text-[#A6344B] mt-1 font-medium">
                {errors.email}
              </p>
            )}
          </div>

          {mode === 'daftar' && (
            <div>
              <label
                htmlFor="auth-phone"
                className="block text-xs font-semibold text-[#231A24] mb-1.5"
              >
                Nomor WhatsApp (Opsional)
              </label>
              <input
                id="auth-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="081234567890"
                autoComplete="tel"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24] placeholder:text-[#98879B]"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-semibold text-[#231A24] mb-1.5"
            >
              Kata Sandi <span className="text-[#A6344B]">*</span>
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                autoComplete={
                  mode === 'masuk' ? 'current-password' : 'new-password'
                }
                className="w-full px-3.5 py-2.5 pr-11 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24] placeholder:text-[#98879B]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword
                    ? 'Sembunyikan kata sandi'
                    : 'Tampilkan kata sandi'
                }
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-[#655568] hover:text-[#231A24] cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-[#A6344B] mt-1 font-medium">
                {errors.password}
              </p>
            )}
          </div>

          {mode === 'daftar' && (
            <div>
              <label
                htmlFor="auth-confirm-password"
                className="block text-xs font-semibold text-[#231A24] mb-1.5"
              >
                Konfirmasi Kata Sandi <span className="text-[#A6344B]">*</span>
              </label>
              <input
                id="auth-confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi kata sandi"
                autoComplete="new-password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24] placeholder:text-[#98879B]"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-[#A6344B] mt-1 font-medium">
                  {errors.confirmPassword}
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-[#231A24] hover:bg-[#382A3A] disabled:opacity-60 text-[#FAF4F6] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {mode === 'masuk' ? (
              <>
                <KeyRound className="w-4 h-4" />
                <span>{isSubmitting ? 'Memeriksa...' : 'Masuk ke Do-Siti'}</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>
                  {isSubmitting ? 'Mendaftarkan...' : 'Daftar Sekarang'}
                </span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#231A24]/10 text-center">
          <button
            type="button"
            onClick={() => onNavigate('katalog')}
            className="text-xs font-medium text-[#655568] hover:text-[#231A24] underline underline-offset-4 cursor-pointer"
          >
            Lihat katalog menu terlebih dahulu
          </button>
        </div>
      </div>
    </section>
  );
}
