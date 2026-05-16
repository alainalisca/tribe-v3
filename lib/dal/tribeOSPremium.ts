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
 * Pure helper: a user is "premium-active" when they're on a tier AND
 * one of:
 *   - status is NULL (manually granted; no Stripe billing yet)
 *   - status is 'active' (Stripe-billed, current invoice paid)
 *   - status is 'trialing' (Stripe-billed, in their trial window — they
 *     get full access until the trial converts or expires)
 * 'past_due' and 'canceled' BOTH evaluate to not-active so the gate
 * flips immediately on a failed invoice or explicit cancellation.
 */
export function isTribeOSPremiumActive(user: Partial<TribeOSPremiumFields> | null | undefined): boolean {
  if (!user || !user.tribe_os_tier) return false;
  const status = user.tribe_os_status ?? null;
  return status === null || status === 'active' || status === 'trialing';
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

    // Reset tribe_os_status to NULL. Manual grants put the user in the
    // "design partner" state (NULL status), which isTribeOSPremiumActive
    // treats as active. If the user was previously on Stripe and got
    // canceled, the stale 'canceled' status would survive the grant and
    // cause the gate to fail. The webhook flips status to 'active' /
    // 'trialing' / 'past_due' / 'canceled' if and when the user later
    // re-subscribes via Stripe. Stripe customer/subscription IDs are
    // preserved for audit and future Stripe re-attachment.
    const { data, error } = await supabase
      .from('users')
      .update({
        tribe_os_tier: tier,
        tribe_os_status: null,
        tribe_os_granted_at: new Date().toISOString(),
        tribe_os_granted_by: grantedBy,
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
 * Read the Tribe.OS premium-gate fields for a user by id. Only selects
 * the two columns needed by `isTribeOSPremiumActive`: tier + status.
 * The remaining premium fields (stripe_customer_id, stripe_subscription_id,
 * granted_at, granted_by) are restricted from authenticated/anon by
 * migration 066 and are not needed for the gate check anyway. Callers
 * that need those fields must use service-role.
 *
 * NOTE: Post-migration 068, the source of truth for premium status is
 * `gyms` (a user is premium if they own or coach in a gym with an
 * active/trialing status). Callers should prefer
 * `getTribeOSPremiumStatusForUser` below, which checks gyms first and
 * falls back to legacy users columns. This function is preserved for
 * backward compat with code that explicitly wants only the legacy row.
 */
export async function getTribeOSPremiumStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'>>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('tribe_os_tier, tribe_os_status')
      .eq('id', userId)
      .single();

    if (error) {
      logError(error, { action: 'getTribeOSPremiumStatus', userId });
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: data as unknown as Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'>,
    };
  } catch (error) {
    logError(error, { action: 'getTribeOSPremiumStatus', userId });
    return { success: false, error: 'Failed to read Tribe.OS premium status' };
  }
}

/**
 * Gym-aware premium status resolver. Replaces the legacy
 * users.tribe_os_* read path for new call sites.
 *
 * Resolution order:
 *   1. Any gym the user OWNS with active/trialing status → premium.
 *   2. Any gym the user is a COACH in with active/trialing status → premium.
 *   3. Legacy users.tribe_os_tier + tribe_os_status row → premium iff
 *      isTribeOSPremiumActive(legacyRow) returns true.
 *
 * The legacy fallback exists because migration 069 backfills gyms for
 * every existing premium user, but Mission 6's onboarding path may
 * not have run yet for brand-new signups in the transition window.
 * Once the legacy users.tribe_os_* path is removed (cleanup migration,
 * Week 5+), this function collapses to gym checks only.
 *
 * Returns:
 *   - active: boolean — the final premium-gate answer
 *   - tier: the tier the user is on (gym tier wins over legacy)
 *   - gymId: the gym that granted access (null if it came from
 *            the legacy users row instead)
 */
export interface PremiumStatusResolved {
  active: boolean;
  tier: TribeOSTier | null;
  status: TribeOSStatus | null;
  gymId: string | null;
}

export async function getTribeOSPremiumStatusForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<PremiumStatusResolved>> {
  try {
    // (1) Owned gyms.
    const owned = await supabase
      .from('gyms')
      .select('id, tribe_os_tier, tribe_os_status')
      .eq('owner_user_id', userId)
      .is('deleted_at', null);
    if (owned.error) {
      logError(owned.error, { action: 'getTribeOSPremiumStatusForUser.owned', userId });
      return { success: false, error: owned.error.message };
    }
    type GymGate = { id: string; tribe_os_tier: TribeOSTier | null; tribe_os_status: TribeOSStatus | null };
    const ownedRows = (owned.data ?? []) as GymGate[];
    for (const g of ownedRows) {
      if (isTribeOSPremiumActive({ tribe_os_tier: g.tribe_os_tier, tribe_os_status: g.tribe_os_status })) {
        return {
          success: true,
          data: { active: true, tier: g.tribe_os_tier, status: g.tribe_os_status, gymId: g.id },
        };
      }
    }

    // (2) Coached gyms.
    const coached = await supabase
      .from('gym_coaches')
      .select('gym:gyms(id, tribe_os_tier, tribe_os_status, deleted_at)')
      .eq('user_id', userId);
    if (coached.error) {
      logError(coached.error, { action: 'getTribeOSPremiumStatusForUser.coach', userId });
      return { success: false, error: coached.error.message };
    }
    type CoachJoin = { gym: (GymGate & { deleted_at: string | null }) | null };
    const coachRows = (coached.data ?? []) as unknown as CoachJoin[];
    for (const row of coachRows) {
      const g = row.gym;
      if (!g || g.deleted_at) continue;
      if (isTribeOSPremiumActive({ tribe_os_tier: g.tribe_os_tier, tribe_os_status: g.tribe_os_status })) {
        return {
          success: true,
          data: { active: true, tier: g.tribe_os_tier, status: g.tribe_os_status, gymId: g.id },
        };
      }
    }

    // (3) Legacy fallback.
    const legacy = await supabase.from('users').select('tribe_os_tier, tribe_os_status').eq('id', userId).maybeSingle();
    if (legacy.error) {
      logError(legacy.error, { action: 'getTribeOSPremiumStatusForUser.legacy', userId });
      return { success: false, error: legacy.error.message };
    }
    const legacyRow = legacy.data as Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'> | null;
    if (legacyRow && isTribeOSPremiumActive(legacyRow)) {
      return {
        success: true,
        data: {
          active: true,
          tier: legacyRow.tribe_os_tier ?? null,
          status: legacyRow.tribe_os_status ?? null,
          gymId: null,
        },
      };
    }

    return {
      success: true,
      data: { active: false, tier: null, status: null, gymId: null },
    };
  } catch (error) {
    logError(error, { action: 'getTribeOSPremiumStatusForUser', userId });
    return { success: false, error: 'Failed to resolve Tribe.OS premium status' };
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
