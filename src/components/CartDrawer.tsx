import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ImagePlus,
  Minus,
  Plus,
  QrCode,
  ShoppingBag,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useRestockCountdown } from '../hooks/useRestockCountdown';
import { ApiError } from '../services/apiClient';
import { menuService } from '../services/menuService';
import { orderService } from '../services/orderService';
import { PAYMENT_METHOD_LIST } from '../types';
import type {
  AppRoute,
  DeliveryMethod,
  Order,
  PaymentMethod,
} from '../types';
import {
  formatCountdown,
  formatRupiah,
  getRemainingRestockMs,
  isValidPhone,
} from '../utils/format';
import { MenuImage } from './MenuImage';

interface CartDrawerProps {
  onNavigate: (route: AppRoute) => void;
  onOrderCreated: (order: Order) => void;
  onStockSync: () => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

interface CheckoutErrors {
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  form?: string;
}

const EWALLET_NUMBER = '08895366579508';
const QRIS_STORAGE_KEY = 'dositi_custom_qris_url';

function QrisPlaceholderSvg() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="w-36 h-36 mx-auto text-[#231A24]"
      role="img"
      aria-label="Placeholder kode QRIS Do-Siti"
    >
      <rect width="120" height="120" rx="8" fill="#FFFFFF" />
      {/* Corner finder squares */}
      <path
        fill="currentColor"
        d="M12 12h28v28H12V12zm5 5v18h18V17H17zm5 5h8v8h-8v-8zM80 12h28v28H80V12zm5 5v18h18V17H85zm5 5h8v8h-8v-8zM12 80h28v28H12V80zm5 5v18h18V85H17zm5 5h8v8h-8v-8z"
      />
      {/* Timing & data modules */}
      <path
        fill="currentColor"
        d="M46 14h6v6h-6v-6zm12 0h6v6h-6v-6zm10 6h6v6h-6v-6zm-16 6h12v6H52v-6zm-6 10h6v6h-6v-6zm12 0h10v6H58v-6zM14 48h6v6h-6v-6zm12 0h10v6H26v-6zm16 0h6v12h-6V48zm12 4h12v6H54v-6zm18-4h6v10h-6V48zm12 0h6v6h-6v-6zm12 0h12v6H96v-6zm-76 14h10v6H20v-6zm16 0h6v10h-6V62zm18 4h10v6H54v-6zm16-4h12v6H70v-6zm18 6h6v10h-6V68zm12-6h8v6h-8v-6zM48 80h6v10h-6V80zm12 0h12v6H60v-6zm18 6h6v6h-6v-6zm12-6h6v12h-6V80zm12 0h6v6h-6v-6zm-48 16h12v6H54v-6zm18 0h6v10h-6V96zm12 6h12v6H84v-6zm18-6h6v12h-6V96z"
      />
    </svg>
  );
}

