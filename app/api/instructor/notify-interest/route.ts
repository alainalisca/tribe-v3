/**
 * POST /api/instructor/notify-interest
 *
 * Fires the "an athlete is interested in training with you" push to an
 * instructor when someone taps "Estoy Interesado" on their storefront.
 *
 * Why this route exists: /api/notifications/send is internal-only (it can
 * push arbitrary title/body to any user, so a logged-in user must never reach
 * it directly — a spoofing vector). The interest flow still needs to ping the
 * instructor, so it calls this narrow route. The recipient and the message
 * text are derived SERVER-SIDE; the client only supplies the instructor id.
 * The worst a caller can do is trigger a fixed-format interest ping to a real
 * instructor — not arbitrary content to an arbitrary user.
 *
 * It writes both the in-app bell and the device push, in the INSTRUCTOR's
 * language (T-LANG1: recipientLanguage). The bell used to be written by the
 * athlete's browser, in the athlete's language. Both go out only when the
 * athlete's training_interest row for this instructor exists, so the route
 * cannot be used to ping an instructor nobody expressed interest in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { createNotification } from '@/lib/dal';
import { LANGUAGE_FIELDS, recipientLanguage } from '@/lib/i18n/recipientLanguage';

const schema = z.object({ instructor_id: z.string().uuid() });

/** Drop C0 control chars + DEL from a display name before it goes into a push template. */
function sanitizeName(raw: string): string {
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp > 0x1f && cp !== 0x7f;
    })
    .join('')
    .trim()
    .slice(0, 80);
  return cleaned;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_request' }, { status: 400 });
    }
    const { instructor_id } = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    // Self-interest is a benign no-op, not an error.
    if (user.id === instructor_id) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const service = getServiceRoleClient();

    const { allowed } = await checkRateLimit(service, `notify-interest:${user.id}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // Recipient + sender derived server-side — no client-supplied content.
    const [{ data: instructor }, { data: athlete }] = await Promise.all([
      service.from('users').select(`id, is_instructor, ${LANGUAGE_FIELDS}`).eq('id', instructor_id).maybeSingle(),
      service.from('users').select('name').eq('id', user.id).maybeSingle(),
    ]);

    // Unknown instructor / not an instructor: benign no-op.
    if (!instructor || !instructor.is_instructor) {
      return NextResponse.json({ success: true, skipped: true });
    }

    // The interest itself must exist: no bell or push for an interest that
    // was never expressed.
    const { data: interest } = await service
      .from('training_interest')
      .select('id')
      .eq('athlete_id', user.id)
      .eq('instructor_id', instructor_id)
      .maybeSingle();
    if (!interest) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const isEs = recipientLanguage(instructor) === 'es';
    const athleteName = sanitizeName(athlete?.name || '') || (isEs ? 'Un atleta' : 'An athlete');
    const title = isEs ? '👋 Nuevo interés de entrenamiento' : '👋 New training interest';
    const body = isEs
      ? `${athleteName} está interesado en entrenar contigo`
      : `${athleteName} is interested in training with you`;

    // The bell, in the instructor's language.
    const bell = await createNotification(service, {
      recipient_id: instructor_id,
      actor_id: user.id,
      type: 'training_interest',
      entity_type: 'user',
      entity_id: user.id,
      message: isEs ? 'Un atleta está interesado en entrenar contigo' : 'An athlete is interested in training with you',
    });
    if (!bell.success) {
      logError(new Error(bell.error ?? 'createNotification failed'), {
        route: '/api/instructor/notify-interest',
        action: 'bell',
        instructor_id,
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (siteUrl && cronSecret) {
      // Fire-and-forget: a delivery hiccup must not fail the interest UX.
      fetch(`${siteUrl}/api/notifications/send/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
        body: JSON.stringify({
          userId: instructor_id,
          title,
          body,
          url: '/dashboard/instructor',
          // Top-level `type` gates the send on the instructor's messages push
          // preference at the endpoint (W2 Group A). The `data.type` below is a
          // separate client-side payload field, left as-is.
          type: 'training_interest',
          data: { type: 'training_interest' },
        }),
      }).catch((err) => logError(err, { route: '/api/instructor/notify-interest', action: 'dispatch', instructor_id }));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: '/api/instructor/notify-interest' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
