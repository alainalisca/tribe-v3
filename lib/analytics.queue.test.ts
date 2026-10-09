/**
 * T-ANALYTICS1 part A. lib/analytics.ts helpers go through withPostHog, so an
 * event fired before posthog-js has loaded is sent once it loads, stamped with
 * the time it HAPPENED rather than the time the SDK caught up.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const init = vi.fn();
const capture = vi.fn();
const reset = vi.fn();
const register = vi.fn();

vi.mock('posthog-js', () => ({ default: { init, capture, reset, register } }));

import { __resetPostHogForTests, initPostHog } from './posthog';
import { resetUser, setSessionContext, trackEvent } from './analytics';

beforeEach(() => {
  __resetPostHogForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('analytics helpers before the SDK has loaded', () => {
  it('trackEvent is delivered after the load, not dropped', async () => {
    trackEvent('session_viewed', { session_id: 's1' });
    await initPostHog();
    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0][0]).toBe('session_viewed');
    expect(capture.mock.calls[0][1]).toMatchObject({ session_id: 's1' });
  });

  it('a queued event keeps the time it was tracked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T18:00:00.000Z'));
    trackEvent('signup_started', { method: 'apple' });

    vi.setSystemTime(new Date('2026-10-09T18:00:05.000Z'));
    await initPostHog();

    const [, properties, options] = capture.mock.calls[0];
    expect(options.timestamp.toISOString()).toBe('2026-10-09T18:00:00.000Z');
    expect(properties.timestamp).toBe('2026-10-09T18:00:00.000Z');
  });

  it('resetUser before the load still resets once it loads', async () => {
    resetUser();
    await initPostHog();
    expect(reset).toHaveBeenCalledOnce();
  });

  it('setSessionContext before the load still registers', async () => {
    setSessionContext({ user_role: 'athlete' });
    await initPostHog();
    expect(register).toHaveBeenCalledWith({ user_role: 'athlete' });
  });

  it('keeps call order across helpers', async () => {
    setSessionContext({ a: 1 });
    trackEvent('app_opened');
    await initPostHog();
    expect(register.mock.invocationCallOrder[0]).toBeLessThan(capture.mock.invocationCallOrder[0]);
  });
});
