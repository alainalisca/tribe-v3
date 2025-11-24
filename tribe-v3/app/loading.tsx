export default function Loading() {
  return (
    <div className="fixed inset-0 bg-stone-50 dark:bg-[#52575D] flex items-center justify-center z-50">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-stone-900 dark:text-white mb-2">
          Tribe<span className="text-tribe-green">.</span>
        </h1>
        <p className="text-lg font-medium text-stone-600 dark:text-gray-300 mb-6">
          Never Train Alone
        </p>
        <div className="animate-pulse">
          <div className="h-1 w-32 bg-tribe-green rounded-full mx-auto"></div>
        </div>
      </div>
    </div>
  );
}
