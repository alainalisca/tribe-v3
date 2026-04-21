/**
 * /instructors — Server Component.
 *
 * First Tribe route to use App Router Server Components properly (2026-04-21,
 * audit P1 architectural follow-up). Previously this page was a single
 * 'use client' component that fetched the instructor list in a useEffect on
 * mount. That meant:
 *   - First paint was a skeleton; real data came ~1 RTT later.
 *   - The fetch logic shipped in the client bundle.
 *   - Every navigation to /instructors did a full client-side fetch.
 *
 * Now:
 *   - The server runs `fetchInstructors` at request time (with the
 *     authenticated Supabase server client — middleware has already
 *     confirmed the user is signed in).
 *   - Initial HTML ships with the real list, hydrated into the client
 *     component via props.
 *   - The client component keeps all the interactivity (search, sort,
 *     map, near-me) but doesn't re-fetch on mount.
 *
 * Template for converting other read-heavy routes (/communities, /product/[id],
 * /profile/[userId]): same pattern — thin server page, big client page, shared
 * DAL function that works with either client shape.
 */

import { createClient } from '@/lib/supabase/server';
import { fetchInstructors, type InstructorProfile } from '@/lib/dal/instructors';
import { logError } from '@/lib/logger';
import InstructorsPageClient from './InstructorsPageClient';

// ISR: cache the rendered page for 60 seconds between fetches. The instructor
// list doesn't need per-request freshness — new instructors onboarding don't
// expect their profile to appear in the discover list within milliseconds.
// 60s is the cheapest setting that still feels live:
//   - A new sign-up gets discoverability in under a minute.
//   - A rating change propagates in under a minute.
//   - At steady-state traffic, ~98% of requests are cache hits instead of
//     hitting Supabase cold-start round-trips.
// `dynamic = 'auto'` (the default) + `revalidate` gets us ISR behavior. We
// don't set `dynamic = 'force-dynamic'` here for that reason.
export const revalidate = 60;

export default async function InstructorsPage() {
  let initialInstructors: InstructorProfile[] = [];

  try {
    const supabase = await createClient();
    const result = await fetchInstructors(supabase);
    if (result.success && result.data) {
      initialInstructors = result.data;
    } else if (!result.success) {
      logError(new Error(result.error ?? 'fetchInstructors failed'), {
        action: 'InstructorsPage.serverFetch',
      });
    }
  } catch (error) {
    // If server-side fetch breaks (e.g. DB down), fall through with an
    // empty array — the client page will render its empty state rather
    // than crashing the whole route. A client-triggered refresh will
    // retry later.
    logError(error, { action: 'InstructorsPage.serverFetch' });
  }

  return <InstructorsPageClient initialInstructors={initialInstructors} />;
}
