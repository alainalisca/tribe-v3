import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAthleteValuePage } from '@/lib/features/athleteValueServer';
import { fetchPartnerSummary } from '@/lib/dal/athleteGym';
import { toGymView } from '@/lib/atletas/gymView';
import GymDashboard from './GymDashboard';

/**
 * /atletas/gym/[partnerId]/ (T-AV26): the gym dashboard. Server component.
 *
 * WHO GETS HERE. middleware.ts (athletesGateAllows with gymPathRequirement)
 * answers a REAL 404 unless the athletes flag is on AND the caller is owner,
 * active coach or admin of this partner. Everything below is the second layer.
 *
 * ORDER, as on the door list:
 *   1. The flag.
 *   2. The session, same /auth?returnTo= shape.
 *   3. av_athletes_partner_summary(partnerId) through the user's client. It
 *      answers not_found for anyone who is not staff of a partner with a
 *      program, which renders the not-found page.
 *
 * WHAT REACHES THE BROWSER is only toGymView's allowlist. A coach's view has
 * no bonus field and no sales note, and no action is rendered for a coach.
 */
export const metadata: Metadata = {
  title: 'Atletas Tribe | Tribe',
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ partnerId: string }>;
}

export default async function GymDashboardPage({ params }: PageProps) {
  await requireAthleteValuePage('athletes');

  const { partnerId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?returnTo=${encodeURIComponent(`/atletas/gym/${partnerId}/`)}`);

  if (!UUID.test(partnerId)) notFound();
  const summary = await fetchPartnerSummary(supabase, partnerId);
  if (!summary.success) throw new Error('gym summary unavailable');
  if (!summary.data) notFound();

  return <GymDashboard view={toGymView(partnerId, summary.data)} />;
}
