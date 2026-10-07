/**
 * T-AV19 Part B.3. av-guard refuses a live send mode on the branch, and the
 * mode it checks is the one lib/notify/sendMode.ts resolves, not only the text
 * in .env.av.local.
 *
 * These run the real guard as a subprocess. process.env wins over the env
 * files in the guard's resolution, so each case sets the variables it is
 * about and inherits nothing that matters.
 *
 * Case "resolved by the module" is the one that proves the guard asks the
 * module: EMAIL_MODE and PUSH_MODE are the literal `log` (so the text check,
 * 4a, passes) and the URL is not local (so the fail-safe is out of play).
 * Only sendMode's env rule decides the outcome there.
 *
 * Mutation proof (run by hand, recorded in the T-AV19 report): in
 * lib/notify/sendMode.ts change `=== 'log'` to `=== 'LOG'` -> "resolved by
 * the module" goes red, because the guard now reports email resolving to live
 * while the text check still passes.
 *
 * T-AV32, 2026-10-07: NODE 22.6 OR LATER, OR NOT AT ALL. av-guard imports
 * TypeScript modules, and when Node cannot load them natively it re-runs
 * itself with --experimental-strip-types, a flag that exists from Node 22.6.
 * CI runs Node 20 (.github/workflows/ci.yml), where that re-run dies with
 * "bad option" and exit 9, so every case below failed there on PR #194 while
 * passing on Node 22 locally. av-guard is local tooling (the pre-push hook and
 * the local stack, both on Node 22), so the cases are skipped on an older
 * Node, and the skip is not taken on trust: the last test runs ONLY where the
 * cases are skipped and asserts the reason, that av-guard cannot start there
 * for exactly this flag. If CI moves to Node 22 the cases run there and that
 * test skips; if av-guard breaks on an old Node for any other reason, it fails.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const PROD = 'https://abcdefgh.supabase.co';

function guard(env: Record<string, string>): { code: number; out: string } {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'av-guard.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, npm_lifecycle_event: '', ...env },
  });
  return { code: r.status ?? -1, out: `${r.stdout}\n${r.stderr}` };
}

/** True when this Node can run av-guard: --experimental-strip-types exists from 22.6. */
export function nodeCanStripTypes(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 6);
}
const canRunGuard = nodeCanStripTypes(process.versions.node);

const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const onAllowedBranch = [/^athlete\//, /^feat\/t-av/i, /^fix\/t-av/i].some((re) => re.test(branch));

describe.skipIf(!canRunGuard)('av-guard and the send mode', () => {
  it('refuses EMAIL_MODE=live on the branch (the text check)', () => {
    const r = guard({ EMAIL_MODE: 'live', PUSH_MODE: 'log' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('EMAIL_MODE is "live"');
  });

  it('refuses when email RESOLVES to live through sendMode (production URL, live env)', () => {
    const r = guard({ NEXT_PUBLIC_SUPABASE_URL: PROD, EMAIL_MODE: 'live', PUSH_MODE: 'live' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('email resolves to "live" (default-live) through lib/notify/sendMode.ts');
    expect(r.out).toContain('push resolves to "live" (default-live) through lib/notify/sendMode.ts');
  });

  it.skipIf(!onAllowedBranch)('resolved by the module: literal log on a non-local URL passes as env-log', () => {
    const r = guard({ NEXT_PUBLIC_SUPABASE_URL: PROD, EMAIL_MODE: 'log', PUSH_MODE: 'log' });
    expect(r.out).toContain('email=log(env-log)');
    expect(r.out).toContain('push=log(env-log)');
    expect(r.code).toBe(0);
  });

  it.skipIf(!onAllowedBranch)('on the local stack the fail-safe is what it reports', () => {
    const r = guard({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', EMAIL_MODE: 'log', PUSH_MODE: 'log' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('email=log(local-supabase)');
  });
});

describe('av-guard on a Node that cannot strip types (T-AV32)', () => {
  it('reads the version the way av-guard needs it', () => {
    expect(nodeCanStripTypes('20.20.2')).toBe(false);
    expect(nodeCanStripTypes('22.5.1')).toBe(false);
    expect(nodeCanStripTypes('22.6.0')).toBe(true);
    expect(nodeCanStripTypes('22.13.1')).toBe(true);
    expect(nodeCanStripTypes('24.0.0')).toBe(true);
  });

  it.runIf(!canRunGuard)('cannot start here, for exactly the flag the skip names', () => {
    const r = guard({ EMAIL_MODE: 'live', PUSH_MODE: 'log' });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('bad option: --experimental-strip-types');
  });
});
