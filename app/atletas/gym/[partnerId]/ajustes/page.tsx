import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAthleteValuePage } from '@/lib/features/athleteValueServer';
import { fetchMyPartnerRole, fetchPartnerSummary } from '@/lib/dal/athleteGym';
import { settingsFromProgram } from '@/lib/atletas/gymSettings';
import GymSettingsForm from './GymSettingsForm';

/**
 * /atletas/gym/[partnerId]/ajustes/ (T-AV26): the program settings, owner and
 * admin only.
 *
 * A COACH GETS A REAL 404, NOT A HIDDEN BUTTON. middleware.ts requires owner
 * or admin for this path (gymPathRequirement), before any rendering. The role
 * check below is the second layer; on its own it could only stream the
 * not-found page with status 200 (root loading boundary, T-AV24).
 *
 * The form starts from the program row partner_summary returns to an owner,
 * every editable column filled, so saving one field never blanks another.
 * Saving goes through POST /api/atletas/gym/[partnerId]/settings/ with the
 * owner's own session.
 */
export const metadata: Metadata = {
  title: 'Ajustes | Atletas Tribe | Tribe',
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ partnerId: string }>;
}

export default async function GymSettingsPage({ params }: PageProps) {
  await requireAthleteValuePage('athletes');

  const { partnerId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?returnTo=${encodeURIComponent(`/atletas/gym/${partnerId}/ajustes/`)}`);

  if (!UUID.test(partnerId)) notFound();
  const role = await fetchMyPartnerRole(supabase, partnerId);
  if (!role.success) throw new Error('partner role unavailable');
  if (role.data !== 'owner' && role.data !== 'admin') notFound();

  const summary = await fetchPartnerSummary(supabase, partnerId);
  if (!summary.success) throw new Error('gym summary unavailable');
  if (!summary.data) notFound();

  return <GymSettingsForm partnerId={partnerId} initial={settingsFromProgram(summary.data.program)} />;
}
