/**
 * /communities — Server Component.
 *
 * Second Tribe route on the Server Component pattern (see /instructors
 * for the template). The user's joined communities and the full
 * discover list are both fetched server-side in parallel so initial
 * render ships with real data.
 *
 * Auth: the Next.js middleware gates this route, so by the time we
 * reach here the user is guaranteed signed in. We still call
 * supabase.auth.getUser() to get the id for fetchUserCommunities —
 * if it returns null (race between middleware and cookie refresh)
 * we fall through with an empty user-communities array and let the
 * client handle the retry path.
 */

import { createClient } from '@/lib/supabase/server';
import { fetchCommunities, fetchUserCommunities, type CommunityWithCreator } from '@/lib/dal/communities';
import { logError } from '@/lib/logger';
import CommunitiesPageClient from './CommunitiesPageClient';

// NOT ISR-cacheable at the route level: the page renders the signed-in
// user's "My Communities" section alongside the public discover list.
// Next.js keys the ISR cache on pathname + search params only — NOT on
// auth cookie — so a shared cache entry would leak one user's joined
// communities to the next requester. Keeping force-dynamic here is
// correct; see /instructors for the ISR-safe pattern (same-for-all-users
// response).
export const dynamic = 'force-dynamic';

export default async function CommunitiesPage() {
  let initialUserCommunities: CommunityWithCreator[] = [];
  let initialAllCommunities: CommunityWithCreator[] = [];

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Fire both fetches in parallel. User-specific call is conditional on
    // having a user id; the discover list is unconditional.
    const userPromise: ReturnType<typeof fetchUserCommunities> = user
      ? fetchUserCommunities(supabase, user.id)
      : Promise.resolve({ success: true, data: [] as CommunityWithCreator[] });
    const [userResult, allResult] = await Promise.all([userPromise, fetchCommunities(supabase, { limit: 100 })]);

    if (userResult.success && userResult.data) {
      initialUserCommunities = userResult.data;
    } else if (!userResult.success) {
      logError(new Error(userResult.error ?? 'fetchUserCommunities failed'), {
        action: 'CommunitiesPage.userFetch',
      });
    }

    if (allResult.success && allResult.data) {
      initialAllCommunities = allResult.data;
    } else if (!allResult.success) {
      logError(new Error(allResult.error ?? 'fetchCommunities failed'), {
        action: 'CommunitiesPage.allFetch',
      });
    }
  } catch (error) {
    logError(error, { action: 'CommunitiesPage.serverFetch' });
  }

  return (
    <CommunitiesPageClient
      initialUserCommunities={initialUserCommunities}
      initialAllCommunities={initialAllCommunities}
    />
  );
}
