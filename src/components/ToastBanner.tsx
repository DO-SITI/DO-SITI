import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  text: string;
}

interface ToastBannerProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function ToastBanner({ toast, onDismiss }: ToastBannerProps) {
  if (!toast) return null;

  const isSuccess = toast.type === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 max-w-sm w-[calc(100%-2.5rem)] sm:w-auto"
    >
      <div
        className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border shadow-lg transition-all ${
          isSuccess
            ? 'bg-[#FAF4F6] text-[#231A24] border-[#E7A1B7]'
            : 'bg-[#3B2129] text-[#FCEBF0] border-[#D96B84]'
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 className="w-5 h-5 text-[#9C3B5E] shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="w-5 h-5 text-[#F49CAF] shrink-0 mt-0.5" />
        )}
        <p className="text-sm font-medium leading-snug flex-1">{toast.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup pemberitahuan"
          className="p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
