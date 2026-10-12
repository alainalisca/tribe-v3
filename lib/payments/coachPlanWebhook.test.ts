import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/dal/coachPlans', () => ({
  applyStripeCoachPlan: vi.fn(),
  cancelStripeCoachPlan: vi.fn(),
  fetchCoachPlanRow: vi.fn(),
  findUserByCoachPlanCustomer: vi.fn(),
  markCoachPlanPastDue: vi.fn(),
}));
vi.mock('./coachPlanStripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./coachPlanStripe')>();
  return { ...actual, retrieveCoachPlanSubscription: vi.fn() };
});

import { handleCoachPlanEvent, mapStripeStatus } from './coachPlanWebhook';
import { readCoachPlanSubscription, retrieveCoachPlanSubscription } from './coachPlanStripe';
import {
  applyStripeCoachPlan,
  cancelStripeCoachPlan,
  fetchCoachPlanRow,
  findUserByCoachPlanCustomer,
  markCoachPlanPastDue,
} from '@/lib/dal/coachPlans';

const service = {} as SupabaseClient;
const USER = '11111111-1111-4111-8111-111111111111';
const META = { tribe_purpose: 'coach_plan', tribe_user_id: USER, coach_plan: 'pro' };
const END = 1793000000; // seconds

function rawSub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    metadata: META,
    current_period_end: END,
    items: { data: [{ price: { id: 'price_pro' } }] },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_COACH_PRO_PRICE_ID', 'price_pro');
  vi.stubEnv('STRIPE_CRECIMIENTO_PRICE_ID', 'price_crec');
  vi.mocked(fetchCoachPlanRow).mockResolvedValue({
    success: true,
    data: { id: USER, coach_plan_stripe_customer_id: 'cus_1' } as never,
  });
  vi.mocked(applyStripeCoachPlan).mockResolvedValue({ success: true, data: 'updated' });
  vi.mocked(cancelStripeCoachPlan).mockResolvedValue({ success: true, data: 'updated' });
  vi.mocked(markCoachPlanPastDue).mockResolvedValue({ success: true, data: 'updated' });
});

describe('events that are not coach plans pass through untouched', () => {
  it.each([
    ['checkout.session.completed', { mode: 'payment', metadata: { tribe_session_id: 's1' } }],
    ['checkout.session.completed', { mode: 'subscription', metadata: {} }],
    ['customer.subscription.updated', rawSub({ metadata: { tribe_purpose: 'tribe_os_subscription' } })],
    ['customer.subscription.deleted', rawSub({ metadata: {} })],
    ['invoice.payment_failed', { subscription: 'sub_x', subscription_details: { metadata: {} } }],
    ['payment_intent.succeeded', { id: 'pi_1' }],
    ['charge.refunded', { id: 'ch_1' }],
  ])('%s returns null', async (type, object) => {
    expect(await handleCoachPlanEvent(service, { type, data: { object } })).toBeNull();
    expect(applyStripeCoachPlan).not.toHaveBeenCalled();
    expect(cancelStripeCoachPlan).not.toHaveBeenCalled();
    expect(markCoachPlanPastDue).not.toHaveBeenCalled();
  });
});

describe('checkout.session.completed for a coach plan', () => {
  it('reads the subscription and sets plan, active, stripe ids and period end', async () => {
    vi.mocked(retrieveCoachPlanSubscription).mockResolvedValue(readCoachPlanSubscription(rawSub()));
    const res = await handleCoachPlanEvent(service, {
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', subscription: 'sub_1', metadata: META } },
    });
    expect(res?.status).toBe(200);
    expect(applyStripeCoachPlan).toHaveBeenCalledWith(service, USER, {
      plan: 'pro',
      status: 'active',
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      currentPeriodEnd: new Date(END * 1000).toISOString(),
    });
  });

  it('500s when Stripe cannot be read, so the route releases the event for a retry', async () => {
    vi.mocked(retrieveCoachPlanSubscription).mockResolvedValue(null);
    const res = await handleCoachPlanEvent(service, {
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', subscription: 'sub_1', metadata: META } },
    });
    expect(res?.status).toBe(500);
  });
});

