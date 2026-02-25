'use client';

import { logError } from '@/lib/logger';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  logError(error, { action: 'error_boundary', route: 'app/error' });

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-[#52575D] p-4">
      <div className="text-center">
        <div className="text-5xl mb-4">😵</div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-2">Something went wrong</h2>
        <p className="text-stone-600 dark:text-stone-300 mb-6">Don&apos;t worry, your data is safe.</p>
        <button
          onClick={reset}
          className="bg-[#9EE551] text-black font-semibold px-6 py-3 rounded-xl hover:bg-[#8FD642] transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
