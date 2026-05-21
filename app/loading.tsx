/**
 * Root route-level loading UI.
 *
 * Previously returned `null`, so every route without its own
 * loading.tsx flashed blank white during navigation/Suspense. A
 * neutral, theme-aware skeleton reads as "loading" instead of "broken"
 * and crossfades into real content rather than popping in.
 */
import { SkeletonProfile, SkeletonCard } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-theme-page">
      <div className="max-w-2xl md:max-w-4xl mx-auto px-4 pt-20 pb-24 space-y-4">
        <SkeletonProfile />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
