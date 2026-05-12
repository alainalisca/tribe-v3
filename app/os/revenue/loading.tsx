/**
 * App Router loading boundary for /os/revenue.
 *
 * Renders immediately on navigation while page.tsx mounts and fetches.
 * The actual revenue-fetch loading state is handled inside page.tsx
 * (since we use 'use client' for everything in this route); this file
 * primarily covers the brief window before React hydration.
 */

export default function Loading(): JSX.Element {
  return (
    <main className="min-h-screen bg-tribe-dark px-4 py-10 sm:py-14">
      <div className="max-w-4xl mx-auto">
        <div className="h-8 w-48 rounded bg-white/10 animate-pulse mb-3" />
        <div className="h-4 w-72 rounded bg-white/5 animate-pulse mb-8" />
        <div className="h-12 w-full rounded-xl bg-white/5 animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-44 rounded-2xl bg-white/5 animate-pulse" />
          <div className="h-44 rounded-2xl bg-white/5 animate-pulse" />
        </div>
      </div>
    </main>
  );
}
