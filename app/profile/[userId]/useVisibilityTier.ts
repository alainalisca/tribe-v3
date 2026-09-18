'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchCoAthleteTiers, fetchUserIsAdmin, tierFor, type VisibilityTier } from '@/lib/dal';
import { logError } from '@/lib/logger';

/**
 * T-ATH1 step 7: what tier the current viewer occupies for the profile on screen.
 *
 * WHY THIS IS A CLIENT HOOK AND NOT A SERVER FETCH.
 *
 * A tier is a function of WHO IS LOOKING. Resolving it in the server render
 * puts viewer-specific data into a response that can be cached and handed to a
 * different viewer. That is cache poisoning, and it is the same class of failure
 * as the nonce/ISR incident documented in middleware.ts, where a per-request
 * value baked into a cacheable response broke every subsequent hit.
 *
 * Read the state of the route honestly: /profile/[userId] renders PER REQUEST
 * today, because `createClient()` awaits `cookies()` and that opts the route
 * into dynamic rendering. The build lists it as `ƒ (Dynamic)`. An earlier
 * version of this comment said the render was "ISR-cached and SHARED ACROSS
 * VIEWERS" on the strength of an `export const revalidate = 60` that had no
 * cache to govern; that setting has been removed.
 *
 * THE HOOK STAYS ON THE CLIENT ANYWAY, and this is not belt-and-braces. The
 * page's whole design is that the server render carries only public profile
 * data, which is exactly the property that makes the route a candidate for
 * caching later -- a public shell is the obvious thing to put behind a cache
 * when per-request rendering gets expensive. The day someone does that, either
 * by dropping the cookie read from the shell or by splitting the route, a
 * server-resolved tier becomes a viewer's private relationship served to
 * strangers. Moving this to the server would trade a correct boundary for no
 * measured gain and leave a trap for whoever optimises the route next.
 *
 * So: this runs after mount, as the viewer, and the server render stays
 * viewer-independent whether or not anything is currently caching it.
 *
 * THE GATE IS `hasTrainedTogether`, NOT `tier === 3`. tierFor resolves a single
 * label for display and lets UPCOMING win over PAST, because two people training
 * together next week are more connected than two who trained in March. So a pair
 * who share both comes back as tier 2. Gating the sessions list on `tier === 3`
 * would therefore hide it from the MOST connected pairs -- the ones with history
 * AND a shared plan. The underlying relation is the right gate; the resolved
 * tier is only for what to call it.
 */
export interface VisibilityTierState {
  tier: VisibilityTier;
  /** The viewer and this athlete have completed a session together. */
  hasTrainedTogether: boolean;
  /** The viewer is looking at their own profile. */
  isSelf: boolean;
  loading: boolean;
  /**
   * Set when ?previewTier= is in force. Holds the tier the viewer would really
   * have, so the UI can say so out loud instead of quietly lying.
   */
  previewOf: VisibilityTier | null;
}

const IDLE: VisibilityTierState = {
  tier: 1,
  hasTrainedTogether: false,
  isSelf: false,
  loading: true,
  previewOf: null,
};

function parsePreviewTier(raw: string | null): VisibilityTier | null {
  if (raw === '1') return 1;
  if (raw === '2') return 2;
  if (raw === '3') return 3;
  return null;
}

/**
 * @param targetUserId the profile being viewed
 * @param viewerId     the signed-in viewer, or null when logged out
 */
export function useVisibilityTier(targetUserId: string, viewerId: string | null): VisibilityTierState {
  const searchParams = useSearchParams();
  const [state, setState] = useState<VisibilityTierState>(IDLE);
  const previewRequested = parsePreviewTier(searchParams?.get('previewTier') ?? null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function resolve() {
      // Logged out: nobody, so tier 1. The roster view is authenticated-only and
      // would return nothing anyway; not querying says so honestly rather than
      // reading an empty result as "no shared sessions".
      if (!viewerId) {
        if (!cancelled) setState({ ...IDLE, loading: false });
        return;
      }

      if (viewerId === targetUserId) {
        if (!cancelled) {
          setState({ tier: 3, hasTrainedTogether: true, isSelf: true, loading: false, previewOf: null });
        }
        return;
      }

      const result = await fetchCoAthleteTiers(supabase, viewerId);

      if (!result.success) {
        // A failed query is NOT "this athlete knows nobody". Fall back to the
        // narrowest tier and log, rather than silently presenting a stranger's
        // view as a computed answer.
        logError(new Error(result.error ?? 'fetchCoAthleteTiers failed'), {
          action: 'useVisibilityTier',
          viewerId,
          targetUserId,
        });
        if (!cancelled) setState({ ...IDLE, loading: false });
        return;
      }

      const tiers = result.data!;
      const real: VisibilityTierState = {
        tier: tierFor(targetUserId, tiers),
        hasTrainedTogether: tiers.past.has(targetUserId),
        isSelf: false,
        loading: false,
        previewOf: null,
      };

      if (previewRequested === null) {
        if (!cancelled) setState(real);
        return;
      }

      // THE PREVIEW OVERRIDE IS ADMIN-ONLY, and it is checked server-side.
      // is_admin has not been client-readable since migration 113; fetchUserIsAdmin
      // goes through the is_app_admin() SECURITY DEFINER RPC, which only ever
      // answers for the authenticated caller. So this cannot be forged from the
      // client by editing state -- an ordinary athlete appending ?previewTier=3
      // gets their real tier and no banner.
      const admin = await fetchUserIsAdmin(supabase, viewerId);
      if (!cancelled) {
        setState(
          admin.success && admin.data
            ? {
                tier: previewRequested,
                hasTrainedTogether: previewRequested === 3,
                isSelf: false,
                loading: false,
                previewOf: real.tier,
              }
            : real
        );
      }
    }

    resolve().catch((error) => {
      logError(error, { action: 'useVisibilityTier', viewerId, targetUserId });
      if (!cancelled) setState({ ...IDLE, loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, [targetUserId, viewerId, previewRequested]);

  return state;
}
