import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isMomentsEnabled } from '@/lib/features/moments';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { signedInUser } from '@/lib/moments/routeGuard';
import { loadMyMoments } from '@/lib/moments/mine';
import MyMomentosClient from './MyMomentosClient';

/**
 * /profile/momentos/ (T-MOM1 Part C): the signed-in person's own photos from
 * sessions. Private by default: there is no way to open anyone else's. A 404
 * while MOMENTS_ENABLED is off; signed out goes to sign-in and back.
 * ?s=<session> (the notification's deep link) opens that session's batch.
 */
export const metadata: Metadata = { title: 'Momentos | Tribe', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MomentosPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (!isMomentsEnabled()) notFound();
  const { s } = await searchParams;
  const user = await signedInUser();
  if (!user) {
    const back = `/profile/momentos/${s && UUID.test(s) ? `?s=${s}` : ''}`;
    redirect(`/auth/?returnTo=${encodeURIComponent(back)}`);
  }
  const batches = await loadMyMoments(getServiceRoleClient(), user.id);
  const open = s && UUID.test(s) && batches.some((b) => b.sessionId === s.toLowerCase()) ? s.toLowerCase() : null;
  return <MyMomentosClient initial={batches} openSessionId={open} />;
}
