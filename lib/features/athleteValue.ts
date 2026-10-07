/**
 * T-AV0, Step 6. The `athlete_value` runtime flag.
 *
 * The smallest flag system that does the job: three environment variables and
 * one RPC the app already makes. No new service, no new dependency, $0.
 *
 *   ATHLETE_VALUE_ENABLED    "all" | "allowlist" | anything else (= off)
 *   ATHLETE_VALUE_ALLOWLIST  comma-separated user uuids
 *   ATHLETE_VALUE_FEATURES   optional comma-separated feature names; when set,
 *                            ONLY those features are on, even for "all"
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT IS EVALUATED ON THE SERVER, AND THAT IS THE WHOLE POINT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * None of these are `NEXT_PUBLIC_`. A NEXT_PUBLIC_ variable is inlined into
 * the client bundle, where anyone can edit the value in devtools and walk into
 * an unfinished surface -- so a client-side check is a suggestion, not a gate.
 * Client components ask `/api/features/athlete-value`, which runs this module
 * on the server. Pages and API routes call it directly and return a normal 404
 * when it is off, so an unreleased route is indistinguishable from a route
 * that does not exist.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AN APP ADMIN IS ALWAYS ON, INCLUDING WHEN THE FLAG IS OFF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * T-AV0 Step 6 lists three ways to be enabled and the admin one is not
 * conditioned on the mode. That is deliberate and worth saying out loud,
 * because it means "ATHLETE_VALUE_ENABLED is unset" does NOT mean "nobody can
 * reach these screens" -- it means nobody except an app admin can. Al is an
 * app admin, which is how the surfaces get looked at during the dark phase
 * without editing an allowlist every time.
 *
 * The admin answer comes from the `is_app_admin()` SECURITY DEFINER RPC -- the
 * same check the admin pages gate on, not a second implementation of it. If
 * that RPC errors, the answer is NO: a failed admin check is not an admin.
 */

/** Modes ATHLETE_VALUE_ENABLED understands. Anything else is off. */
export type AthleteValueMode = 'all' | 'allowlist' | 'off';

export interface AthleteValueConfig {
  mode: AthleteValueMode;
  /** Lower-cased uuids. Empty unless mode is `allowlist`. */
  allowlist: string[];
  /** null means "every T-AV feature"; a list means only those. */
  features: string[] | null;
}

/**
 * Minimal shape of the Supabase client this module needs. Keeps it mockable,
 * and keeps next/headers out of a unit test.
 *
 * `PromiseLike`, not `Promise`: supabase-js's `rpc()` returns a
 * PostgrestFilterBuilder, which is a thenable with no `catch` or `finally`.
 * Typing it as a Promise compiles against a hand-written mock and fails
 * against the real client -- a fixture-shaped type rather than a
 * call-site-shaped one.
 */
export interface AdminRpcClient {
  rpc(fn: string): PromiseLike<{ data: unknown; error: unknown }>;
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== '');
}

/**
 * Reads the three variables into a config. Pure, so the tests never need an
 * environment, and so the resolution order is one readable thing rather than
 * a condition spread across four call sites.
 */
export function readAthleteValueConfig(env: Record<string, string | undefined> = process.env): AthleteValueConfig {
  const raw = (env.ATHLETE_VALUE_ENABLED ?? '').trim().toLowerCase();
  const mode: AthleteValueMode = raw === 'all' ? 'all' : raw === 'allowlist' ? 'allowlist' : 'off';
  const features = env.ATHLETE_VALUE_FEATURES === undefined ? null : splitList(env.ATHLETE_VALUE_FEATURES);
  return {
    mode,
    allowlist: mode === 'allowlist' ? splitList(env.ATHLETE_VALUE_ALLOWLIST) : [],
    features,
  };
}

/**
 * The environment half of the decision: everything except the admin check.
 * Separated because it is pure and because the admin check costs a round trip
 * that a "mode is all" answer does not need.
 */
export function isEnabledByConfig(config: AthleteValueConfig, userId: string | null): boolean {
  if (config.mode === 'all') return true;
  if (config.mode === 'allowlist' && userId) {
    return config.allowlist.includes(userId.toLowerCase());
  }
  return false;
}

/**
 * Is this specific feature on, given that the program is on at all?
 *
 * ATHLETE_VALUE_FEATURES unset means every feature. Set means exactly the ones
 * listed -- so adding the variable can only ever REMOVE surfaces, which is the
 * direction a release lever should fail in.
 */
export function isFeatureListed(config: AthleteValueConfig, feature: string | null): boolean {
  if (feature === null) return true;
  if (config.features === null) return true;
  return config.features.includes(feature.trim().toLowerCase());
}

async function callerIsAppAdmin(supabase: AdminRpcClient | null): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('is_app_admin');
    if (error) return false;
    return data === true; // strict: a non-boolean truthy value is not a yes
  } catch {
    return false;
  }
}

/**
 * The answer, for a user, optionally for one feature.
 *
 * `supabase` is passed in rather than constructed here so this module stays
 * importable from a unit test without next/headers, and so a route that has
 * already built a client does not build a second one.
 */
export async function isAthleteValueEnabled(
  userId: string | null,
  supabase: AdminRpcClient | null = null,
  options: { feature?: string | null; env?: Record<string, string | undefined> } = {}
): Promise<boolean> {
  const config = readAthleteValueConfig(options.env);
  if (!isFeatureListed(config, options.feature ?? null)) return false;
  if (isEnabledByConfig(config, userId)) return true;
  return callerIsAppAdmin(supabase);
}
