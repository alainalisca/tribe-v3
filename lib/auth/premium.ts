/**
 * Auth gate for routes that require an authenticated Tribe.OS premium user.
 *
 * Use at the top of every premium-gated route handler instead of repeating
 * `getUser` + `getTribeOSPremiumStatus` + `isTribeOSPremiumActive` four
 * times across four routes.
 *
 *   const gate = await requireTribeOSPremium();
 *   if (!gate.ok) return gate.response;
 *   const { supabase, userId } = gate;
 *   // ...handler logic, supabase is the session-aware client...
 *
 * Why short-circuit with a NextResponse rather than throw: keeps the route
 * handler's flow linear and lets us return the exact HTTP status code
 * without losing the typed handler signature.
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getTribeOSPremiumStatus, isTribeOSPremiumActive } from '@/lib/dal/tribeOSPremium';

export type PremiumGateResult =
  | { ok: true; supabase: SupabaseClient; userId: string }
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

  const status = await getTribeOSPremiumStatus(supabase, user.id);
  if (!status.success) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'failed_to_check_premium_status' }, { status: 500 }),
    };
  }
  if (!isTribeOSPremiumActive(status.data ?? null)) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'tribe_os_premium_required' }, { status: 403 }),
    };
  }

  return { ok: true, supabase, userId: user.id };
}
