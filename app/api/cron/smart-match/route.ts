import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { log, logError } from '@/lib/logger';

/** Haversine distance between two lat/lng points in km */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Count overlapping availability slots between two users */
function availabilityOverlap(
  a: Array<{ day: string; start: string; end: string }>,
  b: Array<{ day: string; start: string; end: string }>
): number {
  if (!a?.length || !b?.length) return 0;
  let overlap = 0;
  for (const slotA of a) {
    for (const slotB of b) {
      if (slotA.day === slotB.day) {
        // Simple overlap: if time ranges intersect at all
        if (slotA.start < slotB.end && slotB.start < slotA.end) {
          overlap++;
        }
      }
    }
  }
  return overlap;
}

interface UserWithPrefs {
  id: string;
  name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  sports: string[] | null;
  gender: string | null;
  preferred_sports: string[];
  availability: Array<{ day: string; start: string; end: string }>;
  gender_preference: string;
  max_distance_km: number;
}

/**
 * @description Smart Match cron — finds compatible training partners based on
 *   sports, location proximity, availability overlap, and gender preferences.
 *   Runs daily, upserting top matches and creating notifications for new ones.
 * @method GET
 * @auth Required — validates CRON_SECRET via Bearer token in the Authorization header.
 * @returns {{ success: boolean, processed: number, matches_created: number }}
 */
