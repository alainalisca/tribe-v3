/**
 * T-ANALYTICS1 part C: `platform` (ios | android | web) and `app_version` ride
 * on every event as super properties, registered once at init.
 *
 * The ordering case is the one that matters: the SDK schedules the landing
 * $pageview right after `loaded` runs, so registering anywhere later (after
 * init returns, in a provider effect) would leave the first pageview of every
 * visit without a platform.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let mockPlatform = 'web';
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mockPlatform } }));

const register = vi.fn();
const capture = vi.fn();
const init = vi.fn((_key: string, options: { loaded?: (ph: unknown) => void }) => {
  options.loaded?.(fake);
});
const fake = { init, register, capture };
vi.mock('posthog-js', () => ({ default: fake }));

import { __resetPostHogForTests, appVersion, initPostHog, platformOf } from './posthog';
import { trackEvent } from './analytics';

beforeEach(() => {
  __resetPostHogForTests();
  vi.clearAllMocks();
  mockPlatform = 'web';
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('platformOf', () => {
  it.each([
    ['ios', 'ios'],
    ['android', 'android'],
    ['web', 'web'],
    [undefined, 'web'],
    [null, 'web'],
    ['electron', 'web'],
  ])('%s -> %s', (input, expected) => {
    expect(platformOf(input as string | undefined | null)).toBe(expected);
  });
});

describe('appVersion', () => {
  it('is the build SHA next.config injects', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', 'c949b32');
    expect(appVersion()).toBe('c949b32');
  });
  it('says unknown rather than inventing one', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');
    expect(appVersion()).toBe('unknown');
  });
});

describe('super properties at init', () => {
  it.each(['ios', 'android', 'web'])('registers platform=%s from Capacitor, with app_version', async (p) => {
    mockPlatform = p;
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', 'abc1234');
    await initPostHog();
    expect(register).toHaveBeenCalledWith({ platform: p, app_version: 'abc1234' });
  });

  it('registers inside `loaded`, i.e. before init returns and before the landing pageview', async () => {
    let registeredBeforeInitReturned = false;
    init.mockImplementationOnce((_key, options) => {
      options.loaded?.(fake);
      registeredBeforeInitReturned = register.mock.calls.length > 0;
    });
    await initPostHog();
    expect(registeredBeforeInitReturned).toBe(true);
  });

  it('registers once', async () => {
    await Promise.all([initPostHog(), initPostHog()]);
    expect(register).toHaveBeenCalledOnce();
  });
});

describe('trackEvent and platform', () => {
  it('no longer stamps the old mobile|web value per event, which would override the super property', async () => {
    trackEvent('app_opened', { entry_page: '/' });
    await initPostHog();
    expect(capture.mock.calls[0][1]).not.toHaveProperty('platform');
  });
});
