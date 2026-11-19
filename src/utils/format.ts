export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  return /^[0-9+\s-]{9,16}$/.test(phone.trim());
}

export const RESTOCK_DURATION_MS = 5 * 60 * 1000;
export const RESTOCK_MIN_STOCK = 8;
export const RESTOCK_MAX_STOCK = 25;

export function getRemainingRestockMs(
  restockAvailableAt?: string | null,
  nowMs: number = Date.now(),
): number {
  if (!restockAvailableAt) return 0;
  const target = Date.parse(restockAvailableAt);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, target - nowMs);
}

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function generateDifferentRestockStock(
  previousValues: Array<number | null | undefined>,
): number {
  const excluded = new Set(
    previousValues.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
    ),
  );
  const candidates: number[] = [];
  for (let n = RESTOCK_MIN_STOCK; n <= RESTOCK_MAX_STOCK; n += 1) {
    if (!excluded.has(n)) {
      candidates.push(n);
    }
  }
  if (candidates.length === 0) {
    return RESTOCK_MIN_STOCK;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}
