import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isValidCronAuth } from '@/lib/auth/cron';
import { log, logError } from '@/lib/logger';
import { expireStaleOffers, offerSpotToNextInLine } from '@/lib/dal/waitlist';
import { createNotification } from '@/lib/dal/notifications';
import { notificationCopy, toLang } from '@/lib/notification-i18n';

/**
 * Hourly cron: expire stale 24-hour offers and auto-offer to the next
 * person in line. Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  // LR-05: structured run logging.
  const route = 'cron:waitlist-expiry';
  const startedAt = Date.now();
  log('info', 'cron_start', { action: 'cron_start', route });

  try {
    const authHeader = request.headers.get('authorization');
    if (!isValidCronAuth(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Gather the sessions whose offers are about to be expired, so we can
    // offer to the next in line for each.
    const nowIso = new Date().toISOString();
    const { data: aboutToExpire } = await supabase
      .from('session_waitlist')
      .select('session_id, user_id')
      .eq('status', 'offered')
      .lt('offer_expires_at', nowIso);

    const expiringUsers: Array<{ session_id: string; user_id: string }> =
      (aboutToExpire as Array<{ session_id: string; user_id: string }> | null) || [];

    const result = await expireStaleOffers(supabase);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Pre-fetch preferred_language for all affected users in one query.
    const allAffectedIds = [...expiringUsers.map((e) => e.user_id)];
    const langMap = new Map<string, 'en' | 'es'>();
    if (allAffectedIds.length > 0) {
      const { data: langRows } = await supabase.from('users').select('id, preferred_language').in('id', allAffectedIds);
      for (const row of (langRows as Array<{ id: string; preferred_language: string | null }> | null) ?? []) {
        langMap.set(row.id, toLang(row.preferred_language));
      }
    }

    // Per unique session, re-offer to the next waiting user.
    const sessions = Array.from(new Set(expiringUsers.map((e) => e.session_id)));
    let reoffered = 0;
    for (const sessionId of sessions) {
      const offer = await offerSpotToNextInLine(supabase, sessionId);
      if (offer.success && offer.data) {
        reoffered += 1;
        const offeredToId = offer.data.offered_to;
        // offered_to may not be in our pre-fetched set; fall back to a lookup.
        let recipientLang = langMap.get(offeredToId);
        if (!recipientLang) {
          const { data: lr } = await supabase
            .from('users')
            .select('preferred_language')
            .eq('id', offeredToId)
            .maybeSingle();
          recipientLang = toLang((lr as { preferred_language?: string | null } | null)?.preferred_language);
        }
        const copy = notificationCopy('waitlist_offered', recipientLang);
        await createNotification(supabase, {
          recipient_id: offeredToId,
          actor_id: null,
          type: 'waitlist_offered',
          entity_type: 'session',
          entity_id: sessionId,
          message: copy.body,
        });
      }
    }

    // Notify previously-offered users that their offer expired.
    for (const e of expiringUsers) {
      const expiredLang = langMap.get(e.user_id) ?? 'es';
      const copy = notificationCopy('waitlist_expired', expiredLang);
      await createNotification(supabase, {
        recipient_id: e.user_id,
        actor_id: null,
        type: 'waitlist_expired',
        entity_type: 'session',
        entity_id: e.session_id,
        message: copy.body,
      });
    }

    const duration_ms = Date.now() - startedAt;
    const expired = result.data?.expired ?? 0;
    log('info', 'cron_complete', {
      action: 'cron_complete',
      route,
      duration_ms,
      expired,
      reoffered,
    });
    return NextResponse.json({
      ok: true,
      route,
      duration_ms,
      expired,
      reoffered,
    });
  } catch (error) {
    const duration_ms = Date.now() - startedAt;
    logError(error, { action: 'cron_failed', route, duration_ms });
    return NextResponse.json({ ok: false, route, error: 'Internal server error' }, { status: 500 });
  }
}
