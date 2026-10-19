import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';

/**
 * T-MOM1: who may upload, tag, deliver and delete photos of a session.
 *
 *   the session's host, an admin, or a photographer the host (or an admin)
 *   named for that session (session_photographers).
 *
 * The rule is pure (canUploadToSession); loadUploadContext reads what it
 * needs with the service role, because the server routes that write Moments
 * run as the service role and must check before they write. A cancelled
 * session takes no new photos; a test session does (its host tests with it).
 */
export type UploadContext = {
  userId: string | null;
  hostId: string | null;
  isAdmin: boolean;
  isPhotographer: boolean;
  sessionStatus: string | null;
};

export function canUploadToSession(c: UploadContext): boolean {
  if (!c.userId || !c.hostId) return false;
  if (c.sessionStatus === 'cancelled') return false;
  return c.userId === c.hostId || c.isAdmin || c.isPhotographer;
}

/** Granting "Fotógrafo de esta sesión": the host or an admin only, never another photographer. */
export function canGrantPhotographer(c: UploadContext): boolean {
  if (!c.userId || !c.hostId) return false;
  return c.userId === c.hostId || c.isAdmin;
}

/** What canUploadToSession needs, read with the service role. Null when the session does not exist. */
export async function loadUploadContext(
  service: SupabaseClient,
  sessionId: string,
  userId: string | null
): Promise<UploadContext | null> {
  try {
    const [session, user, photographer] = await Promise.all([
      service.from('sessions').select('creator_id, status').eq('id', sessionId).maybeSingle(),
      userId
        ? service.from('users').select('is_admin').eq('id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      userId
        ? service
            .from('session_photographers')
            .select('user_id')
            .eq('session_id', sessionId)
            .eq('user_id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!session.data) return null;
    return {
      userId,
      hostId: (session.data as { creator_id: string | null }).creator_id,
      isAdmin: !!(user.data as { is_admin?: boolean } | null)?.is_admin,
      isPhotographer: !!photographer.data,
      sessionStatus: (session.data as { status: string | null }).status,
    };
  } catch (error) {
    logError(error, { action: 'moments.loadUploadContext', sessionId });
    return null;
  }
}
