// Data Access Layer for sessions
// Migration in progress — new code should use these functions
// Existing inline queries will be migrated incrementally

import { SupabaseClient } from '@supabase/supabase-js';
import type { Session, SessionUpdate, SessionInsert } from '@/lib/database.types';
import { logError } from '@/lib/logger';
import { bogotaToday } from '@/lib/time/bogotaDate';

import type { DalResult, SessionWithCreator } from './types';
export type { DalResult } from './types';

// --- Query return types (with joined relations) ---

/**
 * A session as read on the PUBLIC path — every column except
 * payment_instructions.
 *
 * /session/[id] is a public route, so the default reads run for anonymous
 * visitors. payment_instructions is free-text where instructors put personal
 * payment rails, so it is fetched separately and only for the host or a
 * participant (fetchSessionPaymentInstructions). Encoding that in the type
 * rather than only in the select string means a caller that tries to read the
 * field off a default fetch fails to compile, instead of silently getting
 * undefined at runtime.
 */
export type SessionPublic = Omit<Session, 'payment_instructions'>;

export interface SessionParticipantWithUser {
  user_id: string | null;
  status: string | null;
  is_guest?: boolean | null;
  guest_name?: string | null;
  payment_status?: string | null;
  user: { id: string; name: string; avatar_url: string | null } | null;
}

export interface SessionWithRelations extends Session {
  participants: SessionParticipantWithUser[];
  creator: {
    id: string;
    name: string;
    avatar_url: string | null;
    average_rating: number | null;
    total_reviews: number | null;
  } | null;
}

/**
 * The parent-session fields the recurring generator actually needs: the three
 * recurrence inputs plus every column createChildSession copies onto the child.
 *
 * Declared as a Pick rather than the full Session row so the cron's SELECT list
 * and this consumer are bound together by the compiler. Adding a field to
 * createChildSession without adding it here is a type error, instead of an
 * undefined that silently lands on a generated session. It also lets the cron
 * stop using select('*'), which is what turned migration 137's single revoked
 * column into a total failure of the job.
 */
export type RecurringParentSession = Pick<
  Session,
  | 'id'
  | 'date'
  | 'recurrence_pattern'
  | 'recurrence_end_date'
  | 'creator_id'
  | 'currency'
  | 'description'
  | 'duration'
  | 'equipment'
  | 'gender_preference'
  | 'is_paid'
  | 'join_policy'
  | 'latitude'
  | 'location'
  | 'location_lat'
  | 'location_lng'
  | 'longitude'
  | 'max_participants'
  | 'photos'
  | 'platform_fee_percent'
  | 'price_cents'
  | 'skill_level'
  | 'sport'
  | 'start_time'
  | 'title'
  | 'visibility'
>;

/** Column list matching RecurringParentSession, for the cron's SELECT. */
export const RECURRING_PARENT_COLUMNS =
  'id, date, recurrence_pattern, recurrence_end_date, creator_id, currency, description, duration, equipment, gender_preference, is_paid, join_policy, latitude, location, location_lat, location_lng, longitude, max_participants, photos, platform_fee_percent, price_cents, skill_level, sport, start_time, title, visibility';

/**
 * Every column on public.sessions EXCEPT payment_instructions — enumerated from
 * the live catalog (identical to migration 137's grant-back list, the 49 of 50
 * live columns). This is the explicit stand-in for select('*') on
 * authenticated-only reads whose consumers may touch any session field
 * (instructor dashboard, storefront).
 *
 * WHY it exists: select('*') on a table that has ANY column-level grant is a
 * latent 401 — the moment one column is revoked from a role, * expands to
 * include it and the whole read fails for that role (exactly what turned
 * migration 137's single revoked column into a total failure of a select('*')
 * job). RLS-H4 Gate 3 revokes anon from the base table entirely; these callers
 * are authenticated-only so they are not broken by that revoke, but keeping the
 * invariant "zero select('*') on sessions, anywhere" removes the whole class of
 * latent-401 risk for any future column-level change. payment_instructions is
 * omitted deliberately (host-only, read via fetchSessionPaymentInstructions);
 * no consumer of these lists reads it.
 */
