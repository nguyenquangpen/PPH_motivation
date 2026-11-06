import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { errorMessage, isNotFound } from '../api/client';

// ---------- Progress bar ----------
export function ProgressBar({ percent, overflow = 0, size = 'md', warn = false }: {
  percent: number; overflow?: number; size?: 'sm' | 'md' | 'lg'; warn?: boolean;
}) {
  const p = Math.max(0, Math.min(100, percent));
  const h = size === 'lg' ? 'h-4' : size === 'sm' ? 'h-2' : 'h-3';
  const color = p >= 100 ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-indigo-500';
  return (
    <div className="flex items-center gap-2">
      <div
        className={`relative w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${h}`}
        role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}
      >
        <div className={`${h} ${color} rounded-full transition-all`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums">{p.toFixed(1)}%</span>
      {overflow > 0 && (
        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          +{overflow} vượt mục tiêu
        </span>
      )}
    </div>
  );
}

// ---------- Badge ----------
const BADGE: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  blue: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
};
export function Badge({ children, color = 'gray', title }: { children: ReactNode; color?: keyof typeof BADGE | string; title?: string }) {
  return (
    <span title={title} className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${BADGE[color] ?? BADGE.gray}`}>
      {children}
    </span>
  );
}

// ---------- Messages ----------
export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
      {errorMessage(error)}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm muted">{children}</p>;
}

/** Renders loading / error / not-available states for a query, otherwise the children. */
export function QueryView<T>({ q, children, unavailable }: {
  q: UseQueryResult<T>; children: (data: T) => ReactNode; unavailable?: string;
}) {
  if (q.isPending) return <p className="py-3 text-sm muted">Đang tải…</p>;
  if (q.isError) {
    if (isNotFound(q.error)) return <Empty>{unavailable ?? 'Chưa có dữ liệu hoặc chức năng chưa sẵn sàng.'}</Empty>;
    return <ErrorText error={q.error} />;
  }
  return <>{children(q.data as T)}</>;
}

// ---------- Modal ----------
export function Modal({ title, onClose, children, width = 'max-w-lg' }: {
  title: string; onClose: () => void; children: ReactNode; width?: string;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-6" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={`card w-full ${width} mt-10`} onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Form field ----------
export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs muted">{hint}</span>}
    </label>
  );
}

// ---------- Pagination ----------
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm">
      <span className="muted">Trang {page}/{pages} · {total} mục</span>
      <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Trước</button>
      <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Sau ›</button>
    </div>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={`rounded-md px-3 py-2 text-sm shadow-lg ${t.kind === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
