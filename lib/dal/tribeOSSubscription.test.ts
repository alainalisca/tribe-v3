/**
 * Tests for the Stripe-status → tribe_os_status mapper.
 *
 * The mapper is the contract between Stripe's subscription state
 * machine and our premium gate. A regression here silently grants or
 * revokes premium across the entire user base, so we pin every
 * Stripe status value we know about — and one we don't, to catch
 * future Stripe-side additions.
 *
 * The integration-shaped functions (syncFromStripeSubscription,
 * clearTribeOSSubscription) need a real Supabase mock and are tested
 * at the route level in app/api/payment/webhook/stripe/route.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { stripeStatusToTribeOSStatus } from './tribeOSSubscription';

describe('stripeStatusToTribeOSStatus', () => {
  // ── Premium-granting states ──────────────────────────────────────
  // These map to a non-null status that isTribeOSPremiumActive()
  // treats as live. A regression here that flips one of these to
  // null silently kicks the user off premium until the next webhook.

  it('active → active', () => {
    expect(stripeStatusToTribeOSStatus('active')).toBe('active');
  });

  it('trialing → trialing', () => {
    // trialing is a premium-active state — the user gets full
    // access during the trial. If this flips to null we revoke
    // the trial users mid-trial, which would be terrible.
    expect(stripeStatusToTribeOSStatus('trialing')).toBe('trialing');
  });

  // ── Premium-revoking states ──────────────────────────────────────
  // past_due closes the gate immediately. unpaid is collapsed onto
  // past_due (same operational meaning to us: failed invoice → no
  // access until paid). canceled is the explicit end-state.

  it('past_due → past_due', () => {
    expect(stripeStatusToTribeOSStatus('past_due')).toBe('past_due');
  });

  it('unpaid → past_due (collapsed; same operational effect)', () => {
    // The collapse is important: a future Stripe webhook ordering
    // change could put 'unpaid' before 'past_due', and we want
    // both to revoke access. Mapping them to the same internal
    // status guarantees that.
    expect(stripeStatusToTribeOSStatus('unpaid')).toBe('past_due');
  });

  it('canceled → canceled', () => {
    expect(stripeStatusToTribeOSStatus('canceled')).toBe('canceled');
  });

  it('paused → canceled (we treat pause as "no current access")', () => {
    // Stripe Pause Payment Collection puts the subscription in a
    // 'paused' state where invoices don't generate. From our view
    // that's "user has no current access" — we don't have a
    // separate Tribe.OS pause status, and re-using canceled
    // means the gate closes the same way.
    expect(stripeStatusToTribeOSStatus('paused')).toBe('canceled');
  });

  // ── Don't-grant states ───────────────────────────────────────────
  // incomplete and incomplete_expired are pre-confirmation states.
  // The user started Checkout but hasn't paid yet. Returning null
  // means "don't grant any tier" — the user stays on whatever they
  // were before. The webhook then quietly waits for the next status
  // (active or canceled) before granting/revoking.

  it('incomplete → null (do not grant access)', () => {
    expect(stripeStatusToTribeOSStatus('incomplete')).toBeNull();
  });

  it('incomplete_expired → null', () => {
    expect(stripeStatusToTribeOSStatus('incomplete_expired')).toBeNull();
  });

  it('unknown Stripe status → null (defensive default)', () => {
    // If Stripe adds a new status (e.g. 'paused_by_dispute' in some
    // future API version), we MUST default to not granting access
    // until a human reviews the new mapping. Mapping to a default
    // like 'active' would silently grant premium to users in
    // unknown states, which is much worse than briefly under-
    // granting.
    expect(stripeStatusToTribeOSStatus('paused_by_dispute_2027' as never)).toBeNull();
    expect(stripeStatusToTribeOSStatus('' as never)).toBeNull();
  });
});
