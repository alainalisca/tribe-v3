/**
 * Route-level loading UI for /instructors.
 *
 * This file is Next.js' convention for an instant Suspense boundary
 * around the sibling page.tsx. When a user navigates to /instructors
 * (client-side navigation from another route), this skeleton renders
 * immediately while the Server Component fetches its data, then the
 * real content swaps in. No blank screen, no spinner flash.
 *
 * With `export const revalidate = 60` on page.tsx, this loader only
 * shows on cache-miss requests (first request per 60s window, or
 * cold-start). Steady-state traffic skips it entirely.
 */

import { SkeletonCard } from '@/components/Skeleton';

export default function InstructorsLoading() {
  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Fixed header — matches the real page so the layout doesn't shift. */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <div className="h-5 w-40 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        {/* Search input skeleton */}
        <div className="h-10 bg-stone-200 dark:bg-tribe-mid rounded-lg animate-pulse" />

        {/* Filter pills row */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-20 shrink-0 bg-stone-200 dark:bg-tribe-mid rounded-full animate-pulse" />
          ))}
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