export const SESSION_ALL_COLUMNS =
  'community_id, created_at, creator_id, currency, current_participants, date, description, duration, early_access_only_until, end_time, equipment, followup_sent, gender_preference, id, is_immediate, is_paid, is_recurring, is_training_now, join_policy, latitude, location, location_lat, location_lng, longitude, max_paid_spots, max_participants, payment_gateway, photo_verified, photos, platform_fee_percent, price_cents, recap_photos, recurrence_days, recurrence_end_date, recurrence_pattern, recurring_parent_id, reminder_15min_sent, reminder_1hr_sent, reminder_sent, skill_level, sport, start_time, status, title, updated_at, verified_at, verified_by, visibility, waitlist_count';

// --- Read operations ---

/**
 * Fetches a single session by ID with all columns.
 */
export async function fetchSession(supabase: SupabaseClient, sessionId: string): Promise<DalResult<SessionPublic>> {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select(
        // payment_instructions is deliberately ABSENT. /session/[id] is a public
        // route, so this list is executed for anonymous visitors — naming the
        // column here put instructors' personal payment rails (Nequi/Daviplata/
        // account numbers) in the page payload for anyone to harvest. It is read
        // separately, and only for the host or a participant, via
        // fetchSessionPaymentInstructions. Keeping it out of this list is also
        // what makes the anon column REVOKE safe: after the revoke, any select
        // naming the column fails for anon and would break the whole page.
        'id, creator_id, sport, location, date, start_time, duration, end_time, max_participants, current_participants, description, equipment, skill_level, gender_preference, join_policy, is_paid, price_cents, currency, max_paid_spots, payment_gateway, photos, latitude, longitude, location_lat, location_lng, title, status, visibility, is_immediate, is_recurring, is_training_now, recurrence_pattern, recurrence_days, recurrence_end_date, recurring_parent_id, platform_fee_percent, photo_verified, verified_at, verified_by, recap_photos, reminder_sent, reminder_1hr_sent, reminder_15min_sent, followup_sent, created_at, updated_at'
      )
      .eq('id', sessionId)
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchSession', sessionId });
    return { success: false, error: 'Failed to fetch session' };
  }
}

/**
 * Fetches a session with creator info and confirmed participants (with user details).
 * Used by the session detail page.
 */
export async function fetchSessionWithDetails(
  supabase: SupabaseClient,
  sessionId: string
): Promise<
  DalResult<{
    session: SessionPublic;
    creator: SessionWithRelations['creator'];
    participants: SessionWithRelations['participants'];
  }>
> {
  try {
    // maybeSingle distinguishes "no row" (data null, no error) from real
    // fetch errors (RLS, network). With .single(), an RLS denial looked
    // identical to "row missing" — every transient failure rendered as
    // "Session not found" even though the session was fine (BUG-001).
    const { data: session, error } = await supabase
      .from('sessions')
      .select(
        // payment_instructions is deliberately ABSENT. /session/[id] is a public
        // route, so this list is executed for anonymous visitors — naming the
        // column here put instructors' personal payment rails (Nequi/Daviplata/
        // account numbers) in the page payload for anyone to harvest. It is read
        // separately, and only for the host or a participant, via
        // fetchSessionPaymentInstructions. Keeping it out of this list is also
        // what makes the anon column REVOKE safe: after the revoke, any select
        // naming the column fails for anon and would break the whole page.
        'id, creator_id, sport, location, date, start_time, duration, end_time, max_participants, current_participants, description, equipment, skill_level, gender_preference, join_policy, is_paid, price_cents, currency, max_paid_spots, payment_gateway, photos, latitude, longitude, location_lat, location_lng, title, status, visibility, is_immediate, is_recurring, is_training_now, recurrence_pattern, recurrence_days, recurrence_end_date, recurring_parent_id, platform_fee_percent, photo_verified, verified_at, verified_by, recap_photos, reminder_sent, reminder_1hr_sent, reminder_15min_sent, followup_sent, created_at, updated_at'
      )
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      logError(error, { action: 'fetchSessionWithDetails.sessionFetch', sessionId });
      return { success: false, error: error.message };
    }
    if (!session) {
      return { success: false, error: 'session_not_found' };
    }

    // Sub-fetches are best-effort: a missing creator profile or an empty
    // participants list must NOT collapse the whole page into "not found".
    const { data: creator } = await supabase
      .from('users')
      .select('id, name, avatar_url, average_rating, total_reviews')
      .eq('id', session.creator_id)
      .maybeSingle();

    // RLS-H3: identities via the owner-executed roster view (no guest PII, no
    // payment_status). Anon has no grant on the view, so a logged-out viewer gets
    // an empty roster (correct — anon sees counts, not who). payment_status is
    // creator-only and merged separately via session_payment_roster (see
    // useSessionDetail).
    const { data: rosterRows } = await supabase
      .from('session_participants_roster')
      .select('user_id, status, is_guest, guest_name, user_profile_id, user_name, user_avatar_url')
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');

    const participants = (rosterRows || []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        user_id: row.user_id,
        status: row.status,
        is_guest: row.is_guest,
        guest_name: row.guest_name,
        payment_status: null,
        user: row.user_profile_id
          ? { id: row.user_profile_id, name: row.user_name, avatar_url: row.user_avatar_url }
          : null,
      };
    });

    return {
      success: true,
      data: {
        session,
        creator: creator || null,
        participants: participants as unknown as SessionParticipantWithUser[],
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchSessionWithDetails', sessionId });
    return { success: false, error: 'Failed to fetch session details' };
  }
}

