import {
  isSupabaseConfigured,
  normalizeSupabaseStorageUrl,
  supabase,
} from '../lib/supabaseClient';
import type {
  CreateOrderPayload,
  DashboardSummary,
  DeliveryMethod,
  MenuCategory,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
} from '../types';
import { ApiError, apiRequest } from './apiClient';
import { authService } from './authService';
import { menuService } from './menuService';
import { stockSyncStore } from './stockSyncStore';
import {
  RESTOCK_DURATION_MS,
  formatCountdown,
  getRemainingRestockMs,
} from '../utils/format';

function mapOrderItems(rawItems: unknown): OrderItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((raw) => {
    const item = raw as Record<string, unknown>;
    const rawCat = String(item.category ?? 'Donat');
    const category: MenuCategory =
      rawCat.toLowerCase() === 'minuman' ? 'Minuman' : 'Donat';
    const price = Number(item.price ?? 0);
    const quantity = Number(item.quantity ?? 1);
    return {
      menuId: String(item.menu_id ?? item.menuId ?? ''),
      name: String(item.name ?? 'Menu'),
      category,
      price,
      quantity,
      subtotal: Number(item.subtotal ?? price * quantity),
      imageUrl: normalizeSupabaseStorageUrl(
        String(item.image_url ?? item.imageUrl ?? ''),
      ),
      note: typeof item.note === 'string' && item.note ? item.note : undefined,
    };
  });
}

function parsePaymentMethod(
  rawMethod: unknown,
  notes?: string,
): PaymentMethod {
  const val = String(rawMethod ?? '').trim();
  if (val === 'QRIS' || val === 'E-Wallet' || val === 'COD') {
    return val;
  }
  if (notes) {
    if (notes.includes('[Pembayaran: QRIS]')) return 'QRIS';
    if (notes.includes('[Pembayaran: E-Wallet]')) return 'E-Wallet';
  }
  return 'COD';
}

function mapOrderRow(row: Record<string, unknown>): Order {
  const deliveryRaw = String(
    row.delivery_method ?? row.deliveryMethod ?? 'Ambil di Toko',
  );
  const deliveryMethod: DeliveryMethod =
    deliveryRaw === 'Antar ke Alamat' ? 'Antar ke Alamat' : 'Ambil di Toko';

  const rawNotes =
    typeof row.notes === 'string' && row.notes ? row.notes : undefined;
  const paymentMethod = parsePaymentMethod(
    row.payment_method ?? row.paymentMethod,
    rawNotes,
  );
  const cleanNotes = rawNotes
    ? rawNotes.replace(/\s*\[Pembayaran:\s*(COD|QRIS|E-Wallet)\]/g, '').trim() ||
      undefined
    : undefined;

  const statusRaw = String(row.status ?? 'Menunggu');
  const validStatuses: OrderStatus[] = [
    'Menunggu',
    'Diproses',
    'Siap',
    'Selesai',
    'Dibatalkan',
  ];
  const status: OrderStatus = validStatuses.includes(statusRaw as OrderStatus)
    ? (statusRaw as OrderStatus)
    : 'Menunggu';

  return {
    id: String(row.id ?? ''),
    orderNumber: String(
      row.order_number ?? row.orderNumber ?? String(row.id ?? '').slice(0, 8),
    ),
    userId: String(row.user_id ?? row.userId ?? ''),
    customerName: String(row.customer_name ?? row.customerName ?? 'Pelanggan'),
    customerPhone: String(row.customer_phone ?? row.customerPhone ?? '-'),
    customerAddress: String(row.customer_address ?? row.customerAddress ?? ''),
    deliveryMethod,
    paymentMethod,
    notes: cleanNotes,
    items: mapOrderItems(row.order_items ?? row.items),
    subtotal: Number(row.subtotal ?? 0),
    deliveryFee: Number(row.delivery_fee ?? row.deliveryFee ?? 0),
    total: Number(row.total ?? 0),
    status,
    createdAt: String(
      row.created_at ?? row.createdAt ?? new Date().toISOString(),
    ),
    updatedAt: String(
      row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
    ),
  };
}

