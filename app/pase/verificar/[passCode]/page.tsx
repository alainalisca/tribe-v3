import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAthleteValuePage } from '@/lib/features/athleteValueServer';
import { fetchDoorPass } from '@/lib/dal/passDoor';
import DoorPassView from './DoorPassView';

/**
 * /pase/verificar/[passCode]/ (T-AV21): the gym door. A coach or the owner
 * scans a guest's voucher QR and lands here to confirm the show-up.
 *
 * ORDER MATTERS.
 *   1. The flag, first. With the `athletes` feature off this is the app's
 *      ordinary 404, signed in or not, so an unreleased surface is
 *      indistinguishable from a route that does not exist (spec 0.8).
 *   2. The session, second. Middleware treats all of /pase as public (recon
 *      2.9), so nothing upstream sends a signed-out coach to login. This page
 *      does it itself, with the same /auth?returnTo= shape middleware uses.
 *   3. The pass, through av_door_pass. "Unknown code" and "not your gym" are
 *      one answer by design; the view says "This pass is not for your gym."
 *
 * lib/publicShareRoutes.ts lists /pase/, so the install modal and the
 * FeedbackWidget are suppressed here too. That is acceptable for a door
 * screen, and it is recorded rather than accidental.
 */

interface PageProps {
  params: Promise<{ passCode: string }>;
}

export const metadata: Metadata = {
  title: 'Pase | Tribe',
  robots: { index: false, follow: false },
};

export default async function VerifyPassPage({ params }: PageProps) {
  await requireAthleteValuePage('athletes');

  const { passCode } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth?returnTo=${encodeURIComponent(`/pase/verificar/${passCode}/`)}`);
  }

  const result = await fetchDoorPass(supabase, passCode);

  return (
    <DoorPassView
      passCode={passCode}
      pass={result.success ? (result.data ?? null) : null}
      readFailed={!result.success}
    />
  );
}
