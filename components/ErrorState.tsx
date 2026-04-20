'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * UI-L03: shared error-state component with retry CTA. Replaces the
 * common pattern of catching errors, logging them, and rendering
 * nothing — users had no way to recover without a full refresh.
 */
interface ErrorStateProps {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry: () => void;
  className?: string;
}

export default function ErrorState({
  title = 'Something went wrong',
  message = 'Please try again in a moment.',
  retryLabel = 'Try again',
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-16 min-h-[40vh] ${className}`}>
      <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
        <AlertCircle className="w-7 h-7 text-red-500" />
      </div>
      <p className="text-base font-semibold text-theme-primary">{title}</p>
      <p className="text-sm text-theme-secondary mt-2 max-w-xs leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-100 dark:bg-tribe-surface text-theme-primary text-sm font-semibold hover:bg-stone-200 dark:hover:bg-tribe-mid transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        {retryLabel}
      </button>
    </div>
  );
}
