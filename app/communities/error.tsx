'use client';

/**
 * Error boundary for /communities.
 *
 * Rendered when the Server Component's parallel fetches throw (both user
 * communities + discover list) OR when the client component throws post-
 * hydration. See /instructors/error.tsx for the broader pattern rationale.
 */

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';

export default function CommunitiesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[CommunitiesError]', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-screen bg-white dark:bg-tribe-surface pb-24">
      <div className="sticky top-0 bg-white dark:bg-tribe-surface border-b border-gray-200 dark:border-tribe-mid z-40">
        <div className="max-w-2xl md:max-w-4xl mx-auto px-4 pt-4 pb-4">
          <h1 className="text-2xl font-bold text-theme-primary">Communities</h1>
        </div>
      </div>

      <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-6 flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-theme-primary mb-2">Something went wrong</h2>
        <p className="text-sm text-theme-secondary mb-6 max-w-sm">
          We couldn&apos;t load communities right now. The issue has been logged.
        </p>
        <Button onClick={reset} className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold hover:bg-tribe-green">
          Try again
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
