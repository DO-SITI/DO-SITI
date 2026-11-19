import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Minus, Plus, RefreshCw, Search, X } from 'lucide-react';
import { MenuImage } from '../components/MenuImage';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useRestockCountdown } from '../hooks/useRestockCountdown';
import { ApiError } from '../services/apiClient';
import { menuService } from '../services/menuService';
import type { AppRoute, MenuCategory, MenuItem } from '../types';
import {
  formatCountdown,
  formatRupiah,
  getRemainingRestockMs,
} from '../utils/format';

interface CatalogPageProps {
  onNavigate: (route: AppRoute) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
  catalogRefreshKey: number;
}

type CategoryFilter = 'Semua' | MenuCategory;

export function CatalogPage({
  onNavigate,
  onNotify,
  catalogRefreshKey,
}: CatalogPageProps) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const {
    addItem,
    updateQuantity,
    getItemQuantity,
    openDrawer,
    syncCartWithMenus,
  } = useCart();

  const [menus, setMenus] = useState<MenuItem[]>(() =>
    menuService.getCachedMenus(),
  );
  const menusCountRef = useRef(menus.length);
  menusCountRef.current = menus.length;

  const [isLoading, setIsLoading] = useState(
    () => menuService.getCachedMenus().length === 0,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>('Semua');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const [selectedMenu, setSelectedMenu] = useState<MenuItem | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [detailNote, setDetailNote] = useState('');

  const isFetchingRef = useRef(false);

  const loadMenus = useCallback(
    async (forceLoadingSkeleton = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (forceLoadingSkeleton && menusCountRef.current === 0) {
        setIsLoading(true);
      }
      setErrorMsg(null);
      try {
        const data = await menuService.getMenus();
        setMenus(data);
        syncCartWithMenus(data);
        setSelectedMenu((prev) =>
          prev ? (data.find((m) => m.id === prev.id) ?? prev) : null,
        );
      } catch (err) {
        if (menusCountRef.current === 0) {
          const msg =
            err instanceof ApiError
              ? err.message
              : 'Gagal memuat katalog menu dari server.';
          setErrorMsg(msg);
        }
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
      }
    },
    [syncCartWithMenus],
  );

  // Load once on mount (or when explicit data refresh key increments)
  useEffect(() => {
    void loadMenus(menusCountRef.current === 0);
  }, [loadMenus, catalogRefreshKey]);

  // If auth finished settling and menus haven't arrived yet, ensure a clean load
  useEffect(() => {
    if (!isAuthLoading && menusCountRef.current === 0 && !isFetchingRef.current) {
      void loadMenus(true);
    }
  }, [isAuthLoading, loadMenus]);

  const nowMs = useRestockCountdown(menus, loadMenus);

  const filteredMenus = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return menus.filter((item) => {
      const matchesCategory =
        categoryFilter === 'Semua' || item.category === categoryFilter;
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      const matchesAvailability =
        !onlyAvailable || (item.isAvailable && item.stock > 0);
      return matchesCategory && matchesSearch && matchesAvailability;
    });
  }, [menus, categoryFilter, searchQuery, onlyAvailable]);

  const handleOpenDetail = (menu: MenuItem) => {
    setSelectedMenu(menu);
    setDetailQty(1);
    setDetailNote('');
  };

  const handleQuickAdd = (menu: MenuItem) => {
    if (!menu.isAvailable || menu.stock <= 0) return;
    addItem(menu, 1);
    onNotify('success', `${menu.name} ditambahkan ke keranjang.`);
  };

  const handleDetailAdd = () => {
    if (!selectedMenu || !selectedMenu.isAvailable || selectedMenu.stock <= 0)
      return;
    const inCart = getItemQuantity(selectedMenu.id);
    const remainingCapacity = Math.max(0, selectedMenu.stock - inCart);
    if (remainingCapacity <= 0) {
      onNotify(
        'error',
        `Jumlah di keranjang sudah mencapai batas stok (${selectedMenu.stock} porsi).`,
      );
      return;
    }
    const qtyToAdd = Math.min(detailQty, remainingCapacity);
    addItem(selectedMenu, qtyToAdd, detailNote.trim() || undefined);
    onNotify(
      'success',
      `${qtyToAdd}x ${selectedMenu.name} ditambahkan ke keranjang.`,
    );
    setSelectedMenu(null);
  };

  const scrollToCatalog = () => {
    const el = document.getElementById('katalog-menu-list');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-10 pb-16">
      {/* Storefront Banner Hero Section */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        <div className="rounded-2xl overflow-hidden bg-[#2B232F] border border-[#F8F1F4]/10 shadow-xl">
          <button
            type="button"
            onClick={scrollToCatalog}
            aria-label="Teman Ngopi, Teman Ngemil — Klik untuk pesan sekarang"
            className="w-full block text-left cursor-pointer group focus-visible:outline-2 focus-visible:outline-[#E7A1B7]"
          >
            <img
              src="/assets/aistudio/Banner_cafe_dan_menu_62d7fc38.png"
              alt="Teman Ngopi, Teman Ngemil — Nikmati camilan manis dan minuman favoritmu di Do-Siti"
              referrerPolicy="no-referrer"
              className="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.01]"
            />
          </button>

          <div className="px-5 py-3.5 bg-[#2B232F] border-t border-[#F8F1F4]/10 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs sm:text-sm text-[#C9B8C2]">
              Pilihan donat lembut dan minuman segar siap dipesan hari ini.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={scrollToCatalog}
                className="px-4 py-2 rounded-xl bg-[#E7A1B7] hover:bg-[#EDAFC3] text-[#211B24] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                Pesan Sekarang
              </button>
              {!user ? (
                <button
                  type="button"
                  onClick={() => onNavigate('masuk')}
                  className="text-xs sm:text-sm font-medium text-[#F8F1F4] hover:text-[#E7A1B7] underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Masuk untuk Memesan
                </button>
              ) : user.role === 'admin' ? (
                <button
                  type="button"
                  onClick={() => onNavigate('admin-menu')}
                  className="text-xs sm:text-sm font-medium text-[#F8F1F4] hover:text-[#E7A1B7] underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Kelola Menu Admin
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openDrawer}
                  className="text-xs sm:text-sm font-medium text-[#F8F1F4] hover:text-[#E7A1B7] underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Lihat Keranjang
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Catalog Controls & Product Grid */}
      <section
        id="katalog-menu-list"
        className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#F8F1F4]">
              Katalog Menu Do-Siti
            </h1>
            <p className="text-xs sm:text-sm text-[#C9B8C2] mt-1 tabular-nums">
              Menampilkan {filteredMenus.length} dari {menus.length} menu donat &amp; minuman
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-[#2B232F] border border-[#F8F1F4]/10 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Filter kategori menu"
              className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#211B24]"
            >
              {(['Semua', 'Donat', 'Minuman'] as CategoryFilter[]).map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-[#FAF4F6] text-[#231A24]'
                        : 'text-[#C9B8C2] hover:text-[#F8F1F4]'
                    }`}
                  >
                    {cat}
                  </button>
                ),
              )}
            </div>

            <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#C9B8C2] cursor-pointer select-none px-2">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
                className="w-4 h-4 rounded accent-[#E7A1B7] cursor-pointer"
              />
              <span>Hanya yang tersedia</span>
            </label>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-[#C9B8C2] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama donat atau minuman..."
              aria-label="Cari menu"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#211B24] border border-[#F8F1F4]/15 text-sm text-[#F8F1F4] placeholder:text-[#9E8B98]"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="bg-[#FAF4F6] rounded-2xl overflow-hidden animate-pulse"
              >
                <div className="aspect-[4/3] bg-[#EADCE2]" />
                <div className="p-5 space-y-3">
                  <div className="h-3 w-24 bg-[#EADCE2] rounded" />
                  <div className="h-5 w-44 bg-[#EADCE2] rounded" />
                  <div className="h-4 w-full bg-[#EADCE2] rounded" />
                  <div className="h-9 w-28 bg-[#EADCE2] rounded mt-4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && errorMsg && (
          <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-8 text-center max-w-lg mx-auto">
            <h2 className="font-display text-xl font-semibold mb-2">
              Gagal Memuat Menu
            </h2>
            <p className="text-sm text-[#655568] mb-5">{errorMsg}</p>
            <button
              type="button"
              onClick={() => void loadMenus()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#231A24] text-[#FAF4F6] text-sm font-semibold cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Coba Lagi</span>
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !errorMsg && filteredMenus.length === 0 && (
          <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-10 text-center max-w-lg mx-auto">
            <h2 className="font-display text-xl font-semibold mb-2">
              Menu Tidak Ditemukan
            </h2>
            <p className="text-sm text-[#655568] mb-5">
              Tidak ada donat atau minuman yang cocok dengan kata kunci atau
              filter saat ini.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('Semua');
                setOnlyAvailable(false);
              }}
              className="px-5 py-2.5 rounded-xl bg-[#231A24] hover:bg-[#382A3A] text-[#FAF4F6] text-sm font-semibold transition-colors cursor-pointer"
            >
              Reset Filter
            </button>
          </div>
        )}

        {/* Populated 3-Column Product Grid */}
        {!isLoading && !errorMsg && filteredMenus.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMenus.map((menu) => {
              const inCartQty = getItemQuantity(menu.id);
              const canOrder = menu.isAvailable && menu.stock > 0;
              const isRestocking = menu.isAvailable && menu.stock <= 0;
              const remainingMs = getRemainingRestockMs(
                menu.restockAvailableAt,
                nowMs,
              );
              const countdownText = formatCountdown(remainingMs);

              return (
                <article
                  key={menu.id}
                  className="bg-[#FAF4F6] text-[#231A24] rounded-2xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(menu)}
                    className="aspect-[4/3] w-full overflow-hidden bg-[#EFE3E8] block cursor-pointer text-left"
                  >
                    <MenuImage
                      src={menu.imageUrl}
                      alt={menu.name}
                      category={menu.category}
                      className={`w-full h-full object-cover transition-transform duration-300 hover:scale-[1.03] ${
                        !canOrder ? 'opacity-70 grayscale-[20%]' : ''
                      }`}
                    />
                  </button>

                  <div className="p-5 flex-1 flex flex-col">
                    {/* Clean unboxed metadata */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#655568] mb-1.5">
                      <span className="font-medium text-[#9C3B5E]">
                        {menu.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`tabular-nums ${
                          isRestocking ? 'font-medium text-[#A6344B]' : ''
                        }`}
                      >
                        {canOrder
                          ? `Stok ${menu.stock}`
                          : isRestocking
                            ? 'Habis · Sedang Restock (estimasi 5 menit)'
                            : 'Tidak tersedia'}
                      </span>
                      {menu.highlight && canOrder && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{menu.highlight}</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenDetail(menu)}
                      className="text-left cursor-pointer group"
                    >
                      <h2 className="font-display text-lg font-semibold text-[#231A24] group-hover:text-[#9C3B5E] transition-colors leading-snug">
                        {menu.name}
                      </h2>
                    </button>

                    <p className="text-sm text-[#655568] leading-relaxed mt-2 line-clamp-2 flex-1">
                      {menu.description}
                    </p>

                    <div className="mt-5 pt-4 border-t border-[#231A24]/10 flex items-center justify-between gap-3">
                      <span className="font-mono text-base font-semibold tabular-nums text-[#231A24]">
                        {formatRupiah(menu.price)}
                      </span>

                      {user?.role === 'admin' ? (
                        <div className="flex items-center gap-2.5">
                          {isRestocking && (
                            <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold tabular-nums text-[#A6344B]">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>{countdownText}</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onNavigate('admin-menu')}
                            className="px-3.5 py-2 rounded-xl border border-[#231A24]/15 hover:bg-[#EFE3E8] text-xs font-semibold text-[#231A24] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Kelola di Admin
                          </button>
                        </div>
                      ) : !canOrder ? (
                        isRestocking ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A6344B] font-mono tabular-nums whitespace-nowrap">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>Restock {countdownText}</span>
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-[#A6344B]">
                            Tidak Tersedia
                          </span>
                        )
                      ) : inCartQty > 0 ? (
                        <div className="inline-flex items-center border border-[#231A24]/15 rounded-xl bg-white">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(menu.id, inCartQty - 1)
                            }
                            aria-label={`Kurangi ${menu.name}`}
                            className="w-9 h-9 flex items-center justify-center text-[#231A24] hover:bg-[#F2E8ED] rounded-l-xl cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-8 text-center text-xs font-mono font-semibold tabular-nums">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(menu.id, inCartQty + 1)
                            }
                            disabled={inCartQty >= menu.stock}
                            aria-label={`Tambah ${menu.name}`}
                            className="w-9 h-9 flex items-center justify-center text-[#231A24] hover:bg-[#F2E8ED] disabled:opacity-40 rounded-r-xl cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(menu)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#231A24] hover:bg-[#382A3A] text-[#FAF4F6] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Tambah</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Menu Detail Modal */}
      {selectedMenu && (() => {
        const isModalRestocking =
          selectedMenu.isAvailable && selectedMenu.stock <= 0;
        const modalRemainingMs = getRemainingRestockMs(
          selectedMenu.restockAvailableAt,
          nowMs,
        );
        const modalCountdown = formatCountdown(modalRemainingMs);
        const inCart = getItemQuantity(selectedMenu.id);
        const remainingCapacity = Math.max(0, selectedMenu.stock - inCart);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#140F17]/75 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-label={`Detail ${selectedMenu.name}`}
          >
            <div
              className="fixed inset-0"
              onClick={() => setSelectedMenu(null)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-lg bg-[#FAF4F6] text-[#231A24] rounded-2xl overflow-hidden shadow-2xl">
              <div className="relative aspect-[4/3] bg-[#EFE3E8]">
                <MenuImage
                  src={selectedMenu.imageUrl}
                  alt={selectedMenu.name}
                  category={selectedMenu.category}
                  className={`w-full h-full object-cover ${
                    selectedMenu.stock <= 0 || !selectedMenu.isAvailable
                      ? 'opacity-75 grayscale-[20%]'
                      : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setSelectedMenu(null)}
                  aria-label="Tutup detail menu"
                  className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[#211B24]/80 text-[#F8F1F4] flex items-center justify-center hover:bg-[#211B24] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#655568] mb-1">
                    <span className="font-semibold text-[#9C3B5E]">
                      {selectedMenu.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`tabular-nums ${
                        isModalRestocking ? 'font-semibold text-[#A6344B]' : ''
                      }`}
                    >
                      {selectedMenu.isAvailable && selectedMenu.stock > 0
                        ? `Tersedia ${selectedMenu.stock} porsi`
                        : isModalRestocking
                          ? 'Habis · Sedang Restock (estimasi 5 menit)'
                          : 'Sedang tidak tersedia'}
                    </span>
                  </div>
                  <h2 className="font-display text-2xl font-semibold text-[#231A24]">
                    {selectedMenu.name}
                  </h2>
                  <p className="font-mono text-lg font-semibold tabular-nums text-[#9C3B5E] mt-1">
                    {formatRupiah(selectedMenu.price)}
                  </p>
                </div>

                <p className="text-sm text-[#655568] leading-relaxed">
                  {selectedMenu.description}
                </p>

                {isModalRestocking && (
                  <div className="p-4 rounded-xl bg-[#F2E8ED] border border-[#E7A1B7] space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[#A6344B]">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>Habis · Sedang Restock (estimasi 5 menit)</span>
                      </span>
                      <span className="font-mono text-sm tabular-nums text-[#231A24]">
                        {modalCountdown}
                      </span>
                    </div>
                    <p className="text-xs text-[#655568]">
                      Dapur sedang menyiapkan stok baru. Menu ini akan muncul
                      kembali otomatis di etalase setelah hitung mundur selesai.
                    </p>
                  </div>
                )}

                {user?.role !== 'admin' &&
                  selectedMenu.isAvailable &&
                  selectedMenu.stock > 0 && (
                    <div className="space-y-4 pt-2 border-t border-[#231A24]/10">
                      {inCart > 0 && (
                        <p className="text-xs text-[#655568] tabular-nums">
                          Sudah ada {inCart} porsi di keranjang (maksimal tambah{' '}
                          {remainingCapacity} porsi lagi).
                        </p>
                      )}
                      <div>
                        <label
                          htmlFor="detail-note"
                          className="block text-xs font-semibold text-[#231A24] mb-1.5"
                        >
                          Catatan Khusus (Opsional)
                        </label>
                        <input
                          id="detail-note"
                          type="text"
                          value={detailNote}
                          onChange={(e) => setDetailNote(e.target.value)}
                          placeholder="Misal: kurang manis, tanpa es, atau potong dua"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24]"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <div className="inline-flex items-center border border-[#231A24]/15 rounded-xl bg-white">
                          <button
                            type="button"
                            onClick={() =>
                              setDetailQty((q) => Math.max(1, q - 1))
                            }
                            aria-label="Kurangi jumlah"
                            className="w-10 h-10 flex items-center justify-center hover:bg-[#F2E8ED] rounded-l-xl cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-10 text-center text-sm font-mono font-semibold tabular-nums">
                            {Math.min(detailQty, Math.max(1, remainingCapacity))}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setDetailQty((q) =>
                                Math.min(Math.max(1, remainingCapacity), q + 1),
                              )
                            }
                            disabled={detailQty >= remainingCapacity}
                            aria-label="Tambah jumlah"
                            className="w-10 h-10 flex items-center justify-center hover:bg-[#F2E8ED] disabled:opacity-40 rounded-r-xl cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={remainingCapacity <= 0}
                          onClick={handleDetailAdd}
                          className="flex-1 py-3 px-5 rounded-xl bg-[#231A24] hover:bg-[#382A3A] disabled:opacity-50 text-[#FAF4F6] text-sm font-semibold transition-colors cursor-pointer"
                        >
                          {remainingCapacity <= 0 ? (
                            'Batas Stok di Keranjang'
                          ) : (
                            <>
                              Tambah ·{' '}
                              <span className="font-mono tabular-nums">
                                {formatRupiah(
                                  selectedMenu.price *
                                    Math.min(detailQty, remainingCapacity),
                                )}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
