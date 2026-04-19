/** DAL: session_waitlist — preserves demand for full sessions. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type WaitlistStatus = 'waiting' | 'offered' | 'accepted' | 'expired' | 'cancelled';

export interface WaitlistEntry {
  id: string;
  session_id: string;
  user_id: string;
  position: number;
  status: WaitlistStatus;
  offered_at: string | null;
  offer_expires_at: string | null;
  created_at: string;
}

export interface WaitlistEntryWithUser {
  id: string;
  position: number;
  status: WaitlistStatus;
  created_at: string;
  user: { id: string; name: string; avatar_url: string | null } | null;
}

const OFFER_TTL_HOURS = 24;

/** Add a user to the waitlist. Position = current max + 1 (per session). */
export async function joinWaitlist(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<DalResult<{ position: number }>> {
  try {
    const { data: existing } = await supabase
      .from('session_waitlist')
      .select('id, position, status')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const row = existing as { id: string; position: number; status: WaitlistStatus };
      if (row.status === 'waiting' || row.status === 'offered') {
        return { success: true, data: { position: row.position } };
      }
      // Reactivate a previously cancelled/expired row with a fresh position.
      const { data: maxRow } = await supabase
        .from('session_waitlist')
        .select('position')
        .eq('session_id', sessionId)
        .eq('status', 'waiting')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      const newPos = ((maxRow as { position: number } | null)?.position ?? 0) + 1;
      const { error: updErr } = await supabase
        .from('session_waitlist')
        .update({ status: 'waiting', position: newPos, offered_at: null, offer_expires_at: null })
        .eq('id', row.id);
      if (updErr) return { success: false, error: updErr.message };
      return { success: true, data: { position: newPos } };
    }

    const { data: maxRow } = await supabase
      .from('session_waitlist')
      .select('position')
      .eq('session_id', sessionId)
      .eq('status', 'waiting')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const newPos = ((maxRow as { position: number } | null)?.position ?? 0) + 1;

    const { error } = await supabase.from('session_waitlist').insert({
      session_id: sessionId,
      user_id: userId,
      position: newPos,
      status: 'waiting',
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: { position: newPos } };
  } catch (error) {
    logError(error, { action: 'joinWaitlist', sessionId, userId });
    return { success: false, error: 'Failed to join waitlist' };
  }
}

/** Remove a user's waitlist entry entirely (user-initiated leave). */
export async function leaveWaitlist(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<DalResult<void>> {
  try {
    const { error } = await supabase
      .from('session_waitlist')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'leaveWaitlist', sessionId, userId });
    return { success: false, error: 'Failed to leave waitlist' };
  }
}

/** Current position + status for a user on a session's waitlist (or null). */
export async function getWaitlistPosition(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<DalResult<{ position: number; status: WaitlistStatus } | null>> {
  try {
    const { data, error } = await supabase
      .from('session_waitlist')
      .select('position, status')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: true, data: null };
    return {
      success: true,
      data: {
        position: (data as { position: number }).position,
        status: (data as { status: WaitlistStatus }).status,
      },
    };
  } catch (error) {
    logError(error, { action: 'getWaitlistPosition', sessionId, userId });
    return { success: false, error: 'Failed to fetch waitlist position' };
  }
}

/** All waitlist entries for a session (instructor view). */
export async function fetchSessionWaitlist(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<WaitlistEntryWithUser[]>> {
  try {
    const { data, error } = await supabase
      .from('session_waitlist')
      .select(
        `
        id, position, status, created_at,
        user:user_id(id, name, avatar_url)
      `
      )
      .eq('session_id', sessionId)
      .order('position', { ascending: true });
    if (error) return { success: false, error: error.message };

    const entries: WaitlistEntryWithUser[] = (data || []).map((row: Record<string, unknown>) => {
      const u = row.user as { id: string; name: string; avatar_url: string | null } | null;
      return {
        id: row.id as string,
        position: row.position as number,
        status: row.status as WaitlistStatus,
        created_at: row.created_at as string,
        user: u,
      };
    });
    return { success: true, data: entries };
  } catch (error) {
    logError(error, { action: 'fetchSessionWaitlist', sessionId });
    return { success: false, error: 'Failed to fetch waitlist' };
  }
}

/**
 * Offer the next-in-line a spot. Marks their row status='offered' and
 * sets a 24-hour expiry. Returns the offered user's id and position.
 */
export async function offerSpotToNextInLine(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<{ offered_to: string; position: number } | null>> {
  try {
    const { data, error } = await supabase
      .from('session_waitlist')
      .select('id, user_id, position')
      .eq('session_id', sessionId)
      .eq('status', 'waiting')
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: true, data: null };

    const row = data as { id: string; user_id: string; position: number };
    const now = new Date();
    const expires = new Date(now.getTime() + OFFER_TTL_HOURS * 3600 * 1000);

    const { error: updErr } = await supabase
      .from('session_waitlist')
      .update({
        status: 'offered',
        offered_at: now.toISOString(),
        offer_expires_at: expires.toISOString(),
      })
      .eq('id', row.id);
    if (updErr) return { success: false, error: updErr.message };

    return { success: true, data: { offered_to: row.user_id, position: row.position } };
  } catch (error) {
    logError(error, { action: 'offerSpotToNextInLine', sessionId });
    return { success: false, error: 'Failed to offer waitlist spot' };
  }
}

/**
 * Accept an outstanding offer. Adds the user to session_participants and
 * marks the waitlist row 'accepted'. Caller must validate offer is still
 * within expiry.
 */
export async function acceptWaitlistOffer(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<DalResult<void>> {
  try {
    const { data, error } = await supabase
      .from('session_waitlist')
      .select('id, status, offer_expires_at')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'No waitlist entry' };

    const row = data as { id: string; status: WaitlistStatus; offer_expires_at: string | null };
    if (row.status !== 'offered') {
      return { success: false, error: 'No active offer' };
    }
    if (row.offer_expires_at && new Date(row.offer_expires_at) < new Date()) {
      return { success: false, error: 'Offer has expired' };
    }

    const { error: partErr } = await supabase
      .from('session_participants')
      .insert({ session_id: sessionId, user_id: userId, status: 'confirmed' });
    if (partErr) return { success: false, error: partErr.message };

    const { error: updErr } = await supabase.from('session_waitlist').update({ status: 'accepted' }).eq('id', row.id);
    if (updErr) return { success: false, error: updErr.message };

    return { success: true };
  } catch (error) {
    logError(error, { action: 'acceptWaitlistOffer', sessionId, userId });
    return { success: false, error: 'Failed to accept offer' };
  }
}

/** Mark all stale 'offered' rows as 'expired'. Returns count. */
export async function expireStaleOffers(supabase: SupabaseClient): Promise<DalResult<{ expired: number }>> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('session_waitlist')
      .update({ status: 'expired' })
      .eq('status', 'offered')
      .lt('offer_expires_at', now)
      .select('id, session_id, user_id');
    if (error) return { success: false, error: error.message };
    return { success: true, data: { expired: (data || []).length } };
  } catch (error) {
    logError(error, { action: 'expireStaleOffers' });
    return { success: false, error: 'Failed to expire offers' };
  }
}
