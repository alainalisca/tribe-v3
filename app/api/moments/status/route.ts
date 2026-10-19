import { NextResponse } from 'next/server';
import { isMomentsEnabled } from '@/lib/features/moments';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { PRIVATE, signedInUser } from '@/lib/moments/routeGuard';

/** GET /api/moments/status/ (T-MOM1): is Moments on, and may this user register a past session (instructor or admin)? */
export async function GET() {
  if (!isMomentsEnabled()) return NextResponse.json({ enabled: false, canRegisterPast: false }, { headers: PRIVATE });
  const user = await signedInUser();
  if (!user) return NextResponse.json({ enabled: true, canRegisterPast: false }, { headers: PRIVATE });
  const { data } = await getServiceRoleClient()
    .from('users')
    .select('is_admin, is_instructor')
    .eq('id', user.id)
    .maybeSingle();
  const u = data as { is_admin: boolean | null; is_instructor: boolean | null } | null;
  return NextResponse.json(
    { enabled: true, canRegisterPast: !!(u?.is_admin || u?.is_instructor) },
    { headers: PRIVATE }
  );
}
