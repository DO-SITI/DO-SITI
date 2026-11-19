import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { OrderStatusText } from '../components/OrderStatusText';
import { ApiError } from '../services/apiClient';
import { orderService } from '../services/orderService';
import { ORDER_STATUS_LIST } from '../types';
import type { Order, OrderStatus } from '../types';
import { formatDateTime, formatRupiah } from '../utils/format';

interface AdminOrdersPageProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
  onDataChanged: () => void;
}

type StatusFilter = 'Semua' | OrderStatus;

export function AdminOrdersPage({
  onNotify,
  onDataChanged,
}: AdminOrdersPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await orderService.getOrders(statusFilter);
      setOrders(data);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Gagal memuat daftar pesanan pelanggan.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const handleStatusChange = async (order: Order, nextStatus: OrderStatus) => {
    if (order.status === nextStatus) return;
    setUpdatingId(order.id);
    try {
      const updated = await orderService.updateOrderStatus(
        order.id,
        nextStatus,
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === updated.id ? updated : o)),
      );
      onNotify(
        'success',
        `Status pesanan #${order.orderNumber} diperbarui menjadi ${nextStatus}.`,
      );
      onDataChanged();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Gagal memperbarui status pesanan.';
      onNotify('error', msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.customerPhone.toLowerCase().includes(q)
    );
  });

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#E7A1B7] mb-1">
            Panel Pengelola Toko
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#F8F1F4]">
            Kelola Status Pesanan
          </h1>
        </div>

        <button
          type="button"
          onClick={() => void loadOrders()}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#F8F1F4]/15 hover:bg-[#2B232F] text-[#F8F1F4] text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Segarkan Daftar</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#2B232F] border border-[#F8F1F4]/10 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#211B24] w-fit max-w-full overflow-x-auto">
          {(['Semua', ...ORDER_STATUS_LIST] as StatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === status
                  ? 'bg-[#FAF4F6] text-[#231A24]'
                  : 'text-[#C9B8C2] hover:text-[#F8F1F4]'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-[#C9B8C2] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode #DS atau nama..."
            aria-label="Cari pesanan"
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#211B24] border border-[#F8F1F4]/15 text-sm text-[#F8F1F4] placeholder:text-[#9E8B98]"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="bg-[#FAF4F6] rounded-2xl p-6 animate-pulse space-y-3"
            >
              <div className="h-4 w-44 bg-[#EADCE2] rounded" />
              <div className="h-5 w-72 bg-[#EADCE2] rounded" />
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
      {!isLoading && !errorMsg && filteredOrders.length === 0 && (
        <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-10 text-center">
          <h2 className="font-display text-xl font-semibold mb-1.5">
            Tidak Ada Pesanan
          </h2>
          <p className="text-sm text-[#655568]">
            Belum ada pesanan yang cocok dengan filter status atau pencarian
            Anda.
          </p>
        </div>
      )}

      {/* Order Management List */}
      {!isLoading && !errorMsg && filteredOrders.length > 0 && (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#231A24]/10">
                <div className="space-y-1">
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
                    <span className="font-semibold text-[#9C3B5E]">
                      {order.paymentMethod}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-[#231A24]">
                    {order.customerName}{' '}
                    <span className="font-mono text-xs font-normal text-[#655568]">
                      ({order.customerPhone})
                    </span>
                  </p>
                  {order.deliveryMethod === 'Antar ke Alamat' && (
                    <p className="text-xs text-[#655568]">
                      Alamat: {order.customerAddress}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <OrderStatusText status={order.status} />
                  <label className="sr-only" htmlFor={`status-${order.id}`}>
                    Ubah status pesanan {order.orderNumber}
                  </label>
                  <select
                    id={`status-${order.id}`}
                    value={order.status}
                    disabled={updatingId === order.id}
                    onChange={(e) =>
                      void handleStatusChange(
                        order,
                        e.target.value as OrderStatus,
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-white border border-[#231A24]/20 text-xs font-semibold text-[#231A24] disabled:opacity-60 cursor-pointer"
                  >
                    {ORDER_STATUS_LIST.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                <ul className="md:col-span-8 space-y-1.5 text-sm">
                  {order.items.map((item, idx) => (
                    <li
                      key={`${order.id}-${item.menuId}-${idx}`}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="text-[#231A24]">
                        <span className="font-mono font-semibold tabular-nums">
                          {item.quantity}x
                        </span>{' '}
                        {item.name}
                        {item.note && (
                          <span className="text-xs text-[#9C3B5E]">
                            {' '}
                            — {item.note}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-xs text-[#655568] tabular-nums shrink-0">
                        {formatRupiah(item.subtotal)}
                      </span>
                    </li>
                  ))}
                  {order.notes && (
                    <li className="pt-1.5 text-xs text-[#9C3B5E]">
                      Catatan pelanggan: {order.notes}
                    </li>
                  )}
                </ul>

                <div className="md:col-span-4 md:text-right space-y-1">
                  <p className="text-xs text-[#655568]">Total Pesanan</p>
                  <p className="font-mono text-lg font-semibold tabular-nums text-[#9C3B5E]">
                    {formatRupiah(order.total)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
