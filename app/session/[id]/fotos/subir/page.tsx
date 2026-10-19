import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isMomentsEnabled } from '@/lib/features/moments';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { signedInUser } from '@/lib/moments/routeGuard';
import { canUploadToSession, loadUploadContext } from '@/lib/moments/permissions';
import { loadSessionMoments } from '@/lib/moments/batch';
import { publicSessionTitle } from '@/lib/share/sessionPublic';
import MomentsUploadClient from './MomentsUploadClient';

/**
 * /session/<id>/fotos/subir/ (T-MOM1 Part B): the host's, an admin's or a
 * named photographer's upload and tagging screen. A 404 for everyone else
 * and whenever MOMENTS_ENABLED is off; signed out goes to sign-in and back.
 */
export const metadata: Metadata = { title: 'Fotos de la sesión | Tribe', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MomentsUploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMomentsEnabled() || !UUID.test(id)) notFound();
  const user = await signedInUser();
  if (!user) redirect(`/auth/?returnTo=${encodeURIComponent(`/session/${id}/fotos/subir/`)}`);
  const service = getServiceRoleClient();
  const ctx = await loadUploadContext(service, id, user.id);
  if (!ctx || !canUploadToSession(ctx)) notFound();
  const [state, { data: session }] = await Promise.all([
    loadSessionMoments(service, id),
    service.from('sessions').select('title, sport, creator_id').eq('id', id).maybeSingle(),
  ]);
  const s = session as { title: string | null; sport: string | null; creator_id: string | null } | null;
  const { data: host } = s?.creator_id
    ? await service.from('users').select('name').eq('id', s.creator_id).maybeSingle()
    : { data: null };
  const title = publicSessionTitle(
    { title: s?.title ?? null, sport: s?.sport ?? null, creatorName: (host as { name?: string } | null)?.name ?? null },
    'es'
  );
  return <MomentsUploadClient sessionId={id} sessionTitle={title} initial={state} />;
}
