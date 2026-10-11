/**
 * T-ANALYTICS1 part D. session_joined and session_left, fired only after the
 * server has confirmed the change, never on tap.
 *
 * Kept out of hooks/useSessionActions.ts, which is already past the 300-line
 * limit, and because is_first_join needs a database read the hook should not
 * have to know about.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { trackEvent } from '@/lib/analytics';
import { fetchParticipantCountForUser } from '@/lib/dal/participants';

export interface JoinedSessionFacts {
  id: string;
  sport: string | null;
  is_paid: boolean | null;
  creator_id: string | null;
}

/**
 * Call after a CONFIRMED join (not a pending request). is_first_join reads the
 * user's confirmed participations: exactly one, counting this join, means
 * first. A failed read reports null rather than a guess.
 */
export async function trackSessionJoined(
  supabase: SupabaseClient,
  session: JoinedSessionFacts,
  userId: string
): Promise<void> {
  const count = await fetchParticipantCountForUser(supabase, userId);
  trackEvent('session_joined', {
    session_id: session.id,
    sport: session.sport,
    is_paid: !!session.is_paid,
    instructor_id: session.creator_id,
    is_first_join: count.success && typeof count.data === 'number' ? count.data === 1 : null,
    session_type: session.is_paid ? 'paid' : 'free',
  });
}

/**
 * Call when joinSession() succeeded with status 'pending'. Until this existed a
 * curated or paid join produced session_join_clicked and then nothing at all,
 * which read in PostHog as a join that silently failed (seen on the preview,
 * 2026-10-10, on a curated session).
 */
export function trackSessionJoinRequested(session: JoinedSessionFacts & { price_cents?: number | null }): void {
  const paid = !!session.is_paid && (session.price_cents ?? 0) > 0;
  trackEvent('session_join_requested', {
    session_id: session.id,
    sport: session.sport,
    is_paid: !!session.is_paid,
    instructor_id: session.creator_id,
    // Same rule joinSession uses to decide 'pending': paid wins over curated.
    reason: paid ? 'paid' : 'curated',
  });
}

/** Call after the leave was confirmed by the server (the delete did not throw). */
export function trackSessionLeft(sessionId: string): void {
  trackEvent('session_left', { session_id: sessionId });
}
