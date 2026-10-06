/**
 * T-AV19 Part B. Push log mode: webpush.sendNotification and every FCM fetch
 * (the OAuth token exchange included) are never called in log mode, and are
 * called in live mode.
 *
 * The live arms are the control. Without them, "never called" would also pass
 * against a helper that was broken in some unrelated way and never reached the
 * network at all, so each live arm asserts the call happened.
 *
 * The FCM live arm signs a real RS256 JWT with a throwaway key generated here,
 * so it runs the real getFcmAccessToken path rather than a mock of it.
 *
 * Mutation proofs (run by hand, recorded in the T-AV19 report):
 *   - delete `if (pushMode() === 'log') return logModePush('fcm', title);`
 *     -> "FCM: log mode makes no network call" goes red.
 *   - delete `if (pushMode() === 'log') return logModePush('webpush', title);`
 *     -> "web push: log mode never calls sendNotification" goes red.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

const { sendNotificationMock, setVapidMock, logMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn().mockResolvedValue({ statusCode: 201 }),
  setVapidMock: vi.fn(),
  logMock: vi.fn(),
}));

vi.mock('web-push', () => ({
  default: { sendNotification: sendNotificationMock, setVapidDetails: setVapidMock },
}));
vi.mock('@/lib/logger', () => ({ log: logMock, logError: vi.fn() }));

import { sendFcmNotification, sendWebPushNotification } from './notificationHelpers';

const PROD = 'https://abcdefgh.supabase.co';
const ENV_KEYS = [
  'PUSH_MODE',
  'NEXT_PUBLIC_SUPABASE_URL',
  'FIREBASE_SERVICE_ACCOUNT_KEY',
  'VAPID_EMAIL',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
] as const;
const saved: Record<string, string | undefined> = {};

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const SUBSCRIPTION = { endpoint: 'https://push.example.invalid/abc', keys: { p256dh: 'x', auth: 'y' } };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = PROD;
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
    client_email: 'svc@test.iam.gserviceaccount.com',
    private_key: privateKey,
    project_id: 'test-project',
  });
  process.env.VAPID_EMAIL = 'ops@example.invalid';
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'dummy-public';
  process.env.VAPID_PRIVATE_KEY = 'dummy-private';
  fetchMock = vi.fn(async (url: string) =>
    String(url).includes('oauth2')
      ? { ok: true, json: async () => ({ access_token: 'tok' }) }
      : { ok: true, json: async () => ({ name: 'projects/test-project/messages/1' }) }
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('log mode (PUSH_MODE=log)', () => {
  beforeEach(() => {
    process.env.PUSH_MODE = 'log';
  });

  it('FCM: log mode makes no network call, token exchange included', async () => {
    const r = await sendFcmNotification('device-token', 'Hola', 'body');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r).toEqual({ success: true });
    expect(logMock.mock.calls.some((c) => c[1] === '[push:log] channel=fcm title=Hola')).toBe(true);
  });

  it('web push: log mode never calls sendNotification', async () => {
    const r = await sendWebPushNotification(SUBSCRIPTION, 'Hola', 'body', '/x');
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(setVapidMock).not.toHaveBeenCalled();
    expect(r).toEqual({ success: true });
  });

  it('never logs the device token or the subscription endpoint', async () => {
    await sendFcmNotification('device-token-SECRET', 'Hola', 'body');
    await sendWebPushNotification(SUBSCRIPTION, 'Hola', 'body');
    const all = JSON.stringify(logMock.mock.calls);
    expect(all).not.toContain('device-token-SECRET');
    expect(all).not.toContain('push.example.invalid');
  });
});

describe('the localhost fail-safe', () => {
  it('a local Supabase URL blocks both channels even with PUSH_MODE=live', async () => {
    process.env.PUSH_MODE = 'live';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    await sendFcmNotification('device-token', 'Hola', 'body');
    await sendWebPushNotification(SUBSCRIPTION, 'Hola', 'body');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});

describe('live mode (unset, production URL): the control', () => {
  beforeEach(() => {
    delete process.env.PUSH_MODE;
  });

  it('FCM: calls the token exchange and then the FCM send', async () => {
    const r = await sendFcmNotification('device-token', 'Hola', 'body');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toBe('https://oauth2.googleapis.com/token');
    expect(urls[1]).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send');
    expect(r).toEqual({ success: true });
  });

  it('web push: calls sendNotification with the subscription', async () => {
    const r = await sendWebPushNotification(SUBSCRIPTION, 'Hola', 'body', '/x');
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock.mock.calls[0][0]).toBe(SUBSCRIPTION);
    expect(r).toEqual({ success: true });
  });
});
