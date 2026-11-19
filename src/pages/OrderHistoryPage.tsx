import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, ShoppingBag } from 'lucide-react';
import { MenuImage } from '../components/MenuImage';
import { OrderStatusText } from '../components/OrderStatusText';
import { ApiError } from '../services/apiClient';
import { orderService } from '../services/orderService';
import { ORDER_STATUS_LIST } from '../types';
import type { AppRoute, Order, OrderStatus } from '../types';
import { formatDateTime, formatRupiah } from '../utils/format';

interface OrderHistoryPageProps {
  onNavigate: (route: AppRoute) => void;
  refreshKey: number;
}

type StatusFilter = 'Semua' | OrderStatus;

export function OrderHistoryPage({
  onNavigate,
  refreshKey,
}: OrderHistoryPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Semua');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await orderService.getOrders(statusFilter);
      setOrders(data);
      if (data.length > 0 && !expandedId) {
        setExpandedId(data[0].id);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Gagal memuat riwayat pesanan.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders, refreshKey]);

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#F8F1F4]">
            Riwayat Pesanan
          </h1>
          <p className="text-sm text-[#C9B8C2] mt-1">
            Pantau perkembangan pesanan donat dan minuman Anda secara langsung.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('katalog')}
          className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-[#E7A1B7] hover:bg-[#EDAFC3] text-[#211B24] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          Pesan Menu Lagi
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-[#2B232F] border border-[#F8F1F4]/10 w-fit max-w-full overflow-x-auto">
        {(['Semua', ...ORDER_STATUS_LIST] as StatusFilter[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              statusFilter === status
                ? 'bg-[#FAF4F6] text-[#231A24]'
                : 'text-[#C9B8C2] hover:text-[#F8F1F4]'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="bg-[#FAF4F6] rounded-2xl p-6 animate-pulse space-y-3"
            >
              <div className="h-4 w-40 bg-[#EADCE2] rounded" />
              <div className="h-5 w-64 bg-[#EADCE2] rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && errorMsg && (
        <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-8 text-center">
          <p className="text-sm text-[#A6344B] font-medium mb-4">{errorMsg}</p>
          <button
            type="button"
            onClick={() => void loadOrders()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#231A24] text-[#FAF4F6] text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Muat Ulang</span>
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !errorMsg && orders.length === 0 && (
        <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-10 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-xl bg-[#F2E8ED] text-[#9C3B5E] flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h2 className="font-display text-xl font-semibold mb-1.5">
            Belum Ada Pesanan
          </h2>
          <p className="text-sm text-[#655568] mb-5">
            {statusFilter === 'Semua'
              ? 'Anda belum pernah membuat pesanan di Do-Siti.'
              : `Tidak ada pesanan dengan status "${statusFilter}".`}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('katalog')}
            className="px-5 py-2.5 rounded-xl bg-[#231A24] hover:bg-[#382A3A] text-[#FAF4F6] text-sm font-semibold transition-colors cursor-pointer"
          >
            Mulai Pesan Menu
          </button>
        </div>
      )}

      {/* Order List */}
      {!isLoading && !errorMsg && orders.length > 0 && (
        <div className="space-y-4">
          {orders.map((order) => {
            const isExpanded = expandedId === order.id;

            return (
              <article
                key={order.id}
                className="bg-[#FAF4F6] text-[#231A24] rounded-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((prev) =>
                      prev === order.id ? null : order.id,
                    )
                  }
                  className="w-full p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left hover:bg-[#F4EAEE]/60 transition-colors cursor-pointer"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#655568]">
                      <span className="font-mono font-semibold text-[#231A24] tabular-nums">
                        #{order.orderNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {formatDateTime(order.createdAt)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{order.deliveryMethod}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-[#9C3B5E]">
                        {order.paymentMethod}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <OrderStatusText status={order.status} />
                      <span className="text-xs text-[#655568]">
                        {order.items.reduce((s, i) => s + i.quantity, 0)} item
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <span className="font-mono text-base sm:text-lg font-semibold tabular-nums text-[#231A24]">
                      {formatRupiah(order.total)}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-[#655568]" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-[#655568]" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 sm:px-6 pb-6 pt-4 border-t border-[#231A24]/10 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm text-[#655568]">
                      <div>
                        <p className="font-semibold text-[#231A24] mb-1">
                          Informasi Pemesan
                        </p>
                        <p>
                          {order.customerName} · {order.customerPhone}
                        </p>
                        {order.deliveryMethod === 'Antar ke Alamat' && (
                          <p className="mt-0.5">{order.customerAddress}</p>
                        )}
                      </div>
                      {order.notes && (
                        <div>
                          <p className="font-semibold text-[#231A24] mb-1">
                            Catatan Pesanan
                          </p>
                          <p>{order.notes}</p>
                        </div>
                      )}
                    </div>

                    <ul className="divide-y divide-[#231A24]/10">
                      {order.items.map((item, idx) => (
                        <li
                          key={`${order.id}-${item.menuId}-${idx}`}
                          className="py-3 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#EFE3E8] shrink-0">
                              <MenuImage
                                src={item.imageUrl}
                                alt={item.name}
                                category={item.category}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#231A24] truncate">
                                {item.name}
                              </p>
                              <p className="text-xs text-[#655568] tabular-nums">
                                {item.quantity} x {formatRupiah(item.price)}
                              </p>
                              {item.note && (
                                <p className="text-xs text-[#9C3B5E] mt-0.5">
                                  Catatan: {item.note}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="font-mono text-sm font-semibold tabular-nums text-[#231A24] shrink-0">
                            {formatRupiah(item.subtotal)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="pt-3 border-t border-[#231A24]/10 space-y-1 text-xs sm:text-sm max-w-xs ml-auto">
                      <div className="flex justify-between text-[#655568]">
                        <span>Subtotal</span>
                        <span className="font-mono tabular-nums">
                          {formatRupiah(order.subtotal)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#655568]">
                        <span>Ongkos Kirim</span>
                        <span className="font-mono tabular-nums">
                          {order.deliveryFee > 0
                            ? formatRupiah(order.deliveryFee)
                            : 'Gratis'}
                        </span>
                      </div>
                      <div className="flex justify-between font-semibold text-[#231A24] pt-1">
                        <span>Total</span>
                        <span className="font-mono tabular-nums text-[#9C3B5E]">
                          {formatRupiah(order.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
