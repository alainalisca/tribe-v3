/**
 * T-PLAN1: the coach-plan branch of the Stripe webhook.
 *
 * Called by app/api/payment/webhook/stripe/route.ts BEFORE its existing
 * switch. It claims an event only when the event is about a coach plan
 * (tribe_purpose = 'coach_plan' on the checkout session, the subscription, or
 * the invoice's subscription) and returns null for everything else, so session
 * payments, tips, refunds, Connect and Tribe.OS events reach their handlers
 * exactly as before.
 *
 * Why it must run first: the Tribe.OS handlers for customer.subscription.*
 * route by customer id alone. Coach plans use their own Stripe customer, so a
 * coach-plan event would only be "ignored" there, but intercepting it here
 * means a coach-plan event never reaches Tribe.OS code at all.
 *
 * Result: { status, body }. status 500 tells the route to release the event's
 * dedup row so Stripe's retry runs again (see T-STRIPE-RETRY for the same gap
 * on the existing branches, which this ticket deliberately does not change).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';
import { COACH_PLAN_PURPOSE, readCoachPlanSubscription, retrieveCoachPlanSubscription } from './coachPlanStripe';
import type { CoachPlanSubscription } from './coachPlanStripe';
import {
  applyStripeCoachPlan,
  cancelStripeCoachPlan,
  fetchCoachPlanRow,
  findUserByCoachPlanCustomer,
  markCoachPlanPastDue,
} from '@/lib/dal/coachPlans';
import { coachPlanForPriceId, isPaidCoachPlan, type PaidCoachPlan } from '@/lib/subscription/coachPlans';

export interface CoachPlanWebhookResult {
  status: 200 | 500;
  body: Record<string, unknown>;
}

interface StripeEventLike {
  id?: string;
  type: string;
  data: { object: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function metadataOf(value: unknown): Record<string, unknown> {
  return isRecord(value) && isRecord(value.metadata) ? value.metadata : {};
}

function isCoachPlanMetadata(meta: Record<string, unknown>): boolean {
  return meta.tribe_purpose === COACH_PLAN_PURPOSE;
}

const ok = (body: Record<string, unknown>): CoachPlanWebhookResult => ({
  status: 200,
  body: { success: true, ...body },
});
const fail = (error: string): CoachPlanWebhookResult => ({ status: 500, body: { error } });

/** Stripe subscription status -> what the row holds. null = nothing to write yet. */
export function mapStripeStatus(status: string): 'active' | 'past_due' | 'canceled' | null {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  return null; // 'incomplete', 'paused': not paid yet, change nothing
}

function planOf(sub: CoachPlanSubscription): PaidCoachPlan | null {
  return (
    coachPlanForPriceId(sub.priceId) ?? (isPaidCoachPlan(sub.metadata.coach_plan) ? sub.metadata.coach_plan : null)
  );
}

/**
 * Who the subscription belongs to: tribe_user_id from our own metadata, checked
 * against the customer when the row already holds one; otherwise by customer.
 */
async function resolveUserId(service: SupabaseClient, sub: CoachPlanSubscription): Promise<string | null> {
  const fromMeta = sub.metadata.tribe_user_id;
  if (fromMeta) {
    const row = await fetchCoachPlanRow(service, fromMeta);
    if (row.success && row.data) {
      const held = row.data.coach_plan_stripe_customer_id;
      if (!held || held === sub.customer) return fromMeta;
      log('warn', 'coach_plan_webhook_customer_mismatch', { userId: fromMeta, subscriptionId: sub.id });
      return null;
    }
  }
  const byCustomer = await findUserByCoachPlanCustomer(service, sub.customer);
  return byCustomer.success && byCustomer.data ? byCustomer.data.id : null;
}