/**
 * RLS-H4: the ANONYMOUS read path for /session/[id].
 *
 * Reads sessions_public (the anon-facing view) instead of the base table, so a
 * logged-out visitor's session-detail page survives the Gate 3 anon revoke.
 * Coordinates come back rounded to 3dp and invite_only rows are
 * location-stubbed by the view; the host is flattened (creator_name etc.) and
 * remapped here to the { creator } shape the page already consumes.
 *
 * Authenticated viewers must NOT use this — they call fetchSessionWithDetails
 * against the base table for full precision and every column. useSessionDetail
 * picks the path by auth state.
 *
 * Returns the same { session, creator, participants } shape. participants is
 * always [] here: the roster view is authenticated-only (127), and anon renders
 * counts, not identities, exactly as fetchSessionWithDetails already yields for
 * a logged-out caller.
 */
export async function fetchSessionPublicView(
  supabase: SupabaseClient,
  sessionId: string
): Promise<
  DalResult<{
    session: SessionPublic;
    creator: SessionWithRelations['creator'];
    participants: SessionParticipantWithUser[];
  }>
> {
  try {
    const { data: row, error } = await supabase
      .from('sessions_public')
      .select(
        'id, title, sport, date, start_time, end_time, duration, description, equipment, skill_level, photos, max_participants, current_participants, waitlist_count, join_policy, status, is_paid, price_cents, currency, creator_id, creator_name, creator_avatar_url, creator_average_rating, location, latitude, longitude, location_lat, location_lng'
      )
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      logError(error, { action: 'fetchSessionPublicView.fetch', sessionId });
      return { success: false, error: error.message };
    }
    if (!row) return { success: false, error: 'session_not_found' };

    const v = row as Record<string, unknown>;
    const creator = v.creator_id
      ? {
          id: v.creator_id as string,
          name: (v.creator_name as string) ?? '',
          avatar_url: (v.creator_avatar_url as string | null) ?? null,
          average_rating: (v.creator_average_rating as number | null) ?? null,
          total_reviews: null,
        }
      : null;

    // The view exposes the anon-safe subset of session columns; base-only
    // columns (recurrence, verification, operational flags, exact coords) are
    // absent and are never read on the anon detail path — they render only
    // inside d.user-gated branches. Cast is documented, not a type escape hatch.
    return {
      success: true,
      data: {
        session: v as unknown as SessionPublic,
        creator,
        participants: [],
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchSessionPublicView', sessionId });
    return { success: false, error: 'Failed to fetch session' };
  }
}

/**
 * Reads sessions.payment_instructions for one session, but ONLY for the host or
 * a viewer holding a participant row (pending or confirmed).
 *
 * Why this is separate from fetchSessionWithDetails: the field is voluntary
 * free-text where instructors put personal payment rails (Nequi/Daviplata,
 * account numbers). /session/[id] is a public route, so anything in the default
 * select list is served to anonymous visitors. Splitting it out keeps it off the
 * public payload and lets the anon column REVOKE land without breaking the page.
 *
 * Scope of the guarantee: the REVOKE stops anonymous reads at the database.
 * `authenticated` deliberately retains SELECT on the column, so this check is a
 * correctness/consistency gate for the UI, NOT a security boundary against a
 * logged-in user issuing their own query. That matches the agreed threat model
 * (exclude anonymous scraping and public-page rendering); revisit if real
 * payments are ever processed in-app.
 *
 * Returns data: null for a viewer who is not entitled — deliberately
 * indistinguishable from an instructor who left the field blank, so the response
 * is not an entitlement oracle.
 */
export async function fetchSessionPaymentInstructions(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<DalResult<string | null>> {
  try {
    const { data: sessionRow, error: sessionErr } = await supabase
      .from('sessions')
      .select('creator_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionErr) return { success: false, error: sessionErr.message };
    if (!sessionRow) return { success: false, error: 'session_not_found' };

    let entitled = (sessionRow as { creator_id: string }).creator_id === userId;

    if (!entitled) {
      // Pending counts: with no enforced in-app payment step there is no reason
      // to withhold the instructions from someone who has already requested.
      const { data: participantRow, error: participantErr } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .in('status', ['pending', 'confirmed'])
        .maybeSingle();
      if (participantErr) return { success: false, error: participantErr.message };
      entitled = !!participantRow;
    }

    if (!entitled) return { success: true, data: null };

    const { data, error } = await supabase
      .from('sessions')
      .select('payment_instructions')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data as { payment_instructions: string | null } | null)?.payment_instructions ?? null,
    };
  } catch (error) {
    logError(error, { action: 'fetchSessionPaymentInstructions', sessionId });
    return { success: false, error: 'Failed to fetch payment instructions' };
  }
}

/**
 * Fetches upcoming active sessions with participants and creator info.
 * Used by the home page feed.
 */
export async function fetchUpcomingSessions(supabase: SupabaseClient): Promise<DalResult<SessionWithRelations[]>> {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // RLS-H3: the home feed does not render attendee identities, so drop the
    // participants embed (it reads the raw table, which Gate 3 locks) and rely on
    // sessions.current_participants (087 trigger = confirmed count) for any count.
    const { data, error } = await supabase
      .from('sessions')
      .select(
        `
        *,
        creator:users!sessions_creator_id_fkey(id, name, avatar_url, average_rating, total_reviews)
      `
      )
      .eq('status', 'active')
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []).map((s) => ({ ...s, participants: [] })) as SessionWithRelations[] };
  } catch (error) {
    logError(error, { action: 'fetchUpcomingSessions' });
    return { success: false, error: 'Failed to fetch sessions' };
  }
}

