/**
 * T-PLAN1: coach plan reads and writes on public.users (migration 231).
 *
 * Every WRITE here must be given the service-role client. Migration 231's
 * users_coach_plan_guard refuses any coach_plan* change while auth.uid() is
 * set, admins included, so a session client cannot write these columns at all.
 * Only coach_plan is client-readable; the rest is read with the service role.
 *
 * Two rules the webhook relies on, enforced IN THE QUERY rather than by a read
 * followed by a write, so a race cannot slip past them:
 *   - a Stripe event never changes a comp (coach_plan_source = 'comp');
 *   - a cancel only applies to the subscription the row currently holds, so a
 *     late event for an old subscription cannot downgrade a new one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import {
  getCoachPlan,
  type CoachPlan,
  type CoachPlanSource,
  type CoachPlanStatus,
  type CompCoachPlan,
  type PaidCoachPlan,
} from '@/lib/subscription/coachPlans';

export interface CoachPlanRow {
  id: string;
  name: string | null;
  is_instructor: boolean | null;
  coach_plan: CoachPlan;
  coach_plan_status: CoachPlanStatus | null;
  coach_plan_source: CoachPlanSource | null;
  coach_plan_stripe_customer_id: string | null;
  coach_plan_stripe_subscription_id: string | null;
  coach_plan_current_period_end: string | null;
  coach_plan_granted_by: string | null;
  coach_plan_granted_at: string | null;
}

const ROW_COLUMNS =
  'id, name, is_instructor, coach_plan, coach_plan_status, coach_plan_source, coach_plan_stripe_customer_id, coach_plan_stripe_subscription_id, coach_plan_current_period_end, coach_plan_granted_by, coach_plan_granted_at';

/** Rows a Stripe event may change: never a comp. */
const NOT_COMP = 'coach_plan_source.is.null,coach_plan_source.eq.stripe';
/**
 * What an update filtered by NOT_COMP must return. PostgREST applies an or=
 * filter to the RETURNING rows as well as to the UPDATE, so the column the
 * filter names has to be in the returned set: with select('id') alone every
 * one of these updates failed with 42703 "column users.coach_plan_source does
 * not exist". Found on the local stack 2026-10-12; mocked tests cannot see it.
 */
const NOT_COMP_RETURNING = 'id, coach_plan_source';

function toRow(data: Record<string, unknown>): CoachPlanRow {
  return { ...(data as unknown as CoachPlanRow), coach_plan: getCoachPlan(data as { coach_plan?: string | null }) };
}

/** One user's full plan state. Service role. */
export async function fetchCoachPlanRow(service: SupabaseClient, userId: string): Promise<DalResult<CoachPlanRow>> {
  try {
    const { data, error } = await service.from('users').select(ROW_COLUMNS).eq('id', userId).maybeSingle();
    if (error) {
      logError(error, { action: 'fetchCoachPlanRow', userId });
      return { success: false, error: error.message };
    }
    if (!data) return { success: false, error: 'user_not_found' };
    return { success: true, data: toRow(data as Record<string, unknown>) };
  } catch (error) {
    logError(error, { action: 'fetchCoachPlanRow', userId });
    return { success: false, error: 'Failed to read coach plan' };
  }
}

/** The user holding a coach-plan Stripe customer (unique, migration 231). Service role. */
export async function findUserByCoachPlanCustomer(
  service: SupabaseClient,
  customerId: string
): Promise<DalResult<CoachPlanRow | null>> {
  try {
    const { data, error } = await service
      .from('users')
      .select(ROW_COLUMNS)
      .eq('coach_plan_stripe_customer_id', customerId)
      .maybeSingle();
    if (error) {
      logError(error, { action: 'findUserByCoachPlanCustomer', customerId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data ? toRow(data as Record<string, unknown>) : null };
  } catch (error) {
    logError(error, { action: 'findUserByCoachPlanCustomer', customerId });
    return { success: false, error: 'Failed to look up coach plan customer' };
  }
}

/** Remember the coach-plan Stripe customer on the user. Service role. */
export async function setCoachPlanCustomerId(
  service: SupabaseClient,
  userId: string,
  customerId: string
): Promise<DalResult<null>> {
  try {
    const { data, error } = await service
      .from('users')
      .update({ coach_plan_stripe_customer_id: customerId })
      .eq('id', userId)
      .select('id');
    if (error) {
      logError(error, { action: 'setCoachPlanCustomerId', userId });
      return { success: false, error: error.message };
    }
    if (!data || data.length === 0) return { success: false, error: 'no_rows_updated' };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'setCoachPlanCustomerId', userId });
    return { success: false, error: 'Failed to save Stripe customer' };
  }
}

export interface StripePlanUpdate {
  plan: PaidCoachPlan;
  status: Exclude<CoachPlanStatus, 'canceled'>;
  customerId: string;
  subscriptionId: string;
  currentPeriodEnd: string | null;
}

/**
 * Set a paid plan from Stripe (checkout completed, subscription updated).
 * Returns 'skipped_comp' when the row is a comp, which a webhook never changes.
 */
