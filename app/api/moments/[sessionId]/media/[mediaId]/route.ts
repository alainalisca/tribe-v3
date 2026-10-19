import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { isMomentsEnabled } from '@/lib/features/moments';
import { loadUploadContext } from '@/lib/moments/permissions';
import { PRIVATE, fail, signedInUser } from '@/lib/moments/routeGuard';
import { canDeleteMoment } from '@/lib/moments/deleteRule';
import { logError } from '@/lib/logger';

/**
 * DELETE /api/moments/<session>/media/<media>/ (T-MOM1): soft delete
 * (deleted_at). The uploader, the host or an admin. The nightly job removes
 * the files 7 days later.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ sessionId: string; mediaId: string }> }) {
  const { sessionId, mediaId } = await params;
  if (!isMomentsEnabled()) return fail(404, 'not_found');
  const user = await signedInUser();
  if (!user) return fail(401, 'unauthorized');
  const service = getServiceRoleClient();
  try {
    const [ctx, { data: media }] = await Promise.all([
      loadUploadContext(service, sessionId, user.id),
      service
        .from('session_media')
        .select('uploader_id, deleted_at')
        .eq('id', mediaId)
        .eq('session_id', sessionId)
        .maybeSingle(),
    ]);
    const m = media as { uploader_id: string; deleted_at: string | null } | null;
    if (!ctx || !m || m.deleted_at) return fail(404, 'not_found');
    if (!canDeleteMoment({ userId: user.id, uploaderId: m.uploader_id, hostId: ctx.hostId, isAdmin: ctx.isAdmin }))
      return fail(403, 'forbidden');
    const { error } = await service
      .from('session_media')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', mediaId);
    if (error) throw error;
    return NextResponse.json({ deleted: mediaId }, { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.delete', sessionId });
    return fail(500, 'delete_failed');
  }
}
