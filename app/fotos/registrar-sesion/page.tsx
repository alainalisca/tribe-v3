import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isMomentsEnabled } from '@/lib/features/moments';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { signedInUser } from '@/lib/moments/routeGuard';
import { isVisibleUser } from '@/lib/dal/visibleUsers';
import PastSessionForm from './PastSessionForm';

/**
 * /fotos/registrar-sesion/ (T-MOM1 Part B): "Registrar sesión pasada", for an
 * instructor (their own) or an admin (any listed coach). Behind
 * MOMENTS_ENABLED; a 404 for everyone else.
 */
export const metadata: Metadata = { title: 'Registrar sesión pasada | Tribe', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function RegisterPastSessionPage() {
  if (!isMomentsEnabled()) notFound();
  const user = await signedInUser();
  if (!user) redirect(`/auth/?returnTo=${encodeURIComponent('/fotos/registrar-sesion/')}`);
  const service = getServiceRoleClient();
  const { data: me } = await service.from('users').select('is_admin, is_instructor').eq('id', user.id).maybeSingle();
  const m = me as { is_admin: boolean | null; is_instructor: boolean | null } | null;
  if (!m?.is_admin && !m?.is_instructor) notFound();
  let coaches: Array<{ id: string; name: string }> = [];
  if (m?.is_admin) {
    const { data } = await service
      .from('users')
      .select('id, name, is_test_account, banned, deleted_at')
      .eq('is_instructor', true)
      .order('name');
    coaches = (
      (data ?? []) as Array<{
        id: string;
        name: string | null;
        is_test_account: boolean | null;
        banned: boolean | null;
        deleted_at: string | null;
      }>
    )
      .filter((c) => isVisibleUser(c) && c.name?.trim())
      .map((c) => ({ id: c.id, name: c.name!.trim() }));
  }
  return <PastSessionForm isAdmin={!!m?.is_admin} isInstructor={!!m?.is_instructor} coaches={coaches} />;
}
