import { useCallback, useRef, useState } from 'react';

export type ToastType = 'info' | 'success' | 'warning';

export interface ToastItem {
  id: string;
  title: string;
  subtitle?: string;
  type: ToastType;
}

const AUTO_DISMISS_MS = 5000;

export function useToastQueue() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item: ToastItem = { ...toast, id };
    setToasts(prev => [...prev, item]);

    const timer = setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, [dismissToast]);

  return { toasts, pushToast, dismissToast };
}