/**
 * Fetches the confirmed participant count for a session.
 * Used for capacity checks.
 */
export async function fetchConfirmedCount(supabase: SupabaseClient, sessionId: string): Promise<DalResult<number>> {
  try {
    const { count, error } = await supabase
      .from('session_participants')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');

    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'fetchConfirmedCount', sessionId });
    return { success: false, error: 'Failed to fetch participant count' };
  }
}

// --- Write operations ---

/**
 * Cancels a session: marks payments for refund, cancels participants, notifies everyone.
 */
export async function cancelSession(
  supabase: SupabaseClient,
  sessionId: string,
  _reason?: string
): Promise<DalResult<null>> {
  try {
    // 1. Fetch session details
    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('id, title, creator_id, is_paid, price_cents, currency, status')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return { success: false, error: 'Session not found' };
    }

    // Prevent cancelling already-cancelled or completed sessions
    if (session.status === 'cancelled') {
      return { success: false, error: 'Session is already cancelled' };
    }
    if (session.status === 'completed') {
      return { success: false, error: 'Cannot cancel a completed session' };
    }

    // 2. Fetch all confirmed participants
    const { data: participants } = await supabase
      .from('session_participants')
      .select('user_id')
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');

    // 3. If paid session, mark approved payments for refund
    if (session.is_paid) {
      const { data: payments } = await supabase
        .from('payments')
        .select(
          'id, participant_user_id, amount_cents, currency, gateway, stripe_payment_intent_id, gateway_payment_id'
        )
        .eq('session_id', sessionId)
        .eq('status', 'approved');

      for (const payment of payments || []) {
        let refundSuccess = false;
        let _refundError: string | undefined;

        try {
          if (payment.gateway === 'stripe' && payment.stripe_payment_intent_id) {
            const { createStripeRefund } = await import('@/lib/payments/stripe');
            const result = await createStripeRefund(payment.stripe_payment_intent_id);
            refundSuccess = result.success;
            _refundError = result.error;
          } else if (payment.gateway === 'wompi' && payment.gateway_payment_id) {
            const { createWompiRefund } = await import('@/lib/payments/wompi');
            const result = await createWompiRefund(payment.gateway_payment_id, payment.amount_cents);
            refundSuccess = result.success;
            _refundError = result.error;
          }
        } catch (refundErr) {
          logError(refundErr, {
            action: 'cancelSession_refund',
            paymentId: payment.id,
            gateway: payment.gateway,
          });
          _refundError = 'Refund API call failed';
        }

        // Update payment record with refund status
        await supabase
          .from('payments')
          .update({
            status: refundSuccess ? 'refunded' : 'refund_failed',
            payout_status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', payment.id);
      }
    }

    // 4. Update all participants to cancelled
    await supabase.from('session_participants').update({ status: 'cancelled' }).eq('session_id', sessionId);

    // 5. Update session status
    const { error: updateErr } = await supabase
      .from('sessions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 6. Notify all participants
    for (const p of participants || []) {
      try {
        const refundNote = session.is_paid ? ' Your payment will be refunded.' : '';
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            userId: p.user_id,
            title: 'Session Cancelled',
            body: `"${session.title}" was cancelled.${refundNote}`,
            data: { session_id: sessionId },
          }),
        });
      } catch (e) {
        logError(e, { action: 'cancelSession_notify', userId: p.user_id, sessionId });
      }
    }

    return { success: true };
  } catch (error) {
    logError(error, { action: 'cancelSession', sessionId });
    return { success: false, error: 'Failed to cancel session' };
  }
}

