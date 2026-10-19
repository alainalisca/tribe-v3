import { NextResponse } from 'next/server';
import { isMomentsEnabled } from '@/lib/features/moments';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { canUploadToSession, loadUploadContext } from '@/lib/moments/permissions';
import { PRIVATE, signedInUser } from '@/lib/moments/routeGuard';

/** GET /api/moments/<session>/access/ (T-MOM1): may the signed-in user upload photos to this session? */
export async function GET(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!isMomentsEnabled()) return NextResponse.json({ enabled: false, canUpload: false }, { headers: PRIVATE });
  const user = await signedInUser();
  if (!user) return NextResponse.json({ enabled: true, canUpload: false }, { headers: PRIVATE });
  const ctx = await loadUploadContext(getServiceRoleClient(), sessionId, user.id);
  return NextResponse.json({ enabled: true, canUpload: !!ctx && canUploadToSession(ctx) }, { headers: PRIVATE });
}
