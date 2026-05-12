/**
 * DAL: Tribe.OS premium tier billed via Stripe subscription.
 *
 * Companion to lib/dal/tribeOSPremium.ts. That file owns the manual
 * (admin / CLI) grant flow; this file owns the Stripe-billed flow.
 * Both write to the same `tribe_os_*` columns on `users`. They
 * coexist by design: a design partner can be manually granted
 * (status = NULL) while paying customers go through Stripe (status
 * mirrored from the subscription state).
 *
 * The Mission 2 webhook handler calls `syncFromStripeSubscription`
 * on `customer.subscription.created/updated`, and
 * `clearTribeOSSubscription` on `customer.subscription.deleted`.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { TribeOSStatus, TribeOSTier } from './tribeOSPremium';
import { createGym, getGymByStripeCustomerId, getGymByStripeSubscriptionId, getGymForUser, updateGym } from './gyms';
import { addCoachToGym } from './gymCoaches';

/**
 * Translates a Stripe subscription's `status` to our `tribe_os_status`.
 * Returns null when the Stripe state should NOT grant premium (e.g.
 * 'incomplete' on a never-confirmed checkout).
 *
 * Mapping decisions (see project_full_build_plan memory for context):
 *   active     → 'active'    (paid, current period)
 *   trialing   → 'trialing'  (mid-trial, premium-active per isTribeOSPremiumActive)
 *   past_due   → 'past_due'  (failed invoice; gate closes immediately)
 *   unpaid     → 'past_due'  (collapsed onto past_due — same effect)
 *   canceled   → 'canceled'
 *   paused     → 'canceled'  (no current access; user must resume)
 *   incomplete / incomplete_expired → null (don't grant; webhook may
 *     run before the user finishes the Checkout session)
 */
export function stripeStatusToTribeOSStatus(stripeStatus: string): TribeOSStatus | null {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'paused':
      return 'canceled';
    case 'incomplete':
    case 'incomplete_expired':
    default:
      return null;
  }
}

/** Look up a user by their Stripe customer ID for webhook handlers. */
export async function findUserByStripeCustomerId(
  supabase: SupabaseClient,
  stripeCustomerId: string
): Promise<DalResult<{ userId: string } | null>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('tribe_os_stripe_customer_id', stripeCustomerId)
      .maybeSingle();
    if (error) {
      logError(error, { action: 'findUserByStripeCustomerId', stripeCustomerId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data ? { userId: (data as { id: string }).id } : null };
  } catch (error) {
    logError(error, { action: 'findUserByStripeCustomerId', stripeCustomerId });
    return { success: false, error: 'Failed to look up user by Stripe customer' };
  }
}

/**
 * Persist the Stripe customer ID on a user. Called once when we create
 * the customer (or look one up by email) so subsequent Checkout / portal
 * sessions can reuse it.
 */
export async function setTribeOSStripeCustomerId(
  supabase: SupabaseClient,
  userId: string,
  stripeCustomerId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ tribe_os_stripe_customer_id: stripeCustomerId })
      .eq('id', userId);
    if (error) {
      logError(error, { action: 'setTribeOSStripeCustomerId', userId });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'setTribeOSStripeCustomerId', userId });
    return { success: false, error: 'Failed to set Stripe customer ID' };
  }
}

/**
 * Minimal shape of the Stripe subscription fields we care about.
 * Receiving the full `Stripe.Subscription` is fine; this is the
 * documentation of what we actually read.
 */
export interface StripeSubscriptionLike {
  id: string;
  customer: string;
  status: string;
  items: {
    data: Array<{
      price: { id: string };
    }>;
  };
}

/**
 * Webhook entry point for `customer.subscription.created` and
 * `customer.subscription.updated`. Idempotent: re-running with the
 * same subscription is a no-op equivalent.
 *
 * Tier mapping:
 *   - If the subscription's price is STRIPE_TRIBE_OS_PRICE_ID → 'solo'
 *   - Otherwise → tier is left unchanged (some other Stripe product;
 *     don't accidentally grant Tribe.OS premium)
 *
 * Only the `tribe_os_*` columns are touched — the rest of the user row
 * stays as-is.
 */
