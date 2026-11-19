import {
  isSupabaseConfigured,
  normalizeSupabaseStorageUrl,
  supabase,
} from '../lib/supabaseClient';
import type { MenuCategory, MenuItem, MenuPayload } from '../types';
import {
  RESTOCK_DURATION_MS,
  generateDifferentRestockStock,
} from '../utils/format';
import { ApiError, apiRequest } from './apiClient';
import { stockSyncStore } from './stockSyncStore';

let cachedMenusStore: MenuItem[] = [];
let syncRpcAvailable: boolean | null = null;
const preloadedUrls = new Set<string>();

function preloadMenuImages(menus: MenuItem[]): void {
  if (typeof window === 'undefined') return;
  for (const menu of menus) {
    const url = (menu.imageUrl || '').trim();
    if (!url || preloadedUrls.has(url)) continue;
    preloadedUrls.add(url);
    const img = new window.Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.src = url;
  }
}

export interface MenuFilterParams {
  search?: string;
  category?: 'Semua' | MenuCategory;
}

export interface StorageGalleryItem {
  label: string;
  url: string;
}

function isMissingColumnError(message: string, code?: string): boolean {
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    message.includes('restock_available_at') ||
    message.includes('last_stock')
  );
}

function isMissingFunctionError(message: string, code?: string): boolean {
  return (
    code === 'PGRST202' ||
    message.includes('Could not find the function') ||
    message.includes('sync_expired_restocks')
  );
}

function mapMenuRow(row: Record<string, unknown>): MenuItem {
  const rawCategory = String(row.category ?? row.kategori ?? 'Donat');
  const category: MenuCategory =
    rawCategory.toLowerCase() === 'minuman' ? 'Minuman' : 'Donat';

  const rawImageUrl = String(
    row.image_url ?? row.imageUrl ?? row.image ?? row.gambar ?? '',
  );

  const rawRestockAt =
    row.restock_available_at ?? row.restockAvailableAt ?? null;
  const rawLastStock = row.last_stock ?? row.lastStock ?? null;

  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? row.nama ?? row.title ?? 'Menu Do-Siti'),
    category,
    price: Number(row.price ?? row.harga ?? 0),
    stock: Math.max(0, Number(row.stock ?? row.stok ?? 10)),
    description: String(row.description ?? row.deskripsi ?? ''),
    imageUrl: normalizeSupabaseStorageUrl(rawImageUrl),
    isAvailable: Boolean(
      row.is_available ?? row.isAvailable ?? row.available ?? true,
    ),
    highlight:
      typeof row.highlight === 'string' && row.highlight
        ? row.highlight
        : undefined,
    restockAvailableAt:
      typeof rawRestockAt === 'string' && rawRestockAt ? rawRestockAt : null,
    lastStock:
      typeof rawLastStock === 'number' && Number.isFinite(rawLastStock)
        ? rawLastStock
        : rawLastStock !== null &&
            rawLastStock !== undefined &&
            Number.isFinite(Number(rawLastStock))
          ? Number(rawLastStock)
          : null,
    createdAt: String(
      row.created_at ?? row.createdAt ?? new Date().toISOString(),
    ),
    updatedAt: String(
      row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
    ),
  };
}

