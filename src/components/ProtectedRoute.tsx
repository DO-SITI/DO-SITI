import type { ReactNode } from 'react';
import { LockKeyhole, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AppRoute, UserRole } from '../types';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
  onNavigate: (route: AppRoute) => void;
  children: ReactNode;
}

export function ProtectedRoute({
  allowedRoles,
  onNavigate,
  children,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16">
        <div className="bg-[#2B232F] border border-[#F8F1F4]/10 rounded-2xl p-8 max-w-lg mx-auto animate-pulse">
          <div className="h-6 w-48 bg-[#3A3040] rounded mb-3" />
          <div className="h-4 w-72 bg-[#3A3040] rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16">
        <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-8 sm:p-10 max-w-lg mx-auto text-center">
          <div className="w-12 h-12 rounded-xl bg-[#F2E2E8] text-[#9C3B5E] flex items-center justify-center mx-auto mb-5">
            <LockKeyhole className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl font-semibold mb-2">
            Masuk Diperlukan
          </h1>
          <p className="text-sm text-[#655568] leading-relaxed mb-6">
            Silakan masuk ke akun Do-Siti terlebih dahulu untuk mengakses
            halaman ini.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('masuk')}
              className="px-5 py-2.5 rounded-lg bg-[#231A24] hover:bg-[#382A3A] text-[#FAF4F6] text-sm font-semibold transition-colors cursor-pointer"
            >
              Masuk Sekarang
            </button>
            <button
              type="button"
              onClick={() => onNavigate('katalog')}
              className="px-5 py-2.5 rounded-lg border border-[#231A24]/20 hover:bg-[#F2E8ED] text-[#231A24] text-sm font-medium transition-colors cursor-pointer"
            >
              Kembali ke Katalog
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16">
        <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-8 sm:p-10 max-w-lg mx-auto text-center">
          <div className="w-12 h-12 rounded-xl bg-[#F9E2E8] text-[#A83857] flex items-center justify-center mx-auto mb-5">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl font-semibold mb-2">
            Akses Dibatasi
          </h1>
          <p className="text-sm text-[#655568] leading-relaxed mb-6">
            Halaman ini khusus untuk pengelola (Admin) Do-Siti. Akun Anda saat
            ini terdaftar sebagai Pelanggan.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('katalog')}
              className="px-5 py-2.5 rounded-lg bg-[#231A24] hover:bg-[#382A3A] text-[#FAF4F6] text-sm font-semibold transition-colors cursor-pointer"
            >
              Kembali ke Katalog
            </button>
            <button
              type="button"
              onClick={() => onNavigate('riwayat')}
              className="px-5 py-2.5 rounded-lg border border-[#231A24]/20 hover:bg-[#F2E8ED] text-[#231A24] text-sm font-medium transition-colors cursor-pointer"
            >
              Riwayat Pesanan Saya
            </button>
          </div>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
