import type { MenuItem } from '../types';
import {
  RESTOCK_DURATION_MS,
  generateDifferentRestockStock,
} from '../utils/format';

const STOCK_SYNC_STORAGE_KEY = 'dositi_stock_sync_v1';

export interface LocalStockState {
  stock: number;
  lastStock: number | null;
  restockAvailableAt: string | null;
  updatedAt: string;
  baseUpdatedAt: string;
}

type StockSyncMap = Record<string, LocalStockState>;

function readMap(): StockSyncMap {
  try {
    const raw = localStorage.getItem(STOCK_SYNC_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StockSyncMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: StockSyncMap): void {
  try {
    localStorage.setItem(STOCK_SYNC_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota issues
  }
}

export const stockSyncStore = {
  /**
   * Checks any local restock timers that have passed 5 minutes and automatically
   * promotes them to a new different stock count in [8..25].
   */
  syncExpiredLocalEntries(): string[] {
    const map = readMap();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const restockedIds: string[] = [];

    for (const [menuId, entry] of Object.entries(map)) {
      if (
        entry.stock === 0 &&
        entry.restockAvailableAt &&
        Date.parse(entry.restockAvailableAt) <= nowMs
      ) {
        const nextStock = generateDifferentRestockStock([entry.lastStock]);
        map[menuId] = {
          ...entry,
          stock: nextStock,
          lastStock: nextStock,
          restockAvailableAt: null,
          updatedAt: nowIso,
        };
        restockedIds.push(menuId);
      }
    }

    if (restockedIds.length > 0) {
      writeMap(map);
    }
    return restockedIds;
  },

  /**
   * Records stock deduction locally when remote Supabase RPC/update is unavailable.
   */
  applyLocalDeduction(
    menus: MenuItem[],
    items: Array<{ menuId: string; quantity: number }>,
  ): void {
    const map = readMap();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    for (const req of items) {
      const menu = menus.find((m) => m.id === req.menuId);
      if (!menu) continue;
      const existing = map[menu.id];
      const currentStock = existing ? existing.stock : menu.stock;
      const nextStock = Math.max(0, currentStock - req.quantity);
      const prevNonZero =
        existing?.lastStock ?? menu.lastStock ?? (currentStock > 0 ? currentStock : null);

      map[menu.id] = {
        stock: nextStock,
        lastStock: nextStock === 0 ? prevNonZero : nextStock,
        restockAvailableAt:
          nextStock === 0
            ? new Date(nowMs + RESTOCK_DURATION_MS).toISOString()
            : null,
        updatedAt: nowIso,
        baseUpdatedAt: menu.updatedAt,
      };
    }

    writeMap(map);
  },

  /**
   * Registers an out-of-stock cooldown entry (e.g. if stock is 0 in DB without restock_available_at).
   */
  ensureLocalCooldown(menu: MenuItem): LocalStockState {
    const map = readMap();
    const existing = map[menu.id];
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (existing) {
      if (
        existing.stock === 0 &&
        existing.restockAvailableAt &&
        Date.parse(existing.restockAvailableAt) <= nowMs
      ) {
        const nextStock = generateDifferentRestockStock([
          existing.lastStock,
          menu.lastStock,
        ]);
        const updated: LocalStockState = {
          stock: nextStock,
          lastStock: nextStock,
          restockAvailableAt: null,
          updatedAt: nowIso,
          baseUpdatedAt: menu.updatedAt,
        };
        map[menu.id] = updated;
        writeMap(map);
        return updated;
      }
      return existing;
    }

    const created: LocalStockState = {
      stock: 0,
      lastStock: menu.lastStock ?? null,
      restockAvailableAt:
        menu.restockAvailableAt ||
        new Date(nowMs + RESTOCK_DURATION_MS).toISOString(),
      updatedAt: nowIso,
      baseUpdatedAt: menu.updatedAt,
    };
    map[menu.id] = created;
    writeMap(map);
    return created;
  },

  clearEntry(menuId: string): void {
    const map = readMap();
    if (menuId in map) {
      delete map[menuId];
      writeMap(map);
    }
  },

  /**
   * Merges remote DB menu rows with local fallback state when remote DB doesn't have
   * the restock_available_at column or checkout RPC installed yet.
   */
  mergeMenus(remoteMenus: MenuItem[]): MenuItem[] {
    this.syncExpiredLocalEntries();
    const map = readMap();
    let changed = false;
    const nowMs = Date.now();

    const merged = remoteMenus.map((menu) => {
      const local = map[menu.id];

      // If remote DB was explicitly updated by Admin after our local entry, drop local override
      if (
        local &&
        Date.parse(menu.updatedAt) > Date.parse(local.baseUpdatedAt) &&
        Date.parse(menu.updatedAt) > Date.parse(local.updatedAt)
      ) {
        delete map[menu.id];
        changed = true;
      } else if (local) {
        return {
          ...menu,
          stock: local.stock,
          lastStock: local.lastStock ?? menu.lastStock,
          restockAvailableAt: local.restockAvailableAt,
          isAvailable: local.stock > 0 ? true : menu.isAvailable,
        };
      }

      // If remote DB has stock === 0 and isAvailable === true, ensure cooldown is tracked
      if (menu.stock === 0 && menu.isAvailable) {
        if (menu.restockAvailableAt) {
          if (Date.parse(menu.restockAvailableAt) <= nowMs) {
            const nextStock = generateDifferentRestockStock([menu.lastStock]);
            const nowIso = new Date(nowMs).toISOString();
            map[menu.id] = {
              stock: nextStock,
              lastStock: nextStock,
              restockAvailableAt: null,
              updatedAt: nowIso,
              baseUpdatedAt: menu.updatedAt,
            };
            changed = true;
            return {
              ...menu,
              stock: nextStock,
              lastStock: nextStock,
              restockAvailableAt: null,
            };
          }
          return menu;
        }

        const cooldown = this.ensureLocalCooldown(menu);
        return {
          ...menu,
          stock: cooldown.stock,
          lastStock: cooldown.lastStock ?? menu.lastStock,
          restockAvailableAt: cooldown.restockAvailableAt,
        };
      }

      return menu;
    });

    if (changed) {
      writeMap(map);
    }
    return merged;
  },
};
