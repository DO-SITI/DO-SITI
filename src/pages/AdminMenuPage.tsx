import { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { MenuImage } from '../components/MenuImage';
import { useRestockCountdown } from '../hooks/useRestockCountdown';
import { ApiError } from '../services/apiClient';
import { menuService } from '../services/menuService';
import type { MenuCategory, MenuItem, MenuPayload } from '../types';
import {
  formatCountdown,
  formatRupiah,
  getRemainingRestockMs,
} from '../utils/format';

interface AdminMenuPageProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
  onDataChanged: () => void;
  quickAddSignal: number;
  refreshKey?: number;
}

interface MenuFormErrors {
  name?: string;
  price?: string;
  stock?: string;
  description?: string;
  imageUrl?: string;
  form?: string;
}

const PRESET_GALLERY = [
  {
    label: 'Rose Berry Donut',
    url: '/src/assets/images/donut_rose_berry_1795086666461.jpg',
  },
  {
    label: 'Vanilla Pistachio',
    url: '/src/assets/images/donut_matcha_cream_1795086666050.jpg',
  },
  {
    label: 'Dark Hazelnut',
    url: '/src/assets/images/donut_choco_hazelnut_1795086666592.jpg',
  },
  {
    label: 'Rose Velvet Latte',
    url: '/src/assets/images/drink_rose_latte_1795086667182.jpg',
  },
  {
    label: 'Berry Matcha',
    url: '/src/assets/images/drink_berry_matcha_1795086666533.jpg',
  },
];

