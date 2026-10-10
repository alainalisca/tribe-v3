/**
 * T-ANALYTICS1 part B: what identify() may send, and reset.
 *
 * The allowed-key assertion is the privacy gate in test form (Ley 1581, policy
 * v1.1): PostHog may hold role, preferred_language, is_internal and signup_date
 * and nothing else. It asserts the keys PostHog RECEIVED, through the real
 * withPostHog queue, not the keys a helper built: the old identifyUser built a
 * tidy object and still sent email and name.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const init = vi.fn();
const identify = vi.fn();
const reset = vi.fn();
const getProperty = vi.fn();
vi.mock('posthog-js', () => ({ default: { init, identify, reset, get_property: getProperty } }));

import { __resetPostHogForTests, initPostHog } from './posthog';
import {
  PERSON_PROPERTY_KEYS,
  identifyUser,
  resetUser,
  resetUserIfIdentified,
  roleFor,
  type AnalyticsPersonProperties,
} from './analytics';

const UUID = '6f1c2a9e-1b2c-4d5e-8f90-123456789abc';
const props: AnalyticsPersonProperties = {
  role: 'instructor',
  preferred_language: 'es',
  is_internal: false,
  signup_date: '2026-10-09',
};

beforeEach(() => {
  __resetPostHogForTests();
  vi.clearAllMocks();
});

describe('identifyUser', () => {
  it('sends the Supabase UUID as the distinct ID and exactly the allowed keys', async () => {
    identifyUser(UUID, props);
    await initPostHog();
    expect(identify).toHaveBeenCalledOnce();
    const [distinctId, sent] = identify.mock.calls[0];
    expect(distinctId).toBe(UUID);
    expect(Object.keys(sent).sort()).toEqual([...PERSON_PROPERTY_KEYS].sort());
    expect(sent).toEqual(props);
  });

  it('the allowed set is exactly the four the policy names', () => {
    expect([...PERSON_PROPERTY_KEYS].sort()).toEqual(['is_internal', 'preferred_language', 'role', 'signup_date']);
  });

  it('strips any extra key a caller smuggles in, PII above all', async () => {
    // A variable with extra fields satisfies the interface structurally, so the
    // type alone cannot stop this. The copy in identifyUser does.
    const wider = { ...props, email: 'ana@example.com', name: 'Ana', phone: '+57 300', city: 'Medellín' };
    identifyUser(UUID, wider);
    await initPostHog();
    const sent = identify.mock.calls[0][1];
    for (const pii of ['email', 'name', 'phone', 'city', 'neighborhood', 'whatsapp', 'birth_date']) {
      expect(sent).not.toHaveProperty(pii);
    }
  });

  it('with no facts, still links the device to the account, with no properties', async () => {
    identifyUser(UUID, null);
    await initPostHog();
    expect(identify).toHaveBeenCalledWith(UUID);
  });
});

describe('roleFor', () => {
  it('admin outranks everything, then gym, then instructor, else athlete', () => {
    expect(roleFor({ isAdmin: true, ownsPartner: true, isInstructor: true })).toBe('admin');
    expect(roleFor({ isAdmin: false, ownsPartner: true, isInstructor: true })).toBe('gym');
    expect(roleFor({ isAdmin: false, ownsPartner: false, isInstructor: true })).toBe('instructor');
    expect(roleFor({ isAdmin: false, ownsPartner: false, isInstructor: false })).toBe('athlete');
  });
});

describe('reset', () => {
  it('resetUser resets, even before posthog-js has loaded', async () => {
    resetUser();
    await initPostHog();
    expect(reset).toHaveBeenCalledOnce();
  });

  it('resetUserIfIdentified resets an identified device', async () => {
    getProperty.mockReturnValue('identified');
    resetUserIfIdentified();
    await initPostHog();
    expect(getProperty).toHaveBeenCalledWith('$user_state');
    expect(reset).toHaveBeenCalledOnce();
  });

  it('resetUserIfIdentified leaves an already-anonymous device alone', async () => {
    getProperty.mockReturnValue('anonymous');
    resetUserIfIdentified();
    await initPostHog();
    expect(reset).not.toHaveBeenCalled();
  });
});
