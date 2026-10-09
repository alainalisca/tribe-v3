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

import DeepLinkRouter, { deepLinkPath } from './DeepLinkRouter';

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

describe('tribelatam.com links (T-DOMAIN1) route inside the app', () => {
  // The app shell runs on tribe-v3.vercel.app, but every link shared since
  // T-DOMAIN1 says tribelatam.com. This is the exact case Ana hit: the app
  // opened and landed on the feed.
  it('the HYROX share link opens the session, not the feed', async () => {
    render(<DeepLinkRouter />);
    await waitFor(() => expect(listeners).toHaveLength(1));
    fire('https://tribelatam.com/s/bcb8df71-b59f-4a69-9809-09f479b6acf3/');
    expect(push).toHaveBeenCalledWith('/s/bcb8df71-b59f-4a69-9809-09f479b6acf3/');
  });

  it('www.tribelatam.com routes too', () => {
    expect(deepLinkPath('https://www.tribelatam.com/s/x1/', ORIGIN)).toBe('/s/x1/');
  });

  it('tracked-link attribution survives (src and code are not dropped)', () => {
    expect(deepLinkPath('https://tribelatam.com/pase/bullbox/?src=instagram&code=IG-DM-AL-01', ORIGIN)).toBe(
      '/pase/bullbox/?src=instagram&code=IG-DM-AL-01',
    );
  });

  it('old printed tribe-v3.vercel.app links still route', () => {
    expect(deepLinkPath('https://tribe-v3.vercel.app/s/x1/', 'http://localhost')).toBe('/s/x1/');
  });

  it('look-alike and non-https hosts are refused', () => {
    expect(deepLinkPath('https://tribelatam.com.evil.com/s/x1/', ORIGIN)).toBeNull();
    expect(deepLinkPath('https://eviltribelatam.com/s/x1/', ORIGIN)).toBeNull();
    expect(deepLinkPath('http://tribelatam.com/s/x1/', ORIGIN)).toBeNull();
    expect(deepLinkPath('https://tribelatam.com:8443/s/x1/', ORIGIN)).toBeNull();
    expect(deepLinkPath('tribe://s/x1', ORIGIN)).toBeNull();
  });

  it('the backslash smuggle is refused on the new host as well', () => {
    expect(deepLinkPath('https://tribelatam.com/\\evil.com', ORIGIN)).toBeNull();
  });
});
