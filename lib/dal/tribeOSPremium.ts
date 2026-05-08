/**
 * DAL: Tribe.OS premium tier on the users table.
 *
 * Manual grant/revoke flow used during the trip — no Stripe billing yet.
 * Stripe customer + subscription IDs are reserved for when paid billing
 * kicks in post-validation. See migration 060 for column definitions.
 *
 * Distinct from `lib/dal/subscriptions.ts`, which manages the athlete-side
 * Tribe+ subscription (free/plus/pro on `subscription_tier`). The Tribe.OS
 * tier columns are namespaced `tribe_os_*` to avoid collision.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type TribeOSTier = 'solo' | 'team_studio';
export type TribeOSStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface TribeOSPremiumFields {
  tribe_os_tier: TribeOSTier | null;
  tribe_os_status: TribeOSStatus | null;
  tribe_os_granted_at: string | null;
  tribe_os_granted_by: string | null;
  tribe_os_stripe_customer_id: string | null;
  tribe_os_stripe_subscription_id: string | null;
}

const PREMIUM_SELECT =
  'tribe_os_tier, tribe_os_status, tribe_os_granted_at, tribe_os_granted_by, tribe_os_stripe_customer_id, tribe_os_stripe_subscription_id';

/**
 * Pure helper: a user is "premium-active" when they're on a tier and
 * either have no Stripe billing status (manually granted) or the billing
 * status is `active`. Past-due / canceled / trialing all evaluate to NOT
 * active so a downgrade flips the gate immediately.
 */
export function isTribeOSPremiumActive(user: Partial<TribeOSPremiumFields> | null | undefined): boolean {
  if (!user || !user.tribe_os_tier) return false;
  const status = user.tribe_os_status ?? null;
  return status === null || status === 'active';
}

/**
 * Grant Tribe.OS premium to a user. Used by the admin grant endpoint and
 * the CLI script for design partners. `grantedBy` is the admin email
 * (audit trail) or the literal 'system' for automated grants.
 *
 * Idempotent: re-granting to the same tier just refreshes `granted_at` /
 * `granted_by`. To change tier, just call again with the new tier.
 *
 * Returns the updated user fields on success.
 */
export async function grantTribeOSPremium(
  supabase: SupabaseClient,
  userEmail: string,
  tier: TribeOSTier,
  grantedBy: string
): Promise<DalResult<{ userId: string } & TribeOSPremiumFields>> {
  try {
    const normalized = userEmail.trim().toLowerCase();
    if (!normalized) return { success: false, error: 'email_required' };

    const { data: existing, error: fetchErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalized)
      .single();

    if (fetchErr || !existing) {
      return { success: false, error: 'user_not_found' };
    }

    const { data, error } = await supabase
      .from('users')
      .update({
        tribe_os_tier: tier,
        tribe_os_granted_at: new Date().toISOString(),
        tribe_os_granted_by: grantedBy,
        // tribe_os_status stays whatever it is. Manual grants leave it
        // NULL (= "no Stripe billing yet"); a later Stripe webhook can
        // flip it to 'active' when paid billing starts.
      })
      .eq('id', (existing as { id: string }).id)
      .select(`id, ${PREMIUM_SELECT}`)
      .single();

    if (error) {
      logError(error, { action: 'grantTribeOSPremium', email: normalized });
      return { success: false, error: error.message };
    }

    const row = data as { id: string } & TribeOSPremiumFields;
    return { success: true, data: { userId: row.id, ...row } };
  } catch (error) {
    logError(error, { action: 'grantTribeOSPremium', email: userEmail });
    return { success: false, error: 'Failed to grant Tribe.OS premium' };
  }
}

/**
 * Revoke Tribe.OS premium from a user. Clears tier + status + grant audit
 * fields. Stripe customer/subscription IDs are preserved (so a future
 * re-subscribe can find the existing Stripe records).
 */
export async function revokeTribeOSPremium(
  supabase: SupabaseClient,
  userEmail: string
): Promise<DalResult<{ userId: string }>> {
  try {
    const normalized = userEmail.trim().toLowerCase();
    if (!normalized) return { success: false, error: 'email_required' };

    const { data: existing, error: fetchErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalized)
      .single();

    if (fetchErr || !existing) {
      return { success: false, error: 'user_not_found' };
    }

    const { error } = await supabase
      .from('users')
      .update({
        tribe_os_tier: null,
        tribe_os_status: null,
        tribe_os_granted_at: null,
        tribe_os_granted_by: null,
      })
      .eq('id', (existing as { id: string }).id);

    if (error) {
      logError(error, { action: 'revokeTribeOSPremium', email: normalized });
      return { success: false, error: error.message };
    }

    return { success: true, data: { userId: (existing as { id: string }).id } };
  } catch (error) {
    logError(error, { action: 'revokeTribeOSPremium', email: userEmail });
    return { success: false, error: 'Failed to revoke Tribe.OS premium' };
  }
}

/**
 * Read the current Tribe.OS premium fields for a user by id. Used by the
 * /os/dashboard premium gate.
 */
export async function getTribeOSPremiumStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<TribeOSPremiumFields>> {
  try {
    const { data, error } = await supabase.from('users').select(PREMIUM_SELECT).eq('id', userId).single();

    if (error) {
      logError(error, { action: 'getTribeOSPremiumStatus', userId });
      return { success: false, error: error.message };
    }

    return { success: true, data: data as unknown as TribeOSPremiumFields };
  } catch (error) {
    logError(error, { action: 'getTribeOSPremiumStatus', userId });
    return { success: false, error: 'Failed to read Tribe.OS premium status' };
  }
}

/**
 * List every user currently flipped to Tribe.OS premium. Used by the
 * `list-premium` CLI utility and the admin dashboard.
 */
export async function listTribeOSPremiumUsers(
  supabase: SupabaseClient
): Promise<DalResult<Array<{ id: string; email: string; name: string } & TribeOSPremiumFields>>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`id, email, name, ${PREMIUM_SELECT}`)
      .not('tribe_os_tier', 'is', null)
      .order('tribe_os_granted_at', { ascending: false });

    if (error) {
      logError(error, { action: 'listTribeOSPremiumUsers' });
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (data ?? []) as Array<{ id: string; email: string; name: string } & TribeOSPremiumFields>,
    };
  } catch (error) {
    logError(error, { action: 'listTribeOSPremiumUsers' });
    return { success: false, error: 'Failed to list Tribe.OS premium users' };
  }
}
