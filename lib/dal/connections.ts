/** DAL: connections table — session-gated training partner connections */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface Connection {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined';
  shared_session_id: string | null;
  created_at: string;
  accepted_at: string | null;
}

export interface ConnectedUser {
  id: string;
  name: string;
  avatar_url: string | null;
  sports: string[];
}

/**
 * Exactly what find_training_partners (migration 180) returns. No coordinate,
 * no distance, no rank: the RPC returns rows IN ORDER and the card needs only
 * the order.
 *
 * `distance_km` and `primary_sport` are gone. distance_km was rendered on every
 * card for every viewer; primary_sport was sports[0] under another name, and
 * the card now shows the sports themselves.
 *
 * NOTE there is a SECOND, unrelated TrainingPartner in lib/dal/trainingPartners.ts
 * for the Tribe.OS section. Different shape, different surface, untouched.
 */
export interface TrainingPartner {
  id: string;
  name: string;
  avatar_url: string | null;
  sports: string[];
  /** Sports this athlete shares WITH THE VIEWER -- computed server-side against
   *  the caller's own list. The previous field of this name held the other
   *  athlete's total sport count, which shares nothing with anybody. */
  shared_sport_count: number;
}

export interface PendingRequest {
  id: string;
  requester: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  status: 'pending';
  created_at: string;
}

/**
 * Send a connection request from requester to recipient.
 * Checks have_shared_session first via RPC.
 */
export async function sendConnectionRequest(
  supabase: SupabaseClient,
  requesterId: string,
  recipientId: string
): Promise<DalResult<string>> {
  try {
    // 1. Check if either user has blocked the other. Routes through the
    // is_user_blocked() RPC (migration 061) which is SECURITY DEFINER —
    // RLS on blocked_users limits SELECT to the blocker only, so a
    // direct query as the requester wouldn't see "recipient blocked
    // requester" rows.
    const { data: isBlocked, error: blockErr } = await supabase.rpc('is_user_blocked', {
      p_user_a: requesterId,
      p_user_b: recipientId,
    });
    if (blockErr) {
      logError(blockErr, { action: 'sendConnectionRequest.isBlocked', requesterId, recipientId });
      return { success: false, error: 'Failed to verify connection eligibility' };
    }
    if (isBlocked) {
      return { success: false, error: 'Cannot connect with this user' };
    }

    // 2. Check for existing connection in either direction
    const { data: existingConnection } = await supabase
      .from('connections')
      .select('id, status, requester_id')
      .or(
        `and(requester_id.eq.${requesterId},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${requesterId})`
      )
      .maybeSingle();

    if (existingConnection) {
      if (existingConnection.status === 'accepted') {
        return { success: false, error: 'Already connected' };
      }
      if (existingConnection.status === 'pending') {
        // If the other person already sent a request, auto-accept it
        if (existingConnection.requester_id === recipientId) {
          const { error: acceptErr } = await supabase
            .from('connections')
            .update({ status: 'accepted', accepted_at: new Date().toISOString() })
            .eq('id', existingConnection.id);
          if (acceptErr) return { success: false, error: acceptErr.message };
          return { success: true, data: existingConnection.id };
        }
        return { success: false, error: 'Request already sent' };
      }
    }

    // 3. Verify they've shared a session via RPC
    const { data: hasShared, error: rpcError } = await supabase.rpc('have_shared_session', {
      user_a: requesterId,
      user_b: recipientId,
    });

    if (rpcError) return { success: false, error: `Cannot verify shared session: ${rpcError.message}` };
    if (!hasShared) {
      return { success: false, error: 'You must train together first' };
    }

    // Get first shared session ID to record
    const { data: firstSession, error: sessionError } = await supabase.rpc('first_shared_session', {
      user_a: requesterId,
      user_b: recipientId,
    });

    if (sessionError) {
      return { success: false, error: 'Failed to find shared session' };
    }

    // 4. Create connection
    const { data, error } = await supabase
      .from('connections')
      .insert({
        requester_id: requesterId,
        recipient_id: recipientId,
        shared_session_id: firstSession || null,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Connection request already exists' };
      }
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'Failed to create connection request' };
    }

    return { success: true, data: data.id };
  } catch (error) {
    logError(error, { action: 'sendConnectionRequest', requesterId, recipientId });
    return { success: false, error: 'Failed to send connection request' };
  }
}

/**
 * Accept a pending connection request.
 */
export async function acceptConnection(supabase: SupabaseClient, connectionId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('connections')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', connectionId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'acceptConnection', connectionId });
    return { success: false, error: 'Failed to accept connection' };
  }
}

/**
 * Decline a pending connection request.
 */
export async function declineConnection(supabase: SupabaseClient, connectionId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('connections').update({ status: 'declined' }).eq('id', connectionId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'declineConnection', connectionId });
    return { success: false, error: 'Failed to decline connection' };
  }
}

/**
 * Remove a connection (for accepted connections or to cancel pending requests).
 */
export async function removeConnection(supabase: SupabaseClient, connectionId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('connections').delete().eq('id', connectionId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'removeConnection', connectionId });
    return { success: false, error: 'Failed to remove connection' };
  }
}

/**
 * Get connection status between two users.
 * Returns: 'none' | 'pending_sent' | 'pending_received' | 'connected'
 */
