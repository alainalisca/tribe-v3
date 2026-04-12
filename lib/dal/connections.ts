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
    // First check if they've shared a session via RPC
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

    // Create connection
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
      // Check if it's a duplicate request
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
 * Fetch nearby training partners with shared sports.
 * Excludes already-connected users.
 */
export async function fetchTrainingPartners(
  supabase: SupabaseClient,
  userId: string,
  lat: number,
  lng: number,
  sport?: string
): Promise<DalResult<TrainingPartner[]>> {
  try {
    // First get the current user's sports
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('sports')
      .eq('id', userId)
      .single();

    if (userError) return { success: false, error: userError.message };

    const userSports = (Array.isArray(currentUser?.sports) ? currentUser.sports : []) as string[];

    // Get all users with shared sessions (to ensure they've trained together)
    const { data: sharedSessionUsers, error: sharedError } = await supabase.rpc('shared_session_users', {
      target_user: userId,
    });

    if (sharedError) {
      // If RPC doesn't exist, fall back to direct query
      const { data: participants, error: participantError } = await supabase
        .from('session_participants')
        .select('user_id')
        .in(
          'session_id',
          (await supabase.from('session_participants').select('session_id').eq('user_id', userId)).data?.map(
            (p) => p.session_id
          ) || []
        );

      if (participantError) return { success: false, error: participantError.message };

      // Extract unique user IDs
      const potentialPartners = [...new Set((participants || []).map((p) => p.user_id))].filter((id) => id !== userId);

      // Get user profiles for these partners
      if (potentialPartners.length === 0) {
        return { success: true, data: [] };
      }

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, avatar_url, sports, location_lat, location_lng')
        .in('id', potentialPartners);

      if (usersError) return { success: false, error: usersError.message };

      // Get existing connections to exclude
      const { data: connections } = await supabase
        .from('connections')
        .select('requester_id, recipient_id')
        .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
        .eq('status', 'accepted');

      const connectedIds = new Set<string>();
      (connections || []).forEach((conn: Record<string, unknown>) => {
        const requesterId = conn.requester_id as string;
        const recipientId = conn.recipient_id as string;
        if (requesterId === userId) {
          connectedIds.add(recipientId);
        } else {
          connectedIds.add(requesterId);
        }
      });

      // Filter and compute distances
      const partners: TrainingPartner[] = (users || [])
        .filter((u: Record<string, unknown>) => {
          const userId_field = u.id as string;
          return !connectedIds.has(userId_field);
        })
        .map((u: Record<string, unknown>) => {
          const userLat = u.location_lat as number | undefined;
          const userLng = u.location_lng as number | undefined;
          const uSports = (Array.isArray(u.sports) ? u.sports : []) as string[];

          // Calculate distance
          let distance = 999;
          if (userLat && userLng) {
            const lat1 = (lat * Math.PI) / 180;
            const lat2 = (userLat * Math.PI) / 180;
            const dLat = ((userLat - lat) * Math.PI) / 180;
            const dLng = ((userLng - lng) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            distance = Math.round(6371 * c * 10) / 10; // Haversine formula
          }

          // Find shared sports
          const sharedSports = uSports.filter((s) => userSports.includes(s));
          const filteredSports = sport ? sharedSports.filter((s) => s === sport) : sharedSports;

          return {
            id: (u.id as string) || '',
            name: (u.name as string) || 'Unknown',
            avatar_url: (u.avatar_url as string | null) || null,
            primary_sport: filteredSports[0] || uSports[0] || 'Running',
            distance_km: distance,
            shared_sport_count: sharedSports.length,
            sports: sharedSports,
          };
        })
        .filter((p) => (sport ? p.sports.includes(sport) : p.shared_sport_count > 0))
        .sort((a, b) => a.distance_km - b.distance_km);

      return { success: true, data: partners };
    }

    // Use RPC result if available
    const partnerIds = (sharedSessionUsers || []).map((u: Record<string, unknown>) => u.user_id);

    if (partnerIds.length === 0) {
      return { success: true, data: [] };
    }

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, avatar_url, sports, location_lat, location_lng')
      .in('id', partnerIds);

    if (usersError) return { success: false, error: usersError.message };

    // Get existing connections
    const { data: connections } = await supabase
      .from('connections')
      .select('requester_id, recipient_id')
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
      .eq('status', 'accepted');

    const connectedIds = new Set<string>();
    (connections || []).forEach((conn: Record<string, unknown>) => {
      const requesterId = conn.requester_id as string;
      const recipientId = conn.recipient_id as string;
      if (requesterId === userId) {
        connectedIds.add(recipientId);
      } else {
        connectedIds.add(requesterId);
      }
    });

    // Transform and sort
    const partners: TrainingPartner[] = (users || [])
      .filter((u: Record<string, unknown>) => !connectedIds.has(u.id as string))
      .map((u: Record<string, unknown>) => {
        const userLat = u.location_lat as number | undefined;
        const userLng = u.location_lng as number | undefined;
        const uSports = (Array.isArray(u.sports) ? u.sports : []) as string[];

        let distance = 999;
        if (userLat && userLng) {
          const lat1 = (lat * Math.PI) / 180;
          const lat2 = (userLat * Math.PI) / 180;
          const dLat = ((userLat - lat) * Math.PI) / 180;
          const dLng = ((userLng - lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distance = Math.round(6371 * c * 10) / 10;
        }

        const sharedSports = uSports.filter((s) => userSports.includes(s));
        const filteredSports = sport ? sharedSports.filter((s) => s === sport) : sharedSports;

        return {
          id: (u.id as string) || '',
          name: (u.name as string) || 'Unknown',
          avatar_url: (u.avatar_url as string | null) || null,
          primary_sport: filteredSports[0] || uSports[0] || 'Running',
          distance_km: distance,
          shared_sport_count: sharedSports.length,
          sports: sharedSports,
        };
      })
      .filter((p) => (sport ? p.sports.includes(sport) : p.shared_sport_count > 0))
      .sort((a, b) => a.distance_km - b.distance_km);

    return { success: true, data: partners };
  } catch (error) {
    logError(error, { action: 'fetchTrainingPartners', userId, lat, lng, sport });
    return { success: false, error: 'Failed to fetch training partners' };
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
    // Query ALL users (including those without location) so we can show people on the app
    let query = supabase
      .from('users')
      .select('id, name, avatar_url, sports, location_lat, location_lng')
      .neq('id', userId);

    if (sport) {
      query = query.contains('sports', [sport]);
    }

    const { data: users, error } = await query;
    if (error) return { success: false, error: error.message };

    const partners: TrainingPartner[] = (users || []).map((u: Record<string, unknown>) => {
      const uLat = u.location_lat as number | null;
      const uLng = u.location_lng as number | null;
      const uSports = (Array.isArray(u.sports) ? u.sports : []) as string[];

      // Calculate distance if user has coordinates, otherwise mark as unknown (-1)
      let distance = -1;
      if (uLat != null && uLng != null) {
        const lat1 = (lat * Math.PI) / 180;
        const lat2 = (uLat * Math.PI) / 180;
        const dLat = ((uLat - lat) * Math.PI) / 180;
        const dLng = ((uLng - lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distance = Math.round(6371 * c * 10) / 10;
      }

      return {
        id: (u.id as string) || '',
        name: (u.name as string) || 'Unknown',
        avatar_url: (u.avatar_url as string | null) || null,
        primary_sport: uSports[0] || 'Running',
        distance_km: distance,
        shared_sport_count: uSports.length,
        sports: uSports,
      };
    });

    // First: try users within the requested radius
    let nearby = partners.filter((p) => p.distance_km >= 0 && p.distance_km <= radiusKm);

    // If too few results, expand to 50km
    if (nearby.length < 3) {
      nearby = partners.filter((p) => p.distance_km >= 0 && p.distance_km <= 50);
    }

    // Include users without location (distance_km === -1) if still few results
    if (nearby.length < 3) {
      const noLocation = partners.filter((p) => p.distance_km < 0);
      nearby = [...nearby, ...noLocation];
    }

    nearby.sort((a, b) => {
      // Users with known location first, sorted by distance
      if (a.distance_km >= 0 && b.distance_km >= 0) return a.distance_km - b.distance_km;
      if (a.distance_km >= 0) return -1;
      if (b.distance_km >= 0) return 1;
      return 0;
    });

    return { success: true, data: nearby.slice(0, limit) };
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
