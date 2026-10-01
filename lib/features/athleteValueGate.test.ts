/**
 * T-AV24: the middleware gate for the program's pages. The real-status proof
 * (a running server, flag off and on) is t-av24-proof.LOCAL.sh test 1 and its
 * mutation arms; this file pins the two decisions the gate makes.
 */
import { describe, it, expect, vi } from 'vitest';
import { athletesGateAllows, gymPathRequirement, isAthletesGatedPath } from './athleteValueGate';

describe('isAthletesGatedPath: exact prefixes only', () => {
  it.each([
    '/atletas',
    '/atletas/',
    '/atletas/gym/x/',
    '/pase/verificar',
    '/pase/verificar/',
    '/pase/verificar/BU-4F7K/',
  ])('gates %s', (p) => expect(isAthletesGatedPath(p)).toBe(true));

  it.each([
    '/pase',
    '/pase/',
    '/pase/bullbox-prueba/',
    '/pase/verificarx',
    '/pase/verificar-algo/',
    '/api/pase',
    '/api/pase/',
    '/api/atletas/home-card/',
    '/atletasx',
    '/profile',
    '/',
  ])('never touches %s', (p) => expect(isAthletesGatedPath(p)).toBe(false));
});

describe("athletesGateAllows: the pages' resolver, failing closed", () => {
  const rpc = (answer: unknown) => ({ rpc: vi.fn(async () => ({ data: answer, error: null })) });
  const ON = { ATHLETE_VALUE_ENABLED: 'all' };
  const OFF = { ATHLETE_VALUE_ENABLED: 'off' };

  it('flag on: allowed, signed in or not', async () => {
    expect(await athletesGateAllows(async () => 'u-1', rpc(false), ON)).toBe(true);
    expect(await athletesGateAllows(async () => null, rpc(false), ON)).toBe(true);
  });

  it('flag off: refused, signed in or not', async () => {
    expect(await athletesGateAllows(async () => 'u-1', rpc(false), OFF)).toBe(false);
    expect(await athletesGateAllows(async () => null, rpc(false), OFF)).toBe(false);
  });

  it('flag on but athletes not listed in ATHLETE_VALUE_FEATURES: refused', async () => {
    expect(await athletesGateAllows(async () => 'u-1', rpc(false), { ...ON, ATHLETE_VALUE_FEATURES: 'tribe-os' })).toBe(
      false
    );
  });

  it('flag off, app admin: allowed, exactly as the pages decide (admin is always on for signed-in surfaces)', async () => {
    expect(await athletesGateAllows(async () => 'admin', rpc(true), OFF)).toBe(true);
  });

  it('fails closed when the session read throws', async () => {
    expect(
      await athletesGateAllows(
        async () => {
          throw new Error('auth down');
        },
        rpc(true),
        ON
      )
    ).toBe(false);
  });

  it('fails closed when the admin check throws', async () => {
    const broken = {
      rpc: vi.fn(async () => {
        throw new Error('rpc down');
      }),
    };
    expect(await athletesGateAllows(async () => 'u-1', broken, OFF)).toBe(false);
  });
});

describe('T-AV26: gymPathRequirement, the role each gym path needs', () => {
  const P = '00000000-0000-4000-8000-000000007000';

  it('not a gym path: the flag alone decides', () => {
    for (const p of ['/atletas', '/atletas/', '/pase/verificar/BU-4F7K/', '/atletas/gymx/']) {
      expect(gymPathRequirement(p)).toBeNull();
    }
  });

  it('dashboard and door list: owner, coach or admin', () => {
    for (const p of [`/atletas/gym/${P}`, `/atletas/gym/${P}/`, `/atletas/gym/${P}/puerta/`]) {
      expect(gymPathRequirement(p)).toEqual({ partnerId: P, roles: ['owner', 'coach', 'admin'] });
    }
  });

  it('settings: owner or admin only, with or without the trailing slash', () => {
    for (const p of [`/atletas/gym/${P}/ajustes`, `/atletas/gym/${P}/ajustes/`]) {
      expect(gymPathRequirement(p)).toEqual({ partnerId: P, roles: ['owner', 'admin'] });
    }
  });

  it('no valid partner id: not found', () => {
    for (const p of ['/atletas/gym', '/atletas/gym/', '/atletas/gym/bullbox/', '/atletas/gym/1/ajustes/']) {
      expect(gymPathRequirement(p)).toBe('not_found');
    }
  });
});

describe('T-AV26: athletesGateAllows on a gym path asks av_my_partner_role', () => {
  const P = '00000000-0000-4000-8000-000000007000';
  const ON = { ATHLETE_VALUE_ENABLED: 'all' };
  /** is_app_admin answers false; av_my_partner_role answers `role`. */
  const client = (role: unknown, roleError: unknown = null) => ({
    rpc: vi.fn(async (fn: string) =>
      fn === 'av_my_partner_role' ? { data: role, error: roleError } : { data: false, error: null }
    ),
  });
  const dash = `/atletas/gym/${P}/`;
  const settings = `/atletas/gym/${P}/ajustes/`;

  it.each([
    ['owner', dash, true],
    ['coach', dash, true],
    ['admin', dash, true],
    [null, dash, false],
    ['owner', settings, true],
    ['admin', settings, true],
    ['coach', settings, false],
    [null, settings, false],
  ])('%s on %s: %s', async (role, path, expected) => {
    const c = client(role);
    expect(await athletesGateAllows(async () => 'u-1', c, ON, path)).toBe(expected);
    expect(c.rpc).toHaveBeenCalledWith('av_my_partner_role', { p_partner_id: P });
  });

  it('a role the gate does not know is a no', async () => {
    expect(await athletesGateAllows(async () => 'u-1', client('Owner'), ON, dash)).toBe(false);
  });

  it('fails closed when the role check errors or throws', async () => {
    expect(await athletesGateAllows(async () => 'u-1', client('owner', { message: 'boom' }), ON, dash)).toBe(false);
    const broken = {
      rpc: vi.fn(async (fn: string) => {
        if (fn === 'av_my_partner_role') throw new Error('rpc down');
        return { data: false, error: null };
      }),
    };
    expect(await athletesGateAllows(async () => 'u-1', broken, ON, dash)).toBe(false);
  });

  it('signed out on a gym path is a no without asking the role (middleware then redirects to /auth)', async () => {
    const c = client('owner');
    expect(await athletesGateAllows(async () => null, c, ON, dash)).toBe(false);
    expect(c.rpc).not.toHaveBeenCalledWith('av_my_partner_role', expect.anything());
  });

  it('flag off: a no before the role is asked', async () => {
    const c = client('owner');
    expect(await athletesGateAllows(async () => 'u-1', c, { ATHLETE_VALUE_ENABLED: 'off' }, dash)).toBe(false);
    expect(c.rpc).not.toHaveBeenCalledWith('av_my_partner_role', expect.anything());
  });

  it('a malformed partner id is a no without a query', async () => {
    const c = client('owner');
    expect(await athletesGateAllows(async () => 'u-1', c, ON, '/atletas/gym/bullbox/')).toBe(false);
    expect(c.rpc).not.toHaveBeenCalledWith('av_my_partner_role', expect.anything());
  });

  it('a non-gym path never asks the role', async () => {
    const c = client(null);
    expect(await athletesGateAllows(async () => 'u-1', c, ON, '/atletas/')).toBe(true);
    expect(c.rpc).not.toHaveBeenCalledWith('av_my_partner_role', expect.anything());
  });
});
