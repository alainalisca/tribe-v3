import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAthleteValuePage } from '@/lib/features/athleteValueServer';
import { fetchDoorPass, type ConfirmMethod } from '@/lib/dal/passDoor';
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
  /** T-AV25: `?via=code` when the coach typed the code on the door list. */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * How the show-up was confirmed, from `?via=`. A FIXED map, never the value
 * passed through: only `code` means typed; anything else is a scan (the
 * voucher QR carries no parameter). t-av25-mutations proves the map bites.
 */
const METHOD_FROM_VIA: Readonly<Record<string, ConfirmMethod>> = { code: 'code' };

export const metadata: Metadata = {
  title: 'Pase | Tribe',
  robots: { index: false, follow: false },
};

export default async function VerifyPassPage({ params, searchParams }: PageProps) {
  await requireAthleteValuePage('athletes');

  const { passCode } = await params;
  const viaRaw = (await searchParams)?.via;
  const via = Array.isArray(viaRaw) ? viaRaw[0] : viaRaw;
  const method: ConfirmMethod = (via && METHOD_FROM_VIA[via]) || 'scan';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const back = `/pase/verificar/${passCode}/${method === 'code' ? '?via=code' : ''}`;
    redirect(`/auth?returnTo=${encodeURIComponent(back)}`);
  }

  const result = await fetchDoorPass(supabase, passCode);

  return (
    <DoorPassView
      passCode={passCode}
      method={method}
      pass={result.success ? (result.data ?? null) : null}
      readFailed={!result.success}
    />
  );
}
