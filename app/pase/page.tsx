import type { Metadata } from 'next';
import { requireAthleteValuePage } from '@/lib/features/athleteValueServer';
import PaseCatalogPlaceholder from './PaseCatalogPlaceholder';

/**
 * /pase -- the pass catalog. T-AV0, Step 6, acceptance check 5.
 *
 * A SERVER component, which is unusual in this app (CLAUDE.md: "all pages use
 * 'use client'") and is the entire point. The gate has to be decided somewhere
 * a browser cannot reach, and a client component's check ships to the browser
 * as editable JavaScript. So the decision is here and the markup is in the
 * client child.
 *
 * With the flag off this is `notFound()` -- the app's ordinary 404. With the
 * flag on for an allowlisted user, or for an app admin, the placeholder
 * renders.
 *
 * CORRECTION 2026-09-26: this comment used to add "the same response `/pase`
 * gave before this file existed", and that clause was wrong. Measured on a
 * production build: a `notFound()` from a dynamic route in this app renders
 * `app/not-found.tsx` with HTTP **200**, while `/pase/` on main -- a path with
 * no route at all -- answers a real **404**. So the status differs from what
 * this route used to return.
 *
 * It is still indistinguishable from every OTHER "this does not exist" answer
 * the app gives: `/g/no-such-gym/` and `/pase/no-such-slug/` are both 200 on
 * main too. That is the property rule 6 actually needs -- a refusal that looks
 * like every other miss -- and it holds. What does not hold is the stronger
 * claim about matching this path's own previous status, so it is gone rather
 * than restated.
 *
 * NOT TO BE CONFUSED WITH /pase/[slug], WHICH IS LIVE AND UNGATED. That route
 * is the digital pass a stranger opens from a gym's voucher; it predates this
 * program, it is on main, and nothing here touches it. Adding an index page to
 * a directory whose only child is [slug] does not change what [slug] does --
 * checked by reading app/pase/[slug]/page.tsx rather than assuming, because
 * "it is a different file" is exactly the kind of claim this repo has been
 * wrong about before.
 */
export const metadata: Metadata = {
  title: 'Tribe',
  // Nothing behind this flag is public, and a preview URL that turns up in a
  // search result is a leak with no attacker involved.
  robots: { index: false, follow: false },
};

export default async function PaseCatalogPage() {
  await requireAthleteValuePage('pase');
  return <PaseCatalogPlaceholder />;
}