export async function syncFromStripeSubscription(
  supabase: SupabaseClient,
  subscription: StripeSubscriptionLike
): Promise<DalResult<{ userId: string }>> {
  try {
    const userResult = await findUserByStripeCustomerId(supabase, subscription.customer);
    if (!userResult.success) {
      return { success: false, error: userResult.error ?? 'lookup_failed' };
    }
    if (!userResult.data) {
      logError(new Error('Stripe customer has no matching tribe_os_stripe_customer_id'), {
        action: 'syncFromStripeSubscription',
        customerId: subscription.customer,
        subscriptionId: subscription.id,
      });
      return { success: false, error: 'user_not_found_for_stripe_customer' };
    }
    const userId = userResult.data.userId;

    const tribeOSPriceId = process.env.STRIPE_TRIBE_OS_PRICE_ID ?? '';
    const subscribedToTribeOS = subscription.items.data.some((item) => item.price.id === tribeOSPriceId);

    const status = stripeStatusToTribeOSStatus(subscription.status);
    const tier: TribeOSTier | null = subscribedToTribeOS ? 'solo' : null;

    // If this subscription is for a different Stripe product, persist
    // the subscription_id for traceability but do not grant Tribe.OS
    // tier — that protects against accidentally granting access from
    // an unrelated (e.g. future Tribe+ Stripe-billed) subscription.
    const updates: Record<string, unknown> = {
      tribe_os_stripe_subscription_id: subscription.id,
      tribe_os_status: status,
    };
    if (tier !== null) {
      updates.tribe_os_tier = tier;
      // Stamp the audit trail. granted_by uses the literal 'stripe'
      // sentinel so admin-route + CLI grants stay distinguishable.
      updates.tribe_os_granted_at = new Date().toISOString();
      updates.tribe_os_granted_by = 'stripe';
    } else if (status === null) {
      // Subscription is for an unrelated product AND in an inactive
      // state — clear the tier defensively.
      updates.tribe_os_tier = null;
    }

    const { error } = await supabase.from('users').update(updates).eq('id', userId);
    if (error) {
      logError(error, { action: 'syncFromStripeSubscription', userId, subscriptionId: subscription.id });
      return { success: false, error: error.message };
    }

    // Mirror the subscription state onto the user's gym. Post-Path-B,
    // the gym is the canonical source of truth; the users.tribe_os_*
    // columns above are kept in sync only for backward-compat with
    // code that hasn't migrated to the gym-aware DAL yet.
    //
    // Failures here are logged but do not fail the webhook — the user
    // row is already correct, so the gate works. If gym sync drops, a
    // future webhook retry or manual sweep can repair it. This avoids
    // a Stripe retry storm if gym tables ever go transiently 5xx.
    const gymSync = await syncGymFromStripeSubscription(supabase, {
      userId,
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      tier,
      status,
    });
    if (!gymSync.success) {
      logError(new Error(`gym_sync_failed: ${gymSync.error ?? ''}`), {
        action: 'syncFromStripeSubscription.gymSync',
        userId,
        subscriptionId: subscription.id,
      });
      // Do not return failure — the user row is canonical for the
      // legacy gate path, and the dual-path RLS in migration 070
      // accepts either source.
    }

    return { success: true, data: { userId } };
  } catch (error) {
    logError(error, { action: 'syncFromStripeSubscription', subscriptionId: subscription.id });
    return { success: false, error: 'Failed to sync subscription' };
  }
}

