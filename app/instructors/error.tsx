'use client';

/**
 * Error boundary for /instructors.
 *
 * Rendered when either (a) the Server Component throws during the
 * server-side fetch, or (b) the client component throws after hydration.
 * Without this file, such errors propagate to the global error boundary
 * which is a hard reload — this gives the user a contained recovery with
 * a "try again" button that calls Next.js' `reset()` to re-invoke the
 * Server Component's fetch.
 *
 * `useEffect` reports the error to our logger on first render. It's a
 * client component (Next.js requirement for error boundaries), so we
 * can't use the server-side logger directly; `reportClientError`
 * POSTs to a logging endpoint.
 */

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';

export default function InstructorsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side logging. Next.js' `error.digest` is a server-generated
    // correlation id; include it so server logs can be joined with this
    // client error.
    console.error('[InstructorsError]', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-xl font-bold text-theme-primary">Discover Instructors</h1>
        </div>
      </div>

      <div className="pt-header flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-theme-primary mb-2">Something went wrong</h2>
        <p className="text-sm text-theme-secondary mb-6 max-w-sm">
          We couldn&apos;t load the instructor list. The issue has been logged.
        </p>
        <Button onClick={reset} className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold hover:bg-tribe-green">
          Try again
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
