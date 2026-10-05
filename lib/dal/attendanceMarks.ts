/**
 * DAL: marking attendance (T-AV2).
 *
 * Since migration 8000 the ONLY way to write session_attendance is the
 * av_mark_attendance function: clients hold no INSERT or UPDATE on the table.
 * It authorizes the caller (host or admin), checks the person is a confirmed
 * participant and that the marking window is open, and upserts one row.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export const ATTENDANCE_STATUSES = ['attended', 'no_show', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** The refusals av_mark_attendance can return, plus 'failed' for anything else. */
export type MarkAttendanceError = 'invalid_status' | 'not_found' | 'not_participant' | 'outside_window' | 'failed';
const KNOWN_ERRORS: ReadonlySet<string> = new Set(['invalid_status', 'not_found', 'not_participant', 'outside_window']);

/** Mark one person. `status` null un-marks them (not the same as no-show). */
export async function markAttendance(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  status: AttendanceStatus | null
): Promise<DalResult<null> & { code?: MarkAttendanceError }> {
  try {
    const { data, error } = await supabase.rpc('av_mark_attendance', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_status: status,
    });
    if (error) {
      logError(error, { action: 'markAttendance', sessionId, userId, status });
      return { success: false, error: error.message, code: 'failed' };
    }
    const body = (data ?? {}) as { success?: unknown; error?: unknown };
    if (body.success === true) return { success: true };
    const code =
      typeof body.error === 'string' && KNOWN_ERRORS.has(body.error) ? (body.error as MarkAttendanceError) : 'failed';
    return { success: false, error: String(body.error ?? 'unknown'), code };
  } catch (error) {
    logError(error, { action: 'markAttendance', sessionId, userId, status });
    return { success: false, error: 'Failed', code: 'failed' };
  }
}

/** Each person's mark for one session. A person with no row is absent from the result. */
export async function fetchAttendanceMarks(
  supabase: SupabaseClient,
  sessionId: string,
  userIds: string[]
): Promise<DalResult<Array<{ user_id: string; status: AttendanceStatus | null; attended: boolean }>>> {
  if (userIds.length === 0) return { success: true, data: [] };
  try {
    const { data, error } = await supabase
      .from('session_attendance')
      .select('user_id, status, attended')
      .eq('session_id', sessionId)
      .in('user_id', userIds);
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: (data ?? []).map((r) => ({
        user_id: r.user_id as string,
        status: (ATTENDANCE_STATUSES as readonly string[]).includes(r.status as string)
          ? (r.status as AttendanceStatus)
          : null,
        attended: r.attended === true,
      })),
    };
  } catch (error) {
    logError(error, { action: 'fetchAttendanceMarks', sessionId });
    return { success: false, error: 'Failed' };
  }
}
