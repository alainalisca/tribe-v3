/**
 * DAL: client_attendance CRUD + per-client/session history reads.
 *
 * Extracted from lib/dal/clients.ts during the Phase 2 refactor.
 * Re-exported from clients.ts so existing imports stay green.
 *
 * All operations go through the caller's session-aware Supabase
 * client; RLS on client_attendance scopes to the parent client's
 * owning gym/instructor (migration 070).
 *
 * Counter maintenance is handled by the database trigger from
 * migration 079 — clients.total_sessions, sessions_last_30_days,
 * current_streak_days, and longest_streak_days are kept in sync
 * automatically on insert/update/delete here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type {
  AttendanceRow,
  AttendanceWithClient,
  AttendanceWithSession,
  ClientAttendanceSummary,
  Currency,
  RecordAttendanceInput,
  UpdateAttendanceInput,
} from './clients';

const ATTENDANCE_SELECT =
  'id, client_id, session_id, attended, paid, attended_at, amount_paid_cents, currency, payment_method, notes, refunded_amount_cents, refunded_at, refund_reason, created_at, updated_at';

/**
 * Record (or update) attendance for a (client, session) pair. UPSERT
 * on the unique constraint — idempotent: re-marking attendance for the
 * same pair updates the existing row rather than creating a duplicate.
 *
 * Payment fields are co-required at the type level; passing
 * amount_paid_cents without currency is a TypeScript error before it
 * ever reaches the DB CHECK constraint.
 */
export async function recordAttendance(
  supabase: SupabaseClient,
  input: RecordAttendanceInput
): Promise<DalResult<AttendanceRow>> {
  try {
    const { data, error } = await supabase
      .from('client_attendance')
      .upsert(
        {
          client_id: input.client_id,
          session_id: input.session_id,
          attended: input.attended,
          paid: input.paid,
          attended_at: input.attended_at ?? (input.attended ? new Date().toISOString() : null),
          amount_paid_cents: input.amount_paid_cents ?? null,
          currency: input.currency ?? null,
          payment_method: input.payment_method ?? null,
          notes: input.notes ?? null,
        },
        { onConflict: 'client_id,session_id' }
      )
      .select(ATTENDANCE_SELECT)
      .single();

    if (error) {
      logError(error, {
        action: 'recordAttendance',
        clientId: input.client_id,
        sessionId: input.session_id,
      });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as AttendanceRow };
  } catch (error) {
    logError(error, {
      action: 'recordAttendance',
      clientId: input.client_id,
      sessionId: input.session_id,
    });
    return { success: false, error: 'Failed to record attendance' };
  }
}

/**
 * Partial-update an attendance row. Used when the coach realizes
 * they recorded the wrong status (attended=true → false), need to
 * fix a payment amount, or want to flip paid → unpaid after a refund.
 *
 * The 079 counter trigger refires on UPDATE OF attended / attended_at,
 * so the client's cached counters stay correct after this call. The
 * 076 partner trigger only fires on false → true transitions (handled),
 * so flipping attended back to false leaves the partner edges in
 * place — that's intentional, partial history shouldn't blow away
 * the community graph.
 *
 * RLS scopes the UPDATE to attendance rows the caller can see; the
 * client_id ownership chain runs through the parent client.
 */
