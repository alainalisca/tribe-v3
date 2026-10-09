/**
 * The entitlement and the intent filter decide WHICH APP opens. They do not
 * carry the path into it. Without this listener a tap on /onboarding/sports/
 * opens Tribe wherever it was last -- which looks like the link worked while
 * landing the athlete nowhere near what the email asked them to do.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

let isNative = true;
let launchUrl: string | null = null;
const listeners: Array<(e: { url: string }) => void> = [];
const remove = vi.fn();
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNative } }));
vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: async () => (launchUrl ? { url: launchUrl } : null),
    addListener: async (_e: string, cb: (e: { url: string }) => void) => {
      listeners.push(cb);
      return { remove };
    },
  },
}));

import DeepLinkRouter from './DeepLinkRouter';

const ORIGIN = 'https://tribe-v3.vercel.app';
const fire = (url: string) => listeners.forEach((l) => l({ url }));

beforeEach(() => {
  vi.clearAllMocks();
  isNative = true;
  launchUrl = null;
  listeners.length = 0;
  Object.defineProperty(window, 'location', { value: new URL(ORIGIN), writable: true });
});

describe('an incoming link routes to the path it names', () => {
  it('NON-VACUITY: it registers a listener on native', async () => {
    render(<DeepLinkRouter />);
    await waitFor(() => expect(listeners).toHaveLength(1));
  });

  it('a COLD launch routes, even though no event fires for it', async () => {
    // getLaunchUrl is the only signal when the app was not already running.
    launchUrl = `${ORIGIN}/onboarding/sports/`;
    render(<DeepLinkRouter />);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/sports/'));
  });

  it('a WARM open routes too', async () => {
    render(<DeepLinkRouter />);
    await waitFor(() => expect(listeners).toHaveLength(1));
    fire(`${ORIGIN}/session/abc123/`);
    expect(push).toHaveBeenCalledWith('/session/abc123/');
  });

  it('the query string survives, so returnTo is not lost', async () => {
    render(<DeepLinkRouter />);
    await waitFor(() => expect(listeners).toHaveLength(1));
    fire(`${ORIGIN}/onboarding/sports/?returnTo=%2Fsession%2Fs1`);
    expect(push).toHaveBeenCalledWith('/onboarding/sports/?returnTo=%2Fsession%2Fs1');
  });

  it('a link from ANOTHER origin is ignored', async () => {
    render(<DeepLinkRouter />);
    await waitFor(() => expect(listeners).toHaveLength(1));
    fire('https://evil.com/onboarding/sports/');
    expect(push).not.toHaveBeenCalled();
  });

  it('a backslash path cannot smuggle an off-origin destination', async () => {
    // Same one rule as every other redirect in the app. A second copy is the
    // one that would miss this.
    render(<DeepLinkRouter />);
    await waitFor(() => expect(listeners).toHaveLength(1));
    fire(`${ORIGIN}/\\evil.com`);
    expect(push).not.toHaveBeenCalled();
  });

  it('the bare site root does NOT navigate, so a normal open is undisturbed', async () => {
    render(<DeepLinkRouter />);
    await waitFor(() => expect(listeners).toHaveLength(1));
    fire(`${ORIGIN}/`);
    expect(push).not.toHaveBeenCalled();
  });

  it('a malformed URL is ignored rather than guessed at', async () => {
    render(<DeepLinkRouter />);
    await waitFor(() => expect(listeners).toHaveLength(1));
    fire('not a url at all');
    expect(push).not.toHaveBeenCalled();
  });

  it('off-native it does nothing at all, and never loads the plugin', async () => {
    isNative = false;
    render(<DeepLinkRouter />);
    await new Promise((r) => setTimeout(r, 0));
    expect(listeners).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it('unmounting removes the listener', async () => {
    const { unmount } = render(<DeepLinkRouter />);
    await waitFor(() => expect(listeners).toHaveLength(1));
    unmount();
    await waitFor(() => expect(remove).toHaveBeenCalled());
  });
});
