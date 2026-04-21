'use client';

/**
 * Error boundary for /product/[id].
 *
 * Note: the not-found case is handled by Next.js' notFound() in page.tsx
 * and routes to the app's 404 boundary, not here. This file only catches
 * unexpected throws (DB connectivity, instructor-fetch failure that's
 * now fatal, client-side render crashes).
 */

import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';

export default function ProductError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[ProductError]', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <button onClick={() => history.back()} className="mr-3" aria-label="Go back">
            <ArrowLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-lg font-bold text-theme-primary">Product</h1>
        </div>
      </div>

      <div className="pt-header flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-theme-primary mb-2">Something went wrong</h2>
        <p className="text-sm text-theme-secondary mb-6 max-w-sm">
          We couldn&apos;t load this product. If it keeps happening, try again later or browse other listings.
        </p>
        <Button onClick={reset} className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold hover:bg-tribe-green">
          Try again
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
