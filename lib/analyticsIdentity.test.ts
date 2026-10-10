/**
 * T-ANALYTICS1 part B: from a Supabase user to PostHog's identify and
 * signup_completed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const fetchAnalyticsIdentityFacts = vi.fn();
vi.mock('@/lib/dal/analyticsIdentity', () => ({
  fetchAnalyticsIdentityFacts: (...a: unknown[]) => fetchAnalyticsIdentityFacts(...a),
}));

const identifyUser = vi.fn();
const trackEvent = vi.fn();
vi.mock('@/lib/analytics', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/analytics')>();
  return {
    roleFor: real.roleFor,
    identifyUser: (...a: unknown[]) => identifyUser(...a),
    trackEvent: (...a: unknown[]) => trackEvent(...a),
  };
});

import {
  SIGNUP_COMPLETED_WINDOW_MS,
  identifyCurrentUser,
  personPropertiesFor,
  recordSignupCompleted,
  signupDateOf,
  signupMethodOf,
} from './analyticsIdentity';

const supabase = {} as SupabaseClient;
const CREATED = '2026-10-10T10:00:00.000Z';
const user = { id: 'u1', created_at: CREATED, app_metadata: { provider: 'google' } };
const facts = (over: Record<string, unknown> = {}) => ({
  success: true,
  data: { isAdmin: false, ownsPartner: false, isInstructor: false, preferredLanguage: 'es', ...over },
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchAnalyticsIdentityFacts.mockResolvedValue(facts());
});

describe('signupMethodOf', () => {
  it.each([
    ['google', 'google'],
    ['apple', 'apple'],
    ['email', 'email'],
    [undefined, 'email'],
    ['twitter', 'email'],
  ])('provider %s -> %s', (provider, method) => {
    expect(signupMethodOf({ app_metadata: { provider } } as never)).toBe(method);
  });
});

describe('signupDateOf', () => {
  it('keeps the day only', () => {
    expect(signupDateOf('2026-10-09T18:03:11.123456+00:00')).toBe('2026-10-09');
  });
  it('is null for a missing or malformed value', () => {
    expect(signupDateOf(undefined)).toBeNull();
    expect(signupDateOf('yesterday')).toBeNull();
  });
});

describe('personPropertiesFor', () => {
  it('builds the four properties from the facts and the auth user', async () => {
    fetchAnalyticsIdentityFacts.mockResolvedValue(facts({ isAdmin: true, preferredLanguage: 'en' }));
    expect(await personPropertiesFor(supabase, user)).toEqual({
      role: 'admin',
      preferred_language: 'en',
      is_internal: true,
      signup_date: '2026-10-10',
    });
  });

  it('a language outside en/es is reported as null, not passed through', async () => {
    fetchAnalyticsIdentityFacts.mockResolvedValue(facts({ preferredLanguage: 'fr' }));
    expect((await personPropertiesFor(supabase, user))?.preferred_language).toBeNull();
  });

  it('is null when the facts cannot be read', async () => {
    fetchAnalyticsIdentityFacts.mockResolvedValue({ success: false, error: 'boom' });
    expect(await personPropertiesFor(supabase, user)).toBeNull();
  });
});

describe('identifyCurrentUser', () => {
  it('identifies the user with their properties', async () => {
    expect(await identifyCurrentUser(supabase, user)).toBe(true);
    expect(identifyUser).toHaveBeenCalledWith('u1', expect.objectContaining({ role: 'athlete' }));
  });

  it('does not identify a user who signed out while the facts were loading', async () => {
    expect(await identifyCurrentUser(supabase, user, () => false)).toBe(false);
    expect(identifyUser).not.toHaveBeenCalled();
  });
});

describe('recordSignupCompleted', () => {
  const justNow = Date.parse(CREATED) + 5 * 60 * 1000;

  it('re-identifies with the chosen role, then fires signup_completed with method and role', async () => {
    await recordSignupCompleted(supabase, user, 'gym', justNow);
    // gym, although the facts (no featured_partners row yet) say athlete
    expect(identifyUser).toHaveBeenCalledWith('u1', expect.objectContaining({ role: 'gym' }));
    expect(trackEvent).toHaveBeenCalledWith('signup_completed', { method: 'google', role: 'gym' });
    expect(identifyUser.mock.invocationCallOrder[0]).toBeLessThan(trackEvent.mock.invocationCallOrder[0]);
  });

  it('carries the method from app_metadata.provider', async () => {
    await recordSignupCompleted(supabase, { ...user, app_metadata: { provider: 'apple' } }, 'athlete', justNow);
    expect(trackEvent).toHaveBeenCalledWith('signup_completed', { method: 'apple', role: 'athlete' });
  });

  it('an admin stays admin in the person properties', async () => {
    fetchAnalyticsIdentityFacts.mockResolvedValue(facts({ isAdmin: true }));
    await recordSignupCompleted(supabase, user, 'instructor', justNow);
    expect(identifyUser).toHaveBeenCalledWith('u1', expect.objectContaining({ role: 'admin' }));
  });

  it('does not count an account older than the window as a new signup', async () => {
    await recordSignupCompleted(supabase, user, 'athlete', Date.parse(CREATED) + SIGNUP_COMPLETED_WINDOW_MS + 1);
    expect(trackEvent).not.toHaveBeenCalled();
    // ...but still updates who they are.
    expect(identifyUser).toHaveBeenCalled();
  });
});
