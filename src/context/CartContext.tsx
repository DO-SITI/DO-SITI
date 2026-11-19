import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { CartItem, MenuItem } from '../types';

const CART_STORAGE_KEY = 'dositi_cart_items';

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (menu: MenuItem, quantity?: number, note?: string) => void;
  updateQuantity: (menuId: string, quantity: number) => void;
  updateItemNote: (menuId: string, note: string) => void;
  removeItem: (menuId: string) => void;
  clearCart: () => void;
  getItemQuantity: (menuId: string) => number;
  syncCartWithMenus: (menus: MenuItem[]) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage failures
    }
  }, [items]);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const addItem = useCallback(
    (menu: MenuItem, quantity = 1, note?: string) => {
      if (!menu.isAvailable || menu.stock <= 0) return;
      setItems((prev) => {
        const idx = prev.findIndex((item) => item.menu.id === menu.id);
        if (idx === -1) {
          const capped = Math.min(Math.max(1, quantity), menu.stock);
          return [...prev, { menu, quantity: capped, note }];
        }
        return prev.map((item, i) => {
          if (i !== idx) return item;
          const nextQty = Math.min(item.quantity + quantity, menu.stock);
          return {
            ...item,
            menu,
            quantity: nextQty,
            note: note !== undefined ? note : item.note,
          };
        });
      });
    },
    [],
  );

  const updateQuantity = useCallback((menuId: string, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) {
        return prev.filter((item) => item.menu.id !== menuId);
      }
      return prev.map((item) => {
        if (item.menu.id !== menuId) return item;
        const maxStock = Math.max(0, item.menu.stock);
        if (maxStock === 0) return item;
        return { ...item, quantity: Math.min(quantity, maxStock) };
      });
    });
  }, []);

  const updateItemNote = useCallback((menuId: string, note: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.menu.id === menuId ? { ...item, note } : item,
      ),
    );
  }, []);

  const removeItem = useCallback((menuId: string) => {
    setItems((prev) => prev.filter((item) => item.menu.id !== menuId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const syncCartWithMenus = useCallback((menus: MenuItem[]) => {
    const menuMap = new Map(menus.map((m) => [m.id, m]));
    setItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const fresh = menuMap.get(item.menu.id);
        if (!fresh) return item;
        const nextQty =
          fresh.stock > 0 ? Math.min(item.quantity, fresh.stock) : item.quantity;
        if (
          fresh.stock !== item.menu.stock ||
          fresh.isAvailable !== item.menu.isAvailable ||
          fresh.restockAvailableAt !== item.menu.restockAvailableAt ||
          fresh.price !== item.menu.price ||
          nextQty !== item.quantity
        ) {
          changed = true;
          return { ...item, menu: fresh, quantity: nextQty };
        }
        return item;
      });
      return changed ? next : prev;
    });
  }, []);

  const getItemQuantity = useCallback(
    (menuId: string) => {
      const found = items.find((i) => i.menu.id === menuId);
      return found ? found.quantity : 0;
    },
    [items],
  );

  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => sum + item.menu.price * item.quantity, 0),
    [items],
  );

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        subtotal,
        isDrawerOpen,
        openDrawer,
        closeDrawer,
        addItem,
        updateQuantity,
        updateItemNote,
        removeItem,
        clearCart,
        getItemQuantity,
        syncCartWithMenus,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart harus digunakan di dalam CartProvider.');
  }
  return ctx;
}
