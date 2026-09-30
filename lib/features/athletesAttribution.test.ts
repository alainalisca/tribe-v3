/**
 * T-AV23: the anonymous-path predicate (spec section 3).
 *
 * The acceptance that matters most is structural: an app admin gets NO
 * attribution with the flag off. isAthleteValueEnabled lets an admin through
 * with the flag off, so the predicate must never call it, and must not read a
 * session at all. The function has no user parameter, so behaviourally there
 * is nothing an admin could change; the scan below makes sure nobody adds one.
 * The route-level proof (a signed-in admin, flag off, no session read) is in
 * app/api/pase/route.flagoff.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { athletesAttributionConfigured, athletesAttributionEnabled } from './athletesAttribution';
import { readAthleteValueConfig } from './athleteValue';
import { sourceWithoutComments } from '@/lib/testing/sourceWithoutComments';

const cfg = (env: Record<string, string | undefined>) => readAthleteValueConfig(env);
const ACTIVE = { isActive: true };
const INACTIVE = { isActive: false };

describe('athletesAttributionEnabled', () => {
  it('is off when ATHLETE_VALUE_ENABLED is unset, off or unknown, whatever the program', () => {
    for (const mode of [undefined, 'off', '', 'yes']) {
      expect(athletesAttributionEnabled(ACTIVE, cfg({ ATHLETE_VALUE_ENABLED: mode }))).toBe(false);
    }
    // The mode is trimmed and lowercased, as for every other T-AV surface.
    expect(athletesAttributionEnabled(ACTIVE, cfg({ ATHLETE_VALUE_ENABLED: ' ALL ' }))).toBe(true);
  });

  it('is on for "all" and for "allowlist" (an allowlist names users; a guest is not one)', () => {
    expect(athletesAttributionEnabled(ACTIVE, cfg({ ATHLETE_VALUE_ENABLED: 'all' }))).toBe(true);
    expect(athletesAttributionEnabled(ACTIVE, cfg({ ATHLETE_VALUE_ENABLED: 'allowlist' }))).toBe(true);
  });

  it('needs the athletes feature when a feature list is set', () => {
    expect(
      athletesAttributionEnabled(ACTIVE, cfg({ ATHLETE_VALUE_ENABLED: 'all', ATHLETE_VALUE_FEATURES: 'tribe-os' }))
    ).toBe(false);
    expect(
      athletesAttributionEnabled(
        ACTIVE,
        cfg({ ATHLETE_VALUE_ENABLED: 'all', ATHLETE_VALUE_FEATURES: 'tribe-os,athletes' })
      )
    ).toBe(true);
  });

  it('needs an ACTIVE program for this partner: inactive or missing is off', () => {
    const on = cfg({ ATHLETE_VALUE_ENABLED: 'all' });
    expect(athletesAttributionEnabled(INACTIVE, on)).toBe(false);
    expect(athletesAttributionEnabled(null, on)).toBe(false);
  });

  it('the environment half alone says nothing about the program', () => {
    expect(athletesAttributionConfigured(cfg({ ATHLETE_VALUE_ENABLED: 'all' }))).toBe(true);
    expect(athletesAttributionConfigured(cfg({}))).toBe(false);
  });
});

describe('the predicate can never let an admin through', () => {
  const code = sourceWithoutComments('lib/features/athletesAttribution.ts');

  it('NON-VACUITY: the scan reads the predicate itself', () => {
    expect(code).toContain('function athletesAttributionEnabled');
    expect(code).toContain('isFeatureListed');
  });

  it('never calls the admin-aware flag, the admin RPC, or anything that reads a session', () => {
    for (const forbidden of [
      'isAthleteValueEnabled',
      'callerIsAppAdmin',
      'is_app_admin',
      'getUser',
      'supabase/server',
      'athleteValueEnabledForRequest',
    ]) {
      expect(code, `athletesAttribution.ts must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('takes no user: neither function has a userId parameter', () => {
    expect(athletesAttributionEnabled.length).toBeLessThanOrEqual(2);
    expect(code).not.toMatch(/userId|user_id|\buser\b/);
  });
});
