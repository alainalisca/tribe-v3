import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * T-PLAN1: the coach-plan branch inside the Stripe webhook route.
 *
 *   1. A coach-plan event is answered by handleCoachPlanEvent and never reaches
 *      the existing switch (no Tribe.OS sync, no finalize_payment).
 *   2. On a 500 from that branch, the event's dedup row is DELETED so Stripe's
 *      retry runs again; on a 200 it is kept.
 *   3. Any other event (handler returns null) runs exactly as before, and its
 *      dedup row is never touched, even when its own handler fails.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/payments/stripe', () => ({
  verifyStripeWebhookSignature: vi.fn(),
  mapStripeStatus: vi.fn(),
  getStripePaymentIntent: vi.fn(),
}));
vi.mock('@/lib/payments/notifyAfterFinalize', () => ({
  notifyAfterFinalize: vi.fn().mockResolvedValue(undefined),
  notifyTipReceived: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/dal/tribeOSSubscription', () => ({
  syncFromStripeSubscription: vi.fn(),
  clearTribeOSSubscription: vi.fn(),
}));
vi.mock('@/lib/dal/payments', () => ({ recordPaymentRefund: vi.fn() }));
vi.mock('@/lib/payments/coachPlanWebhook', () => ({ handleCoachPlanEvent: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

import { POST } from './route';
import { verifyStripeWebhookSignature } from '@/lib/payments/stripe';
import { syncFromStripeSubscription } from '@/lib/dal/tribeOSSubscription';
import { handleCoachPlanEvent } from '@/lib/payments/coachPlanWebhook';
import { createClient } from '@supabase/supabase-js';

function mockSupabase() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const eqEvent = vi.fn().mockResolvedValue({ error: null });
  const eqGateway = vi.fn().mockReturnValue({ eq: eqEvent });
  const del = vi.fn().mockReturnValue({ eq: eqGateway });
  const from = vi.fn().mockReturnValue({ insert, delete: del });
  return { client: { from, rpc: vi.fn() }, insert, del, eqGateway, eqEvent };
}

function request() {
  return new NextRequest('http://localhost/api/payment/webhook/stripe', {
    method: 'POST',
    body: '{}',
    headers: new Headers({ 'stripe-signature': 'ok' }),
  });
}

const subEvent = {
  id: 'evt_coach_1',
  type: 'customer.subscription.updated',
  data: {
    object: {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      metadata: { tribe_purpose: 'coach_plan' },
      items: { data: [{ price: { id: 'price_x' } }] },
    },
  },
};

let db: ReturnType<typeof mockSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  db = mockSupabase();
  vi.mocked(createClient).mockReturnValue(db.client as never);
  vi.mocked(verifyStripeWebhookSignature).mockReturnValue(subEvent as never);
});

describe('Stripe webhook: coach-plan branch', () => {
  it('answers a coach-plan event without reaching the Tribe.OS handler', async () => {
    vi.mocked(handleCoachPlanEvent).mockResolvedValue({ status: 200, body: { success: true, result: 'updated' } });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, result: 'updated' });
    expect(syncFromStripeSubscription).not.toHaveBeenCalled();
    expect(db.del).not.toHaveBeenCalled();
  });

  it('releases the dedup row on a 500 so the retry runs again', async () => {
    vi.mocked(handleCoachPlanEvent).mockResolvedValue({ status: 500, body: { error: 'coach_plan_sync_failed' } });
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(db.del).toHaveBeenCalledTimes(1);
    expect(db.eqGateway).toHaveBeenCalledWith('gateway', 'stripe');
    expect(db.eqEvent).toHaveBeenCalledWith('event_id', 'evt_coach_1');
  });

  it('leaves every other event to the existing switch, and never releases its dedup row', async () => {
    vi.mocked(handleCoachPlanEvent).mockResolvedValue(null);
    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      ...subEvent,
      data: { object: { ...subEvent.data.object, metadata: { tribe_purpose: 'tribe_os_subscription' } } },
    } as never);
    vi.mocked(syncFromStripeSubscription).mockResolvedValue({ success: false, error: 'db_down' });
    const res = await POST(request());
    expect(syncFromStripeSubscription).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    // The existing branch's 500 keeps the old behaviour (T-STRIPE-RETRY).
    expect(db.del).not.toHaveBeenCalled();
  });
});