export function AdminMenuPage({
  onNotify,
  onDataChanged,
  quickAddSignal,
  refreshKey = 0,
}: AdminMenuPageProps) {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [storageGallery, setStorageGallery] = useState<
    Array<{ label: string; url: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<
    'Semua' | MenuCategory
  >('Semua');

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<MenuCategory>('Donat');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [highlight, setHighlight] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<MenuFormErrors>({});

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadMenus = useCallback(async () => {
    setErrorMsg(null);
    try {
      const [data, gallery] = await Promise.all([
        menuService.getMenus(),
        menuService.listStorageImages(),
      ]);
      setMenus(data);
      setStorageGallery(gallery);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Gagal memuat daftar menu.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    void loadMenus();
  }, [loadMenus, refreshKey]);

  const handleRestockRefresh = useCallback(async () => {
    await loadMenus();
    onDataChanged();
  }, [loadMenus, onDataChanged]);

  const nowMs = useRestockCountdown(menus, handleRestockRefresh);

  const openCreateModal = useCallback(() => {
    setEditingMenu(null);
    setName('');
    setCategory('Donat');
    setPrice('');
    setStock('12');
    setDescription('');
    setHighlight('');
    setIsAvailable(true);
    setImageUrl('');
    setFormErrors({});
    setIsModalOpen(true);
  }, []);

  useEffect(() => {
    if (quickAddSignal > 0) {
      openCreateModal();
    }
  }, [quickAddSignal, openCreateModal]);

  const openEditModal = (menu: MenuItem) => {
    setEditingMenu(menu);
    setName(menu.name);
    setCategory(menu.category);
    setPrice(String(menu.price));
    setStock(String(menu.stock));
    setDescription(menu.description);
    setHighlight(menu.highlight || '');
    setIsAvailable(menu.isAvailable);
    setImageUrl(menu.imageUrl);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setFormErrors((prev) => ({
        ...prev,
        imageUrl: 'Format file harus JPG, PNG, atau WebP.',
      }));
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setFormErrors((prev) => ({
        ...prev,
        imageUrl: 'Ukuran gambar maksimal 3 MB.',
      }));
      return;
    }

    setIsUploadingImage(true);
    setFormErrors((prev) => ({ ...prev, imageUrl: undefined }));
    try {
      const uploadedUrl = await menuService.uploadImage(file);
      setImageUrl(uploadedUrl);
      onNotify('success', 'Gambar menu berhasil diunggah.');
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Gagal mengunggah gambar ke server.';
      setFormErrors((prev) => ({ ...prev, imageUrl: msg }));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const validateForm = (): boolean => {
    const next: MenuFormErrors = {};
    const parsedPrice = Number(price);
    const parsedStock = Number(stock);

    if (name.trim().length < 3) {
      next.name = 'Nama menu minimal 3 karakter.';
    }
    if (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      next.price = 'Harga wajib diisi dengan angka lebih dari 0.';
    }
    if (
      stock.trim() === '' ||
      !Number.isInteger(parsedStock) ||
      parsedStock < 0
    ) {
      next.stock = 'Stok wajib diisi bilangan bulat minimal 0.';
    }
    if (description.trim().length < 10) {
      next.description = 'Deskripsi menu minimal 10 karakter.';
    }
    if (!imageUrl.trim()) {
      next.imageUrl = 'Silakan unggah gambar menu atau pilih foto galeri.';
    }

    setFormErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const payload: MenuPayload = {
      name: name.trim(),
      category,
      price: Number(price),
      stock: Number(stock),
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      isAvailable,
      highlight: highlight.trim() || undefined,
    };

    setIsSaving(true);
    setFormErrors({});
    try {
      if (editingMenu) {
        await menuService.updateMenu(editingMenu.id, payload);
        onNotify('success', `Menu "${payload.name}" berhasil diperbarui.`);
      } else {
        await menuService.createMenu(payload);
        onNotify('success', `Menu baru "${payload.name}" berhasil ditambahkan.`);
      }
      setIsModalOpen(false);
      await loadMenus();
      onDataChanged();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Gagal menyimpan data menu.';
      setFormErrors({ form: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await menuService.deleteMenu(deleteTarget.id);
      onNotify('success', `Menu "${deleteTarget.name}" telah dihapus.`);
      setDeleteTarget(null);
      await loadMenus();
      onDataChanged();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Gagal menghapus menu.';
      onNotify('error', msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredMenus = menus.filter((m) => {
    const matchCat =
      categoryFilter === 'Semua' || m.category === categoryFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#E7A1B7] mb-1">
            Panel Pengelola Toko
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#F8F1F4]">
            Kelola Menu Donat & Minuman
          </h1>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E7A1B7] hover:bg-[#EDAFC3] text-[#211B24] text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Menu</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#2B232F] border border-[#F8F1F4]/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#211B24] w-fit">
          {(['Semua', 'Donat', 'Minuman'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-[#FAF4F6] text-[#231A24]'
                  : 'text-[#C9B8C2] hover:text-[#F8F1F4]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#C9B8C2] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari menu di tabel..."
            aria-label="Cari menu admin"
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#211B24] border border-[#F8F1F4]/15 text-sm text-[#F8F1F4] placeholder:text-[#9E8B98]"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-[#FAF4F6] rounded-2xl p-6 space-y-4 animate-pulse">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-12 bg-[#EADCE2] rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && errorMsg && (
        <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-8 text-center">
          <p className="text-sm text-[#A6344B] font-medium mb-4">{errorMsg}</p>
          <button
            type="button"
            onClick={() => void loadMenus()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#231A24] text-[#FAF4F6] text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Muat Ulang</span>
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !errorMsg && filteredMenus.length === 0 && (
        <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl p-10 text-center">
          <h2 className="font-display text-xl font-semibold mb-1.5">
            Belum Ada Menu Sesuai Filter
          </h2>
          <p className="text-sm text-[#655568] mb-5">
            Tambahkan menu baru atau ubah kata kunci pencarian Anda.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2.5 rounded-xl bg-[#231A24] text-[#FAF4F6] text-sm font-semibold cursor-pointer"
          >
            Tambah Menu Pertama
          </button>
        </div>
      )}

      {/* Desktop Table & Mobile Cards */}
      {!isLoading && !errorMsg && filteredMenus.length > 0 && (
        <div className="bg-[#FAF4F6] text-[#231A24] rounded-2xl overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#231A24]/10 text-xs font-semibold text-[#655568]">
                  <th className="py-3.5 px-5">Menu</th>
                  <th className="py-3.5 px-4">Kategori</th>
                  <th className="py-3.5 px-4 text-right">Harga</th>
                  <th className="py-3.5 px-4 text-right">Stok</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#231A24]/10 text-sm">
                {filteredMenus.map((menu) => (
                  <tr
                    key={menu.id}
                    className="hover:bg-[#F3E9EE]/60 transition-colors"
                  >
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#EFE3E8] shrink-0">
                          <MenuImage
                            src={menu.imageUrl}
                            alt={menu.name}
                            category={menu.category}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[#231A24] truncate max-w-xs">
                            {menu.name}
                          </p>
                          <p className="text-xs text-[#655568] truncate max-w-xs">
                            {menu.description}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-[#655568]">
                      {menu.category}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums">
                      {formatRupiah(menu.price)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      {menu.stock}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold">
                      {menu.isAvailable && menu.stock > 0 ? (
                        <span className="text-[#1E6B41]">Tersedia</span>
                      ) : menu.isAvailable ? (
                        <span className="inline-flex items-center gap-1.5 text-[#A6344B] font-mono tabular-nums whitespace-nowrap">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Restock{' '}
                            {formatCountdown(
                              getRemainingRestockMs(
                                menu.restockAvailableAt,
                                nowMs,
                              ),
                            )}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[#A6344B]">Nonaktif</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(menu)}
                          aria-label={`Edit ${menu.name}`}
                          className="p-2 rounded-lg text-[#231A24] hover:bg-[#E7D8DF] transition-colors cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(menu)}
                          aria-label={`Hapus ${menu.name}`}
                          className="p-2 rounded-lg text-[#A6344B] hover:bg-[#F9DCE2] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-[#231A24]/10">
            {filteredMenus.map((menu) => {
              const isRestocking = menu.isAvailable && menu.stock <= 0;
              const countdown = formatCountdown(
                getRemainingRestockMs(menu.restockAvailableAt, nowMs),
              );
              return (
                <div key={menu.id} className="p-4 flex gap-3.5">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#EFE3E8] shrink-0">
                    <MenuImage
                      src={menu.imageUrl}
                      alt={menu.name}
                      category={menu.category}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm text-[#231A24] truncate">
                        {menu.name}
                      </h3>
                      <span className="font-mono text-xs font-semibold tabular-nums shrink-0">
                        {formatRupiah(menu.price)}
                      </span>
                    </div>
                    <p className="text-xs text-[#655568] mt-0.5 tabular-nums">
                      {menu.category} · Stok {menu.stock} ·{' '}
                      {isRestocking ? (
                        <span className="font-semibold text-[#A6344B] font-mono">
                          Restock {countdown}
                        </span>
                      ) : menu.isAvailable ? (
                        'Aktif'
                      ) : (
                        'Nonaktif'
                      )}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(menu)}
                        className="px-3 py-1.5 rounded-lg bg-[#EFE3E8] text-xs font-semibold text-[#231A24] cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(menu)}
                        className="px-3 py-1.5 rounded-lg bg-[#FDECEF] text-xs font-semibold text-[#A6344B] cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create / Edit Menu Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#140F17]/75 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={editingMenu ? 'Edit Menu' : 'Tambah Menu Baru'}
        >
          <div
            className="fixed inset-0"
            onClick={() => setIsModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[#FAF4F6] text-[#231A24] rounded-2xl p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between gap-4 mb-5">
              <h2 className="font-display text-xl sm:text-2xl font-semibold">
                {editingMenu ? 'Edit Data Menu' : 'Tambah Menu Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Tutup form menu"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#655568] hover:bg-[#EFE3E8] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formErrors.form && (
              <div
                role="alert"
                className="mb-4 p-3.5 rounded-xl bg-[#FDECEF] border border-[#D96B84] text-xs font-medium text-[#9B223E]"
              >
                {formErrors.form}
              </div>
            )}

            <form onSubmit={handleSaveMenu} noValidate className="space-y-4">
              {/* Image Upload Section */}
              <div>
                <label className="block text-xs font-semibold text-[#231A24] mb-1.5">
                  Foto Menu (JPG, PNG, WebP · Maks 3 MB)
                </label>
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="w-32 h-24 rounded-xl overflow-hidden bg-[#EFE3E8] shrink-0 border border-[#231A24]/10">
                    {imageUrl ? (
                      <MenuImage
                        src={imageUrl}
                        alt={name || 'Pratinjau menu'}
                        category={category}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-[#655568] text-xs p-2 text-center">
                        <ImagePlus className="w-5 h-5 mb-1 opacity-70" />
                        <span>Pratinjau</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2.5 w-full">
                    <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#231A24]/20 hover:bg-[#F2E8ED] text-xs font-semibold text-[#231A24] transition-colors cursor-pointer">
                      <ImagePlus className="w-4 h-4 text-[#9C3B5E]" />
                      <span>
                        {isUploadingImage
                          ? 'Mengunggah...'
                          : 'Unggah Gambar dari Perangkat'}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) =>
                          void handleFileUpload(e.target.files?.[0])
                        }
                        className="sr-only"
                      />
                    </label>

                    <div>
                      <p className="text-[11px] text-[#655568] mb-1.5">
                        {storageGallery.length > 0
                          ? 'Atau pilih foto dari Supabase Storage:'
                          : 'Atau pilih foto studio Do-Siti:'}
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                        {(storageGallery.length > 0
                          ? storageGallery
                          : PRESET_GALLERY
                        ).map((preset) => (
                          <button
                            key={preset.url}
                            type="button"
                            onClick={() => {
                              setImageUrl(preset.url);
                              setFormErrors((prev) => ({
                                ...prev,
                                imageUrl: undefined,
                              }));
                            }}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer max-w-[165px] ${
                              imageUrl === preset.url
                                ? 'bg-[#231A24] text-[#FAF4F6] border-[#231A24]'
                                : 'bg-white text-[#231A24] border-[#231A24]/15 hover:bg-[#EFE3E8]'
                            }`}
                          >
                            <img
                              src={preset.url}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-4 h-4 rounded object-cover shrink-0"
                            />
                            <span className="truncate">{preset.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                {formErrors.imageUrl && (
                  <p className="text-xs text-[#A6344B] mt-1.5 font-medium">
                    {formErrors.imageUrl}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="menu-name"
                    className="block text-xs font-semibold text-[#231A24] mb-1.5"
                  >
                    Nama Menu
                  </label>
                  <input
                    id="menu-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Brioche Berry Glaze"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24]"
                  />
                  {formErrors.name && (
                    <p className="text-xs text-[#A6344B] mt-1 font-medium">
                      {formErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="menu-category"
                    className="block text-xs font-semibold text-[#231A24] mb-1.5"
                  >
                    Kategori
                  </label>
                  <select
                    id="menu-category"
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as MenuCategory)
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24]"
                  >
                    <option value="Donat">Donat</option>
                    <option value="Minuman">Minuman</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="menu-price"
                    className="block text-xs font-semibold text-[#231A24] mb-1.5"
                  >
                    Harga (Rp)
                  </label>
                  <input
                    id="menu-price"
                    type="number"
                    min={1000}
                    step={500}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="24000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm font-mono tabular-nums text-[#231A24]"
                  />
                  {formErrors.price && (
                    <p className="text-xs text-[#A6344B] mt-1 font-medium">
                      {formErrors.price}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="menu-stock"
                    className="block text-xs font-semibold text-[#231A24] mb-1.5"
                  >
                    Stok Harian
                  </label>
                  <input
                    id="menu-stock"
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="15"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm font-mono tabular-nums text-[#231A24]"
                  />
                  {formErrors.stock && (
                    <p className="text-xs text-[#A6344B] mt-1 font-medium">
                      {formErrors.stock}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="menu-highlight"
                    className="block text-xs font-semibold text-[#231A24] mb-1.5"
                  >
                    Catatan Singkat (Opsional)
                  </label>
                  <input
                    id="menu-highlight"
                    type="text"
                    value={highlight}
                    onChange={(e) => setHighlight(e.target.value)}
                    placeholder="Misal: Favorit"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="menu-description"
                  className="block text-xs font-semibold text-[#231A24] mb-1.5"
                >
                  Deskripsi Rasa & Komposisi
                </label>
                <textarea
                  id="menu-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan tekstur, isian, atau racikan bahan..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24]"
                />
                {formErrors.description && (
                  <p className="text-xs text-[#A6344B] mt-1 font-medium">
                    {formErrors.description}
                  </p>
                )}
              </div>

              <label className="inline-flex items-center gap-2.5 text-sm text-[#231A24] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAvailable}
                  onChange={(e) => setIsAvailable(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#9C3B5E]"
                />
                <span>Tampilkan menu sebagai tersedia di katalog pelanggan</span>
              </label>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#231A24]/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#231A24]/15 hover:bg-[#EFE3E8] text-sm font-medium text-[#231A24] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isUploadingImage}
                  className="px-5 py-2.5 rounded-xl bg-[#231A24] hover:bg-[#382A3A] disabled:opacity-60 text-[#FAF4F6] text-sm font-semibold cursor-pointer"
                >
                  {isSaving
                    ? 'Menyimpan...'
                    : editingMenu
                      ? 'Simpan Perubahan'
                      : 'Simpan Menu Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#140F17]/75 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Hapus Menu"
        >
          <div
            className="fixed inset-0"
            onClick={() => setDeleteTarget(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md bg-[#FAF4F6] text-[#231A24] rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="font-display text-xl font-semibold">
              Hapus Menu "{deleteTarget.name}"?
            </h2>
            <p className="text-sm text-[#655568] leading-relaxed">
              Menu ini akan dihapus permanen dari katalog Do-Siti. Pesanan lama
              yang sudah masuk tetap tercatat di riwayat.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-[#231A24]/15 hover:bg-[#EFE3E8] text-sm font-medium cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2 rounded-xl bg-[#A6344B] hover:bg-[#8E2A3E] disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus Menu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
