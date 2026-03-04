'use client';

import { useEffect, useRef, useCallback } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    },
    [onCancel]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    confirmRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const confirmStyle =
    variant === 'danger' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-tribe-green text-slate-900 hover:bg-lime-500';

  return (
    <div
      data-confirm-dialog="true"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white dark:bg-[#404549] rounded-xl p-6 max-w-sm w-full shadow-xl">
        <h3 className="text-lg font-bold text-stone-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-stone-600 dark:text-gray-300 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            data-confirm-cancel="true"
            onClick={onCancel}
            className="flex-1 py-2.5 border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-700 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-[#52575D] font-medium"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-lg font-medium ${confirmStyle}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
