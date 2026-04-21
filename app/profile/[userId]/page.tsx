/**
 * /profile/[userId] — Server Component.
 *
 * Fourth Tribe route on the Server Component pattern. Fetches the
 * target profile + session counts + attendance stats server-side in
 * parallel, then hands off to ProfilePageClient for viewer-dependent
 * UI (block/report buttons, lightbox, invite sheet).
 *
 * Two things stay client-side by design:
 *   - current viewer identity (session cookie only the browser has)
 *   - viewer ↔ target blocked status (viewer-scoped, not cacheable in
 *     the server payload)
 *
 * The not-found case is handled by rendering the client with
 * `initialProfile: null` — the client already has a dedicated 404
 * block (keeps the back button + BottomNav working). Not using
 * Next.js `notFound()` here because losing the BottomNav on profile
 * 404 would be a regression from current behavior.
 */

import { createClient } from '@/lib/supabase/server';
import { fetchUserProfile, fetchSessionsByCreatorCount, fetchParticipantCountForUser } from '@/lib/dal';
import { logError } from '@/lib/logger';
import type { Database } from '@/lib/database.types';
import ProfilePageClient, { type ProfileStats } from './ProfilePageClient';

type UserProfile = Database['public']['Tables']['users']['Row'];

export const dynamic = 'force-dynamic';

interface ProfilePageProps {
  params: Promise<{ userId: string }>;
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { userId } = await params;

  let initialProfile: UserProfile | null = null;
  let initialStats: ProfileStats = {
    sessionsCreated: 0,
    sessionsJoined: 0,
    totalSessions: 0,
    attendanceRate: 0,
    totalAttendance: 0,
  };

  try {
    const supabase = await createClient();

    // Profile, session counts, and attendance RPC all run in parallel.
    // Attendance is a Supabase RPC, not a DAL function — inline here
    // since it's the only caller.
    const [profileResult, createdResult, joinedResult, attendanceRpc] = await Promise.all([
      fetchUserProfile(supabase, userId),
      fetchSessionsByCreatorCount(supabase, userId),
      fetchParticipantCountForUser(supabase, userId),
      supabase.rpc('get_user_attendance_stats', { user_uuid: userId }),
    ]);

    if (profileResult.success && profileResult.data) {
      initialProfile = profileResult.data as UserProfile;
    } else if (!profileResult.success) {
      logError(new Error(profileResult.error ?? 'fetchUserProfile failed'), {
        action: 'PublicProfilePage.profileFetch',
        userId,
      });
    }

    const created = createdResult.success ? (createdResult.data ?? 0) : 0;
    const joined = joinedResult.success ? (joinedResult.data ?? 0) : 0;
    const attendanceRow = (
      attendanceRpc.data as Array<{
        total_sessions: number;
        attended_sessions: number;
        attendance_rate: number;
      }> | null
    )?.[0] ?? { total_sessions: 0, attended_sessions: 0, attendance_rate: 0 };

    initialStats = {
      sessionsCreated: created,
      sessionsJoined: joined,
      totalSessions: created + joined,
      attendanceRate: Number(attendanceRow.attendance_rate) || 0,
      totalAttendance: Number(attendanceRow.total_sessions) || 0,
    };
  } catch (error) {
    logError(error, { action: 'PublicProfilePage.serverFetch', userId });
  }

  return <ProfilePageClient userId={userId} initialProfile={initialProfile} initialStats={initialStats} />;
}
