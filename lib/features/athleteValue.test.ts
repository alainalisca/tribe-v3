/**
 * T-AV0, Step 6. Tests for the athlete_value flag.
 *
 * The arms that matter are the OFF ones. A flag that can be turned on is easy;
 * a flag that cannot be turned on by accident is the product requirement, and
 * "off" has more ways to go wrong than "on": an unset variable, a typo in the
 * mode, a signed-out visitor, an empty allowlist, an admin RPC that errors.
 *
 * Each `no` case below is a way the gate could have opened for someone it
 * should not have.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  readAthleteValueConfig,
  isEnabledByConfig,
  isFeatureListed,
  isAthleteValueEnabled,
  type AdminRpcClient,
} from './athleteValue';

const AL = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';

/** A client whose is_app_admin answers exactly what the test says. */
function adminClient(answer: unknown, error: unknown = null): AdminRpcClient {
  return { rpc: vi.fn().mockResolvedValue({ data: answer, error }) };
}

describe('readAthleteValueConfig', () => {
  it('is off when the variable is unset', () => {
    expect(readAthleteValueConfig({}).mode).toBe('off');
  });

  it('is off for any value that is not "all" or "allowlist"', () => {
    for (const v of ['true', '1', 'yes', 'on', 'ALLOW', '']) {
      expect(readAthleteValueConfig({ ATHLETE_VALUE_ENABLED: v }).mode).toBe('off');
    }
  });

  it('reads the allowlist only in allowlist mode', () => {
    const list = `${AL}, ${STRANGER}`;
    expect(
      readAthleteValueConfig({ ATHLETE_VALUE_ENABLED: 'allowlist', ATHLETE_VALUE_ALLOWLIST: list }).allowlist
    ).toEqual([AL, STRANGER]);
    // In `all` mode the allowlist is meaningless; carrying it would invite a
    // reader to believe it is still constraining something.
    expect(readAthleteValueConfig({ ATHLETE_VALUE_ENABLED: 'all', ATHLETE_VALUE_ALLOWLIST: list }).allowlist).toEqual(
      []
    );
  });

  it('distinguishes "features unset" from "features empty"', () => {
    expect(readAthleteValueConfig({}).features).toBeNull();
    expect(readAthleteValueConfig({ ATHLETE_VALUE_FEATURES: '' }).features).toEqual([]);
  });
});

describe('isEnabledByConfig', () => {
  it('says yes to everyone in "all" mode, signed out included', () => {
    const cfg = readAthleteValueConfig({ ATHLETE_VALUE_ENABLED: 'all' });
    expect(isEnabledByConfig(cfg, AL)).toBe(true);
    expect(isEnabledByConfig(cfg, null)).toBe(true);
  });

  it('says yes only to listed ids in allowlist mode', () => {
    const cfg = readAthleteValueConfig({
      ATHLETE_VALUE_ENABLED: 'allowlist',
      ATHLETE_VALUE_ALLOWLIST: AL,
    });
    expect(isEnabledByConfig(cfg, AL)).toBe(true);
    expect(isEnabledByConfig(cfg, AL.toUpperCase())).toBe(true);
    expect(isEnabledByConfig(cfg, STRANGER)).toBe(false);
    expect(isEnabledByConfig(cfg, null)).toBe(false);
  });

  it('says no to a signed-out visitor when the allowlist is empty', () => {
    const cfg = readAthleteValueConfig({ ATHLETE_VALUE_ENABLED: 'allowlist' });
    expect(isEnabledByConfig(cfg, null)).toBe(false);
    expect(isEnabledByConfig(cfg, AL)).toBe(false);
  });
});

describe('isFeatureListed', () => {
  it('allows every feature when the variable is unset', () => {
    const cfg = readAthleteValueConfig({});
    expect(isFeatureListed(cfg, 'pase')).toBe(true);
    expect(isFeatureListed(cfg, null)).toBe(true);
  });

  it('allows only the listed features when it is set', () => {
    const cfg = readAthleteValueConfig({ ATHLETE_VALUE_FEATURES: 'pase, challenges' });
    expect(isFeatureListed(cfg, 'pase')).toBe(true);
    expect(isFeatureListed(cfg, 'PASE')).toBe(true);
    expect(isFeatureListed(cfg, 'streaks')).toBe(false);
  });

  it('turns everything off when the list is set to empty', () => {
    const cfg = readAthleteValueConfig({ ATHLETE_VALUE_FEATURES: '' });
    expect(isFeatureListed(cfg, 'pase')).toBe(false);
  });
});

describe('isAthleteValueEnabled', () => {
  it('is off with no env, no user and no client', async () => {
    expect(await isAthleteValueEnabled(null, null, { env: {} })).toBe(false);
  });

  it('is on for an app admin even when the mode is off', async () => {
    // Stated as a test because it is surprising: ATHLETE_VALUE_ENABLED unset
    // does not mean nobody can reach these screens. T-AV0 Step 6 lists the
    // admin path unconditionally, and Al is an app admin.
    expect(await isAthleteValueEnabled(STRANGER, adminClient(true), { env: {} })).toBe(true);
  });

  it('is off when is_app_admin errors', async () => {
    expect(await isAthleteValueEnabled(STRANGER, adminClient(null, { message: 'boom' }), { env: {} })).toBe(false);
  });

  it('is off when is_app_admin returns a truthy non-boolean', async () => {
    // Strict `=== true`. 'yes', 1 and {} are all truthy and none of them is a
    // yes from this RPC; lib/auth/adminApi.ts makes the same check for the
    // same reason.
    for (const answer of ['true', 1, {}, ['yes']]) {
      expect(await isAthleteValueEnabled(STRANGER, adminClient(answer), { env: {} })).toBe(false);
    }
  });

  it('is off when the rpc throws outright', async () => {
    const throwing: AdminRpcClient = { rpc: vi.fn().mockRejectedValue(new Error('network')) };
    expect(await isAthleteValueEnabled(STRANGER, throwing, { env: {} })).toBe(false);
  });

  it('does not consult the admin rpc when the env already said yes', async () => {
    const client = adminClient(true);
    expect(await isAthleteValueEnabled(AL, client, { env: { ATHLETE_VALUE_ENABLED: 'all' } })).toBe(true);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('a de-listed feature is off even for an app admin', async () => {
    // The feature list is the narrowest lever, so it has to win over every
    // broader yes -- otherwise "turn pase off for now" would still leave it on
    // for the people most likely to be looking at it.
    expect(
      await isAthleteValueEnabled(AL, adminClient(true), {
        feature: 'pase',
        env: { ATHLETE_VALUE_ENABLED: 'all', ATHLETE_VALUE_FEATURES: 'challenges' },
      })
    ).toBe(false);
  });
});
