// Data Access Layer for sessions
// Migration in progress — new code should use these functions
// Existing inline queries will be migrated incrementally

import { SupabaseClient } from '@supabase/supabase-js';
import type { Session, SessionUpdate, SessionInsert } from '@/lib/database.types';
import { logError } from '@/lib/logger';

import type { DalResult, SessionWithCreator } from './types';
export type { DalResult } from './types';

// --- Query return types (with joined relations) ---

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

// --- Read operations ---

/**
 * Fetches a single session by ID with all columns.
 */
export async function fetchSession(supabase: SupabaseClient, sessionId: string): Promise<DalResult<Session>> {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select(
        'id, creator_id, sport, location, date, start_time, duration, end_time, max_participants, current_participants, description, equipment, skill_level, gender_preference, join_policy, is_paid, price_cents, currency, max_paid_spots, payment_gateway, payment_instructions, photos, latitude, longitude, location_lat, location_lng, title, status, visibility, is_immediate, is_recurring, is_training_now, recurrence_pattern, recurrence_days, recurrence_end_date, recurring_parent_id, platform_fee_percent, photo_verified, verified_at, verified_by, recap_photos, reminder_sent, reminder_1hr_sent, reminder_15min_sent, followup_sent, created_at, updated_at'
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
    session: Session;
    creator: SessionWithRelations['creator'];
    participants: SessionWithRelations['participants'];
  }>
> {
  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .select(
        'id, creator_id, sport, location, date, start_time, duration, end_time, max_participants, current_participants, description, equipment, skill_level, gender_preference, join_policy, is_paid, price_cents, currency, max_paid_spots, payment_gateway, payment_instructions, photos, latitude, longitude, location_lat, location_lng, title, status, visibility, is_immediate, is_recurring, is_training_now, recurrence_pattern, recurrence_days, recurrence_end_date, recurring_parent_id, platform_fee_percent, photo_verified, verified_at, verified_by, recap_photos, reminder_sent, reminder_1hr_sent, reminder_15min_sent, followup_sent, created_at, updated_at'
      )
      .eq('id', sessionId)
      .single();

    if (error) return { success: false, error: error.message };

    const { data: creator } = await supabase
      .from('users')
      .select('id, name, avatar_url, average_rating, total_reviews')
      .eq('id', session.creator_id)
      .single();

    const { data: participants } = await supabase
      .from('session_participants')
      .select(
        'user_id, status, is_guest, guest_name, payment_status, user:users!session_participants_user_id_fkey(id, name, avatar_url)'
      )
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');

    return {
      success: true,
      data: {
        session,
        creator: creator || null,
        participants: (participants || []) as unknown as SessionParticipantWithUser[],
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchSessionWithDetails', sessionId });
    return { success: false, error: 'Failed to fetch session details' };
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

    const { data, error } = await supabase
      .from('sessions')
      .select(
        `
        *,
        participants:session_participants(
          user_id,
          status,
          user:users!session_participants_user_id_fkey(id, name, avatar_url)
        ),
        creator:users!sessions_creator_id_fkey(id, name, avatar_url, average_rating, total_reviews)
      `
      )
      .eq('status', 'active')
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as SessionWithRelations[] };
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
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            user_id: p.user_id,
            title: 'Session Cancelled',
            body: `"${session.title}" was cancelled.${refundNote}`,
            type: 'session_cancelled',
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

/**
 * Updates the participant count for a session.
 */
export async function updateParticipantCount(
  supabase: SupabaseClient,
  sessionId: string,
  count: number
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('sessions')
      .update({ current_participants: Math.max(0, count) })
      .eq('id', sessionId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateParticipantCount', sessionId });
    return { success: false, error: 'Failed to update participant count' };
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
      // Distinct users from session_participants in last 7 days
      supabase
        .from('session_participants')
        .select('user_id', { count: 'exact', head: false })
        .gte('joined_at', sevenDaysAgoISO),

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

    // Count distinct user_ids from participants result
    const distinctUsers = new Set(
      (athletesResult.data || []).map((row: { user_id: string | null }) => row.user_id).filter(Boolean)
    );

    return {
      success: true,
      data: {
        activeAthletes: distinctUsers.size,
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
      .select('*, creator:users!sessions_creator_id_fkey(id, name, email, preferred_language)');
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
  fields: string
): Promise<DalResult<unknown>> {
  try {
    const { data, error } = await supabase.from('sessions').select(fields).eq('id', sessionId).single();
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
  parent: Session,
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
