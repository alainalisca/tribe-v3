import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchConfirmedCount,
  insertParticipantReturning,
  deleteGuestParticipant,
  fetchGuestParticipant,
  deleteParticipantBySessionAndUser,
} from '@/lib/dal';
import type { Session } from '@/lib/database.types';
import type { GuestData } from './sessionActionTypes';

/** Insert a guest participant and update session count */
export async function insertGuestParticipant(
  supabase: SupabaseClient,
  session: Session,
  guestData: GuestData
): Promise<{ id: string; guest_token: string | null }> {
  const countResult = await fetchConfirmedCount(supabase, session.id);
  if (countResult.success && (countResult.data ?? 0) >= session.max_participants) {
    throw new Error('SESSION_FULL');
  }

  const result = await insertParticipantReturning(supabase, {
    session_id: session.id,
    user_id: null,
    is_guest: true,
    guest_name: guestData.name,
    guest_phone: guestData.phone,
    guest_email: guestData.email || null,
    status: 'confirmed',
  });

  if (!result.success) throw new Error(result.error);
  const data = result.data as unknown as { id: string; guest_token: string | null };

  // No manual count write: the 087 trigger recomputes
  // sessions.current_participants from the confirmed rows on the insert above.
  return data;
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
  const storedGuestPhone = localStorage.getItem(`guest_phone_${sessionId}`);

  if (!storedGuestToken && !storedGuestPhone) {
    showError(language === 'es' ? 'No se encontro la informacion del invitado' : 'Guest information not found');
    return false;
  }

  // Use a client with x-guest-token header for RLS verification
  let deleteClient = supabase;
  if (storedGuestToken) {
    const { createClientWithHeaders } = await import('@/lib/supabase/client');
    deleteClient = createClientWithHeaders({ 'x-guest-token': storedGuestToken });
  }

  const filter = storedGuestToken ? { guest_token: storedGuestToken } : { guest_phone: storedGuestPhone! };
  const deleteResult = await deleteGuestParticipant(deleteClient, sessionId, filter);
  if (!deleteResult.success) throw new Error(deleteResult.error);

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
    const filter = storedGuestPhone ? { guest_phone: storedGuestPhone } : { guest_email: storedGuestEmail! };
    const guestResult = await fetchGuestParticipant(supabase, sessionId, filter);
    const data = guestResult.data as { id: string; guest_token: string | null } | null;
    if (guestResult.success && data) {
      if (data.guest_token) localStorage.setItem(`guest_token_${sessionId}`, data.guest_token);
      return { hasJoined: true, participantId: data.id };
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

/** Remove a registered user from a session */
export async function removeUserFromSession(
  supabase: SupabaseClient,
  session: Session,
  userId: string,
  language: 'en' | 'es',
  onNavigate: (path: string) => void
): Promise<void> {
  const deleteResult = await deleteParticipantBySessionAndUser(supabase, session.id, userId);
  if (!deleteResult.success) throw new Error(deleteResult.error);

  // The 087 trigger recomputes the count from the delete above.
  showSuccess(language === 'es' ? 'Has salido de la sesion' : 'You have left the session');
  onNavigate('/sessions');
}
