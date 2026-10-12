/**
 * av-guard's test-context relaxation (cb5e2321) has to actually reach the guard.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BUG THIS PINS: THE RELAXATION NEVER FIRED, BECAUSE OF HOW IT WAS WIRED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * av-guard decides it is in a test run from npm_lifecycle_event, matching
 * /^(pre)?test(:complete)?$/. package.json wired it as
 *
 *   "pretest:complete": "npm run av:guard"
 *
 * and a nested `npm run` sets npm_lifecycle_event to ITS OWN script name. So
 * the guard always saw `av:guard`, never `pretest:complete`, TEST_CONTEXT was
 * false on every run, and `npm run test:complete` stayed blocked on every
 * branch that touches no athlete file -- the exact case the relaxation was
 * written for. Found 2026-10-09 on feature/analytics-v1:
 *
 *   npm_lifecycle_event=av:guard          node scripts/av-guard.mjs  -> FAILED
 *   npm_lifecycle_event=pretest:complete  node scripts/av-guard.mjs  -> OK,
 *                                         scope=out-of-program
 *
 * The guard itself was right; its caller hid the one input it reads. The fix
 * is in package.json: the pre-scripts call the guard directly, as the db:*
 * scripts already did, so npm's own lifecycle name is what it sees.
 *
 * The first case pins the wiring. The second runs the real chain -- npm, the
 * pre-script, the guard -- because the first only proves the text is right,
 * and this bug was a text that LOOKED right ("run the guard before tests") and
 * did not do what it said.
 *
 * Mutation proof (run by hand): put `"pretest:complete": "npm run av:guard"`
 * back and both cases go red; the second because the guard's output no longer
 * carries a scope verdict.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ADDENDUM 2026-10-12
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The fix above was right and was never merged; the bug was rediscovered on
 * two more branches three days later. On merging it, two things changed:
 *
 *   1. The hooks also pass `--test`, and the guard accepts it, so the test
 *      context is something the caller SAYS rather than something inferred
 *      from a variable an intermediate process can overwrite. The lifecycle
 *      regex remains as a second route.
 *   2. The guard prints the context it detected on EVERY outcome
 *      (`FAILED (context=test)` / `context:test`). The earlier second case
 *      had to infer recognition from a scope line, which main never prints,
 *      so it skipped on main and went red on any unrelated failure (its own
 *      comment says so). Asserting the printed context removes both gaps.
 *
 * predev:av is deliberately NOT given --test: a dev server is never relaxed.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const scripts: Record<string, string> = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;

/**
 * Same rule as avGuard.sendMode.test.ts (Node 22.6 for --experimental-strip-types).
 * Restated rather than imported: importing a test file registers its tests here too.
 */
function nodeCanStripTypes(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 6);
}

function guard(args: string[], lifecycle: string): string {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'av-guard.mjs'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, npm_lifecycle_event: lifecycle },
  });
  return `${r.stdout}\n${r.stderr}`;
}

/** The context the guard reports, from either its OK line or its FAILED line. */
const contextOf = (out: string) => /context[=:](\w+)/.exec(out)?.[1] ?? null;

describe('av-guard is wired so it can see a test run', () => {
  it.each(['pretest', 'pretest:complete'])('%s calls the guard directly, with --test', (name) => {
    expect(scripts[name], `${name} missing`).toMatch(/^node scripts\/av-guard\.mjs\b.*--test\b/);
    // The defect: a nested npm run replaces npm_lifecycle_event.
    expect(scripts[name]).not.toMatch(/\bnpm run\b/);
  });

  it('predev:av is never given the test relaxation', () => {
    expect(scripts['predev:av']).toMatch(/^node scripts\/av-guard\.mjs\b/);
    expect(scripts['predev:av']).not.toMatch(/--test\b/);
  });
});

describe.skipIf(!nodeCanStripTypes(process.versions.node))('av-guard reports the context it detected', () => {
  it('--test is a test run even when npm says "av:guard" (the nested-npm case)', () => {
    expect(contextOf(guard(['--test'], 'av:guard'))).toBe('test');
  });

  it('without --test, "av:guard" is not a test run (the state the bug left every npm test in)', () => {
    expect(contextOf(guard([], 'av:guard'))).toBe('other');
  });

  it('--db outranks --test: a db context is never relaxed', () => {
    expect(contextOf(guard(['--test', '--db'], ''))).toBe('db');
  });

  it.each(['pretest', 'pretest:complete'])(
    'real npm: `npm run %s` reaches the guard as a test run',
    (hook) => {
      const r = spawnSync('npm', ['run', '--silent', hook], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, npm_lifecycle_event: '' },
      });
      const out = `${r.stdout}\n${r.stderr}`;
      expect(contextOf(out), out.slice(0, 600)).toBe('test');
    },
    60_000
  );
});
