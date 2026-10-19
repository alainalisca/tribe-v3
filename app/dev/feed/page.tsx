import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchRecapPhotosByCreators, fetchUpcomingSessions } from '@/lib/dal/sessions';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { hostHeroesFor } from '@/lib/feed/hostHeroes';
import { isPastFeedGrace } from '@/components/SessionCardHelpers';
import DevFeedView from './DevFeedView';
import { devFeedAllowed } from './devFeedAllowed';

/**
 * /dev/feed (T-UI-FD1): the signed-in home feed's cards with the real upcoming
 * sessions, for review without signing in. Local development only: a 404 in
 * production and on every Vercel deployment (preview included).
 *
 * Read only, on the server, with the service role: the feed's own query
 * (fetchUpcomingSessions: active, not a test session, by a visible host,
 * from today) and, for the cards, the hosts' recap photos (today's layout)
 * or coach-card photos (the regrouped one). Nothing is written.
 *
 *   /dev/feed/?layout=before  today's components (FilterBar, the card list)
 *   /dev/feed/                the regrouped feed (T-UI-FD1)
 */
export const metadata: Metadata = { title: 'Feed · Tribe dev', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function DevFeedPage({ searchParams }: { searchParams: Promise<{ layout?: string }> }) {
  if (!devFeedAllowed()) notFound();
  const { layout } = await searchParams;
  const service = getServiceRoleClient();
  const result = await fetchUpcomingSessions(service);
  // The live feed drops sessions past a 30-minute grace (useHomeFeed); same here.
  const sessions = result.success ? (result.data ?? []).filter((s) => !isPastFeedGrace(s)) : [];
  const hostIds = [...new Set(sessions.map((s) => s.creator_id).filter(Boolean))] as string[];
  const before = layout === 'before';
  const [recap, heroes] = await Promise.all([
    before ? fetchRecapPhotosByCreators(service, hostIds) : Promise.resolve(null),
    before ? Promise.resolve({}) : hostHeroesFor(hostIds),
  ]);
  return (
    <DevFeedView
      layout={before ? 'before' : 'after'}
      sessions={sessions}
      recapPhotosByCreator={recap?.success ? (recap.data ?? {}) : {}}
      hostPhotos={heroes}
    />
  );
}
