export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-tribe-card rounded-xl overflow-hidden border border-stone-200 dark:border-gray-600/30">
      {/* Image placeholder */}
      <div className="h-40 w-full bg-stone-200 dark:bg-tribe-mid animate-pulse" />
      <div className="p-4 space-y-3">
        {/* Title */}
        <div className="h-5 w-3/4 bg-stone-200 dark:bg-tribe-mid rounded-md animate-pulse" />
        {/* Date line */}
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-3.5 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
          <div className="h-3.5 w-40 bg-stone-200 dark:bg-tribe-mid rounded-md animate-pulse" />
        </div>
        {/* Location line */}
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-3.5 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
          <div className="h-3.5 w-48 bg-stone-200 dark:bg-tribe-mid rounded-md animate-pulse" />
        </div>
        {/* Instructor + Price row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-stone-200 dark:bg-tribe-mid rounded-full animate-pulse" />
            <div className="h-3 w-24 bg-stone-200 dark:bg-tribe-mid rounded-md animate-pulse" />
          </div>
          <div className="h-4 w-16 bg-stone-200 dark:bg-tribe-mid rounded-md animate-pulse" />
        </div>
        {/* Avatar stack */}
        <div className="flex items-center gap-1 pt-2 border-t border-stone-100 dark:border-tribe-mid">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="w-6 h-6 bg-stone-200 dark:bg-tribe-mid rounded-full animate-pulse"
              style={{ marginLeft: i > 0 ? '-4px' : '0' }}
            />
          ))}
          <div className="h-3 w-20 ml-2 bg-stone-200 dark:bg-tribe-mid rounded-md animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div className="animate-pulse">
      <div className="h-32 bg-stone-200 dark:bg-tribe-mid rounded-t-xl"></div>
      <div className="px-4 pb-4">
        <div className="flex items-end gap-4 -mt-12 mb-4">
          <div className="w-24 h-24 bg-stone-200 dark:bg-tribe-mid rounded-full border-4 border-white dark:border-tribe-card"></div>
          <div className="flex-1">
            <div className="h-6 bg-stone-200 dark:bg-tribe-mid rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-stone-200 dark:bg-tribe-mid rounded w-1/4"></div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-stone-200 dark:bg-tribe-mid rounded w-full"></div>
          <div className="h-4 bg-stone-200 dark:bg-tribe-mid rounded w-5/6"></div>
          <div className="h-4 bg-stone-200 dark:bg-tribe-mid rounded w-4/6"></div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-tribe-card rounded-xl p-4 shadow animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-stone-200 dark:bg-tribe-mid rounded-full"></div>
            <div className="flex-1">
              <div className="h-4 bg-stone-200 dark:bg-tribe-mid rounded w-2/3 mb-2"></div>
              <div className="h-3 bg-stone-200 dark:bg-tribe-mid rounded w-1/3"></div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
