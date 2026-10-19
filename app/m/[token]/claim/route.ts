import { NextResponse } from 'next/server';
import { isMomentsEnabled } from '@/lib/features/moments';
import { checkRateLimit } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { signedInUser } from '@/lib/moments/routeGuard';
import { claimInvite, INVITE_TOKEN } from '@/lib/moments/claim';
import { momentosHref } from '@/lib/moments/notify';
import { logError } from '@/lib/logger';

/**
 * GET /m/<token>/claim/ (T-MOM1 Part C): where "Ver mis fotos" comes back to
 * after sign-up. Claims the invite for this account (the first account wins),
 * moves its tags to them, and lands them on Momentos with the batch open.
 * Signed out: to sign-up and back. Expired or someone else's: back to the
 * link, which says so.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isMomentsEnabled() || !INVITE_TOKEN.test(token)) return new NextResponse(null, { status: 404 });
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);
  const self = `/m/${token}/claim/`;
  const user = await signedInUser();
  if (!user) return to(`/auth/?signup=1&returnTo=${encodeURIComponent(self)}`);
  const service = getServiceRoleClient();
  const limit = await checkRateLimit(service, `moments-claim:${user.id}`, 20, 60 * 60 * 1000);
  if (!limit.allowed) return to(`/m/${token}/`);
  try {
    const r = await claimInvite(service, token, user.id);
    return to(r.ok ? momentosHref(r.sessionId) : `/m/${token}/`);
  } catch (error) {
    logError(error, { action: 'moments.claim' });
    return to(`/m/${token}/`);
  }
}
