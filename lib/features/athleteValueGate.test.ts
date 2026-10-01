/**
 * T-AV24: the middleware gate for the program's pages. The real-status proof
 * (a running server, flag off and on) is t-av24-proof.LOCAL.sh test 1 and its
 * mutation arms; this file pins the two decisions the gate makes.
 */
import { describe, it, expect, vi } from 'vitest';
import { athletesGateAllows, isAthletesGatedPath } from './athleteValueGate';

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
