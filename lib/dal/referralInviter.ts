import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/**
 * The "Invitado por X" banner on /auth/?ref=CODE.
 *
 * WHY THIS EXISTS. The banner used to call lookupReferralCode from the browser.
 * The visitor on /auth is signed out, `anon` cannot read public.referrals, and
 * the lookup failed every time, so the banner never rendered for anyone. This
 * runs on the server with the service role instead, and is the ONLY thing the
 * route hands back: a first name.
 *
 * FIRST NAME ONLY, on purpose. Anyone can call the route with any code, so what
 * it returns is effectively public. A first name is what the banner shows and
 * all it needs; a full name, an id or an avatar would turn a guessed code into a
 * profile lookup.
 *
 * Codes are `TRIBE-` plus five characters from referrals.generateCode(). Anything
 * else is refused before a query runs. Lead codes (six characters, from
 * pass_leads) are deliberately NOT resolved here: their owners are leads, not
 * accounts, and their names were given to a gym, not published.
 */
export const REFERRAL_CODE_SHAPE = /^TRIBE-[A-HJ-NP-Z2-9]{5}$/;

export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : null;
}

/** `null` data means "no such code, or its owner has no usable name". */
export async function lookupInviterFirstName(admin: SupabaseClient, code: string): Promise<DalResult<string | null>> {
  if (!REFERRAL_CODE_SHAPE.test(code)) return { success: true, data: null };
  try {
    const { data: row, error } = await admin
      .from('referrals')
      .select('referrer_id')
      .eq('referral_code', code)
      .is('referred_id', null)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!row) return { success: true, data: null };

    const { data: user, error: userError } = await admin
      .from('users')
      .select('name, banned, deleted_at')
      .eq('id', row.referrer_id)
      .maybeSingle();
    if (userError) return { success: false, error: userError.message };
    // A deleted or banned account's invite still works for attribution
    // (/api/attr/signup decides that); it just does not get a name in lights.
    if (!user || user.deleted_at || user.banned) return { success: true, data: null };
    return { success: true, data: firstNameOf(user.name) };
  } catch (error) {
    logError(error, { action: 'lookupInviterFirstName' });
    return { success: false, error: 'Failed to look up inviter' };
  }
}
