import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

import { applyStripeCoachPlan, cancelStripeCoachPlan, markCoachPlanPastDue } from './coachPlans';

/**
 * PostgREST applies an or= filter to the RETURNING rows too, so an update
 * filtered on coach_plan_source must return that column. With select('id')
 * every one of these failed on the local stack with 42703 (2026-10-12).
 */
function capture() {
  const calls: { or: string[]; select: string[] } = { or: [], select: [] };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    update: self,
    eq: self,
    neq: self,
    or: (f: string) => (calls.or.push(f), chain),
    select: (cols: string) => {
      calls.select.push(cols);
      return Promise.resolve({ data: [{ id: 'u1' }], error: null });
    },
  });
  return { client: { from: () => chain } as unknown as SupabaseClient, calls };
}

describe('webhook writes that must never touch a comp', () => {
  it.each([
    [
      'applyStripeCoachPlan',
      (c: SupabaseClient) =>
        applyStripeCoachPlan(c, 'u1', {
          plan: 'pro',
          status: 'active',
          customerId: 'cus',
          subscriptionId: 'sub',
          currentPeriodEnd: null,
        }),
    ],
    ['markCoachPlanPastDue', (c: SupabaseClient) => markCoachPlanPastDue(c, 'u1', 'sub')],
    ['cancelStripeCoachPlan', (c: SupabaseClient) => cancelStripeCoachPlan(c, 'u1', 'sub')],
  ])('%s filters out comps and returns the column the filter names', async (_name, run) => {
    const { client, calls } = capture();
    const res = await run(client);
    expect(res.success).toBe(true);
    expect(calls.or).toEqual(['coach_plan_source.is.null,coach_plan_source.eq.stripe']);
    expect(calls.select[0]).toContain('coach_plan_source');
  });
});