export async function applyStripeCoachPlan(
  service: SupabaseClient,
  userId: string,
  update: StripePlanUpdate
): Promise<DalResult<'updated' | 'skipped_comp'>> {
  try {
    const { data, error } = await service
      .from('users')
      .update({
        coach_plan: update.plan,
        coach_plan_status: update.status,
        coach_plan_source: 'stripe',
        coach_plan_stripe_customer_id: update.customerId,
        coach_plan_stripe_subscription_id: update.subscriptionId,
        coach_plan_current_period_end: update.currentPeriodEnd,
      })
      .eq('id', userId)
      .or(NOT_COMP)
      .select(NOT_COMP_RETURNING);
    if (error) {
      logError(error, { action: 'applyStripeCoachPlan', userId, subscriptionId: update.subscriptionId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data && data.length > 0 ? 'updated' : 'skipped_comp' };
  } catch (error) {
    logError(error, { action: 'applyStripeCoachPlan', userId });
    return { success: false, error: 'Failed to apply coach plan' };
  }
}

/** invoice.payment_failed: past_due on the subscription the row holds. Never a comp. */
export async function markCoachPlanPastDue(
  service: SupabaseClient,
  userId: string,
  subscriptionId: string
): Promise<DalResult<'updated' | 'not_applicable'>> {
  try {
    const { data, error } = await service
      .from('users')
      .update({ coach_plan_status: 'past_due' })
      .eq('id', userId)
      .eq('coach_plan_stripe_subscription_id', subscriptionId)
      .neq('coach_plan', 'basico')
      .or(NOT_COMP)
      .select(NOT_COMP_RETURNING);
    if (error) {
      logError(error, { action: 'markCoachPlanPastDue', userId, subscriptionId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data && data.length > 0 ? 'updated' : 'not_applicable' };
  } catch (error) {
    logError(error, { action: 'markCoachPlanPastDue', userId });
    return { success: false, error: 'Failed to mark past due' };
  }
}

/** Subscription ended: back to basico, status canceled. Only for the subscription held. Never a comp. */
export async function cancelStripeCoachPlan(
  service: SupabaseClient,
  userId: string,
  subscriptionId: string
): Promise<DalResult<'updated' | 'not_applicable'>> {
  try {
    const { data, error } = await service
      .from('users')
      .update({ coach_plan: 'basico', coach_plan_status: 'canceled', coach_plan_current_period_end: null })
      .eq('id', userId)
      .eq('coach_plan_stripe_subscription_id', subscriptionId)
      .or(NOT_COMP)
      .select(NOT_COMP_RETURNING);
    if (error) {
      logError(error, { action: 'cancelStripeCoachPlan', userId, subscriptionId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data && data.length > 0 ? 'updated' : 'not_applicable' };
  } catch (error) {
    logError(error, { action: 'cancelStripeCoachPlan', userId });
    return { success: false, error: 'Failed to cancel coach plan' };
  }
}

/**
 * Admin comp. Refused while the user pays through Stripe (they would be billed
 * for a plan the comp overrides); they cancel in the portal first.
 */
export async function grantCoachPlanComp(
  service: SupabaseClient,
  userId: string,
  plan: CompCoachPlan,
  grantedBy: string
): Promise<DalResult<CoachPlanRow>> {
  try {
    const current = await fetchCoachPlanRow(service, userId);
    if (!current.success || !current.data) return { success: false, error: current.error ?? 'user_not_found' };
    const row = current.data;
    if (row.coach_plan_source === 'stripe' && row.coach_plan !== 'basico' && row.coach_plan_status !== 'canceled') {
      return { success: false, error: 'has_stripe_subscription' };
    }
    const { data, error } = await service
      .from('users')
      .update({
        coach_plan: plan,
        coach_plan_status: 'active',
        coach_plan_source: 'comp',
        coach_plan_stripe_subscription_id: null,
        coach_plan_current_period_end: null,
        coach_plan_granted_by: grantedBy,
        coach_plan_granted_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select(ROW_COLUMNS)
      .maybeSingle();
    if (error) {
      logError(error, { action: 'grantCoachPlanComp', userId, plan });
      return { success: false, error: error.message };
    }
    if (!data) return { success: false, error: 'user_not_found' };
    return { success: true, data: toRow(data as Record<string, unknown>) };
  } catch (error) {
    logError(error, { action: 'grantCoachPlanComp', userId });
    return { success: false, error: 'Failed to grant coach plan' };
  }
}

/** Remove a comp. Only a comp: a Stripe plan is canceled in the portal, not here. */
export async function revokeCoachPlanComp(service: SupabaseClient, userId: string): Promise<DalResult<CoachPlanRow>> {
  try {
    const { data, error } = await service
      .from('users')
      .update({
        coach_plan: 'basico',
        coach_plan_status: null,
        coach_plan_source: null,
        coach_plan_granted_by: null,
        coach_plan_granted_at: null,
      })
      .eq('id', userId)
      .eq('coach_plan_source', 'comp')
      .select(ROW_COLUMNS)
      .maybeSingle();
    if (error) {
      logError(error, { action: 'revokeCoachPlanComp', userId });
      return { success: false, error: error.message };
    }
    if (!data) return { success: false, error: 'not_a_comp' };
    return { success: true, data: toRow(data as Record<string, unknown>) };
  } catch (error) {
    logError(error, { action: 'revokeCoachPlanComp', userId });
    return { success: false, error: 'Failed to remove coach plan' };
  }
}
