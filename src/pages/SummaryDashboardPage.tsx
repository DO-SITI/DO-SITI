import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Clock, RefreshCw } from 'lucide-react';
import { OrderStatusText } from '../components/OrderStatusText';
import { useAuth } from '../context/AuthContext';
import { useRestockCountdown } from '../hooks/useRestockCountdown';
import { ApiError } from '../services/apiClient';
import { orderService } from '../services/orderService';
import type { AppRoute, DashboardSummary } from '../types';
import {
  formatCountdown,
  formatDateTime,
  formatRupiah,
  getRemainingRestockMs,
} from '../utils/format';

interface SummaryDashboardPageProps {
  onNavigate: (route: AppRoute) => void;
  refreshKey: number;
}

export function SummaryDashboardPage({
  onNavigate,
  refreshKey,
}: SummaryDashboardPageProps) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await orderService.getDashboardSummary();
      setSummary(data);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Gagal memuat ringkasan dashboard.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, refreshKey]);

  const nowMs = useRestockCountdown(
    summary?.lowStockMenus ?? [],
    loadSummary,
  );

  const isAdmin = user?.role === 'admin';

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#E7A1B7] mb-1">
            {isAdmin ? 'Ringkasan Operasional Toko' : 'Ringkasan Akun Pelanggan'}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#F8F1F4]">
            Halo, {user?.name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => onNavigate('admin-pesanan')}
                className="px-4 py-2.5 rounded-xl bg-[#E7A1B7] hover:bg-[#EDAFC3] text-[#211B24] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                Kelola Pesanan
              </button>
              <button
                type="button"
                onClick={() => onNavigate('admin-menu')}
                className="px-4 py-2.5 rounded-xl border border-[#F8F1F4]/20 hover:bg-[#2B232F] text-[#F8F1F4] text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                Kelola Menu
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('katalog')}
              className="px-4 py-2.5 rounded-xl bg-[#E7A1B7] hover:bg-[#EDAFC3] text-[#211B24] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              Pesan Donat & Minuman
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="bg-[#FAF4F6] rounded-2xl p-6 animate-pulse space-y-3"
            >
              <div className="h-3 w-24 bg-[#EADCE2] rounded" />
              <div className="h-7 w-32 bg-[#EADCE2] rounded" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && errorMsg && (
        <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-8 text-center">
          <p className="text-sm text-[#A6344B] font-medium mb-4">{errorMsg}</p>
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#231A24] text-[#FAF4F6] text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Coba Lagi</span>
          </button>
        </div>
      )}

      {!isLoading && !errorMsg && summary && (
        <>
          {/* 4-Column KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-6">
              <p className="text-xs font-medium text-[#655568]">
                {isAdmin ? 'Total Pendapatan' : 'Total Belanja'}
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#231A24] mt-2">
                {formatRupiah(summary.totalRevenueOrSpent)}
              </p>
              <p className="text-xs text-[#655568] mt-1">
                Pesanan tidak dibatalkan
              </p>
            </div>

            <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-6">
              <p className="text-xs font-medium text-[#655568]">
                Total Pesanan
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#231A24] mt-2">
                {summary.totalOrders}
              </p>
              <p className="text-xs text-[#655568] mt-1 tabular-nums">
                {summary.completedOrders} selesai
              </p>
            </div>

            <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-6">
              <p className="text-xs font-medium text-[#655568]">
                Pesanan Aktif
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#9C3B5E] mt-2">
                {summary.activeOrders}
              </p>
              <p className="text-xs text-[#655568] mt-1">
                Menunggu, diproses, atau siap
              </p>
            </div>

            <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-6">
              <p className="text-xs font-medium text-[#655568]">
                {isAdmin ? 'Menu Tersedia' : 'Pilihan Menu Katalog'}
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#231A24] mt-2">
                {summary.availableMenus} / {summary.totalMenus}
              </p>
              <p className="text-xs text-[#655568] mt-1 tabular-nums">
                {summary.donutCount} Donat · {summary.drinkCount} Minuman
              </p>
            </div>
          </div>

          {/* Lower Detail Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Recent Orders */}
            <div
              className={`${
                isAdmin ? 'lg:col-span-7' : 'lg:col-span-12'
              } bg-[#FAF4F6] text-[#231A24] rounded-2xl p-6`}
            >
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="font-display text-xl font-semibold">
                  {isAdmin ? 'Pesanan Masuk Terbaru' : 'Pesanan Terakhir Anda'}
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    onNavigate(isAdmin ? 'admin-pesanan' : 'riwayat')
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#9C3B5E] hover:underline cursor-pointer"
                >
                  <span>Lihat Semua</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {summary.recentOrders.length === 0 ? (
                <p className="text-sm text-[#655568] py-6">
                  Belum ada pesanan tercatat.
                </p>
              ) : (
                <div className="divide-y divide-[#231A24]/10">
                  {summary.recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-xs text-[#655568]">
                          <span className="font-mono font-semibold text-[#231A24] tabular-nums">
                            #{order.orderNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{order.customerName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {formatDateTime(order.createdAt)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-[#9C3B5E]">
                            {order.paymentMethod}
                          </span>
                        </div>
                        <div className="mt-1">
                          <OrderStatusText status={order.status} />
                        </div>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums text-[#231A24]">
                        {formatRupiah(order.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Admin Low Stock Watchlist */}
            {isAdmin && (
              <div className="lg:col-span-5 bg-[#2B232F] border border-[#F8F1F4]/10 text-[#F8F1F4] rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className="font-display text-xl font-semibold">
                    Stok Perlu Perhatian
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigate('admin-menu')}
                    className="text-xs font-semibold text-[#E7A1B7] hover:underline cursor-pointer"
                  >
                    Atur Stok
                  </button>
                </div>

                {summary.lowStockMenus.length === 0 ? (
                  <p className="text-sm text-[#C9B8C2] py-6">
                    Semua stok menu saat ini dalam kondisi aman (di atas 5
                    porsi).
                  </p>
                ) : (
                  <ul className="divide-y divide-[#F8F1F4]/10">
                    {summary.lowStockMenus.map((item) => {
                      const isRestocking = item.stock === 0 && item.isAvailable;
                      const countdown = formatCountdown(
                        getRemainingRestockMs(item.restockAvailableAt, nowMs),
                      );
                      return (
                        <li
                          key={item.id}
                          className="py-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#F8F1F4] truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-[#C9B8C2]">
                              {item.category}
                              {isRestocking && ' · Sedang Restock'}
                            </p>
                          </div>
                          {isRestocking ? (
                            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold tabular-nums text-[#E7A1B7] shrink-0">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>{countdown}</span>
                            </span>
                          ) : (
                            <span className="font-mono text-xs font-semibold tabular-nums text-[#F3C68F] shrink-0">
                              Sisa {item.stock}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