async function syncSubscription(
  service: SupabaseClient,
  sub: CoachPlanSubscription,
  eventType: string
): Promise<CoachPlanWebhookResult> {
  const userId = await resolveUserId(service, sub);
  if (!userId) {
    log('warn', 'coach_plan_webhook_user_not_found', { subscriptionId: sub.id, eventType });
    return ok({ ignored: 'user_not_found' });
  }
  const mapped = eventType === 'customer.subscription.deleted' ? 'canceled' : mapStripeStatus(sub.status);
  if (mapped === null) return ok({ ignored: `status_${sub.status}` });

  if (mapped === 'canceled') {
    const res = await cancelStripeCoachPlan(service, userId, sub.id);
    if (!res.success) return fail('coach_plan_cancel_failed');
    return ok({ userId, result: res.data });
  }

  const plan = planOf(sub);
  if (!plan) {
    logError(new Error('coach_plan_unknown_price'), { action: 'coachPlanWebhook', subscriptionId: sub.id });
    return ok({ ignored: 'unknown_price' });
  }
  const res = await applyStripeCoachPlan(service, userId, {
    plan,
    status: mapped,
    customerId: sub.customer,
    subscriptionId: sub.id,
    currentPeriodEnd: sub.currentPeriodEnd,
  });
  if (!res.success) return fail('coach_plan_sync_failed');
  if (res.data === 'skipped_comp') log('info', 'coach_plan_webhook_skipped_comp', { userId, eventType });
  return ok({ userId, result: res.data });
}

/** The subscription id and metadata an invoice points at (2024-06-20 and newer shapes). */
function invoiceSubscription(invoice: unknown): { id: string | null; metadata: Record<string, unknown> } {
  if (!isRecord(invoice)) return { id: null, metadata: {} };
  const legacyId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
  const legacyMeta = isRecord(invoice.subscription_details) ? metadataOf(invoice.subscription_details) : {};
  const parent =
    isRecord(invoice.parent) && isRecord(invoice.parent.subscription_details)
      ? invoice.parent.subscription_details
      : null;
  const parentId = parent && typeof parent.subscription === 'string' ? parent.subscription : null;
  return {
    id: legacyId ?? parentId,
    metadata: Object.keys(legacyMeta).length > 0 ? legacyMeta : metadataOf(parent),
  };
}

/**
 * Handle the event if it is a coach-plan event. Returns null when it is not,
 * and the route carries on with its existing switch.
 */
export async function handleCoachPlanEvent(
  service: SupabaseClient,
  event: StripeEventLike
): Promise<CoachPlanWebhookResult | null> {
  const obj = event.data.object;
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        if (!isRecord(obj) || obj.mode !== 'subscription' || !isCoachPlanMetadata(metadataOf(obj))) return null;
        const subId = typeof obj.subscription === 'string' ? obj.subscription : null;
        if (!subId) return fail('coach_plan_checkout_without_subscription');
        const sub = await retrieveCoachPlanSubscription(subId);
        if (!sub) return fail('coach_plan_subscription_retrieve_failed');
        return await syncSubscription(service, sub, event.type);
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        if (!isCoachPlanMetadata(metadataOf(obj))) return null;
        const sub = readCoachPlanSubscription(obj);
        if (!sub) return fail('coach_plan_subscription_unreadable');
        return await syncSubscription(service, sub, event.type);
      }
      case 'invoice.payment_failed': {
        const { id: subId, metadata } = invoiceSubscription(obj);
        if (!isCoachPlanMetadata(metadata)) return null;
        if (!subId) return ok({ ignored: 'no_subscription' });
        const userId = typeof metadata.tribe_user_id === 'string' ? metadata.tribe_user_id : null;
        if (!userId) return ok({ ignored: 'user_not_found' });
        const res = await markCoachPlanPastDue(service, userId, subId);
        if (!res.success) return fail('coach_plan_past_due_failed');
        return ok({ userId, result: res.data });
      }
      default:
        return null;
    }
  } catch (error) {
    logError(error, { action: 'coachPlanWebhook', eventType: event.type, eventId: event.id });
    return fail('coach_plan_webhook_exception');
  }
}
