import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The browser half of part C. It must never throw into sign-in, must send
 * nothing when there is nothing tagged, and must keep trying until the server
 * reaches a verdict.
 */
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

import { sendSignupAttribution, SIGNUP_ATTR_SENT_KEY } from './signupAttributionClient';
import { FIRST_TOUCH_KEY, LAST_TOUCH_KEY } from '@/lib/attribution';
import { logError } from '@/lib/logger';

const USER = 'u-1';
const NOW = Date.UTC(2026, 9, 9, 15);
const TAGGED = {
  src: 'ig',
  code: 'IG-REEL-01',
  ref: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  landing_path: '/',
  ts: NOW - 3_600_000,
};

const flush = () => new Promise((r) => setTimeout(r, 0));
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('sendSignupAttribution', () => {
  it('posts both stored touches with keepalive, and remembers it sent for this user', async () => {
    window.localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(TAGGED));
    window.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify({ ...TAGGED, src: 'flyer' }));
    sendSignupAttribution(USER, NOW);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/attr/signup/');
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body);
    expect(body.last.src).toBe('ig');
    expect(body.first.src).toBe('flyer');
    expect(window.localStorage.getItem(SIGNUP_ATTR_SENT_KEY)).toBe(USER);
  });

  it('sends nothing when no touch is tagged, which is most sign-ins', () => {
    sendSignupAttribution(USER, NOW);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send twice for the same user on this device', () => {
    window.localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(TAGGED));
    window.localStorage.setItem(SIGNUP_ATTR_SENT_KEY, USER);
    sendSignupAttribution(USER, NOW);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT mark sent on a 5xx, so the next sign-in tries again', async () => {
    window.localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(TAGGED));
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    sendSignupAttribution(USER, NOW);
    await flush();
    expect(window.localStorage.getItem(SIGNUP_ATTR_SENT_KEY)).toBeNull();
  });

  it('logs a network failure and never throws into sign-in', async () => {
    window.localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(TAGGED));
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => sendSignupAttribution(USER, NOW)).not.toThrow();
    await flush();
    expect(logError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ action: 'sendSignupAttribution' })
    );
  });
});
