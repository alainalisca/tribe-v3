import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';

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
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Fetch all active preferences joined with user location/sports data
    const { data: prefsRows, error: prefsError } = await supabase
      .from('user_training_preferences')
      .select('user_id, preferred_sports, availability, gender_preference, max_distance_km')
      .eq('active', true);

    if (prefsError) {
      logError(prefsError, { route: '/api/cron/smart-match', action: 'fetch_prefs' });
      return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }

    if (!prefsRows?.length) {
      return NextResponse.json({ success: true, processed: 0, matches_created: 0 });
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

    // Merge prefs + user data
    const usersMap = new Map(usersData?.map((u) => [u.id, u]) || []);
    const users: UserWithPrefs[] = [];

    for (const pref of prefsRows) {
      const u = usersMap.get(pref.user_id);
      if (!u) continue;
      users.push({
        id: u.id,
        name: u.name,
        location_lat: u.location_lat,
        location_lng: u.location_lng,
        sports: u.sports,
        gender: u.gender,
        preferred_sports: pref.preferred_sports || [],
        availability: (pref.availability as Array<{ day: string; start: string; end: string }>) || [],
        gender_preference: pref.gender_preference || 'any',
        max_distance_km: pref.max_distance_km || 10,
      });
    }

    let matchesCreated = 0;

    // 2. For each user, find compatible matches
    for (const user of users) {
      if (!user.location_lat || !user.location_lng) continue;

      const candidates: Array<{
        matched_user_id: string;
        score: number;
        shared_sports: string[];
        distance_km: number;
      }> = [];

      for (const other of users) {
        if (other.id === user.id) continue;
        if (!other.location_lat || !other.location_lng) continue;
        if (blockedSet.has(`${user.id}:${other.id}`)) continue;

        // Gender preference filter
        if (user.gender_preference !== 'any' && other.gender !== user.gender_preference) continue;

        // Distance check
        const dist = haversineKm(user.location_lat, user.location_lng, other.location_lat, other.location_lng);
        if (dist > user.max_distance_km) continue;

        // Shared sports between user's preferred sports and other user's sports/preferred_sports
        const otherSports = new Set([...(other.sports || []), ...other.preferred_sports]);
        const sharedSports = user.preferred_sports.filter((s) => otherSports.has(s));
        if (sharedSports.length === 0) continue;

        // Score: shared_sports * 40 + proximity * 40 + availability * 20
        const sportsScore = Math.min(sharedSports.length / Math.max(user.preferred_sports.length, 1), 1) * 40;
        const proximityScore = Math.max(0, 1 - dist / user.max_distance_km) * 40;
        const overlapCount = availabilityOverlap(user.availability, other.availability);
        const availScore = Math.min(overlapCount / 3, 1) * 20;
        const totalScore = Math.round((sportsScore + proximityScore + availScore) * 100) / 100;

        candidates.push({
          matched_user_id: other.id,
          score: totalScore,
          shared_sports: sharedSports,
          distance_km: Math.round(dist * 100) / 100,
        });
      }

      // Take top 5
      candidates.sort((a, b) => b.score - a.score);
      const topMatches = candidates.slice(0, 5);

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
          logError(upsertError, {
            route: '/api/cron/smart-match',
            action: 'upsert_match',
            userId: user.id,
          });
          continue;
        }

        matchesCreated++;

        // Find matched user name for the notification
        const matchedUser = usersMap.get(match.matched_user_id);
        const matchedName = matchedUser?.name || 'Someone';
        const topSport = match.shared_sports[0] || 'fitness';

        // Create notification for the user
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

    return NextResponse.json({
      success: true,
      processed: users.length,
      matches_created: matchesCreated,
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/cron/smart-match', action: 'smart_match_cron' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