/**
 * Permanently deletes a session.
 */
export async function deleteSession(supabase: SupabaseClient, sessionId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('sessions').delete().eq('id', sessionId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteSession', sessionId });
    return { success: false, error: 'Failed to delete session' };
  }
}

/** Updates a session with arbitrary fields. */
export async function updateSession(
  supabase: SupabaseClient,
  sessionId: string,
  data: SessionUpdate
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('sessions').update(data).eq('id', sessionId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateSession', sessionId });
    return { success: false, error: 'Failed to update session' };
  }
}

/**
 * The fields a host may change through the session edit form. A Pick keeps
 * status, creator_id, counters, and reminder flags out of this path at the
 * type level — those belong to cancelSession, crons, and admin flows.
 */
export type HostEditableSessionUpdate = Pick<
  SessionUpdate,
  | 'sport'
  | 'location'
  | 'latitude'
  | 'longitude'
  | 'location_lat'
  | 'location_lng'
  | 'date'
  | 'start_time'
  | 'duration'
  | 'max_participants'
  | 'description'
  | 'skill_level'
  | 'gender_preference'
  | 'equipment'
  | 'join_policy'
  | 'photos'
  | 'is_recurring'
  | 'recurrence_pattern'
  | 'recurrence_end_date'
  | 'is_paid'
  | 'price_cents'
  | 'currency'
  | 'payment_instructions'
>;

/**
 * Updates a session on behalf of its host, with the guards updateSession
 * deliberately lacks (updateSession stays a bare passthrough for cron and
 * admin callers). Enforces: signed-in owner, past sessions read only (recurring
 * parents exempt — their past date is by design while they generate future
 * occurrences), and the same paid-session rules as insertSession so the edit
 * path cannot be used to bypass create-time validation.
 */
export async function updateSessionAsHost(
  supabase: SupabaseClient,
  sessionId: string,
  data: HostEditableSessionUpdate
): Promise<DalResult<null>> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You must be signed in to edit a session' };

    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('creator_id, date, start_time, is_recurring')
      .eq('id', sessionId)
      .single();
    if (fetchError || !session) return { success: false, error: fetchError?.message || 'Session not found' };

    if (session.creator_id !== user.id) {
      return { success: false, error: 'Only the session host can edit this session' };
    }

    const startsAt = new Date(`${session.date}T${session.start_time}`);
    if (!session.is_recurring && startsAt.getTime() < Date.now()) {
      return { success: false, error: 'Past sessions cannot be edited' };
    }

    const update: HostEditableSessionUpdate = { ...data };
    if (update.is_paid === true) {
      const { data: profile } = await supabase.from('users').select('is_instructor').eq('id', user.id).single();
      if (!profile?.is_instructor) {
        return { success: false, error: 'Only instructors can set a price on sessions' };
      }
      if (typeof update.price_cents !== 'number' || update.price_cents <= 0) {
        return { success: false, error: 'Paid sessions must have a price greater than zero' };
      }
      if (update.price_cents > 100000000) {
        return { success: false, error: 'Price exceeds maximum allowed amount' };
      }
      const validCurrencies = ['USD', 'COP'];
      if (!update.currency || !validCurrencies.includes(update.currency)) {
        return { success: false, error: 'Invalid currency. Must be USD or COP' };
      }
    } else if (update.is_paid === false) {
      // sessions_price_check allows a stale price to survive is_paid=false,
      // and the feed card displays any non-null price — free means null.
      update.price_cents = null;
    }

    const { error } = await supabase.from('sessions').update(update).eq('id', sessionId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateSessionAsHost', sessionId });
    return { success: false, error: 'Failed to update session' };
  }
}