export const orderService = {
  async getOrders(status?: 'Semua' | OrderStatus): Promise<Order[]> {
    if (isSupabaseConfigured && supabase) {
      let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });

      if (status && status !== 'Semua') {
        query = query.eq('status', status);
      }

      let { data, error } = await query;

      if (
        error &&
        (error.code === 'PGRST200' ||
          error.code === 'PGRST205' ||
          error.message.includes('order_items'))
      ) {
        let fallbackQuery = supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });
        if (status && status !== 'Semua') {
          fallbackQuery = fallbackQuery.eq('status', status);
        }
        const fallback = await fallbackQuery;
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        throw new ApiError(error.message, 500);
      }
      return ((data || []) as Record<string, unknown>[]).map(mapOrderRow);
    }

    const query = new URLSearchParams();
    if (status && status !== 'Semua') {
      query.set('status', status);
    }
    const qs = query.toString();
    const data = await apiRequest<{ orders: Order[] }>(
      `/api/orders${qs ? `?${qs}` : ''}`,
    );
    return data.orders;
  },

  async createOrder(payload: CreateOrderPayload): Promise<Order> {
    if (isSupabaseConfigured && supabase) {
      const currentUser = await authService.getCurrentUser();
      if (!currentUser) {
        throw new ApiError('Sesi login diperlukan untuk membuat pesanan.', 401);
      }

      const allMenus = await menuService.getMenus();
      const menuMap = new Map<string, MenuItem>(
        allMenus.map((m) => [m.id, m]),
      );

      const requestedByMenu = new Map<string, number>();
      for (const item of payload.items) {
        const qty = Math.floor(Number(item.quantity));
        if (!Number.isInteger(qty) || qty < 1) {
          throw new ApiError('Jumlah pembelian minimal 1 porsi.', 400);
        }
        requestedByMenu.set(
          item.menuId,
          (requestedByMenu.get(item.menuId) ?? 0) + qty,
        );
      }

      for (const [menuId, totalQty] of requestedByMenu.entries()) {
        const menu = menuMap.get(menuId);
        if (!menu || !menu.isAvailable) {
          throw new ApiError(
            menu
              ? `Menu "${menu.name}" sedang tidak tersedia.`
              : 'Salah satu menu tidak tersedia.',
            400,
          );
        }
        if (menu.stock <= 0) {
          const remainingMs = getRemainingRestockMs(menu.restockAvailableAt);
          if (remainingMs > 0) {
            throw new ApiError(
              `Menu "${menu.name}" sedang habis · estimasi restock dalam ${formatCountdown(remainingMs)}.`,
              400,
            );
          }
          throw new ApiError(
            `Stok "${menu.name}" sedang habis dan sedang dalam proses restock.`,
            400,
          );
        }
        if (menu.stock < totalQty) {
          throw new ApiError(
            `Stok "${menu.name}" tersisa ${menu.stock} porsi.`,
            400,
          );
        }
      }

      let subtotal = 0;
      const resolvedItems: Array<{
        menu_id: string;
        name: string;
        category: MenuCategory;
        price: number;
        quantity: number;
        subtotal: number;
        image_url: string;
        note: string | null;
      }> = [];

      for (const item of payload.items) {
        const menu = menuMap.get(item.menuId)!;
        const lineSubtotal = menu.price * item.quantity;
        subtotal += lineSubtotal;
        resolvedItems.push({
          menu_id: menu.id,
          name: menu.name,
          category: menu.category,
          price: menu.price,
          quantity: item.quantity,
          subtotal: lineSubtotal,
          image_url: menu.imageUrl,
          note: item.note || null,
        });
      }

      const stockRpcPayload = Array.from(requestedByMenu.entries()).map(
        ([menu_id, quantity]) => ({ menu_id, quantity }),
      );

      let usedRpc = false;
      const { error: stockRpcError } = await supabase.rpc(
        'process_checkout_stock',
        { p_items: stockRpcPayload },
      );

      if (!stockRpcError) {
        usedRpc = true;
        for (const [menuId] of requestedByMenu.entries()) {
          stockSyncStore.clearEntry(menuId);
        }
      } else {
        const isMissingRpc =
          stockRpcError.code === 'PGRST202' ||
          stockRpcError.message.includes('Could not find the function') ||
          stockRpcError.message.includes('process_checkout_stock');
        if (!isMissingRpc) {
          throw new ApiError(stockRpcError.message, 400);
        }
      }

      const deliveryFee =
        payload.deliveryMethod === 'Antar ke Alamat' ? 10000 : 0;
      const total = subtotal + deliveryFee;

      const baseInsert = {
        user_id: currentUser.id,
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone,
        customer_address: payload.customerAddress,
        delivery_method: payload.deliveryMethod,
        notes: payload.notes || null,
        subtotal,
        delivery_fee: deliveryFee,
        total,
        status: 'Menunggu' as OrderStatus,
      };

      let { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          ...baseInsert,
          payment_method: payload.paymentMethod,
        })
        .select('*')
        .single();

      // Graceful fallback if remote Supabase orders table doesn't have payment_method column yet
      if (
        orderError &&
        (orderError.code === 'PGRST204' ||
          orderError.code === '42703' ||
          orderError.message.includes('payment_method'))
      ) {
        const taggedNotes = [
          payload.notes?.trim(),
          `[Pembayaran: ${payload.paymentMethod}]`,
        ]
          .filter(Boolean)
          .join(' ');
        const retry = await supabase
          .from('orders')
          .insert({
            ...baseInsert,
            notes: taggedNotes,
          })
          .select('*')
          .single();
        orderData = retry.data;
        orderError = retry.error;
      }

      if (orderError || !orderData) {
        if (usedRpc) {
          await supabase.rpc('restore_checkout_stock', {
            p_items: stockRpcPayload,
          });
        }
        throw new ApiError(
          orderError?.message || 'Gagal membuat pesanan.',
          400,
        );
      }

      const orderId = String((orderData as Record<string, unknown>).id);
      const { error: itemsError } = await supabase.from('order_items').insert(
        resolvedItems.map((it) => ({
          ...it,
          order_id: orderId,
        })),
      );

      if (
        itemsError &&
        itemsError.code !== 'PGRST205' &&
        !itemsError.message.includes('order_items')
      ) {
        throw new ApiError(itemsError.message, 400);
      }

      // Fallback stock deduction if process_checkout_stock RPC isn't installed in Supabase yet
      if (!usedRpc) {
        let needsLocalSync = false;
        const restockAtIso = new Date(
          Date.now() + RESTOCK_DURATION_MS,
        ).toISOString();

        for (const [menuId, totalQty] of requestedByMenu.entries()) {
          const menu = menuMap.get(menuId)!;
          const nextStock = Math.max(0, menu.stock - totalQty);
          const prevNonZero =
            menu.lastStock ?? (menu.stock > 0 ? menu.stock : null);

          let { error: updErr } = await supabase
            .from('menu_items')
            .update({
              stock: nextStock,
              last_stock: nextStock === 0 ? prevNonZero : nextStock,
              restock_available_at: nextStock === 0 ? restockAtIso : null,
            })
            .eq('id', menuId);

          if (
            updErr &&
            (updErr.code === 'PGRST204' ||
              updErr.code === '42703' ||
              updErr.message.includes('restock_available_at') ||
              updErr.message.includes('last_stock'))
          ) {
            const retryUpd = await supabase
              .from('menu_items')
              .update({ stock: nextStock })
              .eq('id', menuId);
            updErr = retryUpd.error;
            if (!updErr && nextStock === 0) {
              // DB updated stock=0, keep restock timer locally synced if column missing
              needsLocalSync = true;
            }
          }

          if (updErr) {
            needsLocalSync = true;
          } else if (nextStock > 0) {
            stockSyncStore.clearEntry(menuId);
          }
        }

        if (needsLocalSync) {
          stockSyncStore.applyLocalDeduction(
            allMenus,
            Array.from(requestedByMenu.entries()).map(([menuId, quantity]) => ({
              menuId,
              quantity,
            })),
          );
        }
      }

      return mapOrderRow({
        ...(orderData as Record<string, unknown>),
        payment_method:
          (orderData as Record<string, unknown>).payment_method ??
          payload.paymentMethod,
        order_items: resolvedItems,
      });
    }

    const data = await apiRequest<{ order: Order }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.order;
  },

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id)
        .select('*')
        .single();

      if (error || !data) {
        throw new ApiError(
          error?.message || 'Gagal memperbarui status pesanan.',
          403,
        );
      }
      return mapOrderRow(data as Record<string, unknown>);
    }

    const data = await apiRequest<{ order: Order }>(`/api/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return data.order;
  },

  async getDashboardSummary(): Promise<DashboardSummary> {
    if (isSupabaseConfigured && supabase) {
      const currentUser = await authService.getCurrentUser();
      if (!currentUser) {
        throw new ApiError('Sesi login diperlukan.', 401);
      }

      const [orders, menus] = await Promise.all([
        this.getOrders(),
        menuService.getMenus(),
      ]);

      const activeOrders = orders.filter(
        (o) =>
          o.status === 'Menunggu' ||
          o.status === 'Diproses' ||
          o.status === 'Siap',
      ).length;
      const completedOrders = orders.filter(
        (o) => o.status === 'Selesai',
      ).length;
      const totalRevenueOrSpent = orders
        .filter((o) => o.status !== 'Dibatalkan')
        .reduce((acc, o) => acc + o.total, 0);

      return {
        role: currentUser.role,
        totalOrders: orders.length,
        activeOrders,
        completedOrders,
        totalRevenueOrSpent,
        totalMenus: menus.length,
        availableMenus: menus.filter((m) => m.isAvailable && m.stock > 0)
          .length,
        donutCount: menus.filter((m) => m.category === 'Donat').length,
        drinkCount: menus.filter((m) => m.category === 'Minuman').length,
        lowStockMenus:
          currentUser.role === 'admin'
            ? menus
                .filter((m) => m.stock <= 5)
                .sort((a, b) => a.stock - b.stock)
            : [],
        recentOrders: orders.slice(0, 5),
      };
    }

    const data = await apiRequest<{ summary: DashboardSummary }>(
      '/api/dashboard/summary',
    );
    return data.summary;
  },
};
