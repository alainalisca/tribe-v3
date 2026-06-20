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
 * The in-app notification (the bell) is created separately client-side via
 * createNotification; this route adds the device push so the instructor is
 * actually pinged. The push is localized to the INSTRUCTOR's language.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';

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
      service.from('users').select('id, is_instructor, preferred_language').eq('id', instructor_id).maybeSingle(),
      service.from('users').select('name').eq('id', user.id).maybeSingle(),
    ]);

    // Unknown instructor / not an instructor: benign no-op.
    if (!instructor || !instructor.is_instructor) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const isEs = (instructor.preferred_language ?? 'en') === 'es';
    const athleteName = sanitizeName(athlete?.name || '') || (isEs ? 'Un atleta' : 'An athlete');
    const title = isEs ? '👋 Nuevo interés de entrenamiento' : '👋 New training interest';
    const body = isEs
      ? `${athleteName} está interesado en entrenar contigo`
      : `${athleteName} is interested in training with you`;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (siteUrl && cronSecret) {
      // Fire-and-forget: a delivery hiccup must not fail the interest UX.
      fetch(`${siteUrl}/api/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
        body: JSON.stringify({
          userId: instructor_id,
          title,
          body,
          url: '/dashboard/instructor',
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
