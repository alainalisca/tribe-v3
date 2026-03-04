import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { log, logError } from '@/lib/logger';
import { fetchUserName, fetchUsersWithPush } from '@/lib/dal';

function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * @description Sends push notifications to nearby users (within 10km) who match the session's sport, informing them about a new or upcoming training session.
 * @method POST
 * @auth Required - validates the caller is authenticated via Supabase auth and must be the session creator.
 * @param {Object} request.body - JSON body with `sessionId`, `sport`, `location`, `latitude`, `longitude`, `startIn` (minutes until start), and `creatorId`.
 * @returns {{ notified: number, total: number }} Count of users successfully notified and total nearby users found.
 */
export async function POST(request: Request) {
  try {
    // AUTH: verify the caller is authenticated
    const supabaseAuth = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId, sport, location, latitude, longitude, startIn, creatorId } = await request.json();

    // AUTHORIZATION: only the session creator can trigger nearby notifications
    if (user.id !== creatorId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Service role client needed to read all users' push tokens and locations
    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Get creator name
    const nameResult = await fetchUserName(supabase, creatorId);
    const creatorName = nameResult.data || 'Someone';

    // Get users with push subscriptions
    const usersResult = await fetchUsersWithPush(
      supabase,
      'id, name, push_subscription, fcm_token, sports, latitude, longitude, preferred_language'
    );

    if (!usersResult.success) {
      logError(usersResult.error, { route: '/api/notify-nearby', action: 'fetch_users' });
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const users = ((usersResult.data || []) as Array<Record<string, unknown>>).filter(
      (u) => u.id !== creatorId
    ) as Array<{
      id: string;
      name: string;
      push_subscription: unknown;
      fcm_token: string | null;
      sports: string[] | null;
      latitude: number | null;
      longitude: number | null;
      preferred_language: string | null;
    }>;

    // Filter: must have at least one notification channel, match sport, and be nearby
    const nearbyUsers = (users || []).filter((user) => {
      if (!user.push_subscription && !user.fcm_token) return false;

      const userSports = user.sports || [];
      const hasSport = userSports.length === 0 || userSports.includes(sport);

      if (user.latitude && user.longitude && latitude && longitude) {
        const distance = getDistanceInKm(latitude, longitude, user.latitude, user.longitude);
        return hasSport && distance <= 10; // 10km radius
      }
      return hasSport;
    });

    if (nearbyUsers.length === 0) {
      return NextResponse.json({ notified: 0 });
    }

    // Build per-language notification groups and send via the unified endpoint
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${request.headers.get('host')}`;
    const url = `/session/${sessionId}`;
    let notifiedCount = 0;

    // Batch users by language to minimize request payloads
    const byLang: Record<string, string[]> = { es: [], en: [] };
    for (const user of nearbyUsers) {
      const lang = user.preferred_language === 'es' ? 'es' : 'en';
      byLang[lang].push(user.id);
    }

    for (const [lang, userIds] of Object.entries(byLang)) {
      if (userIds.length === 0) continue;

      const isSpanish = lang === 'es';
      const startText =
        startIn === 0 ? (isSpanish ? 'ahora' : 'now') : isSpanish ? `en ${startIn} min` : `in ${startIn} min`;

      const title = isSpanish
        ? `🏋️ ${creatorName} quiere entrenar ${sport}!`
        : `🏋️ ${creatorName} wants to train ${sport}!`;

      const body = isSpanish
        ? `Empieza ${startText} en ${location}. ¡Únete ahora!`
        : `Starting ${startText} at ${location}. Join now!`;

      // Use PUT for batch send to the unified notification endpoint
      const response = await fetch(`${SITE_URL}/api/notifications/send`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, title, body, url }),
      });

      if (response.ok) {
        const result = await response.json();
        notifiedCount += (result.results?.fcm?.sent || 0) + (result.results?.webPush?.sent || 0);
      } else {
        log('error', `Batch notify failed for ${lang} users`, {
          route: '/api/notify-nearby',
          action: 'batch_notify',
          lang,
          responseBody: await response.text(),
        });
      }
    }

    return NextResponse.json({
      notified: notifiedCount,
      total: nearbyUsers.length,
    });
  } catch (error) {
    logError(error, { route: '/api/notify-nearby', action: 'send_nearby_notifications' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
