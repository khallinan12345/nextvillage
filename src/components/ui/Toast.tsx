import React from 'react';
import { X, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import classNames from 'classnames';
import type { ToastItem, ToastType } from '../../hooks/useToastQueue';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<ToastType, { border: string; icon: React.ReactNode; title: string }> = {
  success: {
    border: 'border-emerald-200',
    icon: <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />,
    title: 'text-emerald-900',
  },
  info: {
    border: 'border-blue-200',
    icon: <Info size={16} className="text-blue-600 flex-shrink-0" />,
    title: 'text-blue-900',
  },
  warning: {
    border: 'border-amber-200',
    icon: <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />,
    title: 'text-amber-900',
  },
};

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full sm:w-96"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const styles = TYPE_STYLES[toast.type];
        return (
          <div
            key={toast.id}
            role="alert"
            className={classNames(
              'pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg',
              'animate-[slideIn_0.3s_ease-out]',
              styles.border,
            )}
          >
            {styles.icon}
            <div className="flex-1 min-w-0">
              <p className={classNames('text-sm font-semibold', styles.title)}>{toast.title}</p>
              {toast.subtitle && (
                <p className="text-xs text-gray-500 mt-0.5">{toast.subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
