/**
 * T-AV23, spec section 3. The flag predicate for the ANONYMOUS guest path:
 * the /pase/[slug] chip, /api/pase attribution and the voucher QR.
 *
 *   athletesAttributionEnabled(program) =
 *     mode is "all" or "allowlist"
 *     AND isFeatureListed('athletes')
 *     AND athlete_programs.is_active IS TRUE for that partner
 *
 * IT NEVER CALLS isAthleteValueEnabled, AND HAS NO USER PARAMETER AT ALL.
 * isAthleteValueEnabled lets an app admin through with the flag off (T-AV0's
 * admin-always-on rule), which is right for signed-in surfaces and wrong
 * here: an admin testing the pass with the flag off would get attribution,
 * a chip and a QR that no guest can get (recon 2.9). The guest path is
 * anonymous by design (D11: /api/pase never reads the session), so the
 * predicate takes only the environment and the program row, and there is
 * nothing an admin could change about its answer. athletesAttribution.test.ts
 * scans this file for the admin and session calls it must never make.
 *
 * "allowlist" counts as on, as the spec says: an allowlist names users, and a
 * guest is not one, so the allowlist cannot narrow this path. It narrows the
 * signed-in surfaces only.
 */
import { isFeatureListed, readAthleteValueConfig, type AthleteValueConfig } from './athleteValue';

export const ATHLETES_FEATURE = 'athletes';

/**
 * The environment half. Pure and cheap, so a caller can skip every database
 * read when it is false, which is what keeps flag-off /api/pase identical to
 * main: no extra query, no extra key, no extra column.
 */
export function athletesAttributionConfigured(config: AthleteValueConfig = readAthleteValueConfig()): boolean {
  return (config.mode === 'all' || config.mode === 'allowlist') && isFeatureListed(config, ATHLETES_FEATURE);
}

/** The whole predicate, for one partner's program row (null: no program). */
export function athletesAttributionEnabled(
  program: { isActive: boolean } | null,
  config: AthleteValueConfig = readAthleteValueConfig()
): boolean {
  return athletesAttributionConfigured(config) && program?.isActive === true;
}
