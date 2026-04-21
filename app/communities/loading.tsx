/**
 * Route-level loading UI for /communities.
 *
 * Renders immediately on client-side navigation while the Server
 * Component fetches user + discover communities in parallel. See
 * /instructors/loading.tsx for the broader rationale on this pattern.
 *
 * Layout mirrors the real page (header, tab switcher, search bar,
 * instructor banner, pill row, card grid) so the shift-to-real-content
 * is a smooth crossfade rather than a jarring reflow.
 */

import { SkeletonCard } from '@/components/Skeleton';

export default function CommunitiesLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-tribe-surface pb-24">
      <div className="sticky top-0 bg-white dark:bg-tribe-surface border-b border-gray-200 dark:border-tribe-mid z-40">
        <div className="max-w-2xl md:max-w-4xl mx-auto px-4 pt-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="h-7 w-36 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
            <div className="h-9 w-28 bg-stone-200 dark:bg-tribe-mid rounded-lg animate-pulse" />
          </div>
          {/* Tab switcher shell */}
          <div className="h-10 bg-stone-100 dark:bg-tribe-dark rounded-lg animate-pulse" />
          {/* Search bar shell */}
          <div className="mt-3 pb-4">
            <div className="h-11 bg-stone-200 dark:bg-tribe-mid rounded-lg animate-pulse" />
          </div>
        </div>
      </div>

      <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* Instructor banner shell */}
        <div className="h-16 bg-stone-200 dark:bg-tribe-mid rounded-xl animate-pulse" />

        {/* Sport filter pills */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 w-20 bg-stone-200 dark:bg-tribe-mid rounded-full animate-pulse" />
          ))}
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