/**
 * Sync the subscription state onto the user's gym. Lookup chain:
 *   1. By stripe_subscription_id (returning event for an already-synced sub)
 *   2. By stripe_customer_id (first event after checkout — the checkout
 *      route persists the customer id onto the gym so this hits)
 *   3. By owner_user_id (fallback when neither id is set yet —
 *      legacy users provisioned via the CLI before Mission 6's gym
 *      auto-creation flow shipped)
 *   4. Create a gym for the user (brand-new subscriber on the
 *      gym-tenant code path).
 *
 * Caller passes the already-resolved (userId, tier, status). This
 * function is safe to call repeatedly; field-level updateGym is
 * idempotent.
 */
async function syncGymFromStripeSubscription(
  supabase: SupabaseClient,
  params: {
    userId: string;
    subscriptionId: string;
    customerId: string;
    tier: TribeOSTier | null;
    status: TribeOSStatus | null;
  }
): Promise<DalResult<{ gymId: string }>> {
  try {
    // (1) Find by subscription id (preferred).
    let gymRes = await getGymByStripeSubscriptionId(supabase, params.subscriptionId);
    if (!gymRes.success) {
      return { success: false, error: gymRes.error ?? 'lookup_failed' };
    }
    let gym = gymRes.data;

    // (2) Find by customer id (first event for this subscription).
    if (!gym) {
      gymRes = await getGymByStripeCustomerId(supabase, params.customerId);
      if (!gymRes.success) {
        return { success: false, error: gymRes.error ?? 'lookup_failed' };
      }
      gym = gymRes.data;
    }

    // (3) Find by owner_user_id (legacy users without stripe ids yet).
    if (!gym) {
      const owned = await getGymForUser(supabase, params.userId);
      if (!owned.success) {
        return { success: false, error: owned.error ?? 'lookup_failed' };
      }
      gym = owned.data;
    }

    // (4) Create one. Auto-provisioning path for brand-new subscribers
    // whose gym was never set up by the checkout route (defensive: this
    // should not happen if Mission 6's checkout flow is in place).
    if (!gym) {
      const userRow = await supabase.from('users').select('name, email').eq('id', params.userId).single();
      const display =
        ((userRow.data as { name: string | null; email: string | null } | null)?.name ??
          (userRow.data as { name: string | null; email: string | null } | null)?.email?.split('@')[0]) ||
        'Solo Practice';
      const created = await createGym(supabase, {
        name: display,
        ownerUserId: params.userId,
        tier: params.tier,
        status: params.status,
        stripeCustomerId: params.customerId,
        stripeSubscriptionId: params.subscriptionId,
        grantedAt: new Date().toISOString(),
        grantedBy: 'stripe',
      });
      if (!created.success) {
        return { success: false, error: created.error ?? 'create_failed' };
      }
      const newGym = created.data!;
      // Owner needs the gym_coaches row so the dual-path RLS works.
      await addCoachToGym(supabase, newGym.id, params.userId, 'owner');
      return { success: true, data: { gymId: newGym.id } };
    }

    // Existing gym → patch it in place.
    const updateRes = await updateGym(supabase, gym.id, {
      tier: params.tier ?? gym.tribe_os_tier,
      status: params.status,
      stripeCustomerId: params.customerId,
      stripeSubscriptionId: params.subscriptionId,
      // Only stamp granted_at on a transition from "no tier" to "tier".
      grantedAt: gym.tribe_os_tier ? undefined : new Date().toISOString(),
      grantedBy: gym.tribe_os_tier ? undefined : 'stripe',
    });
    if (!updateRes.success) {
      return { success: false, error: updateRes.error ?? 'update_failed' };
    }
    return { success: true, data: { gymId: gym.id } };
  } catch (error) {
    logError(error, {
      action: 'syncGymFromStripeSubscription',
      userId: params.userId,
      subscriptionId: params.subscriptionId,
    });
    return { success: false, error: 'Failed to sync gym from subscription' };
  }
}