export async function GET(request: Request) {
  // LR-05: structured run logging.
  const route = 'cron:smart-match';
  const startedAt = Date.now();
  log('info', 'cron_start', { action: 'cron_start', route });

  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Process in batches to prevent timeout on large user sets
    const BATCH_SIZE = 50;

    // 1. Fetch batch of active preferences (oldest updated first)
    const { data: prefsRows, error: prefsError } = await supabase
      .from('user_training_preferences')
      .select('user_id, preferred_sports, availability, gender_preference, max_distance_km')
      .eq('active', true)
      .order('updated_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (prefsError) {
      logError(prefsError, { route: '/api/cron/smart-match', action: 'fetch_prefs' });
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    if (!prefsRows?.length) {
      const duration_ms = Date.now() - startedAt;
      log('info', 'cron_complete', {
        action: 'cron_complete',
        route,
        duration_ms,
        processed: 0,
        matches_created: 0,
        skipped: 'no_preferences',
      });
      return NextResponse.json({ ok: true, route, duration_ms, processed: 0, matches_created: 0 });
    }

    const userIds = prefsRows.map((p) => p.user_id);

    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id, name, location_lat, location_lng, sports, gender')
      .in('id', userIds)
      .eq('banned', false);

    if (usersError) {
      logError(usersError, { route: '/api/cron/smart-match', action: 'fetch_users' });
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Fetch blocked user pairs to exclude
    const { data: blockedRows } = await supabase
      .from('blocked_users')
      .select('user_id, blocked_user_id')
      .in('user_id', userIds);

    const blockedSet = new Set<string>();
    for (const b of blockedRows || []) {
      if (b.user_id && b.blocked_user_id) {
        blockedSet.add(`${b.user_id}:${b.blocked_user_id}`);
        blockedSet.add(`${b.blocked_user_id}:${b.user_id}`);
      }
    }

    const usersMap = new Map(usersData?.map((u) => [u.id, u]) || []);
    let matchesCreated = 0;

    // 2. Pre-fetch ALL candidate data in batch (avoid per-user DB queries)
    const allSports = [...new Set(prefsRows.flatMap((p) => p.preferred_sports || []))];

    const { data: allCandidatePrefs } = await supabase
      .from('user_training_preferences')
      .select('user_id, preferred_sports, availability, gender_preference')
      .eq('active', true)
      .overlaps('preferred_sports', allSports);

    const allCandidateIds = [...new Set((allCandidatePrefs || []).map((c) => c.user_id))];

    const { data: allCandidateUsers } = await supabase
      .from('users')
      .select('id, name, location_lat, location_lng, sports, gender')
      .in('id', allCandidateIds)
      .eq('banned', false);

    // Build lookup maps for in-memory scoring
    const allCandidatePrefsMap = new Map<
      string,
      Array<typeof allCandidatePrefs extends (infer T)[] | null ? T : never>
    >();
    for (const cp of allCandidatePrefs || []) {
      if (!allCandidatePrefsMap.has(cp.user_id)) allCandidatePrefsMap.set(cp.user_id, []);
      allCandidatePrefsMap.get(cp.user_id)!.push(cp);
    }
    const allCandidateUsersMap = new Map((allCandidateUsers || []).map((u) => [u.id, u]));

    // 3. Per-user scoring from in-memory data (no DB calls inside loop)
    for (const pref of prefsRows) {
      const user = usersMap.get(pref.user_id);
      if (!user?.location_lat || !user?.location_lng) continue;

      const userPrefs = {
        preferred_sports: pref.preferred_sports || [],
        availability: (pref.availability as Array<{ day: string; start: string; end: string }>) || [],
        gender_preference: pref.gender_preference || 'any',
        max_distance_km: pref.max_distance_km || 10,
      };

      // Filter candidates from pre-fetched data: sport overlap + not self
      const candidatePrefs = (allCandidatePrefs || []).filter(
        (cp) =>
          cp.user_id !== user.id &&
          (cp.preferred_sports || []).some((s: string) => userPrefs.preferred_sports.includes(s))
      );

      if (!candidatePrefs.length) continue;

      const candidateMap = allCandidateUsersMap;

      const scored: Array<{
        matched_user_id: string;
        score: number;
        shared_sports: string[];
        distance_km: number;
      }> = [];

      for (const cp of candidatePrefs) {
        const other = candidateMap.get(cp.user_id);
        if (!other?.location_lat || !other?.location_lng) continue;
        if (blockedSet.has(`${user.id}:${other.id}`)) continue;
        if (userPrefs.gender_preference !== 'any' && other.gender !== userPrefs.gender_preference) continue;

        const dist = haversineKm(user.location_lat, user.location_lng, other.location_lat, other.location_lng);
        if (dist > userPrefs.max_distance_km) continue;

        const otherSports = new Set([...(other.sports || []), ...(cp.preferred_sports || [])]);
        const sharedSports = userPrefs.preferred_sports.filter((s: string) => otherSports.has(s));
        if (sharedSports.length === 0) continue;

        const sportsScore = Math.min(sharedSports.length / Math.max(userPrefs.preferred_sports.length, 1), 1) * 40;
        const proximityScore = Math.max(0, 1 - dist / userPrefs.max_distance_km) * 40;
        const otherAvail = (cp.availability as Array<{ day: string; start: string; end: string }>) || [];
        const overlapCount = availabilityOverlap(userPrefs.availability, otherAvail);
        const availScore = Math.min(overlapCount / 3, 1) * 20;
        const totalScore = Math.round((sportsScore + proximityScore + availScore) * 100) / 100;

        scored.push({
          matched_user_id: other.id,
          score: totalScore,
          shared_sports: sharedSports,
          distance_km: Math.round(dist * 100) / 100,
        });
      }

      scored.sort((a, b) => b.score - a.score);
      const topMatches = scored.slice(0, 5);

      for (const match of topMatches) {
        const { data: upserted, error: upsertError } = await supabase
          .from('smart_matches')
          .upsert(
            {
              user_id: user.id,
              matched_user_id: match.matched_user_id,
              score: match.score,
              shared_sports: match.shared_sports,
              distance_km: match.distance_km,
              status: 'pending',
            },
            { onConflict: 'user_id,matched_user_id' }
          )
          .select('id')
          .single();

        if (upsertError) {
          logError(upsertError, { route: '/api/cron/smart-match', action: 'upsert_match', userId: user.id });
          continue;
        }

        matchesCreated++;

        const matchedUser = candidateMap.get(match.matched_user_id) || usersMap.get(match.matched_user_id);
        const matchedName = matchedUser?.name || 'Someone';
        const topSport = match.shared_sports[0] || 'fitness';

        await supabase.from('notifications').insert({
          recipient_id: user.id,
          actor_id: match.matched_user_id,
          type: 'smart_match',
          entity_type: 'smart_match',
          entity_id: upserted?.id || null,
          message: `${matchedName} also trains ${topSport} near you`,
        });
      }
    }

    const duration_ms = Date.now() - startedAt;
    log('info', 'cron_complete', {
      action: 'cron_complete',
      route,
      duration_ms,
      processed: prefsRows.length,
      matches_created: matchesCreated,
    });
    return NextResponse.json({
      ok: true,
      route,
      duration_ms,
      processed: prefsRows.length,
      matches_created: matchesCreated,
    });
  } catch (error: unknown) {
    const duration_ms = Date.now() - startedAt;
    logError(error, { action: 'cron_failed', route, duration_ms });
    return NextResponse.json({ ok: false, route, error: 'Internal server error' }, { status: 500 });
  }
}
