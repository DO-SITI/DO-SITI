import {
  CheckCircle2,
  ChefHat,
  Clock,
  PackageCheck,
  XCircle,
} from 'lucide-react';
import type { OrderStatus } from '../types';

interface OrderStatusTextProps {
  status: OrderStatus;
  tone?: 'light-card' | 'dark-surface';
}

export function OrderStatusText({
  status,
  tone = 'light-card',
}: OrderStatusTextProps) {
  const isLight = tone === 'light-card';

  switch (status) {
    case 'Menunggu':
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
            isLight ? 'text-[#9A5B13]' : 'text-[#F3C68F]'
          }`}
        >
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Menunggu Konfirmasi</span>
        </span>
      );
    case 'Diproses':
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
            isLight ? 'text-[#9C3B5E]' : 'text-[#E7A1B7]'
          }`}
        >
          <ChefHat className="w-3.5 h-3.5 shrink-0" />
          <span>Sedang Disiapkan</span>
        </span>
      );
    case 'Siap':
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
            isLight ? 'text-[#1D6B5E]' : 'text-[#8FD7C9]'
          }`}
        >
          <PackageCheck className="w-3.5 h-3.5 shrink-0" />
          <span>Siap Diambil / Dikirim</span>
        </span>
      );
    case 'Selesai':
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
            isLight ? 'text-[#1E6B41]' : 'text-[#8AD9A9]'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Selesai</span>
        </span>
      );
    case 'Dibatalkan':
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
            isLight ? 'text-[#A6344B]' : 'text-[#F296A8]'
          }`}
        >
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Dibatalkan</span>
        </span>
      );
  }
}
