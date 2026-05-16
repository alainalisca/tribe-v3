/**
 * Auth gate for routes that require an authenticated Tribe.OS premium user.
 *
 * Use at the top of every premium-gated route handler instead of repeating
 * `getUser` + `getTribeOSPremiumStatusForUser` four times across four routes.
 *
 *   const gate = await requireTribeOSPremium();
 *   if (!gate.ok) return gate.response;
 *   const { supabase, userId, gymId } = gate;
 *   // ...handler logic, supabase is the session-aware client...
 *
 * Why short-circuit with a NextResponse rather than throw: keeps the route
 * handler's flow linear and lets us return the exact HTTP status code
 * without losing the typed handler signature.
 *
 * gymId may be null when the caller is on the legacy users.tribe_os_*
 * path (e.g. manual CLI grant pre-Mission-6 that hasn't been migrated
 * into a gym record yet). Routes that strictly need a gym should check
 * for null and fall back to user-keyed queries — the DAL functions
 * already accept either shape (see lib/dal/clients.ts ClientTenantContext).
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getTribeOSPremiumStatusForUser } from '@/lib/dal/tribeOSPremium';

export type PremiumGateResult =
  | { ok: true; supabase: SupabaseClient; userId: string; gymId: string | null }
  | { ok: false; response: NextResponse };

export async function requireTribeOSPremium(): Promise<PremiumGateResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 }),
    };
  }

  const resolved = await getTribeOSPremiumStatusForUser(supabase, user.id);
  if (!resolved.success) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'failed_to_check_premium_status' }, { status: 500 }),
    };
  }
  if (!resolved.data?.active) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'tribe_os_premium_required' }, { status: 403 }),
    };
  }

  return { ok: true, supabase, userId: user.id, gymId: resolved.data.gymId };
}