export function CartDrawer({
  onNavigate,
  onOrderCreated,
  onStockSync,
  onNotify,
}: CartDrawerProps) {
  const { user } = useAuth();
  const {
    items,
    subtotal,
    isDrawerOpen,
    closeDrawer,
    updateQuantity,
    removeItem,
    clearCart,
    syncCartWithMenus,
  } = useCart();

  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>('Ambil di Toko');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  const [copiedEwallet, setCopiedEwallet] = useState(false);
  const [showQrisConfig, setShowQrisConfig] = useState(false);
  const [customQrisUrl, setCustomQrisUrl] = useState<string>(() => {
    const envQris = (import.meta.env.VITE_QRIS_IMAGE_URL || '').trim();
    if (envQris) return envQris;
    try {
      return localStorage.getItem(QRIS_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [qrisInput, setQrisInput] = useState('');
  const [qrisLoadError, setQrisLoadError] = useState(false);

  const refreshCartMenus = useCallback(async () => {
    try {
      const freshMenus = await menuService.getMenus();
      syncCartWithMenus(freshMenus);
      onStockSync();
    } catch {
      // Ignore background refresh failures
    }
  }, [syncCartWithMenus, onStockSync]);

  const cartMenus = useMemo(() => items.map((i) => i.menu), [items]);
  const nowMs = useRestockCountdown(cartMenus, refreshCartMenus);

  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.name || '');
      setCustomerPhone((prev) => prev || user.phone || '');
      setCustomerAddress((prev) => prev || user.address || '');
    }
  }, [user]);

  useEffect(() => {
    if (isDrawerOpen) {
      void refreshCartMenus();
    } else {
      setConfirmedOrder(null);
      setErrors({});
      setCopiedEwallet(false);
      setShowQrisConfig(false);
    }
  }, [isDrawerOpen, refreshCartMenus]);

  const hasUnavailableItems = items.some(
    (item) =>
      !item.menu.isAvailable ||
      item.menu.stock <= 0 ||
      item.quantity > item.menu.stock,
  );

  if (!isDrawerOpen) return null;

  const deliveryFee = deliveryMethod === 'Antar ke Alamat' ? 10000 : 0;
  const total = subtotal + deliveryFee;

  const handleCopyEwallet = async () => {
    try {
      await navigator.clipboard.writeText(EWALLET_NUMBER);
      setCopiedEwallet(true);
      onNotify('success', `Nomor E-Wallet ${EWALLET_NUMBER} berhasil disalin.`);
      window.setTimeout(() => setCopiedEwallet(false), 2500);
    } catch {
      onNotify(
        'error',
        `Salin manual nomor E-Wallet: ${EWALLET_NUMBER}`,
      );
    }
  };

  const handleSaveCustomQris = () => {
    const trimmed = qrisInput.trim();
    setCustomQrisUrl(trimmed);
    setQrisLoadError(false);
    try {
      if (trimmed) {
        localStorage.setItem(QRIS_STORAGE_KEY, trimmed);
      } else {
        localStorage.removeItem(QRIS_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures
    }
    setShowQrisConfig(false);
    onNotify(
      'success',
      trimmed
        ? 'Gambar QRIS toko berhasil diperbarui.'
        : 'Gambar QRIS dikembalikan ke tampilan standar.',
    );
  };

  const handleQrisFileUpload = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotify('error', 'File QRIS harus berupa gambar (JPG, PNG, atau WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setCustomQrisUrl(dataUrl);
      setQrisLoadError(false);
      try {
        localStorage.setItem(QRIS_STORAGE_KEY, dataUrl);
      } catch {
        // Ignore quota errors
      }
      setShowQrisConfig(false);
      onNotify('success', 'Gambar QRIS asli toko berhasil dipasang.');
    };
    reader.readAsDataURL(file);
  };

  const validate = (): boolean => {
    const nextErrors: CheckoutErrors = {};

    if (items.length === 0) {
      nextErrors.form = 'Keranjang masih kosong. Pilih menu terlebih dahulu.';
    }
    if (customerName.trim().length < 2) {
      nextErrors.customerName = 'Nama pemesan minimal 2 karakter.';
    }
    if (!isValidPhone(customerPhone)) {
      nextErrors.customerPhone =
        'Masukkan nomor WhatsApp/HP yang valid (9–15 digit angka).';
    }
    if (
      deliveryMethod === 'Antar ke Alamat' &&
      customerAddress.trim().length < 8
    ) {
      nextErrors.customerAddress =
        'Alamat lengkap wajib diisi minimal 8 karakter untuk pengantaran.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!user) {
      closeDrawer();
      onNotify(
        'error',
        'Silakan masuk terlebih dahulu untuk membuat pesanan.',
      );
      onNavigate('masuk');
      return;
    }

    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});
    try {
      const created = await orderService.createOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress:
          deliveryMethod === 'Antar ke Alamat'
            ? customerAddress.trim()
            : '',
        deliveryMethod,
        paymentMethod,
        notes: notes.trim() || undefined,
        items: items.map((item) => ({
          menuId: item.menu.id,
          quantity: item.quantity,
          note: item.note,
        })),
      });

      clearCart();
      setConfirmedOrder(created);
      onOrderCreated(created);
      onNotify(
        'success',
        `Pesanan #${created.orderNumber} (${created.paymentMethod}) berhasil dikirim.`,
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Terjadi kesalahan saat membuat pesanan.';
      setErrors({ form: msg });
      void refreshCartMenus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPaymentIcon = (method: PaymentMethod) => {
    switch (method) {
      case 'COD':
        return <Banknote className="w-4 h-4 shrink-0" />;
      case 'QRIS':
        return <QrCode className="w-4 h-4 shrink-0" />;
      case 'E-Wallet':
        return <Smartphone className="w-4 h-4 shrink-0" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#140F17]/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Keranjang Pesanan"
    >
      <div
        className="fixed inset-0"
        onClick={closeDrawer}
        aria-hidden="true"
      />
      <aside className="relative z-10 w-full max-w-md bg-[#FAF4F6] text-[#231A24] h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-[#231A24]/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#9C3B5E]" />
            <h2 className="font-display text-xl font-semibold">
              {confirmedOrder ? 'Konfirmasi Pesanan' : 'Keranjang Pesanan'}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Tutup keranjang"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#655568] hover:text-[#231A24] hover:bg-[#EFE3E8] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {confirmedOrder ? (
            <div className="space-y-6">
              <div className="p-5 rounded-xl bg-[#F2E8ED] border border-[#E7A1B7]/60">
                <div className="flex items-center gap-2.5 text-[#1E6B41] font-semibold text-sm mb-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>Pesanan Berhasil Dibuat</span>
                </div>
                <p className="font-display text-2xl font-semibold tabular-nums mb-1">
                  #{confirmedOrder.orderNumber}
                </p>
                <p className="text-sm text-[#655568]">
                  Pesanan Anda sedang menunggu konfirmasi dapur. Anda dapat
                  memantau statusnya kapan saja di Riwayat Pesanan.
                </p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-[#655568]">
                  <span>Pemesan</span>
                  <span className="font-medium text-[#231A24]">
                    {confirmedOrder.customerName}
                  </span>
                </div>
                <div className="flex justify-between text-[#655568]">
                  <span>Pengambilan</span>
                  <span className="font-medium text-[#231A24]">
                    {confirmedOrder.deliveryMethod}
                  </span>
                </div>
                <div className="flex justify-between text-[#655568]">
                  <span>Metode Pembayaran</span>
                  <span className="font-semibold text-[#9C3B5E]">
                    {confirmedOrder.paymentMethod}
                  </span>
                </div>
                <div className="border-t border-[#231A24]/10 pt-3 space-y-2">
                  {confirmedOrder.items.map((item) => (
                    <div
                      key={item.menuId}
                      className="flex justify-between gap-3"
                    >
                      <span className="text-[#231A24]">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="font-mono tabular-nums text-[#231A24]">
                        {formatRupiah(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#231A24]/10 pt-3 flex justify-between font-semibold text-base">
                  <span>Total Pembayaran</span>
                  <span className="font-mono tabular-nums text-[#9C3B5E]">
                    {formatRupiah(confirmedOrder.total)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    closeDrawer();
                    onNavigate('riwayat');
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-[#231A24] hover:bg-[#382A3A] text-[#FAF4F6] text-sm font-semibold transition-colors cursor-pointer"
                >
                  Lihat Riwayat Pesanan
                </button>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="w-full py-2.5 px-4 rounded-xl border border-[#231A24]/15 hover:bg-[#EFE3E8] text-[#231A24] text-sm font-medium transition-colors cursor-pointer"
                >
                  Lanjut Belanja
                </button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#F2E8ED] text-[#9C3B5E] flex items-center justify-center mx-auto">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold mb-1">
                  Keranjang Masih Kosong
                </h3>
                <p className="text-sm text-[#655568] max-w-xs mx-auto">
                  Tambahkan donat brioche atau minuman craft favorit Anda dari
                  katalog menu.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeDrawer();
                  onNavigate('katalog');
                }}
                className="px-5 py-2.5 rounded-lg bg-[#231A24] hover:bg-[#382A3A] text-[#FAF4F6] text-sm font-semibold transition-colors cursor-pointer"
              >
                Jelajahi Menu
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Item List */}
              <ul className="divide-y divide-[#231A24]/10">
                {items.map((item) => {
                  const isRestocking =
                    item.menu.isAvailable && item.menu.stock <= 0;
                  const isUnavailable =
                    !item.menu.isAvailable || item.menu.stock <= 0;
                  const countdown = formatCountdown(
                    getRemainingRestockMs(item.menu.restockAvailableAt, nowMs),
                  );

                  return (
                    <li key={item.menu.id} className="py-3.5 flex gap-3.5">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#EFE3E8] shrink-0">
                        <MenuImage
                          src={item.menu.imageUrl}
                          alt={item.menu.name}
                          category={item.menu.category}
                          className={`w-full h-full object-cover ${
                            isUnavailable ? 'opacity-65 grayscale-[20%]' : ''
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-[#231A24] truncate">
                            {item.menu.name}
                          </h3>
                          <button
                            type="button"
                            onClick={() => removeItem(item.menu.id)}
                            aria-label={`Hapus ${item.menu.name}`}
                            className="p-1 text-[#655568] hover:text-[#A6344B] transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-[#655568] mt-0.5 tabular-nums">
                          {item.menu.category} ·{' '}
                          <span className="font-mono">
                            {formatRupiah(item.menu.price)}
                          </span>{' '}
                          ·{' '}
                          {isRestocking ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#A6344B]">
                              <Clock className="w-3 h-3" />
                              <span>Habis · Restock {countdown}</span>
                            </span>
                          ) : !item.menu.isAvailable ? (
                            <span className="font-semibold text-[#A6344B]">
                              Tidak tersedia
                            </span>
                          ) : (
                            <span>Stok {item.menu.stock}</span>
                          )}
                        </p>
                        {item.note && (
                          <p className="text-xs text-[#9C3B5E] mt-1 truncate">
                            Catatan: {item.note}
                          </p>
                        )}
                        <div className="mt-2.5 flex items-center justify-between">
                          <div className="inline-flex items-center border border-[#231A24]/15 rounded-lg bg-white">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(item.menu.id, item.quantity - 1)
                              }
                              aria-label="Kurangi jumlah"
                              className="w-8 h-8 flex items-center justify-center text-[#231A24] hover:bg-[#F2E8ED] rounded-l-lg cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center text-xs font-mono font-semibold tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(item.menu.id, item.quantity + 1)
                              }
                              disabled={
                                isUnavailable || item.quantity >= item.menu.stock
                              }
                              aria-label="Tambah jumlah"
                              className="w-8 h-8 flex items-center justify-center text-[#231A24] hover:bg-[#F2E8ED] disabled:opacity-40 rounded-r-lg cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-sm font-mono font-semibold tabular-nums text-[#231A24]">
                            {formatRupiah(item.menu.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Checkout Form */}
              <form
                id="checkout-form"
                onSubmit={handlePlaceOrder}
                noValidate
                className="space-y-4 pt-3 border-t border-[#231A24]/10"
              >
                <h3 className="text-sm font-semibold text-[#231A24]">
                  Detail Pengambilan & Pemesan
                </h3>

                {!user && (
                  <div className="p-3.5 rounded-xl bg-[#F2E8ED] border border-[#E7A1B7]/60 text-xs text-[#231A24] leading-relaxed">
                    Anda belum masuk. Klik tombol buat pesanan di bawah untuk
                    masuk atau daftar; keranjang Anda tetap tersimpan.
                  </div>
                )}

                {errors.form && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-[#FDECEF] border border-[#D96B84] text-xs font-medium text-[#9B223E]"
                  >
                    {errors.form}
                  </div>
                )}

                {/* Delivery Method */}
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#EFE3E8]">
                  {(['Ambil di Toko', 'Antar ke Alamat'] as DeliveryMethod[]).map(
                    (method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setDeliveryMethod(method)}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          deliveryMethod === method
                            ? 'bg-white text-[#231A24] shadow-xs'
                            : 'text-[#655568] hover:text-[#231A24]'
                        }`}
                      >
                        {method}
                      </button>
                    ),
                  )}
                </div>

                <div>
                  <label
                    htmlFor="checkout-name"
                    className="block text-xs font-semibold text-[#231A24] mb-1.5"
                  >
                    Nama Pemesan
                  </label>
                  <input
                    id="checkout-name"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Nadia Putri"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24] placeholder:text-[#98879B]"
                  />
                  {errors.customerName && (
                    <p className="text-xs text-[#A6344B] mt-1 font-medium">
                      {errors.customerName}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="checkout-phone"
                    className="block text-xs font-semibold text-[#231A24] mb-1.5"
                  >
                    Nomor WhatsApp / HP
                  </label>
                  <input
                    id="checkout-phone"
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24] placeholder:text-[#98879B]"
                  />
                  {errors.customerPhone && (
                    <p className="text-xs text-[#A6344B] mt-1 font-medium">
                      {errors.customerPhone}
                    </p>
                  )}
                </div>

                {deliveryMethod === 'Antar ke Alamat' && (
                  <div>
                    <label
                      htmlFor="checkout-address"
                      className="block text-xs font-semibold text-[#231A24] mb-1.5"
                    >
                      Alamat Pengantaran
                    </label>
                    <textarea
                      id="checkout-address"
                      rows={2}
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="Nama jalan, nomor rumah, patokan..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24] placeholder:text-[#98879B]"
                    />
                    {errors.customerAddress && (
                      <p className="text-xs text-[#A6344B] mt-1 font-medium">
                        {errors.customerAddress}
                      </p>
                    )}
                  </div>
                )}

                {/* Payment Method Selection (Strictly COD, QRIS, E-Wallet) */}
                <div className="pt-2 border-t border-[#231A24]/10 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#231A24]">
                      Metode Pembayaran
                    </h3>
                    <p className="text-xs text-[#655568] mt-0.5">
                      Pilih salah satu metode pembayaran yang tersedia.
                    </p>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label="Pilihan metode pembayaran"
                    className="grid grid-cols-3 gap-2"
                  >
                    {PAYMENT_METHOD_LIST.map((method) => {
                      const active = paymentMethod === method;
                      return (
                        <button
                          key={method}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setPaymentMethod(method)}
                          className={`py-2.5 px-2 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#231A24] text-[#FAF4F6] border-[#231A24]'
                              : 'bg-white text-[#231A24] border-[#231A24]/15 hover:bg-[#F2E8ED]'
                          }`}
                        >
                          {renderPaymentIcon(method)}
                          <span className="whitespace-nowrap">{method}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* COD Detail */}
                  {paymentMethod === 'COD' && (
                    <div className="p-3.5 rounded-xl bg-[#F2E8ED] border border-[#231A24]/10 text-xs text-[#231A24] leading-relaxed">
                      <p className="font-semibold mb-1">
                        COD (Bayar di Tempat)
                      </p>
                      <p className="text-[#655568]">
                        Pembayaran dilakukan secara tunai saat pesanan diambil
                        di toko atau diterima langsung dari kurir.
                      </p>
                    </div>
                  )}

                  {/* QRIS Detail */}
                  {paymentMethod === 'QRIS' && (
                    <div className="p-4 rounded-xl bg-white border border-[#231A24]/15 space-y-3 text-center">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#231A24]">
                          QRIS Do-Siti Patisserie
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setQrisInput(customQrisUrl);
                            setShowQrisConfig((prev) => !prev);
                          }}
                          className="text-[11px] font-semibold text-[#9C3B5E] hover:underline cursor-pointer"
                        >
                          {showQrisConfig ? 'Tutup' : 'Ganti Gambar QRIS'}
                        </button>
                      </div>

                      <div className="p-3 rounded-xl bg-[#FAF4F6] border border-[#231A24]/10 inline-block">
                        {customQrisUrl && !qrisLoadError ? (
                          <img
                            src={customQrisUrl}
                            alt="Kode QRIS Do-Siti"
                            referrerPolicy="no-referrer"
                            onError={() => setQrisLoadError(true)}
                            className="w-40 h-40 object-contain mx-auto rounded-lg"
                          />
                        ) : (
                          <QrisPlaceholderSvg />
                        )}
                      </div>

                      <p className="text-xs font-medium text-[#231A24]">
                        Scan kode QRIS di atas sesuai total pembayaran (
                        <span className="font-mono font-semibold tabular-nums text-[#9C3B5E]">
                          {formatRupiah(total)}
                        </span>
                        )
                      </p>

                      {!customQrisUrl && (
                        <p className="text-[11px] text-[#655568] leading-relaxed">
                          Tampilan ini menggunakan kode QRIS contoh. Klik{' '}
                          <span className="font-semibold">Ganti Gambar QRIS</span>{' '}
                          atau atur <span className="font-mono">VITE_QRIS_IMAGE_URL</span>{' '}
                          untuk memasang gambar QRIS asli toko.
                        </p>
                      )}

                      {showQrisConfig && (
                        <div className="pt-2 border-t border-[#231A24]/10 text-left space-y-2.5">
                          <label className="block text-[11px] font-semibold text-[#231A24]">
                            Unggah atau tempel URL gambar QRIS asli toko
                          </label>
                          <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EFE3E8] hover:bg-[#E6D5DD] text-[11px] font-semibold text-[#231A24] cursor-pointer shrink-0">
                              <ImagePlus className="w-3.5 h-3.5 text-[#9C3B5E]" />
                              <span>Pilih File</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  handleQrisFileUpload(e.target.files?.[0])
                                }
                                className="sr-only"
                              />
                            </label>
                            <input
                              type="url"
                              value={qrisInput}
                              onChange={(e) => setQrisInput(e.target.value)}
                              placeholder="https://... atau kosongkan"
                              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#FAF4F6] border border-[#231A24]/15 text-xs text-[#231A24]"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={handleSaveCustomQris}
                              className="px-3 py-1.5 rounded-lg bg-[#231A24] text-[#FAF4F6] text-[11px] font-semibold cursor-pointer"
                            >
                              Terapkan QRIS
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* E-Wallet Detail */}
                  {paymentMethod === 'E-Wallet' && (
                    <div className="p-4 rounded-xl bg-[#F2E8ED] border border-[#E7A1B7]/60 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-[#231A24]">
                            Transfer E-Wallet
                          </p>
                          <p className="text-[11px] text-[#655568]">
                            Mendukung DANA / OVO / GoPay / ShopeePay
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-[#231A24]/10">
                        <span className="font-mono text-sm font-semibold tabular-nums text-[#231A24] select-all">
                          {EWALLET_NUMBER}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopyEwallet()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#231A24] hover:bg-[#382A3A] text-[#FAF4F6] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {copiedEwallet ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-[#E7A1B7]" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Salin Nomor</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="checkout-notes"
                    className="block text-xs font-semibold text-[#231A24] mb-1.5"
                  >
                    Catatan Tambahan (Opsional)
                  </label>
                  <input
                    id="checkout-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Misal: kurang es, atau kartu ucapan singkat"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#231A24]/15 text-sm text-[#231A24] placeholder:text-[#98879B]"
                  />
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        {!confirmedOrder && items.length > 0 && (
          <div className="px-6 py-5 border-t border-[#231A24]/10 bg-[#F2E8ED] space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[#655568]">
                <span>Subtotal Menu</span>
                <span className="font-mono tabular-nums text-[#231A24]">
                  {formatRupiah(subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-[#655568]">
                <span>Ongkos Kirim</span>
                <span className="font-mono tabular-nums text-[#231A24]">
                  {deliveryFee > 0 ? formatRupiah(deliveryFee) : 'Gratis'}
                </span>
              </div>
              <div className="flex justify-between text-base font-semibold text-[#231A24] pt-1.5 border-t border-[#231A24]/10">
                <span>Total ({paymentMethod})</span>
                <span className="font-mono tabular-nums text-[#9C3B5E]">
                  {formatRupiah(total)}
                </span>
              </div>
            </div>

            {hasUnavailableItems && (
              <p className="text-xs font-medium text-[#A6344B]">
                Ada item di keranjang yang stoknya sedang habis atau melebihi
                stok tersedia. Hapus item habis atau tunggu timer restock
                selesai.
              </p>
            )}

            <button
              type="submit"
              form="checkout-form"
              disabled={isSubmitting || hasUnavailableItems}
              className="w-full py-3 px-4 rounded-xl bg-[#231A24] hover:bg-[#382A3A] disabled:opacity-60 text-[#FAF4F6] text-sm font-semibold transition-colors cursor-pointer"
            >
              {isSubmitting
                ? 'Memproses Pesanan...'
                : hasUnavailableItems
                  ? 'Periksa Stok Item di Keranjang'
                  : user
                    ? 'Buat Pesanan Sekarang'
                    : 'Masuk & Buat Pesanan'}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
