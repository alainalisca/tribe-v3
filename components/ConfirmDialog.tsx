'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

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

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
  }, [open]);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        data-confirm-dialog="true"
        data-modal="true"
        className="bg-white dark:bg-tribe-surface rounded-xl p-6 max-w-sm w-full shadow-xl"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold text-stone-900 dark:text-white">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-stone-600 dark:text-gray-300">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-row gap-3 sm:space-x-0">
          <AlertDialogCancel
            data-confirm-cancel="true"
            onClick={onCancel}
            className="flex-1 py-2.5 border-stone-300 dark:border-tribe-mid text-stone-700 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-tribe-mid font-medium rounded-lg"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            ref={confirmRef}
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-lg font-medium ${
              variant === 'danger' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''
            }`}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
