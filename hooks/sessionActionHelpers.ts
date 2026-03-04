import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { SupabaseClient } from '@supabase/supabase-js';
import { fetchConfirmedCount } from '@/lib/dal';
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

  const { data, error } = await supabase
    .from('session_participants')
    .insert({
      session_id: session.id,
      user_id: null,
      is_guest: true,
      guest_name: guestData.name,
      guest_phone: guestData.phone,
      guest_email: guestData.email || null,
      status: 'confirmed',
    })
    .select('id, guest_token')
    .single();

  if (error) throw error;

  await supabase
    .from('sessions')
    .update({ current_participants: (session.current_participants ?? 0) + 1 })
    .eq('id', session.id);

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
  fetch('/api/notifications/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: session.creator_id,
      title: 'New Training Partner!',
      body: `${guestName} (guest) joined your ${session.sport} session`,
      url: `/session/${session.id}`,
      data: { sessionId: session.id, type: 'guest_join' },
    }),
  }).catch((err) => logError(err, { action: 'handleGuestJoin', sessionId: session.id }));
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

  const query = deleteClient.from('session_participants').delete().eq('session_id', sessionId).eq('is_guest', true);
  // Filter by token if available, fall back to phone
  if (storedGuestToken) {
    query.eq('guest_token', storedGuestToken);
  } else if (storedGuestPhone) {
    query.eq('guest_phone', storedGuestPhone);
  }

  const { error } = await query;
  if (error) throw error;

  await supabase
    .from('sessions')
    .update({ current_participants: Math.max(0, (session.current_participants ?? 0) - 1) })
    .eq('id', session.id);

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
    let query = supabase
      .from('session_participants')
      .select('id, guest_token')
      .eq('session_id', sessionId)
      .eq('is_guest', true);
    if (storedGuestPhone) query = query.eq('guest_phone', storedGuestPhone);
    else if (storedGuestEmail) query = query.eq('guest_email', storedGuestEmail);

    const { data, error } = await query.single();
    if (!error && data) {
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
  const { error } = await supabase
    .from('session_participants')
    .delete()
    .eq('session_id', session.id)
    .eq('user_id', userId);
  if (error) throw error;

  await supabase
    .from('sessions')
    .update({ current_participants: (session.current_participants ?? 0) - 1 })
    .eq('id', session.id);

  showSuccess(language === 'es' ? 'Has salido de la sesion' : 'You have left the session');
  onNavigate('/sessions');
}
