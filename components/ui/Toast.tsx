import React, { useEffect, useState } from 'react';
import { Icons } from '../Icon';
import { uid } from '../../utils/id';

export type ToastKind = 'info' | 'success' | 'error';

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

const TOAST_EVENT = 'chromacanvas:toast';

/** Fire a toast from anywhere (components, services, event handlers). */
export const toast = (message: string, kind: ToastKind = 'info'): void => {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, kind } }));
};

const KIND_STYLES: Record<ToastKind, string> = {
  info: 'border-zinc-700 text-zinc-100',
  success: 'border-lime-600/60 text-lime-200',
  error: 'border-red-600/60 text-red-200',
};

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
  info: <Icons.Sparkles size={14} className="text-zinc-400 shrink-0" />,
  success: <Icons.Check size={14} className="text-lime-400 shrink-0" />,
  error: <Icons.X size={14} className="text-red-400 shrink-0" />,
};

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; kind: ToastKind }>).detail;
      const item: ToastItem = { id: uid(), kind: detail.kind, message: detail.message };
      setToasts((prev) => [...prev.slice(-3), item]);
      const ttl = detail.kind === 'error' ? 6500 : 3800;
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, ttl);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toast-in pointer-events-auto flex items-center gap-2 rounded-lg border bg-zinc-950/95 px-4 py-2.5 text-xs font-medium shadow-2xl backdrop-blur max-w-md ${KIND_STYLES[t.kind]}`}
        >
          {KIND_ICON[t.kind]}
          <span className="leading-snug">{t.message}</span>
          <button
            className="ml-2 text-zinc-500 hover:text-white"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          >
            <Icons.X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};
