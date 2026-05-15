/**
 * Tests for isTribeOSPremiumActive — the gate function called by
 * requireTribeOSPremium() on every premium route invocation.
 *
 * This is THE security boundary for Tribe.OS. A regression that
 * accidentally returns true when it should return false silently
 * grants premium to non-paying users; the opposite silently kicks
 * paying users out. Every branch needs a pinned case.
 *
 * The matrix:
 *
 *   tribe_os_tier  | tribe_os_status | active?
 *   ───────────────┼─────────────────┼─────────
 *   null           | (any)           | false
 *   'solo'         | null            | true   (manual grant, no Stripe)
 *   'solo'         | 'active'        | true   (Stripe-billed, paid)
 *   'solo'         | 'trialing'      | true   (in trial)
 *   'solo'         | 'past_due'      | false  (failed invoice)
 *   'solo'         | 'canceled'      | false  (explicit cancel)
 *
 * Plus defensive cases: null/undefined user, missing fields.
 */

import { describe, it, expect } from 'vitest';
import { isTribeOSPremiumActive } from './tribeOSPremium';

describe('isTribeOSPremiumActive', () => {
  // ── Null/undefined inputs ────────────────────────────────────────

  it('returns false for null user (signed-out or row missing)', () => {
    expect(isTribeOSPremiumActive(null)).toBe(false);
  });

  it('returns false for undefined user', () => {
    expect(isTribeOSPremiumActive(undefined)).toBe(false);
  });

  it('returns false for empty user object (no fields)', () => {
    expect(isTribeOSPremiumActive({})).toBe(false);
  });

  // ── No tier ─────────────────────────────────────────────────────
  // Without a tier the user has never been granted Tribe.OS — gate
  // closed regardless of status.

  it('returns false when tier is null (never granted)', () => {
    expect(isTribeOSPremiumActive({ tribe_os_tier: null, tribe_os_status: null })).toBe(false);
  });

  it('returns false when tier is null even if status looks active', () => {
    // Defense in depth: a stale Stripe sync that left status without
    // a tier must not grant access.
    expect(isTribeOSPremiumActive({ tribe_os_tier: null, tribe_os_status: 'active' })).toBe(false);
  });

  // ── Granted, status NULL (manual grant) ──────────────────────────
  // Design partners + CLI grants leave status NULL. The gate must
  // grant access — these are paying-equivalent users.

  it('grants access for tier=solo with status=null (manual grant)', () => {
    expect(isTribeOSPremiumActive({ tribe_os_tier: 'solo', tribe_os_status: null })).toBe(true);
  });

  it('grants access for tier=team_studio with status=null', () => {
    expect(isTribeOSPremiumActive({ tribe_os_tier: 'team_studio', tribe_os_status: null })).toBe(true);
  });

  it('grants access when tribe_os_status is undefined (treated as null)', () => {
    // The route layer reads from a users-row that might not include
    // the status column. Defensive default: missing → null.
    expect(isTribeOSPremiumActive({ tribe_os_tier: 'solo' })).toBe(true);
  });

  // ── Stripe-billed, status='active' / 'trialing' ─────────────────

  it("grants access for status='active' (Stripe-billed, paid invoice)", () => {
    expect(isTribeOSPremiumActive({ tribe_os_tier: 'solo', tribe_os_status: 'active' })).toBe(true);
  });

  it("grants access for status='trialing' (mid-trial, premium-active)", () => {
    // CRITICAL: trialing users have full access. If this flips to
    // false, every trial user gets kicked off mid-trial — devastating
    // for conversion.
    expect(isTribeOSPremiumActive({ tribe_os_tier: 'solo', tribe_os_status: 'trialing' })).toBe(true);
  });

  // ── Gate-closing statuses ────────────────────────────────────────

  it("denies access for status='past_due' (failed invoice)", () => {
    // CRITICAL: past_due means the latest invoice failed. Gate
    // closes immediately. Coaches who fix payment can refresh and
    // get back in once Stripe → webhook → status moves back to
    // 'active'.
    expect(isTribeOSPremiumActive({ tribe_os_tier: 'solo', tribe_os_status: 'past_due' })).toBe(false);
  });

  it("denies access for status='canceled' (explicit end-state)", () => {
    expect(isTribeOSPremiumActive({ tribe_os_tier: 'solo', tribe_os_status: 'canceled' })).toBe(false);
  });
});
