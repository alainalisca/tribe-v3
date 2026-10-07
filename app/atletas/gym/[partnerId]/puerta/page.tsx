import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAthleteValuePage } from '@/lib/features/athleteValueServer';
import { fetchDoorList } from '@/lib/dal/passDoor';
import DoorList from './DoorList';

/**
 * /atletas/gym/[partnerId]/puerta/ (T-AV25): the door list for a gym.
 *
 * ORDER, as on the verify page:
 *   1. The flag. /atletas is behind the middleware gate (T-AV24), so with the
 *      flag off this is a real 404 before any rendering; this call is the
 *      second layer.
 *   2. The session, with the same /auth?returnTo= shape.
 *   3. av_door_list(partnerId) through the user's client. It answers for the
 *      owner, an active coach or an admin of that partner, and `not_found` for
 *      everyone else AND for a partner that does not exist. Both render the
 *      not-found page, so the list cannot be used to learn which gyms exist
 *      or who works where. (Under the root loading boundary that page streams
 *      with status 200, the same for both cases; decision 4, 2026-09-30.)
 */
export const metadata: Metadata = {
  title: 'Puerta | Tribe',
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ partnerId: string }>;
}

export default async function DoorListPage({ params }: PageProps) {
  await requireAthleteValuePage('athletes');

  const { partnerId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?returnTo=${encodeURIComponent(`/atletas/gym/${partnerId}/puerta/`)}`);

  if (!UUID.test(partnerId)) notFound();
  const result = await fetchDoorList(supabase, partnerId);
  if (!result.success) throw new Error('door list unavailable');
  if (result.data === null || result.data === undefined) notFound();

  return <DoorList entries={result.data} />;
}
