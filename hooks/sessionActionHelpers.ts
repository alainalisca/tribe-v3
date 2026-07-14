import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { SupabaseClient } from '@supabase/supabase-js';
import { deleteParticipantBySessionAndUser } from '@/lib/dal';
import type { Session } from '@/lib/database.types';
import type { GuestData } from './sessionActionTypes';

/** Add a guest participant via the SECURITY DEFINER guest RPC. */
export async function insertGuestParticipant(
  supabase: SupabaseClient,
  session: Session,
  guestData: GuestData
): Promise<{ id: string; guest_token: string | null }> {
  // T-SEC1 Gate 2.5b: join via join_session_as_guest, not a direct insert
  // (Gate 3 removes the direct-insert RLS). This is the in-app guest modal, which
  // has no invite token — the RPC allows a token-less guest ONLY when the session
  // is open (curated/invite_only fail closed server-side). The RPC also derives
  // status, enforces capacity atomically, and returns guest_token (needed by the
  // guest-leave flow). Running as owner, it sidesteps the challenge_participants
  // recursion that 500s the current direct guest insert.
  const { data: rpcResult, error } = await supabase.rpc('join_session_as_guest', {
    p_session_id: session.id,
    p_invite_token: null,
    p_guest_name: guestData.name,
    p_guest_phone: guestData.phone,
    p_guest_email: guestData.email || null,
  });
  if (error) throw new Error(error.message);

  const body = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
  if (!body?.success) {
    // Preserve the caller's full-session UX (it maps SESSION_FULL to a toast).
    if (body?.error === 'Session is full') throw new Error('SESSION_FULL');
    throw new Error(body?.error || 'join_failed');
  }

  return { id: body.participant_id as string, guest_token: (body.guest_token as string) ?? null };
}

/** Store guest identifiers in localStorage after a successful join */
export function storeGuestLocally(sessionId: string, guestData: GuestData, guestToken: string | null): void {
  localStorage.setItem(`guest_phone_${sessionId}`, guestData.phone);
  if (guestData.email) localStorage.setItem(`guest_email_${sessionId}`, guestData.email);
  if (guestToken) localStorage.setItem(`guest_token_${sessionId}`, guestToken);
}

/** Fire-and-forget notification to session host about a guest join */
export function notifyHostOfGuestJoin(session: Session, guestName: string): void {
  // Via the narrow notify-join route (recipient + copy derived
  // server-side); /api/notifications/send is internal-only now.
  fetch('/api/sessions/notify-join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: session.id,
      joiner_name: guestName,
      kind: 'guest',
    }),
  }).catch((err) => logError(err, { action: 'handleGuestJoin', sessionId: session.id }));
}

/**
 * T-NOTIF1: fire-and-forget notify the host that a registered athlete left,
 * mirroring notifyHostOfGuestJoin. Call only after a confirmed delete so the
 * host is never told about a leave that did not persist.
 */
export function notifyHostOfLeave(session: Session, leaverName: string): void {
  fetch('/api/sessions/notify-join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: session.id,
      joiner_name: leaverName,
      kind: 'leave',
    }),
  }).catch((err) => logError(err, { action: 'notifyHostOfLeave', sessionId: session.id }));
}

/** Fire-and-forget confirmation email to a guest who provided an email address */
export function sendGuestConfirmationEmail(
  session: Session & { creator?: { name?: string } },
  guestData: GuestData,
  language: 'en' | 'es'
): void {
  if (!guestData.email) {
    // TODO: SMS confirmation via Twilio is a future enhancement for phone-only guests
    return;
  }
  fetch('/api/send-guest-confirmation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: guestData.email,
      guestName: guestData.name,
      sessionId: session.id,
      sessionSport: session.sport,
      sessionDate: session.date,
      sessionTime: session.start_time,
      sessionLocation: session.location,
      hostName: session.creator?.name || 'Tribe',
      language,
    }),
  }).catch((err) => logError(err, { action: 'sendGuestConfirmationEmail', sessionId: session.id }));
}

/** Remove a guest participant using their stored token or phone */
export async function removeGuestParticipant(
  supabase: SupabaseClient,
  session: Session,
  sessionId: string,
  language: 'en' | 'es'
): Promise<boolean> {
  const storedGuestToken = localStorage.getItem(`guest_token_${sessionId}`);

  // RLS-H3 Gate 2: the unjoin credential (guest_token) is verified SERVER-SIDE
  // inside the guest_leave_session definer RPC — the client never reads it from a
  // table, and no read path ever returns it. The token is required: it is the
  // guest's proof of ownership (phone alone is enumerable, so it is not accepted).
  if (!storedGuestToken) {
    showError(language === 'es' ? 'No se encontro la informacion del invitado' : 'Guest information not found');
    return false;
  }

  const { data: removed, error } = await supabase.rpc('guest_leave_session', {
    p_session_id: sessionId,
    p_guest_token: storedGuestToken,
  });
  if (error) throw new Error(error.message);
  if (!removed) throw new Error('not_removed');

  // The 087 trigger recomputes the count from the delete above.
  localStorage.removeItem(`guest_phone_${sessionId}`);
  localStorage.removeItem(`guest_email_${sessionId}`);
  localStorage.removeItem(`guest_token_${sessionId}`);

  return true;
}

/** Check if the current browser user previously joined as a guest */
export async function checkGuestStatus(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ hasJoined: boolean; participantId: string | null }> {
  const storedGuestPhone = localStorage.getItem(`guest_phone_${sessionId}`);
  const storedGuestEmail = localStorage.getItem(`guest_email_${sessionId}`);
  if (!storedGuestPhone && !storedGuestEmail) {
    return { hasJoined: false, participantId: null };
  }

  try {
    // RLS-H3 Gate 2: server-side status check that returns ONLY { has_joined,
    // participant_id } — never guest_token or any PII. The token was already
    // stored at join (storeGuestLocally), so there is nothing to re-fetch here.
    const { data, error } = await supabase.rpc('guest_participation_status', {
      p_session_id: sessionId,
      p_guest_phone: storedGuestPhone,
      p_guest_email: storedGuestEmail,
    });
    if (error) throw new Error(error.message);
    const status = (typeof data === 'string' ? JSON.parse(data) : data) as {
      has_joined: boolean;
      participant_id: string | null;
    } | null;
    if (status?.has_joined && status.participant_id) {
      return { hasJoined: true, participantId: status.participant_id };
    } else {
      localStorage.removeItem(`guest_phone_${sessionId}`);
      localStorage.removeItem(`guest_email_${sessionId}`);
      localStorage.removeItem(`guest_token_${sessionId}`);
      return { hasJoined: false, participantId: null };
    }
  } catch (error) {
    logError(error, { action: 'checkGuestParticipation', sessionId });
    return { hasJoined: false, participantId: null };
  }
}

/**
 * Remove a registered user from a session.
 * Returns true on success; throws on DB error.
 * Callers are responsible for showing a toast and navigating — keeping this
 * function pure so the caller can update local state before navigating (BUG-207).
 */
export async function removeUserFromSession(supabase: SupabaseClient, session: Session, userId: string): Promise<true> {
  const deleteResult = await deleteParticipantBySessionAndUser(supabase, session.id, userId);
  if (!deleteResult.success) throw new Error(deleteResult.error);
  // The 087 trigger recomputes sessions.current_participants from this delete.
  return true;
}
