/**
 * T-ANALYTICS1. PostHogProvider:
 *   part A -- starts the SDK load and never captures a $pageview of its own
 *             (posthog-js does that now; a manual one would double count).
 *   part B -- keeps PostHog's identity in step with Supabase's through one
 *             onAuthStateChange listener: identify on every authenticated load
 *             and on sign-in, reset on sign-out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const initPostHog = vi.fn(() => Promise.resolve(null));
const capture = vi.fn();
vi.mock('@/lib/posthog', () => ({
  initPostHog: () => initPostHog(),
  getPostHog: () => ({ capture }),
  withPostHog: (call: (ph: { capture: typeof capture }) => void) => call({ capture }),
}));

type AuthCallback = (event: string, session: { user: { id: string; created_at: string } } | null) => void;
let authCallback: AuthCallback | null = null;
const unsubscribe = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  }),
}));

const resetUserIfIdentified = vi.fn();
vi.mock('@/lib/analytics', () => ({ resetUserIfIdentified: () => resetUserIfIdentified() }));

const identifyCurrentUser = vi.fn();
vi.mock('@/lib/analyticsIdentity', () => ({
  identifyCurrentUser: (...a: unknown[]) => identifyCurrentUser(...a),
}));

import { PostHogProvider } from './PostHogProvider';

const ana = { id: 'u-ana', created_at: '2026-10-01T00:00:00Z' };
const ben = { id: 'u-ben', created_at: '2026-10-02T00:00:00Z' };

/**
 * Render, then let the provider load supabase-js and subscribe (T-SITE1: the
 * listener is imported lazily). With an auth cookie that happens at once.
 */
async function renderProvider() {
  const result = render(
    <PostHogProvider>
      <p>child</p>
    </PostHogProvider>
  );
  await subscribed();
  return result;
}

/**
 * Wait for the listener itself, not for the timers. The provider subscribes
 * after two dynamic imports, which settle through vitest's module loader, not
 * through timers: running the timers alone left authCallback null on a loaded
 * CI runner, the first emit went nowhere and identify was "called 0 times".
 */
async function subscribed() {
  await act(async () => {
    await vi.waitFor(() => expect(authCallback).not.toBeNull(), { timeout: 5000 });
  });
}

/** Fire an auth event and let the deferred identify run. */
async function emit(event: string, user: typeof ana | null) {
  await act(async () => {
    authCallback?.(event, user ? { user } : null);
    await vi.runAllTimersAsync();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Signed in unless a test says otherwise: the listener subscribes at once.
  document.cookie = 'sb-test-auth-token=x; Path=/';
  authCallback = null;
  identifyCurrentUser.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PostHogProvider, part A', () => {
  it('renders its children and starts the PostHog load', async () => {
    await renderProvider();
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(initPostHog).toHaveBeenCalled();
  });

  it('never captures a pageview of its own', async () => {
    await renderProvider();
    expect(capture).not.toHaveBeenCalled();
  });
});

describe('PostHogProvider, part B: identity follows auth', () => {
  it('identifies on an authenticated load (INITIAL_SESSION)', async () => {
    await renderProvider();
    await emit('INITIAL_SESSION', ana);
    expect(identifyCurrentUser).toHaveBeenCalledOnce();
    expect(identifyCurrentUser.mock.calls[0][1]).toBe(ana);
  });

  it('identifies on a sign-in completed in the page (SIGNED_IN, the OAuth callback)', async () => {
    await renderProvider();
    await emit('INITIAL_SESSION', null);
    await emit('SIGNED_IN', ana);
    expect(identifyCurrentUser).toHaveBeenCalledOnce();
  });

  it('does nothing for a signed-out visitor', async () => {
    await renderProvider();
    await emit('INITIAL_SESSION', null);
    expect(identifyCurrentUser).not.toHaveBeenCalled();
    expect(resetUserIfIdentified).not.toHaveBeenCalled();
  });

  it('identifies once per user, not on every SIGNED_IN refocus or token refresh', async () => {
    await renderProvider();
    await emit('INITIAL_SESSION', ana);
    await emit('SIGNED_IN', ana);
    await emit('TOKEN_REFRESHED', ana);
    expect(identifyCurrentUser).toHaveBeenCalledOnce();
  });

  it('re-identifies when the account itself changes (USER_UPDATED)', async () => {
    await renderProvider();
    await emit('INITIAL_SESSION', ana);
    await emit('USER_UPDATED', ana);
    expect(identifyCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('resets on sign-out, then identifies the next person on the device', async () => {
    await renderProvider();
    await emit('INITIAL_SESSION', ana);
    await emit('SIGNED_OUT', null);
    expect(resetUserIfIdentified).toHaveBeenCalledOnce();
    await emit('SIGNED_IN', ben);
    expect(identifyCurrentUser).toHaveBeenCalledTimes(2);
    expect(identifyCurrentUser.mock.calls[1][1]).toBe(ben);
  });

  it('tells the identify path when the user it is identifying has signed out', async () => {
    // The unverified-email path signs in and straight back out; the identify
    // started by SIGNED_IN must be able to see that before it lands.
    await renderProvider();
    await emit('SIGNED_IN', ana);
    const stillCurrent = identifyCurrentUser.mock.calls[0][2] as () => boolean;
    expect(stillCurrent()).toBe(true);
    await emit('SIGNED_OUT', null);
    expect(stillCurrent()).toBe(false);
  });

  it('with no auth cookie (a first visit), subscribes only once the page is idle (T-SITE1)', async () => {
    document.cookie = 'sb-test-auth-token=; Path=/; Max-Age=0';
    render(
      <PostHogProvider>
        <p>child</p>
      </PostHogProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(authCallback).toBeNull();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await subscribed();
  });

  it('unsubscribes from auth on unmount', async () => {
    const { unmount } = await renderProvider();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
