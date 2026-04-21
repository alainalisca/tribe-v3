/**
 * Route-level loading UI for /product/[id].
 *
 * Single-column detail page skeleton. Mirrors the real page's section
 * order so the crossfade is smooth: header, hero image, title/price,
 * description stub, buy button. Product pages are force-dynamic (no ISR)
 * so this loader shows on every navigation, which makes investing in
 * a faithful skeleton worth it.
 */

export default function ProductLoading() {
  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <div className="w-6 h-6 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse mr-3" />
          <div className="h-5 w-48 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
        </div>
      </div>

      <div className="pt-14 max-w-2xl md:max-w-4xl mx-auto">
        {/* Hero image */}
        <div className="aspect-square bg-stone-200 dark:bg-tribe-mid animate-pulse" />

        <div className="p-4 space-y-4">
          {/* Title + Price */}
          <div className="space-y-2">
            <div className="h-6 w-3/4 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
            <div className="h-8 w-1/3 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
          </div>

          {/* Quantity row */}
          <div className="space-y-2">
            <div className="h-4 w-20 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-stone-200 dark:bg-tribe-mid rounded-xl animate-pulse" />
              <div className="h-6 w-8 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
              <div className="w-10 h-10 bg-stone-200 dark:bg-tribe-mid rounded-xl animate-pulse" />
            </div>
          </div>

          {/* Description paragraph */}
          <div className="space-y-2">
            <div className="h-4 w-24 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
            <div className="space-y-2">
              <div className="h-3 w-full bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
              <div className="h-3 w-5/6 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
              <div className="h-3 w-3/4 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
            </div>
          </div>

          {/* Buy button */}
          <div className="h-14 bg-stone-200 dark:bg-tribe-mid rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
