/**
 * Async Server Component that fetches stats for a user.
 *
 * Wrapped in Suspense by page.tsx so the profile header (name, bio,
 * sports, avatar) renders as soon as the profile row resolves, while
 * this component's three-way parallel fetch (created + joined counts
 * plus the attendance RPC) streams in separately.
 *
 * The attendance RPC (`get_user_attendance_stats`) is the slowest of
 * the three in most benchmarks — it scans session_participants and
 * joins against sessions to compute an attendance rate. Pulling it
 * behind its own Suspense boundary means a slow attendance query
 * no longer blocks the whole page from rendering.
 *
 * Renders the client component `ProfileStatsClient` with the computed
 * numbers. Localization happens there — server components can't read
 * the client-side language preference from localStorage.
 */

import { createClient } from '@/lib/supabase/server';
import { fetchSessionsByCreatorCount, fetchParticipantCountForUser } from '@/lib/dal';
import { logError } from '@/lib/logger';
import type { ProfileStats } from './ProfilePageClient';
import ProfileStatsClient from './ProfileStatsClient';

export default async function ProfileStatsServer({ userId }: { userId: string }) {
  let stats: ProfileStats = {
    sessionsCreated: 0,
    sessionsJoined: 0,
    totalSessions: 0,
    attendanceRate: 0,
    totalAttendance: 0,
  };

  try {
    const supabase = await createClient();
    const [createdResult, joinedResult, attendanceRpc] = await Promise.all([
      fetchSessionsByCreatorCount(supabase, userId),
      fetchParticipantCountForUser(supabase, userId),
      supabase.rpc('get_user_attendance_stats', { user_uuid: userId }),
    ]);

    const created = createdResult.success ? (createdResult.data ?? 0) : 0;
    const joined = joinedResult.success ? (joinedResult.data ?? 0) : 0;
    const attendanceRow = (
      attendanceRpc.data as Array<{
        total_sessions: number;
        attended_sessions: number;
        attendance_rate: number;
      }> | null
    )?.[0] ?? { total_sessions: 0, attended_sessions: 0, attendance_rate: 0 };

    stats = {
      sessionsCreated: created,
      sessionsJoined: joined,
      totalSessions: created + joined,
      attendanceRate: Number(attendanceRow.attendance_rate) || 0,
      totalAttendance: Number(attendanceRow.total_sessions) || 0,
    };
  } catch (error) {
    // Fail-soft: render zeroes if the stat fetch breaks. The parent
    // profile page already rendered; no reason to error-boundary the
    // whole route just because stats failed.
    logError(error, { action: 'ProfileStatsServer.fetch', userId });
  }

  return <ProfileStatsClient stats={stats} />;
}
