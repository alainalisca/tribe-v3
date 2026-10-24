// @vitest-environment node
/**
 * T-PLAN1: deleting a paying coach, end to end, on the LOCAL stack and Stripe
 * TEST mode. A Pro coach with a real (test-mode) Stripe subscription is
 * seeded, deleteAccount runs with the service role, and then:
 *   - Stripe says the subscription is canceled, with no invoice after the
 *     first and no pending proration item (cancel_plan: now, prorate false,
 *     invoice_now false);
 *   - the users row reads basico with every coach_plan_* column NULL (232's
 *     account_scrub), and the login is gone.
 *
 * Needs 231 and 232 applied to the local stack, and STRIPE_SECRET_KEY set to a
 * sk_test_ key (from the environment or .env.av.local). It refuses anything
 * but a 127.0.0.1 / localhost database and a test key. Skipped unless
 * TPLAN1_DELETE_LOCAL=1:
 *
 *   TPLAN1_DELETE_LOCAL=1 npx vitest run lib/account/deleteAccount.coachPlan.local.test.ts
 *
 * Leaves the test-mode Stripe customer and product in place (tagged
 * tribe_purpose: coach_plan_e2e_test) so the cancel can be seen in the
 * dashboard; deletes its users row afterwards.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { deleteAccount } from './deleteAccount';

const ENABLED = process.env.TPLAN1_DELETE_LOCAL === '1';

function localEnv(): { url: string; key: string; stripeKey: string } {
  const file = path.resolve(__dirname, '..', '..', '.env.av.local');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const get = (k: string) =>
    process.env[k] ?? (new RegExp(`^${k}=(.*)$`, 'm').exec(text)?.[1] ?? '').replace(/^"|"$/g, '');
  const url = get('NEXT_PUBLIC_SUPABASE_URL');
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error(`refusing to run against ${url}: the local stack only`);
  }
  const stripeKey = get('STRIPE_SECRET_KEY');
  if (!stripeKey.startsWith('sk_test_')) throw new Error('refusing: STRIPE_SECRET_KEY is not a test-mode key');
  return { url, key: get('SUPABASE_SERVICE_ROLE_KEY'), stripeKey };
}

describe.skipIf(!ENABLED)('deleteAccount: a paying coach (T-PLAN1, local stack + Stripe test mode)', () => {
  let db: SupabaseClient;
  let stripe: Stripe;
  let userId = '';
  let customerId = '';
  let subscriptionId = '';
  let firstInvoiceId = '';
  const email = `tplan1-e2e-${Date.now()}@example.test`;

  beforeAll(async () => {
    const env = localEnv();
    process.env.STRIPE_SECRET_KEY = env.stripeKey; // getStripeInstance reads it on first use
    db = createClient(env.url, env.key, { auth: { persistSession: false } });
    stripe = new Stripe(env.stripeKey, { apiVersion: '2024-06-20' });

    const { data: created, error: authErr } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (authErr || !created.user) throw new Error(`createUser: ${authErr?.message}`);
    userId = created.user.id;
    // The local stack has no on_auth_user_created trigger; production does.
    const { error: profileErr } = await db
      .from('users')
      .upsert({ id: userId, email, name: 'TPLAN1 E2E Pro coach', is_instructor: true });
    if (profileErr) throw new Error(`profile: ${profileErr.message}`);

    const metadata = { tribe_user_id: userId, tribe_purpose: 'coach_plan_e2e_test', coach_plan: 'pro' };
    const product = await stripe.products.create({ name: 'TPLAN1 E2E test (Coach Pro)', metadata });
    const customer = await stripe.customers.create({
      email,
      metadata,
      payment_method: 'pm_card_visa',
      invoice_settings: { default_payment_method: 'pm_card_visa' },
    });
    customerId = customer.id;
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price_data: {
            currency: 'cop',
            product: product.id,
            unit_amount: 8900000, // 89.000 COP, two-decimal
            recurring: { interval: 'month' },
          },
        },
      ],
      metadata,
    });
    expect(sub.status).toBe('active');
    subscriptionId = sub.id;
    firstInvoiceId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : (sub.latest_invoice?.id ?? '');

    // What the webhook writes on customer.subscription.created (service role).
    const { error: planErr } = await db
      .from('users')
      .update({
        coach_plan: 'pro',
        coach_plan_status: 'active',
        coach_plan_source: 'stripe',
        coach_plan_stripe_customer_id: customerId,
        coach_plan_stripe_subscription_id: subscriptionId,
        coach_plan_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      })
      .eq('id', userId);
    if (planErr) throw new Error(`plan: ${planErr.message}`);
  }, 60_000);

  afterAll(async () => {
    if (db && userId) await db.from('users').delete().eq('id', userId);
    // eslint-disable-next-line no-console
    console.log(`Stripe test mode: customer ${customerId}, subscription ${subscriptionId}`);
  });

  it('cancels the subscription in Stripe, then clears every coach_plan column', async () => {
    const result = await deleteAccount(db, userId);
    expect(result).toMatchObject({ ok: true });

    // Stripe: canceled now, nothing billed after the first invoice, no proration.
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    expect(sub.status).toBe('canceled');
    expect(sub.canceled_at).not.toBeNull();
    const invoices = await stripe.invoices.list({ subscription: subscriptionId, limit: 10 });
    expect(invoices.data.map((i) => i.id)).toEqual([firstInvoiceId]);
    const pending = await stripe.invoiceItems.list({ customer: customerId, pending: true, limit: 10 });
    expect(pending.data).toEqual([]);

    // The row: basico, every coach_plan_* NULL, and the rest of the scrub.
    const { data: row, error } = await db
      .from('users')
      .select(
        'name, coach_plan, coach_plan_status, coach_plan_source, coach_plan_stripe_customer_id, coach_plan_stripe_subscription_id, coach_plan_current_period_end, coach_plan_granted_by, coach_plan_granted_at'
      )
      .eq('id', userId)
      .single();
    expect(error).toBeNull();
    expect(row).toEqual({
      name: 'Usuario eliminado',
      coach_plan: 'basico',
      coach_plan_status: null,
      coach_plan_source: null,
      coach_plan_stripe_customer_id: null,
      coach_plan_stripe_subscription_id: null,
      coach_plan_current_period_end: null,
      coach_plan_granted_by: null,
      coach_plan_granted_at: null,
    });

    // The login is gone.
    const { data: login } = await db.auth.admin.getUserById(userId);
    expect(login.user).toBeNull();
  }, 60_000);

  it('running the deletion again on the scrubbed row finishes again, with no Stripe call left to make', async () => {
    // The login is gone and the row is scrubbed; deleteAccount still finds the
    // row, sees no subscription id (232 cleared it), so it never calls Stripe.
    const again = await deleteAccount(db, userId);
    expect(again).toMatchObject({ ok: true });
  }, 60_000);
});
