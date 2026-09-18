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
import { fetchGymsAndStudios, type GymDirectoryEntry } from '@/lib/dal/gymDirectory';
import { logError } from '@/lib/logger';
import InstructorsPageClient from './InstructorsPageClient';
import { resolveFetchOutcome } from './fetchOutcome';

// THIS ROUTE IS DYNAMIC, NOT CACHED. It used to carry `export const
// revalidate = 60` and a comment claiming ~98% cache hits. There is no cache:
// `createClient()` (lib/supabase/server.ts) awaits `cookies()`, which opts the
// route into dynamic rendering, and `revalidate` has no effect on a route Next
// cannot cache. The build's own route table is the proof -- /instructors is
// listed as `ƒ (Dynamic) server-rendered on demand`, not `○ (Static)`.
//
// The setting is removed rather than left in place with a corrected comment: a
// config value that does nothing reads as a fact about how the route behaves,
// and the one it asserted was false for as long as it was here.
//
// The two errors this route logs during `npm run build` are the same mechanism.
// Next probes the route by prerendering it, `cookies()` throws
// DynamicServerError, the catch below logs it, and Next then marks the route
// dynamic. Harmless, and not a sign the fetch is broken.
//
// If per-request rendering ever becomes too expensive, the fix is not
// `revalidate`: it is splitting the public shell (which needs no cookies) from
// the viewer-specific parts, at which point see the cache-poisoning warning in
// app/profile/[userId]/useVisibilityTier.ts before moving anything viewer-
// specific into the cached render.

export default async function InstructorsPage() {
  let initialInstructors: InstructorProfile[] = [];
  let gyms: GymDirectoryEntry[] = [];
  // An empty list is NOT evidence that the directory is empty. These flags are
  // what let the client tell "we could not load this" apart from "there is
  // nothing to show", which used to render the identical screen -- complete
  // with a Clear Search button that could not possibly help.
  let instructorsFailed = false;
  let gymsFailed = false;

  try {
    const supabase = await createClient();
    // allSettled, not all: these two fetches are independent, and with
    // Promise.all a rejection from either emptied BOTH lists. The gym
    // directory failing is not a reason to report zero instructors.
    const [result, gymResult] = await Promise.allSettled([fetchInstructors(supabase), fetchGymsAndStudios(supabase)]);

    const instructorOutcome = resolveFetchOutcome(result, 'fetchInstructors');
    initialInstructors = instructorOutcome.data;
    instructorsFailed = instructorOutcome.failed;
    if (instructorOutcome.failed) {
      logError(instructorOutcome.cause, { action: 'InstructorsPage.serverFetch' });
    }

    // Previously `if (gymResult.success && gymResult.data) gyms = ...` with no
    // else at all: a gym-directory failure was discarded without a log, so it
    // left no trace anywhere. Built, broken and silent.
    const gymOutcome = resolveFetchOutcome(gymResult, 'fetchGymsAndStudios');
    gyms = gymOutcome.data;
    gymsFailed = gymOutcome.failed;
    if (gymOutcome.failed) {
      logError(gymOutcome.cause, { action: 'InstructorsPage.serverGymFetch' });
    }
  } catch (error) {
    // Reached when createClient() itself throws, which is what Next's
    // prerender probe does. Both lists are unknown, not empty.
    instructorsFailed = true;
    gymsFailed = true;
    logError(error, { action: 'InstructorsPage.serverFetch' });
  }

  return (
    <InstructorsPageClient
      initialInstructors={initialInstructors}
      instructorsFailed={instructorsFailed}
      gyms={gyms}
      gymsFailed={gymsFailed}
    />
  );
}
