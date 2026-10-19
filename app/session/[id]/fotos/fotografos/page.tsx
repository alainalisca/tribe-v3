import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isMomentsEnabled } from '@/lib/features/moments';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { signedInUser } from '@/lib/moments/routeGuard';
import { canGrantPhotographer, loadUploadContext } from '@/lib/moments/permissions';
import { loadPhotographers } from '@/lib/moments/photographers';
import PhotographersScreen from '@/components/moments/PhotographersScreen';

/**
 * /session/<id>/fotos/fotografos/ (T-MOM1 Part C): "Fotógrafo de esta
 * sesión", from Gestionar. The host or an admin names who may upload and tag
 * this session's photos. A 404 for everyone else and while MOMENTS_ENABLED is
 * off; signed out goes to sign-in and back (middleware).
 */
export const metadata: Metadata = { title: 'Fotógrafo de esta sesión | Tribe', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PhotographersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMomentsEnabled() || !UUID.test(id)) notFound();
  const user = await signedInUser();
  if (!user) redirect(`/auth/?returnTo=${encodeURIComponent(`/session/${id}/fotos/fotografos/`)}`);
  const service = getServiceRoleClient();
  const ctx = await loadUploadContext(service, id, user.id);
  if (!ctx || !canGrantPhotographer(ctx)) notFound();
  return <PhotographersScreen sessionId={id} initial={await loadPhotographers(service, id)} />;
}