/**
 * Ends a recurring series by setting recurrence_end_date on the parent.
 *
 * The recurring-sessions cron's computeRecurrenceDates clamps generation to
 * recurrence_end_date and only emits dates strictly after today, so setting it
 * to today (Bogotá) stops all FUTURE occurrences while leaving the already
 * generated children untouched. Single-purpose by design: it does NOT cancel
 * existing future children — that is a caller decision (T-RECUR1 Gate 7).
 *
 * Authorization mirrors updateSessionAsHost: signed-in owner only, and the row
 * must be a TRUE recurring parent (is_recurring = true AND recurring_parent_id
 * IS NULL) so a child occurrence or a one-off can never be mistaken for a
 * series. The sessions UPDATE RLS policy (auth.uid() = creator_id) is the
 * backstop, not the gate.
 *
 * @param endDate - Bogotá calendar date 'YYYY-MM-DD' to end on. Defaults to
 *   today in Bogotá, which stops all future occurrences immediately.
 */
export async function endRecurringSeries(
  supabase: SupabaseClient,
  parentId: string,
  endDate: string = bogotaToday()
): Promise<DalResult<null>> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You must be signed in to end a series' };

    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('creator_id, is_recurring, recurring_parent_id')
      .eq('id', parentId)
      .single();
    if (fetchError || !session) return { success: false, error: fetchError?.message || 'Session not found' };

    if (session.creator_id !== user.id) {
      return { success: false, error: 'Only the session host can end this series' };
    }

    // Must be a true parent: a child occurrence (recurring_parent_id set) or a
    // non-recurring one-off has no series to end.
    if (!session.is_recurring || session.recurring_parent_id !== null) {
      return { success: false, error: 'This session is not a recurring series' };
    }

    const patch: SessionUpdate = { recurrence_end_date: endDate };
    const { error } = await supabase.from('sessions').update(patch).eq('id', parentId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'endRecurringSeries', sessionId: parentId });
    return { success: false, error: 'Failed to end recurring series' };
  }
}

/** Deletes all sessions created by a specific user. Used by admin delete-user flow. */
export async function deleteSessionsByCreator(supabase: SupabaseClient, creatorId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('sessions').delete().eq('creator_id', creatorId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteSessionsByCreator' });
    return { success: false, error: 'Failed to delete sessions' };
  }
}

/** Fetches session creator IDs (for admin stats). */
export async function fetchSessionCreatorIds(supabase: SupabaseClient): Promise<DalResult<string[]>> {
  try {
    const { data, error } = await supabase.from('sessions').select('creator_id');
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []).map((d) => d.creator_id).filter(Boolean) as string[] };
  } catch (error) {
    logError(error, { action: 'fetchSessionCreatorIds' });
    return { success: false, error: 'Failed to fetch creator IDs' };
  }
}

/** Insert a new session, returning the created row. Validates instructor status for paid sessions. */
export async function insertSession(supabase: SupabaseClient, data: SessionInsert): Promise<DalResult<Session>> {
  try {
    // Server-side validation: only instructors can create paid sessions
    if ((data as Record<string, unknown>).is_paid) {
      const { data: creator } = await supabase
        .from('users')
        .select('is_instructor')
        .eq('id', (data as Record<string, unknown>).creator_id)
        .single();

      if (!creator?.is_instructor) {
        return { success: false, error: 'Only instructors can create paid sessions' };
      }

      const priceCents = (data as Record<string, unknown>).price_cents;
      const currency = (data as Record<string, unknown>).currency;

      if (typeof priceCents !== 'number' || priceCents <= 0) {
        return { success: false, error: 'Paid sessions must have a price greater than zero' };
      }
      if (priceCents > 100000000) {
        return { success: false, error: 'Price exceeds maximum allowed amount' };
      }

      const validCurrencies = ['USD', 'COP'];
      if (!currency || !validCurrencies.includes(currency as string)) {
        return { success: false, error: 'Invalid currency. Must be USD or COP' };
      }
    }

    const { data: session, error } = await supabase.from('sessions').insert(data).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: session };
  } catch (error) {
    logError(error, { action: 'insertSession' });
    return { success: false, error: 'Failed to create session' };
  }
}

