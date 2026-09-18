/**
 * /profile/[userId] — Server Component with intra-route Suspense.
 *
 * Splits the server-side work into two phases:
 *
 *   1. Profile fetch (fast, single-row SELECT). Awaited inline so the
 *      page header, avatar, bio, and sports tags render immediately
 *      once the row resolves.
 *
 *   2. Stats fetch (slower — three parallel queries including an
 *      attendance RPC that scans session_participants). Wrapped in
 *      <Suspense> and rendered by ProfileStatsServer. While the stats
 *      are still resolving, the rest of the profile is visible and
 *      interactive; the stats grid shows a skeleton that swaps in when
 *      ready.
 *
 * This is a meaningful TTFB win on cache-miss requests, because the
 * page no longer blocks on the slowest of four queries. Cache hits
 * (most requests, thanks to `revalidate = 60`) skip all of this.
 */

import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { fetchUserProfile } from '@/lib/dal';
import { logError } from '@/lib/logger';
import type { Database } from '@/lib/database.types';
import ProfilePageClient from './ProfilePageClient';
import ProfileStatsServer from './ProfileStatsServer';

type UserProfile = Database['public']['Tables']['users']['Row'];

// The server render deliberately contains ONLY public profile data. Viewer-
// specific UI (block buttons, connection button, invite sheet, visibility
// tier) is computed client-side after hydration.
//
// That discipline is worth keeping, but note it is not currently enforced by a
// cache: this route reads cookies through createClient, so it renders per
// request and the build lists it as `ƒ (Dynamic)`. It used to carry
// `export const revalidate = 60`, which had no effect, and the word "ISR-safe"
// described a cache that did not exist. The constraint becomes load-bearing the
// moment anyone makes this route cacheable, which is plausible precisely
// because the shell is public -- so keep the viewer-specific work on the client
// regardless. See useVisibilityTier.ts for what goes wrong otherwise.

interface ProfilePageProps {
  params: Promise<{ userId: string }>;
}

// ── Stats skeleton (fallback while ProfileStatsServer resolves) ────────

function StatsSkeleton() {
  return (
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
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { userId } = await params;

  let initialProfile: UserProfile | null = null;

  try {
    const supabase = await createClient();
    const profileResult = await fetchUserProfile(supabase, userId);

    if (profileResult.success && profileResult.data) {
      initialProfile = profileResult.data as UserProfile;
    } else if (!profileResult.success) {
      logError(new Error(profileResult.error ?? 'fetchUserProfile failed'), {
        action: 'PublicProfilePage.profileFetch',
        userId,
      });
    }
  } catch (error) {
    logError(error, { action: 'PublicProfilePage.serverFetch', userId });
  }

  return (
    <ProfilePageClient
      userId={userId}
      initialProfile={initialProfile}
      statsSlot={
        <Suspense fallback={<StatsSkeleton />}>
          <ProfileStatsServer userId={userId} />
        </Suspense>
      }
    />
  );
}
