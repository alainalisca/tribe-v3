import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T-PLAN1: ending a coach's plan when their account is deleted. Immediate, no
 * proration, no final invoice; a rerun after it already ended is done, not an
 * error; any other Stripe refusal is returned so the deletion stops.
 */
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
const stripe = vi.hoisted(() => ({ retrieve: vi.fn(), cancel: vi.fn() }));
vi.mock('./stripe', () => ({
  getStripeInstance: () => ({ subscriptions: { retrieve: stripe.retrieve, cancel: stripe.cancel } }),
}));

import { cancelCoachPlanSubscriptionNow } from './coachPlanStripe';

beforeEach(() => vi.clearAllMocks());

describe('cancelCoachPlanSubscriptionNow', () => {
  it.each(['active', 'past_due', 'trialing', 'unpaid'])(
    'cancels a %s subscription now, with no proration and no final invoice',
    async (status) => {
      stripe.retrieve.mockResolvedValue({ id: 'sub_1', status });
      stripe.cancel.mockResolvedValue({ id: 'sub_1', status: 'canceled' });
      expect(await cancelCoachPlanSubscriptionNow('sub_1')).toEqual({ success: true, alreadyGone: false });
      expect(stripe.cancel).toHaveBeenCalledWith('sub_1', { prorate: false, invoice_now: false });
    }
  );

  it.each(['canceled', 'incomplete_expired'])('a %s subscription is already done: no second cancel', async (status) => {
    stripe.retrieve.mockResolvedValue({ id: 'sub_1', status });
    expect(await cancelCoachPlanSubscriptionNow('sub_1')).toEqual({ success: true, alreadyGone: true });
    expect(stripe.cancel).not.toHaveBeenCalled();
  });

  it('a subscription Stripe does not have (resource_missing) has nothing left to bill', async () => {
    stripe.retrieve.mockRejectedValue(Object.assign(new Error('No such subscription'), { code: 'resource_missing' }));
    expect(await cancelCoachPlanSubscriptionNow('sub_x')).toEqual({ success: true, alreadyGone: true });
  });

  it('any other refusal is an error, so the deletion stops', async () => {
    stripe.retrieve.mockResolvedValue({ id: 'sub_1', status: 'active' });
    stripe.cancel.mockRejectedValue(Object.assign(new Error('rate limited'), { code: 'rate_limit' }));
    expect(await cancelCoachPlanSubscriptionNow('sub_1')).toEqual({ success: false, error: 'rate limited' });
  });
});
