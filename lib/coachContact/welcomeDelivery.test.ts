import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClaimedWelcome } from '@/lib/dal/coachWelcome';

const h = vi.hoisted(() => ({
  createNotification: vi.fn(),
  dispatchPush: vi.fn(),
  claimWelcomeForPass: vi.fn(),
  serverCreateClient: vi.fn(),
  admin: { tag: 'service' },
}));
vi.mock('@/lib/dal/notifications', () => ({ createNotification: h.createNotification }));
vi.mock('@/lib/atletas/athleteNotifications', () => ({ dispatchPush: h.dispatchPush }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => h.admin }));
vi.mock('@/lib/supabase/server', () => ({ createClient: h.serverCreateClient }));
vi.mock('@/lib/dal/coachWelcome', () => ({ claimWelcomeForPass: h.claimWelcomeForPass }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { renderWelcome, deliverWelcome, welcomePassClaimant } from './welcomeDelivery';

const W: ClaimedWelcome = {
  recipientId: 'u1',
  language: 'es',
  push: true,
  coachId: 'c1',
  coachFirstName: 'Salomón',
  note: '¡Bienvenido!',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  h.createNotification.mockResolvedValue({ success: true });
  h.dispatchPush.mockResolvedValue(true);
  h.claimWelcomeForPass.mockResolvedValue({ success: true, data: [W] });
  h.serverCreateClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } });
});

describe('renderWelcome', () => {
  it('titles it from the coach, in the recipient language, and keeps the coach words as the body', () => {
    expect(renderWelcome(W)).toEqual({
      title: 'Mensaje de Salomón',
      body: '¡Bienvenido!',
      url: '/storefront/c1/',
      type: 'av_welcome',
    });
    expect(renderWelcome({ ...W, language: 'en' }).title).toBe('A note from Salomón');
  });
  it('Spanish when the language is unknown (the market default)', () => {
    expect(renderWelcome({ ...W, language: null }).title).toBe('Mensaje de Salomón');
  });
});

describe('deliverWelcome', () => {
  it('writes the in-app row as the service role, from the coach, and pushes once', async () => {
    const pushed = await deliverWelcome([W], 'http://x');
    expect(h.createNotification).toHaveBeenCalledWith(
      h.admin,
      expect.objectContaining({ recipient_id: 'u1', actor_id: 'c1', type: 'av_welcome', action_url: '/storefront/c1/' })
    );
    expect(h.dispatchPush).toHaveBeenCalledWith(
      'http://x',
      expect.objectContaining({ recipientId: 'u1', title: 'Mensaje de Salomón', body: '¡Bienvenido!' })
    );
    expect(pushed).toBe(1);
  });
  it('over the cap: the in-app row, and no push', async () => {
    await deliverWelcome([{ ...W, push: false }], 'http://x');
    expect(h.createNotification).toHaveBeenCalledTimes(1);
    expect(h.dispatchPush).not.toHaveBeenCalled();
  });
});

describe('welcomePassClaimant (the public Pass route hook)', () => {
  it('program off: does not even read the session', async () => {
    vi.stubEnv('ATHLETE_VALUE_ENABLED', 'off');
    await welcomePassClaimant(h.admin as never, 'lead-1', 'http://x');
    expect(h.serverCreateClient).not.toHaveBeenCalled();
    expect(h.claimWelcomeForPass).not.toHaveBeenCalled();
  });
  it('allowlist without the claimant: nothing, and no admin pass-through', async () => {
    vi.stubEnv('ATHLETE_VALUE_ENABLED', 'allowlist');
    vi.stubEnv('ATHLETE_VALUE_ALLOWLIST', 'someone-else');
    await welcomePassClaimant(h.admin as never, 'lead-1', 'http://x');
    expect(h.claimWelcomeForPass).not.toHaveBeenCalled();
  });
  it('the feature not listed: nothing', async () => {
    vi.stubEnv('ATHLETE_VALUE_ENABLED', 'all');
    vi.stubEnv('ATHLETE_VALUE_FEATURES', 'pase');
    await welcomePassClaimant(h.admin as never, 'lead-1', 'http://x');
    expect(h.serverCreateClient).not.toHaveBeenCalled();
  });
  it('on for the signed-in claimant: claims with THEIR id and delivers', async () => {
    vi.stubEnv('ATHLETE_VALUE_ENABLED', 'allowlist');
    vi.stubEnv('ATHLETE_VALUE_ALLOWLIST', 'u1');
    await welcomePassClaimant(h.admin as never, 'lead-1', 'http://x');
    expect(h.claimWelcomeForPass).toHaveBeenCalledWith(h.admin, 'lead-1', 'u1');
    expect(h.createNotification).toHaveBeenCalledTimes(1);
  });
  it('signed out: nothing', async () => {
    vi.stubEnv('ATHLETE_VALUE_ENABLED', 'all');
    h.serverCreateClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
    await welcomePassClaimant(h.admin as never, 'lead-1', 'http://x');
    expect(h.claimWelcomeForPass).not.toHaveBeenCalled();
  });
});
