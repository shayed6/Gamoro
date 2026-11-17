import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-2), { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lg transition-all animate-slide-in ${
              t.variant === 'error'
                ? 'border-red-200 bg-red-600 text-white dark:border-red-800 dark:bg-red-700'
                : t.variant === 'success'
                ? 'border-emerald-200 bg-emerald-700 text-white dark:border-emerald-700 dark:bg-emerald-800'
                : 'border-slate-200 bg-slate-900 text-white dark:border-slate-700 dark:bg-slate-800'
            }`}
          >
            {t.variant === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {t.variant === 'error' && <AlertCircle className="h-4 w-4 shrink-0" />}
            {t.variant === 'info' && <Info className="h-4 w-4 shrink-0" />}
            <span className="leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="বন্ধ করুন"
              className="ml-1 rounded-md p-0.5 opacity-80 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
