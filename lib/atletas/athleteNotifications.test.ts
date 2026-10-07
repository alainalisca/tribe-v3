/**
 * T-AV27b: what a decided notification becomes, and how it is delivered.
 *
 * Mutation proofs (driver: t-av27b-mutations.LOCAL.sh, unit arms):
 *   - push regardless of `push` -> "over the cap: the in-app row, and no push"
 *   - NEXT_PUBLIC_SITE_URL instead of the request origin -> "pushes to the request's own origin"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ClaimedNotification } from '@/lib/dal/athleteNotify';

const h = vi.hoisted(() => ({ createNotification: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/dal/notifications', () => ({ createNotification: h.createNotification }));
vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));

import { deliverNotifications, renderNotification } from './athleteNotifications';

const BASE: ClaimedNotification = {
  event: 'arrived',
  recipientId: 'caro',
  language: 'es',
  push: true,
  guestFirstName: 'Marta',
  athleteFirstName: null,
  partnerName: 'BullBox (Prueba)',
  partnerId: 'p-1',
  leadId: 'lead-1',
};
const client = {} as Parameters<typeof deliverNotifications>[0];
const TITLE = { es: 'Atletas Tribe', en: 'Tribe Athletes' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', h.fetch);
  vi.stubEnv('CRON_SECRET', 'local-secret');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3001');
  h.createNotification.mockResolvedValue({ success: true, data: null });
  h.fetch.mockResolvedValue({ ok: true, status: 200 });
});
afterEach(() => vi.unstubAllEnvs());

describe('renderNotification: the approved copy, in the recipient language', () => {
  it.each([
    [{ event: 'arrived' }, 'es', 'Marta llegó a su clase', '/atletas/'],
    [{ event: 'joined' }, 'es', 'Marta se inscribió en BullBox (Prueba)', '/atletas/'],
    [{ event: 'claimed', push: false }, 'es', 'Marta reclamó un pase con tu link', '/atletas/'],
    [
      { event: 'ready', athleteFirstName: 'Beto', leadId: null },
      'es',
      'Beto ya puede subir de nivel',
      '/atletas/gym/p-1/',
    ],
    [{ event: 'arrived' }, 'en', 'Marta arrived at class', '/atletas/'],
    [{ event: 'joined' }, 'en', 'Marta joined BullBox (Prueba)', '/atletas/'],
    [{ event: 'claimed', push: false }, 'en', 'Marta claimed a pass with your link', '/atletas/'],
    [{ event: 'ready', athleteFirstName: 'Beto', leadId: null }, 'en', 'Beto can move up a level', '/atletas/gym/p-1/'],
  ] as const)('%o in %s', (over, language, body, url) => {
    const r = renderNotification({ ...BASE, ...over, language });
    expect(r.body).toBe(body);
    expect(r.url).toBe(url);
    expect(r.title).toBe(TITLE[language]);
    expect(r.type).toBe(`av_${over.event}`);
  });
});

describe('deliverNotifications', () => {
  it('writes the in-app row and pushes to the request own origin, through /api/notifications/send', async () => {
    const pushed = await deliverNotifications(client, [BASE], { actorId: 'elena', origin: 'http://localhost:3101' });
    expect(pushed).toBe(1);
    expect(h.createNotification).toHaveBeenCalledWith(client, {
      recipient_id: 'caro',
      actor_id: 'elena',
      type: 'av_arrived',
      entity_type: 'pass_lead',
      entity_id: 'lead-1',
      message: 'Marta llegó a su clase',
      action_url: '/atletas/',
    });
    const [url, init] = h.fetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('http://localhost:3101/api/notifications/send/');
    expect(init.headers.Authorization).toBe('Bearer local-secret');
    expect(JSON.parse(init.body)).toMatchObject({ userId: 'caro', body: 'Marta llegó a su clase', type: 'av_arrived' });
  });

  it('over the cap: the in-app row, and no push', async () => {
    const pushed = await deliverNotifications(client, [{ ...BASE, push: false }], {
      actorId: 'elena',
      origin: 'http://x',
    });
    expect(pushed).toBe(0);
    expect(h.createNotification).toHaveBeenCalledOnce();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('no CRON_SECRET: the in-app row only, and no unauthenticated push call', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(await deliverNotifications(client, [BASE], { actorId: null, origin: 'http://x' })).toBe(0);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.createNotification).toHaveBeenCalledOnce();
  });

  it('a refused or failed push is not counted, and the next notification still goes', async () => {
    h.fetch.mockResolvedValueOnce({ ok: false, status: 404 }).mockRejectedValueOnce(new Error('down'));
    const third = { ...BASE, recipientId: 'beto' };
    h.fetch.mockResolvedValueOnce({ ok: true, status: 200 });
    expect(await deliverNotifications(client, [BASE, BASE, third], { actorId: null, origin: 'http://x' })).toBe(1);
    expect(h.createNotification).toHaveBeenCalledTimes(3);
  });
});