/**
 * Fetches real-time activity stats for the LiveActivityPulse component.
 * - activeAthletes: distinct users who joined sessions in the last 7 days
 * - sessionsThisWeek: sessions with date >= Monday of the current week and status active
 * - totalSessions: total count of all sessions
 */
export async function fetchActivityStats(
  supabase: SupabaseClient
): Promise<DalResult<{ activeAthletes: number; sessionsThisWeek: number; totalSessions: number }>> {
  try {
    const now = new Date();

    // 7 days ago for active athletes
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    // Monday of current week
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

    // Run all three queries in parallel
    const [athletesResult, weekResult, totalResult] = await Promise.all([
      // RLS-H3: distinct active users in last 7 days via the anon-safe definer
      // count RPC (the landing page is public; anon cannot read the raw table).
      supabase.rpc('count_active_athletes', { p_since: sevenDaysAgoISO }),

      // Active sessions this week
      supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('date', mondayStr),

      // Total sessions
      supabase.from('sessions').select('id', { count: 'exact', head: true }),
    ]);

    if (athletesResult.error) return { success: false, error: athletesResult.error.message };
    if (weekResult.error) return { success: false, error: weekResult.error.message };
    if (totalResult.error) return { success: false, error: totalResult.error.message };

    // The RPC returns the distinct-user count directly.
    const activeAthletes = (athletesResult.data as number | null) ?? 0;

    return {
      success: true,
      data: {
        activeAthletes,
        sessionsThisWeek: weekResult.count ?? 0,
        totalSessions: totalResult.count ?? 0,
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchActivityStats' });
    return { success: false, error: 'Failed to fetch activity stats' };
  }
}

/** Count sessions created by a user. */
export async function fetchSessionsByCreatorCount(
  supabase: SupabaseClient,
  creatorId: string
): Promise<DalResult<number>> {
  try {
    // BUG-008 guard: if creatorId is falsy/literal "undefined" (race during
    // auth bootstrap, bad URL), refuse to issue the query — supabase-js with
    // an undefined eq value can serialize to no filter, counting the whole
    // sessions table (the "70 Created" symptom on a brand-new account).
    if (!creatorId || creatorId === 'undefined' || creatorId === 'null') {
      return { success: true, data: 0 };
    }
    const { count, error } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'fetchSessionsByCreatorCount' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch active sessions for given dates. */
export async function fetchActiveSessionsForDates(
  supabase: SupabaseClient,
  dates: string[]
): Promise<DalResult<Session[]>> {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select(
        'id, creator_id, sport, location, date, start_time, duration, status, reminder_1hr_sent, reminder_15min_sent, is_training_now'
      )
      .eq('status', 'active')
      .in('date', dates);
    if (error) return { success: false, error: error.message };
    // Cast: select returns subset of Session columns used by cron reminders
    return { success: true, data: (data || []) as unknown as Session[] };
  } catch (error) {
    logError(error, { action: 'fetchActiveSessionsForDates' });
    return { success: false, error: 'Failed' };
  }
}

/** Count active sessions from a date forward. */
export async function fetchActiveSessionCount(supabase: SupabaseClient, fromDate: string): Promise<DalResult<number>> {
  try {
    const { count, error } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('date', fromDate);
    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'fetchActiveSessionCount' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch sessions by creator with optional date filters. */
export async function fetchSessionsByCreator(
  supabase: SupabaseClient,
  creatorId: string,
  opts?: { dateGte?: string; dateLte?: string; fields?: string }
): Promise<DalResult<unknown[]>> {
  try {
    let query = supabase
      .from('sessions')
      .select(opts?.fields || '*')
      .eq('creator_id', creatorId);
    if (opts?.dateGte) query = query.gte('date', opts.dateGte);
    if (opts?.dateLte) query = query.lte('date', opts.dateLte);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchSessionsByCreator' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch sessions with creator join (for cron/reminders). */
export async function fetchSessionsWithCreator(
  supabase: SupabaseClient,
  filters: { status?: string; reminder_sent?: boolean; dateGte?: string; dateLte?: string; followup_sent?: boolean }
): Promise<DalResult<SessionWithCreator[]>> {
  try {
    let query = supabase
      .from('sessions')
      // creator email intentionally not selected: no caller uses it, and the
      // embed broke the anon cron callers under the T-SEC5 email revoke (Batch 4).
      .select('*, creator:users!sessions_creator_id_fkey(id, name, preferred_language)');
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.reminder_sent !== undefined) query = query.eq('reminder_sent', filters.reminder_sent);
    if (filters.followup_sent !== undefined) query = query.eq('followup_sent', filters.followup_sent);
    if (filters.dateGte) query = query.gte('date', filters.dateGte);
    if (filters.dateLte) query = query.lte('date', filters.dateLte);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as SessionWithCreator[] };
  } catch (error) {
    logError(error, { action: 'fetchSessionsWithCreator' });
    return { success: false, error: 'Failed' };
  }
}

/**
 * Fetches upcoming active sessions created by a specific user.
 * Used by ConnectionButton to show a funnel toward shared training.
 */
export async function fetchUpcomingSessionsByUser(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 3
): Promise<DalResult<Array<{ id: string; sport: string; date: string; start_time: string; location: string }>>> {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('sessions')
      .select('id, sport, date, start_time, location')
      .eq('creator_id', userId)
      .eq('status', 'active')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(limit);

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchUpcomingSessionsByUser', userId });
    return { success: false, error: 'Failed to fetch upcoming sessions' };
  }
}

/** Fetch a session with specific fields. */
export async function fetchSessionFields(
  supabase: SupabaseClient,
  sessionId: string,
  fields: string,
  // RLS-H4: anon-reachable callers pass 'sessions_public' so their read survives
  // the Gate 3 anon revoke. Authed/service-role callers keep the default base table.
  table: 'sessions' | 'sessions_public' = 'sessions'
): Promise<DalResult<unknown>> {
  try {
    const { data, error } = await supabase.from(table).select(fields).eq('id', sessionId).single();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchSessionFields' });
    return { success: false, error: 'Failed' };
  }
}

/**
 * Check if a child session already exists for a given recurring parent and date.
 * Used by the recurring-sessions cron to ensure idempotency.
 */
export async function childSessionExists(
  supabase: SupabaseClient,
  parentId: string,
  date: string
): Promise<DalResult<boolean>> {
  try {
    const { count, error } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('recurring_parent_id', parentId)
      .eq('date', date);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (count ?? 0) > 0 };
  } catch (error) {
    logError(error, { action: 'childSessionExists', parentId, date });
    return { success: false, error: 'Failed to check child session' };
  }
}

/**
 * Create a child session instance from a recurring parent session.
 * Copies relevant fields and sets the new date. Returns the new session ID.
 */
export async function createChildSession(
  supabase: SupabaseClient,
  parent: RecurringParentSession,
  targetDate: string
): Promise<DalResult<string>> {
  try {
    const childData: SessionInsert = {
      creator_id: parent.creator_id,
      sport: parent.sport,
      location: parent.location,
      date: targetDate,
      start_time: parent.start_time,
      duration: parent.duration,
      max_participants: parent.max_participants,
      description: parent.description,
      equipment: parent.equipment,
      skill_level: parent.skill_level,
      gender_preference: parent.gender_preference,
      join_policy: parent.join_policy,
      is_paid: parent.is_paid,
      price_cents: parent.price_cents,
      currency: parent.currency,
      photos: parent.photos,
      // `location_lat`/`location_lng` is the canonical pair; the legacy
      // `latitude`/`longitude` columns are kept in sync via the BEFORE
      // INSERT/UPDATE trigger added in migration 054. Read both off the
      // parent in case the parent was written before the trigger
      // existed.
      location_lat: parent.location_lat ?? parent.latitude ?? null,
      location_lng: parent.location_lng ?? parent.longitude ?? null,
      title: parent.title,
      visibility: parent.visibility,
      platform_fee_percent: parent.platform_fee_percent,
      recurring_parent_id: parent.id,
      is_recurring: false,
      current_participants: 0,
      status: 'active',
    };

    const { data: session, error } = await supabase.from('sessions').insert(childData).select('id').single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: session.id };
  } catch (error) {
    logError(error, { action: 'createChildSession', parentId: parent.id, targetDate });
    return { success: false, error: 'Failed to create child session' };
  }
}

/**
 * Confirms a participant's payment for a paid session.
 * Only the session creator should call this (RLS enforces at DB level).
 */
export async function confirmParticipantPayment(
  supabase: SupabaseClient,
  sessionId: string,
  participantUserId: string,
  confirmedByUserId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('session_participants')
      .update({
        payment_status: 'confirmed',
        paid_at: new Date().toISOString(),
        payment_confirmed_by: confirmedByUserId,
      })
      .eq('session_id', sessionId)
      .eq('user_id', participantUserId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'confirmParticipantPayment', sessionId, participantUserId });
    return { success: false, error: 'Failed to confirm payment' };
  }
}
