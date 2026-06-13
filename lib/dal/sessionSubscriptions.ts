// Data Access Layer for SESSION-SERIES subscriptions.
//
// NOTE: distinct from lib/dal/subscriptions.ts, which handles Tribe+ paid
// membership (subscription_payments, user tiers). This file handles an
// athlete subscribing to a recurring SESSION series so they're auto-enrolled
// in each future occurrence. Backed by the session_subscriptions table
// (migration 095). The row attaches to the recurring PARENT session; the
// recurring-sessions cron fans it out to child sessions.

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface SessionSubscriptionRow {
  id: string;
  user_id: string;
  session_id: string;
  instructor_id: string;
  recurrence_pattern: string | null;
  status: 'active' | 'cancelled';
  created_at: string;
  updated_at: string;
}

/** Shape for the /subscriptions page: subscription joined to its session + creator. */
export interface SubscriptionWithSession {
  session_id: string;
  recurrence_pattern: string | null;
  session: {
    id: string;
    sport: string;
    date: string;
    start_time: string;
    duration: number;
    location: string;
    price_cents: number | null;
    currency: string | null;
    creator: {
      name: string;
      avatar_url: string | null;
    };
  };
}

/**
 * Subscribe a user to a recurring session series. Idempotent: re-subscribing
 * flips an existing (possibly cancelled) row back to 'active' via upsert on the
 * (user_id, session_id) unique constraint.
 */
export async function subscribeToSession(
  supabase: SupabaseClient,
  params: { userId: string; sessionId: string; instructorId: string; recurrencePattern: string | null }
): Promise<DalResult<SessionSubscriptionRow>> {
  try {
    const { data, error } = await supabase
      .from('session_subscriptions')
      .upsert(
        {
          user_id: params.userId,
          session_id: params.sessionId,
          instructor_id: params.instructorId,
          recurrence_pattern: params.recurrencePattern,
          status: 'active',
        },
        { onConflict: 'user_id,session_id' }
      )
      .select('*')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as SessionSubscriptionRow };
  } catch (error) {
    logError(error, { action: 'subscribeToSession', userId: params.userId, sessionId: params.sessionId });
    return { success: false, error: 'Failed to subscribe' };
  }
}

/**
 * Cancel a user's subscription to a session series. Soft-cancels (status flip)
 * so re-subscribing and any analytics keep a stable row.
 */
export async function unsubscribeFromSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<DalResult<true>> {
  try {
    const { error } = await supabase
      .from('session_subscriptions')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .eq('session_id', sessionId);

    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  } catch (error) {
    logError(error, { action: 'unsubscribeFromSession', userId, sessionId });
    return { success: false, error: 'Failed to unsubscribe' };
  }
}

/** Whether the user already has an active subscription to this session series. */
export async function fetchUserSubscriptionStatus(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<DalResult<boolean>> {
  try {
    const { count, error } = await supabase
      .from('session_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .eq('status', 'active');

    if (error) return { success: false, error: error.message };
    return { success: true, data: (count ?? 0) > 0 };
  } catch (error) {
    logError(error, { action: 'fetchUserSubscriptionStatus', userId, sessionId });
    return { success: false, error: 'Failed to check subscription status' };
  }
}

/** All of a user's active subscriptions, joined to session + creator, for /subscriptions. */
export async function fetchUserSubscriptions(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<SubscriptionWithSession[]>> {
  try {
    const { data, error } = await supabase
      .from('session_subscriptions')
      .select(
        `
        session_id,
        recurrence_pattern,
        sessions (
          id, sport, date, start_time, duration, location, price_cents, currency, creator_id,
          users!creator_id ( id, name, avatar_url )
        )
      `
      )
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) return { success: false, error: error.message };

    // REASON: nested join shape from PostgREST is awkward to type; map defensively.
    const rows = (data || []) as unknown as Array<{
      session_id: string;
      recurrence_pattern: string | null;
      sessions: Record<string, unknown> | null;
    }>;

    const mapped: SubscriptionWithSession[] = rows
      .filter((r) => r.sessions)
      .map((r) => {
        const s = r.sessions as Record<string, unknown>;
        const creatorJoin = s.users as Array<Record<string, unknown>> | Record<string, unknown> | null;
        const creator = Array.isArray(creatorJoin) ? creatorJoin[0] : creatorJoin;
        return {
          session_id: r.session_id,
          recurrence_pattern: r.recurrence_pattern,
          session: {
            id: s.id as string,
            sport: s.sport as string,
            date: s.date as string,
            start_time: s.start_time as string,
            duration: s.duration as number,
            location: s.location as string,
            price_cents: (s.price_cents as number | null) ?? null,
            currency: (s.currency as string | null) ?? null,
            creator: {
              name: (creator?.name as string) || 'Unknown',
              avatar_url: (creator?.avatar_url as string | null) ?? null,
            },
          },
        };
      });

    return { success: true, data: mapped };
  } catch (error) {
    logError(error, { action: 'fetchUserSubscriptions', userId });
    return { success: false, error: 'Failed to fetch subscriptions' };
  }
}

/**
 * Auto-enroll every active subscriber of a recurring parent series into a newly
 * created child session. Called by the recurring-sessions cron AFTER the child
 * row is inserted.
 *
 * MUST be called with a service-role client: it inserts session_participants
 * rows on behalf of OTHER users, which the user-scoped RLS policy
 * (auth.uid() = user_id) would otherwise reject. The upsert with
 * ignoreDuplicates keeps it idempotent if the cron re-runs. Returns the number
 * of subscriber rows enrolled.
 */
export async function enrollSubscribersInChildSession(
  serviceClient: SupabaseClient,
  parentSessionId: string,
  childSessionId: string
): Promise<DalResult<number>> {
  try {
    const { data: subs, error: subErr } = await serviceClient
      .from('session_subscriptions')
      .select('user_id')
      .eq('session_id', parentSessionId)
      .eq('status', 'active');

    if (subErr) return { success: false, error: subErr.message };
    if (!subs || subs.length === 0) return { success: true, data: 0 };

    const rows = subs.map((s: { user_id: string }) => ({
      session_id: childSessionId,
      user_id: s.user_id,
      status: 'confirmed',
    }));

    const { error: insErr } = await serviceClient
      .from('session_participants')
      .upsert(rows, { onConflict: 'session_id,user_id', ignoreDuplicates: true });

    if (insErr) return { success: false, error: insErr.message };
    return { success: true, data: rows.length };
  } catch (error) {
    logError(error, { action: 'enrollSubscribersInChildSession', parentSessionId, childSessionId });
    return { success: false, error: 'Failed to enroll subscribers' };
  }
}