export async function getConnectionStatus(
  supabase: SupabaseClient,
  userId1: string,
  userId2: string
): Promise<DalResult<'none' | 'pending_sent' | 'pending_received' | 'connected'>> {
  try {
    const { data, error } = await supabase
      .from('connections')
      .select('status, requester_id')
      .or(
        `and(requester_id.eq.${userId1},recipient_id.eq.${userId2}),and(requester_id.eq.${userId2},recipient_id.eq.${userId1})`
      )
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not an error for us)
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: true, data: 'none' };
    }

    const connData = data as Record<string, unknown>;
    const status = connData.status as string;

    if (status === 'accepted') {
      return { success: true, data: 'connected' };
    }

    if (status === 'pending') {
      const requesterId = connData.requester_id as string;
      return { success: true, data: requesterId === userId1 ? 'pending_sent' : 'pending_received' };
    }

    return { success: true, data: 'none' };
  } catch (error) {
    logError(error, { action: 'getConnectionStatus', userId1, userId2 });
    return { success: false, error: 'Failed to get connection status' };
  }
}

/**
 * Fetch all accepted connections for a user with user info.
 */
export async function fetchConnections(supabase: SupabaseClient, userId: string): Promise<DalResult<ConnectedUser[]>> {
  try {
    const { data, error } = await supabase
      .from('connections')
      .select(
        `
        id,
        requester_id,
        recipient_id,
        requester:users!connections_requester_id_fkey (
          id,
          name,
          avatar_url,
          sports
        ),
        recipient:users!connections_recipient_id_fkey (
          id,
          name,
          avatar_url,
          sports
        )
      `
      )
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

    if (error) return { success: false, error: error.message };

    const connections: ConnectedUser[] = (data || [])
      .map((conn: Record<string, unknown>) => {
        const otherUser =
          (conn.requester_id as string) === userId
            ? (conn.recipient as Record<string, unknown> | null)
            : (conn.requester as Record<string, unknown> | null);

        if (!otherUser) return null;

        return {
          id: (otherUser.id as string) || '',
          name: (otherUser.name as string) || 'Unknown',
          avatar_url: (otherUser.avatar_url as string | null) || null,
          sports: (Array.isArray(otherUser.sports) ? otherUser.sports : []) as string[],
        };
      })
      .filter((u): u is ConnectedUser => u !== null);

    return { success: true, data: connections };
  } catch (error) {
    logError(error, { action: 'fetchConnections', userId });
    return { success: false, error: 'Failed to fetch connections' };
  }
}

/**
 * Fetch pending connection requests for a user (where they are recipient).
 */
export async function fetchPendingRequests(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<PendingRequest[]>> {
  try {
    const { data, error } = await supabase
      .from('connections')
      .select(
        `
        id,
        created_at,
        requester:users!connections_requester_id_fkey (
          id,
          name,
          avatar_url
        )
      `
      )
      .eq('recipient_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };

    const requests: PendingRequest[] = (data || [])
      .map((req: Record<string, unknown>) => {
        const requester = req.requester as Record<string, unknown> | null;
        if (!requester) return null;

        return {
          id: (req.id as string) || '',
          requester: {
            id: (requester.id as string) || '',
            name: (requester.name as string) || 'Unknown',
            avatar_url: (requester.avatar_url as string | null) || null,
          },
          status: 'pending' as const,
          created_at: (req.created_at as string) || '',
        };
      })
      .filter((r): r is PendingRequest => r !== null);

    return { success: true, data: requests };
  } catch (error) {
    logError(error, { action: 'fetchPendingRequests', userId });
    return { success: false, error: 'Failed to fetch pending requests' };
  }
}

/**
 * Ranked training partners for the signed-in viewer, from migration 180's
 * find_training_partners RPC.
 *
 * THERE IS NO lat/lng PARAMETER, DELIBERATELY. The RPC reads the caller's own
 * stored coordinates via auth.uid(). The function this replaced took an origin
 * as an argument and never checked it belonged to the caller, so it answered
 * "who is near this arbitrary point" -- a question the product never asks.
 *
 * AND NOTHING POSITIONAL COMES BACK. The old version selected location_lat and
 * location_lng from users_discoverable and computed a Haversine distance in the
 * browser, which meant every logged-in user's network response carried the
 * rounded coordinates of every athlete on the card. Ranking now happens in the
 * database and the client receives an order.
 *
 * There is no radius either. Ordering is total: athletes with coordinates rank
 * by real distance, everyone else follows by shared sports. The old MAX_RADIUS
 * of 30km excluded people for having skipped a profile field, and the radiusKm
 * parameter beside it was never read.
 */
export async function fetchTrainingPartners(
  supabase: SupabaseClient,
  sport?: string,
  limit: number = 30
): Promise<DalResult<TrainingPartner[]>> {
  try {
    const { data, error } = await supabase.rpc('find_training_partners', {
      p_sport: sport ?? null,
      p_limit: limit,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as TrainingPartner[] };
  } catch (error) {
    logError(error, { action: 'fetchTrainingPartners', sport });
    return { success: false, error: 'Failed to fetch training partners' };
  }
}

/**
 * Check if two users have shared a session (RPC wrapper).
 */
export async function hasSharedSession(
  supabase: SupabaseClient,
  userId1: string,
  userId2: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase.rpc('have_shared_session', {
      user_a: userId1,
      user_b: userId2,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || false };
  } catch (error) {
    logError(error, { action: 'hasSharedSession', userId1, userId2 });
    return { success: false, error: 'Failed to check shared session' };
  }
}

/**
 * Get count of shared sessions between two users (RPC wrapper).
 */
export async function getSharedSessionCount(
  supabase: SupabaseClient,
  userId1: string,
  userId2: string
): Promise<DalResult<number>> {
  try {
    const { data, error } = await supabase.rpc('shared_session_count', {
      user_a: userId1,
      user_b: userId2,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || 0 };
  } catch (error) {
    logError(error, { action: 'getSharedSessionCount', userId1, userId2 });
    return { success: false, error: 'Failed to get shared session count' };
  }
}
