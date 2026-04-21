/**
 * Route-level loading UI for /profile/[userId].
 *
 * Profile pages do 4 parallel server fetches (profile + 2 counts +
 * attendance RPC). Even parallelized, the slowest of those (the
 * attendance RPC) dictates TTFB on a cache miss.
 *
 * This loader renders immediately on navigation with:
 *   - The fixed header (back button + a name placeholder)
 *   - The circular avatar placeholder
 *   - The name/username line + location line
 *   - The 2x2 stats grid (the 4 stat cards users look at)
 *
 * With `export const revalidate = 60` on page.tsx, this loader only
 * shows on cache-miss requests. Most hits return directly from the
 * ISR cache and skip straight to the real page.
 */

import { SkeletonProfile } from '@/components/Skeleton';

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
            <div className="h-6 w-32 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
          </div>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6">
        <div className="bg-theme-card rounded-2xl p-6 border border-theme">
          <SkeletonProfile />
          {/* 2x2 stats grid shell */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-tribe-surface rounded-2xl p-4 text-center border border-stone-200 dark:border-tribe-mid"
              >
                <div className="h-10 w-12 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse mx-auto" />
                <div className="h-3 w-20 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse mx-auto mt-2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
