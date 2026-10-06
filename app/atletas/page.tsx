import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAthleteValuePage } from '@/lib/features/athleteValueServer';
import { fetchMyAthleteSummary, fetchOwnProfileBasics, fetchPartnerSlug } from '@/lib/dal/athleteHome';
import { buildAthleteLink, isLinkActive, toAthleteHomeView, type AthleteHomeView } from '@/lib/atletas/athleteHomeView';
import { renderQrSvg } from '@/lib/qr/renderQrSvg';
import AthleteHome from './AthleteHome';

/**
 * /atletas/ (T-AV24): the athlete's home. Server component.
 *
 * ORDER MATTERS, as on /pase/verificar/ (T-AV21):
 *   1. The flag first: with `athletes` off this is the app's ordinary 404.
 *      Signed-out visitors never get here: /atletas is not a public path, so
 *      middleware sends them to /auth (decision 4, 2026-09-30).
 *   2. The session. Repeated here for safety, same /auth?returnTo= shape.
 *   3. The athlete's own summary, through the user's client. It is scoped to
 *      auth.uid() inside av_athletes_my_summary, so this page cannot ask for
 *      anyone else's.
 *
 * WHAT REACHES THE BROWSER is only toAthleteHomeView's allowlist
 * (lib/atletas/athleteHomeView.ts), never the RPC result itself.
 *
 * The QR is rendered here, on the server (D9), only when the link is live.
 */
export const metadata: Metadata = {
  title: 'Atletas Tribe | Tribe',
  robots: { index: false, follow: false },
};

/** The origin this request came in on, as for the T-AV23 voucher QR. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
}

export default async function AthletesPage() {
  await requireAthleteValuePage('athletes');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?returnTo=${encodeURIComponent('/atletas/')}`);

  const summary = await fetchMyAthleteSummary(supabase);
  if (!summary.success) throw new Error('athlete summary unavailable');

  const program = summary.data?.[0];
  if (!program) {
    const none: AthleteHomeView = { state: 'none' };
    return <AthleteHome view={none} />;
  }

  const [slug, profile] = await Promise.all([
    isLinkActive(program) ? fetchPartnerSlug(supabase, program.partner_id) : Promise.resolve(null),
    fetchOwnProfileBasics(supabase, user.id),
  ]);

  const link = slug ? buildAthleteLink(await requestOrigin(), slug, program.ref_code) : null;
  // Decision 3: the QR's accessible name is the URL it encodes.
  const qrSvg = link ? renderQrSvg(link, link) : null;
  const firstName = profile.name?.trim().split(/\s+/)[0] || null;

  return <AthleteHome view={toAthleteHomeView(program, { link, qrSvg, firstName, avatarUrl: profile.avatarUrl })} />;
}
