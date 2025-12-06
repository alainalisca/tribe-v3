export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 shadow animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-8 w-24 bg-stone-200 dark:bg-[#52575D] rounded-full"></div>
        <div className="h-6 w-16 bg-stone-200 dark:bg-[#52575D] rounded"></div>
      </div>
      <div className="space-y-2 mb-3">
        <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-3/4"></div>
        <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-1/2"></div>
        <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-2/3"></div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 bg-stone-200 dark:bg-[#52575D] rounded-full"></div>
        <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-32"></div>
      </div>
      <div className="h-10 bg-stone-200 dark:bg-[#52575D] rounded-lg"></div>
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div className="animate-pulse">
      <div className="h-32 bg-stone-200 dark:bg-[#52575D] rounded-t-xl"></div>
      <div className="px-4 pb-4">
        <div className="flex items-end gap-4 -mt-12 mb-4">
          <div className="w-24 h-24 bg-stone-200 dark:bg-[#52575D] rounded-full border-4 border-white dark:border-[#6B7178]"></div>
          <div className="flex-1">
            <div className="h-6 bg-stone-200 dark:bg-[#52575D] rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-1/4"></div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-full"></div>
          <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-5/6"></div>
          <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-4/6"></div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-[#6B7178] rounded-xl p-4 shadow animate-pulse">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-stone-200 dark:bg-[#52575D] rounded-full"></div>
            <div className="flex-1">
              <div className="h-4 bg-stone-200 dark:bg-[#52575D] rounded w-2/3 mb-2"></div>
              <div className="h-3 bg-stone-200 dark:bg-[#52575D] rounded w-1/3"></div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
