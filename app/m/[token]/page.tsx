import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import ClaimView, { type ClaimState } from '@/components/moments/ClaimView';
import { isMomentsEnabled } from '@/lib/features/moments';
import { checkRateLimit } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { signedInUser } from '@/lib/moments/routeGuard';
import { CLAIM_VIEWS_PER_HOUR, INVITE_TOKEN, inviteStatus, loadInvite, loadInvitePreview } from '@/lib/moments/claim';
import { momentosHref } from '@/lib/moments/notify';

/**
 * /m/<token>/ (T-MOM1 Part C): the claim link an uploader sends by WhatsApp
 * to someone who is not on Tribe. Public (middleware), never indexed, 20 views
 * per IP per hour. Shows only the photos this invite is tagged in. The person
 * who already claimed it goes straight to their Momentos.
 */
export const metadata: Metadata = {
  title: 'Tus fotos | Tribe',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

export default async function ClaimLinkPage({ params }: { params: Promise<{ token: string }> }) {
  if (!isMomentsEnabled()) notFound();
  const { token } = await params;
  // A malformed token looks nothing up, so it costs no rate-limit row.
  if (!INVITE_TOKEN.test(token)) return <ClaimView state={{ kind: 'not_found' }} />;
  const service = getServiceRoleClient();
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const view = await checkRateLimit(service, `moments-claim-view:${ip}`, CLAIM_VIEWS_PER_HOUR, 60 * 60 * 1000);
  let state: ClaimState;
  if (!view.allowed) state = { kind: 'busy' };
  else {
    const user = await signedInUser();
    const inv = await loadInvite(service, token);
    const status = inviteStatus(inv, user?.id ?? null);
    if (status === 'mine' && inv) redirect(momentosHref(inv.session_id));
    if (status === 'expired' || status === 'claimed') state = { kind: status };
    else if (status !== 'ok' || !inv) state = { kind: 'not_found' };
    else {
      const preview = await loadInvitePreview(service, inv);
      const claim = `/m/${token}/claim/`;
      state = preview
        ? { kind: 'ok', preview, cta: user ? claim : `/auth/?signup=1&returnTo=${encodeURIComponent(claim)}` }
        : { kind: 'not_found' };
    }
  }
  return <ClaimView state={state} />;
}
