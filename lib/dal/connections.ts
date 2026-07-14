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

export interface TrainingPartner {
  id: string;
  name: string;
  avatar_url: string | null;
  primary_sport: string;
  distance_km: number;
  shared_sport_count: number;
  sports: string[];
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
 * Fetch nearby athletes from the users table (no session-gating).
 * Uses Haversine formula in JS. Filters by radius and optional sport.
 */
export async function fetchNearbyAthletes(
  supabase: SupabaseClient,
  userId: string,
  lat: number,
  lng: number,
  sport?: string,
  radiusKm: number = 25,
  limit: number = 30
): Promise<DalResult<TrainingPartner[]>> {
  try {
    // Only query users who have coordinates set. users_discoverable (migration
    // 114) returns coords rounded to 2dp server-side and already excludes
    // soft-deleted/banned/test accounts, so no deleted_at filter here.
    // Distance below is therefore computed on rounded coords: accurate to
    // ~1.1km, and two users in the same cell can read as 0.0km apart.
    let query = supabase
      .from('users_discoverable')
      .select('id, name, avatar_url, sports, location_lat, location_lng')
      .neq('id', userId)
      .not('location_lat', 'is', null)
      .not('location_lng', 'is', null);

    if (sport) {
      query = query.contains('sports', [sport]);
    }

    const { data: users, error } = await query;
    if (error) return { success: false, error: error.message };

    const MAX_RADIUS = 30;

    const partners: TrainingPartner[] = (users || [])
      .map((u: Record<string, unknown>) => {
        const uLat = u.location_lat as number;
        const uLng = u.location_lng as number;
        const uSports = (Array.isArray(u.sports) ? u.sports : []) as string[];

        const lat1 = (lat * Math.PI) / 180;
        const lat2 = (uLat * Math.PI) / 180;
        const dLat = ((uLat - lat) * Math.PI) / 180;
        const dLng = ((uLng - lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = Math.round(6371 * c * 10) / 10;

        return {
          id: (u.id as string) || '',
          name: (u.name as string) || 'Unknown',
          avatar_url: (u.avatar_url as string | null) || null,
          primary_sport: uSports[0] || 'Running',
          distance_km: distance,
          shared_sport_count: uSports.length,
          sports: uSports,
        };
      })
      .filter((p) => p.distance_km <= MAX_RADIUS)
      .sort((a, b) => a.distance_km - b.distance_km);

    return { success: true, data: partners.slice(0, limit) };
  } catch (error) {
    logError(error, { action: 'fetchNearbyAthletes', userId, lat, lng, sport });
    return { success: false, error: 'Failed to fetch nearby athletes' };
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
