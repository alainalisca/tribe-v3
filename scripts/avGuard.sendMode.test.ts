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

const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const onAllowedBranch = [/^athlete\//, /^feat\/t-av/i, /^fix\/t-av/i].some((re) => re.test(branch));

describe('av-guard and the send mode', () => {
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
