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
 * With the flag off this is `notFound()` -- the app's ordinary 404, the same
 * response `/pase` gave before this file existed. With the flag on for an
 * allowlisted user, or for an app admin, the placeholder renders.
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
