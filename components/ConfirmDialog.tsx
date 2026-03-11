'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';

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
          <Button
            data-confirm-cancel="true"
            variant="outline"
            onClick={onCancel}
            className="flex-1 py-2.5 border-stone-300 dark:border-[#52575D] text-stone-700 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-[#52575D] font-medium rounded-lg"
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            onClick={onConfirm}
            variant={variant === 'danger' ? 'destructive' : 'default'}
            className="flex-1 py-2.5 rounded-lg font-medium"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