export async function updateAttendance(
  supabase: SupabaseClient,
  attendanceId: string,
  updates: UpdateAttendanceInput
): Promise<DalResult<AttendanceRow>> {
  try {
    const payload: Record<string, unknown> = {};
    if (updates.attended !== undefined) payload.attended = updates.attended;
    if (updates.paid !== undefined) payload.paid = updates.paid;
    if (updates.attended_at !== undefined) payload.attended_at = updates.attended_at;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.amount_paid_cents !== undefined) payload.amount_paid_cents = updates.amount_paid_cents;
    if (updates.currency !== undefined) payload.currency = updates.currency;
    if (updates.payment_method !== undefined) payload.payment_method = updates.payment_method;

    if (Object.keys(payload).length === 0) {
      return { success: false, error: 'no_updates' };
    }

    const { data, error } = await supabase
      .from('client_attendance')
      .update(payload)
      .eq('id', attendanceId)
      .select(ATTENDANCE_SELECT)
      .single();

    if (error) {
      logError(error, { action: 'updateAttendance', attendanceId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as AttendanceRow };
  } catch (error) {
    logError(error, { action: 'updateAttendance.exception', attendanceId });
    return { success: false, error: 'Failed to update attendance' };
  }
}

/** Snapshot of an attendance row, captured during delete for forensics. */
export interface DeletedAttendanceSnapshot {
  id: string;
  client_id: string;
  session_id: string;
  attended: boolean;
  paid: boolean;
  amount_paid_cents: number | null;
  currency: string | null;
  /** Gym id resolved via the joined client. Null if the client row was already gone. */
  gym_id: string | null;
}

/**
 * Hard-delete an attendance row. The 079 counter trigger fires on
 * DELETE so the client's cached counters update automatically. Use
 * sparingly — usually editing the row is the right move; deletion
 * is for "this was recorded for the wrong client entirely."
 *
 * Returns a snapshot of the deleted row so the caller can write a
 * forensic audit entry (action: 'attendance.delete') without a
 * separate pre-delete fetch. The snapshot covers money-relevant
 * fields (paid, amount_paid_cents, currency) because attendance
 * deletion can erase recorded revenue and we want a paper trail.
 */
export async function deleteAttendance(
  supabase: SupabaseClient,
  attendanceId: string
): Promise<DalResult<DeletedAttendanceSnapshot | null>> {
  try {
    // .delete().select() returns the deleted rows (Postgres RETURNING).
    // We also pull the parent client's gym_id in the same round trip
    // so the route handler can call writeAuditEntry with the correct
    // gymId without a follow-up query.
    const { data, error } = await supabase
      .from('client_attendance')
      .delete()
      .eq('id', attendanceId)
      .select(
        `
          id, client_id, session_id, attended, paid, amount_paid_cents, currency,
          client:clients(gym_id)
        `
      )
      .maybeSingle();
    if (error) {
      logError(error, { action: 'deleteAttendance', attendanceId });
      return { success: false, error: error.message };
    }
    if (!data) {
      // Row didn't exist (already deleted, or RLS hid it). Return success
      // with null snapshot — the caller treats this as a no-op.
      return { success: true, data: null };
    }
    const client = data.client as unknown as { gym_id: string | null } | null;
    const snapshot: DeletedAttendanceSnapshot = {
      id: data.id as string,
      client_id: data.client_id as string,
      session_id: data.session_id as string,
      attended: data.attended as boolean,
      paid: data.paid as boolean,
      amount_paid_cents: (data.amount_paid_cents as number | null) ?? null,
      currency: (data.currency as string | null) ?? null,
      gym_id: client?.gym_id ?? null,
    };
    return { success: true, data: snapshot };
  } catch (error) {
    logError(error, { action: 'deleteAttendance.exception', attendanceId });
    return { success: false, error: 'Failed to delete attendance' };
  }
}

export interface RefundAttendanceInput {
  /** Refund amount in minor units. Must be > 0 and <= amount_paid_cents. */
  refundedAmountCents: number;
  /** Free-text reason, 1-500 chars. Recorded for accounting + audit. */
  refundReason: string;
}

/** Snapshot returned after a successful refund. Drives the audit-log payload. */
export interface RefundedAttendanceSnapshot {
  id: string;
  client_id: string;
  session_id: string;
  amount_paid_cents: number | null;
  refunded_amount_cents: number;
  currency: Currency | null;
  refund_reason: string;
  refunded_at: string;
  /** Gym id, resolved via the joined client. Null when the parent client row is gone. */
  gym_id: string | null;
}

/** Discriminated error codes from refundAttendance. Mapped to HTTP status in the route. */
export type RefundAttendanceError =
  | 'not_found' // attendance row doesn't exist (or RLS hid it)
  | 'not_paid' // can't refund an attendance that was never paid
  | 'already_refunded' // already has a refund recorded; this DAL is single-event today
  | 'amount_invalid' // refundedAmountCents not in (0, amount_paid_cents]
  | 'reason_invalid' // refund reason missing or too long
  | 'db_error';

const MAX_REFUND_REASON_LENGTH = 500;

/**
 * Record a refund against a previously-paid attendance row.
 *
 * Single-event-per-row by design: today we don't accept multiple
 * partial refunds against the same attendance. A coach who needs
 * to refund twice can delete and re-record, or we extend to a
 * separate `attendance_refunds` table later. The simple shape
 * covers ~99% of cases without the complexity.
 *
 * Validation runs in TS BEFORE hitting the DB so we can return
 * clear error codes. The migration's CHECK constraint is the
 * belt-and-suspenders backstop.
 *
 * On success, returns a snapshot suitable for writing an
 * `attendance.refund` audit-log entry.
 */
export async function refundAttendance(
  supabase: SupabaseClient,
  attendanceId: string,
  input: RefundAttendanceInput
): Promise<DalResult<RefundedAttendanceSnapshot>> {
  const reason = input.refundReason?.trim() ?? '';
  if (reason.length === 0 || reason.length > MAX_REFUND_REASON_LENGTH) {
    return { success: false, error: 'reason_invalid' satisfies RefundAttendanceError };
  }
  if (!Number.isFinite(input.refundedAmountCents) || input.refundedAmountCents <= 0) {
    return { success: false, error: 'amount_invalid' satisfies RefundAttendanceError };
  }
  const refundedAmountCents = Math.round(input.refundedAmountCents);

  try {
    // Load the row first so we can validate the refund amount against
    // amount_paid_cents and reject duplicate refunds early with a
    // friendly error code. RLS still gates the read.
    const { data: existing, error: existingErr } = await supabase
      .from('client_attendance')
      .select(
        `
          id, client_id, session_id, paid, amount_paid_cents, currency,
          refunded_amount_cents,
          client:clients(gym_id)
        `
      )
      .eq('id', attendanceId)
      .maybeSingle();
    if (existingErr) {
      logError(existingErr, { action: 'refundAttendance.lookup', attendanceId });
      return { success: false, error: 'db_error' satisfies RefundAttendanceError };
    }
    if (!existing) {
      return { success: false, error: 'not_found' satisfies RefundAttendanceError };
    }
    if (!existing.paid || existing.amount_paid_cents === null || existing.amount_paid_cents <= 0) {
      return { success: false, error: 'not_paid' satisfies RefundAttendanceError };
    }
    if (existing.refunded_amount_cents !== null) {
      return { success: false, error: 'already_refunded' satisfies RefundAttendanceError };
    }
    if (refundedAmountCents > (existing.amount_paid_cents as number)) {
      return { success: false, error: 'amount_invalid' satisfies RefundAttendanceError };
    }

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('client_attendance')
      .update({
        refunded_amount_cents: refundedAmountCents,
        refunded_at: nowIso,
        refund_reason: reason,
      })
      .eq('id', attendanceId);
    if (updateErr) {
      logError(updateErr, { action: 'refundAttendance.update', attendanceId });
      return { success: false, error: 'db_error' satisfies RefundAttendanceError };
    }

    const client = existing.client as unknown as { gym_id: string | null } | null;
    const snapshot: RefundedAttendanceSnapshot = {
      id: existing.id as string,
      client_id: existing.client_id as string,
      session_id: existing.session_id as string,
      amount_paid_cents: (existing.amount_paid_cents as number | null) ?? null,
      refunded_amount_cents: refundedAmountCents,
      currency: (existing.currency as Currency | null) ?? null,
      refund_reason: reason,
      refunded_at: nowIso,
      gym_id: client?.gym_id ?? null,
    };
    return { success: true, data: snapshot };
  } catch (error) {
    logError(error, { action: 'refundAttendance.exception', attendanceId });
    return { success: false, error: 'db_error' satisfies RefundAttendanceError };
  }
}

/**
 * Attendance history for one client, joined with each session's display
 * fields. Newest attendance first.
 */
export async function listAttendanceForClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<DalResult<AttendanceWithSession[]>> {
  try {
    const { data, error } = await supabase
      .from('client_attendance')
      .select(`${ATTENDANCE_SELECT}, session:sessions(id, title, sport, date, start_time)`)
      .eq('client_id', clientId)
      .order('attended_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      logError(error, { action: 'listAttendanceForClient', clientId });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as unknown as AttendanceWithSession[] };
  } catch (error) {
    logError(error, { action: 'listAttendanceForClient', clientId });
    return { success: false, error: 'Failed to load attendance history' };
  }
}

/**
 * Attendance for one session, scoped to clients owned by this
 * instructor. RLS already filters to the caller's own clients via the
 * client_attendance policy, but we additionally filter by the session
 * id at the query level.
 *
 * The `instructor_user_id` parameter is currently unused at the query
 * level (RLS does the work) — it's accepted to make the API caller's
 * intent explicit and so we can layer in caching keyed on (session,
 * instructor) later without changing the signature.
 */
export async function listAttendanceForSession(
  supabase: SupabaseClient,
  sessionId: string,
  _instructorUserId: string
): Promise<DalResult<AttendanceWithClient[]>> {
  try {
    const { data, error } = await supabase
      .from('client_attendance')
      .select(`${ATTENDANCE_SELECT}, client:clients(id, name, email)`)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      logError(error, { action: 'listAttendanceForSession', sessionId });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as unknown as AttendanceWithClient[] };
  } catch (error) {
    logError(error, { action: 'listAttendanceForSession', sessionId });
    return { success: false, error: 'Failed to load attendance for session' };
  }
}

/**
 * Aggregate stats for one client. Used by the client detail page.
 * Returns a zero-row summary (counts + totals = 0, last attendance =
 * null) when the client has no attendance recorded.
 */
export async function getClientAttendanceSummary(
  supabase: SupabaseClient,
  clientId: string
): Promise<DalResult<ClientAttendanceSummary>> {
  try {
    const { data, error } = await supabase
      .from('client_attendance')
      .select('attended, attended_at, amount_paid_cents, currency')
      .eq('client_id', clientId);

    if (error) {
      logError(error, { action: 'getClientAttendanceSummary', clientId });
      return { success: false, error: error.message };
    }

    const rows = (data ?? []) as Array<{
      attended: boolean;
      attended_at: string | null;
      amount_paid_cents: number | null;
      currency: Currency | null;
    }>;

    const summary: ClientAttendanceSummary = {
      total_attended_count: 0,
      total_paid_cents_usd: 0,
      total_paid_cents_cop: 0,
      last_attendance_at: null,
    };
    for (const r of rows) {
      if (r.attended) {
        summary.total_attended_count += 1;
        if (r.attended_at && (!summary.last_attendance_at || r.attended_at > summary.last_attendance_at)) {
          summary.last_attendance_at = r.attended_at;
        }
      }
      if (r.amount_paid_cents != null) {
        if (r.currency === 'USD') summary.total_paid_cents_usd += r.amount_paid_cents;
        else if (r.currency === 'COP') summary.total_paid_cents_cop += r.amount_paid_cents;
      }
    }
    return { success: true, data: summary };
  } catch (error) {
    logError(error, { action: 'getClientAttendanceSummary', clientId });
    return { success: false, error: 'Failed to load attendance summary' };
  }
}
