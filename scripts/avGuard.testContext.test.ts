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
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const scripts: Record<string, string> = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;

/** The guard's own test-context rule, restated here so a drift shows up as a failure. */
const TEST_CONTEXT = /^(pre)?test(:complete)?$/;

/**
 * Same rule as avGuard.sendMode.test.ts (Node 22.6 for --experimental-strip-types).
 * Restated rather than imported: importing a test file registers its tests here too.
 */
function nodeCanStripTypes(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 6);
}

const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();

describe('av-guard is wired so it can see a test run', () => {
  it.each(['pretest', 'pretest:complete'])('%s runs the guard directly, under a name it recognises', (name) => {
    expect(TEST_CONTEXT.test(name)).toBe(true);
    // Directly: `node scripts/av-guard.mjs`, never `npm run ...`, which would
    // replace npm_lifecycle_event with the nested script's name.
    expect(scripts[name]).toMatch(/^node scripts\/av-guard\.mjs(\s|$)/);
  });

  // Skipped where the guard cannot start (Node < 22.6, see avGuard.sendMode.test.ts)
  // and on main, where rule 1 fails before any scope is computed and so the
  // output carries no scope verdict either way.
  it.skipIf(!nodeCanStripTypes(process.versions.node) || branch === 'main')(
    'through npm, the guard reaches a scope verdict, which it only does in a test context',
    () => {
      const r = spawnSync('npm', ['run', '--silent', 'pretest:complete'], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, npm_lifecycle_event: '' },
      });
      const out = `${r.stdout}\n${r.stderr}`;
      // Every scope line the guard can print. It computes scope only when
      // TEST_CONTEXT is true, so seeing any of them proves npm handed it the
      // pre-script's name. Pass or fail does not matter here; the env decides that.
      // One gap, stated: an out-of-program branch that fails for ANOTHER reason
      // (av-migration-check) prints no scope line, so this would go red there
      // too. The failure output says which, and that branch is broken anyway.
      expect(out).toMatch(
        /scope=out-of-program|scope=in-program|scope: this branch changes|scope: could not be computed/
      );
    },
    60_000
  );
});