/**
 * Webhook entry point for `customer.subscription.deleted`. Clears the
 * tier and audit trail; preserves the customer ID and subscription ID
 * so a future re-subscribe via Stripe Customer Portal can find the
 * existing records.
 */
export async function clearTribeOSSubscription(
  supabase: SupabaseClient,
  stripeCustomerId: string
): Promise<DalResult<{ userId: string }>> {
  try {
    const userResult = await findUserByStripeCustomerId(supabase, stripeCustomerId);
    if (!userResult.success) {
      return { success: false, error: userResult.error ?? 'lookup_failed' };
    }
    if (!userResult.data) {
      // No-op: a sub-deleted webhook for a customer we don't track
      // can happen during testing or after manual cleanup. Don't error.
      return { success: false, error: 'user_not_found_for_stripe_customer' };
    }
    const userId = userResult.data.userId;

    const { error } = await supabase
      .from('users')
      .update({
        tribe_os_tier: null,
        tribe_os_status: 'canceled',
        tribe_os_granted_at: null,
        tribe_os_granted_by: null,
      })
      .eq('id', userId);

    if (error) {
      logError(error, { action: 'clearTribeOSSubscription', userId });
      return { success: false, error: error.message };
    }

    // Mirror the cancellation onto the user's gym(s). We flip
    // tribe_os_status to 'canceled' but PRESERVE tier — that way the
    // gym record remains identifiable as "previously on solo tier"
    // for re-subscribe attribution, and isTribeOSPremiumActive's
    // tier-null short-circuit isn't required (status='canceled' is
    // enough to fail the gate).
    //
    // Lookup order: subscription id → customer id → owner_user_id.
    // We don't fail the webhook if gym lookup misses — the user row
    // is canonical for the legacy gate.
    let gymRes = await getGymByStripeCustomerId(supabase, stripeCustomerId);
    if (!gymRes.success) {
      logError(new Error(`gym_lookup_failed: ${gymRes.error ?? ''}`), {
        action: 'clearTribeOSSubscription.gymLookup',
        userId,
        stripeCustomerId,
      });
    } else if (!gymRes.data) {
      gymRes = await getGymForUser(supabase, userId);
    }
    const gym = gymRes.success ? gymRes.data : null;
    if (gym) {
      const updateRes = await updateGym(supabase, gym.id, {
        status: 'canceled',
        // Stripe IDs preserved for re-subscribe traceability.
      });
      if (!updateRes.success) {
        logError(new Error(`gym_update_failed: ${updateRes.error ?? ''}`), {
          action: 'clearTribeOSSubscription.gymUpdate',
          userId,
          gymId: gym.id,
        });
      }
    }

    return { success: true, data: { userId } };
  } catch (error) {
    logError(error, { action: 'clearTribeOSSubscription', stripeCustomerId });
    return { success: false, error: 'Failed to clear subscription' };
  }
}

/**
 * Fast premium-active check by user id, used by the payment/create
 * route to waive the 15% Connect platform fee for premium subscribers
 * (their $30/mo replaces the per-transaction fee).
 *
 * Fails closed: any DB error returns `data: false` so we never
 * accidentally waive the fee for a non-premium user during a transient
 * failure. Worst case is a premium user is briefly charged the fee on
 * a session and we refund — better than losing platform revenue.
 */
export async function isCreatorPremium(supabase: SupabaseClient, userId: string): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('tribe_os_tier, tribe_os_status')
      .eq('id', userId)
      .single();
    if (error) {
      logError(error, { action: 'isCreatorPremium', userId });
      return { success: true, data: false };
    }
    const row = data as { tribe_os_tier: string | null; tribe_os_status: string | null };
    if (!row.tribe_os_tier) return { success: true, data: false };
    const status = row.tribe_os_status;
    const isActive = status === null || status === 'active' || status === 'trialing';
    return { success: true, data: isActive };
  } catch (error) {
    logError(error, { action: 'isCreatorPremium', userId });
    return { success: true, data: false };
  }
}