describe('customer.subscription.*', () => {
  it('maps past_due and unpaid to past_due', async () => {
    await handleCoachPlanEvent(service, {
      type: 'customer.subscription.updated',
      data: { object: rawSub({ status: 'unpaid' }) },
    });
    expect(vi.mocked(applyStripeCoachPlan).mock.calls[0][2].status).toBe('past_due');
  });

  it('crecimiento comes from its price id', async () => {
    await handleCoachPlanEvent(service, {
      type: 'customer.subscription.created',
      data: { object: rawSub({ items: { data: [{ price: { id: 'price_crec' } }] } }) },
    });
    expect(vi.mocked(applyStripeCoachPlan).mock.calls[0][2].plan).toBe('crecimiento');
  });

  it('deleted goes back to basico through cancel, for that subscription only', async () => {
    const res = await handleCoachPlanEvent(service, {
      type: 'customer.subscription.deleted',
      data: { object: rawSub() },
    });
    expect(res?.status).toBe(200);
    expect(cancelStripeCoachPlan).toHaveBeenCalledWith(service, USER, 'sub_1');
    expect(applyStripeCoachPlan).not.toHaveBeenCalled();
  });

  it('an incomplete subscription (not paid yet) changes nothing', async () => {
    const res = await handleCoachPlanEvent(service, {
      type: 'customer.subscription.updated',
      data: { object: rawSub({ status: 'incomplete' }) },
    });
    expect(res?.status).toBe(200);
    expect(applyStripeCoachPlan).not.toHaveBeenCalled();
  });

  it('a comp is never changed: the DAL reports skipped_comp and the event is still acknowledged', async () => {
    vi.mocked(applyStripeCoachPlan).mockResolvedValue({ success: true, data: 'skipped_comp' });
    const res = await handleCoachPlanEvent(service, {
      type: 'customer.subscription.updated',
      data: { object: rawSub() },
    });
    expect(res).toEqual({ status: 200, body: { success: true, userId: USER, result: 'skipped_comp' } });
  });

  it('refuses a subscription whose customer is not the one the user holds', async () => {
    vi.mocked(fetchCoachPlanRow).mockResolvedValue({
      success: true,
      data: { id: USER, coach_plan_stripe_customer_id: 'cus_OTHER' } as never,
    });
    vi.mocked(findUserByCoachPlanCustomer).mockResolvedValue({ success: true, data: null });
    const res = await handleCoachPlanEvent(service, {
      type: 'customer.subscription.updated',
      data: { object: rawSub() },
    });
    expect(res?.status).toBe(200);
    expect(res?.body.ignored).toBe('user_not_found');
    expect(applyStripeCoachPlan).not.toHaveBeenCalled();
  });

  it('a database failure is a 500', async () => {
    vi.mocked(applyStripeCoachPlan).mockResolvedValue({ success: false, error: 'boom' });
    const res = await handleCoachPlanEvent(service, {
      type: 'customer.subscription.updated',
      data: { object: rawSub() },
    });
    expect(res?.status).toBe(500);
  });
});

describe('invoice.payment_failed', () => {
  it('marks past_due (2024-06-20 invoice shape)', async () => {
    const res = await handleCoachPlanEvent(service, {
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_1', subscription_details: { metadata: META } } },
    });
    expect(res?.status).toBe(200);
    expect(markCoachPlanPastDue).toHaveBeenCalledWith(service, USER, 'sub_1');
  });

  it('marks past_due (newer invoice.parent shape)', async () => {
    await handleCoachPlanEvent(service, {
      type: 'invoice.payment_failed',
      data: { object: { parent: { subscription_details: { subscription: 'sub_1', metadata: META } } } },
    });
    expect(markCoachPlanPastDue).toHaveBeenCalledWith(service, USER, 'sub_1');
  });
});

describe('helpers', () => {
  it('mapStripeStatus', () => {
    expect(mapStripeStatus('trialing')).toBe('active');
    expect(mapStripeStatus('incomplete_expired')).toBe('canceled');
    expect(mapStripeStatus('paused')).toBeNull();
  });

  it('reads current_period_end from the item on newer API versions', () => {
    const sub = readCoachPlanSubscription(
      rawSub({
        current_period_end: undefined,
        items: { data: [{ price: { id: 'price_pro' }, current_period_end: END }] },
      })
    );
    expect(sub?.currentPeriodEnd).toBe(new Date(END * 1000).toISOString());
  });
});