export const menuService = {
  getCachedMenus(): MenuItem[] {
    return cachedMenusStore;
  },

  async syncExpiredRestocks(): Promise<MenuItem[]> {
    stockSyncStore.syncExpiredLocalEntries();

    if (isSupabaseConfigured && supabase) {
      if (syncRpcAvailable !== false) {
        const { data, error } = await supabase.rpc('sync_expired_restocks');
        if (!error && Array.isArray(data)) {
          syncRpcAvailable = true;
          return (data as Record<string, unknown>[]).map(mapMenuRow);
        }

        if (error && isMissingFunctionError(error.message, error.code)) {
          syncRpcAvailable = false;
        } else if (error) {
          return [];
        }
      }

      // Only query out-of-stock rows if local cache hints any item needs sync or RPC isn't available
      const hasKnownExpired = cachedMenusStore.some(
        (m) =>
          m.stock === 0 &&
          m.isAvailable &&
          m.restockAvailableAt &&
          Date.parse(m.restockAvailableAt) <= Date.now(),
      );
      if (!hasKnownExpired && cachedMenusStore.length > 0) {
        return [];
      }

      const { data: rows } = await supabase
        .from('menu_items')
        .select('*')
        .eq('stock', 0)
        .eq('is_available', true);

      if (Array.isArray(rows)) {
        const nowMs = Date.now();
        for (const raw of rows as Record<string, unknown>[]) {
          const item = mapMenuRow(raw);
          if (
            item.restockAvailableAt &&
            Date.parse(item.restockAvailableAt) <= nowMs
          ) {
            const nextStock = generateDifferentRestockStock([
              item.lastStock,
              item.stock,
            ]);
            const { error: updErr } = await supabase
              .from('menu_items')
              .update({
                stock: nextStock,
                last_stock: nextStock,
                restock_available_at: null,
                is_available: true,
              })
              .eq('id', item.id)
              .eq('stock', 0);

            if (!updErr) {
              stockSyncStore.clearEntry(item.id);
            }
          }
        }
      }
      return [];
    }

    const data = await apiRequest<{ menus: MenuItem[] }>(
      '/api/menus/sync-restock',
      { method: 'POST' },
    );
    return data.menus;
  },

  async getMenus(params: MenuFilterParams = {}): Promise<MenuItem[]> {
    if (isSupabaseConfigured && supabase) {
      // Trigger auto-restock without blocking initial render unnecessarily
      await this.syncExpiredRestocks().catch(() => []);

      let query = supabase.from('menu_items').select('*');

      if (params.category && params.category !== 'Semua') {
        query = query.eq('category', params.category);
      }

      const { data, error } = await query;
      if (error) {
        if (
          error.code === '42501' ||
          error.message.toLowerCase().includes('permission denied')
        ) {
          throw new ApiError(
            'Izin baca tabel menu_items di Supabase belum dibuka untuk publik (anon). Jalankan perintah GRANT SELECT pada SQL Editor Supabase Anda.',
            403,
          );
        }
        throw new ApiError(error.message, 500);
      }

      let menus = (data as Record<string, unknown>[]).map(mapMenuRow);
      menus = stockSyncStore.mergeMenus(menus);
      menus.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      if (!params.category && !params.search) {
        cachedMenusStore = menus;
      }
      preloadMenuImages(menus);

      if (params.search && params.search.trim()) {
        const q = params.search.trim().toLowerCase();
        menus = menus.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q) ||
            m.category.toLowerCase().includes(q),
        );
      }
      return menus;
    }

    const query = new URLSearchParams();
    if (params.search && params.search.trim()) {
      query.set('search', params.search.trim());
    }
    if (params.category && params.category !== 'Semua') {
      query.set('category', params.category);
    }
    const qs = query.toString();
    const data = await apiRequest<{ menus: MenuItem[] }>(
      `/api/menus${qs ? `?${qs}` : ''}`,
    );
    if (!params.category && !params.search) {
      cachedMenusStore = data.menus;
    }
    preloadMenuImages(data.menus);
    return data.menus;
  },

  async createMenu(payload: MenuPayload): Promise<MenuItem> {
    const cleanImageUrl = normalizeSupabaseStorageUrl(payload.imageUrl);
    const safeStock = Math.max(0, Math.floor(payload.stock));
    const restockAt =
      safeStock === 0 && payload.isAvailable
        ? new Date(Date.now() + RESTOCK_DURATION_MS).toISOString()
        : null;

    if (isSupabaseConfigured && supabase) {
      const baseInsert = {
        name: payload.name,
        category: payload.category,
        price: payload.price,
        stock: safeStock,
        description: payload.description,
        image_url: cleanImageUrl,
        is_available: payload.isAvailable,
        highlight: payload.highlight || null,
      };

      let { data, error } = await supabase
        .from('menu_items')
        .insert({
          ...baseInsert,
          restock_available_at: restockAt,
          last_stock: safeStock > 0 ? safeStock : null,
        })
        .select('*')
        .single();

      if (error && isMissingColumnError(error.message, error.code)) {
        const retry = await supabase
          .from('menu_items')
          .insert(baseInsert)
          .select('*')
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        throw new ApiError(error.message, 403);
      }
      return mapMenuRow(data as Record<string, unknown>);
    }

    const data = await apiRequest<{ menu: MenuItem }>('/api/menus', {
      method: 'POST',
      body: JSON.stringify({ ...payload, stock: safeStock, imageUrl: cleanImageUrl }),
    });
    return data.menu;
  },

  async updateMenu(id: string, payload: MenuPayload): Promise<MenuItem> {
    const cleanImageUrl = normalizeSupabaseStorageUrl(payload.imageUrl);
    const safeStock = Math.max(0, Math.floor(payload.stock));
    const restockAt =
      safeStock === 0 && payload.isAvailable
        ? new Date(Date.now() + RESTOCK_DURATION_MS).toISOString()
        : null;

    if (isSupabaseConfigured && supabase) {
      const baseUpdate = {
        name: payload.name,
        category: payload.category,
        price: payload.price,
        stock: safeStock,
        description: payload.description,
        image_url: cleanImageUrl,
        is_available: payload.isAvailable,
        highlight: payload.highlight || null,
      };

      let { data, error } = await supabase
        .from('menu_items')
        .update({
          ...baseUpdate,
          restock_available_at: restockAt,
          ...(safeStock > 0 ? { last_stock: safeStock } : {}),
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error && isMissingColumnError(error.message, error.code)) {
        const retry = await supabase
          .from('menu_items')
          .update(baseUpdate)
          .eq('id', id)
          .select('*')
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        throw new ApiError(error.message, 403);
      }
      stockSyncStore.clearEntry(id);
      return mapMenuRow(data as Record<string, unknown>);
    }

    const data = await apiRequest<{ menu: MenuItem }>(`/api/menus/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...payload, stock: safeStock, imageUrl: cleanImageUrl }),
    });
    return data.menu;
  },

  async deleteMenu(id: string): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', id);
      if (error) {
        throw new ApiError(error.message, 403);
      }
      return;
    }

    await apiRequest<{ success: boolean }>(`/api/menus/${id}`, {
      method: 'DELETE',
    });
  },

  async uploadImage(file: File): Promise<string> {
    if (isSupabaseConfigured && supabase) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from('menu-images')
        .upload(safeName, file, { upsert: false });

      if (error) {
        throw new ApiError(`Gagal mengunggah gambar: ${error.message}`, 400);
      }

      const { data } = supabase.storage
        .from('menu-images')
        .getPublicUrl(safeName);
      return normalizeSupabaseStorageUrl(data.publicUrl);
    }

    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      reader.readAsDataURL(file);
    });

    const data = await apiRequest<{ url: string }>('/api/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type,
        dataBase64,
      }),
    });
    return data.url;
  },

  async listStorageImages(): Promise<StorageGalleryItem[]> {
    const client = supabase;
    if (!isSupabaseConfigured || !client) return [];
    const { data, error } = await client.storage
      .from('menu-images')
      .list('', { limit: 24, sortBy: { column: 'created_at', order: 'desc' } });

    if (error || !data) return [];

    return data
      .filter((item) => item.name && !item.name.startsWith('.'))
      .map((item) => {
        const { data: pub } = client.storage
          .from('menu-images')
          .getPublicUrl(item.name);
        return {
          label: item.name.replace(/\.[^.]+$/, ''),
          url: normalizeSupabaseStorageUrl(pub.publicUrl),
        };
      });
  },
};
